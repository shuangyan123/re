import type { PoolClient } from "pg";

import {
  canonicalCommunityReviewJson,
} from "../../../src/community-review/fingerprint.js";
import type {
  AcceptedSubmissionRecord,
  AuthAuditEventRecord,
  CommunityReviewAgreementEvidenceRecord,
  CommunityReviewDisclosureRecord,
  CommunityReviewEvidenceAuditEventRecord,
  CommunityReviewPersistenceSnapshot,
  FrozenReviewPoolRecord,
  QualificationAttemptRecord,
  QualificationAuthorityAuditEventRecord,
  QualificationPoolRecord,
  QualificationReceiptRecord,
  RejectedSubmissionAttemptRecord,
  ReviewAssignmentRecord,
  ReviewBatchCloseRecord,
  ReviewBatchRecord,
  ReviewDeliveryAuditEventRecord,
  ReviewSubmissionAuditEventRecord,
  ReviewerAuthIdentityRecord,
  ReviewerAccountRecord,
  ReviewerConsentRecord,
  SealedBatchPayloadReferenceRecord,
} from "./persistence.js";
import { CommunityReviewServiceError } from "./errors.js";

type DatabaseRow = { readonly [column: string]: unknown };

function invalidRecord(): never {
  throw new CommunityReviewServiceError("invalid_service_record");
}

function json<T>(value: unknown): T {
  if (value === null || value === undefined) invalidRecord();
  if (typeof value === "string") {
    try {
      return structuredClone(JSON.parse(value)) as T;
    } catch {
      invalidRecord();
    }
  }
  if (typeof value !== "object") invalidRecord();
  return structuredClone(value) as T;
}

function optionalJson<T>(value: unknown): T | undefined {
  return value === null || value === undefined ? undefined : json<T>(value);
}

function stringValue(row: DatabaseRow, column: string): string {
  const value = row[column];
  if (typeof value !== "string") invalidRecord();
  return value;
}

function optionalString(row: DatabaseRow, column: string): string | undefined {
  const value = row[column];
  if (value === null || value === undefined) return undefined;
  if (typeof value !== "string") invalidRecord();
  return value;
}

function optionalTimestamp(row: DatabaseRow, column: string): string | undefined {
  const value = row[column];
  if (value === null || value === undefined) return undefined;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) invalidRecord();
    return value.toISOString();
  }
  if (typeof value === "string") {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  }
  invalidRecord();
}

function integerValue(row: DatabaseRow, column: string): number {
  const value = row[column];
  if (typeof value !== "number" || !Number.isInteger(value)) invalidRecord();
  return value;
}

function timestampValue(row: DatabaseRow, column: string): string {
  const value = row[column];
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) invalidRecord();
    return value.toISOString();
  }
  if (typeof value === "string") {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  }
  invalidRecord();
}

async function selectRows(client: PoolClient, sql: string): Promise<readonly DatabaseRow[]> {
  const result = await client.query<DatabaseRow>(sql);
  return result.rows;
}

function accountFromRow(row: DatabaseRow): ReviewerAccountRecord {
  return {
    internalId: stringValue(row, "internal_id"),
    reviewerId: stringValue(row, "reviewer_id"),
    privateAuthSubjectReference: stringValue(row, "private_auth_subject_reference"),
    status: stringValue(row, "status") as ReviewerAccountRecord["status"],
    consentVersion: stringValue(row, "consent_version"),
    consentState: stringValue(row, "consent_state") as ReviewerAccountRecord["consentState"],
    createdAt: timestampValue(row, "created_at"),
    updatedAt: timestampValue(row, "updated_at"),
  };
}

function authIdentityFromRow(row: DatabaseRow): ReviewerAuthIdentityRecord {
  return {
    authIdentityId: stringValue(row, "auth_identity_id"),
    internalId: stringValue(row, "internal_id"),
    reviewerId: stringValue(row, "reviewer_id"),
    authProvider: stringValue(row, "auth_provider"),
    authSubject: stringValue(row, "auth_subject"),
    createdAt: timestampValue(row, "created_at"),
  };
}

function consentFromRow(row: DatabaseRow): ReviewerConsentRecord {
  const acceptedAt = optionalTimestamp(row, "accepted_at");
  const revokedAt = optionalTimestamp(row, "revoked_at");
  return {
    consentEventId: stringValue(row, "consent_event_id"),
    internalId: stringValue(row, "internal_id"),
    reviewerId: stringValue(row, "reviewer_id"),
    policyId: stringValue(row, "policy_id"),
    policyVersion: stringValue(row, "policy_version"),
    state: stringValue(row, "state") as ReviewerConsentRecord["state"],
    ...(acceptedAt === undefined ? {} : { acceptedAt }),
    ...(revokedAt === undefined ? {} : { revokedAt }),
    recordedAt: timestampValue(row, "recorded_at"),
  };
}

function authAuditFromRow(row: DatabaseRow): AuthAuditEventRecord {
  const internalId = optionalString(row, "internal_id");
  const reviewerId = optionalString(row, "reviewer_id");
  const authProvider = optionalString(row, "auth_provider");
  const reasonCode = optionalString(row, "reason_code");
  return {
    eventId: stringValue(row, "event_id"),
    eventType: stringValue(row, "event_type") as AuthAuditEventRecord["eventType"],
    ...(internalId === undefined ? {} : { internalId }),
    ...(reviewerId === undefined ? {} : { reviewerId }),
    ...(authProvider === undefined ? {} : { authProvider }),
    ...(reasonCode === undefined ? {} : { reasonCode }),
    occurredAt: timestampValue(row, "occurred_at"),
  };
}

function qualificationAuditFromRow(row: DatabaseRow): QualificationAuthorityAuditEventRecord {
  const reviewerId = optionalString(row, "reviewer_id");
  const attemptId = optionalString(row, "attempt_id");
  const poolId = optionalString(row, "pool_id");
  const poolVersion = optionalString(row, "pool_version");
  const reasonCode = optionalString(row, "reason_code");
  return {
    eventId: stringValue(row, "event_id"),
    eventType: stringValue(row, "event_type") as QualificationAuthorityAuditEventRecord["eventType"],
    ...(reviewerId === undefined ? {} : { reviewerId }),
    ...(attemptId === undefined ? {} : { attemptId }),
    ...(poolId === undefined ? {} : { poolId }),
    ...(poolVersion === undefined ? {} : { poolVersion }),
    ...(reasonCode === undefined ? {} : { reasonCode }),
    occurredAt: timestampValue(row, "occurred_at"),
  };
}

function deliveryAuditFromRow(row: DatabaseRow): ReviewDeliveryAuditEventRecord {
  const batchId = optionalString(row, "batch_id");
  const assignmentId = optionalString(row, "assignment_id");
  const reviewerId = optionalString(row, "reviewer_id");
  const reasonCode = optionalString(row, "reason_code");
  return {
    eventId: stringValue(row, "event_id"),
    eventType: stringValue(row, "event_type") as ReviewDeliveryAuditEventRecord["eventType"],
    ...(batchId === undefined ? {} : { batchId }),
    ...(assignmentId === undefined ? {} : { assignmentId }),
    ...(reviewerId === undefined ? {} : { reviewerId }),
    ...(reasonCode === undefined ? {} : { reasonCode }),
    occurredAt: timestampValue(row, "occurred_at"),
  };
}

function submissionAuditFromRow(row: DatabaseRow): ReviewSubmissionAuditEventRecord {
  return {
    eventId: stringValue(row, "event_id"),
    eventType: "submission_accepted",
    batchId: stringValue(row, "batch_id"),
    assignmentId: stringValue(row, "assignment_id"),
    reviewerId: stringValue(row, "reviewer_id"),
    submissionFingerprint: stringValue(row, "submission_fingerprint"),
    occurredAt: timestampValue(row, "occurred_at"),
  };
}

function poolFromRow(row: DatabaseRow): QualificationPoolRecord {
  const fixture = optionalJson<QualificationPoolRecord["fixture"]>(row.fixture);
  const instrument = optionalJson<QualificationPoolRecord["instrument"]>(row.instrument);
  const visibleTaskSetFingerprint = optionalString(row, "visible_task_set_fingerprint");
  const answerKeyCommitment = optionalString(row, "answer_key_commitment");
  const passRuleId = optionalString(row, "pass_rule_id") as QualificationPoolRecord["passRuleId"];
  const sealedAt = optionalTimestamp(row, "sealed_at");
  const retiredAt = optionalTimestamp(row, "retired_at");
  return {
    dataKind: stringValue(row, "data_kind") as QualificationPoolRecord["dataKind"],
    ...(fixture === undefined ? {} : { fixture }),
    qualificationId: stringValue(row, "qualification_id"),
    qualificationVersion: stringValue(row, "qualification_version"),
    poolId: stringValue(row, "pool_id"),
    poolVersion: stringValue(row, "pool_version"),
    definitionFingerprint: stringValue(row, "definition_fingerprint"),
    instrumentFingerprint: stringValue(row, "instrument_fingerprint"),
    reviewLocale: stringValue(row, "review_locale"),
    ...(instrument === undefined ? {} : { instrument }),
    state: stringValue(row, "state") as QualificationPoolRecord["state"],
    ...(visibleTaskSetFingerprint === undefined ? {} : { visibleTaskSetFingerprint }),
    ...(answerKeyCommitment === undefined ? {} : { answerKeyCommitment }),
    ...(passRuleId === undefined ? {} : { passRuleId }),
    stateVersion: integerValue(row, "state_version"),
    ...(sealedAt === undefined ? {} : { sealedAt }),
    ...(retiredAt === undefined ? {} : { retiredAt }),
    sealedDefinitionReference: stringValue(row, "sealed_definition_reference"),
    privateAnswerKeyReference: stringValue(row, "private_answer_key_reference"),
    createdAt: timestampValue(row, "created_at"),
    updatedAt: timestampValue(row, "updated_at"),
  };
}

function attemptFromRow(row: DatabaseRow): QualificationAttemptRecord {
  const result = optionalString(row, "result") as QualificationAttemptRecord["result"];
  const issuedAt = optionalTimestamp(row, "issued_at");
  const submittedAt = optionalTimestamp(row, "submitted_at");
  const evaluatedAt = optionalTimestamp(row, "evaluated_at");
  const definitionFingerprint = optionalString(row, "qualification_definition_fingerprint");
  const instrumentFingerprint = optionalString(row, "instrument_fingerprint");
  const reviewLocale = optionalString(row, "review_locale");
  const packetFingerprint = optionalString(row, "packet_fingerprint");
  const responses = optionalJson<QualificationAttemptRecord["responses"]>(row.responses);
  const responseFingerprint = optionalString(row, "response_fingerprint");
  const evaluationRuleId = optionalString(row, "evaluation_rule_id") as QualificationAttemptRecord["evaluationRuleId"];
  const failureCode = optionalString(row, "failure_code");
  return {
    attemptId: stringValue(row, "attempt_id"),
    reviewerId: stringValue(row, "reviewer_id"),
    poolId: stringValue(row, "pool_id"),
    poolVersion: stringValue(row, "pool_version"),
    nonceHash: stringValue(row, "nonce_hash"),
    state: stringValue(row, "state") as QualificationAttemptRecord["state"],
    ...(result === undefined ? {} : { result }),
    startedAt: timestampValue(row, "started_at"),
    ...(issuedAt === undefined ? {} : { issuedAt }),
    ...(submittedAt === undefined ? {} : { submittedAt }),
    ...(evaluatedAt === undefined ? {} : { evaluatedAt }),
    ...(definitionFingerprint === undefined ? {} : { qualificationDefinitionFingerprint: definitionFingerprint }),
    ...(instrumentFingerprint === undefined ? {} : { instrumentFingerprint }),
    ...(reviewLocale === undefined ? {} : { reviewLocale }),
    ...(packetFingerprint === undefined ? {} : { packetFingerprint }),
    ...(responses === undefined ? {} : { responses }),
    ...(responseFingerprint === undefined ? {} : { responseFingerprint }),
    ...(evaluationRuleId === undefined ? {} : { evaluationRuleId }),
    ...(failureCode === undefined ? {} : { failureCode }),
  };
}

function receiptFromRow(row: DatabaseRow): QualificationReceiptRecord {
  const revokedAt = optionalTimestamp(row, "revoked_at");
  return {
    receiptFingerprint: stringValue(row, "receipt_fingerprint"),
    attemptId: stringValue(row, "attempt_id"),
    reviewerId: stringValue(row, "reviewer_id"),
    poolId: stringValue(row, "pool_id"),
    poolVersion: stringValue(row, "pool_version"),
    receipt: json<QualificationReceiptRecord["receipt"]>(row.receipt),
    authorityState: stringValue(row, "authority_state") as QualificationReceiptRecord["authorityState"],
    issuedAt: timestampValue(row, "issued_at"),
    ...(revokedAt === undefined ? {} : { revokedAt }),
  };
}

function batchFromRow(row: DatabaseRow): ReviewBatchRecord {
  return {
    batchId: stringValue(row, "batch_id"),
    batchFingerprint: stringValue(row, "batch_fingerprint"),
    manifest: json<ReviewBatchRecord["manifest"]>(row.manifest),
    state: stringValue(row, "state") as ReviewBatchRecord["state"],
    stateVersion: integerValue(row, "state_version"),
    sealedSourceReference: stringValue(row, "sealed_source_reference"),
    createdAt: timestampValue(row, "created_at"),
    updatedAt: timestampValue(row, "updated_at"),
  };
}

function sealedReferenceFromRow(row: DatabaseRow): SealedBatchPayloadReferenceRecord {
  return {
    batchId: stringValue(row, "batch_id"),
    sourceReference: stringValue(row, "source_reference"),
    visibleTaskSetFingerprint: stringValue(row, "visible_task_set_fingerprint"),
    createdAt: timestampValue(row, "created_at"),
  };
}

function assignmentFromRow(row: DatabaseRow): ReviewAssignmentRecord {
  return {
    assignment: json<ReviewAssignmentRecord["assignment"]>(row.assignment),
    packet: json<ReviewAssignmentRecord["packet"]>(row.packet),
    assignedAt: timestampValue(row, "assigned_at"),
    updatedAt: timestampValue(row, "updated_at"),
  };
}

function acceptedSubmissionFromRow(row: DatabaseRow): AcceptedSubmissionRecord {
  return {
    submission: json<AcceptedSubmissionRecord["submission"]>(row.submission),
    acceptedAt: timestampValue(row, "accepted_at"),
  };
}

function rejectedSubmissionFromRow(row: DatabaseRow): RejectedSubmissionAttemptRecord {
  const batchId = optionalString(row, "batch_id");
  const assignmentId = optionalString(row, "assignment_id");
  const reviewerId = optionalString(row, "reviewer_id");
  const payloadFingerprint = optionalString(row, "payload_fingerprint");
  return {
    rejectionId: stringValue(row, "rejection_id"),
    ...(batchId === undefined ? {} : { batchId }),
    ...(assignmentId === undefined ? {} : { assignmentId }),
    ...(reviewerId === undefined ? {} : { reviewerId }),
    reason: stringValue(row, "reason"),
    ...(payloadFingerprint === undefined ? {} : { payloadFingerprint }),
    attemptedAt: timestampValue(row, "attempted_at"),
  };
}

function closeFromRow(
  row: DatabaseRow,
  acceptedSubmissionsByBatch: ReadonlyMap<string, readonly AcceptedSubmissionRecord["submission"][]>,
): ReviewBatchCloseRecord {
  return {
    batchId: stringValue(row, "batch_id"),
    manifest: json<ReviewBatchCloseRecord["manifest"]>(row.manifest),
    closeRecord: json<ReviewBatchCloseRecord["closeRecord"]>(row.close_record),
    acceptedSubmissions: acceptedSubmissionsByBatch.get(stringValue(row, "batch_id")) ?? [],
    createdAt: timestampValue(row, "created_at"),
  };
}

function frozenFromRow(row: DatabaseRow): FrozenReviewPoolRecord {
  return {
    batchId: stringValue(row, "batch_id"),
    frozenPool: json<FrozenReviewPoolRecord["frozenPool"]>(row.frozen_pool),
    createdAt: timestampValue(row, "created_at"),
  };
}

function agreementFromRow(row: DatabaseRow): CommunityReviewAgreementEvidenceRecord {
  return {
    batchId: stringValue(row, "batch_id"),
    freezeFingerprint: stringValue(row, "freeze_fingerprint"),
    evidencePersistenceFingerprint: stringValue(row, "evidence_persistence_fingerprint"),
    evidence: json<CommunityReviewAgreementEvidenceRecord["evidence"]>(row.evidence),
    createdAt: timestampValue(row, "created_at"),
  };
}

function disclosureFromRow(row: DatabaseRow): CommunityReviewDisclosureRecord {
  const disclosureDate = optionalString(row, "disclosure_date");
  const publicArtifact = optionalJson<CommunityReviewDisclosureRecord["publicArtifact"]>(row.public_artifact);
  const publicArtifactFingerprint = optionalString(row, "public_artifact_fingerprint");
  return {
    disclosureId: stringValue(row, "disclosure_id"),
    batchId: stringValue(row, "batch_id"),
    freezeFingerprint: stringValue(row, "freeze_fingerprint"),
    agreementEvidencePersistenceFingerprint: stringValue(
      row,
      "agreement_evidence_persistence_fingerprint",
    ),
    disclosureVersion: integerValue(row, "disclosure_version"),
    mode: stringValue(row, "mode") as CommunityReviewDisclosureRecord["mode"],
    disclosurePolicy: json<CommunityReviewDisclosureRecord["disclosurePolicy"]>(row.disclosure_policy),
    ...(disclosureDate === undefined ? {} : { disclosureDate }),
    ...(publicArtifact === undefined ? {} : { publicArtifact }),
    ...(publicArtifactFingerprint === undefined ? {} : { publicArtifactFingerprint }),
    createdAt: timestampValue(row, "created_at"),
  };
}

function evidenceAuditFromRow(row: DatabaseRow): CommunityReviewEvidenceAuditEventRecord {
  const freezeFingerprint = optionalString(row, "freeze_fingerprint");
  const agreementEvidencePersistenceFingerprint = optionalString(
    row,
    "agreement_evidence_persistence_fingerprint",
  );
  const disclosureId = optionalString(row, "disclosure_id");
  const disclosureVersionValue = row.disclosure_version;
  const disclosureVersion = disclosureVersionValue === null || disclosureVersionValue === undefined
    ? undefined
    : typeof disclosureVersionValue === "number" && Number.isInteger(disclosureVersionValue)
      ? disclosureVersionValue
      : invalidRecord();
  const disclosureMode = optionalString(row, "disclosure_mode") as CommunityReviewEvidenceAuditEventRecord["disclosureMode"];
  const disclosurePolicy = optionalJson<CommunityReviewEvidenceAuditEventRecord["disclosurePolicy"]>(
    row.disclosure_policy,
  );
  const reasonCode = optionalString(row, "reason_code");
  return {
    eventId: stringValue(row, "event_id"),
    eventType: stringValue(row, "event_type") as CommunityReviewEvidenceAuditEventRecord["eventType"],
    batchId: stringValue(row, "batch_id"),
    ...(freezeFingerprint === undefined ? {} : { freezeFingerprint }),
    ...(agreementEvidencePersistenceFingerprint === undefined ? {}
      : { agreementEvidencePersistenceFingerprint }),
    ...(disclosureId === undefined ? {} : { disclosureId }),
    ...(disclosureVersion === undefined ? {} : { disclosureVersion }),
    ...(disclosureMode === undefined ? {} : { disclosureMode }),
    ...(disclosurePolicy === undefined ? {} : { disclosurePolicy }),
    ...(reasonCode === undefined ? {} : { reasonCode }),
    occurredAt: timestampValue(row, "occurred_at"),
  };
}

export async function loadPersistenceSnapshot(client: PoolClient): Promise<CommunityReviewPersistenceSnapshot> {
  const reviewerAccounts = (await selectRows(
    client,
    "SELECT * FROM reviewer_accounts ORDER BY internal_id",
  )).map(accountFromRow);
  const reviewerAuthIdentities = (await selectRows(
    client,
    "SELECT * FROM reviewer_auth_identities ORDER BY auth_identity_id",
  )).map(authIdentityFromRow);
  const reviewerConsents = (await selectRows(
    client,
    "SELECT * FROM reviewer_consent_events ORDER BY recorded_at, consent_event_id",
  )).map(consentFromRow);
  const authAuditEvents = (await selectRows(
    client,
    "SELECT * FROM reviewer_auth_audit_events ORDER BY event_id",
  )).map(authAuditFromRow);
  const qualificationAuditEvents = (await selectRows(
    client,
    "SELECT * FROM qualification_authority_audit_events ORDER BY occurred_at, event_id",
  )).map(qualificationAuditFromRow);
  const reviewDeliveryAuditEvents = (await selectRows(
    client,
    "SELECT * FROM review_delivery_audit_events ORDER BY occurred_at, event_id",
  )).map(deliveryAuditFromRow);
  const reviewSubmissionAuditEvents = (await selectRows(
    client,
    "SELECT * FROM review_submission_audit_events ORDER BY occurred_at, event_id",
  )).map(submissionAuditFromRow);
  const qualificationPools = (await selectRows(
    client,
    "SELECT * FROM qualification_pools ORDER BY pool_id, pool_version",
  )).map(poolFromRow);
  const qualificationAttempts = (await selectRows(
    client,
    "SELECT * FROM qualification_attempts ORDER BY attempt_id",
  )).map(attemptFromRow);
  const qualificationReceipts = (await selectRows(
    client,
    "SELECT * FROM qualification_receipts ORDER BY receipt_fingerprint",
  )).map(receiptFromRow);
  const batches = (await selectRows(
    client,
    "SELECT * FROM review_batches ORDER BY created_at, batch_id",
  )).map(batchFromRow);
  const sealedBatchPayloadReferences = (await selectRows(
    client,
    "SELECT * FROM sealed_batch_payload_references ORDER BY batch_id",
  )).map(sealedReferenceFromRow);
  const assignments = (await selectRows(
    client,
    "SELECT * FROM review_assignments ORDER BY assignment_id",
  )).map((row) => ({
    ...assignmentFromRow(row),
    assignment: assignmentFromRow(row).assignment,
  }));
  const acceptedSubmissions = (await selectRows(
    client,
    "SELECT * FROM review_submissions ORDER BY submission_fingerprint",
  )).map(acceptedSubmissionFromRow);
  const rejectedSubmissionAttempts = (await selectRows(
    client,
    "SELECT * FROM rejected_submission_attempts ORDER BY rejection_id",
  )).map(rejectedSubmissionFromRow);
  const closeSnapshotRows = await selectRows(
    client,
    "SELECT batch_id, submission_fingerprint FROM review_batch_close_submissions ORDER BY batch_id, submission_fingerprint",
  );
  const acceptedByFingerprint = new Map(
    (await selectRows(
      client,
      "SELECT submission_fingerprint, submission FROM review_submissions ORDER BY submission_fingerprint",
    )).map((row) => [
      stringValue(row, "submission_fingerprint"),
      json<ReviewBatchCloseRecord["acceptedSubmissions"][number]>(row.submission),
    ]),
  );
  const acceptedSubmissionsByBatch = new Map<string, ReviewBatchCloseRecord["acceptedSubmissions"]>();
  for (const row of closeSnapshotRows) {
    const batchId = stringValue(row, "batch_id");
    const submissionFingerprint = stringValue(row, "submission_fingerprint");
    const submission = acceptedByFingerprint.get(submissionFingerprint);
    if (submission === undefined) invalidRecord();
    const current = acceptedSubmissionsByBatch.get(batchId) ?? [];
    acceptedSubmissionsByBatch.set(batchId, [...current, submission]);
  }
  const batchCloseRecords = (await selectRows(
    client,
    "SELECT * FROM review_batch_closes ORDER BY batch_id",
  )).map((row) => closeFromRow(row, acceptedSubmissionsByBatch));
  const frozenReviewPools = (await selectRows(
    client,
    "SELECT * FROM frozen_review_pools ORDER BY batch_id",
  )).map(frozenFromRow);
  const agreementEvidence = (await selectRows(
    client,
    "SELECT * FROM community_review_agreement_evidence ORDER BY batch_id",
  )).map(agreementFromRow);
  const disclosures = (await selectRows(
    client,
    "SELECT * FROM community_review_disclosures ORDER BY batch_id, disclosure_version, disclosure_id",
  )).map(disclosureFromRow);
  const evidenceAuditEvents = (await selectRows(
    client,
    "SELECT * FROM community_review_evidence_audit_events ORDER BY occurred_at, event_id",
  )).map(evidenceAuditFromRow);

  return {
    reviewerAccounts,
    reviewerAuthIdentities,
    reviewerConsents,
    authAuditEvents,
    qualificationAuditEvents,
    reviewDeliveryAuditEvents,
    reviewSubmissionAuditEvents,
    qualificationPools,
    qualificationAttempts,
    qualificationReceipts,
    batches,
    sealedBatchPayloadReferences,
    assignments,
    acceptedSubmissions,
    rejectedSubmissionAttempts,
    batchCloseRecords,
    frozenReviewPools,
    agreementEvidence,
    disclosures,
    evidenceAuditEvents,
  };
}

function recordKey<T>(records: readonly T[], key: (record: T) => string): Map<string, T> {
  return new Map(records.map((record) => [key(record), record]));
}

function assertNoDeleted<T>(
  label: string,
  before: readonly T[],
  after: readonly T[],
  key: (record: T) => string,
): void {
  const afterKeys = new Set(after.map(key));
  if (before.some((record) => !afterKeys.has(key(record)))) {
    throw new CommunityReviewServiceError("repository_conflict");
  }
  void label;
}

function changedRecords<T>(
  before: readonly T[],
  after: readonly T[],
  key: (record: T) => string,
): readonly { readonly record: T; readonly previous?: T }[] {
  const previous = recordKey(before, key);
  const changed: Array<{ readonly record: T; readonly previous?: T }> = [];
  for (const record of after) {
    const prior = previous.get(key(record));
    if (prior === undefined || canonicalCommunityReviewJson(prior) !== canonicalCommunityReviewJson(record)) {
      changed.push(prior === undefined ? { record } : { record, previous: prior });
    }
  }
  return changed;
}

function assertImmutable<T>(
  before: readonly T[],
  after: readonly T[],
  key: (record: T) => string,
): void {
  if (changedRecords(before, after, key).some(({ previous }) => previous !== undefined)) {
    throw new CommunityReviewServiceError("repository_conflict");
  }
}

function poolKey(record: QualificationPoolRecord): string {
  return `${record.poolId}\u0000${record.poolVersion}`;
}

function persistableJson(value: unknown): string | null {
  if (value === undefined) return null;
  const serialized = JSON.stringify(value);
  return serialized === undefined ? null : serialized;
}

async function persistAccounts(
  client: PoolClient,
  before: CommunityReviewPersistenceSnapshot,
  after: CommunityReviewPersistenceSnapshot,
): Promise<void> {
  for (const { record, previous } of changedRecords(before.reviewerAccounts, after.reviewerAccounts, (item) => item.internalId)) {
    if (previous === undefined) {
      await client.query(
        `INSERT INTO reviewer_accounts
          (internal_id, reviewer_id, private_auth_subject_reference, status, consent_version,
           consent_state, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [record.internalId, record.reviewerId, record.privateAuthSubjectReference, record.status,
          record.consentVersion, record.consentState, record.createdAt, record.updatedAt],
      );
    } else {
      await client.query(
        `UPDATE reviewer_accounts
            SET private_auth_subject_reference = $2, status = $3, consent_version = $4,
                consent_state = $5, updated_at = $6
          WHERE internal_id = $1`,
        [record.internalId, record.privateAuthSubjectReference, record.status, record.consentVersion,
          record.consentState, record.updatedAt],
      );
    }
  }
  assertImmutable(before.reviewerAuthIdentities, after.reviewerAuthIdentities, (item) => item.authIdentityId);
  for (const record of after.reviewerAuthIdentities) {
    if (before.reviewerAuthIdentities.some((item) => item.authIdentityId === record.authIdentityId)) continue;
    await client.query(
      `INSERT INTO reviewer_auth_identities
        (auth_identity_id, internal_id, reviewer_id, auth_provider, auth_subject, created_at)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [record.authIdentityId, record.internalId, record.reviewerId, record.authProvider,
        record.authSubject, record.createdAt],
    );
  }
  assertImmutable(before.reviewerConsents, after.reviewerConsents, (item) => item.consentEventId);
  for (const record of after.reviewerConsents) {
    if (before.reviewerConsents.some((item) => item.consentEventId === record.consentEventId)) continue;
    await client.query(
      `INSERT INTO reviewer_consent_events
        (consent_event_id, internal_id, reviewer_id, policy_id, policy_version, state,
         accepted_at, revoked_at, recorded_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [record.consentEventId, record.internalId, record.reviewerId, record.policyId, record.policyVersion,
        record.state, record.acceptedAt ?? null, record.revokedAt ?? null, record.recordedAt],
    );
  }
}

async function persistAuthAudits(
  client: PoolClient,
  before: readonly AuthAuditEventRecord[],
  after: readonly AuthAuditEventRecord[],
): Promise<void> {
  assertImmutable(before, after, (item) => item.eventId);
  for (const record of after) {
    if (before.some((item) => item.eventId === record.eventId)) continue;
    await client.query(
      `INSERT INTO reviewer_auth_audit_events
        (event_id, event_type, internal_id, reviewer_id, auth_provider, reason_code, occurred_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [record.eventId, record.eventType, record.internalId ?? null, record.reviewerId ?? null,
        record.authProvider ?? null, record.reasonCode ?? null, record.occurredAt],
    );
  }
}

async function persistPools(
  client: PoolClient,
  before: readonly QualificationPoolRecord[],
  after: readonly QualificationPoolRecord[],
): Promise<void> {
  for (const { record, previous } of changedRecords(before, after, poolKey)) {
    const values = [
      record.poolId,
      record.poolVersion,
      record.qualificationId,
      record.qualificationVersion,
      record.dataKind,
      persistableJson(record.fixture),
      record.definitionFingerprint,
      record.instrumentFingerprint,
      record.reviewLocale,
      record.state,
      record.sealedDefinitionReference,
      record.privateAnswerKeyReference,
      record.createdAt,
      record.updatedAt,
      persistableJson(record.instrument),
      record.visibleTaskSetFingerprint ?? null,
      record.answerKeyCommitment ?? null,
      record.passRuleId ?? null,
      record.stateVersion ?? 0,
      record.sealedAt ?? null,
      record.retiredAt ?? null,
    ];
    if (previous === undefined) {
      await client.query(
        `INSERT INTO qualification_pools
          (pool_id, pool_version, qualification_id, qualification_version, data_kind, fixture,
           definition_fingerprint, instrument_fingerprint, review_locale, state,
           sealed_definition_reference, private_answer_key_reference, created_at, updated_at,
           instrument, visible_task_set_fingerprint, answer_key_commitment, pass_rule_id,
           state_version, sealed_at, retired_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)`,
        values,
      );
    } else {
      await client.query(
        `UPDATE qualification_pools
            SET state = $3, updated_at = $4, instrument = $5,
                visible_task_set_fingerprint = $6, answer_key_commitment = $7,
                pass_rule_id = $8, state_version = $9, sealed_at = $10, retired_at = $11
          WHERE pool_id = $1 AND pool_version = $2`,
        [record.poolId, record.poolVersion, record.state, record.updatedAt,
          persistableJson(record.instrument), record.visibleTaskSetFingerprint ?? null,
          record.answerKeyCommitment ?? null, record.passRuleId ?? null, record.stateVersion ?? 0,
          record.sealedAt ?? null, record.retiredAt ?? null],
      );
    }
  }
}

function attemptKey(record: QualificationAttemptRecord): string {
  return record.attemptId;
}

async function persistAttempts(
  client: PoolClient,
  before: readonly QualificationAttemptRecord[],
  after: readonly QualificationAttemptRecord[],
): Promise<void> {
  for (const { record, previous } of changedRecords(before, after, attemptKey)) {
    const values = [
      record.attemptId,
      record.reviewerId,
      record.poolId,
      record.poolVersion,
      record.nonceHash,
      record.state,
      record.result ?? null,
      record.startedAt,
      record.submittedAt ?? null,
      record.issuedAt ?? null,
      record.evaluatedAt ?? null,
      record.qualificationDefinitionFingerprint ?? null,
      record.instrumentFingerprint ?? null,
      record.reviewLocale ?? null,
      record.packetFingerprint ?? null,
      persistableJson(record.responses),
      record.responseFingerprint ?? null,
      record.evaluationRuleId ?? null,
      record.failureCode ?? null,
    ];
    if (previous === undefined) {
      await client.query(
        `INSERT INTO qualification_attempts
          (attempt_id, reviewer_id, pool_id, pool_version, nonce_hash, state, result, started_at,
           submitted_at, issued_at, evaluated_at, qualification_definition_fingerprint,
           instrument_fingerprint, review_locale, packet_fingerprint, responses,
           response_fingerprint, evaluation_rule_id, failure_code)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)`,
        values,
      );
    } else {
      await client.query(
        `UPDATE qualification_attempts
            SET state = $2, result = $3, submitted_at = $4, issued_at = $5,
                evaluated_at = $6, qualification_definition_fingerprint = $7,
                instrument_fingerprint = $8, review_locale = $9, packet_fingerprint = $10,
                responses = $11, response_fingerprint = $12, evaluation_rule_id = $13,
                failure_code = $14
          WHERE attempt_id = $1`,
        [record.attemptId, record.state, record.result ?? null, record.submittedAt ?? null,
          record.issuedAt ?? null, record.evaluatedAt ?? null, record.qualificationDefinitionFingerprint ?? null,
          record.instrumentFingerprint ?? null, record.reviewLocale ?? null, record.packetFingerprint ?? null,
          persistableJson(record.responses), record.responseFingerprint ?? null,
          record.evaluationRuleId ?? null, record.failureCode ?? null],
      );
    }
  }
}

async function persistReceipts(
  client: PoolClient,
  before: readonly QualificationReceiptRecord[],
  after: readonly QualificationReceiptRecord[],
): Promise<void> {
  assertImmutable(before, after, (item) => item.receiptFingerprint);
  for (const record of after) {
    if (before.some((item) => item.receiptFingerprint === record.receiptFingerprint)) continue;
    await client.query(
      `INSERT INTO qualification_receipts
        (receipt_fingerprint, attempt_id, reviewer_id, pool_id, pool_version, receipt,
         authority_state, issued_at, revoked_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [record.receiptFingerprint, record.attemptId, record.reviewerId, record.poolId, record.poolVersion,
        persistableJson(record.receipt), record.authorityState, record.issuedAt, record.revokedAt ?? null],
    );
  }
}

async function persistBatches(
  client: PoolClient,
  before: readonly ReviewBatchRecord[],
  after: readonly ReviewBatchRecord[],
  states: readonly ReviewBatchRecord["state"][],
): Promise<void> {
  for (const { record, previous } of changedRecords(before, after, (item) => item.batchId)) {
    if (previous !== undefined && !states.includes(record.state)) continue;
    if (previous === undefined) {
      await client.query(
        `INSERT INTO review_batches
          (batch_id, batch_fingerprint, manifest, state, state_version,
           sealed_source_reference, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [record.batchId, record.batchFingerprint, persistableJson(record.manifest), record.state, record.stateVersion,
          record.sealedSourceReference, record.createdAt, record.updatedAt],
      );
    } else {
      await client.query(
        `UPDATE review_batches
            SET manifest = $2, state = $3, state_version = $4, updated_at = $5
          WHERE batch_id = $1 AND state_version = $6`,
        [record.batchId, persistableJson(record.manifest), record.state, record.stateVersion, record.updatedAt,
          previous.stateVersion],
      );
    }
  }
}

async function persistSealedReferences(
  client: PoolClient,
  before: readonly SealedBatchPayloadReferenceRecord[],
  after: readonly SealedBatchPayloadReferenceRecord[],
): Promise<void> {
  assertImmutable(before, after, (item) => item.batchId);
  for (const record of after) {
    if (before.some((item) => item.batchId === record.batchId)) continue;
    await client.query(
      `INSERT INTO sealed_batch_payload_references
        (batch_id, source_reference, visible_task_set_fingerprint, created_at)
       VALUES ($1, $2, $3, $4)`,
      [record.batchId, record.sourceReference, record.visibleTaskSetFingerprint, record.createdAt],
    );
  }
}

async function persistAssignments(
  client: PoolClient,
  before: readonly ReviewAssignmentRecord[],
  after: readonly ReviewAssignmentRecord[],
): Promise<void> {
  for (const { record, previous } of changedRecords(before, after, (item) => item.assignment.assignmentId)) {
    if (previous === undefined) {
      await client.query(
        `INSERT INTO review_assignments
          (assignment_id, batch_id, reviewer_id, assignment, packet, assignment_state,
           assigned_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [record.assignment.assignmentId, record.assignment.batchId, record.assignment.reviewerId,
          persistableJson(record.assignment), persistableJson(record.packet), record.assignment.assignmentState, record.assignedAt,
          record.updatedAt],
      );
    } else {
      await client.query(
        `UPDATE review_assignments
            SET assignment = $4, packet = $5, assignment_state = $6, updated_at = $7
          WHERE assignment_id = $1 AND batch_id = $2 AND reviewer_id = $3`,
        [record.assignment.assignmentId, record.assignment.batchId, record.assignment.reviewerId,
          persistableJson(record.assignment), persistableJson(record.packet), record.assignment.assignmentState, record.updatedAt],
      );
    }
  }
}

async function persistAcceptedSubmissions(
  client: PoolClient,
  before: readonly AcceptedSubmissionRecord[],
  after: readonly AcceptedSubmissionRecord[],
): Promise<void> {
  assertImmutable(before, after, (item) => item.submission.assignmentId);
  for (const record of after) {
    if (before.some((item) => item.submission.assignmentId === record.submission.assignmentId)) continue;
    await client.query(
      `INSERT INTO review_submissions
        (submission_fingerprint, assignment_id, batch_id, reviewer_id, submission, accepted_at)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [record.submission.submissionFingerprint, record.submission.assignmentId, record.submission.batchId,
        record.submission.reviewerId, persistableJson(record.submission), record.acceptedAt],
    );
  }
}

async function persistRejectedSubmissions(
  client: PoolClient,
  before: readonly RejectedSubmissionAttemptRecord[],
  after: readonly RejectedSubmissionAttemptRecord[],
): Promise<void> {
  assertImmutable(before, after, (item) => item.rejectionId);
  for (const record of after) {
    if (before.some((item) => item.rejectionId === record.rejectionId)) continue;
    await client.query(
      `INSERT INTO rejected_submission_attempts
        (rejection_id, batch_id, assignment_id, reviewer_id, reason, payload_fingerprint, attempted_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [record.rejectionId, record.batchId ?? null, record.assignmentId ?? null, record.reviewerId ?? null,
        record.reason, record.payloadFingerprint ?? null, record.attemptedAt],
    );
  }
}

async function persistCloseRecords(
  client: PoolClient,
  before: readonly ReviewBatchCloseRecord[],
  after: readonly ReviewBatchCloseRecord[],
): Promise<void> {
  assertImmutable(before, after, (item) => item.batchId);
  for (const record of after) {
    if (before.some((item) => item.batchId === record.batchId)) continue;
    await client.query(
      `INSERT INTO review_batch_closes
        (batch_id, close_fingerprint, manifest, close_record, created_at)
       VALUES ($1, $2, $3, $4, $5)`,
      [record.batchId, record.closeRecord.closeFingerprint, persistableJson(record.manifest),
        persistableJson(record.closeRecord), record.createdAt],
    );
    for (const submission of record.acceptedSubmissions) {
      await client.query(
        `INSERT INTO review_batch_close_submissions
          (batch_id, submission_fingerprint, assignment_id, reviewer_id)
         VALUES ($1, $2, $3, $4)`,
        [record.batchId, submission.submissionFingerprint, submission.assignmentId, submission.reviewerId],
      );
    }
  }
}

async function persistFrozenPools(
  client: PoolClient,
  before: readonly FrozenReviewPoolRecord[],
  after: readonly FrozenReviewPoolRecord[],
): Promise<void> {
  assertImmutable(before, after, (item) => item.batchId);
  for (const record of after) {
    if (before.some((item) => item.batchId === record.batchId)) continue;
    await client.query(
      `INSERT INTO frozen_review_pools
        (batch_id, freeze_fingerprint, frozen_pool, created_at)
       VALUES ($1, $2, $3, $4)`,
      [record.batchId, record.frozenPool.freezeFingerprint, persistableJson(record.frozenPool), record.createdAt],
    );
  }
}

async function persistAgreementEvidence(
  client: PoolClient,
  before: readonly CommunityReviewAgreementEvidenceRecord[],
  after: readonly CommunityReviewAgreementEvidenceRecord[],
): Promise<void> {
  assertImmutable(before, after, (item) => item.batchId);
  for (const record of after) {
    if (before.some((item) => item.batchId === record.batchId)) continue;
    await client.query(
      `INSERT INTO community_review_agreement_evidence
        (batch_id, freeze_fingerprint, evidence_persistence_fingerprint, evidence, created_at)
       VALUES ($1, $2, $3, $4, $5)`,
      [record.batchId, record.freezeFingerprint, record.evidencePersistenceFingerprint, persistableJson(record.evidence),
        record.createdAt],
    );
  }
}

async function persistDisclosures(
  client: PoolClient,
  before: readonly CommunityReviewDisclosureRecord[],
  after: readonly CommunityReviewDisclosureRecord[],
): Promise<void> {
  assertImmutable(before, after, (item) => item.disclosureId);
  for (const record of after) {
    if (before.some((item) => item.disclosureId === record.disclosureId)) continue;
    await client.query(
      `INSERT INTO community_review_disclosures
        (disclosure_id, batch_id, freeze_fingerprint, agreement_evidence_persistence_fingerprint,
         disclosure_version, mode, disclosure_policy, disclosure_date, public_artifact,
         public_artifact_fingerprint, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [record.disclosureId, record.batchId, record.freezeFingerprint,
        record.agreementEvidencePersistenceFingerprint, record.disclosureVersion, record.mode,
        persistableJson(record.disclosurePolicy), record.disclosureDate ?? null,
        persistableJson(record.publicArtifact),
        record.publicArtifactFingerprint ?? null, record.createdAt],
    );
  }
}

async function persistAuditRows(
  client: PoolClient,
  before: CommunityReviewPersistenceSnapshot,
  after: CommunityReviewPersistenceSnapshot,
): Promise<void> {
  assertImmutable(before.qualificationAuditEvents, after.qualificationAuditEvents, (item) => item.eventId);
  for (const record of after.qualificationAuditEvents) {
    if (before.qualificationAuditEvents.some((item) => item.eventId === record.eventId)) continue;
    await client.query(
      `INSERT INTO qualification_authority_audit_events
        (event_id, event_type, reviewer_id, attempt_id, pool_id, pool_version, reason_code, occurred_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [record.eventId, record.eventType, record.reviewerId ?? null, record.attemptId ?? null,
        record.poolId ?? null, record.poolVersion ?? null, record.reasonCode ?? null, record.occurredAt],
    );
  }
  assertImmutable(before.reviewDeliveryAuditEvents, after.reviewDeliveryAuditEvents, (item) => item.eventId);
  for (const record of after.reviewDeliveryAuditEvents) {
    if (before.reviewDeliveryAuditEvents.some((item) => item.eventId === record.eventId)) continue;
    await client.query(
      `INSERT INTO review_delivery_audit_events
        (event_id, event_type, batch_id, assignment_id, reviewer_id, reason_code, occurred_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [record.eventId, record.eventType, record.batchId ?? null, record.assignmentId ?? null,
        record.reviewerId ?? null, record.reasonCode ?? null, record.occurredAt],
    );
  }
  assertImmutable(before.reviewSubmissionAuditEvents, after.reviewSubmissionAuditEvents, (item) => item.eventId);
  for (const record of after.reviewSubmissionAuditEvents) {
    if (before.reviewSubmissionAuditEvents.some((item) => item.eventId === record.eventId)) continue;
    await client.query(
      `INSERT INTO review_submission_audit_events
        (event_id, event_type, batch_id, assignment_id, reviewer_id, submission_fingerprint, occurred_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [record.eventId, record.eventType, record.batchId, record.assignmentId, record.reviewerId,
        record.submissionFingerprint, record.occurredAt],
    );
  }
  assertImmutable(before.evidenceAuditEvents, after.evidenceAuditEvents, (item) => item.eventId);
  for (const record of after.evidenceAuditEvents) {
    if (before.evidenceAuditEvents.some((item) => item.eventId === record.eventId)) continue;
    await client.query(
      `INSERT INTO community_review_evidence_audit_events
        (event_id, event_type, batch_id, freeze_fingerprint,
         agreement_evidence_persistence_fingerprint, disclosure_id, disclosure_version,
         disclosure_mode, disclosure_policy, reason_code, occurred_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [record.eventId, record.eventType, record.batchId, record.freezeFingerprint ?? null,
        record.agreementEvidencePersistenceFingerprint ?? null, record.disclosureId ?? null,
        record.disclosureVersion ?? null, record.disclosureMode ?? null, persistableJson(record.disclosurePolicy),
        record.reasonCode ?? null, record.occurredAt],
    );
  }
}

export async function persistPersistenceSnapshot(
  client: PoolClient,
  before: CommunityReviewPersistenceSnapshot,
  after: CommunityReviewPersistenceSnapshot,
): Promise<void> {
  assertNoDeleted("reviewer accounts", before.reviewerAccounts, after.reviewerAccounts, (item) => item.internalId);
  assertNoDeleted("auth identities", before.reviewerAuthIdentities, after.reviewerAuthIdentities, (item) => item.authIdentityId);
  assertNoDeleted("consents", before.reviewerConsents, after.reviewerConsents, (item) => item.consentEventId);
  assertNoDeleted("auth audits", before.authAuditEvents, after.authAuditEvents, (item) => item.eventId);
  assertNoDeleted("qualification audits", before.qualificationAuditEvents, after.qualificationAuditEvents, (item) => item.eventId);
  assertNoDeleted("delivery audits", before.reviewDeliveryAuditEvents, after.reviewDeliveryAuditEvents, (item) => item.eventId);
  assertNoDeleted("submission audits", before.reviewSubmissionAuditEvents, after.reviewSubmissionAuditEvents, (item) => item.eventId);
  assertNoDeleted("qualification pools", before.qualificationPools, after.qualificationPools, poolKey);
  assertNoDeleted("qualification attempts", before.qualificationAttempts, after.qualificationAttempts, attemptKey);
  assertNoDeleted("qualification receipts", before.qualificationReceipts, after.qualificationReceipts, (item) => item.receiptFingerprint);
  assertNoDeleted("batches", before.batches, after.batches, (item) => item.batchId);
  assertNoDeleted("sealed references", before.sealedBatchPayloadReferences, after.sealedBatchPayloadReferences, (item) => item.batchId);
  assertNoDeleted("assignments", before.assignments, after.assignments, (item) => item.assignment.assignmentId);
  assertNoDeleted("accepted submissions", before.acceptedSubmissions, after.acceptedSubmissions, (item) => item.submission.assignmentId);
  assertNoDeleted("rejected submissions", before.rejectedSubmissionAttempts, after.rejectedSubmissionAttempts, (item) => item.rejectionId);
  assertNoDeleted("close records", before.batchCloseRecords, after.batchCloseRecords, (item) => item.batchId);
  assertNoDeleted("frozen pools", before.frozenReviewPools, after.frozenReviewPools, (item) => item.batchId);
  assertNoDeleted("agreement evidence", before.agreementEvidence, after.agreementEvidence, (item) => item.batchId);
  assertNoDeleted("disclosures", before.disclosures, after.disclosures, (item) => item.disclosureId);
  assertNoDeleted("evidence audits", before.evidenceAuditEvents, after.evidenceAuditEvents, (item) => item.eventId);

  await persistAccounts(client, before, after);
  await persistAuthAudits(client, before.authAuditEvents, after.authAuditEvents);
  await persistPools(client, before.qualificationPools, after.qualificationPools);
  await persistAttempts(client, before.qualificationAttempts, after.qualificationAttempts);
  await persistReceipts(client, before.qualificationReceipts, after.qualificationReceipts);
  await persistBatches(client, before.batches, after.batches, ["SEALED", "OPEN"]);
  await persistSealedReferences(client, before.sealedBatchPayloadReferences, after.sealedBatchPayloadReferences);
  await persistAssignments(client, before.assignments, after.assignments);
  await persistAcceptedSubmissions(client, before.acceptedSubmissions, after.acceptedSubmissions);
  await persistRejectedSubmissions(client, before.rejectedSubmissionAttempts, after.rejectedSubmissionAttempts);
  await persistCloseRecords(client, before.batchCloseRecords, after.batchCloseRecords);
  // The SQL authority triggers require the close snapshot before OPEN ->
  // CLOSED, and a CLOSED batch before the frozen pool can be inserted.
  await persistBatches(client, before.batches, after.batches, ["CLOSED"]);
  await persistFrozenPools(client, before.frozenReviewPools, after.frozenReviewPools);
  await persistBatches(client, before.batches, after.batches, ["FROZEN"]);
  await persistAgreementEvidence(client, before.agreementEvidence, after.agreementEvidence);
  await persistDisclosures(client, before.disclosures, after.disclosures);
  await persistAuditRows(client, before, after);
}
