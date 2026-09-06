import assert from "node:assert/strict";
import { test } from "node:test";

import {
  BenchmarkConfigurationError,
  parseCommunityReviewVisibleTask,
} from "../../../src/contracts/index.js";
import {
  buildCommunityReviewInstrumentIdentity,
  buildCommunityReviewQualificationReceipt,
  buildCommunityReviewSubmission,
  closeCommunityReviewBatch,
  communityReviewAtomicIdentityKey,
  communityReviewFingerprint,
  createCommunityReviewBatch,
  freezeCommunityReviewPool,
} from "../../../src/community-review/index.js";
import type {
  CommunityReviewAnnotation,
  CommunityReviewAssignment,
  CommunityReviewBatchPurpose,
  CommunityReviewQualificationEligibility,
  CommunityReviewQualificationReceipt,
  CommunityReviewReviewerPacket,
  CommunityReviewVisibleTask,
} from "../../../src/contracts/community-review.js";
import {
  CommunityReviewService,
  CommunityReviewServiceError,
  InMemoryCommunityReviewRepository,
  InMemoryQualificationMaterialStore,
  InMemoryReviewBatchMaterialStore,
  QUALIFICATION_PASS_RULE_ID,
  qualificationDefinitionFingerprint,
} from "../src/index.js";
import type {
  QualificationPrivateAnswer,
  QualificationVisibleItem,
} from "../src/index.js";

const syntheticFixture = {
  synthetic: true as const,
  notHumanCalibrationData: true as const,
  notCommunityReviewEvidence: true as const,
};

const tasks: CommunityReviewVisibleTask[] = [
  parseCommunityReviewVisibleTask({
    caseId: "case-alpha",
    learningObjective: "Compare a tutor reply with visible learner needs.",
    studentProfile: "Synthetic learner at introductory level.",
    conversationHistory: "No earlier turns.",
    studentMessage: "Explain the next step.",
    problemContext: "A short synthetic practice problem.",
    rubrics: [{
      id: "reply-quality",
      criterion: "The reply should support the learner's next step.",
      requirements: [
        { id: "req-clarity", description: "The reply is clear enough to follow." },
        { id: "req-action", description: "The reply gives a useful next action." },
      ],
    }],
    tutorResponse: "The tutor offers a concise next step and a check.",
  }),
  parseCommunityReviewVisibleTask({
    caseId: "case-beta",
    learningObjective: "Compare a tutor reply with visible learner needs.",
    studentProfile: "Synthetic learner at introductory level.",
    conversationHistory: "No earlier turns.",
    studentMessage: "Explain the next step.",
    problemContext: "A short synthetic practice problem.",
    rubrics: [{
      id: "reply-quality",
      criterion: "The reply should support the learner's next step.",
      requirements: [
        { id: "req-clarity", description: "The reply is clear enough to follow." },
        { id: "req-action", description: "The reply gives a useful next action." },
      ],
    }],
    tutorResponse: "The tutor explains one step and invites a quick check.",
  }),
];

const guideFingerprint = communityReviewFingerprint({
  guideText: "Synthetic Community Review service guide.",
});
function qualificationItems(suffix: string): QualificationVisibleItem[] {
  return [{
    caseId: `qualification-${suffix}`,
    rubricId: "qualification-rubric",
    requirementId: "qualification-eligibility",
    prompt: "Classify the synthetic qualification reply.",
  }];
}

function qualificationAnswers(suffix: string): QualificationPrivateAnswer[] {
  return qualificationItems(suffix).map((item) => ({
    caseId: item.caseId,
    rubricId: item.rubricId,
    requirementId: item.requirementId,
    status: "SATISFIED" as const,
  }));
}

function clock(): () => string {
  let tick = 0;
  const start = Date.parse("2026-09-06T00:00:00.000Z");
  return () => new Date(start + tick++ * 1000).toISOString();
}

function eligibility(
  suffix: string,
  reviewInstrument: ReturnType<typeof instrument>,
): CommunityReviewQualificationEligibility {
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

function instrument() {
  return buildCommunityReviewInstrumentIdentity({
    guideFingerprint,
    canonicalLocale: "en",
    reviewLocale: "en",
  });
}

function receipt(
  reviewerId: string,
  reviewInstrument: ReturnType<typeof instrument>,
  reviewEligibility: CommunityReviewQualificationEligibility,
): CommunityReviewQualificationReceipt {
  return buildCommunityReviewQualificationReceipt({
    dataKind: "synthetic-fixture",
    fixture: syntheticFixture,
    qualificationId: reviewEligibility.qualificationId,
    qualificationVersion: reviewEligibility.qualificationVersion,
    qualificationPoolId: reviewEligibility.qualificationPoolId,
    qualificationPoolVersion: reviewEligibility.qualificationPoolVersion,
    qualificationDefinitionFingerprint: reviewEligibility.qualificationDefinitionFingerprint,
    reviewerId,
    instrument: reviewInstrument,
  });
}

async function qualifyReviewer(
  service: CommunityReviewService,
  reviewerId: string,
  reviewInstrument: ReturnType<typeof instrument>,
  reviewEligibility: CommunityReviewQualificationEligibility,
): Promise<CommunityReviewQualificationReceipt> {
  const issue = await service.createQualificationAttempt({
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
    attemptId: issue.attemptId,
    attemptNonce: issue.attemptNonce,
    packetFingerprint: issue.packet.packetFingerprint,
    responses: issue.packet.items.map((item) => ({
      caseId: item.caseId,
      rubricId: item.rubricId,
      requirementId: item.requirementId,
      status: "SATISFIED" as const,
    })),
  });
  return (await service.issueQualificationReceipt({
    reviewerId,
    attemptId: issue.attemptId,
  })).receipt;
}

function annotations(
  packet: CommunityReviewReviewerPacket,
  disagreementKey?: string,
): CommunityReviewAnnotation[] {
  return packet.tasks.flatMap((task) => task.rubrics.flatMap((rubric) => rubric.requirements.map((requirement) => {
    const identity = {
      caseId: task.caseId,
      rubricId: rubric.id,
      requirementId: requirement.id,
    };
    return {
      ...identity,
      status: communityReviewAtomicIdentityKey(identity) === disagreementKey
        ? "OMITTED_OR_INCOMPLETE" as const
        : "SATISFIED" as const,
      evidence: `${packet.reviewerId} observed the visible reply.`,
    };
  })));
}

interface CommunityReviewServiceTestSetup {
  readonly repository: InMemoryCommunityReviewRepository;
  readonly materialStore: InMemoryReviewBatchMaterialStore;
  readonly service: CommunityReviewService;
  readonly batchId: string;
  readonly instrument: ReturnType<typeof instrument>;
  readonly eligibility: CommunityReviewQualificationEligibility;
  readonly sealed: ReturnType<typeof createCommunityReviewBatch>;
  readonly open: ReturnType<typeof createCommunityReviewBatch>;
  readonly assignments: readonly CommunityReviewAssignment[];
  readonly packets: readonly CommunityReviewReviewerPacket[];
  readonly receipts: readonly CommunityReviewQualificationReceipt[];
}

async function makeSetup(options: {
  readonly suffix?: string;
  readonly reviewers?: readonly string[];
  readonly batchPurpose?: CommunityReviewBatchPurpose;
} = {}): Promise<CommunityReviewServiceTestSetup> {
  const suffix = options.suffix ?? "main";
  const reviewers = options.reviewers ?? ["reviewer-a", "reviewer-b"];
  const reviewInstrument = instrument();
  const reviewEligibility = eligibility(suffix, reviewInstrument);
  const repository = new InMemoryCommunityReviewRepository();
  const qualificationMaterialStore = new InMemoryQualificationMaterialStore();
  const materialStore = new InMemoryReviewBatchMaterialStore();
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
      sealedDefinitionReference: `synthetic://qualification-definition/${suffix}`,
      privateAnswerKeyReference: `synthetic://qualification-answer-key/${suffix}`,
    },
    visibleMaterial: {
      passRuleId: QUALIFICATION_PASS_RULE_ID,
      items: qualificationItems(suffix),
    },
    privateAnswerKey: { answers: qualificationAnswers(suffix) },
  });
  const service = new CommunityReviewService(repository, {
    clock: clock(),
    qualificationMaterialStore,
    reviewBatchMaterialStore: materialStore,
  });
  for (const reviewerId of reviewers) {
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
    qualificationId: reviewEligibility.qualificationId,
    qualificationVersion: reviewEligibility.qualificationVersion,
    poolId: reviewEligibility.qualificationPoolId,
    poolVersion: reviewEligibility.qualificationPoolVersion,
    definitionFingerprint: reviewEligibility.qualificationDefinitionFingerprint,
    instrumentFingerprint: reviewInstrument.fingerprint,
    reviewLocale: reviewInstrument.reviewLocale,
    instrument: reviewInstrument,
    state: "DRAFT",
    sealedDefinitionReference: `synthetic://qualification-definition/${suffix}`,
    privateAnswerKeyReference: `synthetic://qualification-answer-key/${suffix}`,
  });
  await service.sealQualificationPool({
    poolId: reviewEligibility.qualificationPoolId,
    poolVersion: reviewEligibility.qualificationPoolVersion,
  });
  await service.activateQualificationPool({
    poolId: reviewEligibility.qualificationPoolId,
    poolVersion: reviewEligibility.qualificationPoolVersion,
  });
  const receipts: CommunityReviewQualificationReceipt[] = [];
  for (const reviewerId of reviewers) {
    receipts.push(await qualifyReviewer(service, reviewerId, reviewInstrument, reviewEligibility));
  }
  const batchId = `community-review-batch-${suffix}`;
  const sealed = createCommunityReviewBatch({
    batchId,
    instrument: reviewInstrument,
    qualificationEligibility: reviewEligibility,
    sealedSourceFingerprint: communityReviewFingerprint({ sealedSource: `synthetic-${suffix}` }),
    tasks,
    dataKind: "synthetic-fixture",
    fixture: syntheticFixture,
    batchPurpose: options.batchPurpose ?? "interpretable",
  });
  materialStore.register({
    manifest: sealed,
    sealedSourceReference: `synthetic://sealed-source/${suffix}`,
    tasks,
  });
  await service.createBatch({
    manifest: sealed,
    sealedSourceReference: `synthetic://sealed-source/${suffix}`,
  });
  const openedRecord = await service.openBatch(batchId);
  const opened = openedRecord.manifest;
  const results = await Promise.all(reviewers.map((reviewerId) => service.assignReviewer({
    batchId,
    reviewerId,
  })));
  return {
    repository,
    materialStore,
    service,
    batchId,
    instrument: reviewInstrument,
    eligibility: reviewEligibility,
    sealed,
    open: opened,
    assignments: results.map((result) => result.assignment),
    packets: results.map((result) => result.packet),
    receipts,
  };
}

function serviceError(code: CommunityReviewServiceError["code"]): (error: unknown) => boolean {
  return (error: unknown): boolean => error instanceof CommunityReviewServiceError && error.code === code;
}

function p3Invalid(error: unknown): boolean {
  return error instanceof BenchmarkConfigurationError && error.code === "community_review_invalid";
}

test("P4-A persists typed P3 records and preserves fingerprints through a round trip", async () => {
  const setup = await makeSetup();
  const firstAssignment = setup.assignments[0]!;
  const firstPacket = setup.packets[0]!;
  const firstReceipt = setup.receipts[0]!;
  const roundTrip = await setup.repository.transaction((transaction) => ({
    batch: transaction.getBatch(setup.batchId),
    source: transaction.getSealedBatchPayloadReference(setup.batchId),
    assignment: transaction.getAssignment(firstAssignment.assignmentId),
    receipt: transaction.getQualificationReceipt(firstReceipt.receiptFingerprint),
  }));
  assert.equal(roundTrip.batch?.manifest.batchFingerprint, setup.sealed.batchFingerprint);
  assert.equal(roundTrip.source?.visibleTaskSetFingerprint, setup.sealed.visibleTaskSetFingerprint);
  assert.equal(roundTrip.assignment?.packet.packetFingerprint, firstPacket.packetFingerprint);
  assert.equal(roundTrip.receipt?.receiptFingerprint, firstReceipt.receiptFingerprint);
  assert.deepEqual(
    JSON.parse(JSON.stringify(roundTrip.assignment?.packet)),
    firstPacket,
  );
  assert.doesNotMatch(JSON.stringify(roundTrip.assignment?.packet), /groundTruth|knownMisconception|answerKey|judgeResult/iu);
});

test("same reviewer assignment is serialized and idempotent while duplicate storage is rejected", async () => {
  const setup = await makeSetup();
  const result = await Promise.all([
    setup.service.assignReviewer({
      batchId: setup.batchId,
      reviewerId: "reviewer-a",
    }),
    setup.service.assignReviewer({
      batchId: setup.batchId,
      reviewerId: "reviewer-a",
    }),
  ]);
  assert.equal(result[0]!.assignment.assignmentId, result[1]!.assignment.assignmentId);
  await assert.rejects(
    setup.repository.transaction((transaction) => transaction.insertAssignment({
      assignment: result[0]!.assignment,
      packet: result[0]!.packet,
      assignedAt: "2026-09-06T00:02:00.000Z",
      updatedAt: "2026-09-06T00:02:00.000Z",
    })),
    serviceError("repository_conflict"),
  );
});

test("simultaneous submissions have one accepted row and conflicting replacement is rejected", async () => {
  const setup = await makeSetup();
  const packet = setup.packets[0]!;
  const input = {
    batchId: setup.batchId,
    assignmentId: setup.assignments[0]!.assignmentId,
    reviewerId: "reviewer-a",
    annotations: annotations(packet),
  } as const;
  const submissions = await Promise.all([
    setup.service.submitReview(input),
    setup.service.submitReview(input),
  ]);
  assert.equal(submissions[0]!.submissionFingerprint, submissions[1]!.submissionFingerprint);
  const stored = await setup.repository.transaction((transaction) => transaction.listAcceptedSubmissions(setup.batchId));
  assert.equal(stored.length, 1);
  await assert.rejects(
    setup.service.submitReview({
      ...input,
      annotations: annotations(packet, communityReviewAtomicIdentityKey({
        caseId: "case-alpha",
        rubricId: "reply-quality",
        requirementId: "req-action",
      })),
    }),
    serviceError("replacement_submission"),
  );
  const afterReplacement = await setup.repository.transaction((transaction) => transaction.listAcceptedSubmissions(setup.batchId));
  assert.equal(afterReplacement.length, 1);
  assert.equal(afterReplacement[0]!.submission.submissionFingerprint, submissions[0]!.submissionFingerprint);
});

test("wrong owner, cross-assignment, and cross-batch replay are rejected", async () => {
  const setup = await makeSetup();
  const packet = setup.packets[0]!;
  await assert.rejects(
    setup.service.getReviewerPacket({ assignmentId: setup.assignments[0]!.assignmentId, reviewerId: "reviewer-b" }),
    serviceError("reviewer_not_authorized"),
  );
  await assert.rejects(
    setup.service.submitReview({
      batchId: setup.batchId,
      assignmentId: setup.assignments[1]!.assignmentId,
      reviewerId: "reviewer-a",
      annotations: annotations(packet),
    }),
    serviceError("reviewer_not_authorized"),
  );
  const otherSealed = createCommunityReviewBatch({
    batchId: "community-review-batch-cross-replay",
    instrument: setup.instrument,
    qualificationEligibility: setup.eligibility,
    sealedSourceFingerprint: communityReviewFingerprint({ sealedSource: "synthetic-cross-replay" }),
    tasks,
    dataKind: "synthetic-fixture",
    fixture: syntheticFixture,
    batchPurpose: "pilot",
  });
  await setup.service.createBatch({
    manifest: otherSealed,
    sealedSourceReference: "synthetic://sealed-source/cross-replay",
  });
  setup.materialStore.register({
    manifest: otherSealed,
    sealedSourceReference: "synthetic://sealed-source/cross-replay",
    tasks,
  });
  await setup.service.openBatch(otherSealed.batchId);
  await setup.service.assignReviewer({
    batchId: otherSealed.batchId,
    reviewerId: "reviewer-a",
  });
  await assert.rejects(
    setup.service.submitReview({
      batchId: otherSealed.batchId,
      assignmentId: setup.assignments[0]!.assignmentId,
      reviewerId: "reviewer-a",
      annotations: annotations(packet),
    }),
    serviceError("reviewer_not_authorized"),
  );
});

test("an unregistered but valid P3 receipt cannot become authoritative", async () => {
  const setup = await makeSetup();
  await setup.service.registerReviewerAccount({
    internalId: "internal-reviewer-c",
    reviewerId: "reviewer-c",
    privateAuthSubjectReference: "synthetic-auth-reviewer-c",
    consentVersion: "1.0.0",
  });
  await setup.service.recordConsent({ reviewerId: "reviewer-c" });
  const unregistered = receipt("reviewer-c", setup.instrument, setup.eligibility);
  await assert.rejects(
    setup.service.registerAuthoritativeQualificationReceipt({
      attemptId: "missing-unregistered-attempt",
      receipt: unregistered,
    }),
    serviceError("qualification_attempt_not_found"),
  );
  assert.doesNotThrow(() => buildCommunityReviewSubmission(
    setup.packets[0]!,
    annotations(setup.packets[0]!),
  ));
  await assert.rejects(
    setup.service.assignReviewer({
      batchId: setup.batchId,
      reviewerId: "reviewer-c",
    }),
    serviceError("qualification_receipt_not_authoritative"),
  );
});

test("failed P3 validation rolls back without accepting a partial submission", async () => {
  const setup = await makeSetup();
  await assert.rejects(
    setup.service.submitReview({
      batchId: setup.batchId,
      assignmentId: setup.assignments[0]!.assignmentId,
      reviewerId: "reviewer-a",
      annotations: annotations(setup.packets[0]!).slice(1),
    }),
    p3Invalid,
  );
  const stored = await setup.repository.transaction((transaction) => transaction.listAcceptedSubmissions(setup.batchId));
  assert.deepEqual(stored, []);
});

test("close and freeze persist exact P3 outputs and are idempotent", async () => {
  const setup = await makeSetup();
  const expectedSubmissions = setup.packets.map((packet) => buildCommunityReviewSubmission(packet, annotations(packet)));
  for (const [index, submission] of expectedSubmissions.entries()) {
    await setup.service.submitReview({
      batchId: setup.batchId,
      assignmentId: setup.assignments[index]!.assignmentId,
      reviewerId: setup.assignments[index]!.reviewerId,
      annotations: submission.annotations,
    });
  }
  const expectedClose = closeCommunityReviewBatch(setup.open, setup.assignments, expectedSubmissions);
  const actualClose = await setup.service.closeBatch(setup.batchId);
  assert.deepEqual(actualClose.manifest, expectedClose.manifest);
  assert.deepEqual(actualClose.closeRecord, expectedClose.closeRecord);
  assert.deepEqual(actualClose.acceptedSubmissions, expectedClose.acceptedSubmissions);
  assert.deepEqual(await setup.service.closeBatch(setup.batchId), actualClose);
  await assert.rejects(
    setup.service.submitReview({
      batchId: setup.batchId,
      assignmentId: setup.assignments[0]!.assignmentId,
      reviewerId: "reviewer-a",
      annotations: annotations(setup.packets[0]!),
    }),
    serviceError("batch_not_open"),
  );

  const expectedPool = freezeCommunityReviewPool(expectedClose);
  const actualPool = await setup.service.freezeBatch(setup.batchId);
  assert.deepEqual(actualPool, expectedPool);
  assert.deepEqual(await setup.service.freezeBatch(setup.batchId), actualPool);
  assert.deepEqual(await setup.service.closeBatch(setup.batchId), actualClose);
  const persisted = await setup.repository.transaction((transaction) => ({
    batch: transaction.getBatch(setup.batchId),
    close: transaction.getBatchCloseRecord(setup.batchId),
    pool: transaction.getFrozenReviewPool(setup.batchId),
  }));
  assert.equal(persisted.batch?.state, "FROZEN");
  assert.equal(persisted.close?.closeRecord.closeFingerprint, expectedClose.closeRecord.closeFingerprint);
  assert.equal(persisted.pool?.frozenPool.freezeFingerprint, expectedPool.freezeFingerprint);
  await assert.rejects(
    setup.service.submitReview({
      batchId: setup.batchId,
      assignmentId: setup.assignments[0]!.assignmentId,
      reviewerId: "reviewer-a",
      annotations: annotations(setup.packets[0]!),
    }),
    serviceError("batch_not_open"),
  );
});

test("submission and close race is ordered by the batch transaction", async () => {
  const closeFirst = await makeSetup({ suffix: "close-first", batchPurpose: "pilot" });
  await closeFirst.service.submitReview({
    batchId: closeFirst.batchId,
    assignmentId: closeFirst.assignments[1]!.assignmentId,
    reviewerId: "reviewer-b",
    annotations: annotations(closeFirst.packets[1]!),
  });
  const closeFirstResults = await Promise.allSettled([
    closeFirst.service.closeBatch(closeFirst.batchId),
    closeFirst.service.submitReview({
      batchId: closeFirst.batchId,
      assignmentId: closeFirst.assignments[0]!.assignmentId,
      reviewerId: "reviewer-a",
      annotations: annotations(closeFirst.packets[0]!),
    }),
  ]);
  assert.equal(closeFirstResults[0]!.status, "fulfilled");
  assert.equal(closeFirstResults[1]!.status, "rejected");
  const closeFirstStored = await closeFirst.repository.transaction((transaction) => ({
    batch: transaction.getBatch(closeFirst.batchId),
    submissions: transaction.listAcceptedSubmissions(closeFirst.batchId),
  }));
  assert.equal(closeFirstStored.batch?.state, "CLOSED");
  assert.equal(closeFirstStored.submissions.length, 1);

  const submitFirst = await makeSetup({ suffix: "submit-first", batchPurpose: "pilot" });
  await submitFirst.service.submitReview({
    batchId: submitFirst.batchId,
    assignmentId: submitFirst.assignments[1]!.assignmentId,
    reviewerId: "reviewer-b",
    annotations: annotations(submitFirst.packets[1]!),
  });
  const submitFirstResults = await Promise.all([
    submitFirst.service.submitReview({
      batchId: submitFirst.batchId,
      assignmentId: submitFirst.assignments[0]!.assignmentId,
      reviewerId: "reviewer-a",
      annotations: annotations(submitFirst.packets[0]!),
    }),
    submitFirst.service.closeBatch(submitFirst.batchId),
  ]);
  assert.equal(submitFirstResults[0].submissionDisposition, "accepted-before-close");
  assert.equal(submitFirstResults[1].manifest.state, "CLOSED");
  const submitFirstStored = await submitFirst.repository.transaction((transaction) => transaction.listAcceptedSubmissions(submitFirst.batchId));
  assert.equal(submitFirstStored.length, 2);
});

test("withdrawal and packet retrieval retain the blindness firewall", async () => {
  const setup = await makeSetup({ suffix: "withdrawal", batchPurpose: "pilot" });
  const packet = await setup.service.getReviewerPacket({
    assignmentId: setup.assignments[0]!.assignmentId,
    reviewerId: "reviewer-a",
  });
  assert.deepEqual(
    await setup.service.getReviewerPacket({
      assignmentId: setup.assignments[0]!.assignmentId,
      reviewerId: "reviewer-a",
    }),
    packet,
  );
  assert.equal(packet.packetFingerprint, setup.packets[0]!.packetFingerprint);
  assert.doesNotMatch(JSON.stringify(packet), /groundTruth|knownMisconception|expectedStatus|reference|consensus|adjudication|judge|otherReviewer|answerKey/iu);
  await assert.rejects(
    setup.service.withdrawAssignment({
      batchId: setup.batchId,
      assignmentId: setup.assignments[1]!.assignmentId,
      reviewerId: "reviewer-a",
    }),
    serviceError("reviewer_not_authorized"),
  );
  const withdrawn = await setup.service.withdrawAssignment({
    batchId: setup.batchId,
    assignmentId: setup.assignments[0]!.assignmentId,
    reviewerId: "reviewer-a",
  });
  assert.equal(withdrawn.assignmentState, "withdrawn");
  assert.deepEqual(await setup.service.withdrawAssignment({
    batchId: setup.batchId,
    assignmentId: setup.assignments[0]!.assignmentId,
    reviewerId: "reviewer-a",
  }), withdrawn);
  await assert.rejects(
    setup.service.getReviewerPacket({
      assignmentId: setup.assignments[0]!.assignmentId,
      reviewerId: "reviewer-a",
    }),
    serviceError("assignment_withdrawn"),
  );
  await setup.service.submitReview({
    batchId: setup.batchId,
    assignmentId: setup.assignments[1]!.assignmentId,
    reviewerId: "reviewer-b",
    annotations: annotations(setup.packets[1]!),
  });
  const close = await setup.service.closeBatch(setup.batchId);
  assert.equal(close.closeRecord.coverage.coverageStatus, "incomplete");
  assert.equal(close.closeRecord.coverage.withdrawnAssignmentCount, 1);
  const deliveryAudit = await setup.repository.transaction((transaction) =>
    transaction.listReviewDeliveryAuditEvents(setup.batchId));
  assert.ok(deliveryAudit.some((event) => event.eventType === "assignment_issued"));
  assert.ok(deliveryAudit.some((event) => event.eventType === "assignment_retrieved"));
  assert.ok(deliveryAudit.some((event) => event.eventType === "assignment_withdrawn"));
  assert.doesNotMatch(JSON.stringify(deliveryAudit), /groundTruth|answerKey|sealedSourceReference|tutorResponse/iu);
});

test("repository uniqueness covers nonce replay and duplicate accepted submissions", async () => {
  const setup = await makeSetup();
  const duplicateNonce = await assert.rejects(
    setup.repository.transaction((transaction) => transaction.insertQualificationAttempt({
      attemptId: "attempt-duplicate-nonce",
      reviewerId: "reviewer-a",
      poolId: setup.eligibility.qualificationPoolId,
      poolVersion: setup.eligibility.qualificationPoolVersion,
      nonceHash: "synthetic-nonce-reviewer-a-main",
      state: "QUALIFIED",
      result: "qualified",
      startedAt: "2026-09-06T00:00:00.000Z",
      submittedAt: "2026-09-06T00:01:00.000Z",
    })),
    serviceError("repository_conflict"),
  );
  assert.equal(duplicateNonce, undefined);

  const submission = await setup.service.submitReview({
    batchId: setup.batchId,
    assignmentId: setup.assignments[0]!.assignmentId,
    reviewerId: "reviewer-a",
    annotations: annotations(setup.packets[0]!),
  });
  await assert.rejects(
    setup.repository.transaction((transaction) => transaction.insertAcceptedSubmission({
      submission,
      acceptedAt: "2026-09-06T00:03:00.000Z",
    })),
    serviceError("repository_conflict"),
  );

  const duplicateReceipt = setup.receipts[0]!;
  const duplicateReceiptAttempt = await setup.repository.transaction((transaction) =>
    transaction.listQualificationAttempts(
      duplicateReceipt.reviewerId,
      duplicateReceipt.qualificationPoolId,
      duplicateReceipt.qualificationPoolVersion,
    )[0]);
  assert.ok(duplicateReceiptAttempt);
  await assert.rejects(
    setup.repository.transaction((transaction) => transaction.insertQualificationReceipt({
      receiptFingerprint: duplicateReceipt.receiptFingerprint,
      attemptId: duplicateReceiptAttempt.attemptId,
      reviewerId: duplicateReceipt.reviewerId,
      poolId: duplicateReceipt.qualificationPoolId,
      poolVersion: duplicateReceipt.qualificationPoolVersion,
      receipt: duplicateReceipt,
      authorityState: "authoritative",
      issuedAt: "2026-09-06T00:04:00.000Z",
    })),
    serviceError("repository_conflict"),
  );
});

test("P4-D chooses the oldest eligible OPEN batch and keeps retries packet-stable", async () => {
  const setup = await makeSetup({ batchPurpose: "pilot" });
  await setup.service.submitReview({
    batchId: setup.batchId,
    assignmentId: setup.assignments[0]!.assignmentId,
    reviewerId: "reviewer-a",
    annotations: annotations(setup.packets[0]!),
  });
  await setup.service.closeBatch(setup.batchId);
  await setup.service.registerReviewerAccount({
    internalId: "internal-reviewer-c",
    reviewerId: "reviewer-c",
    privateAuthSubjectReference: "synthetic-auth-reviewer-c",
    consentVersion: "1.0.0",
  });
  await setup.service.recordConsent({ reviewerId: "reviewer-c" });
  await qualifyReviewer(setup.service, "reviewer-c", setup.instrument, setup.eligibility);

  const createOpenBatch = async (suffix: string): Promise<string> => {
    const sealed = createCommunityReviewBatch({
      batchId: `community-review-selection-${suffix}`,
      instrument: setup.instrument,
      qualificationEligibility: setup.eligibility,
      sealedSourceFingerprint: communityReviewFingerprint({ sealedSource: `selection-${suffix}` }),
      tasks,
      dataKind: "synthetic-fixture",
      fixture: syntheticFixture,
      batchPurpose: "pilot",
    });
    const sealedSourceReference = `synthetic://sealed-source/selection-${suffix}`;
    setup.materialStore.register({ manifest: sealed, sealedSourceReference, tasks });
    await setup.service.createBatch({ manifest: sealed, sealedSourceReference });
    await setup.service.openBatch(sealed.batchId);
    return sealed.batchId;
  };

  const firstBatchId = await createOpenBatch("first");
  const secondBatchId = await createOpenBatch("second");
  const first = await setup.service.getOrCreateOwnEligibleAssignment({ reviewerId: "reviewer-c" });
  assert.equal(first.assignment.batchId, firstBatchId);
  const retry = await setup.service.getOrCreateOwnEligibleAssignment({ reviewerId: "reviewer-c" });
  assert.deepEqual(retry, first);

  await setup.service.submitReview({
    batchId: firstBatchId,
    assignmentId: first.assignment.assignmentId,
    reviewerId: "reviewer-c",
    annotations: annotations(first.packet),
  });
  await setup.service.closeBatch(firstBatchId);
  const next = await setup.service.getOrCreateOwnEligibleAssignment({ reviewerId: "reviewer-c" });
  assert.equal(next.assignment.batchId, secondBatchId);
});

test("P4-D fails closed when the private material store returns a mismatched task set", async () => {
  const setup = await makeSetup({ batchPurpose: "pilot" });
  const sealed = createCommunityReviewBatch({
    batchId: "community-review-material-mismatch",
    instrument: setup.instrument,
    qualificationEligibility: setup.eligibility,
    sealedSourceFingerprint: communityReviewFingerprint({ sealedSource: "material-mismatch" }),
    tasks,
    dataKind: "synthetic-fixture",
    fixture: syntheticFixture,
    batchPurpose: "pilot",
  });
  const sealedSourceReference = "synthetic://sealed-source/material-mismatch";
  setup.materialStore.register({ manifest: sealed, sealedSourceReference, tasks });
  await setup.service.createBatch({ manifest: sealed, sealedSourceReference });
  await setup.service.openBatch(sealed.batchId);

  const tamperedStore = {
    async loadVisibleTasksForBatch(): Promise<readonly CommunityReviewVisibleTask[]> {
      return tasks.map((task) => ({ ...task, tutorResponse: `${task.tutorResponse} tampered` }));
    },
  };
  const tamperedService = new CommunityReviewService(setup.repository, {
    clock: clock(),
    reviewBatchMaterialStore: tamperedStore,
  });
  await assert.rejects(
    tamperedService.assignReviewer({ batchId: sealed.batchId, reviewerId: "reviewer-a" }),
    serviceError("review_batch_material_invalid"),
  );
  const stored = await setup.repository.transaction((transaction) =>
    transaction.getAssignmentByBatchReviewer(sealed.batchId, "reviewer-a"));
  assert.equal(stored, undefined);
});

test("P4-D permits assignment only while the authoritative batch is OPEN", async () => {
  const setup = await makeSetup({ batchPurpose: "pilot" });
  const sealed = createCommunityReviewBatch({
    batchId: "community-review-state-gate",
    instrument: setup.instrument,
    qualificationEligibility: setup.eligibility,
    sealedSourceFingerprint: communityReviewFingerprint({ sealedSource: "state-gate" }),
    tasks,
    dataKind: "synthetic-fixture",
    fixture: syntheticFixture,
    batchPurpose: "pilot",
  });
  const sealedSourceReference = "synthetic://sealed-source/state-gate";
  setup.materialStore.register({ manifest: sealed, sealedSourceReference, tasks });
  await setup.service.createBatch({ manifest: sealed, sealedSourceReference });
  await assert.rejects(
    setup.service.assignReviewer({ batchId: sealed.batchId, reviewerId: "reviewer-a" }),
    serviceError("batch_not_open"),
  );

  await setup.service.openBatch(sealed.batchId);
  const assigned = await setup.service.assignReviewer({ batchId: sealed.batchId, reviewerId: "reviewer-a" });
  await setup.service.submitReview({
    batchId: sealed.batchId,
    assignmentId: assigned.assignment.assignmentId,
    reviewerId: "reviewer-a",
    annotations: annotations(assigned.packet),
  });
  await setup.service.closeBatch(sealed.batchId);
  assert.deepEqual(
    await setup.service.assignReviewer({ batchId: sealed.batchId, reviewerId: "reviewer-a" }),
    assigned,
  );
  await assert.rejects(
    setup.service.assignReviewer({ batchId: sealed.batchId, reviewerId: "reviewer-b" }),
    serviceError("batch_not_open"),
  );
  await setup.service.freezeBatch(sealed.batchId);
  await assert.rejects(
    setup.service.assignReviewer({ batchId: sealed.batchId, reviewerId: "reviewer-b" }),
    serviceError("batch_not_open"),
  );
});

test("P4-D assignment and batch close race has only ordered outcomes", async () => {
  const setup = await makeSetup({ suffix: "assignment-close-race", batchPurpose: "pilot" });
  await setup.service.submitReview({
    batchId: setup.batchId,
    assignmentId: setup.assignments[0]!.assignmentId,
    reviewerId: "reviewer-a",
    annotations: annotations(setup.packets[0]!),
  });
  await setup.service.registerReviewerAccount({
    internalId: "internal-reviewer-c-assignment-close-race",
    reviewerId: "reviewer-c",
    privateAuthSubjectReference: "synthetic-auth-reviewer-c-assignment-close-race",
    consentVersion: "1.0.0",
  });
  await setup.service.recordConsent({ reviewerId: "reviewer-c" });
  await qualifyReviewer(setup.service, "reviewer-c", setup.instrument, setup.eligibility);

  const results = await Promise.allSettled([
    setup.service.closeBatch(setup.batchId),
    setup.service.getOrCreateOwnEligibleAssignment({
      batchId: setup.batchId,
      reviewerId: "reviewer-c",
    }),
  ]);
  assert.equal(results[0]!.status, "fulfilled");
  const assignmentResult = results[1]!;
  if (assignmentResult.status === "fulfilled") {
    assert.equal(assignmentResult.value.assignment.reviewerId, "reviewer-c");
  } else {
    assert.equal(assignmentResult.reason.code, "batch_not_open");
  }
  const batch = await setup.repository.transaction((transaction) => transaction.getBatch(setup.batchId));
  assert.equal(batch?.state, "CLOSED");
});
