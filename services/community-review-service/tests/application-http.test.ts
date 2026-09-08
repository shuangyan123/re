import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { test } from "node:test";

import {
  CommunityReviewLogger,
  createCommunityReviewHttpServer,
  createCommunityReviewRuntime,
  gracefulShutdown,
  loadCommunityReviewConfig,
} from "../src/index.js";

function application(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schemaVersion: 1,
    applicationKind: "community-review-application",
    contractId: "community-review-application",
    contractVersion: "0.1.0",
    noticeVersion: "0.1.0",
    submittedLocale: "en",
    preferredReviewLocale: "zh-CN",
    contact: { type: "email", value: "http.applicant@example.invalid" },
    motivation: "Synthetic HTTP motivation.",
    availability: "regular",
    acknowledgements: {
      applicationNoticeAcknowledged: true,
      applicationDoesNotGuaranteeAcceptance: true,
      invitationDoesNotImplyQualification: true,
      qualificationRequiredBeforeReviewAssignments: true,
      publicIntakeFollowsLaunchGate: true,
    },
    ...overrides,
  };
}

function runtimeFor(state?: "CLOSED" | "OPEN" | "PAUSED") {
  const config = loadCommunityReviewConfig({
    env: {
      COMMUNITY_REVIEW_ENV: "development",
      COMMUNITY_REVIEW_STORAGE: "in-memory",
      COMMUNITY_REVIEW_AUTH_MODE: "synthetic",
      COMMUNITY_REVIEW_OPERATOR_SUBJECTS: "example-oidc|operator-application-http",
      COMMUNITY_REVIEW_SYNTHETIC_IDENTITIES:
        "Bearer operator-application-token=example-oidc|operator-application-http,Bearer reviewer-application-token=example-oidc|reviewer-application-http",
      COMMUNITY_REVIEW_REQUEST_BODY_LIMIT_BYTES: "4096",
      ...(state === undefined ? {} : { COMMUNITY_REVIEW_APPLICATION_INTAKE_STATE: state }),
    },
  });
  return createCommunityReviewRuntime(config);
}

function auth(token: string): Record<string, string> {
  return { authorization: `Bearer ${token}` };
}

function jsonHeaders(token?: string, idempotencyKey?: string): Record<string, string> {
  return {
    ...(token === undefined ? {} : auth(token)),
    "content-type": "application/json",
    ...(idempotencyKey === undefined ? {} : { "idempotency-key": idempotencyKey }),
  };
}

async function listen(server: Server): Promise<AddressInfo> {
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.removeAllListeners("error");
      resolve();
    });
  });
  const address = server.address();
  assert.notEqual(address, null);
  assert.equal(typeof address, "object");
  return address as AddressInfo;
}

test("closed public application POST is enforced before persistence and public reviewer intake stays separate", async () => {
  const runtime = runtimeFor();
  const server = createCommunityReviewHttpServer(runtime, new CommunityReviewLogger("error"));
  const address = await listen(server);
  const base = `http://127.0.0.1:${address.port}`;
  try {
    const rejected = await fetch(`${base}/v1/applications`, {
      method: "POST",
      headers: jsonHeaders(undefined, "closed-http-key"),
      body: JSON.stringify(application()),
    });
    assert.equal(rejected.status, 409);
    assert.equal((await rejected.json() as { error: string }).error, "application_intake_closed");

    const malformed = await fetch(`${base}/v1/applications`, {
      method: "POST",
      headers: jsonHeaders(undefined, "closed-malformed-key"),
      body: "{",
    });
    assert.equal(malformed.status, 409);
    assert.equal((await malformed.json() as { error: string }).error, "application_intake_closed");
    assert.equal(runtime.applicationIntake.getApplicationIntakeState(), "CLOSED");
    assert.equal(runtime.config.publicIntakeEnabled, false);

    const snapshot = (runtime.persistence as { snapshot?: () => {
      applications: unknown[];
      applicationContacts: unknown[];
      applicationIdempotency: unknown[];
      applicationAuditEvents: unknown[];
    } }).snapshot?.();
    assert.equal(snapshot?.applications.length, 0);
    assert.equal(snapshot?.applicationContacts.length, 0);
    assert.equal(snapshot?.applicationIdempotency.length, 0);
    assert.equal(snapshot?.applicationAuditEvents.length, 0);
  } finally {
    await gracefulShutdown(server, runtime, 1000);
  }
});

test("open application transport is allowlisted, idempotent, operator-protected, and withdrawable", async () => {
  const runtime = runtimeFor("OPEN");
  const server = createCommunityReviewHttpServer(runtime, new CommunityReviewLogger("error"));
  const address = await listen(server);
  const base = `http://127.0.0.1:${address.port}`;
  try {
    const submitted = await fetch(`${base}/v1/applications`, {
      method: "POST",
      headers: jsonHeaders(undefined, "open-http-key"),
      body: JSON.stringify(application()),
    });
    assert.equal(submitted.status, 200);
    const first = (await submitted.json() as { data: Record<string, unknown> }).data;
    assert.equal(first.status, "PENDING");
    assert.equal(typeof first.applicationId, "string");
    assert.equal(typeof first.withdrawalCredential, "string");
    assert.equal("contact" in first, false);
    assert.equal("motivation" in first, false);
    const applicationId = first.applicationId as string;
    const credential = first.withdrawalCredential as string;

    const retry = await fetch(`${base}/v1/applications`, {
      method: "POST",
      headers: jsonHeaders(undefined, "open-http-key"),
      body: JSON.stringify(application()),
    });
    assert.equal(retry.status, 200);
    const retryData = (await retry.json() as { data: Record<string, unknown> }).data;
    assert.equal(retryData.applicationId, applicationId);
    assert.equal("withdrawalCredential" in retryData, false);

    const conflict = await fetch(`${base}/v1/applications`, {
      method: "POST",
      headers: jsonHeaders(undefined, "open-http-key"),
      body: JSON.stringify(application({ motivation: "altered semantic body" })),
    });
    assert.equal(conflict.status, 409);
    assert.equal((await conflict.json() as { error: string }).error, "application_idempotency_conflict");

    const unauthenticatedList = await fetch(`${base}/v1/operator/applications`);
    assert.equal(unauthenticatedList.status, 401);
    const reviewerList = await fetch(`${base}/v1/operator/applications`, { headers: auth("reviewer-application-token") });
    assert.equal(reviewerList.status, 403);

    const list = await fetch(`${base}/v1/operator/applications`, { headers: auth("operator-application-token") });
    assert.equal(list.status, 200);
    const summaries = (await list.json() as { data: Array<Record<string, unknown>> }).data;
    assert.equal(summaries.length, 1);
    assert.equal("contact" in summaries[0]!, false);
    assert.equal("motivation" in summaries[0]!, false);

    const detail = await fetch(`${base}/v1/operator/applications/${applicationId}`, {
      headers: auth("operator-application-token"),
    });
    assert.equal(detail.status, 200);
    const detailData = (await detail.json() as { data: Record<string, unknown> }).data;
    assert.equal((detailData.contact as { contactValue: string }).contactValue, "http.applicant@example.invalid");
    assert.equal(detailData.motivation, "Synthetic HTTP motivation.");
    assert.equal("withdrawalCredentialDigest" in detailData, false);

    const decision = await fetch(`${base}/v1/operator/applications/${applicationId}/decision`, {
      method: "POST",
      headers: jsonHeaders("operator-application-token"),
      body: JSON.stringify({ decision: "INVITED" }),
    });
    assert.equal(decision.status, 200);
    assert.equal((await decision.json() as { data: { decision: string } }).data.decision, "INVITED");
    const repeatDecision = await fetch(`${base}/v1/operator/applications/${applicationId}/decision`, {
      method: "POST",
      headers: jsonHeaders("operator-application-token"),
      body: JSON.stringify({ decision: "INVITED" }),
    });
    assert.equal(repeatDecision.status, 200);

    const withdrawn = await fetch(`${base}/v1/applications/${applicationId}/withdraw`, {
      method: "POST",
      headers: jsonHeaders(undefined),
      body: JSON.stringify({ credential }),
    });
    assert.equal(withdrawn.status, 200);
    assert.equal((await withdrawn.json() as { data: { lifecycle: string } }).data.lifecycle, "WITHDRAWN");

    const redacted = await fetch(`${base}/v1/operator/applications/${applicationId}`, {
      headers: auth("operator-application-token"),
    });
    const redactedData = (await redacted.json() as { data: Record<string, unknown> }).data;
    assert.equal("contact" in redactedData, false);
    assert.equal("motivation" in redactedData, false);

    const unauthorizedWithdrawal = await fetch(`${base}/v1/applications/${applicationId}/withdraw`, {
      method: "POST",
      headers: jsonHeaders(undefined),
      body: JSON.stringify({ credential: "wrong-credential-that-is-long-enough-000000" }),
    });
    assert.equal(unauthorizedWithdrawal.status, 404);
  } finally {
    await gracefulShutdown(server, runtime, 1000);
  }
});

test("open application transport rejects malformed contract input, oversized bodies, and wrong methods", async () => {
  const runtime = runtimeFor("OPEN");
  const server = createCommunityReviewHttpServer(runtime, new CommunityReviewLogger("error"));
  const address = await listen(server);
  const base = `http://127.0.0.1:${address.port}`;
  try {
    const wrongMethod = await fetch(`${base}/v1/applications`, { method: "GET" });
    assert.equal(wrongMethod.status, 405);
    assert.equal(wrongMethod.headers.get("allow"), "POST");

    const malformed = await fetch(`${base}/v1/applications`, {
      method: "POST",
      headers: jsonHeaders(undefined, "malformed-open-key"),
      body: JSON.stringify(application({ unknownField: true })),
    });
    assert.equal(malformed.status, 400);
    assert.equal((await malformed.json() as { error: string }).error, "application_contract_invalid");

    const missingKey = await fetch(`${base}/v1/applications`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(application()),
    });
    assert.equal(missingKey.status, 400);
    assert.equal((await missingKey.json() as { error: string }).error, "application_idempotency_required");

    const oversized = await fetch(`${base}/v1/applications`, {
      method: "POST",
      headers: jsonHeaders(undefined, "oversized-open-key"),
      body: JSON.stringify({ filler: "x".repeat(5000) }),
    });
    assert.equal(oversized.status, 413);
    assert.equal((await oversized.json() as { error: string }).error, "request_too_large");
  } finally {
    await gracefulShutdown(server, runtime, 1000);
  }
});
