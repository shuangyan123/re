import type {
  DisclosurePolicy,
  TutorCriticalFailure,
  TutorCriticalFailureSeverity,
  TutorEvalCase,
  TutorEvalDataset,
} from "./tutor-eval.js";
import type { SyntheticFixtureMarker } from "./calibration.js";

/** Independent versions: the existing rubric calibration schema remains v1. */
export const CALIBRATION_CRITICAL_FAILURE_SCHEMA_VERSION = 1 as const;
export const CALIBRATION_CRITICAL_FAILURE_PACKET_SCHEMA_VERSION = 1 as const;
export const CALIBRATION_CRITICAL_FAILURE_REFERENCE_SET_SCHEMA_VERSION = 1 as const;
export const CALIBRATION_CRITICAL_FAILURE_REPORT_SCHEMA_VERSION = 1 as const;

export type CriticalFailureAnnotationDecision = "PRESENT" | "ABSENT" | "UNSURE";
export type ScoredCriticalFailureDecision = Exclude<
  CriticalFailureAnnotationDecision,
  "UNSURE"
>;

export type CriticalFailureAnnotationDataKind =
  | "human-critical-failure-annotation"
  | "synthetic-fixture";
export type CriticalFailureAdjudicationDataKind =
  | "human-critical-failure-adjudication"
  | "synthetic-fixture";
export type CriticalFailureTargetDataKind =
  | "critical-failure-targets"
  | "synthetic-fixture";

/** Wording is kept aligned with docs/critical-failure-quality-gate-audit.md. */
export const CALIBRATION_CRITICAL_FAILURE_SEVERITY_GUIDANCE = {
  minor: "Low-impact, recoverable, or diagnostic deviation that does not materially defeat the case objective.",
  major: "Materially defeats the case objective, materially misleads the learner, or materially violates the disclosure or interaction boundary.",
  critical: "Central or widespread failure that is severely harmful, makes the response unusable, or fully substitutes for the learner task where the taxonomy defines that boundary.",
} as const satisfies Readonly<
  Record<TutorCriticalFailureSeverity, string>
>;

export interface CalibrationCriticalFailureReviewerContext {
  readonly caseObjective: string;
  readonly failureDefinition: string;
  readonly severityGuidance: Readonly<
    Record<TutorCriticalFailureSeverity, string>
  >;
  readonly disclosurePolicy?: DisclosurePolicy;
  readonly knownMisconception?: string;
  /** Only present for diagnosis-related targets; never contains a Judge label. */
  readonly diagnosisContext?: {
    readonly caseObjective: string;
    readonly knownMisconception?: string;
  };
}

/**
 * An explicit calibration-layer registry entry. It declares applicability for
 * one candidate response and one failure type without changing dataset JSON.
 */
export interface CalibrationCriticalFailureTarget {
  readonly targetId: string;
  readonly datasetId: string;
  readonly datasetVersion: string;
  readonly caseId: string;
  readonly caseVersion: string;
  readonly responseId: string;
  readonly failureType: TutorCriticalFailure;
}

export interface CalibrationCriticalFailureTargetFile {
  readonly schemaVersion: typeof CALIBRATION_CRITICAL_FAILURE_SCHEMA_VERSION;
  readonly dataKind: CriticalFailureTargetDataKind;
  readonly fixture?: SyntheticFixtureMarker;
  readonly datasetId: string;
  readonly datasetVersion: string;
  readonly targets: readonly CalibrationCriticalFailureTarget[];
}

export interface CalibrationCriticalFailurePacketEntry {
  readonly entryId: string;
  readonly caseId: string;
  readonly caseVersion: string;
  readonly responseId: string;
  readonly failureType: TutorCriticalFailure;
  readonly studentVisibleContext: TutorEvalCase["tutorInput"];
  readonly candidateResponse: string;
  readonly reviewerContext: CalibrationCriticalFailureReviewerContext;
}

export interface CalibrationCriticalFailurePacket {
  readonly schemaVersion: typeof CALIBRATION_CRITICAL_FAILURE_PACKET_SCHEMA_VERSION;
  readonly datasetId: string;
  readonly datasetVersion: string;
  readonly blind: true;
  readonly entries: readonly CalibrationCriticalFailurePacketEntry[];
}

export interface HumanCriticalFailureAnnotation {
  readonly schemaVersion: typeof CALIBRATION_CRITICAL_FAILURE_SCHEMA_VERSION;
  readonly annotationId: string;
  readonly targetId: string;
  readonly datasetId: string;
  readonly datasetVersion: string;
  readonly caseId: string;
  readonly caseVersion: string;
  readonly responseId: string;
  /**
   * Required only for PRESENT. ABSENT and UNSURE use the target registry's
   * failure type and must not repeat it as an annotation claim.
   */
  readonly failureType?: TutorCriticalFailure;
  /** A pseudonymous identifier, never a person's contact or account. */
  readonly reviewerId: string;
  readonly decision: CriticalFailureAnnotationDecision;
  /** Required for PRESENT; forbidden for ABSENT and UNSURE. */
  readonly severity?: TutorCriticalFailureSeverity;
  /** Short, observable evidence grounded in candidateResponse. */
  readonly evidence?: string;
  readonly ambiguity?: {
    readonly present: boolean;
    readonly reason?: string;
  };
  readonly createdAt: string;
}

export interface CalibrationCriticalFailureAnnotationFile {
  readonly schemaVersion: typeof CALIBRATION_CRITICAL_FAILURE_SCHEMA_VERSION;
  readonly dataKind: CriticalFailureAnnotationDataKind;
  readonly fixture?: SyntheticFixtureMarker;
  readonly datasetId: string;
  readonly datasetVersion: string;
  readonly reviewerId: string;
  readonly annotations: readonly HumanCriticalFailureAnnotation[];
}

export interface CriticalFailureAdjudication {
  readonly schemaVersion: typeof CALIBRATION_CRITICAL_FAILURE_SCHEMA_VERSION;
  readonly adjudicationId: string;
  readonly targetId: string;
  readonly datasetId: string;
  readonly datasetVersion: string;
  readonly caseId: string;
  readonly caseVersion: string;
  readonly responseId: string;
  readonly failureType: TutorCriticalFailure;
  readonly sourceAnnotationIds: readonly string[];
  readonly finalDecision: ScoredCriticalFailureDecision;
  readonly finalFailureType?: TutorCriticalFailure;
  readonly finalSeverity?: TutorCriticalFailureSeverity;
  readonly rationale: string;
  /** A pseudonymous identifier, never a person's contact or account. */
  readonly adjudicatorId: string;
  readonly createdAt: string;
}

export interface CalibrationCriticalFailureAdjudicationFile {
  readonly schemaVersion: typeof CALIBRATION_CRITICAL_FAILURE_SCHEMA_VERSION;
  readonly dataKind: CriticalFailureAdjudicationDataKind;
  readonly fixture?: SyntheticFixtureMarker;
  readonly datasetId: string;
  readonly datasetVersion: string;
  readonly adjudicatorId: string;
  readonly adjudications: readonly CriticalFailureAdjudication[];
}

export type CriticalFailureAdjudicationStatus =
  | "not_required"
  | "required"
  | "completed";

export interface CalibrationCriticalFailureReferenceLabel {
  readonly referenceId: string;
  readonly targetId: string;
  readonly datasetId: string;
  readonly datasetVersion: string;
  readonly caseId: string;
  readonly caseVersion: string;
  readonly responseId: string;
  readonly failureType: TutorCriticalFailure;
  readonly finalDecision: ScoredCriticalFailureDecision;
  readonly finalSeverity?: TutorCriticalFailureSeverity;
  readonly sourceAnnotationIds: readonly string[];
  readonly reviewerCount: number;
  readonly agreement: "exact" | "disagreement";
  readonly adjudicationStatus: CriticalFailureAdjudicationStatus;
  readonly adjudicationId?: string;
}

export interface CalibrationCriticalFailureReferenceSet {
  readonly schemaVersion: typeof CALIBRATION_CRITICAL_FAILURE_REFERENCE_SET_SCHEMA_VERSION;
  readonly datasetId: string;
  readonly datasetVersion: string;
  readonly dataKind: "human-critical-failure-reference" | "synthetic-fixture";
  readonly humanCalibrationAvailable: boolean;
  readonly reviewerCount: number;
  readonly labels: readonly CalibrationCriticalFailureReferenceLabel[];
}

export interface CriticalFailureJudgmentIdentity {
  readonly targetId: string;
  readonly datasetId: string;
  readonly datasetVersion: string;
  readonly caseId: string;
  readonly caseVersion: string;
  readonly responseId: string;
  /** Resolved from the target registry when a non-PRESENT annotation omits it. */
  readonly failureType?: TutorCriticalFailure;
}

export interface CriticalFailureDisagreement extends CriticalFailureJudgmentIdentity {
  readonly reviewerLabels: Readonly<
    Record<string, CriticalFailureAnnotationDecision>
  >;
  readonly reviewerSeverities?: Readonly<
    Record<string, TutorCriticalFailureSeverity | null>
  >;
}

export interface CriticalFailurePresenceConfusionMatrix {
  readonly PRESENT: Readonly<Record<ScoredCriticalFailureDecision, number>>;
  readonly ABSENT: Readonly<Record<ScoredCriticalFailureDecision, number>>;
}

export interface CriticalFailureSeverityConfusionMatrix {
  readonly minor: Readonly<Record<TutorCriticalFailureSeverity, number>>;
  readonly major: Readonly<Record<TutorCriticalFailureSeverity, number>>;
  readonly critical: Readonly<Record<TutorCriticalFailureSeverity, number>>;
}

export interface CriticalFailureSeverityAgreementMetrics {
  readonly pairedJudgmentCount: number;
  readonly exactAgreement: number | null;
  readonly weightedCohenKappa: number | null;
  readonly confusionMatrix: CriticalFailureSeverityConfusionMatrix;
  readonly disagreements: readonly CriticalFailureDisagreement[];
}

/** Type agreement compares the set of PRESENT target types per response. */
export interface CriticalFailureTypeAgreementMetrics {
  readonly pairedResponseCount: number;
  readonly scoredResponseCount: number;
  readonly exactAgreement: number | null;
  readonly unsureResponseCount: number;
  readonly disagreements: readonly {
    readonly datasetId: string;
    readonly datasetVersion: string;
    readonly caseId: string;
    readonly caseVersion: string;
    readonly responseId: string;
    readonly leftFailureTypes: readonly TutorCriticalFailure[];
    readonly rightFailureTypes: readonly TutorCriticalFailure[];
  }[];
}

export interface CriticalFailureAgreementMetrics {
  readonly pairedJudgmentCount: number;
  /** Pairs with neither reviewer using UNSURE. */
  readonly scoredJudgmentCount: number;
  /** Exact decision equality across all paired labels, including UNSURE. */
  readonly exactAgreement: number | null;
  /** Exact decision equality after excluding pairs containing UNSURE. */
  readonly scoredExactAgreement: number | null;
  readonly cohenKappa: number | null;
  readonly unsurePairCount: number;
  readonly presenceConfusionMatrix: CriticalFailurePresenceConfusionMatrix;
  readonly severity: CriticalFailureSeverityAgreementMetrics;
  readonly type: CriticalFailureTypeAgreementMetrics;
  readonly disagreements: readonly CriticalFailureDisagreement[];
}

export interface CriticalFailureReviewerPairAgreement
  extends CriticalFailureAgreementMetrics {
  readonly leftReviewerId: string;
  readonly rightReviewerId: string;
  readonly unpairedLeft: readonly CriticalFailureJudgmentIdentity[];
  readonly unpairedRight: readonly CriticalFailureJudgmentIdentity[];
}

export interface CalibrationCriticalFailureAdjudicationSummary {
  readonly targetCount: number;
  readonly annotatedTargetCount: number;
  readonly requiredCount: number;
  readonly completedCount: number;
  readonly pendingCount: number;
  readonly notRequiredCount: number;
}

export interface CalibrationCriticalFailureReport {
  readonly schemaVersion: typeof CALIBRATION_CRITICAL_FAILURE_REPORT_SCHEMA_VERSION;
  readonly datasetId: string;
  readonly datasetVersion: string;
  readonly dataStatus: "no-data" | "synthetic-fixture" | "human-calibration";
  readonly humanCalibrationAvailable: boolean;
  readonly candidateResponseCount: number;
  readonly reviewTargetCount: number;
  readonly annotationCount: number;
  readonly reviewerCount: number;
  readonly metrics: CriticalFailureAgreementMetrics | null;
  readonly reviewerPairAgreement: readonly CriticalFailureReviewerPairAgreement[];
  readonly agreementByFailureType: Readonly<
    Record<TutorCriticalFailure, CriticalFailureAgreementSlice>
  >;
  readonly agreementBySubject: Readonly<
    Record<string, CriticalFailureAgreementSlice>
  >;
  readonly agreementByDisclosurePolicy: Readonly<
    Record<string, CriticalFailureAgreementSlice>
  >;
  readonly highestDisagreement: readonly CriticalFailureDisagreement[];
  readonly adjudication: CalibrationCriticalFailureAdjudicationSummary;
  readonly referenceSet: CalibrationCriticalFailureReferenceSet | null;
}

export interface CriticalFailureAgreementSlice {
  readonly pairedJudgmentCount: number;
  readonly scoredJudgmentCount: number;
  readonly exactAgreement: number | null;
  readonly scoredExactAgreement: number | null;
  readonly cohenKappa: number | null;
  readonly unsurePairCount: number;
  readonly disagreementCount: number;
}

/** Provider-independent view of a future Judge label. */
export interface CalibrationJudgeCriticalFailureLabel {
  readonly schemaVersion: typeof CALIBRATION_CRITICAL_FAILURE_SCHEMA_VERSION;
  readonly targetId: string;
  readonly datasetId: string;
  readonly datasetVersion: string;
  readonly caseId: string;
  readonly caseVersion: string;
  readonly responseId: string;
  readonly failureType: TutorCriticalFailure;
  readonly decision: ScoredCriticalFailureDecision;
  readonly severity?: TutorCriticalFailureSeverity;
}

export interface CriticalFailureComparisonBreakdown {
  readonly pairedLabelCount: number;
  readonly exactPresenceAgreement: number | null;
  readonly falsePositiveCount: number;
  readonly falseNegativeCount: number;
  readonly precision: number | null;
  readonly recall: number | null;
  readonly f1: number | null;
  readonly severityExactAgreement: number | null;
  readonly weightedSeverityAgreement: number | null;
}

export interface CalibrationJudgeCriticalFailureComparison {
  readonly pairedLabelCount: number;
  readonly unpairedReferenceCount: number;
  readonly unpairedJudgeCount: number;
  readonly exactPresenceAgreement: number | null;
  readonly falsePositiveCount: number;
  readonly falseNegativeCount: number;
  readonly precision: number | null;
  readonly recall: number | null;
  readonly f1: number | null;
  readonly typeExactAgreement: number | null;
  readonly severityExactAgreement: number | null;
  readonly weightedSeverityAgreement: number | null;
  readonly byFailureType: Readonly<
    Record<TutorCriticalFailure, CriticalFailureComparisonBreakdown>
  >;
  readonly bySeverity: Readonly<
    Record<TutorCriticalFailureSeverity, CriticalFailureComparisonBreakdown>
  >;
  readonly byCase: Readonly<Record<string, CriticalFailureComparisonBreakdown>>;
  readonly bySubject: Readonly<Record<string, CriticalFailureComparisonBreakdown>>;
  readonly byDisclosurePolicy: Readonly<
    Record<string, CriticalFailureComparisonBreakdown>
  >;
}

/** The case context used to build deterministic critical-review targets. */
export interface CriticalFailureCalibrationContext {
  readonly dataset: TutorEvalDataset;
  readonly candidates: import("./calibration.js").CalibrationCandidateResponseFile;
  readonly targetFile: CalibrationCriticalFailureTargetFile;
}
