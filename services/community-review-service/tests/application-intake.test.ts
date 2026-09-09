import assert from "node:assert/strict";
import { test } from "node:test";

import {
  ApplicationSubmissionRateLimiter,
  CommunityReviewApplicationIntakeService,
  CommunityReviewServiceError,
  InMemoryCommunityReviewRepository,
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
    contact: { type: "email", value: "synthetic.applicant@example.invalid" },
    motivation: "I want to inspect observable tutoring behavior.",
    experienceSummary: "Synthetic experience summary.",
    availability: "occasional",
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

function service(
  repository: InMemoryCommunityReviewRepository,
  overrides: ConstructorParameters<typeof CommunityReviewApplicationIntakeService>[1] = {},
): CommunityReviewApplicationIntakeService {
  return new CommunityReviewApplicationIntakeService(repository, {
    intakeState: "OPEN",
    clock: () => "2026-01-01T00:00:00.000Z",
    applicationIdGenerator: () => "application-1",
    withdrawalCredentialGenerator: () => "w".repeat(48),
    auditEventIdGenerator: (() => {
      let counter = 0;
      return () => `application-audit-${++counter}`;
    })(),
    ...overrides,
  });
}

function errorCode(code: CommunityReviewServiceError["code"]): (error: unknown) => boolean {
  return (error: unknown): boolean => error instanceof CommunityReviewServiceError && error.code === code;
}

test("closed and paused intake reject before any application persistence", async () => {
  for (const intakeState of ["CLOSED", "PAUSED"] as const) {
    const repository = new InMemoryCommunityReviewRepository();
    const intake = new CommunityReviewApplicationIntakeService(repository, { intakeState });
    await assert.rejects(
      intake.submitApplication({
        application: application(),
        idempotencyKey: "closed-state-key",
      }),
      errorCode(intakeState === "CLOSED" ? "application_intake_closed" : "application_intake_paused"),
    );
    const snapshot = repository.snapshot();
    assert.equal(snapshot.applications.length, 0);
    assert.equal(snapshot.applicationContacts.length, 0);
    assert.equal(snapshot.applicationIdempotency.length, 0);
    assert.equal(snapshot.applicationAuditEvents.length, 0);
    assert.equal(snapshot.reviewerAccounts.length, 0);
  }
});

test("withdrawal remains available after intake is paused or closed", async () => {
  const repository = new InMemoryCommunityReviewRepository();
  const open = service(repository);
  const submitted = await open.submitApplication({
    application: application(),
    idempotencyKey: "pause-withdrawal-key",
  });
  const paused = new CommunityReviewApplicationIntakeService(repository, { intakeState: "PAUSED" });
  const withdrawn = await paused.withdrawApplication({
    applicationId: submitted.receipt.applicationId,
    withdrawalCredential: submitted.receipt.withdrawalCredential!,
  });
  assert.equal(withdrawn.lifecycle, "WITHDRAWN");
  assert.equal(repository.snapshot().applicationContacts.length, 0);
});

test("submission is retry-safe, conflicts on semantic changes, and returns the credential once", async () => {
  const repository = new InMemoryCommunityReviewRepository();
  const intake = service(repository);
  const first = await intake.submitApplication({
    application: application(),
    idempotencyKey: "application-key-1",
    sourceKey: "synthetic-client",
  });
  assert.equal(first.created, true);
  assert.equal(first.receipt.applicationId, "application-1");
  assert.equal(first.receipt.withdrawalCredential, "w".repeat(48));

  const retry = await intake.submitApplication({
    application: application(),
    idempotencyKey: "application-key-1",
    sourceKey: "synthetic-client",
  });
  assert.equal(retry.created, false);
  assert.deepEqual(retry.receipt, {
    applicationId: first.receipt.applicationId,
    contractId: "community-review-application",
    contractVersion: "0.1.0",
    noticeVersion: "0.1.0",
    receivedAt: "2026-01-01T00:00:00.000Z",
    status: "PENDING",
  });

  await assert.rejects(
    intake.submitApplication({
      application: application({ motivation: "different semantic body" }),
      idempotencyKey: "application-key-1",
      sourceKey: "synthetic-client",
    }),
    errorCode("application_idempotency_conflict"),
  );
  const snapshot = repository.snapshot();
  assert.equal(snapshot.applications.length, 1);
  assert.equal(snapshot.applicationContacts.length, 1);
  assert.equal(snapshot.applicationIdempotency.length, 1);
  assert.equal(snapshot.applicationAuditEvents.length, 1);
  assert.match(JSON.stringify(snapshot.applicationIdempotency), /sha256:/u);
  assert.doesNotMatch(JSON.stringify(snapshot.applicationIdempotency), /application-key-1/iu);
});

test("concurrent duplicate submissions create one logical application", async () => {
  const repository = new InMemoryCommunityReviewRepository();
  let id = 0;
  const intake = new CommunityReviewApplicationIntakeService(repository, {
    intakeState: "OPEN",
    clock: () => "2026-01-01T00:00:00.000Z",
    applicationIdGenerator: () => `application-${++id}`,
    withdrawalCredentialGenerator: () => "w".repeat(48),
    auditEventIdGenerator: () => `audit-${++id}`,
  });
  const results = await Promise.all([
    intake.submitApplication({ application: application(), idempotencyKey: "concurrent-key" }),
    intake.submitApplication({ application: application(), idempotencyKey: "concurrent-key" }),
  ]);
  assert.equal(results.filter((result) => result.created).length, 1);
  assert.equal(new Set(results.map((result) => result.receipt.applicationId)).size, 1);
  assert.equal(repository.snapshot().applications.length, 1);
});

test("operator decision, withdrawal, and purge redact applicant data without creating reviewer authority", async () => {
  const repository = new InMemoryCommunityReviewRepository();
  const intake = service(repository);
  const submitted = await intake.submitApplication({
    application: application(),
    idempotencyKey: "withdrawal-key",
  });
  const decided = await intake.recordDecision({
    applicationId: submitted.receipt.applicationId,
    decision: "INVITED",
  });
  assert.equal(decided.decision, "INVITED");
  assert.equal(decided.contact?.contactValue, "synthetic.applicant@example.invalid");
  const repeated = await intake.recordDecision({
    applicationId: submitted.receipt.applicationId,
    decision: "INVITED",
  });
  assert.equal(repeated.decision, "INVITED");

  const withdrawn = await intake.withdrawApplication({
    applicationId: submitted.receipt.applicationId,
    withdrawalCredential: submitted.receipt.withdrawalCredential!,
  });
  assert.equal(withdrawn.lifecycle, "WITHDRAWN");
  const tombstone = await intake.getApplicationForOperator(submitted.receipt.applicationId);
  assert.equal(tombstone.contact, undefined);
  assert.equal(tombstone.motivation, undefined);
  assert.equal(tombstone.experienceSummary, undefined);

  const second = await new CommunityReviewApplicationIntakeService(repository, {
    intakeState: "OPEN",
    clock: () => "2026-01-01T00:00:00.000Z",
    applicationIdGenerator: () => "application-2",
    withdrawalCredentialGenerator: () => "x".repeat(48),
    auditEventIdGenerator: (() => {
      let counter = 10;
      return () => `application-audit-${++counter}`;
    })(),
  }).submitApplication({ application: application(), idempotencyKey: "purge-key" });
  const purged = await intake.purgeExpired("2026-04-02T00:00:00.000Z");
  assert.deepEqual(purged.purgedApplicationIds, [second.receipt.applicationId]);
  const afterPurge = await intake.getApplicationForOperator(second.receipt.applicationId);
  assert.equal(afterPurge.lifecycle, "PURGED");
  assert.equal(afterPurge.contact, undefined);

  const snapshot = repository.snapshot();
  assert.equal(snapshot.reviewerAccounts.length, 0);
  assert.equal(snapshot.reviewerAuthIdentities.length, 0);
  assert.equal(snapshot.reviewerConsents.length, 0);
  assert.equal(snapshot.qualificationAttempts.length, 0);
  assert.equal(snapshot.qualificationReceipts.length, 0);
  assert.equal(snapshot.assignments.length, 0);
  assert.equal(snapshot.acceptedSubmissions.length, 0);
  assert.equal(snapshot.batches.length, 0);
  assert.equal(snapshot.frozenReviewPools.length, 0);
  assert.equal(snapshot.agreementEvidence.length, 0);
  assert.equal(snapshot.disclosures.length, 0);
  assert.equal(snapshot.applicationContacts.length, 0);
  assert.doesNotMatch(JSON.stringify(snapshot.reviewerAccounts), /synthetic\.applicant/iu);
  assert.doesNotMatch(JSON.stringify(snapshot.applicationAuditEvents), /motivation|experience|synthetic\.applicant/iu);
});

test("rate limiting is bounded and idempotent retries bypass the new-submission window", async () => {
  const repository = new InMemoryCommunityReviewRepository();
  let id = 0;
  const limiter = new ApplicationSubmissionRateLimiter({
    maximumRequests: 1,
    windowMs: 60_000,
    maximumEntries: 2,
    clock: () => 1_000,
  });
  const intake = new CommunityReviewApplicationIntakeService(repository, {
    intakeState: "OPEN",
    clock: () => "2026-01-01T00:00:00.000Z",
    applicationIdGenerator: () => `rate-${++id}`,
    withdrawalCredentialGenerator: () => "r".repeat(48),
    auditEventIdGenerator: () => `rate-audit-${++id}`,
    rateLimiter: limiter,
  });
  await intake.submitApplication({ application: application(), idempotencyKey: "rate-key", sourceKey: "one" });
  await intake.submitApplication({ application: application(), idempotencyKey: "rate-key", sourceKey: "one" });
  await assert.rejects(
    intake.submitApplication({ application: application({ motivation: "new" }), idempotencyKey: "rate-key-2", sourceKey: "one" }),
    errorCode("application_rate_limited"),
  );
  await intake.submitApplication({ application: application({ motivation: "other" }), idempotencyKey: "rate-key-3", sourceKey: "two" });
  await intake.submitApplication({ application: application({ motivation: "third" }), idempotencyKey: "rate-key-4", sourceKey: "three" });
  assert.ok(limiter.size <= 2);
  const storedKeys = [...(limiter as unknown as { entries: Map<string, unknown> }).entries.keys()];
  assert.ok(storedKeys.every((key) => key.startsWith("source-v1:") && !key.includes("one")));
});
