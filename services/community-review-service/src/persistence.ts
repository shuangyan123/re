import type {
  CommunityReviewAssignment,
  CommunityReviewBatchCloseRecord,
  CommunityReviewBatchManifest,
  CommunityReviewDataKind,
  CommunityReviewFingerprint,
  CommunityReviewReviewerPacket,
  CommunityReviewQualificationReceipt,
  CommunityReviewSubmission,
  CommunityReviewSyntheticFixtureMarker,
  FrozenCommunityReviewPool,
} from "../../../src/contracts/community-review.js";

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

export type QualificationPoolState = "SEALED" | "OPEN" | "RETIRED";

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
  readonly state: QualificationPoolState;
  /** Opaque references; the definition and answer key are not repository assets. */
  readonly sealedDefinitionReference: string;
  readonly privateAnswerKeyReference: string;
  readonly createdAt: ServiceTimestamp;
  readonly updatedAt: ServiceTimestamp;
}

export type QualificationAttemptState =
  | "STARTED"
  | "QUALIFIED"
  | "REJECTED"
  | "EXPIRED";
export type QualificationAttemptResult = "qualified" | "not-qualified";

export interface QualificationAttemptRecord {
  readonly attemptId: string;
  readonly reviewerId: string;
  readonly poolId: string;
  readonly poolVersion: string;
  /** A replay-resistant nonce hash; the raw nonce is outside this boundary. */
  readonly nonceHash: string;
  readonly state: QualificationAttemptState;
  readonly result?: QualificationAttemptResult;
  readonly startedAt: ServiceTimestamp;
  readonly submittedAt?: ServiceTimestamp;
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
  readonly createdAt: ServiceTimestamp;
}

export interface FrozenReviewPoolRecord {
  readonly batchId: string;
  readonly frozenPool: FrozenCommunityReviewPool;
  readonly createdAt: ServiceTimestamp;
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

  getQualificationPool(poolId: string, poolVersion: string): QualificationPoolRecord | undefined;
  insertQualificationPool(record: QualificationPoolRecord): QualificationPoolRecord;

  getQualificationAttempt(attemptId: string): QualificationAttemptRecord | undefined;
  insertQualificationAttempt(record: QualificationAttemptRecord): QualificationAttemptRecord;
  updateQualificationAttempt(record: QualificationAttemptRecord): QualificationAttemptRecord;

  getQualificationReceipt(receiptFingerprint: string): QualificationReceiptRecord | undefined;
  insertQualificationReceipt(record: QualificationReceiptRecord): QualificationReceiptRecord;

  getBatch(batchId: string): ReviewBatchRecord | undefined;
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
}

export interface CommunityReviewPersistence {
  /** The callback commits atomically; a thrown error rolls back every mutation. */
  transaction<T>(
    callback: (transaction: CommunityReviewPersistenceTransaction) => Promise<T> | T,
  ): Promise<T>;
}
