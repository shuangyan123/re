import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildCommunityReviewInstrumentIdentity,
  buildCommunityReviewQualificationReceipt,
  communityReviewFingerprint,
} from "../../../src/community-review/index.js";
import {
  CommunityReviewService,
  CommunityReviewApplicationService,
  CommunityReviewServiceError,
  InMemoryCommunityReviewRepository,
  InMemoryQualificationMaterialStore,
  QualificationMaterialError,
  QUALIFICATION_PASS_RULE_ID,
  qualificationDefinitionFingerprint,
  StaticOperatorAuthorizer,
  SyntheticAuthenticationAdapter,
} from "../src/index.js";
import type {
  QualificationAttemptIssue,
  QualificationMaterialIdentity,
  QualificationPrivateAnswer,
  QualificationResponse,
  QualificationVisibleItem,
  QualificationVisibleMaterial,
} from "../src/index.js";

const syntheticFixture = {
  synthetic: true as const,
  notHumanCalibrationData: true as const,
  notCommunityReviewEvidence: true as const,
};

const items: readonly QualificationVisibleItem[] = [
  {
    caseId: "sealed-case-a",
    rubricId: "qualification-rubric",
    requirementId: "clarity",
    prompt: "Classify whether the synthetic reply makes the next step clear.",
  },
  {
    caseId: "sealed-case-b",
    rubricId: "qualification-rubric",
    requirementId: "action",
    prompt: "Classify whether the synthetic reply gives a useful next action.",
  },
];

const answers: readonly QualificationPrivateAnswer[] = [
  {
    caseId: "sealed-case-a",
    rubricId: "qualification-rubric",
    requirementId: "clarity",
    status: "SATISFIED",
  },
  {
    caseId: "sealed-case-b",
    rubricId: "qualification-rubric",
    requirementId: "action",
    status: "OMITTED_OR_INCOMPLETE",
  },
];

function serviceError(code: CommunityReviewServiceError["code"]): (error: unknown) => boolean {
  return (error: unknown): boolean => error instanceof CommunityReviewServiceError && error.code === code;
}

function instrument() {
  return buildCommunityReviewInstrumentIdentity({
    guideFingerprint: communityReviewFingerprint({ guide: "fresh synthetic qualification guide" }),
    canonicalLocale: "en",
    reviewLocale: "en",
  });
}

function qualificationIdentity(
  suffix: string,
  reviewInstrument: ReturnType<typeof instrument> = instrument(),
): QualificationMaterialIdentity {
  const qualificationId = `synthetic-sealed-qualification-${suffix}`;
  const qualificationVersion = "v1";
  const qualificationPoolId = `synthetic-sealed-pool-${suffix}`;
  const qualificationPoolVersion = "v1";
  return {
    qualificationId,
    qualificationVersion,
    qualificationPoolId,
    qualificationPoolVersion,
    qualificationDefinitionFingerprint: qualificationDefinitionFingerprint({
      qualificationId,
      qualificationVersion,
      qualificationPoolId,
      qualificationPoolVersion,
      instrumentId: reviewInstrument.instrumentId,
      instrumentVersion: reviewInstrument.instrumentVersion,
      instrumentFingerprint: reviewInstrument.fingerprint,
      reviewLocale: reviewInstrument.reviewLocale,
      passRuleId: QUALIFICATION_PASS_RULE_ID,
      items,
    }),
    instrumentId: reviewInstrument.instrumentId,
    instrumentVersion: reviewInstrument.instrumentVersion,
    instrumentFingerprint: reviewInstrument.fingerprint,
    reviewLocale: reviewInstrument.reviewLocale,
    sealedDefinitionReference: `synthetic://sealed-definition/${suffix}`,
    privateAnswerKeyReference: `synthetic://sealed-answer-key/${suffix}`,
  };
}

interface QualificationSetup {
  readonly repository: InMemoryCommunityReviewRepository;
  readonly materialStore: InMemoryQualificationMaterialStore;
  readonly service: CommunityReviewService;
  readonly identity: QualificationMaterialIdentity;
  readonly instrument: ReturnType<typeof instrument>;
}

async function makeSetup(options: {
  readonly suffix?: string;
  readonly maxAttempts?: number;
  readonly reviewers?: readonly string[];
} = {}): Promise<QualificationSetup> {
  const suffix = options.suffix ?? "main";
  const reviewInstrument = instrument();
  const identity = qualificationIdentity(suffix, reviewInstrument);
  const visibleMaterial: QualificationVisibleMaterial = {
    passRuleId: QUALIFICATION_PASS_RULE_ID,
    items,
  };
  const materialStore = new InMemoryQualificationMaterialStore();
  materialStore.register({
    identity,
    visibleMaterial,
    privateAnswerKey: { answers },
  });
  let attemptSequence = 0;
  let nonceSequence = 0;
  const repository = new InMemoryCommunityReviewRepository();
  const service = new CommunityReviewService(repository, {
    qualificationMaterialStore: materialStore,
    maxQualificationAttemptsPerReviewerPool: options.maxAttempts ?? 3,
    attemptIdGenerator: () => `synthetic-attempt-${suffix}-${attemptSequence++}`,
    attemptNonceGenerator: () => `synthetic-attempt-nonce-${suffix}-${nonceSequence++}`,
    clock: (() => {
      let tick = 0;
      return () => `2026-09-06T01:00:${String(tick++).padStart(2, "0")}.000Z`;
    })(),
  });
  for (const reviewerId of options.reviewers ?? ["reviewer-a", "reviewer-b"]) {
    await service.registerReviewerAccount({
      internalId: `internal-${reviewerId}-${suffix}`,
      reviewerId,
      privateAuthSubjectReference: `synthetic-auth-${reviewerId}-${suffix}`,
      consentVersion: "1.0.0",
    });
    await service.recordConsent({ reviewerId });
  }
  await service.registerQualificationPool({
    dataKind: "synthetic-fixture",
    fixture: syntheticFixture,
    qualificationId: identity.qualificationId,
    qualificationVersion: identity.qualificationVersion,
    poolId: identity.qualificationPoolId,
    poolVersion: identity.qualificationPoolVersion,
    definitionFingerprint: identity.qualificationDefinitionFingerprint,
    instrumentFingerprint: identity.instrumentFingerprint,
    reviewLocale: identity.reviewLocale,
    instrument: reviewInstrument,
    state: "DRAFT",
    sealedDefinitionReference: identity.sealedDefinitionReference,
    privateAnswerKeyReference: identity.privateAnswerKeyReference,
  });
  await service.sealQualificationPool({
    poolId: identity.qualificationPoolId,
    poolVersion: identity.qualificationPoolVersion,
  });
  await service.activateQualificationPool({
    poolId: identity.qualificationPoolId,
    poolVersion: identity.qualificationPoolVersion,
  });
  return { repository, materialStore, service, identity, instrument: reviewInstrument };
}

function responsesFor(issue: QualificationAttemptIssue): QualificationResponse[] {
  return issue.packet.items.map((item) => {
    const expected = answers.find((answer) =>
      answer.caseId === item.caseId && answer.rubricId === item.rubricId &&
      answer.requirementId === item.requirementId);
    assert.ok(expected);
    return {
      caseId: item.caseId,
      rubricId: item.rubricId,
      requirementId: item.requirementId,
      status: expected.status,
    };
  });
}

function createInput(setup: QualificationSetup, reviewerId = "reviewer-a") {
  return {
    reviewerId,
    qualificationId: setup.identity.qualificationId,
    qualificationVersion: setup.identity.qualificationVersion,
    poolId: setup.identity.qualificationPoolId,
    poolVersion: setup.identity.qualificationPoolVersion,
    instrumentFingerprint: setup.identity.instrumentFingerprint,
    reviewLocale: setup.identity.reviewLocale,
  } as const;
}

async function issue(setup: QualificationSetup, reviewerId = "reviewer-a") {
  return setup.service.createQualificationAttempt(createInput(setup, reviewerId));
}

test("sealed pool lifecycle and reviewer packet are bound without hidden material", async () => {
  const setup = await makeSetup({ suffix: "lifecycle" });
  const pool = await setup.service.getQualificationPool({
    poolId: setup.identity.qualificationPoolId,
    poolVersion: setup.identity.qualificationPoolVersion,
  });
  assert.equal(pool.state, "ACTIVE");
  assert.equal(pool.passRuleId, QUALIFICATION_PASS_RULE_ID);
  assert.match(pool.answerKeyCommitment ?? "", /^sha256:[0-9a-f]{64}$/u);
  assert.match(pool.visibleTaskSetFingerprint ?? "", /^sha256:[0-9a-f]{64}$/u);
  assert.equal(pool.privateAnswerKeyReference, setup.identity.privateAnswerKeyReference);

  const attempt = await issue(setup);
  const serialized = JSON.stringify(attempt.packet);
  assert.doesNotMatch(serialized, /answerKey|expectedStatus|expectedAnswer|reference|gold|consensus|adjudication|judge|internalNotes|scoringRule/iu);
  assert.doesNotMatch(serialized, /OMITTED_OR_INCOMPLETE|EXPLICIT_CONFLICT/iu);
  assert.doesNotMatch(serialized, new RegExp(setup.identity.privateAnswerKeyReference, "u"));
  assert.doesNotMatch(serialized, new RegExp(pool.answerKeyCommitment ?? "never", "u"));
  assert.equal(attempt.packet.items.length, items.length);
  assert.equal(attempt.packet.attemptId, attempt.attemptId);
  assert.equal(attempt.packet.instrumentEligibility.instrumentFingerprint, setup.instrument.fingerprint);

  await assert.rejects(
    setup.service.createQualificationAttempt({
      ...createInput(setup),
      instrumentFingerprint: communityReviewFingerprint({ wrong: "instrument" }),
    }),
    serviceError("qualification_pool_not_active"),
  );
});

test("sealed material cannot be silently replaced and pool metadata is immutable", async () => {
  const setup = await makeSetup({ suffix: "immutable" });
  const changedItems = [{ ...items[0]!, prompt: "Changed after sealing." }, items[1]!];
  assert.throws(() => setup.materialStore.register({
    identity: setup.identity,
    visibleMaterial: { passRuleId: QUALIFICATION_PASS_RULE_ID, items: changedItems },
    privateAnswerKey: { answers },
  }), (error: unknown) => error instanceof QualificationMaterialError && error.code === "invalid");
  await assert.rejects(
    setup.service.registerQualificationPool({
      dataKind: "synthetic-fixture",
      fixture: syntheticFixture,
      qualificationId: setup.identity.qualificationId,
      qualificationVersion: setup.identity.qualificationVersion,
      poolId: setup.identity.qualificationPoolId,
      poolVersion: setup.identity.qualificationPoolVersion,
      definitionFingerprint: communityReviewFingerprint({ changed: true }),
      instrumentFingerprint: setup.identity.instrumentFingerprint,
      reviewLocale: setup.identity.reviewLocale,
      instrument: setup.instrument,
      state: "ACTIVE",
      visibleTaskSetFingerprint: setup.identity.qualificationDefinitionFingerprint,
      answerKeyCommitment: communityReviewFingerprint({ changed: "key" }),
      passRuleId: QUALIFICATION_PASS_RULE_ID,
      sealedAt: "2026-09-06T01:00:00.000Z",
      sealedDefinitionReference: setup.identity.sealedDefinitionReference,
      privateAnswerKeyReference: setup.identity.privateAnswerKeyReference,
    }),
    serviceError("repository_conflict"),
  );
  const activePool = await setup.service.getQualificationPool({
    poolId: setup.identity.qualificationPoolId,
    poolVersion: setup.identity.qualificationPoolVersion,
  });
  await assert.rejects(
    setup.repository.transaction((transaction) => transaction.updateQualificationPool({
      ...activePool,
      state: "RETIRED",
      stateVersion: 3,
      definitionFingerprint: communityReviewFingerprint({ changed: "after-sealing" }),
      retiredAt: "2026-09-06T01:02:00.000Z",
      updatedAt: "2026-09-06T01:02:00.000Z",
    })),
    serviceError("repository_conflict"),
  );
  const unchanged = await setup.service.getQualificationPool({
    poolId: setup.identity.qualificationPoolId,
    poolVersion: setup.identity.qualificationPoolVersion,
  });
  assert.equal(unchanged.state, "ACTIVE");
  assert.equal(unchanged.definitionFingerprint, setup.identity.qualificationDefinitionFingerprint);
});

test("incomplete, duplicate, and extra responses roll back without evaluating the attempt", async () => {
  const setup = await makeSetup({ suffix: "response-validation" });
  const attempt = await issue(setup);
  const base = {
    reviewerId: "reviewer-a",
    attemptId: attempt.attemptId,
    attemptNonce: attempt.attemptNonce,
    packetFingerprint: attempt.packet.packetFingerprint,
  } as const;
  await assert.rejects(
    setup.service.submitQualificationAttempt({ ...base, responses: responsesFor(attempt).slice(1) }),
    serviceError("qualification_response_invalid"),
  );
  await assert.rejects(
    setup.service.submitQualificationAttempt({
      ...base,
      responses: [responsesFor(attempt)[0]!, responsesFor(attempt)[0]!],
    }),
    serviceError("qualification_response_invalid"),
  );
  await assert.rejects(
    setup.service.submitQualificationAttempt({
      ...base,
      responses: [...responsesFor(attempt), { ...responsesFor(attempt)[0]!, status: "EXPLICIT_CONFLICT" }],
    }),
    serviceError("qualification_response_invalid"),
  );
  await assert.rejects(
    setup.service.submitQualificationAttempt({
      ...base,
      responses: [{ ...responsesFor(attempt)[0]!, evidence: "x".repeat(501) }, responsesFor(attempt)[1]!],
    }),
    serviceError("qualification_response_invalid"),
  );
  const stored = await setup.repository.transaction((transaction) =>
    transaction.getQualificationAttempt(attempt.attemptId));
  assert.equal(stored?.state, "ISSUED");
  assert.equal(stored?.responses, undefined);
  assert.equal(stored?.evaluatedAt, undefined);
});

test("server-side evaluation produces a qualified attempt and one idempotent authoritative P3 receipt", async () => {
  const setup = await makeSetup({ suffix: "qualified" });
  const attempt = await issue(setup);
  const result = await setup.service.submitQualificationAttempt({
    reviewerId: "reviewer-a",
    attemptId: attempt.attemptId,
    attemptNonce: attempt.attemptNonce,
    packetFingerprint: attempt.packet.packetFingerprint,
    responses: responsesFor(attempt),
  });
  assert.equal(result.state, "QUALIFIED");
  assert.equal(result.result, "qualified");
  assert.equal(result.evaluatedAt !== undefined, true);

  const receipts = await Promise.all([
    setup.service.issueQualificationReceipt({ reviewerId: "reviewer-a", attemptId: attempt.attemptId }),
    setup.service.issueQualificationReceipt({ reviewerId: "reviewer-a", attemptId: attempt.attemptId }),
  ]);
  const receipt = receipts[0]!;
  assert.deepEqual(receipts[1], receipt);
  assert.equal(receipt.authorityState, "authoritative");
  assert.equal(receipt.receipt.reviewerId, "reviewer-a");
  assert.doesNotMatch(JSON.stringify(receipt.receipt), /answerKey|expectedStatus|rawResponse|response|private/iu);
  assert.equal(
    (await setup.service.getQualificationReceipt({ reviewerId: "reviewer-a", attemptId: attempt.attemptId }))
      .receiptFingerprint,
    receipt.receiptFingerprint,
  );
  const privateAttempt = await setup.repository.transaction((transaction) =>
    transaction.getQualificationAttempt(attempt.attemptId));
  assert.equal(JSON.stringify(privateAttempt?.responses).includes("answerKey"), false);
  assert.equal(JSON.stringify(privateAttempt?.responses).includes("evidence"), false);
});

test("a wrong but complete response is a deterministic failed qualification and cannot issue a receipt", async () => {
  const setup = await makeSetup({ suffix: "failed" });
  const attempt = await issue(setup);
  const responses = responsesFor(attempt);
  responses[0] = { ...responses[0]!, status: "EXPLICIT_CONFLICT" };
  const result = await setup.service.submitQualificationAttempt({
    reviewerId: "reviewer-a",
    attemptId: attempt.attemptId,
    attemptNonce: attempt.attemptNonce,
    packetFingerprint: attempt.packet.packetFingerprint,
    responses,
  });
  assert.equal(result.state, "NOT_QUALIFIED");
  assert.equal(result.result, "not-qualified");
  await assert.rejects(
    setup.service.issueQualificationReceipt({ reviewerId: "reviewer-a", attemptId: attempt.attemptId }),
    serviceError("qualification_not_qualified"),
  );
});

test("caller-created P3 receipt cannot become authoritative for an active P4-C pool", async () => {
  const setup = await makeSetup({ suffix: "caller-receipt" });
  const attempt = await issue(setup);
  const validReceipt = buildCommunityReviewQualificationReceipt({
    dataKind: "synthetic-fixture",
    fixture: syntheticFixture,
    qualificationId: setup.identity.qualificationId,
    qualificationVersion: setup.identity.qualificationVersion,
    qualificationPoolId: setup.identity.qualificationPoolId,
    qualificationPoolVersion: setup.identity.qualificationPoolVersion,
    qualificationDefinitionFingerprint: setup.identity.qualificationDefinitionFingerprint,
    reviewerId: "reviewer-a",
    instrument: setup.instrument,
  });
  await assert.rejects(
    setup.service.registerAuthoritativeQualificationReceipt({
      attemptId: attempt.attemptId,
      receipt: validReceipt,
    }),
    serviceError("qualification_receipt_not_authoritative"),
  );
  const persisted = await setup.repository.transaction((transaction) =>
    transaction.getQualificationReceipt(validReceipt.receiptFingerprint));
  assert.equal(persisted, undefined);
});

test("attempt limits and concurrent attempt creation are enforced transactionally", async () => {
  const setup = await makeSetup({ suffix: "limit", maxAttempts: 1 });
  const first = await issue(setup);
  const responses = responsesFor(first);
  responses[0] = { ...responses[0]!, status: "EXPLICIT_CONFLICT" };
  await setup.service.submitQualificationAttempt({
    reviewerId: "reviewer-a",
    attemptId: first.attemptId,
    attemptNonce: first.attemptNonce,
    packetFingerprint: first.packet.packetFingerprint,
    responses,
  });
  await assert.rejects(issue(setup), serviceError("qualification_attempt_limit"));

  const concurrent = await makeSetup({ suffix: "concurrent-limit", maxAttempts: 1 });
  const results = await Promise.allSettled([issue(concurrent), issue(concurrent)]);
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(results.filter((result) => result.status === "rejected").length, 1);
  const rejection = results.find((result) => result.status === "rejected");
  assert.ok(rejection && rejection.status === "rejected");
  assert.equal((rejection.reason as CommunityReviewServiceError).code, "qualification_attempt_limit");
});

test("same-attempt submissions serialize, nonce replay is rejected, and cross-owner access fails", async () => {
  const setup = await makeSetup({ suffix: "replay" });
  const first = await issue(setup, "reviewer-a");
  const second = await issue(setup, "reviewer-a");
  const submission = {
    reviewerId: "reviewer-a",
    attemptId: first.attemptId,
    attemptNonce: first.attemptNonce,
    packetFingerprint: first.packet.packetFingerprint,
    responses: responsesFor(first),
  } as const;
  const concurrent = await Promise.allSettled([
    setup.service.submitQualificationAttempt(submission),
    setup.service.submitQualificationAttempt(submission),
  ]);
  assert.equal(concurrent.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(concurrent.filter((result) => result.status === "rejected").length, 1);
  const duplicate = concurrent.find((result) => result.status === "rejected");
  assert.ok(duplicate && duplicate.status === "rejected");
  assert.equal((duplicate.reason as CommunityReviewServiceError).code, "qualification_attempt_already_submitted");

  await assert.rejects(
    setup.service.submitQualificationAttempt({
      ...submission,
      attemptId: second.attemptId,
      packetFingerprint: second.packet.packetFingerprint,
    }),
    serviceError("qualification_response_invalid"),
  );
  await assert.rejects(
    setup.service.getQualificationPacket({ reviewerId: "reviewer-b", attemptId: first.attemptId }),
    serviceError("qualification_attempt_not_owner"),
  );
  await assert.rejects(
    setup.service.submitQualificationAttempt({
      ...submission,
      reviewerId: "reviewer-b",
    }),
    serviceError("qualification_attempt_not_owner"),
  );
  await assert.rejects(
    setup.service.issueQualificationReceipt({ reviewerId: "reviewer-b", attemptId: first.attemptId }),
    serviceError("qualification_attempt_not_owner"),
  );
});

test("consent, account state, pool state, locale, and instrument remain separate authority checks", async () => {
  const setup = await makeSetup({ suffix: "authority" });
  await setup.service.revokeConsent({ reviewerId: "reviewer-a" });
  await assert.rejects(issue(setup), serviceError("consent_revoked"));
  await setup.service.recordConsent({ reviewerId: "reviewer-a" });
  await setup.service.disableReviewerAccount({ reviewerId: "reviewer-a" });
  await assert.rejects(issue(setup), serviceError("reviewer_account_disabled"));

  const activeSetup = await makeSetup({ suffix: "pool-state" });
  await activeSetup.service.retireQualificationPool({
    poolId: activeSetup.identity.qualificationPoolId,
    poolVersion: activeSetup.identity.qualificationPoolVersion,
  });
  await assert.rejects(issue(activeSetup), serviceError("qualification_pool_not_active"));

  const bindingSetup = await makeSetup({ suffix: "binding" });
  await assert.rejects(
    bindingSetup.service.createQualificationAttempt({
      ...createInput(bindingSetup),
      reviewLocale: "zh-CN",
    }),
    serviceError("qualification_pool_not_active"),
  );
  await assert.rejects(
    bindingSetup.service.createQualificationAttempt({
      ...createInput(bindingSetup),
      instrumentFingerprint: communityReviewFingerprint({ instrument: "other" }),
    }),
    serviceError("qualification_pool_not_active"),
  );
  await assert.rejects(
    bindingSetup.service.createQualificationAttempt({
      ...createInput(bindingSetup),
      poolVersion: "v2",
    }),
    serviceError("qualification_pool_not_found"),
  );
});

test("retirement serializes with submission and preserves already-issued attempt history", async () => {
  const setup = await makeSetup({ suffix: "retirement-race" });
  const attempt = await issue(setup);
  const results = await Promise.allSettled([
    setup.service.retireQualificationPool({
      poolId: setup.identity.qualificationPoolId,
      poolVersion: setup.identity.qualificationPoolVersion,
    }),
    setup.service.submitQualificationAttempt({
      reviewerId: "reviewer-a",
      attemptId: attempt.attemptId,
      attemptNonce: attempt.attemptNonce,
      packetFingerprint: attempt.packet.packetFingerprint,
      responses: responsesFor(attempt),
    }),
  ]);
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 2);
  const pool = await setup.service.getQualificationPool({
    poolId: setup.identity.qualificationPoolId,
    poolVersion: setup.identity.qualificationPoolVersion,
  });
  assert.equal(pool.state, "RETIRED");
  const result = await setup.service.getQualificationAttempt({
    reviewerId: "reviewer-a",
    attemptId: attempt.attemptId,
  });
  assert.equal(result.result, "qualified");
});

test("qualification audit metadata contains only opaque authority bindings", async () => {
  const setup = await makeSetup({ suffix: "audit" });
  const attempt = await issue(setup);
  await setup.service.submitQualificationAttempt({
    reviewerId: "reviewer-a",
    attemptId: attempt.attemptId,
    attemptNonce: attempt.attemptNonce,
    packetFingerprint: attempt.packet.packetFingerprint,
    responses: responsesFor(attempt),
  });
  await setup.service.issueQualificationReceipt({ reviewerId: "reviewer-a", attemptId: attempt.attemptId });
  const events = await setup.repository.transaction((transaction) =>
    transaction.listQualificationAuthorityAuditEvents(
      setup.identity.qualificationPoolId,
      setup.identity.qualificationPoolVersion,
    ));
  assert.deepEqual(events.map((event) => event.eventType), [
    "pool_registered",
    "pool_sealed",
    "pool_activated",
    "attempt_issued",
    "response_submitted",
    "qualification_passed",
    "receipt_issued",
  ]);
  assert.doesNotMatch(JSON.stringify(events), /answerKey|expectedStatus|responses|token|cookie|JWT/iu);
});

test("authenticated application qualification operations derive reviewer ownership and keep operator actions separate", async () => {
  const setup = await makeSetup({ suffix: "application" });
  const reviewerPrincipal = { provider: "synthetic", subject: "application-reviewer-a" } as const;
  const otherPrincipal = { provider: "synthetic", subject: "application-reviewer-b" } as const;
  const operatorPrincipal = { provider: "synthetic", subject: "application-operator" } as const;
  await setup.service.linkReviewerAuthIdentity({ reviewerId: "reviewer-a", principal: reviewerPrincipal });
  await setup.service.linkReviewerAuthIdentity({ reviewerId: "reviewer-b", principal: otherPrincipal });
  const authentication = new SyntheticAuthenticationAdapter({
    "reviewer-a-token": reviewerPrincipal,
    "reviewer-b-token": otherPrincipal,
    "operator-token": { principal: operatorPrincipal, channel: "operator" },
  });
  const application = new CommunityReviewApplicationService(
    setup.service,
    authentication,
    new StaticOperatorAuthorizer([operatorPrincipal]),
  );
  const forgedInput = {
    authenticationInput: "reviewer-a-token",
    ...createInput(setup),
    // An extra forged owner field is ignored by the authenticated facade.
    reviewerId: "reviewer-b",
  } as const;
  await assert.rejects(
    application.createQualificationAttempt({ ...forgedInput, authenticationInput: "missing-token" }),
    serviceError("authentication_failed"),
  );
  const attempt = await application.createQualificationAttempt(forgedInput);
  assert.equal(attempt.packet.attemptId, attempt.attemptId);
  await assert.rejects(
    application.getQualificationPacket({
      authenticationInput: "reviewer-b-token",
      attemptId: attempt.attemptId,
    }),
    serviceError("qualification_attempt_not_owner"),
  );
  const result = await application.submitQualificationAttempt({
    authenticationInput: "reviewer-a-token",
    attemptId: attempt.attemptId,
    attemptNonce: attempt.attemptNonce,
    packetFingerprint: attempt.packet.packetFingerprint,
    responses: responsesFor(attempt),
  });
  assert.equal(result.result, "qualified");
  const receipt = await application.issueQualificationReceipt({
    authenticationInput: "reviewer-a-token",
    attemptId: attempt.attemptId,
  });
  assert.equal(receipt.authorityState, "authoritative");
  await assert.rejects(
    application.retireQualificationPool({
      authenticationInput: "reviewer-a-token",
      poolId: setup.identity.qualificationPoolId,
      poolVersion: setup.identity.qualificationPoolVersion,
    }),
    serviceError("operator_not_authorized"),
  );
});
