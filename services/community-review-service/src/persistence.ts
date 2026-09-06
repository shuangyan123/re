import type {
  CommunityReviewAssignment,
  CommunityReviewAgreementEvidence,
  CommunityReviewBatchCloseRecord,
  CommunityReviewBatchManifest,
  CommunityReviewDataKind,
  CommunityReviewDisclosurePolicy,
  CommunityReviewFingerprint,
  CommunityReviewInstrumentIdentity,
  CommunityReviewPublicEvidenceArtifact,
  CommunityReviewReviewerPacket,
  CommunityReviewQualificationReceipt,
  CommunityReviewSubmission,
  CommunityReviewSyntheticFixtureMarker,
  FrozenCommunityReviewPool,
} from "../../../src/contracts/community-review.js";
import { communityReviewFingerprint } from "../../../src/community-review/fingerprint.js";
import type {
  QualificationPassRuleId,
  QualificationStoredResponse,
} from "./qualification.js";

export type ServiceTimestamp = string;

export type ReviewerAccountStatus = "ACTIVE" | "WITHDRAWN" | "DISABLED";
export type ReviewerConsentState = "NOT_CONSENTED" | "CONSENTED" | "REVOKED";

export interface ReviewerAccountRecord {
  readonly internalId: string;
  /** Opaque P3 reviewer ID; no contact or OAuth identity is stored here. */
  readonly reviewerId: string;
  /** Private auth mapping reference, never a P3 artifact field. */
  readonly privateAuthSubjectReference: string;
  readonly status: ReviewerAccountStatus;
  readonly consentVersion: string;
  readonly consentState: ReviewerConsentState;
  readonly createdAt: ServiceTimestamp;
  readonly updatedAt: ServiceTimestamp;
}

/** Private external identity mapping. These fields never enter a P3 object. */
export interface ReviewerAuthIdentityRecord {
  readonly authIdentityId: string;
  readonly internalId: string;
  readonly reviewerId: string;
  readonly authProvider: string;
  readonly authSubject: string;
  readonly createdAt: ServiceTimestamp;
}

export type ReviewerConsentEventState = "ACCEPTED" | "REVOKED";

/** Append-only consent event; the current snapshot is derived from its history. */
export interface ReviewerConsentRecord {
  readonly consentEventId: string;
  readonly internalId: string;
  readonly reviewerId: string;
  readonly policyId: string;
  readonly policyVersion: string;
  readonly state: ReviewerConsentEventState;
  readonly acceptedAt?: ServiceTimestamp;
  readonly revokedAt?: ServiceTimestamp;
  readonly recordedAt: ServiceTimestamp;
}

export type AuthAuditEventType =
  | "account_created"
  | "consent_accepted"
  | "consent_revoked"
  | "account_withdrawn"
  | "account_disabled"
  | "authentication_mapping_created"
  | "authentication_mapping_rejected";

/** Security audit metadata only; no subject, token, cookie, JWT, or claims blob. */
export interface AuthAuditEventRecord {
  readonly eventId: string;
  readonly eventType: AuthAuditEventType;
  readonly internalId?: string;
  readonly reviewerId?: string;
  readonly authProvider?: string;
  readonly reasonCode?: string;
  readonly occurredAt: ServiceTimestamp;
}

export type QualificationAuthorityAuditEventType =
  | "pool_registered"
  | "pool_sealed"
  | "pool_activated"
  | "pool_retired"
  | "attempt_issued"
  | "response_submitted"
  | "qualification_passed"
  | "qualification_failed"
  | "receipt_issued";

/** Narrow qualification audit metadata; it never contains answers or responses. */
export interface QualificationAuthorityAuditEventRecord {
  readonly eventId: string;
  readonly eventType: QualificationAuthorityAuditEventType;
  readonly reviewerId?: string;
  readonly attemptId?: string;
  readonly poolId?: string;
  readonly poolVersion?: string;
  readonly reasonCode?: string;
  readonly occurredAt: ServiceTimestamp;
}

export type ReviewDeliveryAuditEventType =
  | "assignment_issued"
  | "assignment_retrieved"
  | "assignment_withdrawn"
  | "assignment_issuance_rejected"
  | "batch_material_mismatch"
  | "eligibility_rejected";

/** Narrow delivery metadata; packet/source contents never enter this record. */
export interface ReviewDeliveryAuditEventRecord {
  readonly eventId: string;
  readonly eventType: ReviewDeliveryAuditEventType;
  readonly batchId?: string;
  readonly assignmentId?: string;
  readonly reviewerId?: string;
  readonly reasonCode?: string;
  readonly occurredAt: ServiceTimestamp;
}

export type ReviewSubmissionAuditEventType = "submission_accepted";

/** Narrow accepted-submission audit metadata; submission contents stay in the submission row. */
export interface ReviewSubmissionAuditEventRecord {
  readonly eventId: string;
  readonly eventType: ReviewSubmissionAuditEventType;
  readonly batchId: string;
  readonly assignmentId: string;
  readonly reviewerId: string;
  readonly submissionFingerprint: CommunityReviewFingerprint;
  readonly occurredAt: ServiceTimestamp;
}

/** OPEN is retained only for P4-A synthetic rows; P4-C uses ACTIVE. */
export type QualificationPoolState = "DRAFT" | "SEALED" | "ACTIVE" | "RETIRED" | "OPEN";

export interface QualificationPoolRecord {
  readonly dataKind: CommunityReviewDataKind;
  readonly fixture?: CommunityReviewSyntheticFixtureMarker;
  readonly qualificationId: string;
  readonly qualificationVersion: string;
  readonly poolId: string;
  readonly poolVersion: string;
  readonly definitionFingerprint: CommunityReviewFingerprint;
  readonly instrumentFingerprint: CommunityReviewFingerprint;
  readonly reviewLocale: string;
  /** Full P3 instrument identity is required for service-issued receipts. */
  readonly instrument?: CommunityReviewInstrumentIdentity;
  readonly state: QualificationPoolState;
  readonly visibleTaskSetFingerprint?: CommunityReviewFingerprint;
  /** Private answer-key commitment; never returned in reviewer packets. */
  readonly answerKeyCommitment?: CommunityReviewFingerprint;
  readonly passRuleId?: QualificationPassRuleId;
  readonly stateVersion?: number;
  readonly sealedAt?: ServiceTimestamp;
  readonly retiredAt?: ServiceTimestamp;
  /** Opaque references; the definition and answer key are not repository assets. */
  readonly sealedDefinitionReference: string;
  readonly privateAnswerKeyReference: string;
  readonly createdAt: ServiceTimestamp;
  readonly updatedAt: ServiceTimestamp;
}

export type QualificationAttemptState =
  | "CREATED"
  | "ISSUED"
  | "SUBMITTED"
  | "QUALIFIED"
  | "NOT_QUALIFIED"
  | "EXPIRED";
/** Legacy state names are accepted only for historical P4-A test records. */
export type LegacyQualificationAttemptState = "STARTED" | "REJECTED";
export type StoredQualificationAttemptState = QualificationAttemptState | LegacyQualificationAttemptState;
export type QualificationAttemptResult = "qualified" | "not-qualified";

export interface QualificationAttemptRecord {
  readonly attemptId: string;
  readonly reviewerId: string;
  readonly poolId: string;
  readonly poolVersion: string;
  /** A replay-resistant nonce hash; the raw nonce is outside this boundary. */
  readonly nonceHash: string;
  readonly state: StoredQualificationAttemptState;
  readonly result?: QualificationAttemptResult;
  readonly startedAt: ServiceTimestamp;
  readonly issuedAt?: ServiceTimestamp;
  readonly submittedAt?: ServiceTimestamp;
  readonly evaluatedAt?: ServiceTimestamp;
  readonly qualificationDefinitionFingerprint?: CommunityReviewFingerprint;
  readonly instrumentFingerprint?: CommunityReviewFingerprint;
  readonly reviewLocale?: string;
  readonly packetFingerprint?: CommunityReviewFingerprint;
  /** Sanitized structured statuses only; no evidence or hidden reasoning. */
  readonly responses?: readonly QualificationStoredResponse[];
  readonly responseFingerprint?: CommunityReviewFingerprint;
  readonly evaluationRuleId?: QualificationPassRuleId;
  readonly failureCode?: string;
}

export type QualificationReceiptAuthorityState = "authoritative" | "revoked";

export interface QualificationReceiptRecord {
  readonly receiptFingerprint: CommunityReviewFingerprint;
  readonly attemptId: string;
  readonly reviewerId: string;
  readonly poolId: string;
  readonly poolVersion: string;
  readonly receipt: CommunityReviewQualificationReceipt;
  readonly authorityState: QualificationReceiptAuthorityState;
  readonly issuedAt: ServiceTimestamp;
  readonly revokedAt?: ServiceTimestamp;
}

export interface SealedBatchPayloadReferenceRecord {
  readonly batchId: string;
  /** An opaque private-store reference, never the sealed source payload. */
  readonly sourceReference: string;
  readonly visibleTaskSetFingerprint: CommunityReviewFingerprint;
  readonly createdAt: ServiceTimestamp;
}

export interface ReviewBatchRecord {
  readonly batchId: string;
  readonly batchFingerprint: CommunityReviewFingerprint;
  readonly manifest: CommunityReviewBatchManifest;
  readonly state: CommunityReviewBatchManifest["state"];
  readonly stateVersion: number;
  readonly sealedSourceReference: string;
  readonly createdAt: ServiceTimestamp;
  readonly updatedAt: ServiceTimestamp;
}

export interface ReviewAssignmentRecord {
  readonly assignment: CommunityReviewAssignment;
  /** Stored visible projection used to rebuild submissions without hidden data. */
  readonly packet: CommunityReviewReviewerPacket;
  readonly assignedAt: ServiceTimestamp;
  readonly updatedAt: ServiceTimestamp;
}

export interface AcceptedSubmissionRecord {
  readonly submission: CommunityReviewSubmission;
  readonly acceptedAt: ServiceTimestamp;
}

export interface RejectedSubmissionAttemptRecord {
  readonly rejectionId: string;
  readonly batchId?: string;
  readonly assignmentId?: string;
  readonly reviewerId?: string;
  readonly reason: string;
  /** Optional hash of already-sanitized input; raw rejected payload is never stored. */
  readonly payloadFingerprint?: CommunityReviewFingerprint;
  readonly attemptedAt: ServiceTimestamp;
}

export interface ReviewBatchCloseRecord {
  readonly batchId: string;
  /** Exact P3 CLOSED manifest returned by closeCommunityReviewBatch. */
  readonly manifest: CommunityReviewBatchManifest;
  readonly closeRecord: CommunityReviewBatchCloseRecord;
  /** Exact accepted-submission snapshot used for the close transaction. */
  readonly acceptedSubmissions: readonly CommunityReviewSubmission[];
  readonly createdAt: ServiceTimestamp;
}

export interface FrozenReviewPoolRecord {
  readonly batchId: string;
  readonly frozenPool: FrozenCommunityReviewPool;
  readonly createdAt: ServiceTimestamp;
}

/**
 * Persistence identity only. P3's agreement object remains the methodological
 * artifact; this fingerprint identifies the exact service row that stores it.
 */
export function communityReviewAgreementEvidencePersistenceFingerprint(input: {
  readonly batchId: string;
  readonly freezeFingerprint: CommunityReviewFingerprint;
  readonly evidence: CommunityReviewAgreementEvidence;
}): CommunityReviewFingerprint {
  return communityReviewFingerprint({
    persistenceKind: "community-review-agreement-evidence",
    batchId: input.batchId,
    freezeFingerprint: input.freezeFingerprint,
    evidence: input.evidence,
  });
}

export type CommunityReviewDisclosureMode = "PRIVATE" | "PUBLIC";

export interface CommunityReviewAgreementEvidenceRecord {
  readonly batchId: string;
  readonly freezeFingerprint: CommunityReviewFingerprint;
  /** Service persistence identity; not a new protocol or correctness claim. */
  readonly evidencePersistenceFingerprint: CommunityReviewFingerprint;
  readonly evidence: CommunityReviewAgreementEvidence;
  readonly createdAt: ServiceTimestamp;
}

export interface CommunityReviewDisclosureRecord {
  readonly disclosureId: string;
  readonly batchId: string;
  readonly freezeFingerprint: CommunityReviewFingerprint;
  readonly agreementEvidencePersistenceFingerprint: CommunityReviewFingerprint;
  readonly disclosureVersion: number;
  readonly mode: CommunityReviewDisclosureMode;
  readonly disclosurePolicy: CommunityReviewDisclosurePolicy;
  readonly disclosureDate?: string;
  readonly publicArtifact?: CommunityReviewPublicEvidenceArtifact;
  readonly publicArtifactFingerprint?: CommunityReviewFingerprint;
  readonly createdAt: ServiceTimestamp;
}

export type CommunityReviewEvidenceAuditEventType =
  | "batch_frozen"
  | "freeze_retrieved"
  | "agreement_evidence_generated"
  | "agreement_evidence_retrieved"
  | "disclosure_created"
  | "public_artifact_generated"
  | "disclosure_rejected";

/** Narrow operational metadata; raw annotations and private identity never enter this row. */
export interface CommunityReviewEvidenceAuditEventRecord {
  readonly eventId: string;
  readonly eventType: CommunityReviewEvidenceAuditEventType;
  readonly batchId: string;
  readonly freezeFingerprint?: CommunityReviewFingerprint;
  readonly agreementEvidencePersistenceFingerprint?: CommunityReviewFingerprint;
  readonly disclosureId?: string;
  readonly disclosureVersion?: number;
  readonly disclosureMode?: CommunityReviewDisclosureMode;
  readonly disclosurePolicy?: CommunityReviewDisclosurePolicy;
  readonly reasonCode?: string;
  readonly occurredAt: ServiceTimestamp;
}

export interface CommunityReviewPersistenceTransaction {
  getReviewerAccount(internalId: string): ReviewerAccountRecord | undefined;
  getReviewerAccountByReviewerId(reviewerId: string): ReviewerAccountRecord | undefined;
  insertReviewerAccount(record: ReviewerAccountRecord): ReviewerAccountRecord;
  updateReviewerAccount(record: ReviewerAccountRecord): ReviewerAccountRecord;

  getReviewerAuthIdentity(authIdentityId: string): ReviewerAuthIdentityRecord | undefined;
  getReviewerAuthIdentityBySubject(
    authProvider: string,
    authSubject: string,
  ): ReviewerAuthIdentityRecord | undefined;
  getReviewerAuthIdentityByInternalId(internalId: string): ReviewerAuthIdentityRecord | undefined;
  insertReviewerAuthIdentity(record: ReviewerAuthIdentityRecord): ReviewerAuthIdentityRecord;

  listReviewerConsentHistory(
    internalId: string,
    policyId: string,
    policyVersion: string,
  ): readonly ReviewerConsentRecord[];
  getReviewerConsent(consentEventId: string): ReviewerConsentRecord | undefined;
  insertReviewerConsent(record: ReviewerConsentRecord): ReviewerConsentRecord;
  insertAuthAuditEvent(record: AuthAuditEventRecord): AuthAuditEventRecord;
  listAuthAuditEvents(internalId?: string): readonly AuthAuditEventRecord[];
  insertQualificationAuthorityAuditEvent(
    record: QualificationAuthorityAuditEventRecord,
  ): QualificationAuthorityAuditEventRecord;
  listQualificationAuthorityAuditEvents(
    poolId?: string,
    poolVersion?: string,
  ): readonly QualificationAuthorityAuditEventRecord[];

  insertReviewDeliveryAuditEvent(
    record: ReviewDeliveryAuditEventRecord,
  ): ReviewDeliveryAuditEventRecord;
  listReviewDeliveryAuditEvents(batchId?: string): readonly ReviewDeliveryAuditEventRecord[];

  insertReviewSubmissionAuditEvent(
    record: ReviewSubmissionAuditEventRecord,
  ): ReviewSubmissionAuditEventRecord;
  listReviewSubmissionAuditEvents(batchId?: string): readonly ReviewSubmissionAuditEventRecord[];

  getQualificationPool(poolId: string, poolVersion: string): QualificationPoolRecord | undefined;
  insertQualificationPool(record: QualificationPoolRecord): QualificationPoolRecord;
  updateQualificationPool(record: QualificationPoolRecord): QualificationPoolRecord;

  getQualificationAttempt(attemptId: string): QualificationAttemptRecord | undefined;
  listQualificationAttempts(
    reviewerId: string,
    poolId: string,
    poolVersion: string,
  ): readonly QualificationAttemptRecord[];
  insertQualificationAttempt(record: QualificationAttemptRecord): QualificationAttemptRecord;
  updateQualificationAttempt(record: QualificationAttemptRecord): QualificationAttemptRecord;

  getQualificationReceipt(receiptFingerprint: string): QualificationReceiptRecord | undefined;
  getQualificationReceiptByAttempt(attemptId: string): QualificationReceiptRecord | undefined;
  listQualificationReceipts(reviewerId: string): readonly QualificationReceiptRecord[];
  insertQualificationReceipt(record: QualificationReceiptRecord): QualificationReceiptRecord;

  getBatch(batchId: string): ReviewBatchRecord | undefined;
  listBatches(): readonly ReviewBatchRecord[];
  insertBatch(record: ReviewBatchRecord): ReviewBatchRecord;
  updateBatch(record: ReviewBatchRecord): ReviewBatchRecord;

  getSealedBatchPayloadReference(batchId: string): SealedBatchPayloadReferenceRecord | undefined;
  insertSealedBatchPayloadReference(
    record: SealedBatchPayloadReferenceRecord,
  ): SealedBatchPayloadReferenceRecord;

  getAssignment(assignmentId: string): ReviewAssignmentRecord | undefined;
  getAssignmentByBatchReviewer(batchId: string, reviewerId: string): ReviewAssignmentRecord | undefined;
  listAssignments(batchId: string): readonly ReviewAssignmentRecord[];
  insertAssignment(record: ReviewAssignmentRecord): ReviewAssignmentRecord;
  updateAssignment(record: ReviewAssignmentRecord): ReviewAssignmentRecord;

  getAcceptedSubmissionByAssignment(assignmentId: string): AcceptedSubmissionRecord | undefined;
  getAcceptedSubmissionByBatchReviewer(
    batchId: string,
    reviewerId: string,
  ): AcceptedSubmissionRecord | undefined;
  listAcceptedSubmissions(batchId: string): readonly AcceptedSubmissionRecord[];
  insertAcceptedSubmission(record: AcceptedSubmissionRecord): AcceptedSubmissionRecord;

  insertRejectedSubmissionAttempt(
    record: RejectedSubmissionAttemptRecord,
  ): RejectedSubmissionAttemptRecord;
  listRejectedSubmissionAttempts(batchId: string): readonly RejectedSubmissionAttemptRecord[];

  getBatchCloseRecord(batchId: string): ReviewBatchCloseRecord | undefined;
  insertBatchCloseRecord(record: ReviewBatchCloseRecord): ReviewBatchCloseRecord;

  getFrozenReviewPool(batchId: string): FrozenReviewPoolRecord | undefined;
  insertFrozenReviewPool(record: FrozenReviewPoolRecord): FrozenReviewPoolRecord;

  getCommunityReviewAgreementEvidence(
    batchId: string,
  ): CommunityReviewAgreementEvidenceRecord | undefined;
  insertCommunityReviewAgreementEvidence(
    record: CommunityReviewAgreementEvidenceRecord,
  ): CommunityReviewAgreementEvidenceRecord;

  getCommunityReviewDisclosure(disclosureId: string): CommunityReviewDisclosureRecord | undefined;
  listCommunityReviewDisclosures(batchId: string): readonly CommunityReviewDisclosureRecord[];
  insertCommunityReviewDisclosure(
    record: CommunityReviewDisclosureRecord,
  ): CommunityReviewDisclosureRecord;

  insertCommunityReviewEvidenceAuditEvent(
    record: CommunityReviewEvidenceAuditEventRecord,
  ): CommunityReviewEvidenceAuditEventRecord;
  listCommunityReviewEvidenceAuditEvents(
    batchId?: string,
  ): readonly CommunityReviewEvidenceAuditEventRecord[];
}

/**
 * Storage-neutral snapshot used by the PostgreSQL adapter's compatibility
 * boundary. It contains the same records as the in-memory repository; indexes
 * and lookup maps are reconstructed by the adapter instead of becoming a
 * second domain model.
 */
export interface CommunityReviewPersistenceSnapshot {
  readonly reviewerAccounts: readonly ReviewerAccountRecord[];
  readonly reviewerAuthIdentities: readonly ReviewerAuthIdentityRecord[];
  readonly reviewerConsents: readonly ReviewerConsentRecord[];
  readonly authAuditEvents: readonly AuthAuditEventRecord[];
  readonly qualificationAuditEvents: readonly QualificationAuthorityAuditEventRecord[];
  readonly reviewDeliveryAuditEvents: readonly ReviewDeliveryAuditEventRecord[];
  readonly reviewSubmissionAuditEvents: readonly ReviewSubmissionAuditEventRecord[];
  readonly qualificationPools: readonly QualificationPoolRecord[];
  readonly qualificationAttempts: readonly QualificationAttemptRecord[];
  readonly qualificationReceipts: readonly QualificationReceiptRecord[];
  readonly batches: readonly ReviewBatchRecord[];
  readonly sealedBatchPayloadReferences: readonly SealedBatchPayloadReferenceRecord[];
  readonly assignments: readonly ReviewAssignmentRecord[];
  readonly acceptedSubmissions: readonly AcceptedSubmissionRecord[];
  readonly rejectedSubmissionAttempts: readonly RejectedSubmissionAttemptRecord[];
  readonly batchCloseRecords: readonly ReviewBatchCloseRecord[];
  readonly frozenReviewPools: readonly FrozenReviewPoolRecord[];
  readonly agreementEvidence: readonly CommunityReviewAgreementEvidenceRecord[];
  readonly disclosures: readonly CommunityReviewDisclosureRecord[];
  readonly evidenceAuditEvents: readonly CommunityReviewEvidenceAuditEventRecord[];
}

export function emptyCommunityReviewPersistenceSnapshot(): CommunityReviewPersistenceSnapshot {
  return {
    reviewerAccounts: [],
    reviewerAuthIdentities: [],
    reviewerConsents: [],
    authAuditEvents: [],
    qualificationAuditEvents: [],
    reviewDeliveryAuditEvents: [],
    reviewSubmissionAuditEvents: [],
    qualificationPools: [],
    qualificationAttempts: [],
    qualificationReceipts: [],
    batches: [],
    sealedBatchPayloadReferences: [],
    assignments: [],
    acceptedSubmissions: [],
    rejectedSubmissionAttempts: [],
    batchCloseRecords: [],
    frozenReviewPools: [],
    agreementEvidence: [],
    disclosures: [],
    evidenceAuditEvents: [],
  };
}

export interface CommunityReviewPersistence {
  /** The callback commits atomically; a thrown error rolls back every mutation. */
  transaction<T>(
    callback: (transaction: CommunityReviewPersistenceTransaction) => Promise<T> | T,
  ): Promise<T>;
}
