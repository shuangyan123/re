import { createHash } from "node:crypto";

import type {
  CommunityReviewAnnotation,
  CommunityReviewAssignment,
  CommunityReviewBatchCloseRecord,
  CommunityReviewBatchManifest,
  CommunityReviewCoverage,
  CommunityReviewFingerprint,
  CommunityReviewInstrumentIdentity,
  CommunityReviewLocalizationIdentity,
  CommunityReviewQualificationReceipt,
  CommunityReviewReviewerPacket,
  CommunityReviewSubmission,
  CommunityReviewVisibleTask,
  FrozenCommunityReviewPool,
} from "../contracts/community-review.js";
import type { HumanAtomicIdentity } from "../contracts/human-reference-calibration.js";

function compareStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

/** Canonical JSON used by every P3 semantic fingerprint. */
export function canonicalCommunityReviewJson(value: unknown): string {
  if (value === null) return "null";
  if (value === undefined) return "undefined";
  if (Array.isArray(value)) {
    return `[${value.map(canonicalCommunityReviewJson).join(",")}]`;
  }
  if (typeof value === "object") {
    return `{${Object.entries(value)
      .sort(([left], [right]) => compareStrings(left, right))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalCommunityReviewJson(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export function communityReviewFingerprint(value: unknown): CommunityReviewFingerprint {
  return `sha256:${createHash("sha256")
    .update(`${canonicalCommunityReviewJson(value)}\n`, "utf8")
    .digest("hex")}`;
}

export function communityReviewAtomicIdentityKey(value: HumanAtomicIdentity): string {
  return JSON.stringify([value.caseId, value.rubricId, value.requirementId]);
}

/** A stable, unambiguous key for public distribution maps. */
export function communityReviewAtomicDistributionKey(value: HumanAtomicIdentity): string {
  return `${value.caseId}|${value.rubricId}|${value.requirementId}`;
}

function sortedAtomicIds(values: readonly HumanAtomicIdentity[]): HumanAtomicIdentity[] {
  return [...values]
    .map((value) => ({
      caseId: value.caseId,
      rubricId: value.rubricId,
      requirementId: value.requirementId,
    }))
    .sort((left, right) => compareStrings(
      communityReviewAtomicIdentityKey(left),
      communityReviewAtomicIdentityKey(right),
    ));
}

function normalizedVisibleTasks(tasks: readonly CommunityReviewVisibleTask[]): unknown[] {
  return [...tasks]
    .map((task) => ({
      caseId: task.caseId,
      learningObjective: task.learningObjective,
      studentProfile: task.studentProfile,
      conversationHistory: task.conversationHistory,
      studentMessage: task.studentMessage,
      problemContext: task.problemContext,
      rubrics: [...task.rubrics]
        .map((rubric) => ({
          id: rubric.id,
          criterion: rubric.criterion,
          requirements: [...rubric.requirements]
            .map((requirement) => ({ id: requirement.id, description: requirement.description }))
            .sort((left, right) => compareStrings(left.id, right.id)),
        }))
        .sort((left, right) => compareStrings(left.id, right.id)),
      tutorResponse: task.tutorResponse,
    }))
    .sort((left, right) => compareStrings(left.caseId, right.caseId));
}

export function communityReviewVisibleTaskSetFingerprint(
  tasks: readonly CommunityReviewVisibleTask[],
): CommunityReviewFingerprint {
  return communityReviewFingerprint(normalizedVisibleTasks(tasks));
}

export function communityReviewVisibleAtomicIds(
  tasks: readonly CommunityReviewVisibleTask[],
): HumanAtomicIdentity[] {
  return sortedAtomicIds(tasks.flatMap((task) =>
    task.rubrics.flatMap((rubric) => rubric.requirements.map((requirement) => ({
      caseId: task.caseId,
      rubricId: rubric.id,
      requirementId: requirement.id,
    })))));
}

type InstrumentFingerprintInput = Omit<CommunityReviewInstrumentIdentity, "fingerprint">;

function instrumentFingerprintInput(value: InstrumentFingerprintInput): unknown {
  return {
    protocolId: value.protocolId,
    protocolVersion: value.protocolVersion,
    instrumentId: value.instrumentId,
    instrumentVersion: value.instrumentVersion,
    guideId: value.guideId,
    guideVersion: value.guideVersion,
    guideFingerprint: value.guideFingerprint,
    canonicalLocale: value.canonicalLocale,
    reviewLocale: value.reviewLocale,
    ...(value.localization === undefined ? {} : { localization: value.localization }),
  };
}

export function communityReviewInstrumentFingerprint(
  value: InstrumentFingerprintInput,
): CommunityReviewFingerprint {
  return communityReviewFingerprint(instrumentFingerprintInput(value));
}

export function communityReviewSourceInstrumentFingerprint(value: {
  readonly protocolId: string;
  readonly protocolVersion: string;
  readonly instrumentId: string;
  readonly instrumentVersion: string;
  readonly guideId: string;
  readonly guideVersion: string;
  readonly guideFingerprint: CommunityReviewFingerprint;
  readonly canonicalLocale: string;
}): CommunityReviewFingerprint {
  return communityReviewFingerprint(value);
}

type LocalizationFingerprintInput = Omit<CommunityReviewLocalizationIdentity, "fingerprint">;

export function communityReviewLocalizationFingerprint(
  value: LocalizationFingerprintInput,
): CommunityReviewFingerprint {
  return communityReviewFingerprint(value);
}

function receiptFingerprintInput(value: Omit<CommunityReviewQualificationReceipt, "receiptFingerprint">): unknown {
  return {
    schemaVersion: value.schemaVersion,
    receiptKind: value.receiptKind,
    dataKind: value.dataKind,
    ...(value.fixture === undefined ? {} : { fixture: value.fixture }),
    protocolId: value.protocolId,
    protocolVersion: value.protocolVersion,
    qualificationProtocolId: value.qualificationProtocolId,
    qualificationProtocolVersion: value.qualificationProtocolVersion,
    qualificationId: value.qualificationId,
    qualificationVersion: value.qualificationVersion,
    qualificationPoolId: value.qualificationPoolId,
    qualificationPoolVersion: value.qualificationPoolVersion,
    qualificationDefinitionFingerprint: value.qualificationDefinitionFingerprint,
    reviewerId: value.reviewerId,
    reviewLocale: value.reviewLocale,
    qualificationStatus: value.qualificationStatus,
    instrumentEligibility: value.instrumentEligibility,
  };
}

export function communityReviewQualificationReceiptFingerprint(
  value: Omit<CommunityReviewQualificationReceipt, "receiptFingerprint">,
): CommunityReviewFingerprint {
  return communityReviewFingerprint(receiptFingerprintInput(value));
}

function batchFingerprintInput(value: Pick<CommunityReviewBatchManifest,
  | "dataKind"
  | "fixture"
  | "protocolId"
  | "protocolVersion"
  | "batchId"
  | "instrument"
  | "qualificationEligibility"
  | "sealedSourceFingerprint"
  | "visibleTaskSetFingerprint"
  | "requiredIndependentReviewerCount"
  | "batchPurpose"
  | "blindnessMode">): unknown {
  return {
    dataKind: value.dataKind,
    ...(value.fixture === undefined ? {} : { fixture: value.fixture }),
    protocolId: value.protocolId,
    protocolVersion: value.protocolVersion,
    batchId: value.batchId,
    instrument: value.instrument,
    qualificationEligibility: value.qualificationEligibility,
    sealedSourceFingerprint: value.sealedSourceFingerprint,
    visibleTaskSetFingerprint: value.visibleTaskSetFingerprint,
    requiredIndependentReviewerCount: value.requiredIndependentReviewerCount,
    batchPurpose: value.batchPurpose,
    blindnessMode: value.blindnessMode,
  };
}

export function communityReviewBatchFingerprint(
  value: Pick<CommunityReviewBatchManifest,
    | "dataKind"
    | "fixture"
    | "protocolId"
    | "protocolVersion"
    | "batchId"
    | "instrument"
    | "qualificationEligibility"
    | "sealedSourceFingerprint"
    | "visibleTaskSetFingerprint"
    | "requiredIndependentReviewerCount"
    | "batchPurpose"
    | "blindnessMode">,
): CommunityReviewFingerprint {
  return communityReviewFingerprint(batchFingerprintInput(value));
}

function assignmentFingerprintInput(value: Omit<CommunityReviewAssignment, "assignmentFingerprint">): unknown {
  return {
    schemaVersion: value.schemaVersion,
    assignmentKind: value.assignmentKind,
    dataKind: value.dataKind,
    ...(value.fixture === undefined ? {} : { fixture: value.fixture }),
    protocolId: value.protocolId,
    protocolVersion: value.protocolVersion,
    batchId: value.batchId,
    batchFingerprint: value.batchFingerprint,
    assignmentId: value.assignmentId,
    reviewerId: value.reviewerId,
    qualificationReceiptFingerprint: value.qualificationReceiptFingerprint,
    instrument: value.instrument,
    visibleTaskSetFingerprint: value.visibleTaskSetFingerprint,
    visibleAtomicIds: sortedAtomicIds(value.visibleAtomicIds),
    assignmentState: value.assignmentState,
  };
}

export function communityReviewAssignmentFingerprint(
  value: Omit<CommunityReviewAssignment, "assignmentFingerprint">,
): CommunityReviewFingerprint {
  return communityReviewFingerprint(assignmentFingerprintInput(value));
}

function annotationValues(annotations: readonly CommunityReviewAnnotation[]): CommunityReviewAnnotation[] {
  return [...annotations]
    .map((annotation) => ({
      caseId: annotation.caseId,
      rubricId: annotation.rubricId,
      requirementId: annotation.requirementId,
      status: annotation.status,
      ...(annotation.evidence === undefined ? {} : { evidence: annotation.evidence }),
    }))
    .sort((left, right) => compareStrings(
      communityReviewAtomicIdentityKey(left),
      communityReviewAtomicIdentityKey(right),
    ));
}

function packetFingerprintInput(value: Omit<CommunityReviewReviewerPacket, "packetFingerprint">): unknown {
  return {
    schemaVersion: value.schemaVersion,
    packetKind: value.packetKind,
    dataKind: value.dataKind,
    ...(value.fixture === undefined ? {} : { fixture: value.fixture }),
    protocolId: value.protocolId,
    protocolVersion: value.protocolVersion,
    batchId: value.batchId,
    batchFingerprint: value.batchFingerprint,
    assignmentId: value.assignmentId,
    reviewerId: value.reviewerId,
    qualificationReceiptFingerprint: value.qualificationReceiptFingerprint,
    instrument: value.instrument,
    taskSetFingerprint: value.taskSetFingerprint,
    tasks: normalizedVisibleTasks(value.tasks),
  };
}

export function communityReviewPacketFingerprint(
  value: Omit<CommunityReviewReviewerPacket, "packetFingerprint">,
): CommunityReviewFingerprint {
  return communityReviewFingerprint(packetFingerprintInput(value));
}

function submissionFingerprintInput(value: Omit<CommunityReviewSubmission, "submissionFingerprint">): unknown {
  return {
    schemaVersion: value.schemaVersion,
    submissionKind: value.submissionKind,
    dataKind: value.dataKind,
    ...(value.fixture === undefined ? {} : { fixture: value.fixture }),
    protocolId: value.protocolId,
    protocolVersion: value.protocolVersion,
    batchId: value.batchId,
    batchFingerprint: value.batchFingerprint,
    assignmentId: value.assignmentId,
    reviewerId: value.reviewerId,
    qualificationReceiptFingerprint: value.qualificationReceiptFingerprint,
    instrument: value.instrument,
    taskSetFingerprint: value.taskSetFingerprint,
    packetFingerprint: value.packetFingerprint,
    submissionDisposition: value.submissionDisposition,
    completed: value.completed,
    annotations: annotationValues(value.annotations),
  };
}

export function communityReviewSubmissionFingerprint(
  value: Omit<CommunityReviewSubmission, "submissionFingerprint">,
): CommunityReviewFingerprint {
  return communityReviewFingerprint(submissionFingerprintInput(value));
}

function normalizedCoverage(value: CommunityReviewCoverage): unknown {
  return {
    requiredIndependentReviewerCount: value.requiredIndependentReviewerCount,
    assignedReviewerCount: value.assignedReviewerCount,
    acceptedReviewerCount: value.acceptedReviewerCount,
    missingReviewerCount: value.missingReviewerCount,
    withdrawnAssignmentCount: value.withdrawnAssignmentCount,
    coverageStatus: value.coverageStatus,
    assignedReviewerIds: [...value.assignedReviewerIds].sort(),
    acceptedReviewerIds: [...value.acceptedReviewerIds].sort(),
    missingReviewerIds: [...value.missingReviewerIds].sort(),
    withdrawnReviewerIds: [...value.withdrawnReviewerIds].sort(),
  };
}

function closeFingerprintInput(value: Omit<CommunityReviewBatchCloseRecord, "closeFingerprint">): unknown {
  return {
    schemaVersion: value.schemaVersion,
    recordKind: value.recordKind,
    dataKind: value.dataKind,
    ...(value.fixture === undefined ? {} : { fixture: value.fixture }),
    protocolId: value.protocolId,
    protocolVersion: value.protocolVersion,
    batchId: value.batchId,
    batchFingerprint: value.batchFingerprint,
    instrument: value.instrument,
    qualificationEligibility: value.qualificationEligibility,
    visibleTaskSetFingerprint: value.visibleTaskSetFingerprint,
    batchPurpose: value.batchPurpose,
    blindnessMode: value.blindnessMode,
    state: value.state,
    acceptedAssignmentIds: [...value.acceptedAssignmentIds].sort(),
    acceptedReviewerIds: [...value.acceptedReviewerIds].sort(),
    acceptedSubmissionFingerprints: [...value.acceptedSubmissionFingerprints].sort(),
    coverage: normalizedCoverage(value.coverage),
  };
}

export function communityReviewCloseFingerprint(
  value: Omit<CommunityReviewBatchCloseRecord, "closeFingerprint">,
): CommunityReviewFingerprint {
  return communityReviewFingerprint(closeFingerprintInput(value));
}

function poolFingerprintInput(value: Omit<FrozenCommunityReviewPool, "freezeFingerprint">): unknown {
  return {
    schemaVersion: value.schemaVersion,
    poolKind: value.poolKind,
    dataKind: value.dataKind,
    ...(value.fixture === undefined ? {} : { fixture: value.fixture }),
    protocolId: value.protocolId,
    protocolVersion: value.protocolVersion,
    batchId: value.batchId,
    batchFingerprint: value.batchFingerprint,
    closeRecordFingerprint: value.closeRecordFingerprint,
    instrument: value.instrument,
    qualificationEligibility: value.qualificationEligibility,
    visibleTaskSetFingerprint: value.visibleTaskSetFingerprint,
    visibleAtomicIds: sortedAtomicIds(value.visibleAtomicIds),
    batchPurpose: value.batchPurpose,
    blindnessMode: value.blindnessMode,
    state: value.state,
    acceptedAssignmentIds: [...value.acceptedAssignmentIds].sort(),
    acceptedReviewerIds: [...value.acceptedReviewerIds].sort(),
    acceptedSubmissionFingerprints: [...value.acceptedSubmissionFingerprints].sort(),
    coverage: normalizedCoverage(value.coverage),
  };
}

export function communityReviewPoolFingerprint(
  value: Omit<FrozenCommunityReviewPool, "freezeFingerprint">,
): CommunityReviewFingerprint {
  return communityReviewFingerprint(poolFingerprintInput(value));
}
