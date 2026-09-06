import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo, Server } from "node:net";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";

import { exportJWK, generateKeyPair, SignJWT } from "jose";

import {
  AuthenticationAdapterError,
  OidcJwtAuthenticationAdapter,
  CommunityReviewConfigurationError,
  CommunityReviewLogger,
  CommunityReviewServiceError,
  FilesystemQualificationMaterialStore,
  FilesystemReviewBatchMaterialStore,
  ReviewBatchMaterialError,
  QUALIFICATION_PASS_RULE_ID,
  qualificationAnswerKeyCommitment,
  qualificationDefinitionFingerprint,
  createCommunityReviewHttpServer,
  createCommunityReviewRuntime,
  gracefulShutdown,
  loadCommunityReviewConfig,
} from "../src/index.js";
import type {
  QualificationMaterialIdentity,
  QualificationPrivateAnswerKey,
  ReviewBatchMaterialLookup,
} from "../src/index.js";
import {
  communityReviewFingerprint,
  communityReviewVisibleTaskSetFingerprint,
} from "../../../src/community-review/fingerprint.js";
import { parseCommunityReviewVisibleTask } from "../../../src/contracts/community-review-validation.js";

function productionEnvironment(overrides: Record<string, string | undefined> = {}): NodeJS.ProcessEnv {
  return {
    COMMUNITY_REVIEW_ENV: "production",
    COMMUNITY_REVIEW_STORAGE: "postgres",
    COMMUNITY_REVIEW_DATABASE_URL: "postgresql://reviewer@example.invalid/review",
    COMMUNITY_REVIEW_DATABASE_SSL: "require",
    COMMUNITY_REVIEW_AUTH_MODE: "oidc",
    COMMUNITY_REVIEW_OIDC_PROVIDER: "example-oidc",
    COMMUNITY_REVIEW_OIDC_ISSUER: "https://issuer.example.invalid/",
    COMMUNITY_REVIEW_OIDC_AUDIENCE: "tutorbench-review",
    COMMUNITY_REVIEW_OIDC_JWKS_URI: "https://issuer.example.invalid/.well-known/jwks.json",
    COMMUNITY_REVIEW_OPERATOR_SUBJECTS: "example-oidc|operator-1",
    COMMUNITY_REVIEW_MATERIAL_ROOT: resolve(tmpdir(), "tutorbench-review-private-material"),
    ...overrides,
  };
}

function configurationCode(code: CommunityReviewConfigurationError["code"]): (error: unknown) => boolean {
  return (error: unknown): boolean => error instanceof CommunityReviewConfigurationError && error.code === code;
}

async function listen(server: Server): Promise<AddressInfo> {
  await new Promise<void>((resolvePromise, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.removeAllListeners("error");
      resolvePromise();
    });
  });
  const address = server.address();
  assert.notEqual(address, null);
  assert.equal(typeof address, "object");
  return address as AddressInfo;
}

async function close(server: Server): Promise<void> {
  if (!server.listening) return;
  await new Promise<void>((resolvePromise) => server.close(() => resolvePromise()));
}

test("production configuration fails closed and migration configuration is separately typed", () => {
  assert.throws(
    () => loadCommunityReviewConfig({ env: productionEnvironment({ COMMUNITY_REVIEW_DATABASE_URL: undefined }) }),
    configurationCode("database_required"),
  );
  assert.throws(
    () => loadCommunityReviewConfig({ env: productionEnvironment({ COMMUNITY_REVIEW_STORAGE: "in-memory" }) }),
    configurationCode("database_required"),
  );
  assert.throws(
    () => loadCommunityReviewConfig({ env: productionEnvironment({ COMMUNITY_REVIEW_DATABASE_SSL: "disable" }) }),
    configurationCode("database_tls_required"),
  );
  assert.throws(
    () => loadCommunityReviewConfig({
      env: productionEnvironment({ COMMUNITY_REVIEW_DATABASE_SSL_REJECT_UNAUTHORIZED: "false" }),
    }),
    configurationCode("database_tls_required"),
  );
  assert.throws(
    () => loadCommunityReviewConfig({ env: productionEnvironment({ COMMUNITY_REVIEW_AUTH_MODE: "synthetic" }) }),
    configurationCode("oidc_required"),
  );
  assert.throws(
    () => loadCommunityReviewConfig({ env: productionEnvironment({ COMMUNITY_REVIEW_PUBLIC_INTAKE: "true" }) }),
    configurationCode("public_intake_disabled"),
  );
  assert.throws(
    () => loadCommunityReviewConfig({ env: productionEnvironment({ COMMUNITY_REVIEW_MATERIAL_ROOT: resolve(process.cwd(), "src") }) }),
    configurationCode("material_root_invalid"),
  );
  assert.throws(
    () => loadCommunityReviewConfig({ env: productionEnvironment({ COMMUNITY_REVIEW_MATERIAL_ROOT: resolve(process.cwd(), "..") }) }),
    configurationCode("material_root_invalid"),
  );
  const migrationConfig = loadCommunityReviewConfig({
    command: "migrate",
    env: productionEnvironment({
      COMMUNITY_REVIEW_AUTH_MODE: undefined,
      COMMUNITY_REVIEW_OPERATOR_SUBJECTS: undefined,
      COMMUNITY_REVIEW_MATERIAL_ROOT: undefined,
    }),
  });
  assert.equal(migrationConfig.storage, "postgres");
  assert.equal(migrationConfig.databaseSsl, true);
  assert.equal(migrationConfig.publicIntakeEnabled, false);
});

test("development synthetic and in-memory modes are explicit and never production defaults", () => {
  const config = loadCommunityReviewConfig({
    env: {
      COMMUNITY_REVIEW_ENV: "development",
      COMMUNITY_REVIEW_STORAGE: "in-memory",
      COMMUNITY_REVIEW_AUTH_MODE: "synthetic",
    },
  });
  assert.equal(config.storage, "in-memory");
  assert.equal(config.authMode, "synthetic");
  assert.equal(config.publicIntakeEnabled, false);
  assert.throws(
    () => loadCommunityReviewConfig({
      env: { COMMUNITY_REVIEW_ENV: "production", COMMUNITY_REVIEW_AUTH_MODE: "synthetic" },
    }),
    configurationCode("database_required"),
  );
});

test("synthetic deployment smoke starts, authenticates, loads private material, and shuts down cleanly", async () => {
  const root = await mkdtemp(join(tmpdir(), "tutorbench-community-review-smoke-"));
  const config = loadCommunityReviewConfig({
    env: {
      COMMUNITY_REVIEW_ENV: "development",
      COMMUNITY_REVIEW_STORAGE: "in-memory",
      COMMUNITY_REVIEW_AUTH_MODE: "synthetic",
      COMMUNITY_REVIEW_OPERATOR_SUBJECTS: "example-oidc|operator-smoke",
      COMMUNITY_REVIEW_SYNTHETIC_IDENTITIES:
        "operator-credential=example-oidc|operator-smoke,reviewer-credential=example-oidc|reviewer-smoke",
      COMMUNITY_REVIEW_MATERIAL_ROOT: root,
    },
  });
  const runtime = createCommunityReviewRuntime(config);
  const server = createCommunityReviewHttpServer(runtime, new CommunityReviewLogger("error"));
  const address = await listen(server);
  const base = `http://127.0.0.1:${address.port}`;
  try {
    const account = await runtime.application.provisionReviewerAccount({
      authenticationInput: "operator-credential",
      principal: { provider: "example-oidc", subject: "reviewer-smoke" },
    });
    assert.equal(account.status, "ACTIVE");
    const consent = await runtime.application.recordConsent({ authenticationInput: "reviewer-credential" });
    assert.equal(consent.state, "CONSENTED");
    await assert.rejects(
      runtime.application.createBatch({
        authenticationInput: "reviewer-credential",
        manifest: {} as never,
        sealedSourceReference: "batch.json",
      }),
      (error: unknown) => error instanceof CommunityReviewServiceError && error.code === "operator_not_authorized",
    );

    const instrumentFingerprint = communityReviewFingerprint({ smokeInstrument: true });
    const items = [{
      caseId: "smoke-qualification-case",
      rubricId: "smoke-qualification-rubric",
      requirementId: "smoke-qualification-requirement",
      prompt: "Classify this synthetic qualification response.",
    }];
    const definitionInput = {
      qualificationId: "smoke-qualification",
      qualificationVersion: "1.0.0",
      qualificationPoolId: "smoke-pool",
      qualificationPoolVersion: "1.0.0",
      instrumentId: "smoke-instrument",
      instrumentVersion: "1.0.0",
      instrumentFingerprint,
      reviewLocale: "en",
      passRuleId: QUALIFICATION_PASS_RULE_ID,
      items,
    };
    const identity: QualificationMaterialIdentity = {
      ...definitionInput,
      qualificationDefinitionFingerprint: qualificationDefinitionFingerprint(definitionInput),
      sealedDefinitionReference: "qualification-visible.json",
      privateAnswerKeyReference: "qualification-private.json",
    };
    const answerKey: QualificationPrivateAnswerKey = {
      answers: [{
        caseId: items[0]!.caseId,
        rubricId: items[0]!.rubricId,
        requirementId: items[0]!.requirementId,
        status: "SATISFIED",
      }],
    };
    await writeFile(join(root, identity.sealedDefinitionReference), JSON.stringify({
      passRuleId: QUALIFICATION_PASS_RULE_ID,
      items,
    }));
    await writeFile(join(root, identity.privateAnswerKeyReference), JSON.stringify(answerKey));
    const qualificationStore = new FilesystemQualificationMaterialStore(root);
    assert.deepEqual(await qualificationStore.loadVisiblePacket(identity), {
      passRuleId: QUALIFICATION_PASS_RULE_ID,
      items,
    });
    const loadedAnswerKey = await qualificationStore.loadPrivateAnswerKey(identity);
    await qualificationStore.verifyAnswerKeyCommitment(
      identity,
      loadedAnswerKey,
      qualificationAnswerKeyCommitment({
        identity,
        passRuleId: QUALIFICATION_PASS_RULE_ID,
        answers: answerKey.answers,
      }),
    );

    const task = parseCommunityReviewVisibleTask({
      caseId: "smoke-review-case",
      learningObjective: "Use a synthetic private review task.",
      studentProfile: "Synthetic learner.",
      conversationHistory: "No earlier turns.",
      studentMessage: "What is the next step?",
      problemContext: "Synthetic private context.",
      rubrics: [{
        id: "smoke-review-rubric",
        criterion: "The reply gives a useful next step.",
        requirements: [{ id: "smoke-review-requirement", description: "A next step is present." }],
      }],
      tutorResponse: "Try the next step and check your result.",
    });
    const sealedSourceFingerprint = communityReviewFingerprint({ smokeSource: true });
    await writeFile(join(root, "batch.json"), JSON.stringify({
      sealedSourceFingerprint,
      tasks: [task],
    }));
    const batchLookup = {
      batchId: "smoke-batch",
      batchFingerprint: communityReviewFingerprint({ smokeBatch: true }),
      dataKind: "community-review",
      sealedSourceReference: "batch.json",
      sealedSourceFingerprint,
      visibleTaskSetFingerprint: communityReviewVisibleTaskSetFingerprint([task]),
      instrument: {},
      qualificationEligibility: {},
    } as unknown as ReviewBatchMaterialLookup;
    assert.deepEqual(await new FilesystemReviewBatchMaterialStore(root).loadVisibleTasksForBatch(batchLookup), [task]);

    const live = await fetch(`${base}/health/live`);
    assert.equal(live.status, 200);
    const ready = await fetch(`${base}/health/ready`);
    assert.equal(ready.status, 200);
    assert.deepEqual((await ready.json() as { reasonCodes: string[] }).reasonCodes, ["in_memory_non_production"]);
  } finally {
    await gracefulShutdown(server, runtime, 1000);
    await rm(root, { recursive: true, force: true });
  }
});

test("OIDC adapter accepts only a verified issuer/audience and exposes provider/subject", async () => {
  const { publicKey, privateKey } = await generateKeyPair("RS256");
  const jwk = { ...(await exportJWK(publicKey)), kid: "deployment-test", alg: "RS256", use: "sig" };
  const jwksServer = createServer((_request, response) => {
    const body = JSON.stringify({ keys: [jwk] });
    response.setHeader("content-type", "application/json");
    response.end(body);
  });
  const address = await listen(jwksServer);
  const issuer = `http://127.0.0.1:${address.port}/issuer`;
  const adapter = new OidcJwtAuthenticationAdapter({
    provider: "example-oidc",
    issuer,
    audience: "tutorbench-review",
    jwksUri: `http://127.0.0.1:${address.port}/jwks.json`,
    allowInsecureHttp: true,
  });
  try {
    const token = await new SignJWT({ sub: "reviewer-subject-1", email: "must-not-cross-boundary@example.invalid" })
      .setProtectedHeader({ alg: "RS256", kid: "deployment-test" })
      .setIssuer(issuer)
      .setAudience("tutorbench-review")
      .setIssuedAt()
      .setExpirationTime("5m")
      .sign(privateKey);
    const context = await adapter.authenticate({ authorization: `Bearer ${token}` });
    assert.deepEqual(context, { principal: { provider: "example-oidc", subject: "reviewer-subject-1" } });
    const wrongAudience = await new SignJWT({ sub: "reviewer-subject-1" })
      .setProtectedHeader({ alg: "RS256", kid: "deployment-test" })
      .setIssuer(issuer)
      .setAudience("wrong-audience")
      .setIssuedAt()
      .setExpirationTime("5m")
      .sign(privateKey);
    await assert.rejects(adapter.authenticate({ authorization: `Bearer ${wrongAudience}` }), AuthenticationAdapterError);
    const tokenParts = token.split(".");
    tokenParts[2] = `${tokenParts[2]!.startsWith("A") ? "B" : "A"}${tokenParts[2]!.slice(1)}`;
    const tampered = tokenParts.join(".");
    await assert.rejects(adapter.authenticate({ authorization: `Bearer ${tampered}` }), (error: unknown) => {
      return error instanceof AuthenticationAdapterError && !error.message.includes(token);
    });
  } finally {
    await close(jwksServer);
  }
});

test("filesystem material adapters enforce private references and fingerprints", async () => {
  const root = await mkdtemp(join(tmpdir(), "tutorbench-community-review-material-"));
  try {
    const task = parseCommunityReviewVisibleTask({
      caseId: "private-case",
      learningObjective: "Synthetic private material test.",
      studentProfile: "Synthetic learner.",
      conversationHistory: "No earlier turns.",
      studentMessage: "Continue.",
      problemContext: "Synthetic context.",
      rubrics: [{
        id: "private-rubric",
        criterion: "The reply is useful.",
        requirements: [{ id: "private-requirement", description: "A useful next step is present." }],
      }],
      tutorResponse: "Try the next step.",
    });
    const sourceFingerprint = communityReviewFingerprint({ source: "private-source" });
    const taskFingerprint = communityReviewVisibleTaskSetFingerprint([task]);
    await writeFile(join(root, "batch.json"), JSON.stringify({
      sealedSourceFingerprint: sourceFingerprint,
      tasks: [task],
    }));
    const lookup = {
      batchId: "batch-private",
      batchFingerprint: communityReviewFingerprint({ batch: "private" }),
      dataKind: "community-review",
      sealedSourceReference: "batch.json",
      sealedSourceFingerprint: sourceFingerprint,
      visibleTaskSetFingerprint: taskFingerprint,
      instrument: {},
      qualificationEligibility: {},
    } as unknown as ReviewBatchMaterialLookup;
    const store = new FilesystemReviewBatchMaterialStore(root);
    assert.deepEqual(await store.loadVisibleTasksForBatch(lookup), [task]);
    await writeFile(join(root, "batch.json"), JSON.stringify({ sealedSourceFingerprint: "sha256:" + "0".repeat(64), tasks: [task] }));
    await assert.rejects(store.loadVisibleTasksForBatch(lookup), (error: unknown) => {
      return error instanceof ReviewBatchMaterialError && error.code === "invalid";
    });
    const qualificationStore = new FilesystemQualificationMaterialStore(root);
    await assert.rejects(
      qualificationStore.loadVisiblePacket({ sealedDefinitionReference: "../outside.json" } as never),
      (error: unknown) => error instanceof CommunityReviewServiceError ||
        (typeof error === "object" && error !== null && "code" in error && (error as { code?: unknown }).code === "invalid"),
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("HTTP runtime exposes privacy-safe live/ready probes and rejects other methods", async () => {
  const config = loadCommunityReviewConfig({
    env: {
      COMMUNITY_REVIEW_ENV: "development",
      COMMUNITY_REVIEW_STORAGE: "in-memory",
      COMMUNITY_REVIEW_AUTH_MODE: "synthetic",
    },
  });
  const runtime = createCommunityReviewRuntime(config);
  const server = createCommunityReviewHttpServer(runtime, new CommunityReviewLogger("error"));
  const address = await listen(server);
  const base = `http://127.0.0.1:${address.port}`;
  try {
    const live = await fetch(`${base}/health/live`);
    assert.equal(live.status, 200);
    const liveBody = await live.json() as { requestId?: unknown; status?: unknown };
    assert.equal(liveBody.status, "live");
    assert.equal(typeof liveBody.requestId, "string");
    const ready = await fetch(`${base}/health/ready`);
    assert.equal(ready.status, 200);
    const readyBody = await ready.json() as { status: string; reasonCodes: string[] };
    assert.equal(readyBody.status, "ready");
    assert.deepEqual(readyBody.reasonCodes, ["in_memory_non_production"]);
    const notFound = await fetch(`${base}/private-data`);
    assert.equal(notFound.status, 404);
    const method = await fetch(`${base}/health/live`, { method: "POST" });
    assert.equal(method.status, 405);
    assert.match(await method.text(), /method_not_allowed/u);
  } finally {
    await gracefulShutdown(server, runtime, 1000);
  }
});
