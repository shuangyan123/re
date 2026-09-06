import { randomBytes } from "node:crypto";

import {
  buildCommunityReviewAssignment,
  buildCommunityReviewReviewerPacket,
  buildCommunityReviewSubmission,
  closeCommunityReviewBatch,
  freezeCommunityReviewPool,
  openCommunityReviewBatch,
  withdrawCommunityReviewAssignment,
} from "../../../src/community-review/index.js";
import {
  parseCommunityReviewBatchManifest,
  parseCommunityReviewQualificationReceipt,
} from "../../../src/contracts/community-review-validation.js";
import type {
  CommunityReviewAssignment,
  CommunityReviewBatchCloseResult,
  CommunityReviewDataKind,
  CommunityReviewQualificationReceipt,
  CommunityReviewReviewerPacket,
  CommunityReviewSubmission,
  CommunityReviewSyntheticFixtureMarker,
  CommunityReviewVisibleTask,
  FrozenCommunityReviewPool,
} from "../../../src/contracts/community-review.js";
import { canonicalCommunityReviewJson } from "../../../src/community-review/fingerprint.js";
import { parseAuthenticationContext } from "./authentication.js";
import type { AuthenticatedPrincipal } from "./authentication.js";
import { CommunityReviewServiceError } from "./errors.js";
import type {
  AcceptedSubmissionRecord,
  AuthAuditEventType,
  CommunityReviewPersistence,
  CommunityReviewPersistenceTransaction,
  FrozenReviewPoolRecord,
  QualificationPoolRecord,
  QualificationReceiptRecord,
  ReviewerAuthIdentityRecord,
  ReviewerAccountRecord,
  ReviewerConsentRecord,
  ReviewerConsentState,
  ReviewAssignmentRecord,
  ReviewBatchRecord,
  SealedBatchPayloadReferenceRecord,
} from "./persistence.js";

const opaqueIdPattern = /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/u;
const fingerprintPattern = /^sha256:[0-9a-f]{64}$/u;

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

export interface CommunityReviewServiceOptions {
  readonly clock?: () => string;
  readonly consentPolicy?: ReviewerConsentPolicy;
  readonly reviewerIdGenerator?: OpaqueIdGenerator;
  readonly internalIdGenerator?: OpaqueIdGenerator;
  readonly authIdentityIdGenerator?: OpaqueIdGenerator;
  readonly consentEventIdGenerator?: OpaqueIdGenerator;
  readonly auditEventIdGenerator?: OpaqueIdGenerator;
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
  readonly state?: QualificationPoolRecord["state"];
  readonly sealedDefinitionReference: string;
  readonly privateAnswerKeyReference: string;
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
  readonly batchId: string;
  readonly reviewerId: string;
  readonly qualificationReceipt: unknown;
  readonly visibleTasks: readonly CommunityReviewVisibleTask[];
}

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
  readonly annotations: readonly unknown[];
}

export interface WithdrawCommunityReviewAssignmentInput {
  readonly batchId: string;
  readonly assignmentId: string;
  readonly reviewerId: string;
}

/**
 * P4 service boundary. This class owns private account/consent authority and
 * transaction ordering; all protocol semantics remain in existing P3 pure
 * functions.
 */
export class CommunityReviewService {
  private readonly now: () => string;
  private readonly consentPolicy: ReviewerConsentPolicy;
  private readonly reviewerIdGenerator: OpaqueIdGenerator;
  private readonly internalIdGenerator: OpaqueIdGenerator;
  private readonly authIdentityIdGenerator: OpaqueIdGenerator;
  private readonly consentEventIdGenerator: OpaqueIdGenerator;
  private readonly auditEventIdGenerator: OpaqueIdGenerator;

  constructor(
    private readonly persistence: CommunityReviewPersistence,
    options: CommunityReviewServiceOptions = {},
  ) {
    this.now = options.clock ?? (() => new Date().toISOString());
    this.consentPolicy = options.consentPolicy ?? DEFAULT_REVIEWER_CONSENT_POLICY;
    validPolicy(this.consentPolicy);
    this.reviewerIdGenerator = options.reviewerIdGenerator ?? randomOpaqueId;
    this.internalIdGenerator = options.internalIdGenerator ?? randomOpaqueId;
    this.authIdentityIdGenerator = options.authIdentityIdGenerator ?? randomOpaqueId;
    this.consentEventIdGenerator = options.consentEventIdGenerator ?? randomOpaqueId;
    this.auditEventIdGenerator = options.auditEventIdGenerator ?? randomOpaqueId;
  }

  getReviewerConsentPolicy(): ReviewerConsentPolicy {
    return this.consentPolicy;
  }

  private nextId(generator: OpaqueIdGenerator): string {
    const value = generator();
    opaqueId(value);
    return value;
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
    const principal = parseAuthenticationContext({ principal: input.principal }).principal;
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
    });
  }

  /** Trusted migration/setup boundary for an existing P4-A account. */
  async linkReviewerAuthIdentity(
    input: LinkReviewerAuthIdentityInput,
  ): Promise<ReviewerAuthIdentityRecord> {
    opaqueId(input.reviewerId);
    const principal = parseAuthenticationContext({ principal: input.principal }).principal;
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
    const principal = parseAuthenticationContext({ principal: input.principal }).principal;
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
    const principal = parseAuthenticationContext({ principal: input.principal }).principal;
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

  /** Trusted setup boundary for a sealed or synthetic qualification pool. */
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
    const timestamp = this.now();
    const expected = {
      dataKind: input.dataKind,
      ...(input.fixture === undefined ? {} : { fixture: input.fixture }),
      qualificationId: input.qualificationId,
      qualificationVersion: input.qualificationVersion,
      poolId: input.poolId,
      poolVersion: input.poolVersion,
      definitionFingerprint: input.definitionFingerprint,
      instrumentFingerprint: input.instrumentFingerprint,
      reviewLocale: input.reviewLocale,
      state: input.state ?? "OPEN" as const,
      sealedDefinitionReference: input.sealedDefinitionReference,
      privateAnswerKeyReference: input.privateAnswerKeyReference,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    return this.persistence.transaction((transaction) => {
      const existing = transaction.getQualificationPool(input.poolId, input.poolVersion);
      if (existing !== undefined) {
        if (same({ ...existing, createdAt: undefined, updatedAt: undefined }, {
          ...expected,
          createdAt: undefined,
          updatedAt: undefined,
        })) return existing;
        throw new CommunityReviewServiceError("repository_conflict");
      }
      return transaction.insertQualificationPool(expected);
    });
  }

  /**
   * Registers an issuer-produced P3 receipt only after a qualified attempt is
   * already persisted. This method never creates a receipt from JSON.
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

  async assignReviewer(
    input: AssignCommunityReviewReviewerInput,
  ): Promise<CommunityReviewAssignmentResult> {
    opaqueId(input.reviewerId);
    const receipt = parseReceipt(input.qualificationReceipt);
    return this.persistence.transaction((transaction) => {
      const batch = batchOrThrow(transaction, input.batchId);
      if (batch.state !== "OPEN") throw new CommunityReviewServiceError("batch_not_open");
      this.activeReviewerAccount(transaction, input.reviewerId);
      const authoritative = authoritativeReceipt(transaction, receipt);
      if (authoritative.reviewerId !== input.reviewerId) {
        throw new CommunityReviewServiceError("reviewer_not_authorized");
      }
      const assignment = buildCommunityReviewAssignment({
        manifest: batch.manifest,
        reviewerId: input.reviewerId,
        qualificationReceipt: authoritative,
        tasks: input.visibleTasks,
      });
      const packet = buildCommunityReviewReviewerPacket(assignment, input.visibleTasks);
      const existing = transaction.getAssignmentByBatchReviewer(input.batchId, input.reviewerId);
      if (existing !== undefined) {
        if (same(existing.assignment, assignment) && same(existing.packet, packet)) {
          return { assignment: existing.assignment, packet: existing.packet };
        }
        throw new CommunityReviewServiceError("duplicate_assignment");
      }
      const timestamp = this.now();
      const stored = transaction.insertAssignment({
        assignment,
        packet,
        assignedAt: timestamp,
        updatedAt: timestamp,
      });
      return { assignment: stored.assignment, packet: stored.packet };
    });
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
      return stored.packet;
    });
  }

  async submitReview(input: SubmitCommunityReviewInput): Promise<CommunityReviewSubmission> {
    opaqueId(input.reviewerId);
    return this.persistence.transaction((transaction) => {
      const batch = batchOrThrow(transaction, input.batchId);
      if (batch.state !== "OPEN") throw new CommunityReviewServiceError("batch_not_open");
      const storedAssignment = assignmentOrThrow(transaction, input.assignmentId);
      const assignment = storedAssignment.assignment;
      if (assignment.batchId !== input.batchId || assignment.reviewerId !== input.reviewerId) {
        throw new CommunityReviewServiceError("reviewer_not_authorized");
      }
      this.activeReviewerAccount(transaction, input.reviewerId);
      if (assignment.assignmentState !== "assigned") {
        throw new CommunityReviewServiceError("assignment_withdrawn");
      }
      const receipt = transaction.getQualificationReceipt(assignment.qualificationReceiptFingerprint);
      if (receipt === undefined || receipt.authorityState !== "authoritative") {
        throw new CommunityReviewServiceError("qualification_receipt_not_authoritative");
      }
      authoritativeReceipt(transaction, receipt.receipt);
      const submission = buildCommunityReviewSubmission(storedAssignment.packet, input.annotations);
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
      return transaction.insertAcceptedSubmission(accepted).submission;
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
      return transaction.updateAssignment({
        ...stored,
        assignment,
        updatedAt: this.now(),
      }).assignment;
    });
  }

  async closeBatch(batchId: string): Promise<CommunityReviewBatchCloseResult> {
    required(batchId);
    return this.persistence.transaction((transaction) => {
      const batch = batchOrThrow(transaction, batchId);
      if (batch.state === "CLOSED" || batch.state === "FROZEN") {
        const storedClose = transaction.getBatchCloseRecord(batchId);
        if (storedClose === undefined) throw new CommunityReviewServiceError("invalid_service_record");
        return {
          manifest: storedClose.manifest,
          closeRecord: storedClose.closeRecord,
          acceptedSubmissions: transaction.listAcceptedSubmissions(batchId).map((item) => item.submission),
        };
      }
      if (batch.state !== "OPEN") throw new CommunityReviewServiceError("batch_not_open");
      const result = closeCommunityReviewBatch(
        batch.manifest,
        transaction.listAssignments(batchId).map((item) => item.assignment),
        transaction.listAcceptedSubmissions(batchId).map((item) => item.submission),
      );
      transaction.insertBatchCloseRecord({
        batchId,
        manifest: result.manifest,
        closeRecord: result.closeRecord,
        createdAt: this.now(),
      });
      transaction.updateBatch({
        ...batch,
        manifest: result.manifest,
        state: result.manifest.state,
        stateVersion: batch.stateVersion + 1,
        updatedAt: this.now(),
      });
      return result;
    });
  }

  async freezeBatch(batchId: string): Promise<FrozenCommunityReviewPool> {
    required(batchId);
    return this.persistence.transaction((transaction) => {
      const batch = batchOrThrow(transaction, batchId);
      if (batch.state === "FROZEN") {
        const frozen = transaction.getFrozenReviewPool(batchId);
        if (frozen === undefined) throw new CommunityReviewServiceError("invalid_service_record");
        return frozen.frozenPool;
      }
      if (batch.state !== "CLOSED") throw new CommunityReviewServiceError("batch_not_closed");
      const storedClose = transaction.getBatchCloseRecord(batchId);
      if (storedClose === undefined) throw new CommunityReviewServiceError("invalid_service_record");
      const pool = freezeCommunityReviewPool({
        manifest: batch.manifest,
        closeRecord: storedClose.closeRecord,
        acceptedSubmissions: transaction.listAcceptedSubmissions(batchId).map((item) => item.submission),
      });
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
      return stored.frozenPool;
    });
  }
}
