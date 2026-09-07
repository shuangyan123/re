import {
  buildCommunityReviewAgreementEvidence,
  buildCommunityReviewPublicEvidenceArtifact,
  communityReviewPublicArtifactFingerprint,
} from "../../../src/community-review/freeze.js";
import {
  assertCommunityReviewSubmissionMatchesAssignment,
  parseCommunityReviewAssignment,
  parseCommunityReviewBatchCloseRecord,
  parseCommunityReviewBatchManifest,
  parseCommunityReviewInstrumentIdentity,
  parseCommunityReviewPublicEvidenceArtifact,
  parseCommunityReviewQualificationReceipt,
  parseCommunityReviewReviewerPacket,
  parseCommunityReviewSubmission,
  parseFrozenCommunityReviewPool,
} from "../../../src/contracts/community-review-validation.js";
import {
  canonicalCommunityReviewJson,
  communityReviewAtomicIdentityKey,
} from "../../../src/community-review/fingerprint.js";
import { communityReviewAgreementEvidencePersistenceFingerprint } from "./persistence.js";
import { emptyCommunityReviewPersistenceSnapshot } from "./persistence.js";
import {
  QUALIFICATION_PASS_RULE_ID,
} from "./qualification.js";
import type { QualificationStoredResponse } from "./qualification.js";
import { CommunityReviewServiceError } from "./errors.js";
import type {
  CommunityReviewDisclosurePolicy,
  CommunityReviewSubmission,
} from "../../../src/contracts/community-review.js";
import type {
  AcceptedSubmissionRecord,
  AuthAuditEventRecord,
  CommunityReviewAgreementEvidenceRecord,
  CommunityReviewDisclosureRecord,
  CommunityReviewEvidenceAuditEventRecord,
  CommunityReviewPersistence,
  CommunityReviewPersistenceSnapshot,
  CommunityReviewPersistenceTransaction,
  FrozenReviewPoolRecord,
  QualificationAttemptRecord,
  QualificationAuthorityAuditEventRecord,
  ReviewDeliveryAuditEventRecord,
  QualificationPoolRecord,
  QualificationReceiptRecord,
  RejectedSubmissionAttemptRecord,
  ReviewerAuthIdentityRecord,
  ReviewerAccountRecord,
  ReviewerConsentRecord,
  ReviewAssignmentRecord,
  ReviewBatchCloseRecord,
  ReviewBatchRecord,
  ReviewSubmissionAuditEventRecord,
  SealedBatchPayloadReferenceRecord,
} from "./persistence.js";

interface DatabaseState {
  readonly reviewerAccounts: Map<string, ReviewerAccountRecord>;
  readonly reviewerIds: Map<string, string>;
  readonly reviewerAuthIdentities: Map<string, ReviewerAuthIdentityRecord>;
  readonly reviewerAuthSubjects: Map<string, string>;
  readonly reviewerAuthAccounts: Map<string, string>;
  readonly reviewerConsents: Map<string, ReviewerConsentRecord>;
  readonly reviewerConsentHistory: Map<string, string[]>;
  readonly authAuditEvents: Map<string, AuthAuditEventRecord>;
  readonly qualificationAuditEvents: Map<string, QualificationAuthorityAuditEventRecord>;
  readonly reviewDeliveryAuditEvents: Map<string, ReviewDeliveryAuditEventRecord>;
  readonly reviewSubmissionAuditEvents: Map<string, ReviewSubmissionAuditEventRecord>;
  readonly qualificationPools: Map<string, QualificationPoolRecord>;
  readonly qualificationAttempts: Map<string, QualificationAttemptRecord>;
  readonly attemptNonces: Map<string, string>;
  readonly qualificationReceipts: Map<string, QualificationReceiptRecord>;
  readonly receiptAttempts: Map<string, string>;
  readonly batches: Map<string, ReviewBatchRecord>;
  readonly batchFingerprints: Map<string, string>;
  readonly sealedBatchPayloadReferences: Map<string, SealedBatchPayloadReferenceRecord>;
  readonly assignments: Map<string, ReviewAssignmentRecord>;
  readonly assignmentBatchReviewers: Map<string, string>;
  readonly acceptedSubmissions: Map<string, AcceptedSubmissionRecord>;
  readonly submissionFingerprints: Map<string, string>;
  readonly submissionBatchReviewers: Map<string, string>;
  readonly rejectedSubmissionAttempts: Map<string, RejectedSubmissionAttemptRecord>;
  readonly batchCloseRecords: Map<string, ReviewBatchCloseRecord>;
  readonly closeFingerprints: Map<string, string>;
  readonly frozenReviewPools: Map<string, FrozenReviewPoolRecord>;
  readonly freezeFingerprints: Map<string, string>;
  readonly agreementEvidence: Map<string, CommunityReviewAgreementEvidenceRecord>;
  readonly agreementEvidenceFingerprints: Map<string, string>;
  readonly disclosures: Map<string, CommunityReviewDisclosureRecord>;
  readonly evidenceAuditEvents: Map<string, CommunityReviewEvidenceAuditEventRecord>;
}

function emptyState(): DatabaseState {
  return {
    reviewerAccounts: new Map(),
    reviewerIds: new Map(),
    reviewerAuthIdentities: new Map(),
    reviewerAuthSubjects: new Map(),
    reviewerAuthAccounts: new Map(),
    reviewerConsents: new Map(),
    reviewerConsentHistory: new Map(),
    authAuditEvents: new Map(),
    qualificationAuditEvents: new Map(),
    reviewDeliveryAuditEvents: new Map(),
    reviewSubmissionAuditEvents: new Map(),
    qualificationPools: new Map(),
    qualificationAttempts: new Map(),
    attemptNonces: new Map(),
    qualificationReceipts: new Map(),
    receiptAttempts: new Map(),
    batches: new Map(),
    batchFingerprints: new Map(),
    sealedBatchPayloadReferences: new Map(),
    assignments: new Map(),
    assignmentBatchReviewers: new Map(),
    acceptedSubmissions: new Map(),
    submissionFingerprints: new Map(),
    submissionBatchReviewers: new Map(),
    rejectedSubmissionAttempts: new Map(),
    batchCloseRecords: new Map(),
    closeFingerprints: new Map(),
    frozenReviewPools: new Map(),
    freezeFingerprints: new Map(),
    agreementEvidence: new Map(),
    agreementEvidenceFingerprints: new Map(),
    disclosures: new Map(),
    evidenceAuditEvents: new Map(),
  };
}

function copy<T>(value: T): T {
  return structuredClone(value);
}

function stateFromSnapshot(snapshot: CommunityReviewPersistenceSnapshot): DatabaseState {
  const state = emptyState();
  for (const record of snapshot.reviewerAccounts) {
    const stored = copy(record);
    state.reviewerAccounts.set(record.internalId, stored);
    state.reviewerIds.set(record.reviewerId, record.internalId);
  }
  for (const record of snapshot.reviewerAuthIdentities) {
    const stored = copy(record);
    state.reviewerAuthIdentities.set(record.authIdentityId, stored);
    state.reviewerAuthSubjects.set(authSubjectKey(record.authProvider, record.authSubject), record.authIdentityId);
    state.reviewerAuthAccounts.set(record.internalId, record.authIdentityId);
  }
  for (const record of snapshot.reviewerConsents) {
    const stored = copy(record);
    state.reviewerConsents.set(record.consentEventId, stored);
    const key = consentKey(record.internalId, record.policyId, record.policyVersion);
    state.reviewerConsentHistory.set(key, [
      ...(state.reviewerConsentHistory.get(key) ?? []),
      record.consentEventId,
    ]);
  }
  for (const history of state.reviewerConsentHistory.values()) {
    history.sort((left, right) => {
      const leftRecord = state.reviewerConsents.get(left)!;
      const rightRecord = state.reviewerConsents.get(right)!;
      return leftRecord.recordedAt.localeCompare(rightRecord.recordedAt) || left.localeCompare(right);
    });
  }
  for (const record of snapshot.authAuditEvents) state.authAuditEvents.set(record.eventId, copy(record));
  for (const record of snapshot.qualificationAuditEvents) {
    state.qualificationAuditEvents.set(record.eventId, copy(record));
  }
  for (const record of snapshot.reviewDeliveryAuditEvents) {
    state.reviewDeliveryAuditEvents.set(record.eventId, copy(record));
  }
  for (const record of snapshot.reviewSubmissionAuditEvents) {
    state.reviewSubmissionAuditEvents.set(record.eventId, copy(record));
  }
  for (const record of snapshot.qualificationPools) {
    state.qualificationPools.set(poolKey(record.poolId, record.poolVersion), copy(record));
  }
  for (const record of snapshot.qualificationAttempts) {
    state.qualificationAttempts.set(record.attemptId, copy(record));
    state.attemptNonces.set(attemptNonceKey(record), record.attemptId);
  }
  for (const record of snapshot.qualificationReceipts) {
    state.qualificationReceipts.set(record.receiptFingerprint, copy(record));
    state.receiptAttempts.set(record.attemptId, record.receiptFingerprint);
  }
  for (const record of snapshot.batches) {
    state.batches.set(record.batchId, copy(record));
    state.batchFingerprints.set(record.batchFingerprint, record.batchId);
  }
  for (const record of snapshot.sealedBatchPayloadReferences) {
    state.sealedBatchPayloadReferences.set(record.batchId, copy(record));
  }
  for (const record of snapshot.assignments) {
    state.assignments.set(record.assignment.assignmentId, copy(record));
    state.assignmentBatchReviewers.set(
      batchReviewerKey(record.assignment.batchId, record.assignment.reviewerId),
      record.assignment.assignmentId,
    );
  }
  for (const record of snapshot.acceptedSubmissions) {
    state.acceptedSubmissions.set(record.submission.assignmentId, copy(record));
    state.submissionFingerprints.set(record.submission.submissionFingerprint, record.submission.assignmentId);
    state.submissionBatchReviewers.set(
      batchReviewerKey(record.submission.batchId, record.submission.reviewerId),
      record.submission.assignmentId,
    );
  }
  for (const record of snapshot.rejectedSubmissionAttempts) {
    state.rejectedSubmissionAttempts.set(record.rejectionId, copy(record));
  }
  for (const record of snapshot.batchCloseRecords) {
    state.batchCloseRecords.set(record.batchId, copy(record));
    state.closeFingerprints.set(record.closeRecord.closeFingerprint, record.batchId);
  }
  for (const record of snapshot.frozenReviewPools) {
    state.frozenReviewPools.set(record.batchId, copy(record));
    state.freezeFingerprints.set(record.frozenPool.freezeFingerprint, record.batchId);
  }
  for (const record of snapshot.agreementEvidence) {
    state.agreementEvidence.set(record.batchId, copy(record));
    state.agreementEvidenceFingerprints.set(record.evidencePersistenceFingerprint, record.batchId);
  }
  for (const record of snapshot.disclosures) state.disclosures.set(record.disclosureId, copy(record));
  for (const record of snapshot.evidenceAuditEvents) {
    state.evidenceAuditEvents.set(record.eventId, copy(record));
  }
  return state;
}

function same(left: unknown, right: unknown): boolean {
  return canonicalCommunityReviewJson(left) === canonicalCommunityReviewJson(right);
}

function invalidRecord(): never {
  throw new CommunityReviewServiceError("invalid_service_record");
}

function sortedSubmissions(
  submissions: readonly CommunityReviewSubmission[],
): CommunityReviewSubmission[] {
  return [...submissions].sort((left, right) =>
    left.submissionFingerprint.localeCompare(right.submissionFingerprint));
}

function requiredString(value: string): void {
  if (value.trim().length === 0) throw new CommunityReviewServiceError("invalid_service_record");
}

function authProvider(value: string): void {
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/u.test(value)) {
    throw new CommunityReviewServiceError("invalid_service_record");
  }
}

function authSubject(value: string): void {
  if (value.trim().length === 0 || value.length > 512 || value.includes("\u0000")) {
    throw new CommunityReviewServiceError("invalid_service_record");
  }
}

function policyComponent(value: string): void {
  if (value.trim().length === 0 || value.length > 128 || value.includes("\u0000")) {
    throw new CommunityReviewServiceError("invalid_service_record");
  }
}

function timestamp(value: string): void {
  requiredString(value);
  if (Number.isNaN(Date.parse(value))) throw new CommunityReviewServiceError("invalid_service_record");
}

function opaqueId(value: string): void {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/u.test(value) || value.includes("@")) {
    throw new CommunityReviewServiceError("invalid_service_record");
  }
}

function fingerprint(value: string): void {
  if (!/^sha256:[0-9a-f]{64}$/u.test(value)) {
    throw new CommunityReviewServiceError("invalid_service_record");
  }
}

function poolKey(poolId: string, poolVersion: string): string {
  return `${poolId}\u0000${poolVersion}`;
}

function attemptNonceKey(record: QualificationAttemptRecord): string {
  // A nonce is generated by the service and is unique within a pool, even if
  // an attacker tries to replay the same token under another reviewer.
  return `${poolKey(record.poolId, record.poolVersion)}\u0000${record.nonceHash}`;
}

function batchReviewerKey(batchId: string, reviewerId: string): string {
  return `${batchId}\u0000${reviewerId}`;
}

function authSubjectKey(authProviderValue: string, authSubjectValue: string): string {
  return `${authProviderValue}\u0000${authSubjectValue}`;
}

function consentKey(internalId: string, policyId: string, policyVersion: string): string {
  return `${internalId}\u0000${policyId}\u0000${policyVersion}`;
}

function stateRank(state: ReviewBatchRecord["state"]): number {
  return { SEALED: 0, OPEN: 1, CLOSED: 2, FROZEN: 3 }[state];
}

function qualificationPoolStateRank(state: QualificationPoolRecord["state"]): number {
  return { DRAFT: 0, SEALED: 1, ACTIVE: 2, RETIRED: 3, OPEN: 2 }[state];
}

function assertBatchRecord(record: ReviewBatchRecord): void {
  const manifest = parseCommunityReviewBatchManifest(record.manifest);
  if (manifest.batchId !== record.batchId || manifest.batchFingerprint !== record.batchFingerprint ||
    manifest.state !== record.state || record.stateVersion < 0 || !Number.isInteger(record.stateVersion)) {
    throw new CommunityReviewServiceError("invalid_service_record");
  }
  requiredString(record.sealedSourceReference);
}

function assertReviewerAccountRecord(record: ReviewerAccountRecord): void {
  opaqueId(record.internalId);
  opaqueId(record.reviewerId);
  requiredString(record.privateAuthSubjectReference);
  requiredString(record.consentVersion);
  timestamp(record.createdAt);
  timestamp(record.updatedAt);
  if (!["ACTIVE", "WITHDRAWN", "DISABLED"].includes(record.status) ||
    !["NOT_CONSENTED", "CONSENTED", "REVOKED"].includes(record.consentState)) {
    throw new CommunityReviewServiceError("invalid_service_record");
  }
}

function assertReviewerAuthIdentityRecord(record: ReviewerAuthIdentityRecord): void {
  opaqueId(record.authIdentityId);
  opaqueId(record.internalId);
  opaqueId(record.reviewerId);
  authProvider(record.authProvider);
  authSubject(record.authSubject);
  timestamp(record.createdAt);
}

function assertReviewerConsentRecord(record: ReviewerConsentRecord): void {
  opaqueId(record.consentEventId);
  opaqueId(record.internalId);
  opaqueId(record.reviewerId);
  policyComponent(record.policyId);
  policyComponent(record.policyVersion);
  timestamp(record.recordedAt);
  if (record.state === "ACCEPTED") {
    if (record.acceptedAt === undefined || record.revokedAt !== undefined) {
      throw new CommunityReviewServiceError("invalid_service_record");
    }
    timestamp(record.acceptedAt);
    return;
  }
  if (record.state !== "REVOKED") {
    throw new CommunityReviewServiceError("invalid_service_record");
  }
  if (record.revokedAt === undefined || record.acceptedAt !== undefined) {
    throw new CommunityReviewServiceError("invalid_service_record");
  }
  timestamp(record.revokedAt);
}

function assertAuthAuditEventRecord(record: AuthAuditEventRecord): void {
  opaqueId(record.eventId);
  if (!["account_created", "consent_accepted", "consent_revoked", "account_withdrawn",
    "account_disabled", "authentication_mapping_created", "authentication_mapping_rejected"]
    .includes(record.eventType)) {
    throw new CommunityReviewServiceError("invalid_service_record");
  }
  if (record.internalId !== undefined) opaqueId(record.internalId);
  if (record.reviewerId !== undefined) opaqueId(record.reviewerId);
  if (record.authProvider !== undefined) authProvider(record.authProvider);
  if (record.reasonCode !== undefined) {
    if (!/^[A-Za-z0-9._:-]{1,80}$/u.test(record.reasonCode)) {
      throw new CommunityReviewServiceError("invalid_service_record");
    }
  }
  timestamp(record.occurredAt);
}

function assertQualificationAuthorityAuditEventRecord(
  record: QualificationAuthorityAuditEventRecord,
): void {
  opaqueId(record.eventId);
  if (!["pool_registered", "pool_sealed", "pool_activated", "pool_retired", "attempt_issued",
    "response_submitted", "qualification_passed", "qualification_failed", "receipt_issued"]
    .includes(record.eventType)) {
    throw new CommunityReviewServiceError("invalid_service_record");
  }
  if (record.reviewerId !== undefined) opaqueId(record.reviewerId);
  if (record.attemptId !== undefined) requiredString(record.attemptId);
  if (record.poolId !== undefined) requiredString(record.poolId);
  if (record.poolVersion !== undefined) requiredString(record.poolVersion);
  if ((record.poolId === undefined) !== (record.poolVersion === undefined)) {
    throw new CommunityReviewServiceError("invalid_service_record");
  }
  if (record.reasonCode !== undefined && !/^[A-Za-z0-9._:-]{1,80}$/u.test(record.reasonCode)) {
    throw new CommunityReviewServiceError("invalid_service_record");
  }
  timestamp(record.occurredAt);
}

function assertReviewDeliveryAuditEventRecord(record: ReviewDeliveryAuditEventRecord): void {
  opaqueId(record.eventId);
  if (![
    "assignment_issued",
    "assignment_retrieved",
    "assignment_withdrawn",
    "assignment_issuance_rejected",
    "batch_material_mismatch",
    "eligibility_rejected",
  ].includes(record.eventType)) {
    throw new CommunityReviewServiceError("invalid_service_record");
  }
  if (record.batchId !== undefined) requiredString(record.batchId);
  if (record.assignmentId !== undefined) requiredString(record.assignmentId);
  if (record.reviewerId !== undefined) opaqueId(record.reviewerId);
  if (record.reasonCode !== undefined && !/^[A-Za-z0-9._:-]{1,80}$/u.test(record.reasonCode)) {
    throw new CommunityReviewServiceError("invalid_service_record");
  }
  timestamp(record.occurredAt);
}

function assertQualificationPoolRecord(record: QualificationPoolRecord): void {
  requiredString(record.qualificationId);
  requiredString(record.qualificationVersion);
  requiredString(record.poolId);
  requiredString(record.poolVersion);
  fingerprint(record.definitionFingerprint);
  fingerprint(record.instrumentFingerprint);
  requiredString(record.reviewLocale);
  requiredString(record.sealedDefinitionReference);
  requiredString(record.privateAnswerKeyReference);
  if (!["DRAFT", "SEALED", "ACTIVE", "RETIRED", "OPEN"].includes(record.state)) {
    throw new CommunityReviewServiceError("invalid_service_record");
  }
  if (record.dataKind === "synthetic-fixture" && record.fixture === undefined ||
    record.dataKind === "community-review" && record.fixture !== undefined) {
    throw new CommunityReviewServiceError("invalid_service_record");
  }
  const stateVersion = record.stateVersion ?? 0;
  if (!Number.isInteger(stateVersion) || stateVersion < 0) {
    throw new CommunityReviewServiceError("invalid_service_record");
  }
  if (record.instrument !== undefined) {
    const instrument = parseCommunityReviewInstrumentIdentity(record.instrument);
    if (instrument.fingerprint !== record.instrumentFingerprint ||
      instrument.reviewLocale !== record.reviewLocale) {
      throw new CommunityReviewServiceError("invalid_service_record");
    }
  }
  if (record.state === "DRAFT" && record.instrument === undefined ||
    record.state === "OPEN" && (record.instrument !== undefined ||
      record.visibleTaskSetFingerprint !== undefined || record.answerKeyCommitment !== undefined ||
      record.passRuleId !== undefined || record.sealedAt !== undefined || record.retiredAt !== undefined)) {
    throw new CommunityReviewServiceError("invalid_service_record");
  }
  const sealedState = record.state === "SEALED" || record.state === "ACTIVE" ||
    record.state === "RETIRED";
  if (sealedState && (record.instrument === undefined ||
    record.visibleTaskSetFingerprint === undefined || record.answerKeyCommitment === undefined ||
    record.passRuleId !== QUALIFICATION_PASS_RULE_ID || record.sealedAt === undefined)) {
    throw new CommunityReviewServiceError("invalid_service_record");
  }
  if (record.visibleTaskSetFingerprint !== undefined) fingerprint(record.visibleTaskSetFingerprint);
  if (record.answerKeyCommitment !== undefined) fingerprint(record.answerKeyCommitment);
  if (record.passRuleId !== undefined && record.passRuleId !== QUALIFICATION_PASS_RULE_ID) {
    throw new CommunityReviewServiceError("invalid_service_record");
  }
  if (record.sealedAt !== undefined) timestamp(record.sealedAt);
  if (record.state === "RETIRED") {
    if (record.retiredAt === undefined) throw new CommunityReviewServiceError("invalid_service_record");
    timestamp(record.retiredAt);
  } else if (record.retiredAt !== undefined) {
    throw new CommunityReviewServiceError("invalid_service_record");
  }
  timestamp(record.createdAt);
  timestamp(record.updatedAt);
}

function assertStoredResponses(value: readonly QualificationStoredResponse[]): void {
  const identities = new Set<string>();
  for (const response of value) {
    requiredString(response.caseId);
    requiredString(response.rubricId);
    requiredString(response.requirementId);
    if (!new Set(["SATISFIED", "OMITTED_OR_INCOMPLETE", "EXPLICIT_CONFLICT"]).has(response.status)) {
      throw new CommunityReviewServiceError("invalid_service_record");
    }
    const key = JSON.stringify([response.caseId, response.rubricId, response.requirementId]);
    if (identities.has(key)) throw new CommunityReviewServiceError("invalid_service_record");
    identities.add(key);
  }
}

function assertIssuedQualificationBinding(record: QualificationAttemptRecord): void {
  if (record.issuedAt === undefined || record.qualificationDefinitionFingerprint === undefined ||
    record.instrumentFingerprint === undefined || record.reviewLocale === undefined ||
    record.packetFingerprint === undefined) {
    throw new CommunityReviewServiceError("invalid_service_record");
  }
}

function assertQualificationAttemptRecord(record: QualificationAttemptRecord): void {
  requiredString(record.attemptId);
  opaqueId(record.reviewerId);
  requiredString(record.poolId);
  requiredString(record.poolVersion);
  requiredString(record.nonceHash);
  requiredString(record.startedAt);
  timestamp(record.startedAt);
  if (!["CREATED", "ISSUED", "SUBMITTED", "QUALIFIED", "NOT_QUALIFIED", "EXPIRED", "STARTED", "REJECTED"]
    .includes(record.state)) throw new CommunityReviewServiceError("invalid_service_record");
  if (record.issuedAt !== undefined) timestamp(record.issuedAt);
  if (record.submittedAt !== undefined) timestamp(record.submittedAt);
  if (record.evaluatedAt !== undefined) timestamp(record.evaluatedAt);
  if (record.qualificationDefinitionFingerprint !== undefined) fingerprint(record.qualificationDefinitionFingerprint);
  if (record.instrumentFingerprint !== undefined) fingerprint(record.instrumentFingerprint);
  if (record.reviewLocale !== undefined) requiredString(record.reviewLocale);
  if (record.packetFingerprint !== undefined) fingerprint(record.packetFingerprint);
  if (record.responseFingerprint !== undefined) fingerprint(record.responseFingerprint);
  if (record.responses !== undefined) assertStoredResponses(record.responses);
  if (record.evaluationRuleId !== undefined && record.evaluationRuleId !== QUALIFICATION_PASS_RULE_ID) {
    throw new CommunityReviewServiceError("invalid_service_record");
  }
  if (record.failureCode !== undefined && !/^[A-Za-z0-9._:-]{1,80}$/u.test(record.failureCode)) {
    throw new CommunityReviewServiceError("invalid_service_record");
  }
  if (record.state === "CREATED" || record.state === "ISSUED" || record.state === "STARTED") {
    if (record.result !== undefined || record.submittedAt !== undefined || record.evaluatedAt !== undefined ||
      record.responses !== undefined || record.responseFingerprint !== undefined ||
      record.evaluationRuleId !== undefined || record.failureCode !== undefined) {
      throw new CommunityReviewServiceError("invalid_service_record");
    }
    if (record.state === "ISSUED") assertIssuedQualificationBinding(record);
    return;
  }
  if (record.state === "SUBMITTED") {
    if (record.result !== undefined || record.submittedAt === undefined || record.evaluatedAt !== undefined ||
      record.responses === undefined || record.responseFingerprint === undefined ||
      record.evaluationRuleId !== undefined || record.failureCode !== undefined) {
      throw new CommunityReviewServiceError("invalid_service_record");
    }
    assertIssuedQualificationBinding(record);
    return;
  }
  if (record.state === "QUALIFIED" || record.state === "NOT_QUALIFIED" || record.state === "REJECTED") {
    if ((record.state === "QUALIFIED" || record.state === "NOT_QUALIFIED" || record.state === "REJECTED") &&
      record.evaluationRuleId === undefined && record.responses === undefined &&
      record.responseFingerprint === undefined && record.evaluatedAt === undefined) {
      // Historical P4-A rows have no evaluator projection and remain accepted
      // only through the compatibility receipt registration path.
      if (record.state === "QUALIFIED" && record.result !== "qualified" ||
        record.state === "NOT_QUALIFIED" && record.result !== "not-qualified" ||
        record.state === "REJECTED" && record.result !== "not-qualified") {
        throw new CommunityReviewServiceError("invalid_service_record");
      }
      return;
    }
    assertIssuedQualificationBinding(record);
    requiredString(record.submittedAt ?? "");
    requiredString(record.evaluatedAt ?? "");
    if (record.responses === undefined || record.responseFingerprint === undefined ||
      record.evaluationRuleId !== QUALIFICATION_PASS_RULE_ID) {
      throw new CommunityReviewServiceError("invalid_service_record");
    }
    if (record.state === "QUALIFIED" && record.result !== "qualified" ||
      record.state === "NOT_QUALIFIED" && record.result !== "not-qualified" ||
      record.state === "REJECTED" && record.result !== "not-qualified") {
      throw new CommunityReviewServiceError("invalid_service_record");
    }
    if (record.state === "QUALIFIED" && record.failureCode !== undefined) {
      throw new CommunityReviewServiceError("invalid_service_record");
    }
    return;
  }
  if (record.state === "EXPIRED" && record.result !== undefined) {
    throw new CommunityReviewServiceError("invalid_service_record");
  }
}

function assertAssignmentRecord(record: ReviewAssignmentRecord): void {
  const assignment = parseCommunityReviewAssignment(record.assignment);
  const packet = parseCommunityReviewReviewerPacket(record.packet);
  const assignmentAtomicIds = assignment.visibleAtomicIds.map(communityReviewAtomicIdentityKey).sort();
  const packetAtomicIds = packet.tasks.flatMap((task) => task.rubrics.flatMap((rubric) =>
    rubric.requirements.map((requirement) => communityReviewAtomicIdentityKey({
      caseId: task.caseId,
      rubricId: rubric.id,
      requirementId: requirement.id,
    }))
  )).sort();
  if (!["assigned", "withdrawn"].includes(assignment.assignmentState) ||
    packet.dataKind !== assignment.dataKind || !same(packet.fixture, assignment.fixture) ||
    packet.protocolId !== assignment.protocolId || packet.protocolVersion !== assignment.protocolVersion ||
    packet.assignmentId !== assignment.assignmentId ||
    packet.batchId !== assignment.batchId || packet.batchFingerprint !== assignment.batchFingerprint ||
    packet.reviewerId !== assignment.reviewerId ||
    packet.qualificationReceiptFingerprint !== assignment.qualificationReceiptFingerprint ||
    packet.taskSetFingerprint !== assignment.visibleTaskSetFingerprint ||
    !same(packet.instrument, assignment.instrument) ||
    !same(packetAtomicIds, assignmentAtomicIds)) {
    throw new CommunityReviewServiceError("invalid_service_record");
  }
}

function assertQualificationReceiptRecord(record: QualificationReceiptRecord): void {
  const receipt = parseCommunityReviewQualificationReceipt(record.receipt);
  fingerprint(record.receiptFingerprint);
  if (receipt.receiptFingerprint !== record.receiptFingerprint || receipt.reviewerId !== record.reviewerId ||
    receipt.qualificationPoolId !== record.poolId || receipt.qualificationPoolVersion !== record.poolVersion ||
    !["authoritative", "revoked"].includes(record.authorityState) ||
    record.authorityState === "revoked" && record.revokedAt === undefined ||
    record.authorityState === "authoritative" && record.revokedAt !== undefined) {
    throw new CommunityReviewServiceError("invalid_service_record");
  }
}

function assertBatchCloseRecord(record: ReviewBatchCloseRecord): void {
  const manifest = parseCommunityReviewBatchManifest(record.manifest);
  const closeRecord = parseCommunityReviewBatchCloseRecord(record.closeRecord);
  if (manifest.batchId !== record.batchId || manifest.state !== "CLOSED" ||
    closeRecord.batchId !== record.batchId || closeRecord.batchFingerprint !== manifest.batchFingerprint ||
    closeRecord.dataKind !== manifest.dataKind || !same(closeRecord.fixture, manifest.fixture) ||
    closeRecord.protocolId !== manifest.protocolId || closeRecord.protocolVersion !== manifest.protocolVersion ||
    !same(closeRecord.instrument, manifest.instrument) ||
    !same(closeRecord.qualificationEligibility, manifest.qualificationEligibility) ||
    closeRecord.visibleTaskSetFingerprint !== manifest.visibleTaskSetFingerprint ||
    closeRecord.batchPurpose !== manifest.batchPurpose ||
    closeRecord.blindnessMode !== manifest.blindnessMode ||
    closeRecord.closeFingerprint !== manifest.closeRecordFingerprint ||
    !Array.isArray(record.acceptedSubmissions)) invalidRecord();

  const submissions = record.acceptedSubmissions.map((value) => parseCommunityReviewSubmission(value));
  const assignmentIds = submissions.map((submission) => submission.assignmentId).sort();
  const reviewerIds = submissions.map((submission) => submission.reviewerId).sort();
  const submissionFingerprints = submissions.map((submission) => submission.submissionFingerprint).sort();
  if (submissions.some((submission) => submission.submissionDisposition !== "accepted-before-close" ||
    submission.batchId !== record.batchId || submission.batchFingerprint !== manifest.batchFingerprint ||
    submission.dataKind !== closeRecord.dataKind || !same(submission.fixture, closeRecord.fixture) ||
    !same(submission.instrument, closeRecord.instrument) ||
    submission.taskSetFingerprint !== closeRecord.visibleTaskSetFingerprint) ||
    new Set(assignmentIds).size !== assignmentIds.length ||
    new Set(reviewerIds).size !== reviewerIds.length ||
    new Set(submissionFingerprints).size !== submissionFingerprints.length ||
    !same(assignmentIds, [...closeRecord.acceptedAssignmentIds].sort()) ||
    !same(reviewerIds, [...closeRecord.acceptedReviewerIds].sort()) ||
    !same(submissionFingerprints, [...closeRecord.acceptedSubmissionFingerprints].sort())) {
    invalidRecord();
  }
  timestamp(record.createdAt);
}

function assertSubmissionRecord(record: AcceptedSubmissionRecord): void {
  const submission = parseCommunityReviewSubmission(record.submission);
  if (submission.submissionDisposition !== "accepted-before-close") {
    throw new CommunityReviewServiceError("invalid_service_record");
  }
  timestamp(record.acceptedAt);
}

function assertReviewSubmissionAuditEventRecord(record: ReviewSubmissionAuditEventRecord): void {
  opaqueId(record.eventId);
  if (record.eventType !== "submission_accepted") invalidRecord();
  requiredString(record.batchId);
  requiredString(record.assignmentId);
  opaqueId(record.reviewerId);
  fingerprint(record.submissionFingerprint);
  timestamp(record.occurredAt);
}

function assertDisclosurePolicy(policy: CommunityReviewDisclosurePolicy): void {
  if (typeof policy !== "object" || policy === null || Array.isArray(policy) ||
    Object.keys(policy).some((key) => ![
      "publishReviewerIds",
      "publishAtomicAnnotations",
      "publishReviewerEvidence",
    ].includes(key)) || typeof policy.publishReviewerIds !== "boolean" ||
    typeof policy.publishAtomicAnnotations !== "boolean" ||
    typeof policy.publishReviewerEvidence !== "boolean") {
    invalidRecord();
  }
}

function publicArtifactFingerprint(
  artifact: NonNullable<CommunityReviewDisclosureRecord["publicArtifact"]>,
): string {
  const { disclosureDate, ...identity } = artifact;
  if (disclosureDate.length === 0) invalidRecord();
  return communityReviewPublicArtifactFingerprint(identity);
}

function assertAgreementEvidenceRecord(record: CommunityReviewAgreementEvidenceRecord): void {
  requiredString(record.batchId);
  fingerprint(record.freezeFingerprint);
  fingerprint(record.evidencePersistenceFingerprint);
  if (typeof record.evidence !== "object" || record.evidence === null ||
    record.evidence.schemaVersion !== 1 || record.evidence.agreementKind !== "community-review-agreement" ||
    record.evidence.poolFingerprint !== record.freezeFingerprint) {
    invalidRecord();
  }
  timestamp(record.createdAt);
}

function assertDisclosureRecord(record: CommunityReviewDisclosureRecord): void {
  opaqueId(record.disclosureId);
  requiredString(record.batchId);
  fingerprint(record.freezeFingerprint);
  fingerprint(record.agreementEvidencePersistenceFingerprint);
  if (!Number.isInteger(record.disclosureVersion) || record.disclosureVersion < 1 ||
    (record.mode !== "PRIVATE" && record.mode !== "PUBLIC")) invalidRecord();
  assertDisclosurePolicy(record.disclosurePolicy);
  if (record.disclosureDate !== undefined && !/^\d{4}-\d{2}-\d{2}$/u.test(record.disclosureDate)) {
    invalidRecord();
  }
  if (record.mode === "PRIVATE" && (record.disclosureDate !== undefined ||
    record.publicArtifact !== undefined || record.publicArtifactFingerprint !== undefined ||
    record.disclosurePolicy.publishReviewerIds || record.disclosurePolicy.publishAtomicAnnotations ||
    record.disclosurePolicy.publishReviewerEvidence)) invalidRecord();
  if (record.mode === "PUBLIC") {
    if (record.disclosureDate === undefined || record.publicArtifact === undefined ||
      record.publicArtifactFingerprint === undefined) invalidRecord();
    const artifact = parseCommunityReviewPublicEvidenceArtifact(record.publicArtifact);
    fingerprint(record.publicArtifactFingerprint);
    if (artifact.batchId !== record.batchId || artifact.frozenPoolFingerprint !== record.freezeFingerprint ||
      !same(artifact.disclosurePolicy, record.disclosurePolicy) || artifact.disclosureDate !== record.disclosureDate ||
      publicArtifactFingerprint(artifact) !== record.publicArtifactFingerprint) invalidRecord();
  } else if (record.publicArtifact !== undefined || record.publicArtifactFingerprint !== undefined) {
    invalidRecord();
  }
  timestamp(record.createdAt);
}

function assertEvidenceAuditEventRecord(record: CommunityReviewEvidenceAuditEventRecord): void {
  opaqueId(record.eventId);
  if (!["batch_frozen", "freeze_retrieved", "agreement_evidence_generated",
    "agreement_evidence_retrieved", "disclosure_created", "public_artifact_generated",
    "disclosure_rejected"].includes(record.eventType)) invalidRecord();
  requiredString(record.batchId);
  if (record.freezeFingerprint !== undefined) fingerprint(record.freezeFingerprint);
  if (record.agreementEvidencePersistenceFingerprint !== undefined) {
    fingerprint(record.agreementEvidencePersistenceFingerprint);
  }
  if (record.disclosureId !== undefined) opaqueId(record.disclosureId);
  if (record.disclosureVersion !== undefined &&
    (!Number.isInteger(record.disclosureVersion) || record.disclosureVersion < 1)) invalidRecord();
  if (record.disclosureMode !== undefined && record.disclosureMode !== "PRIVATE" &&
    record.disclosureMode !== "PUBLIC") invalidRecord();
  if (record.disclosurePolicy !== undefined) assertDisclosurePolicy(record.disclosurePolicy);
  if (record.reasonCode !== undefined && !/^[A-Za-z0-9._:-]{1,80}$/u.test(record.reasonCode)) invalidRecord();
  timestamp(record.occurredAt);
}

class InMemoryCommunityReviewTransaction implements CommunityReviewPersistenceTransaction {
  constructor(private readonly state: DatabaseState) {}

  getReviewerAccount(internalId: string): ReviewerAccountRecord | undefined {
    const record = this.state.reviewerAccounts.get(internalId);
    return record === undefined ? undefined : copy(record);
  }

  getReviewerAccountByReviewerId(reviewerId: string): ReviewerAccountRecord | undefined {
    const internalId = this.state.reviewerIds.get(reviewerId);
    return internalId === undefined ? undefined : this.getReviewerAccount(internalId);
  }

  insertReviewerAccount(record: ReviewerAccountRecord): ReviewerAccountRecord {
    assertReviewerAccountRecord(record);
    if (this.state.reviewerAccounts.has(record.internalId) || this.state.reviewerIds.has(record.reviewerId)) {
      throw new CommunityReviewServiceError("repository_conflict");
    }
    const stored = copy(record);
    this.state.reviewerAccounts.set(record.internalId, stored);
    this.state.reviewerIds.set(record.reviewerId, record.internalId);
    return copy(stored);
  }

  updateReviewerAccount(record: ReviewerAccountRecord): ReviewerAccountRecord {
    assertReviewerAccountRecord(record);
    const previous = this.state.reviewerAccounts.get(record.internalId);
    if (previous === undefined || previous.reviewerId !== record.reviewerId ||
      (previous.privateAuthSubjectReference !== record.privateAuthSubjectReference &&
        this.state.reviewerAuthAccounts.has(record.internalId)) ||
      record.createdAt !== previous.createdAt) {
      throw new CommunityReviewServiceError("repository_conflict");
    }
    const stored = copy(record);
    this.state.reviewerAccounts.set(record.internalId, stored);
    return copy(stored);
  }

  getReviewerAuthIdentity(authIdentityId: string): ReviewerAuthIdentityRecord | undefined {
    const record = this.state.reviewerAuthIdentities.get(authIdentityId);
    return record === undefined ? undefined : copy(record);
  }

  getReviewerAuthIdentityBySubject(
    authProviderValue: string,
    authSubjectValue: string,
  ): ReviewerAuthIdentityRecord | undefined {
    const authIdentityId = this.state.reviewerAuthSubjects.get(
      authSubjectKey(authProviderValue, authSubjectValue),
    );
    return authIdentityId === undefined ? undefined : this.getReviewerAuthIdentity(authIdentityId);
  }

  getReviewerAuthIdentityByInternalId(internalId: string): ReviewerAuthIdentityRecord | undefined {
    const authIdentityId = this.state.reviewerAuthAccounts.get(internalId);
    return authIdentityId === undefined ? undefined : this.getReviewerAuthIdentity(authIdentityId);
  }

  insertReviewerAuthIdentity(record: ReviewerAuthIdentityRecord): ReviewerAuthIdentityRecord {
    assertReviewerAuthIdentityRecord(record);
    const account = this.state.reviewerAccounts.get(record.internalId);
    if (account === undefined || account.reviewerId !== record.reviewerId ||
      account.privateAuthSubjectReference !== record.authIdentityId ||
      this.state.reviewerAuthIdentities.has(record.authIdentityId) ||
      this.state.reviewerAuthSubjects.has(authSubjectKey(record.authProvider, record.authSubject)) ||
      this.state.reviewerAuthAccounts.has(record.internalId)) {
      throw new CommunityReviewServiceError("repository_conflict");
    }
    const stored = copy(record);
    this.state.reviewerAuthIdentities.set(record.authIdentityId, stored);
    this.state.reviewerAuthSubjects.set(
      authSubjectKey(record.authProvider, record.authSubject),
      record.authIdentityId,
    );
    this.state.reviewerAuthAccounts.set(record.internalId, record.authIdentityId);
    return copy(stored);
  }

  listReviewerConsentHistory(
    internalId: string,
    policyId: string,
    policyVersion: string,
  ): readonly ReviewerConsentRecord[] {
    const ids = this.state.reviewerConsentHistory.get(consentKey(internalId, policyId, policyVersion)) ?? [];
    return ids.map((consentEventId) => this.state.reviewerConsents.get(consentEventId))
      .filter((record): record is ReviewerConsentRecord => record !== undefined)
      .map(copy);
  }

  getReviewerConsent(consentEventId: string): ReviewerConsentRecord | undefined {
    const record = this.state.reviewerConsents.get(consentEventId);
    return record === undefined ? undefined : copy(record);
  }

  insertReviewerConsent(record: ReviewerConsentRecord): ReviewerConsentRecord {
    assertReviewerConsentRecord(record);
    const account = this.state.reviewerAccounts.get(record.internalId);
    const key = consentKey(record.internalId, record.policyId, record.policyVersion);
    const history = this.state.reviewerConsentHistory.get(key) ?? [];
    const previous = history.length === 0 ? undefined : this.state.reviewerConsents.get(history[history.length - 1]!);
    if (account === undefined || account.reviewerId !== record.reviewerId ||
      this.state.reviewerConsents.has(record.consentEventId) ||
      previous?.state === record.state ||
      record.state === "REVOKED" && previous?.state !== "ACCEPTED") {
      throw new CommunityReviewServiceError("repository_conflict");
    }
    const stored = copy(record);
    this.state.reviewerConsents.set(record.consentEventId, stored);
    this.state.reviewerConsentHistory.set(key, [...history, record.consentEventId]);
    return copy(stored);
  }

  insertAuthAuditEvent(record: AuthAuditEventRecord): AuthAuditEventRecord {
    assertAuthAuditEventRecord(record);
    if (this.state.authAuditEvents.has(record.eventId)) {
      throw new CommunityReviewServiceError("repository_conflict");
    }
    if (record.internalId !== undefined) {
      const account = this.state.reviewerAccounts.get(record.internalId);
      if (account === undefined || record.reviewerId !== undefined && record.reviewerId !== account.reviewerId) {
        throw new CommunityReviewServiceError("repository_conflict");
      }
    } else if (record.reviewerId !== undefined && !this.state.reviewerIds.has(record.reviewerId)) {
      throw new CommunityReviewServiceError("repository_conflict");
    }
    const stored = copy(record);
    this.state.authAuditEvents.set(record.eventId, stored);
    return copy(stored);
  }

  listAuthAuditEvents(internalId?: string): readonly AuthAuditEventRecord[] {
    return [...this.state.authAuditEvents.values()]
      .filter((record) => internalId === undefined || record.internalId === internalId)
      .sort((left, right) => left.eventId.localeCompare(right.eventId))
      .map(copy);
  }

  insertQualificationAuthorityAuditEvent(
    record: QualificationAuthorityAuditEventRecord,
  ): QualificationAuthorityAuditEventRecord {
    assertQualificationAuthorityAuditEventRecord(record);
    if (this.state.qualificationAuditEvents.has(record.eventId)) {
      throw new CommunityReviewServiceError("repository_conflict");
    }
    if (record.reviewerId !== undefined && !this.state.reviewerIds.has(record.reviewerId) ||
      record.attemptId !== undefined && !this.state.qualificationAttempts.has(record.attemptId) ||
      record.poolId !== undefined && record.poolVersion !== undefined &&
        !this.state.qualificationPools.has(poolKey(record.poolId, record.poolVersion))) {
      throw new CommunityReviewServiceError("repository_conflict");
    }
    const stored = copy(record);
    this.state.qualificationAuditEvents.set(record.eventId, stored);
    return copy(stored);
  }

  listQualificationAuthorityAuditEvents(
    poolId?: string,
    poolVersion?: string,
  ): readonly QualificationAuthorityAuditEventRecord[] {
    return [...this.state.qualificationAuditEvents.values()]
      .filter((record) => (poolId === undefined || record.poolId === poolId) &&
        (poolVersion === undefined || record.poolVersion === poolVersion))
      .sort((left, right) => left.occurredAt.localeCompare(right.occurredAt) ||
        left.eventId.localeCompare(right.eventId))
      .map(copy);
  }

  insertReviewDeliveryAuditEvent(
    record: ReviewDeliveryAuditEventRecord,
  ): ReviewDeliveryAuditEventRecord {
    assertReviewDeliveryAuditEventRecord(record);
    if (this.state.reviewDeliveryAuditEvents.has(record.eventId)) {
      throw new CommunityReviewServiceError("repository_conflict");
    }
    if (record.reviewerId !== undefined && !this.state.reviewerIds.has(record.reviewerId) ||
      record.batchId !== undefined && !this.state.batches.has(record.batchId) ||
      record.assignmentId !== undefined && !this.state.assignments.has(record.assignmentId)) {
      throw new CommunityReviewServiceError("repository_conflict");
    }
    const stored = copy(record);
    this.state.reviewDeliveryAuditEvents.set(record.eventId, stored);
    return copy(stored);
  }

  listReviewDeliveryAuditEvents(batchId?: string): readonly ReviewDeliveryAuditEventRecord[] {
    return [...this.state.reviewDeliveryAuditEvents.values()]
      .filter((record) => batchId === undefined || record.batchId === batchId)
      .sort((left, right) => left.occurredAt.localeCompare(right.occurredAt) ||
        left.eventId.localeCompare(right.eventId))
      .map(copy);
  }

  insertReviewSubmissionAuditEvent(
    record: ReviewSubmissionAuditEventRecord,
  ): ReviewSubmissionAuditEventRecord {
    assertReviewSubmissionAuditEventRecord(record);
    const batch = this.state.batches.get(record.batchId);
    const assignment = this.state.assignments.get(record.assignmentId);
    const accepted = this.state.acceptedSubmissions.get(record.assignmentId);
    if (batch === undefined || assignment === undefined || accepted === undefined ||
      assignment.assignment.batchId !== record.batchId ||
      assignment.assignment.reviewerId !== record.reviewerId ||
      accepted.submission.assignmentId !== record.assignmentId ||
      accepted.submission.batchId !== record.batchId ||
      accepted.submission.reviewerId !== record.reviewerId ||
      accepted.submission.submissionFingerprint !== record.submissionFingerprint) {
      throw new CommunityReviewServiceError("repository_conflict");
    }
    if (this.state.reviewSubmissionAuditEvents.has(record.eventId) ||
      [...this.state.reviewSubmissionAuditEvents.values()].some((event) =>
        event.batchId === record.batchId &&
        event.submissionFingerprint === record.submissionFingerprint &&
        event.eventType === record.eventType)) {
      throw new CommunityReviewServiceError("repository_conflict");
    }
    const stored = copy(record);
    this.state.reviewSubmissionAuditEvents.set(record.eventId, stored);
    return copy(stored);
  }

  listReviewSubmissionAuditEvents(batchId?: string): readonly ReviewSubmissionAuditEventRecord[] {
    return [...this.state.reviewSubmissionAuditEvents.values()]
      .filter((record) => batchId === undefined || record.batchId === batchId)
      .sort((left, right) => left.occurredAt.localeCompare(right.occurredAt) ||
        left.eventId.localeCompare(right.eventId))
      .map(copy);
  }

  getQualificationPool(poolId: string, poolVersion: string): QualificationPoolRecord | undefined {
    const record = this.state.qualificationPools.get(poolKey(poolId, poolVersion));
    return record === undefined ? undefined : copy(record);
  }

  insertQualificationPool(record: QualificationPoolRecord): QualificationPoolRecord {
    assertQualificationPoolRecord(record);
    const key = poolKey(record.poolId, record.poolVersion);
    if (this.state.qualificationPools.has(key)) {
      throw new CommunityReviewServiceError("repository_conflict");
    }
    const stored = copy(record);
    this.state.qualificationPools.set(key, stored);
    return copy(stored);
  }

  updateQualificationPool(record: QualificationPoolRecord): QualificationPoolRecord {
    const key = poolKey(record.poolId, record.poolVersion);
    const previous = this.state.qualificationPools.get(key);
    if (previous === undefined) throw new CommunityReviewServiceError("repository_conflict");
    assertQualificationPoolRecord(record);
    const previousStateVersion = previous.stateVersion ?? 0;
    const nextStateVersion = record.stateVersion ?? 0;
    if (record.createdAt !== previous.createdAt || nextStateVersion !== previousStateVersion + 1 ||
      qualificationPoolStateRank(record.state) !== qualificationPoolStateRank(previous.state) + 1 ||
      record.qualificationId !== previous.qualificationId ||
      record.qualificationVersion !== previous.qualificationVersion ||
      record.definitionFingerprint !== previous.definitionFingerprint ||
      record.instrumentFingerprint !== previous.instrumentFingerprint ||
      record.reviewLocale !== previous.reviewLocale ||
      record.sealedDefinitionReference !== previous.sealedDefinitionReference ||
      record.privateAnswerKeyReference !== previous.privateAnswerKeyReference ||
      !same(record.instrument, previous.instrument) ||
      previous.state !== "DRAFT" && !same(record.visibleTaskSetFingerprint, previous.visibleTaskSetFingerprint) ||
      previous.state !== "DRAFT" && !same(record.answerKeyCommitment, previous.answerKeyCommitment) ||
      previous.state !== "DRAFT" && !same(record.passRuleId, previous.passRuleId) ||
      previous.state !== "DRAFT" && record.sealedAt !== previous.sealedAt ||
      previous.state !== "ACTIVE" && record.retiredAt !== previous.retiredAt ||
      previous.state === "OPEN") {
      throw new CommunityReviewServiceError("repository_conflict");
    }
    const stored = copy(record);
    this.state.qualificationPools.set(key, stored);
    return copy(stored);
  }

  getQualificationAttempt(attemptId: string): QualificationAttemptRecord | undefined {
    const record = this.state.qualificationAttempts.get(attemptId);
    return record === undefined ? undefined : copy(record);
  }

  listQualificationAttempts(
    reviewerId: string,
    poolId: string,
    poolVersion: string,
  ): readonly QualificationAttemptRecord[] {
    return [...this.state.qualificationAttempts.values()]
      .filter((record) => record.reviewerId === reviewerId && record.poolId === poolId &&
        record.poolVersion === poolVersion)
      .sort((left, right) => left.attemptId.localeCompare(right.attemptId))
      .map(copy);
  }

  insertQualificationAttempt(record: QualificationAttemptRecord): QualificationAttemptRecord {
    assertQualificationAttemptRecord(record);
    if (this.state.qualificationAttempts.has(record.attemptId) ||
      this.state.attemptNonces.has(attemptNonceKey(record))) {
      throw new CommunityReviewServiceError("repository_conflict");
    }
    const pool = this.state.qualificationPools.get(poolKey(record.poolId, record.poolVersion));
    if (!this.state.reviewerIds.has(record.reviewerId) || pool === undefined ||
      pool.state !== "OPEN" && ["QUALIFIED", "NOT_QUALIFIED", "REJECTED"].includes(record.state)) {
      throw new CommunityReviewServiceError("repository_conflict");
    }
    const stored = copy(record);
    this.state.qualificationAttempts.set(record.attemptId, stored);
    this.state.attemptNonces.set(attemptNonceKey(record), record.attemptId);
    return copy(stored);
  }

  updateQualificationAttempt(record: QualificationAttemptRecord): QualificationAttemptRecord {
    const previous = this.state.qualificationAttempts.get(record.attemptId);
    if (previous === undefined || attemptNonceKey(previous) !== attemptNonceKey(record)) {
      throw new CommunityReviewServiceError("repository_conflict");
    }
    assertQualificationAttemptRecord(record);
    const validTransition = previous.state === "CREATED" && record.state === "ISSUED" ||
      previous.state === "ISSUED" && record.state === "SUBMITTED" ||
      previous.state === "SUBMITTED" && (record.state === "QUALIFIED" || record.state === "NOT_QUALIFIED") ||
      previous.state === "STARTED" && (record.state === "QUALIFIED" || record.state === "REJECTED");
    if (!validTransition || record.reviewerId !== previous.reviewerId ||
      record.poolId !== previous.poolId || record.poolVersion !== previous.poolVersion ||
      record.startedAt !== previous.startedAt ||
      previous.issuedAt !== undefined && record.issuedAt !== previous.issuedAt ||
      previous.qualificationDefinitionFingerprint !== undefined &&
        record.qualificationDefinitionFingerprint !== previous.qualificationDefinitionFingerprint ||
      previous.instrumentFingerprint !== undefined && record.instrumentFingerprint !== previous.instrumentFingerprint ||
      previous.reviewLocale !== undefined && record.reviewLocale !== previous.reviewLocale ||
      previous.packetFingerprint !== undefined && record.packetFingerprint !== previous.packetFingerprint) {
      throw new CommunityReviewServiceError("invalid_service_record");
    }
    const stored = copy(record);
    this.state.qualificationAttempts.set(record.attemptId, stored);
    return copy(stored);
  }

  getQualificationReceipt(receiptFingerprint: string): QualificationReceiptRecord | undefined {
    const record = this.state.qualificationReceipts.get(receiptFingerprint);
    return record === undefined ? undefined : copy(record);
  }

  getQualificationReceiptByAttempt(attemptId: string): QualificationReceiptRecord | undefined {
    const receiptFingerprint = this.state.receiptAttempts.get(attemptId);
    return receiptFingerprint === undefined ? undefined : this.getQualificationReceipt(receiptFingerprint);
  }

  listQualificationReceipts(reviewerId: string): readonly QualificationReceiptRecord[] {
    return [...this.state.qualificationReceipts.values()]
      .filter((record) => record.reviewerId === reviewerId)
      .sort((left, right) => left.receiptFingerprint.localeCompare(right.receiptFingerprint))
      .map(copy);
  }

  insertQualificationReceipt(record: QualificationReceiptRecord): QualificationReceiptRecord {
    assertQualificationReceiptRecord(record);
    const attempt = this.state.qualificationAttempts.get(record.attemptId);
    const pool = this.state.qualificationPools.get(poolKey(record.poolId, record.poolVersion));
    if (attempt === undefined || pool === undefined || attempt.state !== "QUALIFIED" ||
      attempt.result !== "qualified" || attempt.reviewerId !== record.reviewerId ||
      attempt.poolId !== record.poolId || attempt.poolVersion !== record.poolVersion ||
      record.receipt.dataKind !== pool.dataKind ||
      !same(record.receipt.fixture, pool.fixture) ||
      record.receipt.qualificationId !== pool.qualificationId ||
      record.receipt.qualificationVersion !== pool.qualificationVersion ||
      record.receipt.qualificationDefinitionFingerprint !== pool.definitionFingerprint ||
      record.receipt.instrumentEligibility.instrumentFingerprint !== pool.instrumentFingerprint ||
      record.receipt.reviewLocale !== pool.reviewLocale) {
      throw new CommunityReviewServiceError("qualification_receipt_not_authoritative");
    }
    if (this.state.qualificationReceipts.has(record.receiptFingerprint) ||
      this.state.receiptAttempts.has(record.attemptId)) {
      throw new CommunityReviewServiceError("repository_conflict");
    }
    const stored = copy(record);
    this.state.qualificationReceipts.set(record.receiptFingerprint, stored);
    this.state.receiptAttempts.set(record.attemptId, record.receiptFingerprint);
    return copy(stored);
  }

  getBatch(batchId: string): ReviewBatchRecord | undefined {
    const record = this.state.batches.get(batchId);
    return record === undefined ? undefined : copy(record);
  }

  listBatches(): readonly ReviewBatchRecord[] {
    return [...this.state.batches.values()]
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt) ||
        left.batchId.localeCompare(right.batchId))
      .map(copy);
  }

  insertBatch(record: ReviewBatchRecord): ReviewBatchRecord {
    assertBatchRecord(record);
    if (this.state.batches.has(record.batchId) || this.state.batchFingerprints.has(record.batchFingerprint)) {
      throw new CommunityReviewServiceError("repository_conflict");
    }
    const stored = copy(record);
    this.state.batches.set(record.batchId, stored);
    this.state.batchFingerprints.set(record.batchFingerprint, record.batchId);
    return copy(stored);
  }

  updateBatch(record: ReviewBatchRecord): ReviewBatchRecord {
    const previous = this.state.batches.get(record.batchId);
    if (previous === undefined || record.batchFingerprint !== previous.batchFingerprint ||
      record.sealedSourceReference !== previous.sealedSourceReference ||
      record.stateVersion !== previous.stateVersion + 1 ||
      stateRank(record.state) !== stateRank(previous.state) + 1) {
      throw new CommunityReviewServiceError("repository_conflict");
    }
    assertBatchRecord(record);
    if (record.state === "CLOSED") {
      const close = this.state.batchCloseRecords.get(record.batchId);
      if (close === undefined || !same(record.manifest, close.manifest)) {
        throw new CommunityReviewServiceError("repository_conflict");
      }
    }
    if (record.state === "FROZEN") {
      const frozen = this.state.frozenReviewPools.get(record.batchId);
      const close = this.state.batchCloseRecords.get(record.batchId);
      if (frozen === undefined || close === undefined || record.manifest.closeRecordFingerprint !==
        close.closeRecord.closeFingerprint || record.manifest.freezeFingerprint !== frozen.frozenPool.freezeFingerprint) {
        throw new CommunityReviewServiceError("repository_conflict");
      }
    }
    const stored = copy(record);
    this.state.batches.set(record.batchId, stored);
    return copy(stored);
  }

  getSealedBatchPayloadReference(batchId: string): SealedBatchPayloadReferenceRecord | undefined {
    const record = this.state.sealedBatchPayloadReferences.get(batchId);
    return record === undefined ? undefined : copy(record);
  }

  insertSealedBatchPayloadReference(
    record: SealedBatchPayloadReferenceRecord,
  ): SealedBatchPayloadReferenceRecord {
    const batch = this.state.batches.get(record.batchId);
    if (batch === undefined || record.sourceReference !== batch.sealedSourceReference ||
      record.visibleTaskSetFingerprint !== batch.manifest.visibleTaskSetFingerprint) {
      throw new CommunityReviewServiceError("repository_conflict");
    }
    requiredString(record.sourceReference);
    fingerprint(record.visibleTaskSetFingerprint);
    if (this.state.sealedBatchPayloadReferences.has(record.batchId)) {
      throw new CommunityReviewServiceError("repository_conflict");
    }
    const stored = copy(record);
    this.state.sealedBatchPayloadReferences.set(record.batchId, stored);
    return copy(stored);
  }

  getAssignment(assignmentId: string): ReviewAssignmentRecord | undefined {
    const record = this.state.assignments.get(assignmentId);
    return record === undefined ? undefined : copy(record);
  }

  getAssignmentByBatchReviewer(batchId: string, reviewerId: string): ReviewAssignmentRecord | undefined {
    const assignmentId = this.state.assignmentBatchReviewers.get(batchReviewerKey(batchId, reviewerId));
    return assignmentId === undefined ? undefined : this.getAssignment(assignmentId);
  }

  listAssignments(batchId: string): readonly ReviewAssignmentRecord[] {
    return [...this.state.assignments.values()]
      .filter((record) => record.assignment.batchId === batchId)
      .sort((left, right) => left.assignment.assignmentId.localeCompare(right.assignment.assignmentId))
      .map(copy);
  }

  insertAssignment(record: ReviewAssignmentRecord): ReviewAssignmentRecord {
    assertAssignmentRecord(record);
    const assignment = record.assignment;
    if (assignment.assignmentState !== "assigned") {
      throw new CommunityReviewServiceError("invalid_service_record");
    }
    const batch = this.state.batches.get(assignment.batchId);
    if (batch === undefined || batch.state !== "OPEN" ||
      assignment.batchFingerprint !== batch.batchFingerprint ||
      !this.state.reviewerIds.has(assignment.reviewerId) ||
      !this.state.qualificationReceipts.has(assignment.qualificationReceiptFingerprint) ||
      this.state.qualificationReceipts.get(assignment.qualificationReceiptFingerprint)?.reviewerId !== assignment.reviewerId ||
      this.state.qualificationReceipts.get(assignment.qualificationReceiptFingerprint)?.authorityState !== "authoritative") {
      throw new CommunityReviewServiceError("repository_conflict");
    }
    const uniqueKey = batchReviewerKey(assignment.batchId, assignment.reviewerId);
    if (this.state.assignments.has(assignment.assignmentId) ||
      this.state.assignmentBatchReviewers.has(uniqueKey)) {
      throw new CommunityReviewServiceError("repository_conflict");
    }
    const stored = copy(record);
    this.state.assignments.set(assignment.assignmentId, stored);
    this.state.assignmentBatchReviewers.set(uniqueKey, assignment.assignmentId);
    return copy(stored);
  }

  updateAssignment(record: ReviewAssignmentRecord): ReviewAssignmentRecord {
    assertAssignmentRecord(record);
    const previous = this.state.assignments.get(record.assignment.assignmentId);
    const batch = this.state.batches.get(record.assignment.batchId);
    if (previous === undefined || previous.assignment.batchId !== record.assignment.batchId ||
      previous.assignment.reviewerId !== record.assignment.reviewerId ||
      !same(previous.packet, record.packet) ||
      previous.assignment.assignmentState !== "assigned" ||
      record.assignment.assignmentState !== "withdrawn" || batch?.state !== "OPEN") {
      throw new CommunityReviewServiceError("repository_conflict");
    }
    if (this.state.acceptedSubmissions.has(record.assignment.assignmentId)) {
      throw new CommunityReviewServiceError("repository_conflict");
    }
    const stored = copy(record);
    this.state.assignments.set(record.assignment.assignmentId, stored);
    return copy(stored);
  }

  getAcceptedSubmissionByAssignment(assignmentId: string): AcceptedSubmissionRecord | undefined {
    const record = this.state.acceptedSubmissions.get(assignmentId);
    return record === undefined ? undefined : copy(record);
  }

  getAcceptedSubmissionByBatchReviewer(batchId: string, reviewerId: string): AcceptedSubmissionRecord | undefined {
    const assignmentId = this.state.submissionBatchReviewers.get(batchReviewerKey(batchId, reviewerId));
    return assignmentId === undefined ? undefined : this.getAcceptedSubmissionByAssignment(assignmentId);
  }

  listAcceptedSubmissions(batchId: string): readonly AcceptedSubmissionRecord[] {
    return [...this.state.acceptedSubmissions.values()]
      .filter((record) => record.submission.batchId === batchId)
      .sort((left, right) => left.submission.submissionFingerprint.localeCompare(right.submission.submissionFingerprint))
      .map(copy);
  }

  insertAcceptedSubmission(record: AcceptedSubmissionRecord): AcceptedSubmissionRecord {
    assertSubmissionRecord(record);
    const submission = record.submission;
    const assignment = this.state.assignments.get(submission.assignmentId);
    const batch = this.state.batches.get(submission.batchId);
    const parsedAssignment = assignment === undefined ? undefined : parseCommunityReviewAssignment(assignment.assignment);
    const parsedPacket = assignment === undefined ? undefined : parseCommunityReviewReviewerPacket(assignment.packet);
    if (assignment === undefined || batch === undefined || batch.state !== "OPEN" ||
      parsedAssignment === undefined || parsedPacket === undefined ||
      parsedAssignment.assignmentState !== "assigned" ||
      parsedAssignment.batchId !== batch.batchId ||
      parsedAssignment.batchFingerprint !== batch.batchFingerprint ||
      parsedAssignment.protocolId !== batch.manifest.protocolId ||
      parsedAssignment.protocolVersion !== batch.manifest.protocolVersion ||
      parsedAssignment.dataKind !== batch.manifest.dataKind ||
      !same(parsedAssignment.fixture, batch.manifest.fixture) ||
      !same(parsedAssignment.instrument, batch.manifest.instrument) ||
      parsedAssignment.visibleTaskSetFingerprint !== batch.manifest.visibleTaskSetFingerprint ||
      parsedPacket.dataKind !== parsedAssignment.dataKind ||
      !same(parsedPacket.fixture, parsedAssignment.fixture) ||
      parsedPacket.protocolId !== parsedAssignment.protocolId ||
      parsedPacket.protocolVersion !== parsedAssignment.protocolVersion ||
      parsedPacket.assignmentId !== parsedAssignment.assignmentId ||
      submission.reviewerId !== assignment.assignment.reviewerId ||
      submission.batchFingerprint !== batch.batchFingerprint ||
      !this.state.qualificationReceipts.has(submission.qualificationReceiptFingerprint) ||
      this.state.qualificationReceipts.get(submission.qualificationReceiptFingerprint)?.reviewerId !== submission.reviewerId ||
      this.state.qualificationReceipts.get(submission.qualificationReceiptFingerprint)?.authorityState !== "authoritative") {
      throw new CommunityReviewServiceError("repository_conflict");
    }
    const checked = assertCommunityReviewSubmissionMatchesAssignment(
      assignment.assignment,
      submission,
      assignment.packet.packetFingerprint,
    ).submission;
    if (!same(checked, submission)) throw new CommunityReviewServiceError("invalid_service_record");
    if (this.state.acceptedSubmissions.has(submission.assignmentId) ||
      this.state.submissionBatchReviewers.has(batchReviewerKey(submission.batchId, submission.reviewerId)) ||
      this.state.submissionFingerprints.has(submission.submissionFingerprint)) {
      throw new CommunityReviewServiceError("repository_conflict");
    }
    const stored = copy(record);
    this.state.acceptedSubmissions.set(submission.assignmentId, stored);
    this.state.submissionFingerprints.set(submission.submissionFingerprint, submission.assignmentId);
    this.state.submissionBatchReviewers.set(
      batchReviewerKey(submission.batchId, submission.reviewerId),
      submission.assignmentId,
    );
    return copy(stored);
  }

  insertRejectedSubmissionAttempt(
    record: RejectedSubmissionAttemptRecord,
  ): RejectedSubmissionAttemptRecord {
    requiredString(record.rejectionId);
    if (!/^[A-Za-z0-9._:-]{1,80}$/u.test(record.reason)) {
      throw new CommunityReviewServiceError("invalid_service_record");
    }
    if (record.batchId !== undefined) requiredString(record.batchId);
    if (record.assignmentId !== undefined) requiredString(record.assignmentId);
    if (record.reviewerId !== undefined) opaqueId(record.reviewerId);
    if (record.payloadFingerprint !== undefined) fingerprint(record.payloadFingerprint);
    timestamp(record.attemptedAt);
    if (this.state.rejectedSubmissionAttempts.has(record.rejectionId)) {
      throw new CommunityReviewServiceError("repository_conflict");
    }
    const stored = copy(record);
    this.state.rejectedSubmissionAttempts.set(record.rejectionId, stored);
    return copy(stored);
  }

  listRejectedSubmissionAttempts(batchId: string): readonly RejectedSubmissionAttemptRecord[] {
    return [...this.state.rejectedSubmissionAttempts.values()]
      .filter((record) => record.batchId === batchId)
      .sort((left, right) => left.rejectionId.localeCompare(right.rejectionId))
      .map(copy);
  }

  getBatchCloseRecord(batchId: string): ReviewBatchCloseRecord | undefined {
    const record = this.state.batchCloseRecords.get(batchId);
    return record === undefined ? undefined : copy(record);
  }

  insertBatchCloseRecord(record: ReviewBatchCloseRecord): ReviewBatchCloseRecord {
    const batch = this.state.batches.get(record.batchId);
    assertBatchCloseRecord(record);
    const closeRecord = parseCommunityReviewBatchCloseRecord(record.closeRecord);
    if (batch === undefined || batch.state !== "OPEN" || closeRecord.batchId !== record.batchId ||
      closeRecord.batchFingerprint !== batch.batchFingerprint ||
      record.manifest.batchFingerprint !== batch.batchFingerprint) {
      throw new CommunityReviewServiceError("repository_conflict");
    }
    const persistedSubmissions = this.listAcceptedSubmissions(record.batchId)
      .map((item) => item.submission);
    if (!same(
      sortedSubmissions(record.acceptedSubmissions),
      sortedSubmissions(persistedSubmissions),
    )) {
      throw new CommunityReviewServiceError("repository_conflict");
    }
    if (this.state.batchCloseRecords.has(record.batchId) ||
      this.state.closeFingerprints.has(closeRecord.closeFingerprint)) {
      throw new CommunityReviewServiceError("repository_conflict");
    }
    const stored = copy(record);
    this.state.batchCloseRecords.set(record.batchId, stored);
    this.state.closeFingerprints.set(closeRecord.closeFingerprint, record.batchId);
    return copy(stored);
  }

  getFrozenReviewPool(batchId: string): FrozenReviewPoolRecord | undefined {
    const record = this.state.frozenReviewPools.get(batchId);
    return record === undefined ? undefined : copy(record);
  }

  insertFrozenReviewPool(record: FrozenReviewPoolRecord): FrozenReviewPoolRecord {
    const batch = this.state.batches.get(record.batchId);
    const pool = parseFrozenCommunityReviewPool(record.frozenPool);
    const close = this.state.batchCloseRecords.get(record.batchId);
    if (batch === undefined || batch.state !== "CLOSED" || close === undefined ||
      pool.batchId !== record.batchId || pool.closeRecordFingerprint !== close.closeRecord.closeFingerprint ||
      pool.batchFingerprint !== batch.batchFingerprint) {
      throw new CommunityReviewServiceError("repository_conflict");
    }
    if (!same(
      sortedSubmissions(pool.submissions),
      sortedSubmissions(close.acceptedSubmissions),
    )) {
      throw new CommunityReviewServiceError("repository_conflict");
    }
    if (this.state.frozenReviewPools.has(record.batchId) ||
      this.state.freezeFingerprints.has(pool.freezeFingerprint)) {
      throw new CommunityReviewServiceError("repository_conflict");
    }
    const stored = copy(record);
    this.state.frozenReviewPools.set(record.batchId, stored);
    this.state.freezeFingerprints.set(pool.freezeFingerprint, record.batchId);
    return copy(stored);
  }

  getCommunityReviewAgreementEvidence(
    batchId: string,
  ): CommunityReviewAgreementEvidenceRecord | undefined {
    const record = this.state.agreementEvidence.get(batchId);
    return record === undefined ? undefined : copy(record);
  }

  insertCommunityReviewAgreementEvidence(
    record: CommunityReviewAgreementEvidenceRecord,
  ): CommunityReviewAgreementEvidenceRecord {
    assertAgreementEvidenceRecord(record);
    const batch = this.state.batches.get(record.batchId);
    const frozen = this.state.frozenReviewPools.get(record.batchId);
    if (batch === undefined || batch.state !== "FROZEN" || frozen === undefined ||
      frozen.frozenPool.freezeFingerprint !== record.freezeFingerprint) {
      throw new CommunityReviewServiceError("repository_conflict");
    }
    const expected = buildCommunityReviewAgreementEvidence(frozen.frozenPool);
    if (!same(expected, record.evidence) ||
      communityReviewAgreementEvidencePersistenceFingerprint({
        batchId: record.batchId,
        freezeFingerprint: record.freezeFingerprint,
        evidence: record.evidence,
      }) !== record.evidencePersistenceFingerprint) {
      throw new CommunityReviewServiceError("repository_conflict");
    }
    if (this.state.agreementEvidence.has(record.batchId) ||
      this.state.agreementEvidenceFingerprints.has(record.evidencePersistenceFingerprint)) {
      throw new CommunityReviewServiceError("repository_conflict");
    }
    const stored = copy(record);
    this.state.agreementEvidence.set(record.batchId, stored);
    this.state.agreementEvidenceFingerprints.set(record.evidencePersistenceFingerprint, record.batchId);
    return copy(stored);
  }

  getCommunityReviewDisclosure(disclosureId: string): CommunityReviewDisclosureRecord | undefined {
    const record = this.state.disclosures.get(disclosureId);
    return record === undefined ? undefined : copy(record);
  }

  listCommunityReviewDisclosures(batchId: string): readonly CommunityReviewDisclosureRecord[] {
    return [...this.state.disclosures.values()]
      .filter((record) => record.batchId === batchId)
      .sort((left, right) => left.disclosureVersion - right.disclosureVersion ||
        left.disclosureId.localeCompare(right.disclosureId))
      .map(copy);
  }

  insertCommunityReviewDisclosure(
    record: CommunityReviewDisclosureRecord,
  ): CommunityReviewDisclosureRecord {
    assertDisclosureRecord(record);
    const batch = this.state.batches.get(record.batchId);
    const frozen = this.state.frozenReviewPools.get(record.batchId);
    const agreement = this.state.agreementEvidence.get(record.batchId);
    if (batch === undefined || batch.state !== "FROZEN" || frozen === undefined ||
      frozen.frozenPool.freezeFingerprint !== record.freezeFingerprint || agreement === undefined ||
      agreement.evidencePersistenceFingerprint !== record.agreementEvidencePersistenceFingerprint) {
      throw new CommunityReviewServiceError("repository_conflict");
    }
    if (record.mode === "PUBLIC" && record.publicArtifact !== undefined &&
      (record.publicArtifact.batchFingerprint !== batch.batchFingerprint ||
        record.publicArtifact.visibleTaskSetFingerprint !== batch.manifest.visibleTaskSetFingerprint ||
        !same(record.publicArtifact.acceptedSubmissionFingerprints,
          frozen.frozenPool.acceptedSubmissionFingerprints))) {
      throw new CommunityReviewServiceError("repository_conflict");
    }
    if (record.mode === "PUBLIC") {
      try {
        const expectedArtifact = buildCommunityReviewPublicEvidenceArtifact(frozen.frozenPool, {
          disclosureDate: record.disclosureDate!,
          disclosurePolicy: record.disclosurePolicy,
        });
        if (!same(expectedArtifact, record.publicArtifact)) {
          throw new CommunityReviewServiceError("repository_conflict");
        }
      } catch (error) {
        if (error instanceof CommunityReviewServiceError) throw error;
        throw new CommunityReviewServiceError("repository_conflict");
      }
    }
    const duplicateIdentity = [...this.state.disclosures.values()].some((existing) =>
      existing.batchId === record.batchId && existing.freezeFingerprint === record.freezeFingerprint &&
      existing.mode === record.mode && same(existing.disclosurePolicy, record.disclosurePolicy) &&
      existing.disclosureDate === record.disclosureDate);
    if (this.state.disclosures.has(record.disclosureId) || duplicateIdentity ||
      [...this.state.disclosures.values()].some((existing) =>
        existing.batchId === record.batchId && existing.disclosureVersion === record.disclosureVersion)) {
      throw new CommunityReviewServiceError("repository_conflict");
    }
    const stored = copy(record);
    this.state.disclosures.set(record.disclosureId, stored);
    return copy(stored);
  }

  insertCommunityReviewEvidenceAuditEvent(
    record: CommunityReviewEvidenceAuditEventRecord,
  ): CommunityReviewEvidenceAuditEventRecord {
    assertEvidenceAuditEventRecord(record);
    const batch = this.state.batches.get(record.batchId);
    if (batch === undefined || this.state.evidenceAuditEvents.has(record.eventId)) {
      throw new CommunityReviewServiceError("repository_conflict");
    }
    if (record.freezeFingerprint !== undefined) {
      const frozen = this.state.frozenReviewPools.get(record.batchId);
      if (frozen === undefined || frozen.frozenPool.freezeFingerprint !== record.freezeFingerprint) {
        throw new CommunityReviewServiceError("repository_conflict");
      }
    }
    if (record.agreementEvidencePersistenceFingerprint !== undefined) {
      const agreement = this.state.agreementEvidence.get(record.batchId);
      if (agreement === undefined || agreement.evidencePersistenceFingerprint !==
        record.agreementEvidencePersistenceFingerprint) {
        throw new CommunityReviewServiceError("repository_conflict");
      }
    }
    if (record.disclosureId !== undefined) {
      const disclosure = this.state.disclosures.get(record.disclosureId);
      if (disclosure === undefined || disclosure.batchId !== record.batchId ||
        record.disclosureVersion !== disclosure.disclosureVersion ||
        record.disclosureMode !== disclosure.mode) {
        throw new CommunityReviewServiceError("repository_conflict");
      }
    }
    if ((record.eventType === "batch_frozen" && batch.state !== "FROZEN") ||
      (record.eventType === "freeze_retrieved" && batch.state !== "FROZEN") ||
      (record.eventType === "agreement_evidence_generated" &&
        record.agreementEvidencePersistenceFingerprint === undefined) ||
      (record.eventType === "agreement_evidence_retrieved" &&
        record.agreementEvidencePersistenceFingerprint === undefined) ||
      (record.eventType === "disclosure_created" && record.disclosureId === undefined) ||
      (record.eventType === "public_artifact_generated" &&
        (record.disclosureId === undefined || record.disclosureMode !== "PUBLIC")) ||
      (record.eventType === "disclosure_rejected" && record.reasonCode === undefined)) {
      throw new CommunityReviewServiceError("repository_conflict");
    }
    const stored = copy(record);
    this.state.evidenceAuditEvents.set(record.eventId, stored);
    return copy(stored);
  }

  listCommunityReviewEvidenceAuditEvents(
    batchId?: string,
  ): readonly CommunityReviewEvidenceAuditEventRecord[] {
    return [...this.state.evidenceAuditEvents.values()]
      .filter((record) => batchId === undefined || record.batchId === batchId)
      .sort((left, right) => left.occurredAt.localeCompare(right.occurredAt) ||
        left.eventId.localeCompare(right.eventId))
      .map(copy);
  }
}

/**
 * Deterministic local adapter for P4 service tests. A real PostgreSQL adapter must
 * use row locks and the same uniqueness constraints from the migration.
 */
export class InMemoryCommunityReviewRepository implements CommunityReviewPersistence {
  private state: DatabaseState;
  private transactionTail = Promise.resolve();

  constructor(snapshot: CommunityReviewPersistenceSnapshot = emptyCommunityReviewPersistenceSnapshot()) {
    this.state = stateFromSnapshot(snapshot);
  }

  snapshot(): CommunityReviewPersistenceSnapshot {
    return {
      reviewerAccounts: [...this.state.reviewerAccounts.values()].map(copy),
      reviewerAuthIdentities: [...this.state.reviewerAuthIdentities.values()].map(copy),
      reviewerConsents: [...this.state.reviewerConsents.values()].map(copy),
      authAuditEvents: [...this.state.authAuditEvents.values()].map(copy),
      qualificationAuditEvents: [...this.state.qualificationAuditEvents.values()].map(copy),
      reviewDeliveryAuditEvents: [...this.state.reviewDeliveryAuditEvents.values()].map(copy),
      reviewSubmissionAuditEvents: [...this.state.reviewSubmissionAuditEvents.values()].map(copy),
      qualificationPools: [...this.state.qualificationPools.values()].map(copy),
      qualificationAttempts: [...this.state.qualificationAttempts.values()].map(copy),
      qualificationReceipts: [...this.state.qualificationReceipts.values()].map(copy),
      batches: [...this.state.batches.values()].map(copy),
      sealedBatchPayloadReferences: [...this.state.sealedBatchPayloadReferences.values()].map(copy),
      assignments: [...this.state.assignments.values()].map(copy),
      acceptedSubmissions: [...this.state.acceptedSubmissions.values()].map(copy),
      rejectedSubmissionAttempts: [...this.state.rejectedSubmissionAttempts.values()].map(copy),
      batchCloseRecords: [...this.state.batchCloseRecords.values()].map(copy),
      frozenReviewPools: [...this.state.frozenReviewPools.values()].map(copy),
      agreementEvidence: [...this.state.agreementEvidence.values()].map(copy),
      disclosures: [...this.state.disclosures.values()].map(copy),
      evidenceAuditEvents: [...this.state.evidenceAuditEvents.values()].map(copy),
    };
  }

  async transaction<T>(
    callback: (transaction: CommunityReviewPersistenceTransaction) => Promise<T> | T,
  ): Promise<T> {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const previous = this.transactionTail;
    this.transactionTail = previous.then(() => gate);
    await previous;
    try {
      const draft = copy(this.state);
      const result = await callback(new InMemoryCommunityReviewTransaction(draft));
      this.state = draft;
      return copy(result);
    } finally {
      release();
    }
  }
}
