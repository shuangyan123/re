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
import { CommunityReviewServiceError } from "./errors.js";
import type {
  AcceptedSubmissionRecord,
  CommunityReviewPersistence,
  CommunityReviewPersistenceTransaction,
  FrozenReviewPoolRecord,
  QualificationPoolRecord,
  QualificationReceiptRecord,
  ReviewerAccountRecord,
  ReviewAssignmentRecord,
  ReviewBatchRecord,
  SealedBatchPayloadReferenceRecord,
} from "./persistence.js";

const opaqueIdPattern = /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/u;
const fingerprintPattern = /^sha256:[0-9a-f]{64}$/u;

function same(left: unknown, right: unknown): boolean {
  return canonicalCommunityReviewJson(left) === canonicalCommunityReviewJson(right);
}

function required(value: string): void {
  if (value.trim().length === 0) throw new CommunityReviewServiceError("invalid_service_record");
}

function opaqueId(value: string): void {
  if (!opaqueIdPattern.test(value) || value.includes("@")) {
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
): ReviewerAccountRecord {
  const account = transaction.getReviewerAccountByReviewerId(reviewerId);
  if (account === undefined) throw new CommunityReviewServiceError("reviewer_not_found");
  if (account.status !== "ACTIVE" || account.consentState !== "CONSENTED") {
    throw new CommunityReviewServiceError("reviewer_not_authorized");
  }
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
}

export interface RegisterReviewerAccountInput {
  readonly internalId: string;
  readonly reviewerId: string;
  readonly privateAuthSubjectReference: string;
  readonly consentVersion: string;
  readonly consentState?: ReviewerAccountRecord["consentState"];
  readonly status?: ReviewerAccountRecord["status"];
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
 * P4-A service boundary. This class owns transaction ordering and authority
 * checks; all protocol semantics remain in the existing P3 pure functions.
 */
export class CommunityReviewService {
  private readonly now: () => string;

  constructor(
    private readonly persistence: CommunityReviewPersistence,
    options: CommunityReviewServiceOptions = {},
  ) {
    this.now = options.clock ?? (() => new Date().toISOString());
  }

  /** Trusted setup boundary only; no real OAuth identity is accepted here. */
  async registerReviewerAccount(input: RegisterReviewerAccountInput): Promise<ReviewerAccountRecord> {
    opaqueId(input.internalId);
    opaqueId(input.reviewerId);
    required(input.privateAuthSubjectReference);
    required(input.consentVersion);
    const expected = {
      internalId: input.internalId,
      reviewerId: input.reviewerId,
      privateAuthSubjectReference: input.privateAuthSubjectReference,
      status: input.status ?? "ACTIVE" as const,
      consentVersion: input.consentVersion,
      consentState: input.consentState ?? "CONSENTED" as const,
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
      return transaction.insertReviewerAccount({
        ...expected,
        createdAt: timestamp,
        updatedAt: timestamp,
      });
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
      eligibleAccount(transaction, receipt.reviewerId);
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
      eligibleAccount(transaction, input.reviewerId);
      const authoritative = authoritativeReceipt(transaction, receipt);
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
      eligibleAccount(transaction, input.reviewerId);
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
      eligibleAccount(transaction, input.reviewerId);
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
      eligibleAccount(transaction, input.reviewerId);
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
