import assert from "node:assert/strict";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { describe, before, after, test } from "node:test";

import { Pool } from "pg";

import {
  buildCommunityReviewInstrumentIdentity,
  communityReviewFingerprint,
  createCommunityReviewBatch,
} from "../../../src/community-review/index.js";
import type {
  CommunityReviewAnnotation,
  CommunityReviewAssignment,
  CommunityReviewQualificationEligibility,
  CommunityReviewReviewerPacket,
  CommunityReviewVisibleTask,
} from "../../../src/contracts/community-review.js";
import { parseCommunityReviewVisibleTask } from "../../../src/contracts/community-review-validation.js";
import {
  CommunityReviewService,
  CommunityReviewServiceError,
  InMemoryCommunityReviewRepository,
  InMemoryQualificationMaterialStore,
  InMemoryReviewBatchMaterialStore,
  CommunityReviewMigrationRunner,
  PostgreSQLCommunityReviewRepository,
  QUALIFICATION_PASS_RULE_ID,
  qualificationDefinitionFingerprint,
} from "../src/index.js";
import type {
  CommunityReviewPersistence,
} from "../src/index.js";

const postgresEnabled = process.env.COMMUNITY_REVIEW_POSTGRES_TESTS === "1";
const databaseUrl = process.env.COMMUNITY_REVIEW_DATABASE_URL;
const migrationDirectory = resolve("services/community-review-service/migrations");
const syntheticFixture = {
  synthetic: true as const,
  notHumanCalibrationData: true as const,
  notCommunityReviewEvidence: true as const,
};
const guideFingerprint = communityReviewFingerprint({ guideText: "Synthetic PG integration guide." });
const tasks: CommunityReviewVisibleTask[] = [
  parseCommunityReviewVisibleTask({
    caseId: "pg-case",
    learningObjective: "Compare a tutor reply with visible learner needs.",
    studentProfile: "Synthetic learner at introductory level.",
    conversationHistory: "No earlier turns.",
    studentMessage: "Explain the next step.",
    problemContext: "A short synthetic practice problem.",
    rubrics: [{
      id: "pg-rubric",
      criterion: "The reply should support the learner's next step.",
      requirements: [
        { id: "pg-clarity", description: "The reply is clear enough to follow." },
        { id: "pg-action", description: "The reply gives a useful next action." },
      ],
    }],
    tutorResponse: "The tutor offers a concise next step and a check.",
  }),
];

function qualificationItems(suffix: string) {
  return [{
    caseId: `qualification-${suffix}`,
    rubricId: "qualification-rubric",
    requirementId: "qualification-eligibility",
    prompt: "Classify the synthetic qualification reply.",
  }];
}

function qualificationAnswers(suffix: string) {
  return qualificationItems(suffix).map(({ caseId, rubricId, requirementId }) => ({
    caseId,
    rubricId,
    requirementId,
    status: "SATISFIED" as const,
  }));
}

function instrument() {
  return buildCommunityReviewInstrumentIdentity({
    guideFingerprint,
    canonicalLocale: "en",
    reviewLocale: "en",
  });
}

function eligibility(suffix: string, reviewInstrument: ReturnType<typeof instrument>): CommunityReviewQualificationEligibility {
  const qualificationId = `community-review-gate-${suffix}`;
  const qualificationVersion = "0.1.0";
  const qualificationPoolId = `community-review-pool-${suffix}`;
  const qualificationPoolVersion = "0.1.0";
  return {
    qualificationProtocolId: "community-review-qualification",
    qualificationProtocolVersion: "0.1.0",
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
      items: qualificationItems(suffix),
    }),
  };
}

function reviewAnnotations(packet: CommunityReviewReviewerPacket): CommunityReviewAnnotation[] {
  return packet.tasks.flatMap((task) => task.rubrics.flatMap((rubric) => rubric.requirements.map((requirement) => ({
    caseId: task.caseId,
    rubricId: rubric.id,
    requirementId: requirement.id,
    status: "SATISFIED" as const,
    evidence: `${packet.reviewerId} observed the visible reply.`,
  }))));
}

interface Setup {
  readonly repository: CommunityReviewPersistence;
  readonly service: CommunityReviewService;
  readonly batchId: string;
  readonly qualificationAttemptIds: readonly string[];
  readonly assignments: readonly CommunityReviewAssignment[];
  readonly packets: readonly CommunityReviewReviewerPacket[];
}

function deterministicClock(): () => string {
  let tick = 0;
  return () => new Date(Date.parse("2026-09-06T01:00:00.000Z") + tick++ * 1000).toISOString();
}

async function makeSetup(
  repository: CommunityReviewPersistence,
  suffix: string,
  reviewerIds: readonly string[] = ["reviewer-a"],
): Promise<Setup> {
  const reviewInstrument = instrument();
  const reviewEligibility = eligibility(suffix, reviewInstrument);
  const qualificationMaterialStore = new InMemoryQualificationMaterialStore();
  const materialStore = new InMemoryReviewBatchMaterialStore();
  const qualificationReference = `synthetic://qualification-definition/${suffix}`;
  const answerReference = `synthetic://qualification-answer-key/${suffix}`;
  qualificationMaterialStore.register({
    identity: {
      qualificationId: reviewEligibility.qualificationId,
      qualificationVersion: reviewEligibility.qualificationVersion,
      qualificationPoolId: reviewEligibility.qualificationPoolId,
      qualificationPoolVersion: reviewEligibility.qualificationPoolVersion,
      qualificationDefinitionFingerprint: reviewEligibility.qualificationDefinitionFingerprint,
      instrumentId: reviewInstrument.instrumentId,
      instrumentVersion: reviewInstrument.instrumentVersion,
      instrumentFingerprint: reviewInstrument.fingerprint,
      reviewLocale: reviewInstrument.reviewLocale,
      sealedDefinitionReference: qualificationReference,
      privateAnswerKeyReference: answerReference,
    },
    visibleMaterial: { passRuleId: QUALIFICATION_PASS_RULE_ID, items: qualificationItems(suffix) },
    privateAnswerKey: { answers: qualificationAnswers(suffix) },
  });
  const service = new CommunityReviewService(repository, {
    clock: deterministicClock(),
    qualificationMaterialStore,
    reviewBatchMaterialStore: materialStore,
  });
  for (const reviewerId of reviewerIds) {
    await service.registerReviewerAccount({
      internalId: `internal-${reviewerId}-${suffix}`,
      reviewerId,
      privateAuthSubjectReference: `private-auth-${reviewerId}-${suffix}`,
      consentVersion: "1.0.0",
    });
    await service.recordConsent({ reviewerId });
  }
  await service.registerQualificationPool({
    dataKind: "synthetic-fixture",
    fixture: syntheticFixture,
    qualificationId: reviewEligibility.qualificationId,
    qualificationVersion: reviewEligibility.qualificationVersion,
    poolId: reviewEligibility.qualificationPoolId,
    poolVersion: reviewEligibility.qualificationPoolVersion,
    definitionFingerprint: reviewEligibility.qualificationDefinitionFingerprint,
    instrumentFingerprint: reviewInstrument.fingerprint,
    reviewLocale: reviewInstrument.reviewLocale,
    instrument: reviewInstrument,
    state: "DRAFT",
    sealedDefinitionReference: qualificationReference,
    privateAnswerKeyReference: answerReference,
  });
  await service.sealQualificationPool({
    poolId: reviewEligibility.qualificationPoolId,
    poolVersion: reviewEligibility.qualificationPoolVersion,
  });
  await service.activateQualificationPool({
    poolId: reviewEligibility.qualificationPoolId,
    poolVersion: reviewEligibility.qualificationPoolVersion,
  });
  const qualificationAttemptIds: string[] = [];
  for (const reviewerId of reviewerIds) {
    const issued = await service.createQualificationAttempt({
      reviewerId,
      qualificationId: reviewEligibility.qualificationId,
      qualificationVersion: reviewEligibility.qualificationVersion,
      poolId: reviewEligibility.qualificationPoolId,
      poolVersion: reviewEligibility.qualificationPoolVersion,
      instrumentFingerprint: reviewInstrument.fingerprint,
      reviewLocale: reviewInstrument.reviewLocale,
    });
    await service.submitQualificationAttempt({
      reviewerId,
      attemptId: issued.attemptId,
      attemptNonce: issued.attemptNonce,
      packetFingerprint: issued.packet.packetFingerprint,
      responses: issued.packet.items.map((item) => ({
        caseId: item.caseId,
        rubricId: item.rubricId,
        requirementId: item.requirementId,
        status: "SATISFIED" as const,
      })),
    });
    await service.issueQualificationReceipt({ reviewerId, attemptId: issued.attemptId });
    qualificationAttemptIds.push(issued.attemptId);
  }
  const batchId = `community-review-batch-${suffix}`;
  const sealed = createCommunityReviewBatch({
    batchId,
    instrument: reviewInstrument,
    qualificationEligibility: reviewEligibility,
    sealedSourceFingerprint: communityReviewFingerprint({ sealedSource: suffix }),
    tasks,
    dataKind: "synthetic-fixture",
    fixture: syntheticFixture,
    batchPurpose: "interpretable",
  });
  const sealedSourceReference = `synthetic://sealed-source/${suffix}`;
  materialStore.register({ manifest: sealed, sealedSourceReference, tasks });
  await service.createBatch({ manifest: sealed, sealedSourceReference });
  await service.openBatch(batchId);
  const assignments = [];
  const packets = [];
  for (const reviewerId of reviewerIds) {
    const result = await service.assignReviewer({ batchId, reviewerId });
    assignments.push(result.assignment);
    packets.push(result.packet);
  }
  return { repository, service, batchId, qualificationAttemptIds, assignments, packets };
}

async function completeAndFreeze(setup: Setup): Promise<void> {
  for (const [index, assignment] of setup.assignments.entries()) {
    await setup.service.submitReview({
      batchId: setup.batchId,
      assignmentId: assignment.assignmentId,
      reviewerId: assignment.reviewerId,
      annotations: reviewAnnotations(setup.packets[index]!),
    });
  }
  await setup.service.closeBatch(setup.batchId);
  await setup.service.freezeBatch(setup.batchId);
}

const postgresSuite = describe("Community Review PostgreSQL adapter", { skip: !postgresEnabled }, () => {
  let pool: Pool | undefined;
  let repository: PostgreSQLCommunityReviewRepository | undefined;
  const temporaryDirectories: string[] = [];

  function activePool(): Pool {
    if (pool === undefined) throw new Error("PostgreSQL test pool is not initialized.");
    return pool;
  }

  function activeRepository(): PostgreSQLCommunityReviewRepository {
    if (repository === undefined) throw new Error("PostgreSQL test repository is not initialized.");
    return repository;
  }

  before(async () => {
    if (databaseUrl === undefined || process.env.COMMUNITY_REVIEW_ALLOW_TEST_RESET !== "1") {
      throw new Error("PostgreSQL tests require an explicit reset opt-in and connection string.");
    }
    const parsed = new URL(databaseUrl);
    const databaseName = decodeURIComponent(parsed.pathname.replace(/^\//u, ""));
    if (!/^tutorbench_community_review(?:_[A-Za-z0-9_-]+)?$/u.test(databaseName)) {
      throw new Error("Refusing to reset an unscoped PostgreSQL test database.");
    }
    pool = new Pool({
      connectionString: databaseUrl,
      max: 6,
      connectionTimeoutMillis: 5000,
      ssl: false,
    });
    await activePool().query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
    repository = new PostgreSQLCommunityReviewRepository({
      pool: activePool(),
      migrationsDirectory: migrationDirectory,
    });
    const status = await activeRepository().migrate();
    assert.equal(status.currentVersion, 6);
    assert.equal(status.appliedMigrationCount, 6);
  });

  after(async () => {
    for (const directory of temporaryDirectories) await rm(directory, { recursive: true, force: true });
    await activeRepository().close();
    await activePool().end();
  });

  test("migration runner is deterministic, idempotent, and verifies history", async () => {
    const first = await activeRepository().migrate();
    const verified = await activeRepository().verifyMigrations();
    assert.equal(first.currentVersion, 6);
    assert.equal(first.appliedMigrationCount, 6);
    assert.deepEqual(verified, { currentVersion: 6, knownMigrationCount: 6, appliedMigrationCount: 6, ready: true });
    const history = await activePool().query<{ readonly count: string }>(
      "SELECT COUNT(*)::text AS count FROM community_review_schema_migrations",
    );
    assert.equal(history.rows[0]?.count, "6");

    const copied = await mkdtemp(join(tmpdir(), "tutorbench-community-review-migrations-"));
    temporaryDirectories.push(copied);
    await cp(migrationDirectory, copied, { recursive: true });
    const changedPath = join(copied, "003_sealed_qualification_authority.sql");
    const changed = await readFile(changedPath, "utf8");
    await writeFile(changedPath, `${changed}\n-- drift test only\n`);
    await assert.rejects(new CommunityReviewMigrationRunner(copied).verify(activePool()), (error: unknown) => {
      return error instanceof Error && "code" in error &&
        (error as { code?: unknown }).code === "migration_checksum_drift";
    });
  });

  test("transaction rollback and database constraints preserve the existing persistence contract", async () => {
    const account = {
      internalId: "rollback-internal-pg",
      reviewerId: "rollback-reviewer-pg",
      privateAuthSubjectReference: "opaque-rollback-reference",
      status: "ACTIVE" as const,
      consentVersion: "1.0.0",
      consentState: "NOT_CONSENTED" as const,
      createdAt: "2026-09-06T02:00:00.000Z",
      updatedAt: "2026-09-06T02:00:00.000Z",
    };
    await assert.rejects(activeRepository().transaction((transaction) => {
      transaction.insertReviewerAccount(account);
      throw new Error("intentional rollback");
    }), /intentional rollback/u);
    const found = await activeRepository().transaction((transaction) =>
      transaction.getReviewerAccountByReviewerId(account.reviewerId));
    assert.equal(found, undefined);
    await activeRepository().transaction((transaction) => transaction.insertReviewerAccount(account));
    await assert.rejects(activeRepository().transaction((transaction) => transaction.insertReviewerAccount(account)),
      (error: unknown) => error instanceof CommunityReviewServiceError && error.code === "repository_conflict");
  });

  test("full qualification, blind delivery, submission, close, freeze, and private disclosure round-trip through PostgreSQL", async () => {
    const setup = await makeSetup(activeRepository(), "pg-integration");
    const assignment = setup.assignments[0]!;
    const packet = setup.packets[0]!;
    const submission = await setup.service.submitReview({
      batchId: setup.batchId,
      assignmentId: assignment.assignmentId,
      reviewerId: assignment.reviewerId,
      packetFingerprint: packet.packetFingerprint,
      annotations: reviewAnnotations(packet),
    });
    const close = await setup.service.closeBatch(setup.batchId);
    const frozen = await setup.service.freezeBatch(setup.batchId);
    const evidence = await setup.service.buildAgreementEvidence(setup.batchId);
    const disclosure = await setup.service.createDisclosure({ batchId: setup.batchId });
    const reread = await activeRepository().transaction((transaction) => ({
      batch: transaction.getBatch(setup.batchId),
      assignment: transaction.getAssignment(assignment.assignmentId),
      submission: transaction.getAcceptedSubmissionByAssignment(assignment.assignmentId),
      close: transaction.getBatchCloseRecord(setup.batchId),
      frozen: transaction.getFrozenReviewPool(setup.batchId),
      evidence: transaction.getCommunityReviewAgreementEvidence(setup.batchId),
      disclosure: transaction.getCommunityReviewDisclosure(disclosure.disclosureId),
    }));
    assert.equal(submission.submissionFingerprint, reread.submission?.submission.submissionFingerprint);
    assert.equal(close.closeRecord.closeFingerprint, reread.close?.closeRecord.closeFingerprint);
    assert.equal(frozen.freezeFingerprint, reread.frozen?.frozenPool.freezeFingerprint);
    assert.equal(evidence.poolFingerprint, reread.evidence?.evidence.poolFingerprint);
    assert.equal(disclosure.disclosureId, reread.disclosure?.disclosureId);
    assert.equal(reread.batch?.state, "FROZEN");
    assert.doesNotMatch(JSON.stringify(reread.assignment?.packet), /answerKey|groundTruth|judgeResult/iu);

    const columns = await activePool().query<{ readonly column_name: string }>(
      `SELECT column_name FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name IN ('reviewer_accounts', 'reviewer_auth_identities', 'reviewer_auth_audit_events',
            'qualification_attempts', 'review_submissions', 'rejected_submission_attempts')`,
    );
    assert.equal(columns.rows.some(({ column_name }) => /token|cookie|password|jwt|email|raw_payload/iu.test(column_name)), false);
  });

  test("advisory and row locks serialize attempt, assignment, submission, close, withdrawal, and freeze races", async () => {
    const receiptRace = await makeSetup(activeRepository(), "pg-receipt-race");
    const receiptAttemptId = receiptRace.qualificationAttemptIds[0]!;
    const receiptResults = await Promise.all([
      receiptRace.service.issueQualificationReceipt({ reviewerId: "reviewer-a", attemptId: receiptAttemptId }),
      receiptRace.service.issueQualificationReceipt({ reviewerId: "reviewer-a", attemptId: receiptAttemptId }),
    ]);
    assert.equal(new Set(receiptResults.map((result) => result.receiptFingerprint)).size, 1);
    const receiptRows = await activePool().query<{ readonly count: string }>(
      "SELECT COUNT(*)::text AS count FROM qualification_receipts WHERE attempt_id = $1",
      [receiptAttemptId],
    );
    assert.equal(receiptRows.rows[0]?.count, "1");

    const attempts = await makeSetup(activeRepository(), "pg-attempt-race");
    const attemptOutcomes = await Promise.all(Array.from({ length: 4 }, async () => {
      try {
        return await attempts.service.createQualificationAttempt({
          reviewerId: "reviewer-a",
          qualificationId: "community-review-gate-pg-attempt-race",
          qualificationVersion: "0.1.0",
          poolId: "community-review-pool-pg-attempt-race",
          poolVersion: "0.1.0",
          instrumentFingerprint: instrument().fingerprint,
          reviewLocale: "en",
        });
      } catch (error) {
        return error;
      }
    }));
    assert.equal(attemptOutcomes.filter((value) => typeof value !== "object" || value === null || !("attemptId" in value)).length, 2);

    const assignmentOutcomes = await Promise.all(Array.from({ length: 6 }, () =>
      attempts.service.assignReviewer({ batchId: attempts.batchId, reviewerId: "reviewer-a" })));
    assert.equal(new Set(assignmentOutcomes.map((value) => value.assignment.assignmentId)).size, 1);

    const submitClose = await makeSetup(activeRepository(), "pg-submit-close-race", ["reviewer-a", "reviewer-b"]);
    await submitClose.service.submitReview({
      batchId: submitClose.batchId,
      assignmentId: submitClose.assignments[1]!.assignmentId,
      reviewerId: submitClose.assignments[1]!.reviewerId,
      annotations: reviewAnnotations(submitClose.packets[1]!),
    });
    const raceAssignment = submitClose.assignments[0]!;
    const racePacket = submitClose.packets[0]!;
    const raceResults = await Promise.allSettled([
      submitClose.service.submitReview({
        batchId: submitClose.batchId,
        assignmentId: raceAssignment.assignmentId,
        reviewerId: raceAssignment.reviewerId,
        annotations: reviewAnnotations(racePacket),
      }),
      submitClose.service.closeBatch(submitClose.batchId),
    ]);
    assert.equal(raceResults[1]!.status, "fulfilled");
    const raceState = await activeRepository().transaction((transaction) => ({
      batch: transaction.getBatch(submitClose.batchId),
      submissions: transaction.listAcceptedSubmissions(submitClose.batchId),
    }));
    assert.equal(raceState.batch?.state, "CLOSED");
    assert.ok(raceState.submissions.length <= 1);

    const withdrawal = await makeSetup(activeRepository(), "pg-withdraw-submit-race");
    const withdrawalAssignment = withdrawal.assignments[0]!;
    const withdrawalPacket = withdrawal.packets[0]!;
    const withdrawalResults = await Promise.allSettled([
      withdrawal.service.submitReview({
        batchId: withdrawal.batchId,
        assignmentId: withdrawalAssignment.assignmentId,
        reviewerId: withdrawalAssignment.reviewerId,
        annotations: reviewAnnotations(withdrawalPacket),
      }),
      withdrawal.service.withdrawAssignment({
        batchId: withdrawal.batchId,
        assignmentId: withdrawalAssignment.assignmentId,
        reviewerId: withdrawalAssignment.reviewerId,
      }),
    ]);
    assert.equal(withdrawalResults.filter((result) => result.status === "fulfilled").length, 1);
    const withdrawalState = await activeRepository().transaction((transaction) => ({
      assignment: transaction.getAssignment(withdrawalAssignment.assignmentId),
      submission: transaction.getAcceptedSubmissionByAssignment(withdrawalAssignment.assignmentId),
    }));
    assert.equal(withdrawalState.submission === undefined, withdrawalState.assignment?.assignment.assignmentState === "withdrawn");

    const double = await makeSetup(activeRepository(), "pg-double-close-freeze");
    await completeAndFreeze(double);
    const closeResults = await Promise.all([
      double.service.closeBatch(double.batchId),
      double.service.closeBatch(double.batchId),
    ]);
    const freezeResults = await Promise.all([
      double.service.freezeBatch(double.batchId),
      double.service.freezeBatch(double.batchId),
    ]);
    assert.equal(closeResults[0]!.closeRecord.closeFingerprint, closeResults[1]!.closeRecord.closeFingerprint);
    assert.equal(freezeResults[0]!.freezeFingerprint, freezeResults[1]!.freezeFingerprint);
  });

  test("the PostgreSQL adapter and in-memory adapter produce the same typed account/consent projection", async () => {
    const reviewerId = "pg-parity-reviewer";
    const account = {
      internalId: "pg-parity-internal",
      reviewerId,
      privateAuthSubjectReference: "pg-parity-private-reference",
      consentVersion: "1.0.0",
    };
    let memoryAudit = 0;
    let memoryConsent = 0;
    let pgAudit = 0;
    let pgConsent = 0;
    const memoryRepository = new InMemoryCommunityReviewRepository();
    const memoryService = new CommunityReviewService(memoryRepository, {
      clock: () => "2026-09-06T03:00:00.000Z",
      auditEventIdGenerator: () => `parity-memory-audit-${++memoryAudit}`,
      consentEventIdGenerator: () => `parity-memory-consent-${++memoryConsent}`,
    });
    const pgService = new CommunityReviewService(activeRepository(), {
      clock: () => "2026-09-06T03:00:00.000Z",
      auditEventIdGenerator: () => `parity-pg-audit-${++pgAudit}`,
      consentEventIdGenerator: () => `parity-pg-consent-${++pgConsent}`,
    });
    await memoryService.registerReviewerAccount(account);
    await pgService.registerReviewerAccount(account);
    await memoryService.recordConsent({ reviewerId });
    await pgService.recordConsent({ reviewerId });
    const memoryProjection = memoryRepository.snapshot();
    const pgProjection = await activeRepository().transaction((transaction) => ({
      accounts: transaction.getReviewerAccountByReviewerId(reviewerId),
      consents: transaction.listReviewerConsentHistory("pg-parity-internal", "community-review", "1.0.0"),
      audits: transaction.listAuthAuditEvents("pg-parity-internal"),
    }));
    assert.equal(pgProjection.accounts?.reviewerId, memoryProjection.reviewerAccounts[0]?.reviewerId);
    assert.equal(pgProjection.accounts?.consentState, memoryProjection.reviewerAccounts[0]?.consentState);
    assert.equal(pgProjection.consents.length, memoryProjection.reviewerConsents.length);
    assert.equal(pgProjection.audits.length, memoryProjection.authAuditEvents.length);
    assert.equal(pgProjection.consents[0]?.state, "ACCEPTED");
  });
});

void postgresSuite;
