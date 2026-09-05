import type {
  HumanAtomicConfusionMatrix,
  HumanAtomicIdentity,
  HumanAtomicStatus,
  HumanPairwiseAgreementReport,
} from "./human-reference-calibration.js";

export const COMMUNITY_REVIEW_SCHEMA_VERSION = 1 as const;
export const COMMUNITY_REVIEW_PROTOCOL_ID = "community-review-protocol" as const;
export const COMMUNITY_REVIEW_PROTOCOL_VERSION = "0.1.0" as const;
export const COMMUNITY_REVIEW_QUALIFICATION_PROTOCOL_ID =
  "community-review-qualification" as const;
export const COMMUNITY_REVIEW_QUALIFICATION_PROTOCOL_VERSION = "0.1.0" as const;
export const COMMUNITY_REVIEW_INSTRUMENT_ID = "human-atomic-community-review" as const;
export const COMMUNITY_REVIEW_INSTRUMENT_VERSION = "0.1.0" as const;
export const COMMUNITY_REVIEW_GUIDE_ID = "community-review-annotation-guide" as const;
export const COMMUNITY_REVIEW_GUIDE_VERSION = "0.1.0" as const;
export const COMMUNITY_REVIEW_DEFAULT_REQUIRED_REVIEWERS = 2 as const;
export const COMMUNITY_REVIEW_BLINDNESS_MODE = "sealed-until-close" as const;

export const COMMUNITY_REVIEW_QUALIFICATION_RECEIPT_KIND =
  "community-review-qualification-receipt" as const;
export const COMMUNITY_REVIEW_BATCH_MANIFEST_KIND =
  "community-review-batch-manifest" as const;
export const COMMUNITY_REVIEW_ASSIGNMENT_KIND = "community-review-assignment" as const;
export const COMMUNITY_REVIEW_PACKET_KIND = "community-review-reviewer-packet" as const;
export const COMMUNITY_REVIEW_SUBMISSION_KIND = "community-review-submission" as const;
export const COMMUNITY_REVIEW_CLOSE_RECORD_KIND = "community-review-batch-close" as const;
export const COMMUNITY_REVIEW_POOL_KIND = "community-review-frozen-pool" as const;
export const COMMUNITY_REVIEW_AGREEMENT_KIND = "community-review-agreement" as const;
export const COMMUNITY_REVIEW_PUBLIC_ARTIFACT_KIND =
  "community-review-public-evidence" as const;

export type CommunityReviewFingerprint = string;
export type CommunityReviewLocale = string;
export type CommunityReviewReviewerId = string;
export type CommunityReviewDataKind = "community-review" | "synthetic-fixture";

/** Synthetic fixtures are protocol tests, never community evidence. */
export interface CommunityReviewSyntheticFixtureMarker {
  readonly synthetic: true;
  readonly notHumanCalibrationData: true;
  readonly notCommunityReviewEvidence: true;
}

export type CommunityReviewBatchPurpose =
  | "interpretable"
  | "pilot"
  | "non-reference"
  | "incomplete";

export type CommunityReviewBatchState = "SEALED" | "OPEN" | "CLOSED" | "FROZEN";

export interface CommunityReviewVisibleRequirement {
  readonly id: string;
  readonly description: string;
}

export interface CommunityReviewVisibleRubric {
  readonly id: string;
  readonly criterion: string;
  readonly requirements: readonly CommunityReviewVisibleRequirement[];
}

/**
 * Explicit reviewer-facing projection. It intentionally has no ground truth,
 * misconception, disclosure policy, expected status, reference, or Judge
 * field. Construct this from visible material rather than deleting fields from
 * an evaluator object.
 */
export interface CommunityReviewVisibleTask {
  readonly caseId: string;
  readonly learningObjective: string;
  readonly studentProfile: string;
  readonly conversationHistory: string;
  readonly studentMessage: string;
  readonly problemContext: string;
  readonly rubrics: readonly CommunityReviewVisibleRubric[];
  readonly tutorResponse: string;
}

export type CommunityReviewAtomicIdentity = HumanAtomicIdentity;

export interface CommunityReviewLocalizationIdentity {
  readonly localizationId: string;
  readonly localizationVersion: string;
  readonly sourceLocale: CommunityReviewLocale;
  readonly sourceInstrumentFingerprint: CommunityReviewFingerprint;
  readonly localizedTaskSetFingerprint: CommunityReviewFingerprint;
  readonly fingerprint: CommunityReviewFingerprint;
}

export interface CommunityReviewInstrumentIdentity {
  readonly protocolId: typeof COMMUNITY_REVIEW_PROTOCOL_ID;
  readonly protocolVersion: typeof COMMUNITY_REVIEW_PROTOCOL_VERSION;
  readonly instrumentId: string;
  readonly instrumentVersion: string;
  readonly guideId: string;
  readonly guideVersion: string;
  readonly guideFingerprint: CommunityReviewFingerprint;
  readonly canonicalLocale: CommunityReviewLocale;
  readonly reviewLocale: CommunityReviewLocale;
  readonly localization?: CommunityReviewLocalizationIdentity;
  readonly fingerprint: CommunityReviewFingerprint;
}

export interface CommunityReviewQualificationInstrumentEligibility {
  readonly instrumentId: string;
  readonly instrumentVersion: string;
  readonly instrumentFingerprint: CommunityReviewFingerprint;
  readonly reviewLocale: CommunityReviewLocale;
}

export interface CommunityReviewQualificationEligibility {
  readonly qualificationProtocolId: typeof COMMUNITY_REVIEW_QUALIFICATION_PROTOCOL_ID;
  readonly qualificationProtocolVersion: typeof COMMUNITY_REVIEW_QUALIFICATION_PROTOCOL_VERSION;
  readonly qualificationId: string;
  readonly qualificationVersion: string;
  readonly qualificationPoolId: string;
  readonly qualificationPoolVersion: string;
  readonly qualificationDefinitionFingerprint: CommunityReviewFingerprint;
}

/**
 * P3 receipt envelope only. A valid local receipt is not proof of server
 * issuance; issuer authentication and anti-replay state belong to P4.
 */
export interface CommunityReviewQualificationReceipt {
  readonly schemaVersion: typeof COMMUNITY_REVIEW_SCHEMA_VERSION;
  readonly receiptKind: typeof COMMUNITY_REVIEW_QUALIFICATION_RECEIPT_KIND;
  readonly dataKind: CommunityReviewDataKind;
  readonly fixture?: CommunityReviewSyntheticFixtureMarker;
  readonly protocolId: typeof COMMUNITY_REVIEW_PROTOCOL_ID;
  readonly protocolVersion: typeof COMMUNITY_REVIEW_PROTOCOL_VERSION;
  readonly qualificationProtocolId: typeof COMMUNITY_REVIEW_QUALIFICATION_PROTOCOL_ID;
  readonly qualificationProtocolVersion: typeof COMMUNITY_REVIEW_QUALIFICATION_PROTOCOL_VERSION;
  readonly qualificationId: string;
  readonly qualificationVersion: string;
  readonly qualificationPoolId: string;
  readonly qualificationPoolVersion: string;
  readonly qualificationDefinitionFingerprint: CommunityReviewFingerprint;
  readonly reviewerId: CommunityReviewReviewerId;
  readonly reviewLocale: CommunityReviewLocale;
  readonly qualificationStatus: "qualified";
  readonly instrumentEligibility: CommunityReviewQualificationInstrumentEligibility;
  readonly receiptFingerprint: CommunityReviewFingerprint;
}

export interface CommunityReviewBatchManifest {
  readonly schemaVersion: typeof COMMUNITY_REVIEW_SCHEMA_VERSION;
  readonly manifestKind: typeof COMMUNITY_REVIEW_BATCH_MANIFEST_KIND;
  readonly dataKind: CommunityReviewDataKind;
  readonly fixture?: CommunityReviewSyntheticFixtureMarker;
  readonly protocolId: typeof COMMUNITY_REVIEW_PROTOCOL_ID;
  readonly protocolVersion: typeof COMMUNITY_REVIEW_PROTOCOL_VERSION;
  readonly batchId: string;
  readonly instrument: CommunityReviewInstrumentIdentity;
  readonly qualificationEligibility: CommunityReviewQualificationEligibility;
  /** Opaque commitment to sealed source material; it is not the source itself. */
  readonly sealedSourceFingerprint: CommunityReviewFingerprint;
  readonly visibleTaskSetFingerprint: CommunityReviewFingerprint;
  readonly requiredIndependentReviewerCount: number;
  readonly batchPurpose: CommunityReviewBatchPurpose;
  readonly blindnessMode: typeof COMMUNITY_REVIEW_BLINDNESS_MODE;
  readonly state: CommunityReviewBatchState;
  readonly closeRecordFingerprint?: CommunityReviewFingerprint;
  readonly freezeFingerprint?: CommunityReviewFingerprint;
  /** Stable semantic batch identity; lifecycle fields do not change it. */
  readonly batchFingerprint: CommunityReviewFingerprint;
}

export type CommunityReviewAssignmentState = "assigned" | "withdrawn";

export interface CommunityReviewAssignment {
  readonly schemaVersion: typeof COMMUNITY_REVIEW_SCHEMA_VERSION;
  readonly assignmentKind: typeof COMMUNITY_REVIEW_ASSIGNMENT_KIND;
  readonly dataKind: CommunityReviewDataKind;
  readonly fixture?: CommunityReviewSyntheticFixtureMarker;
  readonly protocolId: typeof COMMUNITY_REVIEW_PROTOCOL_ID;
  readonly protocolVersion: typeof COMMUNITY_REVIEW_PROTOCOL_VERSION;
  readonly batchId: string;
  readonly batchFingerprint: CommunityReviewFingerprint;
  readonly assignmentId: string;
  readonly reviewerId: CommunityReviewReviewerId;
  readonly qualificationReceiptFingerprint: CommunityReviewFingerprint;
  readonly instrument: CommunityReviewInstrumentIdentity;
  readonly visibleTaskSetFingerprint: CommunityReviewFingerprint;
  readonly visibleAtomicIds: readonly CommunityReviewAtomicIdentity[];
  readonly assignmentState: CommunityReviewAssignmentState;
  readonly assignmentFingerprint: CommunityReviewFingerprint;
}

export interface CommunityReviewAnnotation extends CommunityReviewAtomicIdentity {
  readonly status: HumanAtomicStatus;
  readonly evidence?: string;
}

/** Allowlist-only packet: all task fields are reviewer-visible projections. */
export interface CommunityReviewReviewerPacket {
  readonly schemaVersion: typeof COMMUNITY_REVIEW_SCHEMA_VERSION;
  readonly packetKind: typeof COMMUNITY_REVIEW_PACKET_KIND;
  readonly dataKind: CommunityReviewDataKind;
  readonly fixture?: CommunityReviewSyntheticFixtureMarker;
  readonly protocolId: typeof COMMUNITY_REVIEW_PROTOCOL_ID;
  readonly protocolVersion: typeof COMMUNITY_REVIEW_PROTOCOL_VERSION;
  readonly batchId: string;
  readonly batchFingerprint: CommunityReviewFingerprint;
  readonly assignmentId: string;
  readonly reviewerId: CommunityReviewReviewerId;
  readonly qualificationReceiptFingerprint: CommunityReviewFingerprint;
  readonly instrument: CommunityReviewInstrumentIdentity;
  readonly taskSetFingerprint: CommunityReviewFingerprint;
  readonly tasks: readonly CommunityReviewVisibleTask[];
  readonly packetFingerprint: CommunityReviewFingerprint;
}

/** Explicitly distinguishes accepted-before-close from excluded late work. */
export type CommunityReviewSubmissionDisposition =
  | "accepted-before-close"
  | "not-part-of-closed-batch";

export interface CommunityReviewSubmission {
  readonly schemaVersion: typeof COMMUNITY_REVIEW_SCHEMA_VERSION;
  readonly submissionKind: typeof COMMUNITY_REVIEW_SUBMISSION_KIND;
  readonly dataKind: CommunityReviewDataKind;
  readonly fixture?: CommunityReviewSyntheticFixtureMarker;
  readonly protocolId: typeof COMMUNITY_REVIEW_PROTOCOL_ID;
  readonly protocolVersion: typeof COMMUNITY_REVIEW_PROTOCOL_VERSION;
  readonly batchId: string;
  readonly batchFingerprint: CommunityReviewFingerprint;
  readonly assignmentId: string;
  readonly reviewerId: CommunityReviewReviewerId;
  readonly qualificationReceiptFingerprint: CommunityReviewFingerprint;
  readonly instrument: CommunityReviewInstrumentIdentity;
  readonly taskSetFingerprint: CommunityReviewFingerprint;
  readonly packetFingerprint: CommunityReviewFingerprint;
  readonly submissionDisposition: CommunityReviewSubmissionDisposition;
  readonly completed: true;
  readonly annotations: readonly CommunityReviewAnnotation[];
  readonly submissionFingerprint: CommunityReviewFingerprint;
}

export interface CommunityReviewCoverage {
  readonly requiredIndependentReviewerCount: number;
  readonly assignedReviewerCount: number;
  readonly acceptedReviewerCount: number;
  readonly missingReviewerCount: number;
  readonly withdrawnAssignmentCount: number;
  readonly coverageStatus: "complete" | "incomplete";
  readonly assignedReviewerIds: readonly CommunityReviewReviewerId[];
  readonly acceptedReviewerIds: readonly CommunityReviewReviewerId[];
  readonly missingReviewerIds: readonly CommunityReviewReviewerId[];
  readonly withdrawnReviewerIds: readonly CommunityReviewReviewerId[];
}

export interface CommunityReviewBatchCloseRecord {
  readonly schemaVersion: typeof COMMUNITY_REVIEW_SCHEMA_VERSION;
  readonly recordKind: typeof COMMUNITY_REVIEW_CLOSE_RECORD_KIND;
  readonly dataKind: CommunityReviewDataKind;
  readonly fixture?: CommunityReviewSyntheticFixtureMarker;
  readonly protocolId: typeof COMMUNITY_REVIEW_PROTOCOL_ID;
  readonly protocolVersion: typeof COMMUNITY_REVIEW_PROTOCOL_VERSION;
  readonly batchId: string;
  readonly batchFingerprint: CommunityReviewFingerprint;
  readonly instrument: CommunityReviewInstrumentIdentity;
  readonly qualificationEligibility: CommunityReviewQualificationEligibility;
  readonly visibleTaskSetFingerprint: CommunityReviewFingerprint;
  readonly batchPurpose: CommunityReviewBatchPurpose;
  readonly blindnessMode: typeof COMMUNITY_REVIEW_BLINDNESS_MODE;
  readonly state: "CLOSED";
  readonly acceptedAssignmentIds: readonly string[];
  readonly acceptedReviewerIds: readonly CommunityReviewReviewerId[];
  readonly acceptedSubmissionFingerprints: readonly CommunityReviewFingerprint[];
  readonly coverage: CommunityReviewCoverage;
  readonly closeFingerprint: CommunityReviewFingerprint;
}

export interface CommunityReviewBatchCloseResult {
  readonly manifest: CommunityReviewBatchManifest;
  readonly closeRecord: CommunityReviewBatchCloseRecord;
  /** Validated, accepted submissions retained for the freeze step. */
  readonly acceptedSubmissions: readonly CommunityReviewSubmission[];
}

export interface FrozenCommunityReviewPool {
  readonly schemaVersion: typeof COMMUNITY_REVIEW_SCHEMA_VERSION;
  readonly poolKind: typeof COMMUNITY_REVIEW_POOL_KIND;
  readonly dataKind: CommunityReviewDataKind;
  readonly fixture?: CommunityReviewSyntheticFixtureMarker;
  readonly protocolId: typeof COMMUNITY_REVIEW_PROTOCOL_ID;
  readonly protocolVersion: typeof COMMUNITY_REVIEW_PROTOCOL_VERSION;
  readonly batchId: string;
  readonly batchFingerprint: CommunityReviewFingerprint;
  readonly closeRecordFingerprint: CommunityReviewFingerprint;
  readonly instrument: CommunityReviewInstrumentIdentity;
  readonly qualificationEligibility: CommunityReviewQualificationEligibility;
  readonly visibleTaskSetFingerprint: CommunityReviewFingerprint;
  readonly visibleAtomicIds: readonly CommunityReviewAtomicIdentity[];
  readonly batchPurpose: CommunityReviewBatchPurpose;
  readonly blindnessMode: typeof COMMUNITY_REVIEW_BLINDNESS_MODE;
  readonly state: "FROZEN";
  readonly acceptedAssignmentIds: readonly string[];
  readonly acceptedReviewerIds: readonly CommunityReviewReviewerId[];
  readonly acceptedSubmissionFingerprints: readonly CommunityReviewFingerprint[];
  readonly coverage: CommunityReviewCoverage;
  readonly submissions: readonly CommunityReviewSubmission[];
  readonly freezeFingerprint: CommunityReviewFingerprint;
}

export interface CommunityReviewStatusDistribution {
  readonly total: number;
  readonly counts: Readonly<Record<HumanAtomicStatus, number>>;
}

export interface CommunityReviewDisagreement extends CommunityReviewAtomicIdentity {
  readonly reviewerA: CommunityReviewReviewerId;
  readonly reviewerB: CommunityReviewReviewerId;
  readonly reviewerAStatus: HumanAtomicStatus;
  readonly reviewerBStatus: HumanAtomicStatus;
  readonly reviewerAEvidence?: string;
  readonly reviewerBEvidence?: string;
}

export interface CommunityReviewAgreementEvidence {
  readonly schemaVersion: typeof COMMUNITY_REVIEW_SCHEMA_VERSION;
  readonly agreementKind: typeof COMMUNITY_REVIEW_AGREEMENT_KIND;
  readonly poolFingerprint: CommunityReviewFingerprint;
  readonly reviewerIds: readonly CommunityReviewReviewerId[];
  readonly pairwise: readonly HumanPairwiseAgreementReport[];
  readonly comparableAtomicCount: number;
  readonly agreementCount: number;
  readonly disagreementCount: number;
  readonly agreementShare: number | null;
  /** Rows are reviewer-pair left statuses; columns are right statuses. */
  readonly confusionMatrix: HumanAtomicConfusionMatrix;
  readonly perRequirement: Readonly<Record<string, CommunityReviewStatusDistribution>>;
  readonly perCase: Readonly<Record<string, CommunityReviewStatusDistribution>>;
  readonly disagreements: readonly CommunityReviewDisagreement[];
  readonly missingOrWithdrawnAssignmentCount: number;
  readonly limitations: readonly string[];
}

export interface CommunityReviewDisclosurePolicy {
  readonly publishReviewerIds: boolean;
  readonly publishAtomicAnnotations: boolean;
  readonly publishReviewerEvidence: boolean;
}

export interface CommunityReviewPublicSubmission {
  readonly reviewerId?: CommunityReviewReviewerId;
  readonly submissionFingerprint: CommunityReviewFingerprint;
  readonly annotations: readonly CommunityReviewAnnotation[];
}

export interface CommunityReviewPublicAgreement {
  readonly comparableAtomicCount: number;
  readonly agreementCount: number;
  readonly disagreementCount: number;
  readonly agreementShare: number | null;
  readonly confusionMatrix: HumanAtomicConfusionMatrix;
  readonly perRequirement: Readonly<Record<string, CommunityReviewStatusDistribution>>;
  readonly perCase: Readonly<Record<string, CommunityReviewStatusDistribution>>;
  readonly disagreements: readonly CommunityReviewDisagreement[];
  readonly pairwiseReviewerCount: number;
  readonly missingOrWithdrawnAssignmentCount: number;
}

export interface CommunityReviewPublicEvidenceArtifact {
  readonly schemaVersion: typeof COMMUNITY_REVIEW_SCHEMA_VERSION;
  readonly artifactKind: typeof COMMUNITY_REVIEW_PUBLIC_ARTIFACT_KIND;
  readonly dataKind: CommunityReviewDataKind;
  readonly fixture?: CommunityReviewSyntheticFixtureMarker;
  readonly protocolId: typeof COMMUNITY_REVIEW_PROTOCOL_ID;
  readonly protocolVersion: typeof COMMUNITY_REVIEW_PROTOCOL_VERSION;
  readonly batchId: string;
  readonly batchFingerprint: CommunityReviewFingerprint;
  readonly instrument: CommunityReviewInstrumentIdentity;
  readonly qualificationEligibility: CommunityReviewQualificationEligibility;
  readonly visibleTaskSetFingerprint: CommunityReviewFingerprint;
  readonly state: "FROZEN";
  readonly frozenPoolFingerprint: CommunityReviewFingerprint;
  readonly acceptedSubmissionFingerprints: readonly CommunityReviewFingerprint[];
  readonly disclosureDate: string;
  readonly disclosurePolicy: CommunityReviewDisclosurePolicy;
  readonly publishedReviewerIds?: readonly CommunityReviewReviewerId[];
  readonly publishedSubmissions?: readonly CommunityReviewPublicSubmission[];
  readonly agreement: CommunityReviewPublicAgreement;
  readonly limitations: readonly string[];
}
