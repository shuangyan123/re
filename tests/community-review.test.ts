import assert from "node:assert/strict";
import { test } from "node:test";

import {
  BenchmarkConfigurationError,
  parseHumanReferenceAnnotationTask,
} from "../src/contracts/index.js";
import type {
  CommunityReviewAnnotation,
  CommunityReviewBatchCloseResult,
  CommunityReviewBatchPurpose,
  CommunityReviewInstrumentIdentity,
  CommunityReviewQualificationEligibility,
  CommunityReviewQualificationReceipt,
  CommunityReviewReviewerPacket,
  CommunityReviewVisibleTask,
} from "../src/community-review/index.js";
import {
  COMMUNITY_REVIEW_GUIDE_ID,
  COMMUNITY_REVIEW_GUIDE_VERSION,
  COMMUNITY_REVIEW_INSTRUMENT_ID,
  COMMUNITY_REVIEW_INSTRUMENT_VERSION,
  COMMUNITY_REVIEW_PROTOCOL_ID,
  COMMUNITY_REVIEW_PROTOCOL_VERSION,
  buildCommunityReviewAgreementEvidence,
  buildCommunityReviewAssignment,
  buildCommunityReviewInstrumentIdentity,
  buildCommunityReviewPublicEvidenceArtifact,
  buildCommunityReviewQualificationReceipt,
  buildCommunityReviewReviewerPacket,
  buildCommunityReviewSubmission,
  canonicalCommunityReviewJson,
  closeCommunityReviewBatch,
  communityReviewAtomicIdentityKey,
  communityReviewFingerprint,
  communityReviewSourceInstrumentFingerprint,
  communityReviewVisibleTaskSetFingerprint,
  createCommunityReviewBatch,
  freezeCommunityReviewPool,
  openCommunityReviewBatch,
  parseCommunityReviewBatchManifest,
  parseCommunityReviewPublicEvidenceArtifact,
  parseCommunityReviewQualificationReceipt,
  parseCommunityReviewSubmission,
  parseCommunityReviewVisibleTask,
  projectCommunityReviewVisibleTask,
  assertCommunityReviewSubmissionMatchesAssignment,
  withdrawCommunityReviewAssignment,
} from "../src/community-review/index.js";

const syntheticFixture = {
  synthetic: true as const,
  notHumanCalibrationData: true as const,
  notCommunityReviewEvidence: true as const,
};

function invalid(action: () => unknown): void {
  assert.throws(
    action,
    (error: unknown) => error instanceof BenchmarkConfigurationError &&
      error.code === "community_review_invalid",
  );
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function task(caseId: string, response = "The tutor offers a concise next step and a check."): CommunityReviewVisibleTask {
  return parseCommunityReviewVisibleTask({
    caseId,
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
    tutorResponse: response,
  });
}

const tasks = [task("case-alpha"), task("case-beta", "The tutor explains one step and invites a quick check.")];
const guideFingerprint = communityReviewFingerprint({ guideText: "Synthetic Community Review guide." });
const qualificationDefinitionFingerprint = communityReviewFingerprint({
  definition: "Synthetic qualification definition.",
});

function instrument(overrides: Partial<Parameters<typeof buildCommunityReviewInstrumentIdentity>[0]> = {}) {
  return buildCommunityReviewInstrumentIdentity({
    guideFingerprint,
    canonicalLocale: "en",
    reviewLocale: "en",
    ...overrides,
  });
}

function eligibility(suffix = "main"): CommunityReviewQualificationEligibility {
  return {
    qualificationProtocolId: "community-review-qualification",
    qualificationProtocolVersion: "0.1.0",
    qualificationId: `community-review-gate-${suffix}`,
    qualificationVersion: "0.1.0",
    qualificationPoolId: `community-review-pool-${suffix}`,
    qualificationPoolVersion: "0.1.0",
    qualificationDefinitionFingerprint: suffix === "main"
      ? qualificationDefinitionFingerprint
      : communityReviewFingerprint({ definition: `Synthetic qualification definition ${suffix}.` }),
  };
}

function receipt(
  reviewerId: string,
  reviewInstrument: CommunityReviewInstrumentIdentity,
  reviewEligibility: CommunityReviewQualificationEligibility = eligibility(),
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

function annotationValues(
  packet: CommunityReviewReviewerPacket,
  disagreementKey?: string,
): CommunityReviewAnnotation[] {
  return packet.tasks.flatMap((reviewTask) => reviewTask.rubrics.flatMap((rubric) =>
    rubric.requirements.map((requirement) => {
      const identity = {
        caseId: reviewTask.caseId,
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
    }),
  ));
}

interface ReviewSetup {
  readonly sealed: ReturnType<typeof createCommunityReviewBatch>;
  readonly open: ReturnType<typeof openCommunityReviewBatch>;
  readonly instrument: CommunityReviewInstrumentIdentity;
  readonly qualificationEligibility: CommunityReviewQualificationEligibility;
  readonly assignments: ReturnType<typeof buildCommunityReviewAssignment>[];
  readonly packets: CommunityReviewReviewerPacket[];
  readonly submissions: ReturnType<typeof buildCommunityReviewSubmission>[];
}

function makeSetup(options: {
  readonly batchPurpose?: CommunityReviewBatchPurpose;
  readonly eligibility?: CommunityReviewQualificationEligibility;
  readonly instrument?: CommunityReviewInstrumentIdentity;
  readonly reviewers?: readonly string[];
  readonly disagreementForReviewerB?: boolean;
} = {}): ReviewSetup {
  const reviewInstrument = options.instrument ?? instrument();
  const reviewEligibility = options.eligibility ?? eligibility();
  const sealed = createCommunityReviewBatch({
    batchId: "community-review-batch-synthetic",
    instrument: reviewInstrument,
    qualificationEligibility: reviewEligibility,
    sealedSourceFingerprint: communityReviewFingerprint({ sealedSource: "synthetic batch source" }),
    tasks,
    dataKind: "synthetic-fixture",
    fixture: syntheticFixture,
    batchPurpose: options.batchPurpose ?? "interpretable",
  });
  const open = openCommunityReviewBatch(sealed);
  const reviewers = options.reviewers ?? ["reviewer-a", "reviewer-b"];
  const assignments = reviewers.map((reviewerId) => buildCommunityReviewAssignment({
    manifest: open,
    reviewerId,
    qualificationReceipt: receipt(reviewerId, reviewInstrument, reviewEligibility),
    tasks,
  }));
  const packets = assignments.map((assignment) => buildCommunityReviewReviewerPacket(assignment, tasks));
  const disagreementKey = options.disagreementForReviewerB === true
    ? communityReviewAtomicIdentityKey({
        caseId: "case-alpha",
        rubricId: "reply-quality",
        requirementId: "req-action",
      })
    : undefined;
  const submissions = packets.map((packet) => buildCommunityReviewSubmission(
    packet,
    annotationValues(packet, packet.reviewerId === "reviewer-b" ? disagreementKey : undefined),
  ));
  return {
    sealed,
    open,
    instrument: reviewInstrument,
    qualificationEligibility: reviewEligibility,
    assignments,
    packets,
    submissions,
  };
}

test("P3 lifecycle creates sealed, blind, closed, and immutable synthetic evidence", () => {
  const setup = makeSetup();
  assert.equal(setup.sealed.state, "SEALED");
  assert.equal(setup.open.state, "OPEN");
  assert.equal(setup.open.blindnessMode, "sealed-until-close");
  assert.equal(setup.open.qualificationEligibility.qualificationId, "community-review-gate-main");

  const packet = setup.packets[0]!;
  assert.deepEqual(Object.keys(packet.tasks[0]!).sort(), [
    "caseId",
    "conversationHistory",
    "learningObjective",
    "problemContext",
    "rubrics",
    "studentMessage",
    "studentProfile",
    "tutorResponse",
  ].sort());
  const serializedPacket = JSON.stringify(packet);
  assert.doesNotMatch(serializedPacket, /groundTruth|knownMisconception|disclosurePolicy|expected|reference|consensus|adjudication|judge|otherReviewer|answerKey/iu);
  assert.doesNotMatch(JSON.stringify(setup.qualificationEligibility), /answer|response|status/iu);

  const closed = closeCommunityReviewBatch(setup.open, setup.assignments, setup.submissions);
  assert.equal(closed.manifest.state, "CLOSED");
  assert.equal(closed.closeRecord.state, "CLOSED");
  assert.equal(closed.manifest.closeRecordFingerprint, closed.closeRecord.closeFingerprint);
  invalid(() => openCommunityReviewBatch(closed.manifest));

  const pool = freezeCommunityReviewPool(closed);
  assert.equal(pool.state, "FROZEN");
  assert.equal(pool.qualificationEligibility.qualificationDefinitionFingerprint,
    setup.qualificationEligibility.qualificationDefinitionFingerprint);
  assert.ok(Object.isFrozen(pool));
  assert.ok(Object.isFrozen(pool.submissions));
  assert.ok(Object.isFrozen(pool.submissions[0]!.annotations));
  assert.doesNotMatch(JSON.stringify(pool), /groundTruth|knownMisconception|disclosurePolicy|expected|judge|adjudication/iu);

  const agreement = buildCommunityReviewAgreementEvidence(pool);
  assert.equal(agreement.comparableAtomicCount, 4);
  assert.equal(agreement.agreementCount, 4);
  assert.equal(agreement.disagreementCount, 0);
  assert.equal(agreement.pairwise.length, 1);
  assert.deepEqual(Object.keys(agreement.perRequirement).sort(), [
    "case-alpha|reply-quality|req-action",
    "case-alpha|reply-quality|req-clarity",
    "case-beta|reply-quality|req-action",
    "case-beta|reply-quality|req-clarity",
  ]);

  const publicArtifact = buildCommunityReviewPublicEvidenceArtifact(pool, {
    disclosureDate: "2026-09-06",
    disclosurePolicy: {
      publishReviewerIds: false,
      publishAtomicAnnotations: false,
      publishReviewerEvidence: false,
    },
  });
  assert.equal("publishedReviewerIds" in publicArtifact, false);
  assert.equal("publishedSubmissions" in publicArtifact, false);
  assert.equal(publicArtifact.agreement.disagreements.length, 0);
});

test("fingerprints are canonical and bind visible material, instrument, guide, and qualification definition", () => {
  assert.equal(
    canonicalCommunityReviewJson({ b: [2, 1], a: "stable" }),
    canonicalCommunityReviewJson({ a: "stable", b: [2, 1] }),
  );
  assert.equal(
    communityReviewFingerprint({ b: [2, 1], a: "stable" }),
    communityReviewFingerprint({ a: "stable", b: [2, 1] }),
  );
  assert.equal(
    communityReviewVisibleTaskSetFingerprint([...tasks].reverse()),
    communityReviewVisibleTaskSetFingerprint(tasks),
  );
  const changedTasks = clone(tasks) as unknown as Array<Record<string, unknown>>;
  changedTasks[0]!.tutorResponse = "A materially different synthetic reply.";
  assert.notEqual(communityReviewVisibleTaskSetFingerprint(changedTasks as unknown as CommunityReviewVisibleTask[]),
    communityReviewVisibleTaskSetFingerprint(tasks));

  const alternateInstrument = instrument({
    guideFingerprint: communityReviewFingerprint({ guideText: "Synthetic Community Review guide v2." }),
  });
  assert.notEqual(alternateInstrument.fingerprint, instrument().fingerprint);
  const main = makeSetup();
  const alternateQualification = makeSetup({ eligibility: eligibility("alternate") });
  assert.notEqual(main.sealed.batchFingerprint, alternateQualification.sealed.batchFingerprint);
  assert.notEqual(
    receipt("reviewer-a", main.instrument, eligibility("alternate")).receiptFingerprint,
    receipt("reviewer-a", main.instrument).receiptFingerprint,
  );
  assert.notEqual(
    buildCommunityReviewSubmission(
      main.packets[0]!,
      annotationValues(main.packets[0]!),
    ).submissionFingerprint,
    buildCommunityReviewSubmission(
      main.packets[0]!,
      annotationValues(main.packets[0]!, communityReviewAtomicIdentityKey({
        caseId: "case-beta",
        rubricId: "reply-quality",
        requirementId: "req-action",
      })),
    ).submissionFingerprint,
  );
});

test("qualification receipts are scoped to the exact protocol, pool, instrument, locale, and opaque reviewer", () => {
  const setup = makeSetup();
  const wrongDefinitionReceipt = receipt("reviewer-a", setup.instrument, eligibility("alternate"));
  invalid(() => buildCommunityReviewAssignment({
    manifest: setup.open,
    reviewerId: "reviewer-a",
    qualificationReceipt: wrongDefinitionReceipt,
    tasks,
  }));

  const otherQualification = makeSetup({ eligibility: eligibility("other") });
  invalid(() => assertCommunityReviewSubmissionMatchesAssignment(
    otherQualification.assignments[0]!,
    setup.submissions[0]!,
  ));

  invalid(() => buildCommunityReviewQualificationReceipt({
    dataKind: "synthetic-fixture",
    fixture: syntheticFixture,
    qualificationId: eligibility().qualificationId,
    qualificationVersion: "0.1.0",
    qualificationPoolId: eligibility().qualificationPoolId,
    qualificationPoolVersion: "0.1.0",
    qualificationDefinitionFingerprint,
    reviewerId: "reviewer@example.com",
    instrument: setup.instrument,
  }));
  assert.doesNotMatch(JSON.stringify(receipt("reviewer-a", setup.instrument)), /answer|expected|issuer|signature|privateKey/iu);
  invalid(() => parseCommunityReviewQualificationReceipt({
    schemaVersion: 1,
    resultKind: "human-reference-semantic-audit-qualification-result",
    auditProtocolId: "human-reference-semantic-audit",
    auditProtocolVersion: "0.2.1",
    reviewerId: "legacy-reviewer",
    qualificationId: "human-reference-semantic-audit-reviewer-comprehension",
    qualificationVersion: "0.1.1",
    qualificationBatchId: "public-fixture-batch",
    qualificationStatus: "qualified",
    expectedAssessments: [{ status: "SATISFIED" }],
  }));
});

test("qualification and cross-envelope bindings reject unqualified, wrong-owner, version-drifted, and cross-batch inputs", () => {
  const setup = makeSetup();
  invalid(() => buildCommunityReviewAssignment({
    manifest: setup.open,
    reviewerId: "reviewer-a",
    qualificationReceipt: receipt("reviewer-b", setup.instrument),
    tasks,
  }));
  const unqualifiedReceipt = clone(receipt("reviewer-a", setup.instrument)) as unknown as Record<string, unknown>;
  unqualifiedReceipt.qualificationStatus = "not_qualified";
  invalid(() => buildCommunityReviewAssignment({
    manifest: setup.open,
    reviewerId: "reviewer-a",
    qualificationReceipt: unqualifiedReceipt as unknown as CommunityReviewQualificationReceipt,
    tasks,
  }));
  const wrongInstrument = clone(setup.instrument) as unknown as Record<string, unknown>;
  wrongInstrument.instrumentVersion = "0.2.0";
  invalid(() => buildCommunityReviewQualificationReceipt({
    dataKind: "synthetic-fixture",
    fixture: syntheticFixture,
    qualificationId: eligibility().qualificationId,
    qualificationVersion: eligibility().qualificationVersion,
    qualificationPoolId: eligibility().qualificationPoolId,
    qualificationPoolVersion: eligibility().qualificationPoolVersion,
    qualificationDefinitionFingerprint,
    reviewerId: "reviewer-a",
    instrument: wrongInstrument as unknown as CommunityReviewInstrumentIdentity,
  }));
  const otherBatch = makeSetup({ eligibility: eligibility("other-batch") });
  invalid(() => closeCommunityReviewBatch(
    otherBatch.open,
    setup.assignments,
    setup.submissions,
  ));
  invalid(() => assertCommunityReviewSubmissionMatchesAssignment(
    setup.assignments[0]!,
    setup.submissions[1]!,
  ));
});

test("locale and localization identity are explicit and cannot be silently substituted", () => {
  const sourceInstrumentFingerprint = communityReviewSourceInstrumentFingerprint({
    protocolId: COMMUNITY_REVIEW_PROTOCOL_ID,
    protocolVersion: COMMUNITY_REVIEW_PROTOCOL_VERSION,
    instrumentId: COMMUNITY_REVIEW_INSTRUMENT_ID,
    instrumentVersion: COMMUNITY_REVIEW_INSTRUMENT_VERSION,
    guideId: COMMUNITY_REVIEW_GUIDE_ID,
    guideVersion: COMMUNITY_REVIEW_GUIDE_VERSION,
    guideFingerprint,
    canonicalLocale: "en",
  });
  const localizedTasks = tasks.map((reviewTask) => ({
    ...reviewTask,
    learningObjective: `${reviewTask.learningObjective} Chinese localization.`,
  }));
  const zhInstrument = instrument({
    reviewLocale: "zh-CN",
    localization: {
      localizationId: "community-review-localization-zh-cn",
      localizationVersion: "0.1.0",
      sourceLocale: "en",
      sourceInstrumentFingerprint,
      localizedTaskSetFingerprint: communityReviewVisibleTaskSetFingerprint(localizedTasks),
    },
  });
  assert.equal(zhInstrument.reviewLocale, "zh-CN");
  assert.equal(zhInstrument.localization?.sourceInstrumentFingerprint, sourceInstrumentFingerprint);
  invalid(() => buildCommunityReviewInstrumentIdentity({
    guideFingerprint,
    canonicalLocale: "en",
    reviewLocale: "zh-CN",
  }));
  invalid(() => buildCommunityReviewInstrumentIdentity({
    guideFingerprint,
    canonicalLocale: "en",
    reviewLocale: "zh-CN",
    localization: {
      localizationId: "community-review-localization-zh-cn",
      localizationVersion: "0.1.0",
      sourceLocale: "en",
      sourceInstrumentFingerprint: communityReviewFingerprint({ wrong: true }),
      localizedTaskSetFingerprint: communityReviewVisibleTaskSetFingerprint(localizedTasks),
    },
  }));
  const englishBatch = makeSetup();
  invalid(() => buildCommunityReviewAssignment({
    manifest: englishBatch.open,
    reviewerId: "reviewer-a",
    qualificationReceipt: receipt("reviewer-a", zhInstrument),
    tasks,
  }));
});

test("reviewer packets and submissions use positive allowlists and exact atomic ownership", () => {
  const setup = makeSetup();
  const packet = setup.packets[0]!;
  const validAnnotations = annotationValues(packet);
  assert.doesNotThrow(() => buildCommunityReviewSubmission(packet, validAnnotations));

  invalid(() => buildCommunityReviewSubmission(packet, validAnnotations.slice(1)));
  invalid(() => buildCommunityReviewSubmission(packet, [...validAnnotations, clone(validAnnotations[0]!) ]));
  invalid(() => buildCommunityReviewSubmission(packet, [
    ...validAnnotations,
    {
      caseId: "case-alpha",
      rubricId: "reply-quality",
      requirementId: "req-extra",
      status: "SATISFIED",
    },
  ]));
  const wrongOwner = clone(validAnnotations) as unknown as Array<Record<string, unknown>>;
  wrongOwner[0]!.caseId = "case-not-in-packet";
  invalid(() => buildCommunityReviewSubmission(packet, wrongOwner));
  const unsupportedStatus = clone(validAnnotations) as unknown as Array<Record<string, unknown>>;
  unsupportedStatus[0]!.status = "UNKNOWN";
  invalid(() => buildCommunityReviewSubmission(packet, unsupportedStatus));
  const oversizedEvidence = clone(validAnnotations) as unknown as Array<Record<string, unknown>>;
  oversizedEvidence[0]!.evidence = "x".repeat(501);
  invalid(() => buildCommunityReviewSubmission(packet, oversizedEvidence));
  invalid(() => buildCommunityReviewSubmission(packet, []));

  const pollutedPacket = clone(packet) as unknown as Record<string, unknown>;
  pollutedPacket.groundTruth = "sealed";
  invalid(() => buildCommunityReviewSubmission(pollutedPacket, validAnnotations));
  const tamperedPacket = clone(packet) as unknown as Record<string, unknown>;
  ((tamperedPacket.tasks as Array<Record<string, unknown>>)[0]!).tutorResponse = "Changed reply.";
  invalid(() => buildCommunityReviewSubmission(tamperedPacket, validAnnotations));

  const late = buildCommunityReviewSubmission(packet, validAnnotations, "not-part-of-closed-batch");
  invalid(() => assertCommunityReviewSubmissionMatchesAssignment(
    setup.assignments[0]!,
    late,
  ));
  const pollutedSubmission = clone(setup.submissions[0]!) as unknown as Record<string, unknown>;
  pollutedSubmission.answerKey = "hidden";
  invalid(() => parseCommunityReviewSubmission(pollutedSubmission));
});

test("close freezes the accepted set, rejects late or replacement work, and labels incomplete pilots", () => {
  const normal = makeSetup();
  invalid(() => closeCommunityReviewBatch(normal.open, normal.assignments, [normal.submissions[0]! ]));
  invalid(() => closeCommunityReviewBatch(normal.open, normal.assignments, [
    normal.submissions[0]!,
    normal.submissions[0]!,
  ]));
  const late = buildCommunityReviewSubmission(
    normal.packets[1]!,
    annotationValues(normal.packets[1]!),
    "not-part-of-closed-batch",
  );
  invalid(() => closeCommunityReviewBatch(normal.open, normal.assignments, [normal.submissions[0]!, late]));

  const pilot = makeSetup({ batchPurpose: "pilot" });
  const withdrawn = withdrawCommunityReviewAssignment(pilot.assignments[1]!);
  const pilotClosed = closeCommunityReviewBatch(
    pilot.open,
    [pilot.assignments[0]!, withdrawn],
    [pilot.submissions[0]!],
  );
  assert.equal(pilotClosed.closeRecord.coverage.coverageStatus, "incomplete");
  assert.deepEqual(pilotClosed.closeRecord.coverage.missingReviewerIds, []);
  assert.deepEqual(pilotClosed.closeRecord.coverage.withdrawnReviewerIds, ["reviewer-b"]);
  const pilotPool = freezeCommunityReviewPool(pilotClosed);
  const pilotAgreement = buildCommunityReviewAgreementEvidence(pilotPool);
  assert.equal(pilotAgreement.pairwise.length, 0);
  assert.match(pilotAgreement.limitations.join(" "), /not complete interpretable evidence|single accepted reviewer/iu);

  invalid(() => closeCommunityReviewBatch(pilotClosed.manifest, pilot.assignments, pilot.submissions));
  const incompleteClose = { ...pilotClosed, acceptedSubmissions: [] };
  invalid(() => freezeCommunityReviewPool(incompleteClose));
  const replacement = clone(pilotClosed) as unknown as CommunityReviewBatchCloseResult;
  (replacement.closeRecord as unknown as Record<string, unknown>).acceptedSubmissionFingerprints = [
    communityReviewFingerprint({ replacement: true }),
  ];
  invalid(() => freezeCommunityReviewPool(replacement));
});

test("agreement preserves disagreements and public disclosure follows an explicit allowlist policy", () => {
  const setup = makeSetup({ disagreementForReviewerB: true });
  const closed = closeCommunityReviewBatch(setup.open, setup.assignments, setup.submissions);
  const pool = freezeCommunityReviewPool(closed);
  const agreement = buildCommunityReviewAgreementEvidence(pool);
  assert.equal(agreement.comparableAtomicCount, 4);
  assert.equal(agreement.agreementCount, 3);
  assert.equal(agreement.disagreementCount, 1);
  assert.equal(agreement.disagreements.length, 1);
  assert.equal(agreement.disagreements[0]!.reviewerA, "reviewer-a");
  assert.equal(agreement.disagreements[0]!.reviewerB, "reviewer-b");
  assert.match(agreement.limitations.join(" "), /not correctness, gold, or calibration/iu);

  const privateArtifact = buildCommunityReviewPublicEvidenceArtifact(pool, {
    disclosureDate: "2026-09-06",
    disclosurePolicy: {
      publishReviewerIds: false,
      publishAtomicAnnotations: false,
      publishReviewerEvidence: false,
    },
  });
  assert.equal(privateArtifact.agreement.disagreements.length, 0);
  assert.equal("publishedReviewerIds" in privateArtifact, false);
  assert.equal("publishedSubmissions" in privateArtifact, false);

  const publicArtifact = buildCommunityReviewPublicEvidenceArtifact(pool, {
    disclosureDate: "2026-09-06",
    disclosurePolicy: {
      publishReviewerIds: true,
      publishAtomicAnnotations: true,
      publishReviewerEvidence: true,
    },
  });
  assert.deepEqual(publicArtifact.publishedReviewerIds, ["reviewer-a", "reviewer-b"]);
  assert.equal(publicArtifact.publishedSubmissions?.length, 2);
  assert.equal(publicArtifact.agreement.disagreements.length, 1);
  assert.equal(publicArtifact.agreement.disagreements[0]!.reviewerAEvidence, "reviewer-a observed the visible reply.");
  assert.doesNotMatch(JSON.stringify(publicArtifact), /groundTruth|knownMisconception|private key/iu);
  assert.equal(parseCommunityReviewPublicEvidenceArtifact(publicArtifact).batchId, publicArtifact.batchId);

  const malformedPublication = clone(privateArtifact) as unknown as Record<string, unknown>;
  malformedPublication.publishedSubmissions = [{ hidden: true }];
  invalid(() => parseCommunityReviewPublicEvidenceArtifact(malformedPublication));
  const leakedEvidence = clone(publicArtifact) as unknown as Record<string, unknown>;
  (leakedEvidence.disclosurePolicy as Record<string, unknown>).publishReviewerEvidence = false;
  invalid(() => parseCommunityReviewPublicEvidenceArtifact(leakedEvidence));
  const hiddenReviewerIds = clone(publicArtifact) as unknown as Record<string, unknown>;
  (hiddenReviewerIds.disclosurePolicy as Record<string, unknown>).publishReviewerIds = false;
  invalid(() => parseCommunityReviewPublicEvidenceArtifact(hiddenReviewerIds));
  invalid(() => buildCommunityReviewPublicEvidenceArtifact(pool, {
    disclosureDate: "2026-09-06",
    disclosurePolicy: {
      publishReviewerIds: false,
      publishAtomicAnnotations: true,
      publishReviewerEvidence: true,
    },
  }));
});

test("historical Human Reference tasks are projected without hidden evaluator fields", () => {
  const historical = parseHumanReferenceAnnotationTask({
    schemaVersion: 1,
    caseId: "historical-material-case",
    learningObjective: "Use a visible synthetic task.",
    studentProfile: JSON.stringify({ level: "synthetic" }),
    conversationHistory: JSON.stringify([]),
    studentMessage: "A visible message.",
    problemContext: "A visible context.",
    groundTruth: JSON.stringify({ sealed: "historical expected result" }),
    knownMisconception: "A historical hidden misconception.",
    disclosurePolicy: "hint_only",
    rubrics: [{
      id: "historical-rubric",
      criterion: "A visible criterion.",
      requirements: [{ id: "historical-requirement", description: "A visible requirement." }],
    }],
    tutorResponse: "A visible reply.",
  });
  const projected = projectCommunityReviewVisibleTask(historical);
  assert.deepEqual(Object.keys(projected).sort(), [
    "caseId",
    "conversationHistory",
    "learningObjective",
    "problemContext",
    "rubrics",
    "studentMessage",
    "studentProfile",
    "tutorResponse",
  ].sort());
  assert.doesNotMatch(JSON.stringify(projected), /groundTruth|knownMisconception|disclosurePolicy|historical expected/iu);
  const manifestWithUnknown = clone(makeSetup().sealed) as unknown as Record<string, unknown>;
  manifestWithUnknown.answerKey = "must not cross the protocol boundary";
  invalid(() => parseCommunityReviewBatchManifest(manifestWithUnknown));
});
