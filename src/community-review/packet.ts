import { BenchmarkConfigurationError } from "../contracts/errors.js";
import {
  COMMUNITY_REVIEW_ASSIGNMENT_KIND,
  COMMUNITY_REVIEW_BATCH_MANIFEST_KIND,
  COMMUNITY_REVIEW_BLINDNESS_MODE,
  COMMUNITY_REVIEW_CLOSE_RECORD_KIND,
  COMMUNITY_REVIEW_DEFAULT_REQUIRED_REVIEWERS,
  COMMUNITY_REVIEW_GUIDE_ID,
  COMMUNITY_REVIEW_GUIDE_VERSION,
  COMMUNITY_REVIEW_INSTRUMENT_ID,
  COMMUNITY_REVIEW_INSTRUMENT_VERSION,
  COMMUNITY_REVIEW_PACKET_KIND,
  COMMUNITY_REVIEW_PROTOCOL_ID,
  COMMUNITY_REVIEW_PROTOCOL_VERSION,
  COMMUNITY_REVIEW_QUALIFICATION_PROTOCOL_ID,
  COMMUNITY_REVIEW_QUALIFICATION_PROTOCOL_VERSION,
  COMMUNITY_REVIEW_QUALIFICATION_RECEIPT_KIND,
  COMMUNITY_REVIEW_SCHEMA_VERSION,
  COMMUNITY_REVIEW_SUBMISSION_KIND,
  type CommunityReviewAnnotation,
  type CommunityReviewAssignment,
  type CommunityReviewBatchCloseResult,
  type CommunityReviewBatchManifest,
  type CommunityReviewBatchPurpose,
  type CommunityReviewDataKind,
  type CommunityReviewInstrumentIdentity,
  type CommunityReviewQualificationEligibility,
  type CommunityReviewQualificationReceipt,
  type CommunityReviewReviewerPacket,
  type CommunityReviewSubmission,
  type CommunityReviewSubmissionDisposition,
  type CommunityReviewSyntheticFixtureMarker,
  type CommunityReviewVisibleTask,
} from "../contracts/community-review.js";
import {
  assertCommunityReviewSubmissionMatchesAssignment,
  parseCommunityReviewAnnotation,
  parseCommunityReviewAssignment,
  parseCommunityReviewBatchCloseRecord,
  parseCommunityReviewBatchManifest,
  parseCommunityReviewInstrumentIdentity,
  parseCommunityReviewQualificationEligibility,
  parseCommunityReviewQualificationReceipt,
  parseCommunityReviewReviewerPacket,
  parseCommunityReviewSubmission,
  parseCommunityReviewVisibleTasks,
} from "../contracts/community-review-validation.js";
import {
  communityReviewAssignmentFingerprint,
  communityReviewAtomicIdentityKey,
  communityReviewBatchFingerprint,
  communityReviewCloseFingerprint,
  communityReviewInstrumentFingerprint,
  communityReviewLocalizationFingerprint,
  communityReviewPacketFingerprint,
  communityReviewQualificationReceiptFingerprint,
  communityReviewSubmissionFingerprint,
  communityReviewSourceInstrumentFingerprint,
  communityReviewVisibleAtomicIds,
  communityReviewVisibleTaskSetFingerprint,
} from "./fingerprint.js";

function invalid(): never {
  throw new BenchmarkConfigurationError("community_review_invalid");
}

function sameJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function isOpaqueId(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/u.test(value) &&
    !value.includes("@");
}

function isFingerprint(value: unknown): value is string {
  return typeof value === "string" && /^sha256:[0-9a-f]{64}$/u.test(value);
}

function isLocale(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z]{2,8}(?:-[A-Za-z0-9]{1,8})*$/u.test(value);
}

function assertDataKind(
  dataKind: CommunityReviewDataKind,
  fixture: CommunityReviewSyntheticFixtureMarker | undefined,
): void {
  if (dataKind === "community-review" && fixture !== undefined) return invalid();
  if (dataKind === "synthetic-fixture" && fixture === undefined) return invalid();
}

export interface CommunityReviewInstrumentBuildInput {
  readonly guideFingerprint: string;
  readonly canonicalLocale: string;
  readonly reviewLocale: string;
  readonly localization?: Omit<
    import("../contracts/community-review.js").CommunityReviewLocalizationIdentity,
    "fingerprint"
  >;
}

export function buildCommunityReviewInstrumentIdentity(
  input: CommunityReviewInstrumentBuildInput,
): CommunityReviewInstrumentIdentity {
  if (!isFingerprint(input.guideFingerprint) || !isLocale(input.canonicalLocale) ||
    !isLocale(input.reviewLocale)) return invalid();
  const sourceInstrumentFingerprint = communityReviewSourceInstrumentFingerprint({
    protocolId: COMMUNITY_REVIEW_PROTOCOL_ID,
    protocolVersion: COMMUNITY_REVIEW_PROTOCOL_VERSION,
    instrumentId: COMMUNITY_REVIEW_INSTRUMENT_ID,
    instrumentVersion: COMMUNITY_REVIEW_INSTRUMENT_VERSION,
    guideId: COMMUNITY_REVIEW_GUIDE_ID,
    guideVersion: COMMUNITY_REVIEW_GUIDE_VERSION,
    guideFingerprint: input.guideFingerprint,
    canonicalLocale: input.canonicalLocale,
  });
  if (input.reviewLocale === input.canonicalLocale && input.localization !== undefined) return invalid();
  if (input.reviewLocale !== input.canonicalLocale && input.localization === undefined) return invalid();
  const localization = input.localization === undefined ? undefined : {
    ...input.localization,
    fingerprint: communityReviewLocalizationFingerprint(input.localization),
  };
  if (localization !== undefined && (localization.sourceLocale !== input.canonicalLocale ||
    localization.sourceInstrumentFingerprint !== sourceInstrumentFingerprint ||
    localization.localizedTaskSetFingerprint === undefined)) return invalid();
  const base = {
    protocolId: COMMUNITY_REVIEW_PROTOCOL_ID,
    protocolVersion: COMMUNITY_REVIEW_PROTOCOL_VERSION,
    instrumentId: COMMUNITY_REVIEW_INSTRUMENT_ID,
    instrumentVersion: COMMUNITY_REVIEW_INSTRUMENT_VERSION,
    guideId: COMMUNITY_REVIEW_GUIDE_ID,
    guideVersion: COMMUNITY_REVIEW_GUIDE_VERSION,
    guideFingerprint: input.guideFingerprint,
    canonicalLocale: input.canonicalLocale,
    reviewLocale: input.reviewLocale,
    ...(localization === undefined ? {} : { localization }),
  } as const;
  return parseCommunityReviewInstrumentIdentity({
    ...base,
    fingerprint: communityReviewInstrumentFingerprint(base),
  });
}

export interface CommunityReviewQualificationReceiptBuildInput {
  readonly dataKind: CommunityReviewDataKind;
  readonly fixture?: CommunityReviewSyntheticFixtureMarker;
  readonly qualificationId: string;
  readonly qualificationVersion: string;
  readonly qualificationPoolId: string;
  readonly qualificationPoolVersion: string;
  readonly qualificationDefinitionFingerprint: string;
  readonly reviewerId: string;
  readonly instrument: CommunityReviewInstrumentIdentity;
}

export function buildCommunityReviewQualificationReceipt(
  input: CommunityReviewQualificationReceiptBuildInput,
): CommunityReviewQualificationReceipt {
  assertDataKind(input.dataKind, input.fixture);
  const instrument = parseCommunityReviewInstrumentIdentity(input.instrument);
  if (!isOpaqueId(input.reviewerId) || instrument === undefined) return invalid();
  const base = {
    schemaVersion: COMMUNITY_REVIEW_SCHEMA_VERSION,
    receiptKind: COMMUNITY_REVIEW_QUALIFICATION_RECEIPT_KIND,
    dataKind: input.dataKind,
    ...(input.fixture === undefined ? {} : { fixture: input.fixture }),
    protocolId: COMMUNITY_REVIEW_PROTOCOL_ID,
    protocolVersion: COMMUNITY_REVIEW_PROTOCOL_VERSION,
    qualificationProtocolId: COMMUNITY_REVIEW_QUALIFICATION_PROTOCOL_ID,
    qualificationProtocolVersion: COMMUNITY_REVIEW_QUALIFICATION_PROTOCOL_VERSION,
    qualificationId: input.qualificationId,
    qualificationVersion: input.qualificationVersion,
    qualificationPoolId: input.qualificationPoolId,
    qualificationPoolVersion: input.qualificationPoolVersion,
    qualificationDefinitionFingerprint: input.qualificationDefinitionFingerprint,
    reviewerId: input.reviewerId,
    reviewLocale: instrument.reviewLocale,
    qualificationStatus: "qualified" as const,
    instrumentEligibility: {
      instrumentId: instrument.instrumentId,
      instrumentVersion: instrument.instrumentVersion,
      instrumentFingerprint: instrument.fingerprint,
      reviewLocale: instrument.reviewLocale,
    },
  };
  return parseCommunityReviewQualificationReceipt({
    ...base,
    receiptFingerprint: communityReviewQualificationReceiptFingerprint(base),
  });
}

export interface CommunityReviewBatchBuildInput {
  readonly batchId: string;
  readonly instrument: CommunityReviewInstrumentIdentity;
  readonly qualificationEligibility: CommunityReviewQualificationEligibility;
  readonly sealedSourceFingerprint: string;
  readonly tasks: readonly CommunityReviewVisibleTask[];
  readonly requiredIndependentReviewerCount?: number;
  readonly batchPurpose?: CommunityReviewBatchPurpose;
  readonly dataKind: CommunityReviewDataKind;
  readonly fixture?: CommunityReviewSyntheticFixtureMarker;
}

export function createCommunityReviewBatch(
  input: CommunityReviewBatchBuildInput,
): CommunityReviewBatchManifest {
  assertDataKind(input.dataKind, input.fixture);
  const instrument = parseCommunityReviewInstrumentIdentity(input.instrument);
  const qualificationEligibility = parseCommunityReviewQualificationEligibility(input.qualificationEligibility);
  const tasks = parseCommunityReviewVisibleTasks(input.tasks);
  const requiredIndependentReviewerCount = input.requiredIndependentReviewerCount ??
    COMMUNITY_REVIEW_DEFAULT_REQUIRED_REVIEWERS;
  const batchPurpose = input.batchPurpose ?? "interpretable";
  if (!isOpaqueId(input.batchId) || instrument === undefined || qualificationEligibility === undefined ||
    !isFingerprint(input.sealedSourceFingerprint) ||
    !Number.isInteger(requiredIndependentReviewerCount) || requiredIndependentReviewerCount < 1 ||
    (batchPurpose === "interpretable" && requiredIndependentReviewerCount < 2)) return invalid();
  const base = {
    dataKind: input.dataKind,
    ...(input.fixture === undefined ? {} : { fixture: input.fixture }),
    protocolId: COMMUNITY_REVIEW_PROTOCOL_ID,
    protocolVersion: COMMUNITY_REVIEW_PROTOCOL_VERSION,
    batchId: input.batchId,
    instrument,
    qualificationEligibility,
    sealedSourceFingerprint: input.sealedSourceFingerprint,
    visibleTaskSetFingerprint: communityReviewVisibleTaskSetFingerprint(tasks),
    requiredIndependentReviewerCount,
    batchPurpose,
    blindnessMode: COMMUNITY_REVIEW_BLINDNESS_MODE,
  } as const;
  return parseCommunityReviewBatchManifest({
    schemaVersion: COMMUNITY_REVIEW_SCHEMA_VERSION,
    manifestKind: COMMUNITY_REVIEW_BATCH_MANIFEST_KIND,
    ...base,
    state: "SEALED",
    batchFingerprint: communityReviewBatchFingerprint(base),
  });
}

function manifestWithoutLifecycle(manifest: CommunityReviewBatchManifest): CommunityReviewBatchManifest {
  return {
    schemaVersion: manifest.schemaVersion,
    manifestKind: manifest.manifestKind,
    dataKind: manifest.dataKind,
    ...(manifest.fixture === undefined ? {} : { fixture: manifest.fixture }),
    protocolId: manifest.protocolId,
    protocolVersion: manifest.protocolVersion,
    batchId: manifest.batchId,
    instrument: manifest.instrument,
    qualificationEligibility: manifest.qualificationEligibility,
    sealedSourceFingerprint: manifest.sealedSourceFingerprint,
    visibleTaskSetFingerprint: manifest.visibleTaskSetFingerprint,
    requiredIndependentReviewerCount: manifest.requiredIndependentReviewerCount,
    batchPurpose: manifest.batchPurpose,
    blindnessMode: manifest.blindnessMode,
    state: "OPEN",
    batchFingerprint: manifest.batchFingerprint,
  };
}

export function openCommunityReviewBatch(value: unknown): CommunityReviewBatchManifest {
  const manifest = parseCommunityReviewBatchManifest(value);
  if (manifest.state !== "SEALED") return invalid();
  return parseCommunityReviewBatchManifest(manifestWithoutLifecycle(manifest));
}

function assertManifestMatches(
  manifest: CommunityReviewBatchManifest,
  value: {
    readonly dataKind: CommunityReviewDataKind;
    readonly fixture?: CommunityReviewSyntheticFixtureMarker;
    readonly batchId: string;
    readonly batchFingerprint: string;
    readonly instrument: CommunityReviewInstrumentIdentity;
    readonly taskSetFingerprint: string;
  },
): void {
  if (manifest.dataKind !== value.dataKind || !sameJson(manifest.fixture, value.fixture) ||
    manifest.batchId !== value.batchId || manifest.batchFingerprint !== value.batchFingerprint ||
    !sameJson(manifest.instrument, value.instrument) ||
    manifest.visibleTaskSetFingerprint !== value.taskSetFingerprint) return invalid();
}

export interface CommunityReviewAssignmentBuildInput {
  readonly manifest: CommunityReviewBatchManifest;
  readonly reviewerId: string;
  readonly qualificationReceipt: CommunityReviewQualificationReceipt;
  readonly tasks: readonly CommunityReviewVisibleTask[];
}

export function buildCommunityReviewAssignment(
  input: CommunityReviewAssignmentBuildInput,
): CommunityReviewAssignment {
  const manifest = parseCommunityReviewBatchManifest(input.manifest);
  const receipt = parseCommunityReviewQualificationReceipt(input.qualificationReceipt);
  const tasks = parseCommunityReviewVisibleTasks(input.tasks);
  if (manifest.state !== "OPEN" || receipt.reviewerId !== input.reviewerId ||
    receipt.dataKind !== manifest.dataKind || !sameJson(receipt.fixture, manifest.fixture) ||
    receipt.reviewLocale !== manifest.instrument.reviewLocale ||
    receipt.instrumentEligibility.instrumentId !== manifest.instrument.instrumentId ||
    receipt.instrumentEligibility.instrumentVersion !== manifest.instrument.instrumentVersion ||
    receipt.instrumentEligibility.instrumentFingerprint !== manifest.instrument.fingerprint ||
    receipt.instrumentEligibility.reviewLocale !== manifest.instrument.reviewLocale ||
    receipt.qualificationProtocolId !== manifest.qualificationEligibility.qualificationProtocolId ||
    receipt.qualificationProtocolVersion !== manifest.qualificationEligibility.qualificationProtocolVersion ||
    receipt.qualificationId !== manifest.qualificationEligibility.qualificationId ||
    receipt.qualificationVersion !== manifest.qualificationEligibility.qualificationVersion ||
    receipt.qualificationPoolId !== manifest.qualificationEligibility.qualificationPoolId ||
    receipt.qualificationPoolVersion !== manifest.qualificationEligibility.qualificationPoolVersion ||
    receipt.qualificationDefinitionFingerprint !== manifest.qualificationEligibility.qualificationDefinitionFingerprint ||
    !isOpaqueId(input.reviewerId)) return invalid();
  const taskSetFingerprint = communityReviewVisibleTaskSetFingerprint(tasks);
  assertManifestMatches(manifest, {
    dataKind: manifest.dataKind,
    ...(manifest.fixture === undefined ? {} : { fixture: manifest.fixture }),
    batchId: manifest.batchId,
    batchFingerprint: manifest.batchFingerprint,
    instrument: manifest.instrument,
    taskSetFingerprint,
  });
  const visibleAtomicIds = communityReviewVisibleAtomicIds(tasks);
  const assignmentId = `assignment-${communityReviewAssignmentFingerprint({
    schemaVersion: COMMUNITY_REVIEW_SCHEMA_VERSION,
    assignmentKind: COMMUNITY_REVIEW_ASSIGNMENT_KIND,
    dataKind: manifest.dataKind,
    ...(manifest.fixture === undefined ? {} : { fixture: manifest.fixture }),
    protocolId: COMMUNITY_REVIEW_PROTOCOL_ID,
    protocolVersion: COMMUNITY_REVIEW_PROTOCOL_VERSION,
    batchId: manifest.batchId,
    batchFingerprint: manifest.batchFingerprint,
    assignmentId: "pending",
    reviewerId: input.reviewerId,
    qualificationReceiptFingerprint: receipt.receiptFingerprint,
    instrument: manifest.instrument,
    visibleTaskSetFingerprint: taskSetFingerprint,
    visibleAtomicIds,
    assignmentState: "assigned",
  }).slice("sha256:".length, "sha256:".length + 16)}`;
  const base = {
    schemaVersion: COMMUNITY_REVIEW_SCHEMA_VERSION,
    assignmentKind: COMMUNITY_REVIEW_ASSIGNMENT_KIND,
    dataKind: manifest.dataKind,
    ...(manifest.fixture === undefined ? {} : { fixture: manifest.fixture }),
    protocolId: COMMUNITY_REVIEW_PROTOCOL_ID,
    protocolVersion: COMMUNITY_REVIEW_PROTOCOL_VERSION,
    batchId: manifest.batchId,
    batchFingerprint: manifest.batchFingerprint,
    assignmentId,
    reviewerId: input.reviewerId,
    qualificationReceiptFingerprint: receipt.receiptFingerprint,
    instrument: manifest.instrument,
    visibleTaskSetFingerprint: taskSetFingerprint,
    visibleAtomicIds,
    assignmentState: "assigned" as const,
  };
  return parseCommunityReviewAssignment({
    ...base,
    assignmentFingerprint: communityReviewAssignmentFingerprint(base),
  });
}

export function withdrawCommunityReviewAssignment(value: unknown): CommunityReviewAssignment {
  const assignment = parseCommunityReviewAssignment(value);
  if (assignment.assignmentState === "withdrawn") return assignment;
  const base = {
    schemaVersion: assignment.schemaVersion,
    assignmentKind: assignment.assignmentKind,
    dataKind: assignment.dataKind,
    ...(assignment.fixture === undefined ? {} : { fixture: assignment.fixture }),
    protocolId: assignment.protocolId,
    protocolVersion: assignment.protocolVersion,
    batchId: assignment.batchId,
    batchFingerprint: assignment.batchFingerprint,
    assignmentId: assignment.assignmentId,
    reviewerId: assignment.reviewerId,
    qualificationReceiptFingerprint: assignment.qualificationReceiptFingerprint,
    instrument: assignment.instrument,
    visibleTaskSetFingerprint: assignment.visibleTaskSetFingerprint,
    visibleAtomicIds: assignment.visibleAtomicIds,
    assignmentState: "withdrawn" as const,
  };
  return parseCommunityReviewAssignment({
    ...base,
    assignmentFingerprint: communityReviewAssignmentFingerprint(base),
  });
}

export function buildCommunityReviewReviewerPacket(
  assignmentValue: unknown,
  tasksValue: readonly CommunityReviewVisibleTask[],
): CommunityReviewReviewerPacket {
  const assignment = parseCommunityReviewAssignment(assignmentValue);
  const tasks = parseCommunityReviewVisibleTasks(tasksValue);
  const taskSetFingerprint = communityReviewVisibleTaskSetFingerprint(tasks);
  const visibleAtomicIds = communityReviewVisibleAtomicIds(tasks);
  if (assignment.assignmentState !== "assigned" || taskSetFingerprint !== assignment.visibleTaskSetFingerprint ||
    visibleAtomicIds.length !== assignment.visibleAtomicIds.length ||
    visibleAtomicIds.some((atom, index) =>
      communityReviewAtomicIdentityKey(atom) !== communityReviewAtomicIdentityKey(assignment.visibleAtomicIds[index]!))) return invalid();
  const base = {
    schemaVersion: COMMUNITY_REVIEW_SCHEMA_VERSION,
    packetKind: COMMUNITY_REVIEW_PACKET_KIND,
    dataKind: assignment.dataKind,
    ...(assignment.fixture === undefined ? {} : { fixture: assignment.fixture }),
    protocolId: COMMUNITY_REVIEW_PROTOCOL_ID,
    protocolVersion: COMMUNITY_REVIEW_PROTOCOL_VERSION,
    batchId: assignment.batchId,
    batchFingerprint: assignment.batchFingerprint,
    assignmentId: assignment.assignmentId,
    reviewerId: assignment.reviewerId,
    qualificationReceiptFingerprint: assignment.qualificationReceiptFingerprint,
    instrument: assignment.instrument,
    taskSetFingerprint,
    tasks,
  };
  return parseCommunityReviewReviewerPacket({
    ...base,
    packetFingerprint: communityReviewPacketFingerprint(base),
  });
}

function parseAnnotationList(value: readonly unknown[]): CommunityReviewAnnotation[] {
  if (!Array.isArray(value) || value.length === 0) return invalid();
  const annotations = value.map(parseCommunityReviewAnnotation);
  if (new Set(annotations.map(communityReviewAtomicIdentityKey)).size !== annotations.length) return invalid();
  return annotations;
}

function assertCompleteAnnotations(
  tasks: readonly CommunityReviewVisibleTask[],
  annotations: readonly CommunityReviewAnnotation[],
): void {
  const expected = communityReviewVisibleAtomicIds(tasks).map(communityReviewAtomicIdentityKey);
  const observed = annotations.map(communityReviewAtomicIdentityKey);
  if (expected.length !== observed.length ||
    new Set(observed).size !== observed.length ||
    expected.some((key) => !observed.includes(key))) return invalid();
}

export function buildCommunityReviewSubmission(
  packetValue: unknown,
  annotationsValue: readonly unknown[],
  submissionDisposition: CommunityReviewSubmissionDisposition = "accepted-before-close",
): CommunityReviewSubmission {
  const packet = parseCommunityReviewReviewerPacket(packetValue);
  const annotations = parseAnnotationList(annotationsValue);
  assertCompleteAnnotations(packet.tasks, annotations);
  const base = {
    schemaVersion: COMMUNITY_REVIEW_SCHEMA_VERSION,
    submissionKind: COMMUNITY_REVIEW_SUBMISSION_KIND,
    dataKind: packet.dataKind,
    ...(packet.fixture === undefined ? {} : { fixture: packet.fixture }),
    protocolId: COMMUNITY_REVIEW_PROTOCOL_ID,
    protocolVersion: COMMUNITY_REVIEW_PROTOCOL_VERSION,
    batchId: packet.batchId,
    batchFingerprint: packet.batchFingerprint,
    assignmentId: packet.assignmentId,
    reviewerId: packet.reviewerId,
    qualificationReceiptFingerprint: packet.qualificationReceiptFingerprint,
    instrument: packet.instrument,
    taskSetFingerprint: packet.taskSetFingerprint,
    packetFingerprint: packet.packetFingerprint,
    submissionDisposition,
    completed: true as const,
    annotations,
  };
  return parseCommunityReviewSubmission({
    ...base,
    submissionFingerprint: communityReviewSubmissionFingerprint(base),
  });
}

function sortSubmissions(values: readonly CommunityReviewSubmission[]): CommunityReviewSubmission[] {
  return [...values].sort((left, right) => left.reviewerId.localeCompare(right.reviewerId));
}

function buildCoverage(
  manifest: CommunityReviewBatchManifest,
  assignments: readonly CommunityReviewAssignment[],
  acceptedSubmissions: readonly CommunityReviewSubmission[],
) {
  const assignedReviewerIds = [...new Set(assignments.map((assignment) => assignment.reviewerId))].sort();
  const acceptedReviewerIds = [...new Set(acceptedSubmissions.map((submission) => submission.reviewerId))].sort();
  const withdrawnReviewerIds = assignments
    .filter((assignment) => assignment.assignmentState === "withdrawn")
    .map((assignment) => assignment.reviewerId)
    .sort();
  const missingReviewerIds = assignedReviewerIds.filter((reviewerId) =>
    !acceptedReviewerIds.includes(reviewerId) && !withdrawnReviewerIds.includes(reviewerId));
  return {
    requiredIndependentReviewerCount: manifest.requiredIndependentReviewerCount,
    assignedReviewerCount: assignedReviewerIds.length,
    acceptedReviewerCount: acceptedReviewerIds.length,
    missingReviewerCount: missingReviewerIds.length,
    withdrawnAssignmentCount: withdrawnReviewerIds.length,
    coverageStatus: acceptedReviewerIds.length >= manifest.requiredIndependentReviewerCount
      ? "complete" as const
      : "incomplete" as const,
    assignedReviewerIds,
    acceptedReviewerIds,
    missingReviewerIds,
    withdrawnReviewerIds,
  };
}

export function closeCommunityReviewBatch(
  manifestValue: unknown,
  assignmentValues: readonly unknown[],
  submissionValues: readonly unknown[],
): CommunityReviewBatchCloseResult {
  const manifest = parseCommunityReviewBatchManifest(manifestValue);
  if (manifest.state !== "OPEN" || !Array.isArray(assignmentValues) || assignmentValues.length === 0 ||
    !Array.isArray(submissionValues)) return invalid();
  const assignments = assignmentValues.map(parseCommunityReviewAssignment);
  const assignmentIds = new Set<string>();
  const reviewerIds = new Set<string>();
  for (const assignment of assignments) {
    assertManifestMatches(manifest, {
      dataKind: assignment.dataKind,
      ...(assignment.fixture === undefined ? {} : { fixture: assignment.fixture }),
      batchId: assignment.batchId,
      batchFingerprint: assignment.batchFingerprint,
      instrument: assignment.instrument,
      taskSetFingerprint: assignment.visibleTaskSetFingerprint,
    });
    if (assignmentIds.has(assignment.assignmentId) || reviewerIds.has(assignment.reviewerId)) return invalid();
    assignmentIds.add(assignment.assignmentId);
    reviewerIds.add(assignment.reviewerId);
  }
  const submissions = submissionValues.map(parseCommunityReviewSubmission);
  const acceptedSubmissions: CommunityReviewSubmission[] = [];
  const acceptedAssignmentIds = new Set<string>();
  const acceptedReviewerIds = new Set<string>();
  for (const submission of submissions) {
    const assignment = assignments.find((item) => item.assignmentId === submission.assignmentId);
    if (assignment === undefined || acceptedAssignmentIds.has(submission.assignmentId) ||
      acceptedReviewerIds.has(submission.reviewerId)) return invalid();
    const validated = assertCommunityReviewSubmissionMatchesAssignment(assignment, submission);
    assertManifestMatches(manifest, {
      dataKind: validated.submission.dataKind,
      ...(validated.submission.fixture === undefined ? {} : { fixture: validated.submission.fixture }),
      batchId: validated.submission.batchId,
      batchFingerprint: validated.submission.batchFingerprint,
      instrument: validated.submission.instrument,
      taskSetFingerprint: validated.submission.taskSetFingerprint,
    });
    acceptedAssignmentIds.add(submission.assignmentId);
    acceptedReviewerIds.add(submission.reviewerId);
    acceptedSubmissions.push(validated.submission);
  }
  const coverage = buildCoverage(manifest, assignments, acceptedSubmissions);
  if (manifest.batchPurpose === "interpretable" && coverage.coverageStatus !== "complete") return invalid();
  const sortedAccepted = sortSubmissions(acceptedSubmissions);
  const acceptedAssignments = sortedAccepted.map((submission) => submission.assignmentId).sort();
  const acceptedReviewers = sortedAccepted.map((submission) => submission.reviewerId).sort();
  const acceptedFingerprints = sortedAccepted.map((submission) => submission.submissionFingerprint).sort();
  const closeBase = {
    schemaVersion: COMMUNITY_REVIEW_SCHEMA_VERSION,
    recordKind: COMMUNITY_REVIEW_CLOSE_RECORD_KIND,
    dataKind: manifest.dataKind,
    ...(manifest.fixture === undefined ? {} : { fixture: manifest.fixture }),
    protocolId: COMMUNITY_REVIEW_PROTOCOL_ID,
    protocolVersion: COMMUNITY_REVIEW_PROTOCOL_VERSION,
    batchId: manifest.batchId,
    batchFingerprint: manifest.batchFingerprint,
    instrument: manifest.instrument,
    qualificationEligibility: manifest.qualificationEligibility,
    visibleTaskSetFingerprint: manifest.visibleTaskSetFingerprint,
    batchPurpose: manifest.batchPurpose,
    blindnessMode: manifest.blindnessMode,
    state: "CLOSED" as const,
    acceptedAssignmentIds: acceptedAssignments,
    acceptedReviewerIds: acceptedReviewers,
    acceptedSubmissionFingerprints: acceptedFingerprints,
    coverage,
  };
  const closeRecord = parseCommunityReviewBatchCloseRecord({
    ...closeBase,
    closeFingerprint: communityReviewCloseFingerprint(closeBase),
  });
  const closedManifest = parseCommunityReviewBatchManifest({
    ...manifest,
    state: "CLOSED",
    closeRecordFingerprint: closeRecord.closeFingerprint,
  });
  return {
    manifest: closedManifest,
    closeRecord,
    acceptedSubmissions: sortedAccepted,
  };
}
