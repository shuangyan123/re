import { createHash, randomBytes } from "node:crypto";

import {
  buildCommunityReviewAssignment,
  buildCommunityReviewAgreementEvidence,
  buildCommunityReviewPublicEvidenceArtifact,
  buildCommunityReviewQualificationReceipt,
  buildCommunityReviewReviewerPacket,
  buildCommunityReviewSubmission,
  closeCommunityReviewBatch,
  communityReviewPublicArtifactFingerprint,
  freezeCommunityReviewPool,
  openCommunityReviewBatch,
  withdrawCommunityReviewAssignment,
} from "../../../src/community-review/index.js";
import {
  assertCommunityReviewSubmissionMatchesAssignment,
  parseCommunityReviewAssignment,
  parseCommunityReviewBatchManifest,
  parseCommunityReviewBatchCloseRecord,
  parseCommunityReviewPublicEvidenceArtifact,
  parseCommunityReviewQualificationReceipt,
  parseCommunityReviewReviewerPacket,
  parseCommunityReviewSubmission,
  parseCommunityReviewVisibleTasks,
  parseFrozenCommunityReviewPool,
} from "../../../src/contracts/community-review-validation.js";
import {
  HUMAN_ATOMIC_STATUSES,
  HUMAN_REFERENCE_EVIDENCE_MAX_LENGTH,
} from "../../../src/contracts/human-reference-calibration.js";
import type {
  CommunityReviewAssignment,
  CommunityReviewAgreementEvidence,
  CommunityReviewBatchManifest,
  CommunityReviewBatchCloseResult,
  CommunityReviewDataKind,
  CommunityReviewDisclosurePolicy,
  CommunityReviewQualificationReceipt,
  CommunityReviewPublicEvidenceArtifact,
  CommunityReviewReviewerPacket,
  CommunityReviewSubmission,
  CommunityReviewSyntheticFixtureMarker,
  CommunityReviewVisibleTask,
  FrozenCommunityReviewPool,
} from "../../../src/contracts/community-review.js";
import {
  canonicalCommunityReviewJson,
  communityReviewAtomicIdentityKey,
  communityReviewFingerprint,
  communityReviewVisibleTaskSetFingerprint,
} from "../../../src/community-review/fingerprint.js";
import { parseAuthenticatedPrincipal } from "./authentication.js";
import type { AuthenticatedPrincipal } from "./authentication.js";
import { CommunityReviewServiceError } from "./errors.js";
import { communityReviewAgreementEvidencePersistenceFingerprint } from "./persistence.js";
import type {
  AcceptedSubmissionRecord,
  AuthAuditEventType,
  CommunityReviewAgreementEvidenceRecord,
  CommunityReviewDisclosureMode,
  CommunityReviewDisclosureRecord,
  CommunityReviewEvidenceAuditEventRecord,
  CommunityReviewEvidenceAuditEventType,
  CommunityReviewPersistence,
  CommunityReviewPersistenceTransaction,
  FrozenReviewPoolRecord,
  QualificationAttemptRecord,
  QualificationAuthorityAuditEventType,
  QualificationPoolRecord,
  QualificationReceiptRecord,
  RejectedSubmissionAttemptRecord,
  ReviewDeliveryAuditEventType,
  ReviewBatchCloseRecord,
  ReviewerAuthIdentityRecord,
  ReviewerAccountRecord,
  ReviewerInvitationAuditEventRecord,
  ReviewerInvitationRecord,
  ReviewerConsentRecord,
  ReviewerInvitationState,
  ReviewerConsentState,
  ReviewAssignmentRecord,
  ReviewBatchRecord,
  ReviewSubmissionAuditEventRecord,
  SealedBatchPayloadReferenceRecord,
} from "./persistence.js";
import type { ReviewBatchMaterialLookup, ReviewBatchMaterialStore } from "./material.js";
import { ReviewBatchMaterialError } from "./material.js";
import {
  QUALIFICATION_PASS_RULE_ID,
  buildQualificationVisiblePacket,
  evaluateQualification,
  parseQualificationPrivateAnswerKey,
  parseQualificationResponses,
  parseQualificationVisibleMaterial,
  qualificationAnswerKeyCommitment,
  qualificationDefinitionFingerprint,
  qualificationResponseFingerprint,
  qualificationVisibleTaskSetFingerprint,
  QualificationMaterialError,
  QualificationResponseError,
} from "./qualification.js";
import type {
  QualificationEvaluation,
  QualificationMaterialIdentity,
  QualificationMaterialStore,
  QualificationPrivateAnswerKey,
  QualificationResponse,
  QualificationVisibleMaterial,
  QualificationVisiblePacket,
} from "./qualification.js";

const opaqueIdPattern = /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/u;
const fingerprintPattern = /^sha256:[0-9a-f]{64}$/u;
const humanAtomicStatusSet = new Set<string>(HUMAN_ATOMIC_STATUSES);

export interface ReviewerConsentPolicy {
  readonly policyId: string;
  readonly policyVersion: string;
}

export const DEFAULT_REVIEWER_CONSENT_POLICY: ReviewerConsentPolicy = {
  policyId: "community-review",
  policyVersion: "1.0.0",
};

export interface ReviewerConsentSnapshot {
  readonly policyId: string;
  readonly policyVersion: string;
  readonly state: ReviewerConsentState;
  readonly consentEventId?: string;
  readonly acceptedAt?: string;
  readonly revokedAt?: string;
}

type OpaqueIdGenerator = () => string;

function same(left: unknown, right: unknown): boolean {
  return canonicalCommunityReviewJson(left) === canonicalCommunityReviewJson(right);
}

function required(value: string): void {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new CommunityReviewServiceError("invalid_service_record");
  }
}

function opaqueId(value: string): void {
  if (typeof value !== "string" || !opaqueIdPattern.test(value) || value.includes("@")) {
    throw new CommunityReviewServiceError("invalid_service_record");
  }
}

function optionalOpaqueAuditId(value: string): string | undefined {
  return typeof value === "string" && opaqueIdPattern.test(value) && !value.includes("@")
    ? value
    : undefined;
}

function fingerprint(value: string): void {
  if (!fingerprintPattern.test(value)) {
    throw new CommunityReviewServiceError("invalid_service_record");
  }
}

function fixtureMatches(
  left: CommunityReviewSyntheticFixtureMarker | undefined,
  right: CommunityReviewSyntheticFixtureMarker | undefined,
): boolean {
  return same(left, right);
}

function validPolicy(policy: ReviewerConsentPolicy): void {
  required(policy.policyId);
  required(policy.policyVersion);
  if (policy.policyId.length > 128 || policy.policyVersion.length > 128 ||
    policy.policyId.includes("\u0000") || policy.policyVersion.includes("\u0000")) {
    throw new CommunityReviewServiceError("invalid_service_record");
  }
}

function randomOpaqueId(): string {
  return randomBytes(32).toString("hex");
}

function randomAttemptNonce(): string {
  return randomBytes(32).toString("base64url");
}

function randomInvitationSecret(): string {
  return randomBytes(32).toString("base64url");
}

function hashAttemptNonce(value: string): string {
  return `sha256:${createHash("sha256").update(value, "utf8").digest("hex")}`;
}

function hashInvitationSecret(value: string): string {
  return `sha256:${createHash("sha256").update(value, "utf8").digest("hex")}`;
}

function invitationSecretIsWellFormed(value: string): boolean {
  return /^[A-Za-z0-9_-]{43}$/u.test(value);
}

function timestampOrThrow(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new CommunityReviewServiceError("invalid_service_record");
  return parsed.toISOString();
}

function addMilliseconds(timestamp: string, milliseconds: number): string {
  const value = Date.parse(timestamp);
  if (!Number.isSafeInteger(value) || !Number.isSafeInteger(milliseconds) || milliseconds <= 0) {
    throw new CommunityReviewServiceError("invalid_service_record");
  }
  const result = new Date(value + milliseconds);
  if (Number.isNaN(result.getTime())) throw new CommunityReviewServiceError("invalid_service_record");
  return result.toISOString();
}

function validAttemptNonce(value: string): void {
  if (typeof value !== "string" || value.length < 16 || value.length > 512 ||
    value.includes("\u0000")) throw new CommunityReviewServiceError("qualification_response_invalid");
}

function accountOrThrow(
  transaction: CommunityReviewPersistenceTransaction,
  reviewerId: string,
): ReviewerAccountRecord {
  const account = transaction.getReviewerAccountByReviewerId(reviewerId);
  if (account === undefined) throw new CommunityReviewServiceError("reviewer_not_found");
  return account;
}

function consentSnapshotFromHistory(
  account: ReviewerAccountRecord,
  history: readonly ReviewerConsentRecord[],
  policy: ReviewerConsentPolicy,
  legacyProjectionPolicyId: string,
): ReviewerConsentSnapshot {
  const latest = history[history.length - 1];
  if (latest !== undefined) {
    const priorAccepted = latest.state === "REVOKED"
      ? [...history].reverse().find((event) => event.state === "ACCEPTED")
      : undefined;
    return latest.state === "ACCEPTED"
      ? {
        policyId: policy.policyId,
        policyVersion: policy.policyVersion,
        state: "CONSENTED",
        consentEventId: latest.consentEventId,
        ...(latest.acceptedAt === undefined ? {} : { acceptedAt: latest.acceptedAt }),
      }
      : {
        policyId: policy.policyId,
        policyVersion: policy.policyVersion,
        state: "REVOKED",
        consentEventId: latest.consentEventId,
        ...(priorAccepted?.acceptedAt === undefined ? {} : { acceptedAt: priorAccepted.acceptedAt }),
        ...(latest.revokedAt === undefined ? {} : { revokedAt: latest.revokedAt }),
      };
  }
  if (policy.policyId !== legacyProjectionPolicyId) {
    return {
      policyId: policy.policyId,
      policyVersion: policy.policyVersion,
      state: "NOT_CONSENTED",
    };
  }
  if (account.consentVersion === policy.policyVersion && account.consentState === "CONSENTED") {
    return {
      policyId: policy.policyId,
      policyVersion: policy.policyVersion,
      state: "CONSENTED",
    };
  }
  if (account.consentVersion === policy.policyVersion && account.consentState === "REVOKED") {
    return {
      policyId: policy.policyId,
      policyVersion: policy.policyVersion,
      state: "REVOKED",
    };
  }
  return {
    policyId: policy.policyId,
    policyVersion: account.consentVersion,
    state: account.consentState === "CONSENTED" || account.consentState === "REVOKED"
      ? account.consentState
      : "NOT_CONSENTED",
  };
}

function currentConsent(
  transaction: CommunityReviewPersistenceTransaction,
  account: ReviewerAccountRecord,
  policy: ReviewerConsentPolicy,
  legacyProjectionPolicyId = policy.policyId,
): ReviewerConsentSnapshot {
  return consentSnapshotFromHistory(
    account,
    transaction.listReviewerConsentHistory(account.internalId, policy.policyId, policy.policyVersion),
    policy,
    legacyProjectionPolicyId,
  );
}

function parseReceipt(value: unknown): CommunityReviewQualificationReceipt {
  try {
    return parseCommunityReviewQualificationReceipt(value);
  } catch {
    throw new CommunityReviewServiceError("qualification_receipt_invalid");
  }
}

function eligibleAccount(
  transaction: CommunityReviewPersistenceTransaction,
  reviewerId: string,
  policy: ReviewerConsentPolicy,
  legacyProjectionPolicyId = policy.policyId,
): ReviewerAccountRecord {
  const account = accountOrThrow(transaction, reviewerId);
  if (account.status === "WITHDRAWN") {
    throw new CommunityReviewServiceError("reviewer_account_withdrawn");
  }
  if (account.status === "DISABLED") {
    throw new CommunityReviewServiceError("reviewer_account_disabled");
  }
  const consent = currentConsent(transaction, account, policy, legacyProjectionPolicyId);
  if (consent.policyVersion !== policy.policyVersion || consent.policyId !== policy.policyId) {
    throw new CommunityReviewServiceError("consent_stale");
  }
  if (consent.state === "REVOKED") throw new CommunityReviewServiceError("consent_revoked");
  if (consent.state === "NOT_CONSENTED") throw new CommunityReviewServiceError("consent_required");
  return account;
}

function authoritativeReceipt(
  transaction: CommunityReviewPersistenceTransaction,
  receipt: CommunityReviewQualificationReceipt,
): CommunityReviewQualificationReceipt {
  const stored = transaction.getQualificationReceipt(receipt.receiptFingerprint);
  if (stored === undefined || stored.authorityState !== "authoritative" ||
    !same(stored.receipt, receipt)) {
    throw new CommunityReviewServiceError("qualification_receipt_not_authoritative");
  }
  return stored.receipt;
}

function batchOrThrow(
  transaction: CommunityReviewPersistenceTransaction,
  batchId: string,
): ReviewBatchRecord {
  const batch = transaction.getBatch(batchId);
  if (batch === undefined) throw new CommunityReviewServiceError("batch_not_found");
  return batch;
}

function assignmentOrThrow(
  transaction: CommunityReviewPersistenceTransaction,
  assignmentId: string,
): ReviewAssignmentRecord {
  const assignment = transaction.getAssignment(assignmentId);
  if (assignment === undefined) throw new CommunityReviewServiceError("assignment_not_found");
  return assignment;
}

function sortedSubmissionValues(
  submissions: readonly CommunityReviewSubmission[],
): CommunityReviewSubmission[] {
  return [...submissions].sort((left, right) =>
    left.submissionFingerprint.localeCompare(right.submissionFingerprint));
}

function sameSubmissionSet(
  left: readonly CommunityReviewSubmission[],
  right: readonly CommunityReviewSubmission[],
): boolean {
  return same(sortedSubmissionValues(left), sortedSubmissionValues(right));
}

function recordValue(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null
    ? value as Record<string, unknown>
    : undefined;
}

function classifyAnnotationShape(
  packet: CommunityReviewReviewerPacket,
  annotations: readonly unknown[],
): string | undefined {
  if (!Array.isArray(annotations)) return "atomic_incomplete";
  const expected = new Set(packet.tasks.flatMap((task) => task.rubrics.flatMap((rubric) =>
    rubric.requirements.map((requirement) => communityReviewAtomicIdentityKey({
      caseId: task.caseId,
      rubricId: rubric.id,
      requirementId: requirement.id,
    }))
  )));
  const observed = new Set<string>();
  for (const value of annotations) {
    const annotation = recordValue(value);
    if (annotation === undefined || typeof annotation.caseId !== "string" ||
      typeof annotation.rubricId !== "string" || typeof annotation.requirementId !== "string") {
      return "atomic_incomplete";
    }
    if (typeof annotation.status !== "string" || !humanAtomicStatusSet.has(annotation.status)) {
      return "invalid_status";
    }
    if (annotation.evidence !== undefined && (typeof annotation.evidence !== "string" ||
      annotation.evidence.trim().length === 0 ||
      annotation.evidence.length > HUMAN_REFERENCE_EVIDENCE_MAX_LENGTH)) {
      return "malformed_evidence";
    }
    const key = communityReviewAtomicIdentityKey({
      caseId: annotation.caseId,
      rubricId: annotation.rubricId,
      requirementId: annotation.requirementId,
    });
    if (observed.has(key)) return "atomic_duplicate";
    observed.add(key);
    if (!expected.has(key)) return "atomic_extra";
  }
  return observed.size !== expected.size ? "atomic_incomplete" : undefined;
}

function submissionRejectionReason(error: unknown, suggestedReason?: string): string {
  if (suggestedReason !== undefined) return suggestedReason;
  if (!(error instanceof CommunityReviewServiceError)) return "protocol_validation_failed";
  switch (error.code) {
    case "batch_not_open": return "batch_not_open";
    case "assignment_withdrawn": return "assignment_withdrawn";
    case "reviewer_not_authorized": return "wrong_owner";
    case "submission_already_exists": return "duplicate_submission";
    case "replacement_submission": return "replacement_submission";
    case "assignment_not_found": return "assignment_not_found";
    case "qualification_packet_invalid": return "packet_mismatch";
    case "qualification_receipt_not_authoritative": return "packet_mismatch";
    default: return error.code;
  }
}

function assertStoredAssignmentMatchesBatch(
  batch: ReviewBatchRecord,
  stored: ReviewAssignmentRecord,
): { readonly assignment: CommunityReviewAssignment; readonly packet: CommunityReviewReviewerPacket } {
  let assignment: CommunityReviewAssignment;
  let packet: CommunityReviewReviewerPacket;
  try {
    assignment = parseCommunityReviewAssignment(stored.assignment);
    packet = parseCommunityReviewReviewerPacket(stored.packet);
  } catch {
    throw new CommunityReviewServiceError("invalid_service_record");
  }
  const packetAtomicIds = packet.tasks.flatMap((task) => task.rubrics.flatMap((rubric) =>
    rubric.requirements.map((requirement) => communityReviewAtomicIdentityKey({
      caseId: task.caseId,
      rubricId: rubric.id,
      requirementId: requirement.id,
    }))
  )).sort();
  const assignmentAtomicIds = assignment.visibleAtomicIds.map(communityReviewAtomicIdentityKey).sort();
  if (assignment.batchId !== batch.batchId || assignment.batchFingerprint !== batch.batchFingerprint ||
    assignment.protocolId !== batch.manifest.protocolId || assignment.protocolVersion !== batch.manifest.protocolVersion ||
    assignment.dataKind !== batch.manifest.dataKind || !fixtureMatches(assignment.fixture, batch.manifest.fixture) ||
    !same(assignment.instrument, batch.manifest.instrument) ||
    assignment.visibleTaskSetFingerprint !== batch.manifest.visibleTaskSetFingerprint ||
    packet.dataKind !== assignment.dataKind || !fixtureMatches(packet.fixture, assignment.fixture) ||
    packet.protocolId !== assignment.protocolId || packet.protocolVersion !== assignment.protocolVersion ||
    packet.assignmentId !== assignment.assignmentId || packet.batchId !== assignment.batchId ||
    packet.batchFingerprint !== assignment.batchFingerprint || packet.reviewerId !== assignment.reviewerId ||
    packet.qualificationReceiptFingerprint !== assignment.qualificationReceiptFingerprint ||
    packet.taskSetFingerprint !== assignment.visibleTaskSetFingerprint ||
    !same(packet.instrument, assignment.instrument) ||
    !same(packetAtomicIds, assignmentAtomicIds)) {
    throw new CommunityReviewServiceError("invalid_service_record");
  }
  return { assignment, packet };
}

function closeResultFromStoredRecord(
  batch: ReviewBatchRecord,
  stored: ReviewBatchCloseRecord,
): CommunityReviewBatchCloseResult {
  try {
    const closeManifest = parseCommunityReviewBatchManifest(stored.manifest);
    const closeRecord = parseCommunityReviewBatchCloseRecord(stored.closeRecord);
    const acceptedSubmissions = stored.acceptedSubmissions.map((submission) =>
      parseCommunityReviewSubmission(submission));
    if (stored.batchId !== batch.batchId || closeManifest.batchId !== batch.batchId ||
      closeManifest.state !== "CLOSED" || closeRecord.batchId !== batch.batchId ||
      closeRecord.batchFingerprint !== batch.batchFingerprint ||
      closeRecord.dataKind !== closeManifest.dataKind || !fixtureMatches(closeRecord.fixture, closeManifest.fixture) ||
      closeRecord.protocolId !== closeManifest.protocolId || closeRecord.protocolVersion !== closeManifest.protocolVersion ||
      !same(closeRecord.instrument, closeManifest.instrument) ||
      !same(closeRecord.qualificationEligibility, closeManifest.qualificationEligibility) ||
      closeRecord.visibleTaskSetFingerprint !== closeManifest.visibleTaskSetFingerprint ||
      closeRecord.batchPurpose !== closeManifest.batchPurpose ||
      closeRecord.blindnessMode !== closeManifest.blindnessMode ||
      closeManifest.closeRecordFingerprint !== closeRecord.closeFingerprint ||
      acceptedSubmissions.some((submission) => submission.submissionDisposition !== "accepted-before-close" ||
        submission.dataKind !== closeRecord.dataKind || !fixtureMatches(submission.fixture, closeRecord.fixture) ||
        !same(submission.instrument, closeRecord.instrument) ||
        submission.taskSetFingerprint !== closeRecord.visibleTaskSetFingerprint) ||
      new Set(acceptedSubmissions.map((submission) => submission.assignmentId)).size !== acceptedSubmissions.length ||
      new Set(acceptedSubmissions.map((submission) => submission.reviewerId)).size !== acceptedSubmissions.length ||
      new Set(acceptedSubmissions.map((submission) => submission.submissionFingerprint)).size !== acceptedSubmissions.length ||
      !same(closeRecord.acceptedAssignmentIds,
        acceptedSubmissions.map((submission) => submission.assignmentId).sort()) ||
      !same(closeRecord.acceptedReviewerIds,
        acceptedSubmissions.map((submission) => submission.reviewerId).sort()) ||
      !same(closeRecord.acceptedSubmissionFingerprints,
        acceptedSubmissions.map((submission) => submission.submissionFingerprint).sort()) ||
      batch.state === "CLOSED" && !same(batch.manifest, closeManifest) ||
      batch.state === "FROZEN" && (batch.manifest.closeRecordFingerprint !== closeRecord.closeFingerprint ||
        batch.manifest.freezeFingerprint === undefined)) {
      throw new CommunityReviewServiceError("invalid_service_record");
    }
    return { manifest: closeManifest, closeRecord, acceptedSubmissions };
  } catch (error) {
    if (error instanceof CommunityReviewServiceError) throw error;
    throw new CommunityReviewServiceError("invalid_service_record");
  }
}

const PRIVATE_DISCLOSURE_POLICY: CommunityReviewDisclosurePolicy = {
  publishReviewerIds: false,
  publishAtomicAnnotations: false,
  publishReviewerEvidence: false,
};

function policyHasPublishedFields(policy: CommunityReviewDisclosurePolicy): boolean {
  return policy.publishReviewerIds || policy.publishAtomicAnnotations || policy.publishReviewerEvidence;
}

function parseDisclosurePolicy(value: unknown): CommunityReviewDisclosurePolicy {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new CommunityReviewServiceError("disclosure_policy_invalid");
  }
  const policy = value as Record<string, unknown>;
  if (Object.keys(policy).some((key) => ![
    "publishReviewerIds",
    "publishAtomicAnnotations",
    "publishReviewerEvidence",
  ].includes(key)) || typeof policy.publishReviewerIds !== "boolean" ||
    typeof policy.publishAtomicAnnotations !== "boolean" ||
    typeof policy.publishReviewerEvidence !== "boolean") {
    throw new CommunityReviewServiceError("disclosure_policy_invalid");
  }
  return {
    publishReviewerIds: policy.publishReviewerIds,
    publishAtomicAnnotations: policy.publishAtomicAnnotations,
    publishReviewerEvidence: policy.publishReviewerEvidence,
  };
}

function validDisclosureDate(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00.000Z`)) ||
    new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10) !== value) {
    throw new CommunityReviewServiceError("disclosure_policy_invalid");
  }
  return value;
}

function publicArtifactIdentityFingerprint(artifact: CommunityReviewPublicEvidenceArtifact): string {
  const { disclosureDate, ...identity } = artifact;
  if (disclosureDate.length === 0) throw new CommunityReviewServiceError("invalid_service_record");
  return communityReviewPublicArtifactFingerprint(identity);
}

function assertPersistedFrozenPool(
  batch: ReviewBatchRecord,
  stored: FrozenReviewPoolRecord,
  closeResult: CommunityReviewBatchCloseResult,
): FrozenCommunityReviewPool {
  try {
    const pool = parseFrozenCommunityReviewPool(stored.frozenPool);
    if (stored.batchId !== batch.batchId || batch.state !== "FROZEN" || batch.manifest.state !== "FROZEN" ||
      batch.manifest.freezeFingerprint !== pool.freezeFingerprint ||
      batch.manifest.closeRecordFingerprint !== pool.closeRecordFingerprint ||
      pool.batchId !== batch.batchId || pool.batchFingerprint !== batch.batchFingerprint) {
      throw new CommunityReviewServiceError("invalid_service_record");
    }
    // Recompute only as an integrity check against the immutable close record;
    // the returned authority remains the exact persisted pool object.
    if (!same(freezeCommunityReviewPool(closeResult), pool)) {
      throw new CommunityReviewServiceError("invalid_service_record");
    }
    return stored.frozenPool;
  } catch (error) {
    if (error instanceof CommunityReviewServiceError) throw error;
    throw new CommunityReviewServiceError("invalid_service_record");
  }
}

function assertCloseSnapshotMatchesCurrentAuthority(
  transaction: CommunityReviewPersistenceTransaction,
  batch: ReviewBatchRecord,
  storedClose: ReviewBatchCloseRecord,
): CommunityReviewBatchCloseResult {
  const result = closeResultFromStoredRecord(batch, storedClose);
  const assignmentRecords = transaction.listAssignments(batch.batchId);
  const assignments = assignmentRecords.map((record) => {
    return assertStoredAssignmentMatchesBatch(batch, record).assignment;
  });
  const assignedReviewerIds = assignments.map((assignment) => assignment.reviewerId).sort();
  const withdrawnReviewerIds = assignments
    .filter((assignment) => assignment.assignmentState === "withdrawn")
    .map((assignment) => assignment.reviewerId)
    .sort();
  if (new Set(assignedReviewerIds).size !== assignedReviewerIds.length ||
    !same(assignedReviewerIds, [...result.closeRecord.coverage.assignedReviewerIds].sort()) ||
    !same(withdrawnReviewerIds, [...result.closeRecord.coverage.withdrawnReviewerIds].sort())) {
    throw new CommunityReviewServiceError("invalid_service_record");
  }

  const acceptedRecords = transaction.listAcceptedSubmissions(batch.batchId);
  const acceptedSubmissions = acceptedRecords.map((record) => {
    const assignmentRecord = transaction.getAssignment(record.submission.assignmentId);
    if (assignmentRecord === undefined || assignmentRecord.assignment.batchId !== batch.batchId) {
      throw new CommunityReviewServiceError("invalid_service_record");
    }
    const { assignment, packet } = assertStoredAssignmentMatchesBatch(batch, assignmentRecord);
    if (assignment.assignmentState !== "assigned") {
      throw new CommunityReviewServiceError("invalid_service_record");
    }
    try {
      return assertCommunityReviewSubmissionMatchesAssignment(
        assignment,
        record.submission,
        packet.packetFingerprint,
      ).submission;
    } catch {
      throw new CommunityReviewServiceError("invalid_service_record");
    }
  });
  if (!sameSubmissionSet(acceptedSubmissions, result.acceptedSubmissions) ||
    !same(result.closeRecord.acceptedAssignmentIds,
      acceptedSubmissions.map((submission) => submission.assignmentId).sort()) ||
    !same(result.closeRecord.acceptedReviewerIds,
      acceptedSubmissions.map((submission) => submission.reviewerId).sort()) ||
    !same(result.closeRecord.acceptedSubmissionFingerprints,
      acceptedSubmissions.map((submission) => submission.submissionFingerprint).sort())) {
    throw new CommunityReviewServiceError("invalid_service_record");
  }
  const acceptedReviewerIds = acceptedSubmissions.map((submission) => submission.reviewerId).sort();
  const missingReviewerIds = assignedReviewerIds.filter((reviewerId) =>
    !acceptedReviewerIds.includes(reviewerId) && !withdrawnReviewerIds.includes(reviewerId));
  if (!same(acceptedReviewerIds, [...result.closeRecord.coverage.acceptedReviewerIds].sort()) ||
    !same(missingReviewerIds, [...result.closeRecord.coverage.missingReviewerIds].sort())) {
    throw new CommunityReviewServiceError("invalid_service_record");
  }
  return result;
}

function assertPersistedAgreementEvidence(
  batch: ReviewBatchRecord,
  pool: FrozenCommunityReviewPool,
  record: CommunityReviewAgreementEvidenceRecord,
): CommunityReviewAgreementEvidence {
  try {
    if (record.batchId !== batch.batchId || record.freezeFingerprint !== pool.freezeFingerprint ||
      record.evidence.poolFingerprint !== pool.freezeFingerprint ||
      record.evidence.agreementKind !== "community-review-agreement" ||
      !same(record.evidence, buildCommunityReviewAgreementEvidence(pool)) ||
      record.evidencePersistenceFingerprint !== communityReviewAgreementEvidencePersistenceFingerprint({
        batchId: record.batchId,
        freezeFingerprint: record.freezeFingerprint,
        evidence: record.evidence,
      })) {
      throw new CommunityReviewServiceError("invalid_service_record");
    }
    return record.evidence;
  } catch (error) {
    if (error instanceof CommunityReviewServiceError) throw error;
    throw new CommunityReviewServiceError("invalid_service_record");
  }
}

function assertPersistedDisclosure(
  batch: ReviewBatchRecord,
  pool: FrozenCommunityReviewPool,
  agreement: CommunityReviewAgreementEvidenceRecord,
  record: CommunityReviewDisclosureRecord,
): CommunityReviewDisclosureRecord {
  if (record.batchId !== batch.batchId || record.freezeFingerprint !== pool.freezeFingerprint ||
    record.agreementEvidencePersistenceFingerprint !== agreement.evidencePersistenceFingerprint ||
    (record.mode !== "PRIVATE" && record.mode !== "PUBLIC")) {
    throw new CommunityReviewServiceError("invalid_service_record");
  }
  let policy: CommunityReviewDisclosurePolicy;
  try {
    policy = parseDisclosurePolicy(record.disclosurePolicy);
  } catch {
    throw new CommunityReviewServiceError("invalid_service_record");
  }
  if (!same(policy, record.disclosurePolicy)) throw new CommunityReviewServiceError("invalid_service_record");
  if (record.mode === "PRIVATE") {
    if (record.disclosureDate !== undefined || record.publicArtifact !== undefined ||
      record.publicArtifactFingerprint !== undefined || policyHasPublishedFields(policy)) {
      throw new CommunityReviewServiceError("invalid_service_record");
    }
    return record;
  }
  if (record.disclosureDate === undefined || record.publicArtifact === undefined ||
    record.publicArtifactFingerprint === undefined) {
    throw new CommunityReviewServiceError("invalid_service_record");
  }
  try {
    const artifact = parseCommunityReviewPublicEvidenceArtifact(record.publicArtifact);
    if (artifact.batchId !== batch.batchId || artifact.batchFingerprint !== batch.batchFingerprint ||
      artifact.frozenPoolFingerprint !== pool.freezeFingerprint ||
      artifact.visibleTaskSetFingerprint !== pool.visibleTaskSetFingerprint ||
      !same(artifact.acceptedSubmissionFingerprints, pool.acceptedSubmissionFingerprints) ||
      artifact.disclosureDate !== record.disclosureDate || !same(artifact.disclosurePolicy, policy) ||
      publicArtifactIdentityFingerprint(artifact) !== record.publicArtifactFingerprint ||
      !same(artifact, buildCommunityReviewPublicEvidenceArtifact(pool, {
        disclosureDate: record.disclosureDate,
        disclosurePolicy: policy,
      }))) {
      throw new CommunityReviewServiceError("invalid_service_record");
    }
  } catch (error) {
    if (error instanceof CommunityReviewServiceError) throw error;
    throw new CommunityReviewServiceError("invalid_service_record");
  }
  return record;
}

function disclosureIdentity(
  batchId: string,
  freezeFingerprint: string,
  agreementEvidencePersistenceFingerprint: string,
  mode: CommunityReviewDisclosureMode,
  policy: CommunityReviewDisclosurePolicy,
  disclosureDate: string | undefined,
): string {
  const identity = communityReviewFingerprint({
    persistenceKind: "community-review-disclosure",
    batchId,
    freezeFingerprint,
    agreementEvidencePersistenceFingerprint,
    mode,
    disclosurePolicy: policy,
    ...(disclosureDate === undefined ? {} : { disclosureDate }),
  });
  return `disclosure-${identity.slice("sha256:".length, "sha256:".length + 32)}`;
}

function resolveDisclosureRequest(
  input: CreateCommunityReviewDisclosureInput,
): {
  readonly mode: CommunityReviewDisclosureMode;
  readonly disclosurePolicy: CommunityReviewDisclosurePolicy;
  readonly disclosureDate?: string;
} {
  const mode = input.mode ?? (input.disclosurePolicy === undefined ? "PRIVATE" : "PUBLIC");
  if (mode !== "PRIVATE" && mode !== "PUBLIC") {
    throw new CommunityReviewServiceError("disclosure_policy_invalid");
  }
  const disclosurePolicy = input.disclosurePolicy === undefined
    ? PRIVATE_DISCLOSURE_POLICY
    : parseDisclosurePolicy(input.disclosurePolicy);
  if (mode === "PRIVATE") {
    if (input.disclosureDate !== undefined || policyHasPublishedFields(disclosurePolicy)) {
      throw new CommunityReviewServiceError("disclosure_policy_invalid");
    }
    return { mode, disclosurePolicy };
  }
  if (input.disclosurePolicy === undefined) {
    throw new CommunityReviewServiceError("disclosure_policy_invalid");
  }
  if (input.disclosureDate === undefined) {
    throw new CommunityReviewServiceError("disclosure_policy_invalid");
  }
  const disclosureDate = validDisclosureDate(input.disclosureDate);
  return { mode, disclosurePolicy, disclosureDate };
}

function qualificationPoolOrThrow(
  transaction: CommunityReviewPersistenceTransaction,
  poolId: string,
  poolVersion: string,
): QualificationPoolRecord {
  const pool = transaction.getQualificationPool(poolId, poolVersion);
  if (pool === undefined) throw new CommunityReviewServiceError("qualification_pool_not_found");
  return pool;
}

function receiptMatchesBatch(
  transaction: CommunityReviewPersistenceTransaction,
  stored: QualificationReceiptRecord,
  manifest: CommunityReviewBatchManifest,
  reviewerId: string,
): boolean {
  if (stored.authorityState !== "authoritative" || stored.reviewerId !== reviewerId ||
    stored.receipt.reviewerId !== reviewerId || stored.receipt.receiptFingerprint !== stored.receiptFingerprint) {
    return false;
  }
  const receipt = stored.receipt;
  const eligibility = manifest.qualificationEligibility;
  const pool = transaction.getQualificationPool(receipt.qualificationPoolId, receipt.qualificationPoolVersion);
  if (pool === undefined || pool.state !== "ACTIVE" ||
    pool.dataKind !== manifest.dataKind || !fixtureMatches(pool.fixture, manifest.fixture) ||
    pool.qualificationId !== eligibility.qualificationId ||
    pool.qualificationVersion !== eligibility.qualificationVersion ||
    pool.poolId !== eligibility.qualificationPoolId ||
    pool.poolVersion !== eligibility.qualificationPoolVersion ||
    pool.definitionFingerprint !== eligibility.qualificationDefinitionFingerprint ||
    pool.instrumentFingerprint !== manifest.instrument.fingerprint ||
    pool.reviewLocale !== manifest.instrument.reviewLocale) {
    return false;
  }
  return receipt.protocolId === manifest.protocolId &&
    receipt.protocolVersion === manifest.protocolVersion &&
    receipt.dataKind === manifest.dataKind &&
    fixtureMatches(receipt.fixture, manifest.fixture) &&
    receipt.qualificationProtocolId === eligibility.qualificationProtocolId &&
    receipt.qualificationProtocolVersion === eligibility.qualificationProtocolVersion &&
    receipt.qualificationId === eligibility.qualificationId &&
    receipt.qualificationVersion === eligibility.qualificationVersion &&
    receipt.qualificationPoolId === eligibility.qualificationPoolId &&
    receipt.qualificationPoolVersion === eligibility.qualificationPoolVersion &&
    receipt.qualificationDefinitionFingerprint === eligibility.qualificationDefinitionFingerprint &&
    receipt.reviewLocale === manifest.instrument.reviewLocale &&
    receipt.instrumentEligibility.instrumentId === manifest.instrument.instrumentId &&
    receipt.instrumentEligibility.instrumentVersion === manifest.instrument.instrumentVersion &&
    receipt.instrumentEligibility.instrumentFingerprint === manifest.instrument.fingerprint &&
    receipt.instrumentEligibility.reviewLocale === manifest.instrument.reviewLocale;
}

function batchMaterialLookup(
  batch: ReviewBatchRecord,
  reference: SealedBatchPayloadReferenceRecord | undefined,
): ReviewBatchMaterialLookup {
  const manifest = batch.manifest;
  if (reference === undefined || batch.batchId !== manifest.batchId ||
    batch.batchFingerprint !== manifest.batchFingerprint || batch.state !== manifest.state ||
    reference.batchId !== batch.batchId || reference.sourceReference !== batch.sealedSourceReference ||
    reference.visibleTaskSetFingerprint !== manifest.visibleTaskSetFingerprint) {
    throw new CommunityReviewServiceError("review_batch_material_invalid");
  }
  return {
    batchId: manifest.batchId,
    batchFingerprint: manifest.batchFingerprint,
    dataKind: manifest.dataKind,
    ...(manifest.fixture === undefined ? {} : { fixture: manifest.fixture }),
    sealedSourceReference: reference.sourceReference,
    sealedSourceFingerprint: manifest.sealedSourceFingerprint,
    visibleTaskSetFingerprint: manifest.visibleTaskSetFingerprint,
    instrument: manifest.instrument,
    qualificationEligibility: manifest.qualificationEligibility,
  };
}

function qualificationMaterialIdentity(pool: QualificationPoolRecord): QualificationMaterialIdentity {
  const instrument = pool.instrument;
  if (instrument === undefined || pool.state === "OPEN") {
    throw new CommunityReviewServiceError("qualification_material_invalid");
  }
  return {
    qualificationId: pool.qualificationId,
    qualificationVersion: pool.qualificationVersion,
    qualificationPoolId: pool.poolId,
    qualificationPoolVersion: pool.poolVersion,
    qualificationDefinitionFingerprint: pool.definitionFingerprint,
    instrumentId: instrument.instrumentId,
    instrumentVersion: instrument.instrumentVersion,
    instrumentFingerprint: pool.instrumentFingerprint,
    reviewLocale: pool.reviewLocale,
    sealedDefinitionReference: pool.sealedDefinitionReference,
    privateAnswerKeyReference: pool.privateAnswerKeyReference,
  };
}

export interface CommunityReviewServiceOptions {
  readonly clock?: () => string;
  readonly consentPolicy?: ReviewerConsentPolicy;
  readonly qualificationMaterialStore?: QualificationMaterialStore;
  /** Private store used to resolve sealed batch material into visible tasks. */
  readonly reviewBatchMaterialStore?: ReviewBatchMaterialStore;
  /** Maximum issued/evaluated attempts counted for one reviewer and pool. */
  readonly maxQualificationAttemptsPerReviewerPool?: number;
  readonly reviewerIdGenerator?: OpaqueIdGenerator;
  readonly internalIdGenerator?: OpaqueIdGenerator;
  readonly authIdentityIdGenerator?: OpaqueIdGenerator;
  readonly consentEventIdGenerator?: OpaqueIdGenerator;
  readonly auditEventIdGenerator?: OpaqueIdGenerator;
  readonly rejectionIdGenerator?: OpaqueIdGenerator;
  readonly attemptIdGenerator?: OpaqueIdGenerator;
  readonly attemptNonceGenerator?: () => string;
  /** Disabled by default; C3C/provider activation must explicitly enable it. */
  readonly reviewerInvitationEnabled?: boolean;
  readonly reviewerInvitationTtlMs?: number;
  readonly invitationIdGenerator?: OpaqueIdGenerator;
  readonly invitationSecretGenerator?: () => string;
  readonly invitationAuditEventIdGenerator?: OpaqueIdGenerator;
}

export interface RegisterReviewerAccountInput {
  readonly internalId: string;
  readonly reviewerId: string;
  readonly privateAuthSubjectReference: string;
  /** Legacy summary field for trusted synthetic setup; it does not grant consent. */
  readonly consentVersion?: string;
  readonly consentState?: ReviewerAccountRecord["consentState"];
  readonly status?: ReviewerAccountRecord["status"];
}

export interface RecordReviewerConsentInput {
  readonly reviewerId: string;
  readonly policyId?: string;
  readonly policyVersion?: string;
}

export type RevokeReviewerConsentInput = RecordReviewerConsentInput;

export interface GetReviewerConsentInput {
  readonly reviewerId: string;
  readonly policyId?: string;
  readonly policyVersion?: string;
}

export interface ReviewerAccountLifecycleInput {
  readonly reviewerId: string;
}

export interface ProvisionReviewerAccountInput {
  readonly principal: AuthenticatedPrincipal;
}

export interface LinkReviewerAuthIdentityInput {
  readonly reviewerId: string;
  readonly principal: AuthenticatedPrincipal;
}

export interface CreateReviewerInvitationInput {
  readonly applicationId?: string;
}

export interface ReviewerInvitationLifecycleInput {
  readonly invitationId: string;
}

export interface RedeemReviewerInvitationInput {
  readonly credential: string;
  readonly principal: AuthenticatedPrincipal;
}

export interface ReviewerInvitationProjection {
  readonly invitationId: string;
  readonly applicationId?: string;
  readonly state: ReviewerInvitationState;
  readonly issuedAt: string;
  readonly expiresAt: string;
  readonly consumedAt?: string;
  readonly revokedAt?: string;
  readonly expiredAt?: string;
}

export interface ReviewerInvitationIssuance {
  readonly invitation: ReviewerInvitationProjection;
  /** Returned only by the one-time issuance response. */
  readonly credential: string;
}

export interface RegisterQualificationPoolInput {
  readonly dataKind: CommunityReviewDataKind;
  readonly fixture?: CommunityReviewSyntheticFixtureMarker;
  readonly qualificationId: string;
  readonly qualificationVersion: string;
  readonly poolId: string;
  readonly poolVersion: string;
  readonly definitionFingerprint: string;
  readonly instrumentFingerprint: string;
  readonly reviewLocale: string;
  readonly instrument?: QualificationPoolRecord["instrument"];
  readonly state?: QualificationPoolRecord["state"];
  readonly visibleTaskSetFingerprint?: QualificationPoolRecord["visibleTaskSetFingerprint"];
  readonly answerKeyCommitment?: QualificationPoolRecord["answerKeyCommitment"];
  readonly passRuleId?: QualificationPoolRecord["passRuleId"];
  readonly stateVersion?: QualificationPoolRecord["stateVersion"];
  readonly sealedAt?: QualificationPoolRecord["sealedAt"];
  readonly retiredAt?: QualificationPoolRecord["retiredAt"];
  readonly sealedDefinitionReference: string;
  readonly privateAnswerKeyReference: string;
}

export interface QualificationPoolRequest {
  readonly poolId: string;
  readonly poolVersion: string;
}

export interface CreateQualificationAttemptInput extends QualificationPoolRequest {
  readonly reviewerId: string;
  readonly qualificationId: string;
  readonly qualificationVersion: string;
  readonly instrumentFingerprint: string;
  readonly reviewLocale: string;
}

export interface QualificationAttemptIssue {
  readonly attemptId: string;
  /** Returned once; only its SHA-256 digest is persisted. */
  readonly attemptNonce: string;
  readonly packet: QualificationVisiblePacket;
}

export interface QualificationAttemptView {
  readonly attemptId: string;
  readonly reviewerId: string;
  readonly qualificationId: string;
  readonly qualificationVersion: string;
  readonly qualificationPoolId: string;
  readonly qualificationPoolVersion: string;
  readonly reviewLocale: string;
  readonly instrumentFingerprint: string;
  readonly packetFingerprint?: string;
  readonly state: QualificationAttemptRecord["state"];
  readonly result?: QualificationAttemptRecord["result"];
  readonly submittedAt?: string;
  readonly evaluatedAt?: string;
  readonly receiptFingerprint?: string;
}

export interface QualificationAttemptRequest {
  readonly reviewerId: string;
  readonly attemptId: string;
}

export interface SubmitQualificationAttemptInput extends QualificationAttemptRequest {
  readonly attemptNonce: string;
  readonly packetFingerprint: string;
  readonly responses: readonly unknown[];
}

export interface RegisterAuthoritativeQualificationReceiptInput {
  readonly attemptId: string;
  readonly receipt: unknown;
}

export interface CreateCommunityReviewBatchInput {
  readonly manifest: unknown;
  /** Opaque reference to private sealed source material, not the source itself. */
  readonly sealedSourceReference: string;
}

export interface AssignCommunityReviewReviewerInput {
  /** Optional operational hint; eligibility is always checked server-side. */
  readonly batchId?: string;
  readonly reviewerId: string;
}

export type GetOrCreateOwnEligibleAssignmentInput = AssignCommunityReviewReviewerInput;

export interface CommunityReviewAssignmentResult {
  readonly assignment: CommunityReviewAssignment;
  readonly packet: CommunityReviewReviewerPacket;
}

export interface ReviewerPacketRequest {
  readonly assignmentId: string;
  readonly reviewerId: string;
}

export interface SubmitCommunityReviewInput {
  readonly batchId: string;
  readonly assignmentId: string;
  readonly reviewerId: string;
  /** Optional consistency hint; the authoritative packet is always loaded from persistence. */
  readonly packetFingerprint?: string;
  readonly annotations: readonly unknown[];
}

export interface GetOwnCommunityReviewSubmissionInput {
  readonly batchId: string;
  readonly assignmentId: string;
  readonly reviewerId: string;
}

export interface WithdrawCommunityReviewAssignmentInput {
  readonly batchId: string;
  readonly assignmentId: string;
  readonly reviewerId: string;
}

export interface GetFrozenCommunityReviewPoolInput {
  readonly batchId: string;
}

export interface BuildCommunityReviewAgreementEvidenceInput {
  readonly batchId: string;
}

export interface GetCommunityReviewAgreementEvidenceInput {
  readonly batchId: string;
}

export interface CreateCommunityReviewDisclosureInput {
  readonly batchId: string;
  /** Omitting the mode keeps the evidence private/internal. */
  readonly mode?: CommunityReviewDisclosureMode;
  /** Supplying a policy is an explicit request for a public P3 projection. */
  readonly disclosurePolicy?: CommunityReviewDisclosurePolicy;
  /** Required for an explicit public artifact; private records do not use it. */
  readonly disclosureDate?: string;
}

export interface BuildCommunityReviewPublicEvidenceArtifactInput {
  readonly batchId: string;
  /** If omitted, the newest persisted PUBLIC disclosure is selected. */
  readonly disclosureId?: string;
}

/**
 * P4 service boundary. This class owns private account/consent authority and
 * transaction ordering; all protocol semantics remain in existing P3 pure
 * functions.
 */
export class CommunityReviewService {
  private readonly now: () => string;
  private readonly consentPolicy: ReviewerConsentPolicy;
  private readonly qualificationMaterialStore: QualificationMaterialStore | undefined;
  private readonly reviewBatchMaterialStore: ReviewBatchMaterialStore | undefined;
  private readonly maxQualificationAttemptsPerReviewerPool: number;
  private readonly reviewerIdGenerator: OpaqueIdGenerator;
  private readonly internalIdGenerator: OpaqueIdGenerator;
  private readonly authIdentityIdGenerator: OpaqueIdGenerator;
  private readonly consentEventIdGenerator: OpaqueIdGenerator;
  private readonly auditEventIdGenerator: OpaqueIdGenerator;
  private readonly rejectionIdGenerator: OpaqueIdGenerator;
  private readonly attemptIdGenerator: OpaqueIdGenerator;
  private readonly attemptNonceGenerator: () => string;
  private readonly reviewerInvitationEnabled: boolean;
  private readonly reviewerInvitationTtlMs: number;
  private readonly invitationIdGenerator: OpaqueIdGenerator;
  private readonly invitationSecretGenerator: () => string;
  private readonly invitationAuditEventIdGenerator: OpaqueIdGenerator;

  constructor(
    private readonly persistence: CommunityReviewPersistence,
    options: CommunityReviewServiceOptions = {},
  ) {
    this.now = options.clock ?? (() => new Date().toISOString());
    this.consentPolicy = options.consentPolicy ?? DEFAULT_REVIEWER_CONSENT_POLICY;
    validPolicy(this.consentPolicy);
    this.qualificationMaterialStore = options.qualificationMaterialStore;
    this.reviewBatchMaterialStore = options.reviewBatchMaterialStore;
    this.maxQualificationAttemptsPerReviewerPool = options.maxQualificationAttemptsPerReviewerPool ?? 3;
    if (!Number.isInteger(this.maxQualificationAttemptsPerReviewerPool) ||
      this.maxQualificationAttemptsPerReviewerPool < 1) {
      throw new CommunityReviewServiceError("invalid_service_record");
    }
    this.reviewerIdGenerator = options.reviewerIdGenerator ?? randomOpaqueId;
    this.internalIdGenerator = options.internalIdGenerator ?? randomOpaqueId;
    this.authIdentityIdGenerator = options.authIdentityIdGenerator ?? randomOpaqueId;
    this.consentEventIdGenerator = options.consentEventIdGenerator ?? randomOpaqueId;
    this.auditEventIdGenerator = options.auditEventIdGenerator ?? randomOpaqueId;
    this.rejectionIdGenerator = options.rejectionIdGenerator ?? randomOpaqueId;
    this.attemptIdGenerator = options.attemptIdGenerator ?? randomOpaqueId;
    this.attemptNonceGenerator = options.attemptNonceGenerator ?? randomAttemptNonce;
    this.reviewerInvitationEnabled = options.reviewerInvitationEnabled ?? false;
    this.reviewerInvitationTtlMs = options.reviewerInvitationTtlMs ?? 7 * 24 * 60 * 60 * 1000;
    if (!Number.isSafeInteger(this.reviewerInvitationTtlMs) || this.reviewerInvitationTtlMs <= 0) {
      throw new CommunityReviewServiceError("invalid_service_record");
    }
    this.invitationIdGenerator = options.invitationIdGenerator ?? randomOpaqueId;
    this.invitationSecretGenerator = options.invitationSecretGenerator ?? randomInvitationSecret;
    this.invitationAuditEventIdGenerator = options.invitationAuditEventIdGenerator ?? randomOpaqueId;
  }

  getReviewerConsentPolicy(): ReviewerConsentPolicy {
    return this.consentPolicy;
  }

  private nextId(generator: OpaqueIdGenerator): string {
    const value = generator();
    opaqueId(value);
    return value;
  }

  private invitationProjection(record: ReviewerInvitationRecord): ReviewerInvitationProjection {
    return {
      invitationId: record.invitationId,
      ...(record.applicationId === undefined ? {} : { applicationId: record.applicationId }),
      state: record.state,
      issuedAt: record.issuedAt,
      expiresAt: record.expiresAt,
      ...(record.consumedAt === undefined ? {} : { consumedAt: record.consumedAt }),
      ...(record.revokedAt === undefined ? {} : { revokedAt: record.revokedAt }),
      ...(record.expiredAt === undefined ? {} : { expiredAt: record.expiredAt }),
    };
  }

  private assertReviewerInvitationEnabled(): void {
    if (!this.reviewerInvitationEnabled) {
      throw new CommunityReviewServiceError("reviewer_invitation_disabled");
    }
  }

  private invitationAudit(
    transaction: CommunityReviewPersistenceTransaction,
    invitation: ReviewerInvitationRecord,
    eventType: ReviewerInvitationAuditEventRecord["eventType"],
  ): void {
    transaction.insertReviewerInvitationAuditEvent({
      eventId: this.nextId(this.invitationAuditEventIdGenerator),
      invitationId: invitation.invitationId,
      eventType,
      ...(invitation.applicationId === undefined ? {} : { applicationId: invitation.applicationId }),
      occurredAt: this.now(),
    });
  }

  private createReviewerAccountForPrincipal(
    transaction: CommunityReviewPersistenceTransaction,
    principal: AuthenticatedPrincipal,
  ): ReviewerAccountRecord {
    let internalId: string | undefined;
    let reviewerId: string | undefined;
    let authIdentityId: string | undefined;
    for (let attempt = 0; attempt < 8 && internalId === undefined; attempt += 1) {
      const candidate = this.nextId(this.internalIdGenerator);
      if (transaction.getReviewerAccount(candidate) === undefined) internalId = candidate;
    }
    for (let attempt = 0; attempt < 8 && reviewerId === undefined; attempt += 1) {
      const candidate = this.nextId(this.reviewerIdGenerator);
      if (transaction.getReviewerAccountByReviewerId(candidate) === undefined) reviewerId = candidate;
    }
    for (let attempt = 0; attempt < 8 && authIdentityId === undefined; attempt += 1) {
      const candidate = this.nextId(this.authIdentityIdGenerator);
      if (transaction.getReviewerAuthIdentity(candidate) === undefined) authIdentityId = candidate;
    }
    if (internalId === undefined || reviewerId === undefined || authIdentityId === undefined) {
      throw new CommunityReviewServiceError("repository_conflict");
    }

    const timestamp = this.now();
    const account = transaction.insertReviewerAccount({
      internalId,
      reviewerId,
      privateAuthSubjectReference: authIdentityId,
      status: "ACTIVE",
      consentVersion: this.consentPolicy.policyVersion,
      consentState: "NOT_CONSENTED",
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    const identity = transaction.insertReviewerAuthIdentity({
      authIdentityId,
      internalId,
      reviewerId,
      authProvider: principal.provider,
      authSubject: principal.subject,
      createdAt: timestamp,
    });
    this.audit(transaction, "account_created", account);
    this.audit(transaction, "authentication_mapping_created", account, {
      authProvider: identity.authProvider,
    });
    return account;
  }

  private audit(
    transaction: CommunityReviewPersistenceTransaction,
    eventType: AuthAuditEventType,
    account: ReviewerAccountRecord,
    options: { readonly authProvider?: string; readonly reasonCode?: string } = {},
  ): void {
    transaction.insertAuthAuditEvent({
      eventId: this.nextId(this.auditEventIdGenerator),
      eventType,
      internalId: account.internalId,
      reviewerId: account.reviewerId,
      ...(options.authProvider === undefined ? {} : { authProvider: options.authProvider }),
      ...(options.reasonCode === undefined ? {} : { reasonCode: options.reasonCode }),
      occurredAt: this.now(),
    });
  }

  private currentConsent(
    transaction: CommunityReviewPersistenceTransaction,
    account: ReviewerAccountRecord,
    policy: ReviewerConsentPolicy = this.consentPolicy,
  ): ReviewerConsentSnapshot {
    validPolicy(policy);
    return currentConsent(transaction, account, policy, this.consentPolicy.policyId);
  }

  private assertMutableConsentPolicy(policy: ReviewerConsentPolicy): void {
    if (policy.policyId !== this.consentPolicy.policyId) {
      throw new CommunityReviewServiceError("consent_stale");
    }
  }

  private activeReviewerAccount(
    transaction: CommunityReviewPersistenceTransaction,
    reviewerId: string,
  ): ReviewerAccountRecord {
    return eligibleAccount(transaction, reviewerId, this.consentPolicy, this.consentPolicy.policyId);
  }

  private deliveryAudit(
    transaction: CommunityReviewPersistenceTransaction,
    eventType: ReviewDeliveryAuditEventType,
    options: {
      readonly batchId?: string;
      readonly assignmentId?: string;
      readonly reviewerId?: string;
      readonly reasonCode?: string;
    } = {},
  ): void {
    transaction.insertReviewDeliveryAuditEvent({
      eventId: this.nextId(this.auditEventIdGenerator),
      eventType,
      ...(options.batchId === undefined ? {} : { batchId: options.batchId }),
      ...(options.assignmentId === undefined ? {} : { assignmentId: options.assignmentId }),
      ...(options.reviewerId === undefined ? {} : { reviewerId: options.reviewerId }),
      ...(options.reasonCode === undefined ? {} : { reasonCode: options.reasonCode }),
      occurredAt: this.now(),
    });
  }

  private submissionAudit(
    transaction: CommunityReviewPersistenceTransaction,
    submission: CommunityReviewSubmission,
  ): void {
    const event: ReviewSubmissionAuditEventRecord = {
      eventId: this.nextId(this.auditEventIdGenerator),
      eventType: "submission_accepted",
      batchId: submission.batchId,
      assignmentId: submission.assignmentId,
      reviewerId: submission.reviewerId,
      submissionFingerprint: submission.submissionFingerprint,
      occurredAt: this.now(),
    };
    transaction.insertReviewSubmissionAuditEvent(event);
  }

  private evidenceAudit(
    transaction: CommunityReviewPersistenceTransaction,
    eventType: CommunityReviewEvidenceAuditEventType,
    input: {
      readonly batchId: string;
      readonly freezeFingerprint?: string;
      readonly agreementEvidencePersistenceFingerprint?: string;
      readonly disclosureId?: string;
      readonly disclosureVersion?: number;
      readonly disclosureMode?: CommunityReviewDisclosureMode;
      readonly disclosurePolicy?: CommunityReviewDisclosurePolicy;
      readonly reasonCode?: string;
    },
  ): void {
    const event: CommunityReviewEvidenceAuditEventRecord = {
      eventId: this.nextId(this.auditEventIdGenerator),
      eventType,
      batchId: input.batchId,
      ...(input.freezeFingerprint === undefined ? {} : { freezeFingerprint: input.freezeFingerprint }),
      ...(input.agreementEvidencePersistenceFingerprint === undefined
        ? {}
        : { agreementEvidencePersistenceFingerprint: input.agreementEvidencePersistenceFingerprint }),
      ...(input.disclosureId === undefined ? {} : { disclosureId: input.disclosureId }),
      ...(input.disclosureVersion === undefined ? {} : { disclosureVersion: input.disclosureVersion }),
      ...(input.disclosureMode === undefined ? {} : { disclosureMode: input.disclosureMode }),
      ...(input.disclosurePolicy === undefined ? {} : { disclosurePolicy: input.disclosurePolicy }),
      ...(input.reasonCode === undefined ? {} : { reasonCode: input.reasonCode }),
      occurredAt: this.now(),
    };
    transaction.insertCommunityReviewEvidenceAuditEvent(event);
  }

  private async recordRejectedSubmission(
    input: SubmitCommunityReviewInput,
    error: unknown,
    suggestedReason?: string,
    candidateFingerprint?: string,
  ): Promise<void> {
    try {
      await this.persistence.transaction((transaction) => {
        const batchId = optionalOpaqueAuditId(input.batchId);
        const assignmentId = optionalOpaqueAuditId(input.assignmentId);
        const reviewerId = optionalOpaqueAuditId(input.reviewerId);
        const record: RejectedSubmissionAttemptRecord = {
          rejectionId: this.nextId(this.rejectionIdGenerator),
          ...(batchId === undefined ? {} : { batchId }),
          ...(assignmentId === undefined ? {} : { assignmentId }),
          ...(reviewerId === undefined ? {} : { reviewerId }),
          reason: submissionRejectionReason(error, suggestedReason),
          ...(candidateFingerprint === undefined ? {} : { payloadFingerprint: candidateFingerprint }),
          attemptedAt: this.now(),
        };
        transaction.insertRejectedSubmissionAttempt(record);
      });
    } catch {
      // Rejection audit is best-effort and must never mask the authoritative error.
    }
  }

  private async loadReviewBatchTasks(
    transaction: CommunityReviewPersistenceTransaction,
    batch: ReviewBatchRecord,
  ): Promise<readonly CommunityReviewVisibleTask[]> {
    const store = this.reviewBatchMaterialStore;
    if (store === undefined) throw new CommunityReviewServiceError("review_batch_material_not_found");
    const lookup = batchMaterialLookup(
      batch,
      transaction.getSealedBatchPayloadReference(batch.batchId),
    );
    let tasks: readonly CommunityReviewVisibleTask[];
    try {
      tasks = parseCommunityReviewVisibleTasks(await store.loadVisibleTasksForBatch(lookup));
    } catch (error) {
      if (error instanceof ReviewBatchMaterialError && error.code === "not_found") {
        throw new CommunityReviewServiceError("review_batch_material_not_found");
      }
      if (error instanceof CommunityReviewServiceError) throw error;
      throw new CommunityReviewServiceError("review_batch_material_invalid");
    }
    if (communityReviewVisibleTaskSetFingerprint(tasks) !== lookup.visibleTaskSetFingerprint) {
      throw new CommunityReviewServiceError("review_batch_material_invalid");
    }
    return tasks;
  }

  private frozenPoolForTransaction(
    transaction: CommunityReviewPersistenceTransaction,
    batchId: string,
  ): { readonly batch: ReviewBatchRecord; readonly record: FrozenReviewPoolRecord; readonly pool: FrozenCommunityReviewPool } {
    const batch = batchOrThrow(transaction, batchId);
    if (batch.state !== "FROZEN") throw new CommunityReviewServiceError("batch_not_frozen");
    const record = transaction.getFrozenReviewPool(batchId);
    if (record === undefined) throw new CommunityReviewServiceError("frozen_pool_not_found");
    const storedClose = transaction.getBatchCloseRecord(batchId);
    if (storedClose === undefined) throw new CommunityReviewServiceError("invalid_service_record");
    const closeResult = closeResultFromStoredRecord(batch, storedClose);
    const pool = assertPersistedFrozenPool(batch, record, closeResult);
    return { batch, record, pool };
  }

  private ensureAgreementEvidence(
    transaction: CommunityReviewPersistenceTransaction,
    batch: ReviewBatchRecord,
    pool: FrozenCommunityReviewPool,
  ): CommunityReviewAgreementEvidenceRecord {
    const existing = transaction.getCommunityReviewAgreementEvidence(batch.batchId);
    if (existing !== undefined) {
      assertPersistedAgreementEvidence(batch, pool, existing);
      return existing;
    }
    const evidence = buildCommunityReviewAgreementEvidence(pool);
    const record: CommunityReviewAgreementEvidenceRecord = {
      batchId: batch.batchId,
      freezeFingerprint: pool.freezeFingerprint,
      evidencePersistenceFingerprint: communityReviewAgreementEvidencePersistenceFingerprint({
        batchId: batch.batchId,
        freezeFingerprint: pool.freezeFingerprint,
        evidence,
      }),
      evidence,
      createdAt: this.now(),
    };
    const stored = transaction.insertCommunityReviewAgreementEvidence(record);
    this.evidenceAudit(transaction, "agreement_evidence_generated", {
      batchId: batch.batchId,
      freezeFingerprint: pool.freezeFingerprint,
      agreementEvidencePersistenceFingerprint: stored.evidencePersistenceFingerprint,
    });
    return stored;
  }

  private eligibleReceiptForBatch(
    transaction: CommunityReviewPersistenceTransaction,
    batch: ReviewBatchRecord,
    reviewerId: string,
  ): CommunityReviewQualificationReceipt {
    const matching = transaction.listQualificationReceipts(reviewerId)
      .filter((stored) => receiptMatchesBatch(transaction, stored, batch.manifest, reviewerId));
    const first = matching[0];
    if (first === undefined) {
      throw new CommunityReviewServiceError("qualification_receipt_not_authoritative");
    }
    return authoritativeReceipt(transaction, first.receipt);
  }

  private chooseEligibleBatch(
    transaction: CommunityReviewPersistenceTransaction,
    reviewerId: string,
    requestedBatchId: string | undefined,
  ): { readonly batch: ReviewBatchRecord; readonly receipt: CommunityReviewQualificationReceipt } {
    const batches = transaction.listBatches()
      .filter((batch) => batch.state === "OPEN" &&
        (requestedBatchId === undefined || batch.batchId === requestedBatchId));
    if (requestedBatchId !== undefined && transaction.getBatch(requestedBatchId) === undefined) {
      throw new CommunityReviewServiceError("batch_not_found");
    }
    if (requestedBatchId !== undefined && batches.length === 0) {
      throw new CommunityReviewServiceError("batch_not_open");
    }
    for (const batch of batches) {
      try {
        return { batch, receipt: this.eligibleReceiptForBatch(transaction, batch, reviewerId) };
      } catch (error) {
        if (!(error instanceof CommunityReviewServiceError) ||
          error.code !== "qualification_receipt_not_authoritative") throw error;
      }
    }
    throw new CommunityReviewServiceError(requestedBatchId === undefined
      ? "no_eligible_review_batch"
      : "qualification_receipt_not_authoritative");
  }

  private async loadQualificationMaterial(pool: QualificationPoolRecord): Promise<{
    readonly identity: QualificationMaterialIdentity;
    readonly visibleMaterial: QualificationVisibleMaterial;
    readonly privateAnswerKey: QualificationPrivateAnswerKey;
    readonly visibleTaskSetFingerprint: string;
    readonly answerKeyCommitment: string;
  }> {
    const store = this.qualificationMaterialStore;
    if (store === undefined) throw new CommunityReviewServiceError("qualification_material_not_found");
    const identity = qualificationMaterialIdentity(pool);
    let visibleMaterial: QualificationVisibleMaterial;
    let privateAnswerKey: QualificationPrivateAnswerKey;
    try {
      visibleMaterial = parseQualificationVisibleMaterial(await store.loadVisiblePacket(identity));
      privateAnswerKey = parseQualificationPrivateAnswerKey(await store.loadPrivateAnswerKey(identity));
    } catch (error) {
      if (error instanceof QualificationMaterialError) {
        throw new CommunityReviewServiceError(error.code === "not_found"
          ? "qualification_material_not_found"
          : "qualification_material_invalid");
      }
      throw new CommunityReviewServiceError("qualification_material_invalid");
    }
    const instrument = pool.instrument;
    if (instrument === undefined) {
      throw new CommunityReviewServiceError("qualification_material_invalid");
    }
    const computedDefinitionFingerprint = qualificationDefinitionFingerprint({
      qualificationId: pool.qualificationId,
      qualificationVersion: pool.qualificationVersion,
      qualificationPoolId: pool.poolId,
      qualificationPoolVersion: pool.poolVersion,
      instrumentId: instrument.instrumentId,
      instrumentVersion: instrument.instrumentVersion,
      instrumentFingerprint: pool.instrumentFingerprint,
      reviewLocale: pool.reviewLocale,
      passRuleId: visibleMaterial.passRuleId,
      items: visibleMaterial.items,
    });
    const visibleTaskSetFingerprint = qualificationVisibleTaskSetFingerprint(visibleMaterial.items);
    const answerKeyCommitment = qualificationAnswerKeyCommitment({
      identity,
      passRuleId: visibleMaterial.passRuleId,
      answers: privateAnswerKey.answers,
    });
    if (computedDefinitionFingerprint !== pool.definitionFingerprint ||
      pool.visibleTaskSetFingerprint !== undefined && pool.visibleTaskSetFingerprint !== visibleTaskSetFingerprint ||
      pool.answerKeyCommitment !== undefined && pool.answerKeyCommitment !== answerKeyCommitment) {
      throw new CommunityReviewServiceError("qualification_material_invalid");
    }
    try {
      // This validates exact item/key coverage before a packet can be issued.
      evaluateQualification(visibleMaterial, privateAnswerKey, privateAnswerKey.answers.map((item) => ({
        caseId: item.caseId,
        rubricId: item.rubricId,
        requirementId: item.requirementId,
        status: item.status,
      })));
    } catch (error) {
      if (error instanceof QualificationMaterialError) {
        throw new CommunityReviewServiceError("qualification_material_invalid");
      }
      throw error;
    }
    return {
      identity,
      visibleMaterial,
      privateAnswerKey,
      visibleTaskSetFingerprint,
      answerKeyCommitment,
    };
  }

  private projectQualificationAttempt(
    transaction: CommunityReviewPersistenceTransaction,
    attempt: QualificationAttemptRecord,
  ): QualificationAttemptView {
    const pool = qualificationPoolOrThrow(transaction, attempt.poolId, attempt.poolVersion);
    const receipt = transaction.getQualificationReceiptByAttempt(attempt.attemptId);
    return {
      attemptId: attempt.attemptId,
      reviewerId: attempt.reviewerId,
      qualificationId: pool.qualificationId,
      qualificationVersion: pool.qualificationVersion,
      qualificationPoolId: attempt.poolId,
      qualificationPoolVersion: attempt.poolVersion,
      reviewLocale: attempt.reviewLocale ?? pool.reviewLocale,
      instrumentFingerprint: attempt.instrumentFingerprint ?? pool.instrumentFingerprint,
      ...(attempt.packetFingerprint === undefined ? {} : { packetFingerprint: attempt.packetFingerprint }),
      state: attempt.state,
      ...(attempt.result === undefined ? {} : { result: attempt.result }),
      ...(attempt.submittedAt === undefined ? {} : { submittedAt: attempt.submittedAt }),
      ...(attempt.evaluatedAt === undefined ? {} : { evaluatedAt: attempt.evaluatedAt }),
      ...(receipt === undefined ? {} : { receiptFingerprint: receipt.receiptFingerprint }),
    };
  }

  /**
   * Trusted synthetic/setup boundary. It creates an unconsented account; a
   * separate consent operation is always required before reviewer actions.
   */
  async registerReviewerAccount(input: RegisterReviewerAccountInput): Promise<ReviewerAccountRecord> {
    opaqueId(input.internalId);
    opaqueId(input.reviewerId);
    required(input.privateAuthSubjectReference);
    const consentVersion = input.consentVersion ?? this.consentPolicy.policyVersion;
    required(consentVersion);
    const consentState = input.consentState ?? "NOT_CONSENTED";
    if (consentState !== "NOT_CONSENTED") {
      throw new CommunityReviewServiceError("invalid_service_record");
    }
    const expected = {
      internalId: input.internalId,
      reviewerId: input.reviewerId,
      privateAuthSubjectReference: input.privateAuthSubjectReference,
      status: input.status ?? "ACTIVE" as const,
      consentVersion,
      consentState,
    };
    const timestamp = this.now();
    return this.persistence.transaction((transaction) => {
      const byInternalId = transaction.getReviewerAccount(input.internalId);
      const byReviewerId = transaction.getReviewerAccountByReviewerId(input.reviewerId);
      const existing = byInternalId ?? byReviewerId;
      if (existing !== undefined) {
        if (existing.internalId === expected.internalId && existing.reviewerId === expected.reviewerId &&
          existing.privateAuthSubjectReference === expected.privateAuthSubjectReference &&
          existing.status === expected.status && existing.consentVersion === expected.consentVersion &&
          existing.consentState === expected.consentState) return existing;
        throw new CommunityReviewServiceError("repository_conflict");
      }
      const account = transaction.insertReviewerAccount({
        ...expected,
        createdAt: timestamp,
        updatedAt: timestamp,
      });
      this.audit(transaction, "account_created", account);
      return account;
    });
  }

  /**
   * Provisioning is a trusted service/setup operation, not public signup. The
   * mapping is private and the generated reviewer ID is never derived from
   * the external principal.
   */
  async provisionReviewerAccount(input: ProvisionReviewerAccountInput): Promise<ReviewerAccountRecord> {
    const principal = parseAuthenticatedPrincipal({ principal: input.principal });
    return this.persistence.transaction((transaction) => {
      const existingIdentity = transaction.getReviewerAuthIdentityBySubject(
        principal.provider,
        principal.subject,
      );
      if (existingIdentity !== undefined) {
        const existing = transaction.getReviewerAccount(existingIdentity.internalId);
        if (existing === undefined || existing.reviewerId !== existingIdentity.reviewerId ||
          existing.privateAuthSubjectReference !== existingIdentity.authIdentityId) {
          throw new CommunityReviewServiceError("invalid_service_record");
        }
        return existing;
      }
      return this.createReviewerAccountForPrincipal(transaction, principal);
    });
  }

  /** Explicit operator-only issuance; an application decision never calls this. */
  async issueReviewerInvitation(
    input: CreateReviewerInvitationInput = {},
  ): Promise<ReviewerInvitationIssuance> {
    this.assertReviewerInvitationEnabled();
    if (input.applicationId !== undefined) opaqueId(input.applicationId);
    const credential = this.invitationSecretGenerator();
    if (!invitationSecretIsWellFormed(credential)) {
      throw new CommunityReviewServiceError("invalid_service_record");
    }
    const secretDigest = hashInvitationSecret(credential);
    const issuedAt = timestampOrThrow(this.now());
    const expiresAt = addMilliseconds(issuedAt, this.reviewerInvitationTtlMs);
    return this.persistence.transaction((transaction) => {
      if (input.applicationId !== undefined) {
        const application = transaction.getCommunityReviewApplication(input.applicationId);
        if (application === undefined || application.lifecycle !== "ACTIVE" || application.decision !== "INVITED") {
          throw new CommunityReviewServiceError("reviewer_invitation_application_invalid");
        }
      }
      let invitationId: string | undefined;
      for (let attempt = 0; attempt < 8 && invitationId === undefined; attempt += 1) {
        const candidate = this.nextId(this.invitationIdGenerator);
        if (transaction.getReviewerInvitation(candidate) === undefined) invitationId = candidate;
      }
      if (invitationId === undefined) throw new CommunityReviewServiceError("repository_conflict");
      const invitation: ReviewerInvitationRecord = {
        invitationId,
        secretDigest,
        ...(input.applicationId === undefined ? {} : { applicationId: input.applicationId }),
        state: "ISSUED",
        issuedAt,
        expiresAt,
      };
      const stored = transaction.insertReviewerInvitation(invitation);
      this.invitationAudit(transaction, stored, "issued");
      return {
        invitation: this.invitationProjection(stored),
        credential,
      };
    });
  }

  /** Operator-only lifecycle transition. It never returns the one-time credential. */
  async revokeReviewerInvitation(
    input: ReviewerInvitationLifecycleInput,
  ): Promise<ReviewerInvitationProjection> {
    this.assertReviewerInvitationEnabled();
    opaqueId(input.invitationId);
    const result = await this.persistence.transaction((transaction) => {
      const invitation = transaction.getReviewerInvitation(input.invitationId);
      if (invitation === undefined) throw new CommunityReviewServiceError("reviewer_invitation_not_found");
      if (invitation.state === "REVOKED") return this.invitationProjection(invitation);
      if (invitation.state !== "ISSUED") {
        throw new CommunityReviewServiceError("reviewer_invitation_conflict");
      }
      const now = timestampOrThrow(this.now());
      if (Date.parse(now) >= Date.parse(invitation.expiresAt)) {
        const expired: ReviewerInvitationRecord = {
          ...invitation,
          state: "EXPIRED",
          expiredAt: now,
        };
        const storedExpired = transaction.updateReviewerInvitation(expired);
        this.invitationAudit(transaction, storedExpired, "expired");
        return this.invitationProjection(storedExpired);
      }
      const revoked: ReviewerInvitationRecord = {
        ...invitation,
        state: "REVOKED",
        revokedAt: now,
      };
      const stored = transaction.updateReviewerInvitation(revoked);
      this.invitationAudit(transaction, stored, "revoked");
      return this.invitationProjection(stored);
    });
    return result;
  }

  /**
   * Reviewer-channel redemption. Invitation validation, principal uniqueness,
   * account creation, and consumption commit in one persistence transaction.
   */
  async redeemReviewerInvitation(
    input: RedeemReviewerInvitationInput,
  ): Promise<ReviewerAccountRecord> {
    this.assertReviewerInvitationEnabled();
    const principal = parseAuthenticatedPrincipal({ principal: input.principal });
    if (!invitationSecretIsWellFormed(input.credential)) {
      throw new CommunityReviewServiceError("reviewer_invitation_not_redeemable");
    }
    const secretDigest = hashInvitationSecret(input.credential);
    const result = await this.persistence.transaction((transaction) => {
      const invitation = transaction.getReviewerInvitationBySecretDigest(secretDigest);
      if (invitation === undefined || invitation.state !== "ISSUED") {
        throw new CommunityReviewServiceError("reviewer_invitation_not_redeemable");
      }
      const now = timestampOrThrow(this.now());
      if (Date.parse(now) >= Date.parse(invitation.expiresAt)) {
        const expired: ReviewerInvitationRecord = {
          ...invitation,
          state: "EXPIRED",
          expiredAt: now,
        };
        const storedExpired = transaction.updateReviewerInvitation(expired);
        this.invitationAudit(transaction, storedExpired, "expired");
        return { kind: "expired" as const };
      }
      if (transaction.getReviewerAuthIdentityBySubject(principal.provider, principal.subject) !== undefined) {
        // Existing principals use an explicit conflict policy. A valid login
        // alone never turns redemption into account recovery or re-binding.
        throw new CommunityReviewServiceError("reviewer_invitation_conflict");
      }
      const account = this.createReviewerAccountForPrincipal(transaction, principal);
      const consumed: ReviewerInvitationRecord = {
        ...invitation,
        state: "CONSUMED",
        consumedAt: now,
      };
      const storedConsumed = transaction.updateReviewerInvitation(consumed);
      this.invitationAudit(transaction, storedConsumed, "consumed");
      return { kind: "redeemed" as const, account };
    });
    if (result.kind === "expired") {
      throw new CommunityReviewServiceError("reviewer_invitation_not_redeemable");
    }
    return result.account;
  }

  /** Trusted migration/setup boundary for an existing P4-A account. */
  async linkReviewerAuthIdentity(
    input: LinkReviewerAuthIdentityInput,
  ): Promise<ReviewerAuthIdentityRecord> {
    opaqueId(input.reviewerId);
    const principal = parseAuthenticatedPrincipal({ principal: input.principal });
    return this.persistence.transaction((transaction) => {
      const account = accountOrThrow(transaction, input.reviewerId);
      const existingBySubject = transaction.getReviewerAuthIdentityBySubject(
        principal.provider,
        principal.subject,
      );
      if (existingBySubject !== undefined) {
        if (existingBySubject.reviewerId === account.reviewerId &&
          existingBySubject.internalId === account.internalId &&
          existingBySubject.authIdentityId === account.privateAuthSubjectReference) {
          return existingBySubject;
        }
        if (existingBySubject.reviewerId === account.reviewerId) {
          throw new CommunityReviewServiceError("invalid_service_record");
        }
        throw new CommunityReviewServiceError("repository_conflict");
      }
      if (transaction.getReviewerAuthIdentityByInternalId(account.internalId) !== undefined) {
        throw new CommunityReviewServiceError("repository_conflict");
      }
      let authIdentityId: string | undefined;
      for (let attempt = 0; attempt < 8 && authIdentityId === undefined; attempt += 1) {
        const candidate = this.nextId(this.authIdentityIdGenerator);
        if (transaction.getReviewerAuthIdentity(candidate) === undefined) authIdentityId = candidate;
      }
      if (authIdentityId === undefined) throw new CommunityReviewServiceError("repository_conflict");
      const updatedAccount = transaction.updateReviewerAccount({
        ...account,
        privateAuthSubjectReference: authIdentityId,
        updatedAt: this.now(),
      });
      const identity = transaction.insertReviewerAuthIdentity({
        authIdentityId,
        internalId: updatedAccount.internalId,
        reviewerId: updatedAccount.reviewerId,
        authProvider: principal.provider,
        authSubject: principal.subject,
        createdAt: this.now(),
      });
      this.audit(transaction, "authentication_mapping_created", updatedAccount, {
        authProvider: identity.authProvider,
      });
      return identity;
    });
  }

  /** Resolve only a previously provisioned principal; it never auto-creates. */
  async resolveAuthenticatedReviewer(input: ProvisionReviewerAccountInput): Promise<ReviewerAccountRecord> {
    const principal = parseAuthenticatedPrincipal({ principal: input.principal });
    return this.persistence.transaction((transaction) => {
      const identity = transaction.getReviewerAuthIdentityBySubject(
        principal.provider,
        principal.subject,
      );
      if (identity === undefined) {
        throw new CommunityReviewServiceError("authentication_subject_not_found");
      }
      const account = transaction.getReviewerAccount(identity.internalId);
      if (account === undefined || account.reviewerId !== identity.reviewerId ||
        account.privateAuthSubjectReference !== identity.authIdentityId) {
        throw new CommunityReviewServiceError("invalid_service_record");
      }
      return account;
    });
  }

  async getReviewerAuthIdentity(
    input: ProvisionReviewerAccountInput,
  ): Promise<ReviewerAuthIdentityRecord | undefined> {
    const principal = parseAuthenticatedPrincipal({ principal: input.principal });
    return this.persistence.transaction((transaction) => transaction.getReviewerAuthIdentityBySubject(
      principal.provider,
      principal.subject,
    ));
  }

  async getReviewerAccount(reviewerId: string): Promise<ReviewerAccountRecord> {
    opaqueId(reviewerId);
    return this.persistence.transaction((transaction) => accountOrThrow(transaction, reviewerId));
  }

  private policyFromInput(input: {
    readonly policyId?: string;
    readonly policyVersion?: string;
  }): ReviewerConsentPolicy {
    const policy = {
      policyId: input.policyId ?? this.consentPolicy.policyId,
      policyVersion: input.policyVersion ?? this.consentPolicy.policyVersion,
    };
    validPolicy(policy);
    return policy;
  }

  async getCurrentConsent(input: GetReviewerConsentInput): Promise<ReviewerConsentSnapshot> {
    opaqueId(input.reviewerId);
    const policy = this.policyFromInput(input);
    return this.persistence.transaction((transaction) => {
      const account = accountOrThrow(transaction, input.reviewerId);
      return this.currentConsent(transaction, account, policy);
    });
  }

  async recordConsent(input: RecordReviewerConsentInput): Promise<ReviewerConsentSnapshot> {
    opaqueId(input.reviewerId);
    const policy = this.policyFromInput(input);
    this.assertMutableConsentPolicy(policy);
    return this.persistence.transaction((transaction) => {
      const account = accountOrThrow(transaction, input.reviewerId);
      if (account.status === "WITHDRAWN") {
        throw new CommunityReviewServiceError("reviewer_account_withdrawn");
      }
      if (account.status === "DISABLED") {
        throw new CommunityReviewServiceError("reviewer_account_disabled");
      }
      const existing = this.currentConsent(transaction, account, policy);
      if (existing.state === "CONSENTED" && existing.policyId === policy.policyId &&
        existing.policyVersion === policy.policyVersion) return existing;

      let consentEventId: string | undefined;
      for (let attempt = 0; attempt < 8 && consentEventId === undefined; attempt += 1) {
        const candidate = this.nextId(this.consentEventIdGenerator);
        if (transaction.getReviewerConsent(candidate) === undefined) consentEventId = candidate;
      }
      if (consentEventId === undefined) throw new CommunityReviewServiceError("repository_conflict");
      const timestamp = this.now();
      const accepted = transaction.insertReviewerConsent({
        consentEventId,
        internalId: account.internalId,
        reviewerId: account.reviewerId,
        policyId: policy.policyId,
        policyVersion: policy.policyVersion,
        state: "ACCEPTED",
        acceptedAt: timestamp,
        recordedAt: timestamp,
      });
      const updatedAccount = transaction.updateReviewerAccount({
        ...account,
        consentVersion: policy.policyVersion,
        consentState: "CONSENTED",
        updatedAt: timestamp,
      });
      this.audit(transaction, "consent_accepted", updatedAccount);
      return {
        policyId: accepted.policyId,
        policyVersion: accepted.policyVersion,
        state: "CONSENTED",
        consentEventId: accepted.consentEventId,
        ...(accepted.acceptedAt === undefined ? {} : { acceptedAt: accepted.acceptedAt }),
      };
    });
  }

  async revokeConsent(input: RevokeReviewerConsentInput): Promise<ReviewerConsentSnapshot> {
    opaqueId(input.reviewerId);
    const policy = this.policyFromInput(input);
    this.assertMutableConsentPolicy(policy);
    return this.persistence.transaction((transaction) => {
      const account = accountOrThrow(transaction, input.reviewerId);
      if (account.status === "DISABLED") {
        throw new CommunityReviewServiceError("reviewer_account_disabled");
      }
      const existing = this.currentConsent(transaction, account, policy);
      if (existing.state === "REVOKED" && existing.policyId === policy.policyId &&
        existing.policyVersion === policy.policyVersion) return existing;
      if (existing.state !== "CONSENTED" || existing.policyId !== policy.policyId ||
        existing.policyVersion !== policy.policyVersion) {
        throw new CommunityReviewServiceError(
          existing.state === "NOT_CONSENTED" ? "consent_required" : "consent_stale",
        );
      }
      let consentEventId: string | undefined;
      for (let attempt = 0; attempt < 8 && consentEventId === undefined; attempt += 1) {
        const candidate = this.nextId(this.consentEventIdGenerator);
        if (transaction.getReviewerConsent(candidate) === undefined) consentEventId = candidate;
      }
      if (consentEventId === undefined) throw new CommunityReviewServiceError("repository_conflict");
      const timestamp = this.now();
      const revoked = transaction.insertReviewerConsent({
        consentEventId,
        internalId: account.internalId,
        reviewerId: account.reviewerId,
        policyId: policy.policyId,
        policyVersion: policy.policyVersion,
        state: "REVOKED",
        revokedAt: timestamp,
        recordedAt: timestamp,
      });
      const updatedAccount = transaction.updateReviewerAccount({
        ...account,
        consentVersion: policy.policyVersion,
        consentState: "REVOKED",
        updatedAt: timestamp,
      });
      this.audit(transaction, "consent_revoked", updatedAccount);
      return {
        policyId: revoked.policyId,
        policyVersion: revoked.policyVersion,
        state: "REVOKED",
        consentEventId: revoked.consentEventId,
        ...(revoked.revokedAt === undefined ? {} : { revokedAt: revoked.revokedAt }),
      };
    });
  }

  async withdrawReviewerAccount(input: ReviewerAccountLifecycleInput): Promise<ReviewerAccountRecord> {
    opaqueId(input.reviewerId);
    return this.persistence.transaction((transaction) => {
      const account = accountOrThrow(transaction, input.reviewerId);
      if (account.status === "DISABLED") {
        throw new CommunityReviewServiceError("reviewer_account_disabled");
      }
      if (account.status === "WITHDRAWN") return account;
      const updated = transaction.updateReviewerAccount({
        ...account,
        status: "WITHDRAWN",
        updatedAt: this.now(),
      });
      this.audit(transaction, "account_withdrawn", updated);
      return updated;
    });
  }

  async disableReviewerAccount(input: ReviewerAccountLifecycleInput): Promise<ReviewerAccountRecord> {
    opaqueId(input.reviewerId);
    return this.persistence.transaction((transaction) => {
      const account = accountOrThrow(transaction, input.reviewerId);
      if (account.status === "DISABLED") return account;
      const updated = transaction.updateReviewerAccount({
        ...account,
        status: "DISABLED",
        updatedAt: this.now(),
      });
      this.audit(transaction, "account_disabled", updated);
      return updated;
    });
  }

  /** Trusted operator/setup boundary for qualification pool metadata. */
  async registerQualificationPool(
    input: RegisterQualificationPoolInput,
  ): Promise<QualificationPoolRecord> {
    required(input.qualificationId);
    required(input.qualificationVersion);
    required(input.poolId);
    required(input.poolVersion);
    fingerprint(input.definitionFingerprint);
    fingerprint(input.instrumentFingerprint);
    required(input.reviewLocale);
    required(input.sealedDefinitionReference);
    required(input.privateAnswerKeyReference);
    if (input.dataKind === "synthetic-fixture" && input.fixture === undefined ||
      input.dataKind === "community-review" && input.fixture !== undefined) {
      throw new CommunityReviewServiceError("invalid_service_record");
    }
    // P4-A callers without P4-C instrument/material metadata remain legacy;
    // a new caller enters private DRAFT setup and must explicitly activate it.
    const state = input.state ?? (input.instrument === undefined ? "OPEN" : "DRAFT");
    const timestamp = this.now();
    const expected: QualificationPoolRecord = {
      dataKind: input.dataKind,
      ...(input.fixture === undefined ? {} : { fixture: input.fixture }),
      qualificationId: input.qualificationId,
      qualificationVersion: input.qualificationVersion,
      poolId: input.poolId,
      poolVersion: input.poolVersion,
      definitionFingerprint: input.definitionFingerprint,
      instrumentFingerprint: input.instrumentFingerprint,
      reviewLocale: input.reviewLocale,
      ...(input.instrument === undefined ? {} : { instrument: input.instrument }),
      state,
      ...(input.visibleTaskSetFingerprint === undefined ? {} : {
        visibleTaskSetFingerprint: input.visibleTaskSetFingerprint,
      }),
      ...(input.answerKeyCommitment === undefined ? {} : {
        answerKeyCommitment: input.answerKeyCommitment,
      }),
      ...(input.passRuleId === undefined ? {} : { passRuleId: input.passRuleId }),
      stateVersion: input.stateVersion ?? 0,
      ...(input.sealedAt === undefined ? {} : { sealedAt: input.sealedAt }),
      ...(input.retiredAt === undefined ? {} : { retiredAt: input.retiredAt }),
      sealedDefinitionReference: input.sealedDefinitionReference,
      privateAnswerKeyReference: input.privateAnswerKeyReference,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    return this.persistence.transaction(async (transaction) => {
      const existing = transaction.getQualificationPool(input.poolId, input.poolVersion);
      if (existing !== undefined) {
        if (same({ ...existing, createdAt: undefined, updatedAt: undefined }, {
          ...expected,
          createdAt: undefined,
          updatedAt: undefined,
        })) return existing;
        throw new CommunityReviewServiceError("repository_conflict");
      }
      if (state !== "DRAFT" && state !== "OPEN") {
        const material = await this.loadQualificationMaterial(expected);
        if (expected.visibleTaskSetFingerprint !== material.visibleTaskSetFingerprint ||
          expected.answerKeyCommitment !== material.answerKeyCommitment ||
          expected.passRuleId !== material.visibleMaterial.passRuleId) {
          throw new CommunityReviewServiceError("qualification_material_invalid");
        }
      }
      const stored = transaction.insertQualificationPool(expected);
      this.qualificationAudit(transaction, "pool_registered", {
        poolId: stored.poolId,
        poolVersion: stored.poolVersion,
      });
      return stored;
    });
  }

  private qualificationAudit(
    transaction: CommunityReviewPersistenceTransaction,
    eventType: QualificationAuthorityAuditEventType,
    options: {
      readonly reviewerId?: string;
      readonly attemptId?: string;
      readonly poolId?: string;
      readonly poolVersion?: string;
      readonly reasonCode?: string;
    } = {},
  ): void {
    transaction.insertQualificationAuthorityAuditEvent({
      eventId: this.nextId(this.auditEventIdGenerator),
      eventType,
      ...(options.reviewerId === undefined ? {} : { reviewerId: options.reviewerId }),
      ...(options.attemptId === undefined ? {} : { attemptId: options.attemptId }),
      ...(options.poolId === undefined ? {} : { poolId: options.poolId }),
      ...(options.poolVersion === undefined ? {} : { poolVersion: options.poolVersion }),
      ...(options.reasonCode === undefined ? {} : { reasonCode: options.reasonCode }),
      occurredAt: this.now(),
    });
  }

  async getQualificationPool(input: QualificationPoolRequest): Promise<QualificationPoolRecord> {
    required(input.poolId);
    required(input.poolVersion);
    return this.persistence.transaction((transaction) =>
      qualificationPoolOrThrow(transaction, input.poolId, input.poolVersion));
  }

  async sealQualificationPool(input: QualificationPoolRequest): Promise<QualificationPoolRecord> {
    required(input.poolId);
    required(input.poolVersion);
    return this.persistence.transaction(async (transaction) => {
      const pool = qualificationPoolOrThrow(transaction, input.poolId, input.poolVersion);
      if (pool.state === "SEALED") return pool;
      if (pool.state !== "DRAFT") {
        throw new CommunityReviewServiceError("qualification_pool_invalid_state");
      }
      const material = await this.loadQualificationMaterial(pool);
      const timestamp = this.now();
      const sealed = transaction.updateQualificationPool({
        ...pool,
        state: "SEALED",
        visibleTaskSetFingerprint: material.visibleTaskSetFingerprint,
        answerKeyCommitment: material.answerKeyCommitment,
        passRuleId: material.visibleMaterial.passRuleId,
        stateVersion: (pool.stateVersion ?? 0) + 1,
        sealedAt: timestamp,
        updatedAt: timestamp,
      });
      this.qualificationAudit(transaction, "pool_sealed", {
        poolId: sealed.poolId,
        poolVersion: sealed.poolVersion,
      });
      return sealed;
    });
  }

  async activateQualificationPool(input: QualificationPoolRequest): Promise<QualificationPoolRecord> {
    required(input.poolId);
    required(input.poolVersion);
    return this.persistence.transaction(async (transaction) => {
      const pool = qualificationPoolOrThrow(transaction, input.poolId, input.poolVersion);
      if (pool.state === "ACTIVE") return pool;
      if (pool.state !== "SEALED") {
        throw new CommunityReviewServiceError("qualification_pool_invalid_state");
      }
      await this.loadQualificationMaterial(pool);
      const timestamp = this.now();
      const active = transaction.updateQualificationPool({
        ...pool,
        state: "ACTIVE",
        stateVersion: (pool.stateVersion ?? 0) + 1,
        updatedAt: timestamp,
      });
      this.qualificationAudit(transaction, "pool_activated", {
        poolId: active.poolId,
        poolVersion: active.poolVersion,
      });
      return active;
    });
  }

  async retireQualificationPool(input: QualificationPoolRequest): Promise<QualificationPoolRecord> {
    required(input.poolId);
    required(input.poolVersion);
    return this.persistence.transaction((transaction) => {
      const pool = qualificationPoolOrThrow(transaction, input.poolId, input.poolVersion);
      if (pool.state === "RETIRED") return pool;
      if (pool.state !== "ACTIVE") {
        throw new CommunityReviewServiceError("qualification_pool_invalid_state");
      }
      const timestamp = this.now();
      const retired = transaction.updateQualificationPool({
        ...pool,
        state: "RETIRED",
        stateVersion: (pool.stateVersion ?? 0) + 1,
        retiredAt: timestamp,
        updatedAt: timestamp,
      });
      this.qualificationAudit(transaction, "pool_retired", {
        poolId: retired.poolId,
        poolVersion: retired.poolVersion,
      });
      return retired;
    });
  }

  /** Create and issue one reviewer-owned attempt from an ACTIVE sealed pool. */
  async createQualificationAttempt(
    input: CreateQualificationAttemptInput,
  ): Promise<QualificationAttemptIssue> {
    opaqueId(input.reviewerId);
    required(input.qualificationId);
    required(input.qualificationVersion);
    required(input.poolId);
    required(input.poolVersion);
    fingerprint(input.instrumentFingerprint);
    required(input.reviewLocale);
    return this.persistence.transaction(async (transaction) => {
      this.activeReviewerAccount(transaction, input.reviewerId);
      const pool = qualificationPoolOrThrow(transaction, input.poolId, input.poolVersion);
      if (pool.state !== "ACTIVE") {
        throw new CommunityReviewServiceError("qualification_pool_not_active");
      }
      if (pool.qualificationId !== input.qualificationId ||
        pool.qualificationVersion !== input.qualificationVersion ||
        pool.instrumentFingerprint !== input.instrumentFingerprint ||
        pool.reviewLocale !== input.reviewLocale) {
        throw new CommunityReviewServiceError("qualification_pool_not_active");
      }
      if (transaction.listQualificationAttempts(input.reviewerId, input.poolId, input.poolVersion).length >=
        this.maxQualificationAttemptsPerReviewerPool) {
        throw new CommunityReviewServiceError("qualification_attempt_limit");
      }
      const material = await this.loadQualificationMaterial(pool);
      let attemptId: string | undefined;
      for (let count = 0; count < 8 && attemptId === undefined; count += 1) {
        const candidate = this.nextId(this.attemptIdGenerator);
        if (transaction.getQualificationAttempt(candidate) === undefined) attemptId = candidate;
      }
      let attemptNonce: string | undefined;
      let nonceHash: string | undefined;
      const existingAttempts = transaction.listQualificationAttempts(
        input.reviewerId,
        input.poolId,
        input.poolVersion,
      );
      for (let count = 0; count < 8 && attemptNonce === undefined; count += 1) {
        const candidate = this.attemptNonceGenerator();
        validAttemptNonce(candidate);
        const candidateHash = hashAttemptNonce(candidate);
        if (!existingAttempts.some((attempt) => attempt.nonceHash === candidateHash)) {
          attemptNonce = candidate;
          nonceHash = candidateHash;
        }
      }
      if (attemptId === undefined || attemptNonce === undefined || nonceHash === undefined) {
        throw new CommunityReviewServiceError("repository_conflict");
      }
      const packet = buildQualificationVisiblePacket({
        attemptId,
        identity: material.identity,
        visibleMaterial: material.visibleMaterial,
      });
      const timestamp = this.now();
      const attempt = transaction.insertQualificationAttempt({
        attemptId,
        reviewerId: input.reviewerId,
        poolId: input.poolId,
        poolVersion: input.poolVersion,
        nonceHash,
        state: "ISSUED",
        startedAt: timestamp,
        issuedAt: timestamp,
        qualificationDefinitionFingerprint: pool.definitionFingerprint,
        instrumentFingerprint: pool.instrumentFingerprint,
        reviewLocale: pool.reviewLocale,
        packetFingerprint: packet.packetFingerprint,
      });
      if (attempt.state !== "ISSUED") {
        throw new CommunityReviewServiceError("invalid_service_record");
      }
      this.qualificationAudit(transaction, "attempt_issued", {
        reviewerId: attempt.reviewerId,
        attemptId: attempt.attemptId,
        poolId: attempt.poolId,
        poolVersion: attempt.poolVersion,
      });
      return { attemptId, attemptNonce, packet };
    });
  }

  /** Rebuilds only the positive visible packet for the owning reviewer. */
  async getQualificationPacket(input: QualificationAttemptRequest): Promise<QualificationVisiblePacket> {
    opaqueId(input.reviewerId);
    required(input.attemptId);
    return this.persistence.transaction(async (transaction) => {
      this.activeReviewerAccount(transaction, input.reviewerId);
      const attempt = transaction.getQualificationAttempt(input.attemptId);
      if (attempt === undefined) throw new CommunityReviewServiceError("qualification_attempt_not_found");
      if (attempt.reviewerId !== input.reviewerId) {
        throw new CommunityReviewServiceError("qualification_attempt_not_owner");
      }
      const pool = qualificationPoolOrThrow(transaction, attempt.poolId, attempt.poolVersion);
      if (pool.state !== "ACTIVE" && pool.state !== "RETIRED") {
        throw new CommunityReviewServiceError("qualification_pool_not_active");
      }
      const material = await this.loadQualificationMaterial(pool);
      const packet = buildQualificationVisiblePacket({
        attemptId: attempt.attemptId,
        identity: material.identity,
        visibleMaterial: material.visibleMaterial,
      });
      if (attempt.packetFingerprint !== undefined && attempt.packetFingerprint !== packet.packetFingerprint) {
        throw new CommunityReviewServiceError("qualification_packet_invalid");
      }
      return packet;
    });
  }

  /**
   * Evaluates only the server-loaded private answer key. Caller JSON can
   * provide responses, but never a score, result, or expected assessment.
   */
  async submitQualificationAttempt(
    input: SubmitQualificationAttemptInput,
  ): Promise<QualificationAttemptView> {
    opaqueId(input.reviewerId);
    required(input.attemptId);
    validAttemptNonce(input.attemptNonce);
    fingerprint(input.packetFingerprint);
    return this.persistence.transaction(async (transaction) => {
      this.activeReviewerAccount(transaction, input.reviewerId);
      const attempt = transaction.getQualificationAttempt(input.attemptId);
      if (attempt === undefined) throw new CommunityReviewServiceError("qualification_attempt_not_found");
      if (attempt.reviewerId !== input.reviewerId) {
        throw new CommunityReviewServiceError("qualification_attempt_not_owner");
      }
      if (attempt.state !== "ISSUED") {
        throw new CommunityReviewServiceError("qualification_attempt_already_submitted");
      }
      if (hashAttemptNonce(input.attemptNonce) !== attempt.nonceHash) {
        throw new CommunityReviewServiceError("qualification_response_invalid");
      }
      const pool = qualificationPoolOrThrow(transaction, attempt.poolId, attempt.poolVersion);
      if (pool.state !== "ACTIVE" && pool.state !== "RETIRED") {
        throw new CommunityReviewServiceError("qualification_pool_not_active");
      }
      if (attempt.qualificationDefinitionFingerprint !== pool.definitionFingerprint ||
        attempt.instrumentFingerprint !== pool.instrumentFingerprint ||
        attempt.reviewLocale !== pool.reviewLocale) {
        throw new CommunityReviewServiceError("qualification_packet_invalid");
      }
      const material = await this.loadQualificationMaterial(pool);
      const packet = buildQualificationVisiblePacket({
        attemptId: attempt.attemptId,
        identity: material.identity,
        visibleMaterial: material.visibleMaterial,
      });
      if (packet.packetFingerprint !== input.packetFingerprint ||
        attempt.packetFingerprint !== packet.packetFingerprint) {
        throw new CommunityReviewServiceError("qualification_packet_invalid");
      }
      let responses: QualificationResponse[];
      try {
        responses = parseQualificationResponses(material.visibleMaterial.items, input.responses);
      } catch (error) {
        if (error instanceof QualificationResponseError) {
          throw new CommunityReviewServiceError("qualification_response_invalid");
        }
        throw new CommunityReviewServiceError("qualification_material_invalid");
      }
      let evaluation: QualificationEvaluation;
      try {
        evaluation = evaluateQualification(material.visibleMaterial, material.privateAnswerKey, responses);
      } catch (error) {
        if (error instanceof QualificationMaterialError) {
          throw new CommunityReviewServiceError("qualification_material_invalid");
        }
        throw new CommunityReviewServiceError("qualification_response_invalid");
      }
      const submittedAt = this.now();
      const submitted = transaction.updateQualificationAttempt({
        ...attempt,
        state: "SUBMITTED",
        submittedAt,
        responses: evaluation.responses,
        responseFingerprint: qualificationResponseFingerprint(evaluation.responses),
      });
      const evaluated = transaction.updateQualificationAttempt({
        ...submitted,
        state: evaluation.result === "qualified" ? "QUALIFIED" : "NOT_QUALIFIED",
        result: evaluation.result,
        evaluatedAt: this.now(),
        evaluationRuleId: evaluation.evaluationRuleId,
        ...(evaluation.result === "not-qualified" ? { failureCode: "qualification_items_incorrect" } : {}),
      });
      this.qualificationAudit(transaction, "response_submitted", {
        reviewerId: evaluated.reviewerId,
        attemptId: evaluated.attemptId,
        poolId: evaluated.poolId,
        poolVersion: evaluated.poolVersion,
      });
      this.qualificationAudit(transaction, evaluation.result === "qualified"
        ? "qualification_passed"
        : "qualification_failed", {
        reviewerId: evaluated.reviewerId,
        attemptId: evaluated.attemptId,
        poolId: evaluated.poolId,
        poolVersion: evaluated.poolVersion,
        ...(evaluation.result === "not-qualified" ? { reasonCode: "qualification_items_incorrect" } : {}),
      });
      return this.projectQualificationAttempt(transaction, evaluated);
    });
  }

  async getQualificationAttempt(input: QualificationAttemptRequest): Promise<QualificationAttemptView> {
    opaqueId(input.reviewerId);
    required(input.attemptId);
    return this.persistence.transaction((transaction) => {
      this.activeReviewerAccount(transaction, input.reviewerId);
      const attempt = transaction.getQualificationAttempt(input.attemptId);
      if (attempt === undefined) throw new CommunityReviewServiceError("qualification_attempt_not_found");
      if (attempt.reviewerId !== input.reviewerId) {
        throw new CommunityReviewServiceError("qualification_attempt_not_owner");
      }
      return this.projectQualificationAttempt(transaction, attempt);
    });
  }

  /** Build a P3 receipt from a service-evaluated attempt, never from caller JSON. */
  async issueQualificationReceipt(
    input: QualificationAttemptRequest,
  ): Promise<QualificationReceiptRecord> {
    opaqueId(input.reviewerId);
    required(input.attemptId);
    return this.persistence.transaction((transaction) => {
      accountOrThrow(transaction, input.reviewerId);
      const attempt = transaction.getQualificationAttempt(input.attemptId);
      if (attempt === undefined) throw new CommunityReviewServiceError("qualification_attempt_not_found");
      if (attempt.reviewerId !== input.reviewerId) {
        throw new CommunityReviewServiceError("qualification_attempt_not_owner");
      }
      const existing = transaction.getQualificationReceiptByAttempt(input.attemptId);
      if (existing !== undefined) return existing;
      if (attempt.state === "NOT_QUALIFIED" || attempt.result === "not-qualified") {
        throw new CommunityReviewServiceError("qualification_not_qualified");
      }
      if (attempt.state !== "QUALIFIED" || attempt.result !== "qualified" ||
        attempt.evaluationRuleId !== QUALIFICATION_PASS_RULE_ID ||
        attempt.responses === undefined || attempt.evaluatedAt === undefined) {
        throw new CommunityReviewServiceError("qualification_receipt_not_authoritative");
      }
      const pool = qualificationPoolOrThrow(transaction, attempt.poolId, attempt.poolVersion);
      if (pool.state !== "ACTIVE" && pool.state !== "RETIRED" ||
        pool.passRuleId !== QUALIFICATION_PASS_RULE_ID ||
        pool.visibleTaskSetFingerprint === undefined || pool.answerKeyCommitment === undefined ||
        attempt.qualificationDefinitionFingerprint !== pool.definitionFingerprint ||
        attempt.instrumentFingerprint !== pool.instrumentFingerprint ||
        attempt.reviewLocale !== pool.reviewLocale || pool.instrument === undefined) {
        throw new CommunityReviewServiceError("qualification_receipt_not_authoritative");
      }
      let receipt: CommunityReviewQualificationReceipt;
      try {
        receipt = buildCommunityReviewQualificationReceipt({
          dataKind: pool.dataKind,
          ...(pool.fixture === undefined ? {} : { fixture: pool.fixture }),
          qualificationId: pool.qualificationId,
          qualificationVersion: pool.qualificationVersion,
          qualificationPoolId: pool.poolId,
          qualificationPoolVersion: pool.poolVersion,
          qualificationDefinitionFingerprint: pool.definitionFingerprint,
          reviewerId: attempt.reviewerId,
          instrument: pool.instrument,
        });
      } catch {
        throw new CommunityReviewServiceError("qualification_receipt_invalid");
      }
      const existingByFingerprint = transaction.getQualificationReceipt(receipt.receiptFingerprint);
      if (existingByFingerprint !== undefined) {
        if (existingByFingerprint.attemptId === input.attemptId && same(existingByFingerprint.receipt, receipt)) {
          return existingByFingerprint;
        }
        throw new CommunityReviewServiceError("repository_conflict");
      }
      const stored = transaction.insertQualificationReceipt({
        receiptFingerprint: receipt.receiptFingerprint,
        attemptId: input.attemptId,
        reviewerId: attempt.reviewerId,
        poolId: pool.poolId,
        poolVersion: pool.poolVersion,
        receipt,
        authorityState: "authoritative",
        issuedAt: this.now(),
      });
      this.qualificationAudit(transaction, "receipt_issued", {
        reviewerId: stored.reviewerId,
        attemptId: stored.attemptId,
        poolId: stored.poolId,
        poolVersion: stored.poolVersion,
      });
      return stored;
    });
  }

  async getQualificationReceipt(input: QualificationAttemptRequest): Promise<CommunityReviewQualificationReceipt> {
    opaqueId(input.reviewerId);
    required(input.attemptId);
    return this.persistence.transaction((transaction) => {
      accountOrThrow(transaction, input.reviewerId);
      const attempt = transaction.getQualificationAttempt(input.attemptId);
      if (attempt === undefined) throw new CommunityReviewServiceError("qualification_attempt_not_found");
      if (attempt.reviewerId !== input.reviewerId) {
        throw new CommunityReviewServiceError("qualification_attempt_not_owner");
      }
      const stored = transaction.getQualificationReceiptByAttempt(input.attemptId);
      if (stored === undefined || stored.authorityState !== "authoritative") {
        throw new CommunityReviewServiceError("qualification_receipt_not_issued");
      }
      return stored.receipt;
    });
  }

  /**
   * Registers an issuer-produced P3 receipt only after a qualified attempt is
   * already persisted. This legacy migration boundary exists for P4-A
   * synthetic rows; P4-C active pools use issueQualificationReceipt().
   */
  async registerAuthoritativeQualificationReceipt(
    input: RegisterAuthoritativeQualificationReceiptInput,
  ): Promise<QualificationReceiptRecord> {
    required(input.attemptId);
    const receipt = parseReceipt(input.receipt);
    return this.persistence.transaction((transaction) => {
      const attempt = transaction.getQualificationAttempt(input.attemptId);
      if (attempt === undefined) throw new CommunityReviewServiceError("qualification_attempt_not_found");
      const pool = transaction.getQualificationPool(receipt.qualificationPoolId, receipt.qualificationPoolVersion);
      if (pool === undefined) throw new CommunityReviewServiceError("qualification_pool_not_found");
      // Qualification issuance is a separate authority from reviewer consent.
      accountOrThrow(transaction, receipt.reviewerId);
      if (pool.state !== "OPEN" || attempt.state !== "QUALIFIED" || attempt.result !== "qualified" ||
        attempt.evaluationRuleId !== undefined || attempt.responses !== undefined) {
        throw new CommunityReviewServiceError("qualification_receipt_not_authoritative");
      }
      if (attempt.state !== "QUALIFIED" || attempt.result !== "qualified" ||
        attempt.reviewerId !== receipt.reviewerId || attempt.poolId !== receipt.qualificationPoolId ||
        attempt.poolVersion !== receipt.qualificationPoolVersion ||
        receipt.qualificationId !== pool.qualificationId ||
        receipt.qualificationVersion !== pool.qualificationVersion ||
        receipt.dataKind !== pool.dataKind || !fixtureMatches(receipt.fixture, pool.fixture) ||
        receipt.qualificationDefinitionFingerprint !== pool.definitionFingerprint ||
        receipt.instrumentEligibility.instrumentFingerprint !== pool.instrumentFingerprint ||
        receipt.reviewLocale !== pool.reviewLocale) {
        throw new CommunityReviewServiceError("qualification_receipt_not_authoritative");
      }
      const existing = transaction.getQualificationReceipt(receipt.receiptFingerprint);
      if (existing !== undefined) {
        if (existing.attemptId === input.attemptId && same(existing.receipt, receipt)) return existing;
        throw new CommunityReviewServiceError("repository_conflict");
      }
      return transaction.insertQualificationReceipt({
        receiptFingerprint: receipt.receiptFingerprint,
        attemptId: input.attemptId,
        reviewerId: receipt.reviewerId,
        poolId: receipt.qualificationPoolId,
        poolVersion: receipt.qualificationPoolVersion,
        receipt,
        authorityState: "authoritative",
        issuedAt: this.now(),
      });
    });
  }

  /** Persist only the sealed P3 manifest and an opaque source reference. */
  async createBatch(input: CreateCommunityReviewBatchInput): Promise<ReviewBatchRecord> {
    const manifest = parseCommunityReviewBatchManifest(input.manifest);
    if (manifest.state !== "SEALED") throw new CommunityReviewServiceError("invalid_service_record");
    required(input.sealedSourceReference);
    const timestamp = this.now();
    return this.persistence.transaction((transaction) => {
      const existing = transaction.getBatch(manifest.batchId);
      if (existing !== undefined) {
        const reference = transaction.getSealedBatchPayloadReference(manifest.batchId);
        if (existing.batchFingerprint === manifest.batchFingerprint &&
          existing.sealedSourceReference === input.sealedSourceReference &&
          reference?.sourceReference === input.sealedSourceReference) return existing;
        throw new CommunityReviewServiceError("repository_conflict");
      }
      const record: ReviewBatchRecord = {
        batchId: manifest.batchId,
        batchFingerprint: manifest.batchFingerprint,
        manifest,
        state: "SEALED",
        stateVersion: 0,
        sealedSourceReference: input.sealedSourceReference,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      const stored = transaction.insertBatch(record);
      const reference: SealedBatchPayloadReferenceRecord = {
        batchId: manifest.batchId,
        sourceReference: input.sealedSourceReference,
        visibleTaskSetFingerprint: manifest.visibleTaskSetFingerprint,
        createdAt: timestamp,
      };
      transaction.insertSealedBatchPayloadReference(reference);
      return stored;
    });
  }

  async openBatch(batchId: string): Promise<ReviewBatchRecord> {
    required(batchId);
    return this.persistence.transaction((transaction) => {
      const batch = batchOrThrow(transaction, batchId);
      if (batch.state === "OPEN") return batch;
      if (batch.state !== "SEALED") throw new CommunityReviewServiceError("batch_not_open");
      const manifest = openCommunityReviewBatch(batch.manifest);
      return transaction.updateBatch({
        ...batch,
        manifest,
        state: manifest.state,
        stateVersion: batch.stateVersion + 1,
        updatedAt: this.now(),
      });
    });
  }

  /**
   * Issue an assignment only from service-selected eligible material. The
   * caller supplies no receipt or task set; both are resolved from private
   * authority inside the serialized transaction.
   */
  async getOrCreateOwnEligibleAssignment(
    input: GetOrCreateOwnEligibleAssignmentInput,
  ): Promise<CommunityReviewAssignmentResult> {
    opaqueId(input.reviewerId);
    if (input.batchId !== undefined) required(input.batchId);
    return this.persistence.transaction(async (transaction) => {
      this.activeReviewerAccount(transaction, input.reviewerId);
      const requestedExisting = input.batchId === undefined
        ? undefined
        : transaction.getAssignmentByBatchReviewer(input.batchId, input.reviewerId);
      if (requestedExisting !== undefined) {
        if (requestedExisting.assignment.assignmentState === "withdrawn") {
          throw new CommunityReviewServiceError("assignment_withdrawn");
        }
        // An explicit retry of an existing assignment is not a new issuance;
        // preserve its exact P3 packet even after the batch lifecycle advances.
        return { assignment: requestedExisting.assignment, packet: requestedExisting.packet };
      }
      const chosen = this.chooseEligibleBatch(transaction, input.reviewerId, input.batchId);
      const existing = transaction.getAssignmentByBatchReviewer(chosen.batch.batchId, input.reviewerId);
      if (existing !== undefined) {
        if (existing.assignment.assignmentState === "withdrawn") {
          throw new CommunityReviewServiceError("assignment_withdrawn");
        }
        return { assignment: existing.assignment, packet: existing.packet };
      }
      const tasks = await this.loadReviewBatchTasks(transaction, chosen.batch);
      const assignment = buildCommunityReviewAssignment({
        manifest: chosen.batch.manifest,
        reviewerId: input.reviewerId,
        qualificationReceipt: chosen.receipt,
        tasks,
      });
      const packet = buildCommunityReviewReviewerPacket(assignment, tasks);
      const timestamp = this.now();
      const stored = transaction.insertAssignment({
        assignment,
        packet,
        assignedAt: timestamp,
        updatedAt: timestamp,
      });
      this.deliveryAudit(transaction, "assignment_issued", {
        batchId: stored.assignment.batchId,
        assignmentId: stored.assignment.assignmentId,
        reviewerId: stored.assignment.reviewerId,
      });
      return { assignment: stored.assignment, packet: stored.packet };
    });
  }

  /** Compatibility name for trusted callers; authority remains service-controlled. */
  async assignReviewer(
    input: AssignCommunityReviewReviewerInput,
  ): Promise<CommunityReviewAssignmentResult> {
    return this.getOrCreateOwnEligibleAssignment(input);
  }

  /** Reviewer-facing read returns only the stored positive-allowlist packet. */
  async getReviewerPacket(input: ReviewerPacketRequest): Promise<CommunityReviewReviewerPacket> {
    opaqueId(input.reviewerId);
    return this.persistence.transaction((transaction) => {
      this.activeReviewerAccount(transaction, input.reviewerId);
      const stored = assignmentOrThrow(transaction, input.assignmentId);
      if (stored.assignment.reviewerId !== input.reviewerId) {
        throw new CommunityReviewServiceError("reviewer_not_authorized");
      }
      if (stored.assignment.assignmentState !== "assigned") {
        throw new CommunityReviewServiceError("assignment_withdrawn");
      }
      this.deliveryAudit(transaction, "assignment_retrieved", {
        batchId: stored.assignment.batchId,
        assignmentId: stored.assignment.assignmentId,
        reviewerId: stored.assignment.reviewerId,
      });
      return stored.packet;
    });
  }

  async submitReview(input: SubmitCommunityReviewInput): Promise<CommunityReviewSubmission> {
    opaqueId(input.reviewerId);
    required(input.batchId);
    required(input.assignmentId);
    if (input.packetFingerprint !== undefined) fingerprint(input.packetFingerprint);
    let suggestedReason: string | undefined;
    let candidateFingerprint: string | undefined;
    try {
      return await this.persistence.transaction((transaction) => {
        const batch = batchOrThrow(transaction, input.batchId);
        if (batch.state !== "OPEN") throw new CommunityReviewServiceError("batch_not_open");
        const storedAssignment = assignmentOrThrow(transaction, input.assignmentId);
        if (storedAssignment.assignment.batchId !== input.batchId ||
          storedAssignment.assignment.reviewerId !== input.reviewerId) {
          throw new CommunityReviewServiceError("reviewer_not_authorized");
        }
        const { assignment, packet } = assertStoredAssignmentMatchesBatch(batch, storedAssignment);
        this.activeReviewerAccount(transaction, input.reviewerId);
        if (assignment.assignmentState !== "assigned") {
          throw new CommunityReviewServiceError("assignment_withdrawn");
        }
        if (input.packetFingerprint !== undefined && input.packetFingerprint !== packet.packetFingerprint) {
          throw new CommunityReviewServiceError("qualification_packet_invalid");
        }
        const receipt = transaction.getQualificationReceipt(assignment.qualificationReceiptFingerprint);
        if (receipt === undefined || receipt.authorityState !== "authoritative") {
          throw new CommunityReviewServiceError("qualification_receipt_not_authoritative");
        }
        authoritativeReceipt(transaction, receipt.receipt);
        if (receipt.reviewerId !== assignment.reviewerId || receipt.receiptFingerprint !==
          assignment.qualificationReceiptFingerprint || receipt.receipt.dataKind !== batch.manifest.dataKind ||
          !fixtureMatches(receipt.receipt.fixture, batch.manifest.fixture) ||
          receipt.receipt.protocolId !== batch.manifest.protocolId ||
          receipt.receipt.protocolVersion !== batch.manifest.protocolVersion ||
          receipt.receipt.qualificationProtocolId !== batch.manifest.qualificationEligibility.qualificationProtocolId ||
          receipt.receipt.qualificationProtocolVersion !== batch.manifest.qualificationEligibility.qualificationProtocolVersion ||
          receipt.receipt.qualificationId !== batch.manifest.qualificationEligibility.qualificationId ||
          receipt.receipt.qualificationVersion !== batch.manifest.qualificationEligibility.qualificationVersion ||
          receipt.receipt.qualificationPoolId !== batch.manifest.qualificationEligibility.qualificationPoolId ||
          receipt.receipt.qualificationPoolVersion !== batch.manifest.qualificationEligibility.qualificationPoolVersion ||
          receipt.receipt.qualificationDefinitionFingerprint !==
            batch.manifest.qualificationEligibility.qualificationDefinitionFingerprint ||
          receipt.receipt.reviewLocale !== batch.manifest.instrument.reviewLocale ||
          receipt.receipt.instrumentEligibility.instrumentId !== batch.manifest.instrument.instrumentId ||
          receipt.receipt.instrumentEligibility.instrumentVersion !== batch.manifest.instrument.instrumentVersion ||
          receipt.receipt.instrumentEligibility.instrumentFingerprint !== batch.manifest.instrument.fingerprint) {
          throw new CommunityReviewServiceError("qualification_receipt_not_authoritative");
        }
        suggestedReason = classifyAnnotationShape(packet, input.annotations);
        const submission = buildCommunityReviewSubmission(packet, input.annotations);
        candidateFingerprint = submission.submissionFingerprint;
        const existing = transaction.getAcceptedSubmissionByAssignment(input.assignmentId) ??
          transaction.getAcceptedSubmissionByBatchReviewer(input.batchId, input.reviewerId);
        if (existing !== undefined) {
          if (same(existing.submission, submission)) return existing.submission;
          throw new CommunityReviewServiceError("replacement_submission");
        }
        const accepted: AcceptedSubmissionRecord = {
          submission,
          acceptedAt: this.now(),
        };
        const stored = transaction.insertAcceptedSubmission(accepted);
        this.submissionAudit(transaction, stored.submission);
        return stored.submission;
      });
    } catch (error) {
      await this.recordRejectedSubmission(input, error, suggestedReason, candidateFingerprint);
      throw error;
    }
  }

  /** Explicit reviewer-owned name; authority still comes from the resolved reviewer ID. */
  async submitOwnAssignment(input: SubmitCommunityReviewInput): Promise<CommunityReviewSubmission> {
    return this.submitReview(input);
  }

  /** Authenticated callers may retrieve only their own persisted submission. */
  async getOwnSubmission(
    input: GetOwnCommunityReviewSubmissionInput,
  ): Promise<CommunityReviewSubmission | undefined> {
    opaqueId(input.reviewerId);
    required(input.batchId);
    required(input.assignmentId);
    return this.persistence.transaction((transaction) => {
      const batch = batchOrThrow(transaction, input.batchId);
      const storedAssignment = assignmentOrThrow(transaction, input.assignmentId);
      if (storedAssignment.assignment.batchId !== batch.batchId ||
        storedAssignment.assignment.reviewerId !== input.reviewerId) {
        throw new CommunityReviewServiceError("reviewer_not_authorized");
      }
      const { assignment } = assertStoredAssignmentMatchesBatch(batch, storedAssignment);
      this.activeReviewerAccount(transaction, input.reviewerId);
      const stored = transaction.getAcceptedSubmissionByAssignment(assignment.assignmentId);
      if (stored === undefined) return undefined;
      try {
        return assertCommunityReviewSubmissionMatchesAssignment(
          assignment,
          stored.submission,
          storedAssignment.packet.packetFingerprint,
        ).submission;
      } catch {
        throw new CommunityReviewServiceError("invalid_service_record");
      }
    });
  }

  async withdrawAssignment(
    input: WithdrawCommunityReviewAssignmentInput,
  ): Promise<CommunityReviewAssignment> {
    opaqueId(input.reviewerId);
    return this.persistence.transaction((transaction) => {
      const batch = batchOrThrow(transaction, input.batchId);
      if (batch.state !== "OPEN") throw new CommunityReviewServiceError("batch_not_open");
      this.activeReviewerAccount(transaction, input.reviewerId);
      const stored = assignmentOrThrow(transaction, input.assignmentId);
      if (stored.assignment.batchId !== input.batchId || stored.assignment.reviewerId !== input.reviewerId) {
        throw new CommunityReviewServiceError("reviewer_not_authorized");
      }
      if (stored.assignment.assignmentState === "withdrawn") return stored.assignment;
      if (transaction.getAcceptedSubmissionByAssignment(input.assignmentId) !== undefined) {
        throw new CommunityReviewServiceError("submission_already_exists");
      }
      const assignment = withdrawCommunityReviewAssignment(stored.assignment);
      const updated = transaction.updateAssignment({
        ...stored,
        assignment,
        updatedAt: this.now(),
      });
      this.deliveryAudit(transaction, "assignment_withdrawn", {
        batchId: assignment.batchId,
        assignmentId: assignment.assignmentId,
        reviewerId: assignment.reviewerId,
      });
      return updated.assignment;
    });
  }

  async closeBatch(batchId: string): Promise<CommunityReviewBatchCloseResult> {
    required(batchId);
    return this.persistence.transaction((transaction) => {
      const batch = batchOrThrow(transaction, batchId);
      if (batch.state === "CLOSED" || batch.state === "FROZEN") {
        const storedClose = transaction.getBatchCloseRecord(batchId);
        if (storedClose === undefined) throw new CommunityReviewServiceError("invalid_service_record");
        return closeResultFromStoredRecord(batch, storedClose);
      }
      if (batch.state !== "OPEN") throw new CommunityReviewServiceError("batch_not_open");
      const assignmentRecords = transaction.listAssignments(batchId);
      const acceptedRecords = transaction.listAcceptedSubmissions(batchId);
      const assignments = assignmentRecords.map((record) => {
        assertStoredAssignmentMatchesBatch(batch, record);
        return record.assignment;
      });
      const acceptedSubmissions = acceptedRecords.map((record) => {
        const assignmentRecord = transaction.getAssignment(record.submission.assignmentId);
        if (assignmentRecord === undefined || assignmentRecord.assignment.batchId !== batchId) {
          throw new CommunityReviewServiceError("invalid_service_record");
        }
        const { assignment, packet } = assertStoredAssignmentMatchesBatch(batch, assignmentRecord);
        if (assignment.assignmentState !== "assigned") {
          throw new CommunityReviewServiceError("invalid_service_record");
        }
        try {
          return assertCommunityReviewSubmissionMatchesAssignment(
            assignment,
            record.submission,
            packet.packetFingerprint,
          ).submission;
        } catch {
          throw new CommunityReviewServiceError("invalid_service_record");
        }
      });
      const result = closeCommunityReviewBatch(
        batch.manifest,
        assignments,
        acceptedSubmissions,
      );
      if (!sameSubmissionSet(result.acceptedSubmissions, acceptedSubmissions)) {
        throw new CommunityReviewServiceError("invalid_service_record");
      }
      const storedClose = transaction.insertBatchCloseRecord({
        batchId,
        manifest: result.manifest,
        closeRecord: result.closeRecord,
        acceptedSubmissions: result.acceptedSubmissions,
        createdAt: this.now(),
      });
      const closedBatch = transaction.updateBatch({
        ...batch,
        manifest: result.manifest,
        state: result.manifest.state,
        stateVersion: batch.stateVersion + 1,
        updatedAt: this.now(),
      });
      return closeResultFromStoredRecord(closedBatch, storedClose);
    });
  }

  async getBatchCloseResult(batchId: string): Promise<CommunityReviewBatchCloseResult> {
    required(batchId);
    return this.persistence.transaction((transaction) => {
      const batch = batchOrThrow(transaction, batchId);
      if (batch.state !== "CLOSED" && batch.state !== "FROZEN") {
        throw new CommunityReviewServiceError("batch_not_closed");
      }
      const storedClose = transaction.getBatchCloseRecord(batchId);
      if (storedClose === undefined) throw new CommunityReviewServiceError("invalid_service_record");
      return closeResultFromStoredRecord(batch, storedClose);
    });
  }

  async freezeBatch(batchId: string): Promise<FrozenCommunityReviewPool> {
    required(batchId);
    return this.persistence.transaction((transaction) => {
      const batch = batchOrThrow(transaction, batchId);
      if (batch.state === "FROZEN") {
        const frozen = transaction.getFrozenReviewPool(batchId);
        if (frozen === undefined) throw new CommunityReviewServiceError("invalid_service_record");
        const storedClose = transaction.getBatchCloseRecord(batchId);
        if (storedClose === undefined) throw new CommunityReviewServiceError("invalid_service_record");
        const closeResult = closeResultFromStoredRecord(batch, storedClose);
        const pool = assertPersistedFrozenPool(batch, frozen, closeResult);
        this.evidenceAudit(transaction, "freeze_retrieved", {
          batchId,
          freezeFingerprint: pool.freezeFingerprint,
        });
        return pool;
      }
      if (batch.state !== "CLOSED") throw new CommunityReviewServiceError("batch_not_closed");
      const storedClose = transaction.getBatchCloseRecord(batchId);
      if (storedClose === undefined) throw new CommunityReviewServiceError("invalid_service_record");
      const closeResult = assertCloseSnapshotMatchesCurrentAuthority(transaction, batch, storedClose);
      const pool = freezeCommunityReviewPool(closeResult);
      const stored = transaction.insertFrozenReviewPool({
        batchId,
        frozenPool: pool,
        createdAt: this.now(),
      } satisfies FrozenReviewPoolRecord);
      const frozenManifest = parseCommunityReviewBatchManifest({
        ...batch.manifest,
        state: "FROZEN",
        freezeFingerprint: pool.freezeFingerprint,
      });
      transaction.updateBatch({
        ...batch,
        manifest: frozenManifest,
        state: frozenManifest.state,
        stateVersion: batch.stateVersion + 1,
        updatedAt: this.now(),
      });
      this.evidenceAudit(transaction, "batch_frozen", {
        batchId,
        freezeFingerprint: stored.frozenPool.freezeFingerprint,
      });
      return stored.frozenPool;
    });
  }

  /** Returns the exact persisted pool; it never rebuilds one from live rows. */
  async getFrozenPool(batchId: string): Promise<FrozenCommunityReviewPool> {
    required(batchId);
    return this.persistence.transaction((transaction) => {
      const { pool } = this.frozenPoolForTransaction(transaction, batchId);
      this.evidenceAudit(transaction, "freeze_retrieved", {
        batchId,
        freezeFingerprint: pool.freezeFingerprint,
      });
      return pool;
    });
  }

  /** Builds once from the stored frozen pool and then returns the stored artifact. */
  async buildAgreementEvidence(batchId: string): Promise<CommunityReviewAgreementEvidence> {
    required(batchId);
    return this.persistence.transaction((transaction) => {
      const { batch, pool } = this.frozenPoolForTransaction(transaction, batchId);
      const existing = transaction.getCommunityReviewAgreementEvidence(batchId);
      if (existing !== undefined) {
        const evidence = assertPersistedAgreementEvidence(batch, pool, existing);
        this.evidenceAudit(transaction, "agreement_evidence_retrieved", {
          batchId,
          freezeFingerprint: pool.freezeFingerprint,
          agreementEvidencePersistenceFingerprint: existing.evidencePersistenceFingerprint,
        });
        return evidence;
      }
      return this.ensureAgreementEvidence(transaction, batch, pool).evidence;
    });
  }

  /** Retrieves only the exact persisted diagnostic artifact. */
  async getAgreementEvidence(batchId: string): Promise<CommunityReviewAgreementEvidence> {
    required(batchId);
    return this.persistence.transaction((transaction) => {
      const { batch, pool } = this.frozenPoolForTransaction(transaction, batchId);
      const stored = transaction.getCommunityReviewAgreementEvidence(batchId);
      if (stored === undefined) throw new CommunityReviewServiceError("agreement_evidence_not_found");
      const evidence = assertPersistedAgreementEvidence(batch, pool, stored);
      this.evidenceAudit(transaction, "agreement_evidence_retrieved", {
        batchId,
        freezeFingerprint: pool.freezeFingerprint,
        agreementEvidencePersistenceFingerprint: stored.evidencePersistenceFingerprint,
      });
      return evidence;
    });
  }

  /**
   * Records an immutable disclosure decision. A missing mode/policy is the
   * conservative PRIVATE default; PUBLIC requires an explicit allowlist.
   */
  async createDisclosure(
    input: CreateCommunityReviewDisclosureInput,
  ): Promise<CommunityReviewDisclosureRecord> {
    required(input.batchId);
    const resolved = resolveDisclosureRequest(input);
    return this.persistence.transaction((transaction) => {
      const { batch, pool } = this.frozenPoolForTransaction(transaction, input.batchId);
      const agreement = this.ensureAgreementEvidence(transaction, batch, pool);
      const publicArtifact = resolved.mode === "PUBLIC"
        ? buildCommunityReviewPublicEvidenceArtifact(pool, {
            disclosureDate: resolved.disclosureDate!,
            disclosurePolicy: resolved.disclosurePolicy,
          })
        : undefined;
      const publicArtifactFingerprintValue = publicArtifact === undefined
        ? undefined
        : publicArtifactIdentityFingerprint(publicArtifact);
      const disclosureId = disclosureIdentity(
        batch.batchId,
        pool.freezeFingerprint,
        agreement.evidencePersistenceFingerprint,
        resolved.mode,
        resolved.disclosurePolicy,
        resolved.disclosureDate,
      );
      const existing = transaction.getCommunityReviewDisclosure(disclosureId);
      if (existing !== undefined) {
        const checked = assertPersistedDisclosure(batch, pool, agreement, existing);
        if (checked.mode !== resolved.mode || !same(checked.disclosurePolicy, resolved.disclosurePolicy) ||
          checked.disclosureDate !== resolved.disclosureDate) {
          throw new CommunityReviewServiceError("repository_conflict");
        }
        return checked;
      }
      const disclosureVersion = transaction.listCommunityReviewDisclosures(batch.batchId).length + 1;
      const record: CommunityReviewDisclosureRecord = {
        disclosureId,
        batchId: batch.batchId,
        freezeFingerprint: pool.freezeFingerprint,
        agreementEvidencePersistenceFingerprint: agreement.evidencePersistenceFingerprint,
        disclosureVersion,
        mode: resolved.mode,
        disclosurePolicy: resolved.disclosurePolicy,
        ...(resolved.disclosureDate === undefined ? {} : { disclosureDate: resolved.disclosureDate }),
        ...(publicArtifact === undefined ? {} : { publicArtifact }),
        ...(publicArtifactFingerprintValue === undefined ? {}
          : { publicArtifactFingerprint: publicArtifactFingerprintValue }),
        createdAt: this.now(),
      };
      const stored = transaction.insertCommunityReviewDisclosure(record);
      this.evidenceAudit(transaction, "disclosure_created", {
        batchId: batch.batchId,
        freezeFingerprint: pool.freezeFingerprint,
        agreementEvidencePersistenceFingerprint: agreement.evidencePersistenceFingerprint,
        disclosureId: stored.disclosureId,
        disclosureVersion: stored.disclosureVersion,
        disclosureMode: stored.mode,
        disclosurePolicy: stored.disclosurePolicy,
      });
      if (stored.mode === "PUBLIC") {
        this.evidenceAudit(transaction, "public_artifact_generated", {
          batchId: batch.batchId,
          freezeFingerprint: pool.freezeFingerprint,
          agreementEvidencePersistenceFingerprint: agreement.evidencePersistenceFingerprint,
          disclosureId: stored.disclosureId,
          disclosureVersion: stored.disclosureVersion,
          disclosureMode: stored.mode,
          disclosurePolicy: stored.disclosurePolicy,
        });
      }
      return stored;
    });
  }

  /** Returns a persisted PUBLIC artifact selected by disclosure identity/history. */
  async buildPublicEvidenceArtifact(
    input: BuildCommunityReviewPublicEvidenceArtifactInput,
  ): Promise<CommunityReviewPublicEvidenceArtifact> {
    required(input.batchId);
    if (input.disclosureId !== undefined) required(input.disclosureId);
    return this.persistence.transaction((transaction) => {
      const { batch, pool } = this.frozenPoolForTransaction(transaction, input.batchId);
      const agreement = transaction.getCommunityReviewAgreementEvidence(input.batchId);
      if (agreement === undefined) throw new CommunityReviewServiceError("agreement_evidence_not_found");
      assertPersistedAgreementEvidence(batch, pool, agreement);
      const disclosure = input.disclosureId === undefined
        ? [...transaction.listCommunityReviewDisclosures(input.batchId)].reverse()
          .find((item) => item.mode === "PUBLIC")
        : transaction.getCommunityReviewDisclosure(input.disclosureId);
      if (disclosure === undefined || disclosure.batchId !== input.batchId) {
        throw new CommunityReviewServiceError("disclosure_not_found");
      }
      const checked = assertPersistedDisclosure(batch, pool, agreement, disclosure);
      if (checked.mode !== "PUBLIC" || checked.publicArtifact === undefined) {
        throw new CommunityReviewServiceError("disclosure_not_public");
      }
      return checked.publicArtifact;
    });
  }
}
