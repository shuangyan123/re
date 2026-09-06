import type {
  AuthenticatedPrincipal,
  AuthenticationAdapter,
  AuthenticationContext,
  OperatorAuthorizer,
} from "./authentication.js";
import { parseAuthenticationContext } from "./authentication.js";
import { CommunityReviewServiceError } from "./errors.js";
import type {
  AssignCommunityReviewReviewerInput,
  BuildCommunityReviewPublicEvidenceArtifactInput,
  CreateCommunityReviewDisclosureInput,
  CreateQualificationAttemptInput,
  CreateCommunityReviewBatchInput,
  GetReviewerConsentInput,
  GetOwnCommunityReviewSubmissionInput,
  LinkReviewerAuthIdentityInput,
  QualificationAttemptRequest,
  QualificationPoolRequest,
  RegisterAuthoritativeQualificationReceiptInput,
  RegisterQualificationPoolInput,
  RecordReviewerConsentInput,
  RevokeReviewerConsentInput,
  ReviewerAccountLifecycleInput,
  ReviewerConsentSnapshot,
  CommunityReviewAssignmentResult,
  ReviewerPacketRequest,
  SubmitQualificationAttemptInput,
  SubmitCommunityReviewInput,
  WithdrawCommunityReviewAssignmentInput,
} from "./service.js";
import { CommunityReviewService } from "./service.js";
import type {
  CommunityReviewAssignment,
  CommunityReviewAgreementEvidence,
  CommunityReviewBatchCloseResult,
  CommunityReviewReviewerPacket,
  CommunityReviewSubmission,
  FrozenCommunityReviewPool,
  CommunityReviewPublicEvidenceArtifact,
  CommunityReviewQualificationReceipt,
} from "../../../src/contracts/community-review.js";
import type {
  CommunityReviewDisclosureRecord,
  QualificationPoolRecord,
  ReviewerAccountRecord,
  ReviewerAuthIdentityRecord,
  ReviewBatchRecord,
} from "./persistence.js";
import type {
  QualificationAttemptIssue,
  QualificationAttemptView,
} from "./service.js";
import type { QualificationVisiblePacket } from "./qualification.js";

export interface AuthenticatedRequest {
  readonly authenticationInput: unknown;
}

export interface AuthenticatedReviewerProvisionInput extends AuthenticatedRequest {
  /** Optional target principal selected by an already authorized operator. */
  readonly principal?: AuthenticatedPrincipal;
}

export interface AuthenticatedReviewerAssignmentInput extends AuthenticatedRequest {
  /** Optional hint; the service chooses only an actually eligible OPEN batch. */
  readonly batchId?: string;
}

export interface AuthenticatedReviewerPacketRequest extends AuthenticatedRequest {
  readonly assignmentId: string;
}

export interface AuthenticatedReviewerSubmissionInput extends AuthenticatedRequest {
  readonly batchId: string;
  readonly assignmentId: string;
  readonly packetFingerprint?: SubmitCommunityReviewInput["packetFingerprint"];
  readonly annotations: SubmitCommunityReviewInput["annotations"];
}

export interface AuthenticatedReviewerOwnSubmissionRequest extends AuthenticatedRequest {
  readonly batchId: string;
  readonly assignmentId: string;
}

export interface AuthenticatedReviewerWithdrawalInput extends AuthenticatedRequest {
  readonly batchId: string;
  readonly assignmentId: string;
}

export interface AuthenticatedReviewerQualificationAttemptInput extends AuthenticatedRequest {
  readonly qualificationId: CreateQualificationAttemptInput["qualificationId"];
  readonly qualificationVersion: CreateQualificationAttemptInput["qualificationVersion"];
  readonly poolId: CreateQualificationAttemptInput["poolId"];
  readonly poolVersion: CreateQualificationAttemptInput["poolVersion"];
  readonly instrumentFingerprint: CreateQualificationAttemptInput["instrumentFingerprint"];
  readonly reviewLocale: CreateQualificationAttemptInput["reviewLocale"];
}

export interface AuthenticatedReviewerQualificationPacketRequest extends AuthenticatedRequest {
  readonly attemptId: string;
}

export interface AuthenticatedReviewerQualificationSubmissionInput extends AuthenticatedRequest {
  readonly attemptId: string;
  readonly attemptNonce: string;
  readonly packetFingerprint: string;
  readonly responses: SubmitQualificationAttemptInput["responses"];
}

export interface AuthenticatedConsentRequest extends AuthenticatedRequest {
  readonly policyId?: string;
  readonly policyVersion?: string;
}

export interface AuthenticatedOperatorBatchRequest extends AuthenticatedRequest {
  readonly batchId: string;
}

export interface AuthenticatedOperatorDisclosureInput extends AuthenticatedRequest {
  readonly batchId: string;
  readonly mode?: CreateCommunityReviewDisclosureInput["mode"];
  readonly disclosurePolicy?: CreateCommunityReviewDisclosureInput["disclosurePolicy"];
  readonly disclosureDate?: CreateCommunityReviewDisclosureInput["disclosureDate"];
}

export interface AuthenticatedOperatorPublicEvidenceRequest extends AuthenticatedRequest {
  readonly batchId: string;
  readonly disclosureId?: BuildCommunityReviewPublicEvidenceArtifactInput["disclosureId"];
}

export interface AuthenticatedOperatorQualificationPoolRequest extends AuthenticatedRequest {
  readonly poolId: string;
  readonly poolVersion: string;
}

export interface AuthenticatedOperatorTargetRequest extends AuthenticatedRequest {
  readonly reviewerId: string;
}

export interface AuthenticatedOperatorCreateBatchInput extends AuthenticatedRequest {
  readonly manifest: CreateCommunityReviewBatchInput["manifest"];
  readonly sealedSourceReference: string;
}

export interface AuthenticatedOperatorQualificationPoolInput extends AuthenticatedRequest {
  readonly pool: RegisterQualificationPoolInput;
}

export interface AuthenticatedOperatorQualificationReceiptInput extends AuthenticatedRequest {
  readonly receipt: RegisterAuthoritativeQualificationReceiptInput;
}

export interface AuthenticatedOperatorIdentityLinkInput extends AuthenticatedRequest {
  readonly reviewerId: string;
  readonly principal: AuthenticatedPrincipal;
}

/**
 * Application boundary for authenticated requests. Reviewer-owned operations
 * derive the opaque reviewer ID from the private auth mapping and ignore any
 * caller-supplied reviewer ID at runtime.
 */
export class CommunityReviewApplicationService {
  constructor(
    private readonly service: CommunityReviewService,
    private readonly authentication: AuthenticationAdapter,
    private readonly operatorAuthorization?: OperatorAuthorizer,
  ) {}

  private async authenticate(input: unknown): Promise<AuthenticationContext> {
    if (input === undefined || input === null || input === "") {
      throw new CommunityReviewServiceError("authentication_required");
    }
    try {
      return parseAuthenticationContext(await this.authentication.authenticate(input));
    } catch (error) {
      if (error instanceof CommunityReviewServiceError && error.code === "authentication_failed") {
        throw error;
      }
      throw new CommunityReviewServiceError("authentication_failed");
    }
  }

  private async reviewer(input: AuthenticatedRequest): Promise<ReviewerAccountRecord> {
    const context = await this.authenticate(input.authenticationInput);
    return this.service.resolveAuthenticatedReviewer({ principal: context.principal });
  }

  private async operator(input: AuthenticatedRequest): Promise<AuthenticationContext> {
    const context = await this.authenticate(input.authenticationInput);
    if (this.operatorAuthorization === undefined) {
      throw new CommunityReviewServiceError("operator_not_authorized");
    }
    try {
      if (await this.operatorAuthorization.isOperator(context) !== true) {
        throw new CommunityReviewServiceError("operator_not_authorized");
      }
    } catch (error) {
      if (error instanceof CommunityReviewServiceError && error.code === "operator_not_authorized") {
        throw error;
      }
      throw new CommunityReviewServiceError("operator_not_authorized");
    }
    return context;
  }

  /** Trusted operator provisioning; this method is not a public signup flow. */
  async provisionReviewerAccount(input: AuthenticatedReviewerProvisionInput): Promise<ReviewerAccountRecord> {
    const context = await this.operator(input);
    return this.service.provisionReviewerAccount({ principal: input.principal ?? context.principal });
  }

  async recordConsent(input: AuthenticatedConsentRequest): Promise<ReviewerConsentSnapshot> {
    const account = await this.reviewer(input);
    const consent: RecordReviewerConsentInput = {
      reviewerId: account.reviewerId,
      ...(input.policyId === undefined ? {} : { policyId: input.policyId }),
      ...(input.policyVersion === undefined ? {} : { policyVersion: input.policyVersion }),
    };
    return this.service.recordConsent(consent);
  }

  async revokeConsent(input: AuthenticatedConsentRequest): Promise<ReviewerConsentSnapshot> {
    const account = await this.reviewer(input);
    const consent: RevokeReviewerConsentInput = {
      reviewerId: account.reviewerId,
      ...(input.policyId === undefined ? {} : { policyId: input.policyId }),
      ...(input.policyVersion === undefined ? {} : { policyVersion: input.policyVersion }),
    };
    return this.service.revokeConsent(consent);
  }

  async getCurrentConsent(input: AuthenticatedConsentRequest): Promise<ReviewerConsentSnapshot> {
    const account = await this.reviewer(input);
    const consent: GetReviewerConsentInput = {
      reviewerId: account.reviewerId,
      ...(input.policyId === undefined ? {} : { policyId: input.policyId }),
      ...(input.policyVersion === undefined ? {} : { policyVersion: input.policyVersion }),
    };
    return this.service.getCurrentConsent(consent);
  }

  async withdrawReviewerAccount(input: AuthenticatedRequest): Promise<ReviewerAccountRecord> {
    const account = await this.reviewer(input);
    const lifecycle: ReviewerAccountLifecycleInput = { reviewerId: account.reviewerId };
    return this.service.withdrawReviewerAccount(lifecycle);
  }

  async getOrCreateOwnEligibleAssignment(
    input: AuthenticatedReviewerAssignmentInput,
  ): Promise<CommunityReviewAssignmentResult> {
    const account = await this.reviewer(input);
    const assignment: AssignCommunityReviewReviewerInput = {
      reviewerId: account.reviewerId,
      ...(input.batchId === undefined ? {} : { batchId: input.batchId }),
    };
    return this.service.getOrCreateOwnEligibleAssignment(assignment);
  }

  async assignReviewer(input: AuthenticatedReviewerAssignmentInput): Promise<CommunityReviewAssignmentResult> {
    return this.getOrCreateOwnEligibleAssignment(input);
  }

  async getReviewerPacket(input: AuthenticatedReviewerPacketRequest): Promise<CommunityReviewReviewerPacket> {
    const account = await this.reviewer(input);
    const request: ReviewerPacketRequest = {
      assignmentId: input.assignmentId,
      reviewerId: account.reviewerId,
    };
    return this.service.getReviewerPacket(request);
  }

  async submitReview(input: AuthenticatedReviewerSubmissionInput): Promise<CommunityReviewSubmission> {
    const account = await this.reviewer(input);
    const submission: SubmitCommunityReviewInput = {
      batchId: input.batchId,
      assignmentId: input.assignmentId,
      reviewerId: account.reviewerId,
      ...(input.packetFingerprint === undefined ? {} : { packetFingerprint: input.packetFingerprint }),
      annotations: input.annotations,
    };
    return this.service.submitReview(submission);
  }

  async submitOwnAssignment(input: AuthenticatedReviewerSubmissionInput): Promise<CommunityReviewSubmission> {
    return this.submitReview(input);
  }

  async getOwnSubmission(
    input: AuthenticatedReviewerOwnSubmissionRequest,
  ): Promise<CommunityReviewSubmission | undefined> {
    const account = await this.reviewer(input);
    const request: GetOwnCommunityReviewSubmissionInput = {
      batchId: input.batchId,
      assignmentId: input.assignmentId,
      reviewerId: account.reviewerId,
    };
    return this.service.getOwnSubmission(request);
  }

  async withdrawAssignment(input: AuthenticatedReviewerWithdrawalInput): Promise<CommunityReviewAssignment> {
    const account = await this.reviewer(input);
    const withdrawal: WithdrawCommunityReviewAssignmentInput = {
      batchId: input.batchId,
      assignmentId: input.assignmentId,
      reviewerId: account.reviewerId,
    };
    return this.service.withdrawAssignment(withdrawal);
  }

  async createQualificationAttempt(
    input: AuthenticatedReviewerQualificationAttemptInput,
  ): Promise<QualificationAttemptIssue> {
    const account = await this.reviewer(input);
    const attempt: CreateQualificationAttemptInput = {
      reviewerId: account.reviewerId,
      qualificationId: input.qualificationId,
      qualificationVersion: input.qualificationVersion,
      poolId: input.poolId,
      poolVersion: input.poolVersion,
      instrumentFingerprint: input.instrumentFingerprint,
      reviewLocale: input.reviewLocale,
    };
    return this.service.createQualificationAttempt(attempt);
  }

  async getQualificationPacket(
    input: AuthenticatedReviewerQualificationPacketRequest,
  ): Promise<QualificationVisiblePacket> {
    const account = await this.reviewer(input);
    const request: QualificationAttemptRequest = {
      reviewerId: account.reviewerId,
      attemptId: input.attemptId,
    };
    return this.service.getQualificationPacket(request);
  }

  async submitQualificationAttempt(
    input: AuthenticatedReviewerQualificationSubmissionInput,
  ): Promise<QualificationAttemptView> {
    const account = await this.reviewer(input);
    const submission: SubmitQualificationAttemptInput = {
      reviewerId: account.reviewerId,
      attemptId: input.attemptId,
      attemptNonce: input.attemptNonce,
      packetFingerprint: input.packetFingerprint,
      responses: input.responses,
    };
    return this.service.submitQualificationAttempt(submission);
  }

  async getQualificationAttempt(
    input: AuthenticatedReviewerQualificationPacketRequest,
  ): Promise<QualificationAttemptView> {
    const account = await this.reviewer(input);
    return this.service.getQualificationAttempt({
      reviewerId: account.reviewerId,
      attemptId: input.attemptId,
    });
  }

  async issueQualificationReceipt(
    input: AuthenticatedReviewerQualificationPacketRequest,
  ) {
    const account = await this.reviewer(input);
    return this.service.issueQualificationReceipt({
      reviewerId: account.reviewerId,
      attemptId: input.attemptId,
    });
  }

  async getQualificationReceipt(
    input: AuthenticatedReviewerQualificationPacketRequest,
  ): Promise<CommunityReviewQualificationReceipt> {
    const account = await this.reviewer(input);
    return this.service.getQualificationReceipt({
      reviewerId: account.reviewerId,
      attemptId: input.attemptId,
    });
  }

  async disableReviewerAccount(input: AuthenticatedOperatorTargetRequest): Promise<ReviewerAccountRecord> {
    await this.operator(input);
    return this.service.disableReviewerAccount({ reviewerId: input.reviewerId });
  }

  async linkReviewerAuthIdentity(
    input: AuthenticatedOperatorIdentityLinkInput,
  ): Promise<ReviewerAuthIdentityRecord> {
    await this.operator(input);
    const link: LinkReviewerAuthIdentityInput = {
      reviewerId: input.reviewerId,
      principal: input.principal,
    };
    return this.service.linkReviewerAuthIdentity(link);
  }

  async createBatch(input: AuthenticatedOperatorCreateBatchInput): Promise<ReviewBatchRecord> {
    await this.operator(input);
    return this.service.createBatch({
      manifest: input.manifest,
      sealedSourceReference: input.sealedSourceReference,
    });
  }

  async openBatch(input: AuthenticatedOperatorBatchRequest): Promise<ReviewBatchRecord> {
    await this.operator(input);
    return this.service.openBatch(input.batchId);
  }

  async closeBatch(input: AuthenticatedOperatorBatchRequest): Promise<CommunityReviewBatchCloseResult> {
    await this.operator(input);
    return this.service.closeBatch(input.batchId);
  }

  async getBatchCloseResult(
    input: AuthenticatedOperatorBatchRequest,
  ): Promise<CommunityReviewBatchCloseResult> {
    await this.operator(input);
    return this.service.getBatchCloseResult(input.batchId);
  }

  async freezeBatch(input: AuthenticatedOperatorBatchRequest): Promise<FrozenCommunityReviewPool> {
    await this.operator(input);
    return this.service.freezeBatch(input.batchId);
  }

  async getFrozenPool(input: AuthenticatedOperatorBatchRequest): Promise<FrozenCommunityReviewPool> {
    await this.operator(input);
    return this.service.getFrozenPool(input.batchId);
  }

  async buildAgreementEvidence(input: AuthenticatedOperatorBatchRequest): Promise<CommunityReviewAgreementEvidence> {
    await this.operator(input);
    return this.service.buildAgreementEvidence(input.batchId);
  }

  async getAgreementEvidence(input: AuthenticatedOperatorBatchRequest): Promise<CommunityReviewAgreementEvidence> {
    await this.operator(input);
    return this.service.getAgreementEvidence(input.batchId);
  }

  async createDisclosure(input: AuthenticatedOperatorDisclosureInput): Promise<CommunityReviewDisclosureRecord> {
    await this.operator(input);
    const disclosure: CreateCommunityReviewDisclosureInput = {
      batchId: input.batchId,
      ...(input.mode === undefined ? {} : { mode: input.mode }),
      ...(input.disclosurePolicy === undefined ? {} : { disclosurePolicy: input.disclosurePolicy }),
      ...(input.disclosureDate === undefined ? {} : { disclosureDate: input.disclosureDate }),
    };
    return this.service.createDisclosure(disclosure);
  }

  async buildPublicEvidenceArtifact(
    input: AuthenticatedOperatorPublicEvidenceRequest,
  ): Promise<CommunityReviewPublicEvidenceArtifact> {
    await this.operator(input);
    const request: BuildCommunityReviewPublicEvidenceArtifactInput = {
      batchId: input.batchId,
      ...(input.disclosureId === undefined ? {} : { disclosureId: input.disclosureId }),
    };
    return this.service.buildPublicEvidenceArtifact(request);
  }

  async registerQualificationPool(
    input: AuthenticatedOperatorQualificationPoolInput,
  ): Promise<QualificationPoolRecord> {
    await this.operator(input);
    return this.service.registerQualificationPool(input.pool);
  }

  async getQualificationPool(
    input: AuthenticatedOperatorQualificationPoolRequest,
  ): Promise<QualificationPoolRecord> {
    await this.operator(input);
    const request: QualificationPoolRequest = {
      poolId: input.poolId,
      poolVersion: input.poolVersion,
    };
    return this.service.getQualificationPool(request);
  }

  async sealQualificationPool(
    input: AuthenticatedOperatorQualificationPoolRequest,
  ): Promise<QualificationPoolRecord> {
    await this.operator(input);
    return this.service.sealQualificationPool({
      poolId: input.poolId,
      poolVersion: input.poolVersion,
    });
  }

  async activateQualificationPool(
    input: AuthenticatedOperatorQualificationPoolRequest,
  ): Promise<QualificationPoolRecord> {
    await this.operator(input);
    return this.service.activateQualificationPool({
      poolId: input.poolId,
      poolVersion: input.poolVersion,
    });
  }

  async retireQualificationPool(
    input: AuthenticatedOperatorQualificationPoolRequest,
  ): Promise<QualificationPoolRecord> {
    await this.operator(input);
    return this.service.retireQualificationPool({
      poolId: input.poolId,
      poolVersion: input.poolVersion,
    });
  }

  async registerAuthoritativeQualificationReceipt(
    input: AuthenticatedOperatorQualificationReceiptInput,
  ) {
    await this.operator(input);
    return this.service.registerAuthoritativeQualificationReceipt(input.receipt);
  }
}
