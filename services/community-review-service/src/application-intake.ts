import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

import {
  COMMUNITY_REVIEW_APPLICATION_CONTRACT_ID,
  COMMUNITY_REVIEW_APPLICATION_CONTRACT_VERSION,
  COMMUNITY_REVIEW_APPLICATION_DEFAULT_INTAKE_STATE,
  COMMUNITY_REVIEW_APPLICATION_KIND,
  COMMUNITY_REVIEW_APPLICATION_NOTICE_VERSION,
  COMMUNITY_REVIEW_APPLICATION_SCHEMA_VERSION,
  type CommunityReviewApplication,
  type CommunityReviewApplicationDecision,
  type CommunityReviewApplicationIntakeState,
} from "../../../src/contracts/community-review-application.js";
import { parseCommunityReviewApplication } from "../../../src/contracts/community-review-application-validation.js";
import { communityReviewFingerprint } from "../../../src/community-review/fingerprint.js";
import type {
  AuthenticationAdapter,
  AuthenticationContext,
  OperatorAuthorizer,
} from "./authentication.js";
import { parseAuthenticationContext } from "./authentication.js";
import { CommunityReviewServiceError } from "./errors.js";
import type {
  CommunityReviewApplicationAuditEventRecord,
  CommunityReviewApplicationContactRecord,
  CommunityReviewApplicationIdempotencyRecord,
  CommunityReviewApplicationRecord,
  CommunityReviewApplicationLifecycle,
  CommunityReviewPersistence,
  CommunityReviewPersistenceTransaction,
} from "./persistence.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const APPLICATION_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/u;
const IDEMPOTENCY_KEY_PATTERN = /^[\x21-\x7e]{1,128}$/u;

export const COMMUNITY_REVIEW_APPLICATION_PENDING_RETENTION_DAYS = 90;
export const COMMUNITY_REVIEW_APPLICATION_DECISION_RETENTION_DAYS = 30;

export interface CommunityReviewApplicationRetentionPolicy {
  readonly pendingRetentionMs?: number;
  readonly decisionRetentionMs?: number;
}

export interface ApplicationSubmissionRateLimiterOptions {
  readonly maximumRequests: number;
  readonly windowMs: number;
  readonly maximumEntries?: number;
  readonly clock?: () => number;
}

interface RateLimitEntry {
  readonly windowStartedAt: number;
  readonly count: number;
  readonly lastSeenAt: number;
}

/**
 * Bounded transient abuse control. The source key is never persisted or
 * logged; production edge/CDN controls remain a separate launch concern.
 */
export class ApplicationSubmissionRateLimiter {
  private readonly entries = new Map<string, RateLimitEntry>();
  private readonly maximumEntries: number;
  private readonly clock: () => number;

  constructor(private readonly options: ApplicationSubmissionRateLimiterOptions) {
    if (!Number.isSafeInteger(options.maximumRequests) || options.maximumRequests < 1 ||
      !Number.isSafeInteger(options.windowMs) || options.windowMs < 1) {
      throw new CommunityReviewServiceError("invalid_service_record");
    }
    this.maximumEntries = options.maximumEntries ?? 10_000;
    if (!Number.isSafeInteger(this.maximumEntries) || this.maximumEntries < 1) {
      throw new CommunityReviewServiceError("invalid_service_record");
    }
    this.clock = options.clock ?? Date.now;
  }

  assertAllowed(sourceKey: string): void {
    const now = this.clock();
    for (const [key, entry] of this.entries) {
      if (now - entry.windowStartedAt >= this.options.windowMs) this.entries.delete(key);
    }
    const boundedSourceKey = sourceKey.length > 256 ? sourceKey.slice(0, 256) : sourceKey;
    const current = this.entries.get(boundedSourceKey);
    if (current === undefined) {
      if (this.entries.size >= this.maximumEntries) this.evictOldest();
      this.entries.set(boundedSourceKey, {
        windowStartedAt: now,
        count: 1,
        lastSeenAt: now,
      });
      return;
    }
    if (current.count >= this.options.maximumRequests) {
      throw new CommunityReviewServiceError("application_rate_limited");
    }
    this.entries.set(boundedSourceKey, {
      windowStartedAt: current.windowStartedAt,
      count: current.count + 1,
      lastSeenAt: now,
    });
  }

  get size(): number {
    return this.entries.size;
  }

  private evictOldest(): void {
    let oldestKey: string | undefined;
    let oldestSeenAt = Number.POSITIVE_INFINITY;
    for (const [key, entry] of this.entries) {
      if (entry.lastSeenAt < oldestSeenAt) {
        oldestKey = key;
        oldestSeenAt = entry.lastSeenAt;
      }
    }
    if (oldestKey !== undefined) this.entries.delete(oldestKey);
  }
}

export interface CommunityReviewApplicationIntakeServiceOptions {
  readonly intakeState?: CommunityReviewApplicationIntakeState;
  readonly clock?: () => string;
  readonly applicationIdGenerator?: () => string;
  readonly withdrawalCredentialGenerator?: () => string;
  readonly auditEventIdGenerator?: () => string;
  readonly retention?: CommunityReviewApplicationRetentionPolicy;
  readonly rateLimiter?: ApplicationSubmissionRateLimiter;
}

export interface CommunityReviewApplicationReceipt {
  readonly applicationId: string;
  readonly contractId: typeof COMMUNITY_REVIEW_APPLICATION_CONTRACT_ID;
  readonly contractVersion: typeof COMMUNITY_REVIEW_APPLICATION_CONTRACT_VERSION;
  readonly noticeVersion: typeof COMMUNITY_REVIEW_APPLICATION_NOTICE_VERSION;
  readonly receivedAt: string;
  readonly status: "PENDING";
  /** Returned only on the first successful response. */
  readonly withdrawalCredential?: string;
}

export interface CommunityReviewApplicationSubmissionResult {
  readonly receipt: CommunityReviewApplicationReceipt;
  readonly created: boolean;
}

export interface CommunityReviewApplicationOperatorSummary {
  readonly applicationId: string;
  readonly contractId: string;
  readonly contractVersion: string;
  readonly noticeVersion: string;
  readonly submittedLocale: CommunityReviewApplicationRecord["submittedLocale"];
  readonly preferredReviewLocale: CommunityReviewApplicationRecord["preferredReviewLocale"];
  readonly availability: CommunityReviewApplicationRecord["availability"];
  readonly decision: CommunityReviewApplicationRecord["decision"];
  readonly lifecycle: CommunityReviewApplicationLifecycle;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly decisionAt?: string;
  readonly retentionExpiresAt: string;
}

export interface CommunityReviewApplicationOperatorDetail extends CommunityReviewApplicationOperatorSummary {
  readonly motivation?: string;
  readonly experienceSummary?: string;
  readonly contact?: CommunityReviewApplicationContactRecord;
  readonly withdrawnAt?: string;
  readonly purgedAt?: string;
}

export interface CommunityReviewApplicationWithdrawalResult {
  readonly applicationId: string;
  readonly lifecycle: Extract<CommunityReviewApplicationLifecycle, "WITHDRAWN" | "PURGED">;
  readonly withdrawnAt?: string;
}

export interface CommunityReviewApplicationPurgeResult {
  readonly purgedApplicationIds: readonly string[];
  readonly asOf: string;
}

function randomApplicationId(): string {
  return randomBytes(32).toString("hex");
}

function randomWithdrawalCredential(): string {
  return randomBytes(32).toString("base64url");
}

function digest(value: string): string {
  return `sha256:${createHash("sha256").update(value, "utf8").digest("hex")}`;
}

function validTimestamp(value: string): boolean {
  return typeof value === "string" && !Number.isNaN(new Date(value).getTime());
}

function timestampOrThrow(value: string): string {
  if (!validTimestamp(value)) throw new CommunityReviewServiceError("application_retention_invalid");
  return new Date(value).toISOString();
}

function addMilliseconds(timestamp: string, milliseconds: number): string {
  const value = new Date(timestamp).getTime();
  if (!Number.isSafeInteger(value) || !Number.isSafeInteger(milliseconds) || milliseconds < 1 ||
    value > Number.MAX_SAFE_INTEGER - milliseconds) {
    throw new CommunityReviewServiceError("application_retention_invalid");
  }
  return new Date(value + milliseconds).toISOString();
}

function assertApplicationId(value: string): void {
  if (typeof value !== "string" || !APPLICATION_ID_PATTERN.test(value) || value.includes("@")) {
    throw new CommunityReviewServiceError("application_not_found");
  }
}

function assertIdempotencyKey(value: string): void {
  if (typeof value !== "string" || !IDEMPOTENCY_KEY_PATTERN.test(value) || value.trim() !== value) {
    throw new CommunityReviewServiceError("application_idempotency_invalid");
  }
}

function assertWithdrawalCredential(value: string): void {
  if (typeof value !== "string" || value.length < 32 || value.length > 512 ||
    value.includes("\u0000") || value.trim() !== value) {
    throw new CommunityReviewServiceError("application_withdrawal_not_authorized");
  }
}

function equalDigest(left: string, right: string): boolean {
  const leftBytes = Buffer.from(left, "utf8");
  const rightBytes = Buffer.from(right, "utf8");
  return leftBytes.length === rightBytes.length && timingSafeEqual(leftBytes, rightBytes);
}

function parseApplication(value: unknown): CommunityReviewApplication {
  try {
    return parseCommunityReviewApplication(value);
  } catch {
    throw new CommunityReviewServiceError("application_contract_invalid");
  }
}

function applicationRequestFingerprint(application: CommunityReviewApplication): string {
  return communityReviewFingerprint({
    kind: "community-review-application-request",
    application,
  });
}

function idempotencyKeyFingerprint(key: string): string {
  return communityReviewFingerprint({
    kind: "community-review-application-idempotency-key",
    key,
  });
}

function applicationSummary(record: CommunityReviewApplicationRecord): CommunityReviewApplicationOperatorSummary {
  return {
    applicationId: record.applicationId,
    contractId: record.contractId,
    contractVersion: record.contractVersion,
    noticeVersion: record.noticeVersion,
    submittedLocale: record.submittedLocale,
    preferredReviewLocale: record.preferredReviewLocale,
    availability: record.availability,
    decision: record.decision,
    lifecycle: record.lifecycle,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    ...(record.decisionAt === undefined ? {} : { decisionAt: record.decisionAt }),
    retentionExpiresAt: record.retentionExpiresAt,
  };
}

function applicationDetail(
  record: CommunityReviewApplicationRecord,
  contact: CommunityReviewApplicationContactRecord | undefined,
): CommunityReviewApplicationOperatorDetail {
  return {
    ...applicationSummary(record),
    ...(record.motivation === undefined ? {} : { motivation: record.motivation }),
    ...(record.experienceSummary === undefined ? {} : { experienceSummary: record.experienceSummary }),
    ...(contact === undefined ? {} : { contact }),
    ...(record.withdrawnAt === undefined ? {} : { withdrawnAt: record.withdrawnAt }),
    ...(record.purgedAt === undefined ? {} : { purgedAt: record.purgedAt }),
  };
}

function applicationNotFound(): never {
  throw new CommunityReviewServiceError("application_not_found");
}

function applicationRecordOrThrow(
  transaction: CommunityReviewPersistenceTransaction,
  applicationId: string,
): CommunityReviewApplicationRecord {
  const record = transaction.getCommunityReviewApplication(applicationId);
  return record === undefined ? applicationNotFound() : record;
}

function assertRetentionPolicy(policy: Required<CommunityReviewApplicationRetentionPolicy>): void {
  if (!Number.isSafeInteger(policy.pendingRetentionMs) || policy.pendingRetentionMs < DAY_MS ||
    !Number.isSafeInteger(policy.decisionRetentionMs) || policy.decisionRetentionMs < DAY_MS) {
    throw new CommunityReviewServiceError("application_retention_invalid");
  }
}

export class CommunityReviewApplicationIntakeService {
  private readonly intakeState: CommunityReviewApplicationIntakeState;
  private readonly now: () => string;
  private readonly applicationIdGenerator: () => string;
  private readonly withdrawalCredentialGenerator: () => string;
  private readonly auditEventIdGenerator: () => string;
  private readonly retention: Required<CommunityReviewApplicationRetentionPolicy>;
  private readonly rateLimiter: ApplicationSubmissionRateLimiter;

  constructor(
    private readonly persistence: CommunityReviewPersistence,
    options: CommunityReviewApplicationIntakeServiceOptions = {},
  ) {
    this.intakeState = options.intakeState ?? COMMUNITY_REVIEW_APPLICATION_DEFAULT_INTAKE_STATE;
    if (!new Set<CommunityReviewApplicationIntakeState>(["CLOSED", "OPEN", "PAUSED"]).has(this.intakeState)) {
      throw new CommunityReviewServiceError("invalid_service_record");
    }
    this.now = options.clock ?? (() => new Date().toISOString());
    this.applicationIdGenerator = options.applicationIdGenerator ?? randomApplicationId;
    this.withdrawalCredentialGenerator = options.withdrawalCredentialGenerator ?? randomWithdrawalCredential;
    this.auditEventIdGenerator = options.auditEventIdGenerator ?? randomApplicationId;
    this.retention = {
      pendingRetentionMs: options.retention?.pendingRetentionMs ??
        COMMUNITY_REVIEW_APPLICATION_PENDING_RETENTION_DAYS * DAY_MS,
      decisionRetentionMs: options.retention?.decisionRetentionMs ??
        COMMUNITY_REVIEW_APPLICATION_DECISION_RETENTION_DAYS * DAY_MS,
    };
    assertRetentionPolicy(this.retention);
    this.rateLimiter = options.rateLimiter ?? new ApplicationSubmissionRateLimiter({
      maximumRequests: 30,
      windowMs: 60_000,
    });
  }

  getApplicationIntakeState(): CommunityReviewApplicationIntakeState {
    return this.intakeState;
  }

  acceptsNewApplications(): boolean {
    return this.intakeState === "OPEN";
  }

  async submitApplication(input: {
    readonly application: unknown;
    readonly idempotencyKey: string;
    readonly sourceKey?: string;
  }): Promise<CommunityReviewApplicationSubmissionResult> {
    if (this.intakeState === "CLOSED") throw new CommunityReviewServiceError("application_intake_closed");
    if (this.intakeState === "PAUSED") throw new CommunityReviewServiceError("application_intake_paused");
    assertIdempotencyKey(input.idempotencyKey);
    const application = parseApplication(input.application);
    const requestFingerprint = applicationRequestFingerprint(application);
    const keyFingerprint = idempotencyKeyFingerprint(input.idempotencyKey);

    return this.persistence.transaction((transaction) => {
      const existing = transaction.getCommunityReviewApplicationIdempotency(keyFingerprint);
      if (existing !== undefined) {
        if (existing.requestFingerprint !== requestFingerprint) {
          throw new CommunityReviewServiceError("application_idempotency_conflict");
        }
        const stored = applicationRecordOrThrow(transaction, existing.applicationId);
        return {
          created: false,
          receipt: {
            applicationId: stored.applicationId,
            contractId: existing.contractId as typeof COMMUNITY_REVIEW_APPLICATION_CONTRACT_ID,
            contractVersion: existing.contractVersion as typeof COMMUNITY_REVIEW_APPLICATION_CONTRACT_VERSION,
            noticeVersion: existing.noticeVersion as typeof COMMUNITY_REVIEW_APPLICATION_NOTICE_VERSION,
            receivedAt: existing.receivedAt,
            status: "PENDING" as const,
          },
        };
      }

      // Idempotent retries are safe reads and must not be rejected merely
      // because the caller exhausted the new-submission rate window.
      this.rateLimiter.assertAllowed(input.sourceKey ?? "unknown");

      let applicationId: string | undefined;
      for (let attempt = 0; attempt < 8 && applicationId === undefined; attempt += 1) {
        const candidate = this.applicationIdGenerator();
        if (APPLICATION_ID_PATTERN.test(candidate) && transaction.getCommunityReviewApplication(candidate) === undefined) {
          applicationId = candidate;
        }
      }
      if (applicationId === undefined) throw new CommunityReviewServiceError("repository_conflict");

      const withdrawalCredential = this.withdrawalCredentialGenerator();
      assertWithdrawalCredential(withdrawalCredential);
      const receivedAt = timestampOrThrow(this.now());
      const record: CommunityReviewApplicationRecord = {
        applicationId,
        schemaVersion: COMMUNITY_REVIEW_APPLICATION_SCHEMA_VERSION,
        applicationKind: COMMUNITY_REVIEW_APPLICATION_KIND,
        contractId: COMMUNITY_REVIEW_APPLICATION_CONTRACT_ID,
        contractVersion: COMMUNITY_REVIEW_APPLICATION_CONTRACT_VERSION,
        noticeVersion: COMMUNITY_REVIEW_APPLICATION_NOTICE_VERSION,
        submittedLocale: application.submittedLocale,
        preferredReviewLocale: application.preferredReviewLocale,
        motivation: application.motivation,
        ...(application.experienceSummary === undefined ? {} : { experienceSummary: application.experienceSummary }),
        availability: application.availability,
        acknowledgements: application.acknowledgements,
        decision: "PENDING",
        lifecycle: "ACTIVE",
        createdAt: receivedAt,
        updatedAt: receivedAt,
        retentionExpiresAt: addMilliseconds(receivedAt, this.retention.pendingRetentionMs),
        withdrawalCredentialDigest: digest(withdrawalCredential),
      };
      transaction.insertCommunityReviewApplication(record);
      transaction.insertCommunityReviewApplicationContact({
        applicationId,
        contactType: application.contact.type,
        contactValue: application.contact.value,
        createdAt: receivedAt,
      });
      const idempotency: CommunityReviewApplicationIdempotencyRecord = {
        idempotencyKeyFingerprint: keyFingerprint,
        requestFingerprint,
        applicationId,
        contractId: COMMUNITY_REVIEW_APPLICATION_CONTRACT_ID,
        contractVersion: COMMUNITY_REVIEW_APPLICATION_CONTRACT_VERSION,
        noticeVersion: COMMUNITY_REVIEW_APPLICATION_NOTICE_VERSION,
        receivedAt,
        withdrawalCredentialReturned: true,
        createdAt: receivedAt,
      };
      transaction.insertCommunityReviewApplicationIdempotency(idempotency);
      this.audit(transaction, "application_submitted", applicationId, receivedAt, "PENDING");
      return {
        created: true,
        receipt: {
          applicationId,
          contractId: COMMUNITY_REVIEW_APPLICATION_CONTRACT_ID,
          contractVersion: COMMUNITY_REVIEW_APPLICATION_CONTRACT_VERSION,
          noticeVersion: COMMUNITY_REVIEW_APPLICATION_NOTICE_VERSION,
          receivedAt,
          status: "PENDING",
          withdrawalCredential,
        },
      };
    });
  }

  async listPendingApplications(): Promise<readonly CommunityReviewApplicationOperatorSummary[]> {
    return this.persistence.transaction((transaction) => transaction
      .listCommunityReviewApplications("PENDING", "ACTIVE")
      .map(applicationSummary));
  }

  async getApplicationForOperator(applicationId: string): Promise<CommunityReviewApplicationOperatorDetail> {
    assertApplicationId(applicationId);
    return this.persistence.transaction((transaction) => {
      const record = applicationRecordOrThrow(transaction, applicationId);
      return applicationDetail(record, transaction.getCommunityReviewApplicationContact(applicationId));
    });
  }

  async recordDecision(input: {
    readonly applicationId: string;
    readonly decision: Extract<CommunityReviewApplicationDecision, "INVITED" | "DECLINED">;
  }): Promise<CommunityReviewApplicationOperatorDetail> {
    assertApplicationId(input.applicationId);
    if (!(["INVITED", "DECLINED"] as const).includes(input.decision)) {
      throw new CommunityReviewServiceError("application_decision_invalid");
    }
    return this.persistence.transaction((transaction) => {
      const record = applicationRecordOrThrow(transaction, input.applicationId);
      if (record.lifecycle !== "ACTIVE") throw new CommunityReviewServiceError("application_not_active");
      if (record.decision === input.decision) {
        return applicationDetail(record, transaction.getCommunityReviewApplicationContact(record.applicationId));
      }
      if (record.decision !== "PENDING") {
        throw new CommunityReviewServiceError("application_decision_conflict");
      }
      const decidedAt = timestampOrThrow(this.now());
      const updated: CommunityReviewApplicationRecord = {
        ...record,
        decision: input.decision,
        decisionAt: decidedAt,
        retentionExpiresAt: addMilliseconds(decidedAt, this.retention.decisionRetentionMs),
        updatedAt: decidedAt,
      };
      transaction.updateCommunityReviewApplication(updated);
      this.audit(transaction, "application_decision_recorded", record.applicationId, decidedAt, input.decision);
      return applicationDetail(updated, transaction.getCommunityReviewApplicationContact(record.applicationId));
    });
  }

  async withdrawApplication(input: {
    readonly applicationId: string;
    readonly withdrawalCredential: string;
  }): Promise<CommunityReviewApplicationWithdrawalResult> {
    assertApplicationId(input.applicationId);
    assertWithdrawalCredential(input.withdrawalCredential);
    return this.persistence.transaction((transaction) => {
      const record = transaction.getCommunityReviewApplication(input.applicationId);
      if (record === undefined || record.withdrawalCredentialDigest === undefined ||
        !equalDigest(record.withdrawalCredentialDigest, digest(input.withdrawalCredential))) {
        throw new CommunityReviewServiceError("application_withdrawal_not_authorized");
      }
      if (record.lifecycle === "WITHDRAWN" || record.lifecycle === "PURGED") {
        return {
          applicationId: record.applicationId,
          lifecycle: record.lifecycle,
          ...(record.withdrawnAt === undefined ? {} : { withdrawnAt: record.withdrawnAt }),
        };
      }
      const withdrawnAt = timestampOrThrow(this.now());
      const { motivation: _motivation, experienceSummary: _experienceSummary, ...withoutFreeText } = record;
      const updated: CommunityReviewApplicationRecord = {
        ...withoutFreeText,
        lifecycle: "WITHDRAWN",
        updatedAt: withdrawnAt,
        withdrawnAt,
      };
      transaction.updateCommunityReviewApplication(updated);
      transaction.deleteCommunityReviewApplicationContact(record.applicationId);
      this.audit(transaction, "application_withdrawn", record.applicationId, withdrawnAt);
      return { applicationId: record.applicationId, lifecycle: "WITHDRAWN", withdrawnAt };
    });
  }

  async purgeExpired(asOf?: string): Promise<CommunityReviewApplicationPurgeResult> {
    const cutoff = timestampOrThrow(asOf ?? this.now());
    return this.persistence.transaction((transaction) => {
      const purgedApplicationIds: string[] = [];
      for (const record of transaction.listCommunityReviewApplications(undefined, "ACTIVE")) {
        if (new Date(record.retentionExpiresAt).getTime() > new Date(cutoff).getTime()) continue;
        const { motivation: _motivation, experienceSummary: _experienceSummary, ...withoutFreeText } = record;
        const updated: CommunityReviewApplicationRecord = {
          ...withoutFreeText,
          lifecycle: "PURGED",
          updatedAt: cutoff,
          purgedAt: cutoff,
        };
        transaction.updateCommunityReviewApplication(updated);
        transaction.deleteCommunityReviewApplicationContact(record.applicationId);
        this.audit(transaction, "application_purged", record.applicationId, cutoff);
        purgedApplicationIds.push(record.applicationId);
      }
      return { purgedApplicationIds, asOf: cutoff };
    });
  }

  private audit(
    transaction: CommunityReviewPersistenceTransaction,
    eventType: CommunityReviewApplicationAuditEventRecord["eventType"],
    applicationId: string,
    occurredAt: string,
    decision?: CommunityReviewApplicationDecision,
  ): void {
    const eventId = this.auditEventIdGenerator();
    if (!APPLICATION_ID_PATTERN.test(eventId)) throw new CommunityReviewServiceError("repository_conflict");
    transaction.insertCommunityReviewApplicationAuditEvent({
      eventId,
      applicationId,
      eventType,
      ...(decision === undefined ? {} : { decision }),
      occurredAt,
    });
  }
}

export interface AuthenticatedApplicationRequest {
  readonly authenticationInput: unknown;
}

export interface AuthenticatedApplicationDecisionInput extends AuthenticatedApplicationRequest {
  readonly applicationId: string;
  readonly decision: Extract<CommunityReviewApplicationDecision, "INVITED" | "DECLINED">;
}

export interface AuthenticatedApplicationIdRequest extends AuthenticatedApplicationRequest {
  readonly applicationId: string;
}

/** Authenticated operator facade for application review; it has no reviewer authority methods. */
export class CommunityReviewApplicationIntakeApplicationService {
  constructor(
    private readonly intake: CommunityReviewApplicationIntakeService,
    private readonly authentication: AuthenticationAdapter,
    private readonly operatorAuthorization: OperatorAuthorizer,
  ) {}

  getApplicationIntakeState(): CommunityReviewApplicationIntakeState {
    return this.intake.getApplicationIntakeState();
  }

  async submitApplication(input: {
    readonly application: unknown;
    readonly idempotencyKey: string;
    readonly sourceKey?: string;
  }): Promise<CommunityReviewApplicationSubmissionResult> {
    return this.intake.submitApplication(input);
  }

  async withdrawApplication(input: {
    readonly applicationId: string;
    readonly withdrawalCredential: string;
  }): Promise<CommunityReviewApplicationWithdrawalResult> {
    return this.intake.withdrawApplication(input);
  }

  async listPendingApplications(input: AuthenticatedApplicationRequest): Promise<readonly CommunityReviewApplicationOperatorSummary[]> {
    await this.operator(input);
    return this.intake.listPendingApplications();
  }

  async getApplicationForOperator(input: AuthenticatedApplicationIdRequest): Promise<CommunityReviewApplicationOperatorDetail> {
    await this.operator(input);
    return this.intake.getApplicationForOperator(input.applicationId);
  }

  async recordDecision(input: AuthenticatedApplicationDecisionInput): Promise<CommunityReviewApplicationOperatorDetail> {
    await this.operator(input);
    return this.intake.recordDecision({ applicationId: input.applicationId, decision: input.decision });
  }

  async purgeExpired(input: AuthenticatedApplicationRequest & { readonly asOf?: string }): Promise<CommunityReviewApplicationPurgeResult> {
    await this.operator(input);
    return this.intake.purgeExpired(input.asOf);
  }

  private async operator(input: AuthenticatedApplicationRequest): Promise<AuthenticationContext> {
    if (input.authenticationInput === undefined || input.authenticationInput === null || input.authenticationInput === "") {
      throw new CommunityReviewServiceError("authentication_required");
    }
    let context: AuthenticationContext;
    try {
      context = parseAuthenticationContext(await this.authentication.authenticate(input.authenticationInput));
    } catch (error) {
      if (error instanceof CommunityReviewServiceError && error.code === "authentication_failed") throw error;
      throw new CommunityReviewServiceError("authentication_failed");
    }
    try {
      if (await this.operatorAuthorization.isOperator(context) !== true) {
        throw new CommunityReviewServiceError("operator_not_authorized");
      }
    } catch (error) {
      if (error instanceof CommunityReviewServiceError && error.code === "operator_not_authorized") throw error;
      throw new CommunityReviewServiceError("operator_not_authorized");
    }
    return context;
  }
}
