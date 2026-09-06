import {
  assertCommunityReviewSubmissionMatchesAssignment,
  parseCommunityReviewAssignment,
  parseCommunityReviewBatchCloseRecord,
  parseCommunityReviewBatchManifest,
  parseCommunityReviewQualificationReceipt,
  parseCommunityReviewReviewerPacket,
  parseCommunityReviewSubmission,
  parseFrozenCommunityReviewPool,
} from "../../../src/contracts/community-review-validation.js";
import { canonicalCommunityReviewJson } from "../../../src/community-review/fingerprint.js";
import { CommunityReviewServiceError } from "./errors.js";
import type {
  AcceptedSubmissionRecord,
  AuthAuditEventRecord,
  CommunityReviewPersistence,
  CommunityReviewPersistenceTransaction,
  FrozenReviewPoolRecord,
  QualificationAttemptRecord,
  QualificationPoolRecord,
  QualificationReceiptRecord,
  RejectedSubmissionAttemptRecord,
  ReviewerAuthIdentityRecord,
  ReviewerAccountRecord,
  ReviewerConsentRecord,
  ReviewAssignmentRecord,
  ReviewBatchCloseRecord,
  ReviewBatchRecord,
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
  };
}

function copy<T>(value: T): T {
  return structuredClone(value);
}

function same(left: unknown, right: unknown): boolean {
  return canonicalCommunityReviewJson(left) === canonicalCommunityReviewJson(right);
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
  return `${record.reviewerId}\u0000${poolKey(record.poolId, record.poolVersion)}\u0000${record.nonceHash}`;
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

function assertQualificationAttemptRecord(record: QualificationAttemptRecord): void {
  requiredString(record.attemptId);
  opaqueId(record.reviewerId);
  requiredString(record.poolId);
  requiredString(record.poolVersion);
  requiredString(record.nonceHash);
  requiredString(record.startedAt);
  if (record.state === "STARTED") {
    if (record.result !== undefined || record.submittedAt !== undefined) {
      throw new CommunityReviewServiceError("invalid_service_record");
    }
    return;
  }
  requiredString(record.submittedAt ?? "");
  if (record.state === "QUALIFIED" && record.result !== "qualified" ||
    record.state === "REJECTED" && record.result !== "not-qualified" ||
    record.state === "EXPIRED" && record.result !== undefined) {
    throw new CommunityReviewServiceError("invalid_service_record");
  }
}

function assertAssignmentRecord(record: ReviewAssignmentRecord): void {
  const assignment = parseCommunityReviewAssignment(record.assignment);
  const packet = parseCommunityReviewReviewerPacket(record.packet);
  if (!["assigned", "withdrawn"].includes(assignment.assignmentState) ||
    packet.assignmentId !== assignment.assignmentId ||
    packet.batchId !== assignment.batchId || packet.batchFingerprint !== assignment.batchFingerprint ||
    packet.reviewerId !== assignment.reviewerId ||
    packet.qualificationReceiptFingerprint !== assignment.qualificationReceiptFingerprint ||
    packet.taskSetFingerprint !== assignment.visibleTaskSetFingerprint ||
    !same(packet.instrument, assignment.instrument)) {
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
  if (manifest.batchId !== record.batchId || manifest.state !== "CLOSED") {
    throw new CommunityReviewServiceError("invalid_service_record");
  }
}

function assertSubmissionRecord(record: AcceptedSubmissionRecord): void {
  const submission = parseCommunityReviewSubmission(record.submission);
  if (submission.submissionDisposition !== "accepted-before-close") {
    throw new CommunityReviewServiceError("invalid_service_record");
  }
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

  getQualificationPool(poolId: string, poolVersion: string): QualificationPoolRecord | undefined {
    const record = this.state.qualificationPools.get(poolKey(poolId, poolVersion));
    return record === undefined ? undefined : copy(record);
  }

  insertQualificationPool(record: QualificationPoolRecord): QualificationPoolRecord {
    requiredString(record.qualificationId);
    requiredString(record.qualificationVersion);
    requiredString(record.poolId);
    requiredString(record.poolVersion);
    fingerprint(record.definitionFingerprint);
    fingerprint(record.instrumentFingerprint);
    requiredString(record.reviewLocale);
    requiredString(record.sealedDefinitionReference);
    requiredString(record.privateAnswerKeyReference);
    if (!["SEALED", "OPEN", "RETIRED"].includes(record.state)) {
      throw new CommunityReviewServiceError("invalid_service_record");
    }
    if (record.dataKind === "synthetic-fixture" && record.fixture === undefined ||
      record.dataKind === "community-review" && record.fixture !== undefined) {
      throw new CommunityReviewServiceError("invalid_service_record");
    }
    const key = poolKey(record.poolId, record.poolVersion);
    if (this.state.qualificationPools.has(key)) {
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

  insertQualificationAttempt(record: QualificationAttemptRecord): QualificationAttemptRecord {
    assertQualificationAttemptRecord(record);
    if (this.state.qualificationAttempts.has(record.attemptId) ||
      this.state.attemptNonces.has(attemptNonceKey(record))) {
      throw new CommunityReviewServiceError("repository_conflict");
    }
    if (!this.state.reviewerIds.has(record.reviewerId) ||
      !this.state.qualificationPools.has(poolKey(record.poolId, record.poolVersion))) {
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
    if (previous.state !== "STARTED" || record.state === "STARTED") {
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
    if (previous === undefined || previous.assignment.batchId !== record.assignment.batchId ||
      previous.assignment.reviewerId !== record.assignment.reviewerId ||
      !same(previous.packet, record.packet) ||
      previous.assignment.assignmentState !== "assigned" ||
      record.assignment.assignmentState !== "withdrawn") {
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
    if (assignment === undefined || batch === undefined || batch.state !== "OPEN" ||
      assignment.assignment.assignmentState !== "assigned" ||
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
    requiredString(record.reason);
    if (record.batchId !== undefined) requiredString(record.batchId);
    if (record.assignmentId !== undefined) requiredString(record.assignmentId);
    if (record.reviewerId !== undefined) opaqueId(record.reviewerId);
    if (record.payloadFingerprint !== undefined) fingerprint(record.payloadFingerprint);
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
    if (this.state.frozenReviewPools.has(record.batchId) ||
      this.state.freezeFingerprints.has(pool.freezeFingerprint)) {
      throw new CommunityReviewServiceError("repository_conflict");
    }
    const stored = copy(record);
    this.state.frozenReviewPools.set(record.batchId, stored);
    this.state.freezeFingerprints.set(pool.freezeFingerprint, record.batchId);
    return copy(stored);
  }
}

/**
 * Deterministic local adapter for P4-A tests. A real PostgreSQL adapter must
 * use row locks and the same uniqueness constraints from the migration.
 */
export class InMemoryCommunityReviewRepository implements CommunityReviewPersistence {
  private state = emptyState();
  private transactionTail = Promise.resolve();

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
