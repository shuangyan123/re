import type {
  DisclosurePolicy,
  TutorEvalCase,
  TutorEvalCategory,
  TutorEvalGroundTruth,
} from "./tutor-eval.js";
import type { TutorEvalRubricBehavior } from "./rubric.js";
import type { TutorEvalCapabilityTag } from "./tutor-eval-taxonomy.js";
import type { TutorEvalTutorDescriptor } from "./result.js";
import type { TutorResponseCorpusSemanticReplay } from "./tutor-response-replay.js";

export const CALIBRATION_CONTRACT_SCHEMA_VERSION = 1 as const;
export const CALIBRATION_PACKET_SCHEMA_VERSION = 1 as const;
export const CALIBRATION_REFERENCE_SET_SCHEMA_VERSION = 1 as const;
export const CALIBRATION_REPORT_SCHEMA_VERSION = 1 as const;

export type CalibrationResponseProvenance =
  | "synthetic"
  | "model"
  | "human-authored"
  | "recorded_model"
  | "review_workspace"
  | "external";

/** Internal response provenance is never copied into a reviewer packet. */
export type CalibrationTutorDescriptor = Partial<
  Pick<
    TutorEvalTutorDescriptor,
    | "provider"
    | "model"
    | "modelVersion"
    | "promptId"
    | "promptVersion"
    | "temperature"
    | "reasoningEffort"
    | "seed"
  >
>;

/** Optional identity carried over from a TutorEval run. */
export interface CalibrationSourceRun {
  readonly runId: string;
  readonly runIndex: number;
}

export interface CalibrationSourceCorpus {
  readonly corpusId: string;
  readonly corpusVersion: string;
}

/**
 * A candidate may be evaluated under a target dataset identity while keeping
 * the immutable source response identity. This is provenance, not a response
 * migration or a re-signed target-native response.
 */
export type CalibrationSemanticReplayProvenance = TutorResponseCorpusSemanticReplay;

export interface CalibrationCandidateResponse {
  readonly schemaVersion: typeof CALIBRATION_CONTRACT_SCHEMA_VERSION;
  /** Immutable response identity; semantic replay never re-signs this value. */
  readonly responseId: string;
  readonly datasetId: string;
  readonly datasetVersion: string;
  readonly caseId: string;
  readonly caseVersion: string;
  readonly tutorDescriptor?: CalibrationTutorDescriptor;
  readonly sourceRun?: CalibrationSourceRun;
  readonly sourceCorpus?: CalibrationSourceCorpus;
  readonly semanticReplay?: CalibrationSemanticReplayProvenance;
  readonly responseText: string;
  readonly provenance: CalibrationResponseProvenance;
}

export type CalibrationAnnotationDataKind =
  | "human-annotation"
  | "synthetic-fixture";
export type CalibrationAdjudicationDataKind =
  | "human-adjudication"
  | "synthetic-fixture";
export type CalibrationCandidateDataKind = "candidate-corpus" | "synthetic-fixture";

export interface SyntheticFixtureMarker {
  readonly synthetic: true;
  readonly notHumanCalibrationData: true;
}

export type CalibrationLabel = "PASS" | "PARTIAL" | "FAIL" | "UNSURE";
export type ScoredCalibrationLabel = Exclude<CalibrationLabel, "UNSURE">;

export interface HumanRubricAnnotation {
  readonly schemaVersion: typeof CALIBRATION_CONTRACT_SCHEMA_VERSION;
  readonly annotationId: string;
  readonly datasetId: string;
  readonly datasetVersion: string;
  readonly caseId: string;
  readonly caseVersion: string;
  readonly responseId: string;
  readonly rubricId: string;
  /** A pseudonymous identifier, never a person's contact or account. */
  readonly reviewerId: string;
  readonly label: CalibrationLabel;
  readonly evidence?: string;
  readonly ambiguity?: {
    readonly present: boolean;
    readonly reason?: string;
  };
  readonly createdAt: string;
}

export interface CalibrationCandidateResponseFile {
  readonly schemaVersion: typeof CALIBRATION_CONTRACT_SCHEMA_VERSION;
  readonly dataKind: CalibrationCandidateDataKind;
  readonly fixture?: SyntheticFixtureMarker;
  readonly datasetId: string;
  readonly datasetVersion: string;
  readonly responses: readonly CalibrationCandidateResponse[];
}

export interface CalibrationAnnotationFile {
  readonly schemaVersion: typeof CALIBRATION_CONTRACT_SCHEMA_VERSION;
  readonly dataKind: CalibrationAnnotationDataKind;
  readonly fixture?: SyntheticFixtureMarker;
  readonly datasetId: string;
  readonly datasetVersion: string;
  readonly reviewerId: string;
  readonly annotations: readonly HumanRubricAnnotation[];
}

export interface RubricAdjudication {
  readonly schemaVersion: typeof CALIBRATION_CONTRACT_SCHEMA_VERSION;
  readonly adjudicationId: string;
  readonly datasetId: string;
  readonly datasetVersion: string;
  readonly caseId: string;
  readonly caseVersion: string;
  readonly responseId: string;
  readonly rubricId: string;
  readonly sourceAnnotationIds: readonly string[];
  readonly finalLabel: ScoredCalibrationLabel;
  readonly rationale: string;
  /** A pseudonymous identifier, never a person's contact or account. */
  readonly adjudicatorId: string;
  readonly createdAt: string;
}

export interface CalibrationAdjudicationFile {
  readonly schemaVersion: typeof CALIBRATION_CONTRACT_SCHEMA_VERSION;
  readonly dataKind: CalibrationAdjudicationDataKind;
  readonly fixture?: SyntheticFixtureMarker;
  readonly datasetId: string;
  readonly datasetVersion: string;
  readonly adjudicatorId: string;
  readonly adjudications: readonly RubricAdjudication[];
}

export interface CalibrationGroundTruthContext {
  readonly finalAnswer?: string;
  readonly acceptedAnswers?: readonly string[];
  readonly requiredConcepts?: readonly string[];
  readonly explanation?: string;
}

export interface CalibrationPacketRubric {
  readonly rubricId: string;
  readonly category: TutorEvalCategory;
  readonly criterion: string;
  readonly behavior: TutorEvalRubricBehavior;
  readonly capabilityTag?: TutorEvalCapabilityTag;
}

/**
 * Explicitly separates the Tutor-visible case input from evaluator-only
 * material that a human reviewer may need for this one judgment.
 */
export interface CalibrationPacketEntry {
  readonly entryId: string;
  readonly caseId: string;
  readonly caseVersion: string;
  readonly responseId: string;
  readonly studentVisibleContext: TutorEvalCase["tutorInput"];
  readonly candidateResponse: string;
  readonly rubric: CalibrationPacketRubric;
  readonly reviewerContext?: {
    readonly disclosurePolicy?: DisclosurePolicy;
    readonly groundTruth?: CalibrationGroundTruthContext;
    readonly knownMisconception?: string;
  };
}

export interface CalibrationPacket {
  readonly schemaVersion: typeof CALIBRATION_PACKET_SCHEMA_VERSION;
  readonly datasetId: string;
  readonly datasetVersion: string;
  readonly blind: true;
  readonly entries: readonly CalibrationPacketEntry[];
}

export type CalibrationAdjudicationStatus =
  | "not_required"
  | "required"
  | "completed";

export interface CalibrationReferenceLabel {
  readonly referenceId: string;
  readonly datasetId: string;
  readonly datasetVersion: string;
  readonly caseId: string;
  readonly caseVersion: string;
  readonly responseId: string;
  readonly rubricId: string;
  readonly finalLabel: ScoredCalibrationLabel;
  readonly sourceAnnotationIds: readonly string[];
  readonly reviewerCount: number;
  readonly agreement: "exact" | "disagreement";
  readonly adjudicationStatus: CalibrationAdjudicationStatus;
  readonly adjudicationId?: string;
}

export interface CalibrationReferenceSet {
  readonly schemaVersion: typeof CALIBRATION_REFERENCE_SET_SCHEMA_VERSION;
  readonly datasetId: string;
  readonly datasetVersion: string;
  readonly dataKind: "human-reference" | "synthetic-fixture";
  readonly humanCalibrationAvailable: boolean;
  readonly reviewerCount: number;
  readonly labels: readonly CalibrationReferenceLabel[];
}

/**
 * Future 0.3 Judge output boundary. It intentionally contains no provider,
 * prompt, confidence, or raw model payload fields.
 */
export interface CalibrationJudgeRubricLabel {
  readonly schemaVersion: typeof CALIBRATION_CONTRACT_SCHEMA_VERSION;
  readonly datasetId: string;
  readonly datasetVersion: string;
  readonly caseId: string;
  readonly caseVersion: string;
  readonly responseId: string;
  readonly rubricId: string;
  readonly label: ScoredCalibrationLabel;
}

export interface CalibrationConfusionMatrix {
  readonly PASS: Readonly<Record<ScoredCalibrationLabel, number>>;
  readonly PARTIAL: Readonly<Record<ScoredCalibrationLabel, number>>;
  readonly FAIL: Readonly<Record<ScoredCalibrationLabel, number>>;
}

export interface CalibrationJudgmentIdentity {
  readonly datasetId: string;
  readonly datasetVersion: string;
  readonly caseId: string;
  readonly caseVersion: string;
  readonly responseId: string;
  readonly rubricId: string;
}

export interface CalibrationDisagreement extends CalibrationJudgmentIdentity {
  readonly reviewerLabels: Readonly<Record<string, CalibrationLabel>>;
}

export interface CalibrationAgreementMetrics {
  readonly pairedJudgmentCount: number;
  /** Pairs with neither reviewer using UNSURE. */
  readonly scoredJudgmentCount: number;
  /** Exact equality across all paired labels, including UNSURE. */
  readonly exactAgreement: number | null;
  /** Exact equality after excluding pairs containing UNSURE. */
  readonly scoredExactAgreement: number | null;
  readonly cohenKappa: number | null;
  /** Linear ordinal weights: PASS/PARTIAL/FAIL are equally spaced. */
  readonly weightedCohenKappa: number | null;
  readonly unsurePairCount: number;
  readonly confusionMatrix: CalibrationConfusionMatrix;
  readonly disagreements: readonly CalibrationDisagreement[];
}

export interface CalibrationReviewerPairAgreement
  extends CalibrationAgreementMetrics {
  readonly leftReviewerId: string;
  readonly rightReviewerId: string;
  readonly unpairedLeft: readonly CalibrationJudgmentIdentity[];
  readonly unpairedRight: readonly CalibrationJudgmentIdentity[];
}

export interface CalibrationRateSummary {
  readonly annotationCount: number;
  readonly ambiguousAnnotationCount: number;
  readonly unsureAnnotationCount: number;
  readonly ambiguityRate: number | null;
  readonly unsureRate: number | null;
}

export interface CalibrationAgreementSlice {
  readonly pairedJudgmentCount: number;
  readonly scoredJudgmentCount: number;
  readonly exactAgreement: number | null;
  readonly scoredExactAgreement: number | null;
  readonly cohenKappa: number | null;
  readonly weightedCohenKappa: number | null;
  readonly unsurePairCount: number;
  readonly disagreementCount: number;
}

export interface CalibrationAdjudicationSummary {
  readonly candidateResponseCount: number;
  readonly annotatedResponseCount: number;
  readonly requiredCount: number;
  readonly completedCount: number;
  readonly pendingCount: number;
  readonly notRequiredCount: number;
}

export interface CalibrationReport {
  readonly schemaVersion: typeof CALIBRATION_REPORT_SCHEMA_VERSION;
  readonly datasetId: string;
  readonly datasetVersion: string;
  readonly dataStatus:
    | "no-data"
    | "synthetic-fixture"
    | "human-calibration";
  readonly humanCalibrationAvailable: boolean;
  readonly candidateResponseCount: number;
  readonly annotatedResponseCount: number;
  readonly rubricJudgmentCount: number;
  readonly reviewerCount: number;
  readonly metrics: CalibrationAgreementMetrics | null;
  readonly reviewerPairAgreement: readonly CalibrationReviewerPairAgreement[];
  readonly ambiguity: CalibrationRateSummary;
  readonly ambiguityByCase: Readonly<Record<string, CalibrationRateSummary>>;
  readonly ambiguityByRubric: Readonly<Record<string, CalibrationRateSummary>>;
  readonly ambiguityByCategory: Readonly<Record<string, CalibrationRateSummary>>;
  readonly ambiguityByCapabilityTag: Readonly<Record<string, CalibrationRateSummary>>;
  readonly ambiguityBySubject: Readonly<Record<string, CalibrationRateSummary>>;
  readonly ambiguityByDisclosurePolicy: Readonly<Record<string, CalibrationRateSummary>>;
  readonly agreementByCategory: Readonly<Record<string, CalibrationAgreementSlice>>;
  readonly agreementByCapabilityTag: Readonly<Record<string, CalibrationAgreementSlice>>;
  readonly agreementBySubject: Readonly<Record<string, CalibrationAgreementSlice>>;
  readonly agreementByDisclosurePolicy: Readonly<Record<string, CalibrationAgreementSlice>>;
  readonly ambiguousRubrics: readonly string[];
  readonly highestDisagreement: readonly CalibrationDisagreement[];
  readonly adjudication: CalibrationAdjudicationSummary;
  readonly referenceSet: CalibrationReferenceSet | null;
}

export type CalibrationGroundTruth = TutorEvalGroundTruth;
