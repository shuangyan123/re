import {
  MATERIAL_REQUIREMENT_ASSESSMENT_STATUSES,
  type MaterialRequirementAssessmentStatus,
  type MaterialRequirementJudgeInput,
} from "./material-requirement-judge.js";

export const HUMAN_REFERENCE_CALIBRATION_SCHEMA_VERSION = 1 as const;
export const HUMAN_REFERENCE_PROTOCOL_ID =
  "human-reference-material-calibration" as const;
export const HUMAN_REFERENCE_PROTOCOL_VERSION = "0.1.0" as const;
export const HUMAN_REFERENCE_EVIDENCE_MAX_LENGTH = 500 as const;

/** Human semantic labels intentionally reuse the Material Requirement Judge atoms. */
export const HUMAN_ATOMIC_STATUSES = MATERIAL_REQUIREMENT_ASSESSMENT_STATUSES;
export type HumanAtomicStatus = MaterialRequirementAssessmentStatus;

export type HumanAnnotationDataKind = "human-annotation" | "synthetic-fixture";
export type HumanReferenceDataKind = "human-reference" | "synthetic-fixture";

export interface HumanReferenceSyntheticFixtureMarker {
  readonly synthetic: true;
  readonly notHumanCalibrationData: true;
}

/**
 * The task adds only a calibration identity wrapper around the exact Judge
 * visible-input contract. It must not carry expected labels or prior output.
 */
export interface HumanReferenceAnnotationTask extends MaterialRequirementJudgeInput {
  readonly schemaVersion: typeof HUMAN_REFERENCE_CALIBRATION_SCHEMA_VERSION;
}

export interface HumanAtomicAnnotation {
  readonly schemaVersion: typeof HUMAN_REFERENCE_CALIBRATION_SCHEMA_VERSION;
  readonly caseId: string;
  readonly rubricId: string;
  readonly requirementId: string;
  /** Opaque stable identifier; never a person's name, email, or account. */
  readonly annotatorId: string;
  readonly status: HumanAtomicStatus;
  readonly evidence?: string;
}

export interface HumanAnnotationBatch {
  readonly schemaVersion: typeof HUMAN_REFERENCE_CALIBRATION_SCHEMA_VERSION;
  readonly batchId: string;
  readonly calibrationProtocolId: typeof HUMAN_REFERENCE_PROTOCOL_ID;
  readonly calibrationProtocolVersion: typeof HUMAN_REFERENCE_PROTOCOL_VERSION;
  readonly dataKind: HumanAnnotationDataKind;
  readonly fixture?: HumanReferenceSyntheticFixtureMarker;
  readonly tasks: readonly HumanReferenceAnnotationTask[];
  readonly annotations: readonly HumanAtomicAnnotation[];
}

export interface HumanAtomicAdjudication {
  readonly schemaVersion: typeof HUMAN_REFERENCE_CALIBRATION_SCHEMA_VERSION;
  readonly caseId: string;
  readonly rubricId: string;
  readonly requirementId: string;
  readonly sourceAnnotatorIds: readonly string[];
  readonly sourceStatuses: Readonly<Record<string, HumanAtomicStatus>>;
  readonly adjudicatedStatus: HumanAtomicStatus;
  readonly evidence?: string;
  readonly adjudicationReason?: string;
  /** Optional opaque identity for the adjudicator; never PII. */
  readonly adjudicatorId?: string;
}

export interface HumanAtomicIdentity {
  readonly caseId: string;
  readonly rubricId: string;
  readonly requirementId: string;
}

export interface HumanAtomicDisagreement extends HumanAtomicIdentity {
  readonly annotatorAStatus: HumanAtomicStatus;
  readonly annotatorBStatus: HumanAtomicStatus;
  readonly annotatorAEvidence?: string;
  readonly annotatorBEvidence?: string;
}

export interface HumanAtomicUnresolvedDisagreement extends HumanAtomicIdentity {
  readonly statuses: Readonly<Record<string, HumanAtomicStatus>>;
  readonly evidenceByAnnotator: Readonly<Record<string, string | undefined>>;
}

export interface HumanAtomicMissingAssessment extends HumanAtomicIdentity {
  readonly missingAnnotatorIds: readonly string[];
  readonly presentAnnotatorIds: readonly string[];
}

export type HumanAtomicConfusionMatrix = Readonly<
  Record<HumanAtomicStatus, Readonly<Record<HumanAtomicStatus, number>>>
>;

export interface HumanPairwiseStatusSummary {
  readonly annotatorACount: number;
  readonly annotatorBCount: number;
  readonly comparableCount: number;
  readonly agreementCount: number;
  readonly disagreementCount: number;
}

export interface HumanPairwiseAgreementReport {
  readonly annotatorA: string;
  readonly annotatorB: string;
  readonly comparableAtomicCount: number;
  readonly agreementCount: number;
  readonly disagreementCount: number;
  readonly agreementShare: number | null;
  /** Rows are annotator A; columns are annotator B. */
  readonly confusionMatrix: HumanAtomicConfusionMatrix;
  readonly byStatus: Readonly<Record<HumanAtomicStatus, HumanPairwiseStatusSummary>>;
  readonly disagreements: readonly HumanAtomicDisagreement[];
  /** Missing availability is reported separately and never enters the denominator. */
  readonly missingForAnnotatorA: readonly HumanAtomicIdentity[];
  readonly missingForAnnotatorB: readonly HumanAtomicIdentity[];
}

export type HumanReferenceProvenance = "human_consensus" | "human_adjudicated";

export interface ReferenceAtomicAssessment extends HumanAtomicIdentity {
  readonly status: HumanAtomicStatus;
  readonly provenance: HumanReferenceProvenance;
  readonly sourceAnnotatorIds: readonly string[];
}

export interface HumanReferenceDerivedLabel {
  readonly caseId: string;
  readonly rubricId: string;
  readonly label: "PASS" | "PARTIAL" | "FAIL";
}

export interface HumanReferenceCoverage {
  readonly plannedAtomicAssessments: number;
  readonly resolvedAtomicAssessments: number;
  readonly unresolvedAtomicAssessments: number;
  readonly missingAtomicAssessments: number;
  readonly referenceCoverageShare: number | null;
}

export interface HumanReferenceSet {
  readonly schemaVersion: typeof HUMAN_REFERENCE_CALIBRATION_SCHEMA_VERSION;
  readonly calibrationProtocolId: typeof HUMAN_REFERENCE_PROTOCOL_ID;
  readonly calibrationProtocolVersion: typeof HUMAN_REFERENCE_PROTOCOL_VERSION;
  readonly dataKind: HumanReferenceDataKind;
  readonly fixture?: HumanReferenceSyntheticFixtureMarker;
  readonly humanCalibrationAvailable: boolean;
  readonly tasks: readonly HumanReferenceAnnotationTask[];
  readonly references: readonly ReferenceAtomicAssessment[];
  readonly unresolvedDisagreements: readonly HumanAtomicUnresolvedDisagreement[];
  readonly missingAnnotations: readonly HumanAtomicMissingAssessment[];
  readonly coverage: HumanReferenceCoverage;
}

export interface HumanReferenceSetBuildInput {
  readonly tasks: readonly HumanReferenceAnnotationTask[];
  readonly annotations: readonly HumanAtomicAnnotation[];
  readonly requiredAnnotatorIds: readonly string[];
  readonly adjudications?: readonly HumanAtomicAdjudication[];
  readonly dataKind?: HumanReferenceDataKind;
  readonly fixture?: HumanReferenceSyntheticFixtureMarker;
}

export interface HumanReferenceJudgeAtomicDisagreement extends HumanAtomicIdentity {
  readonly referenceStatus: HumanAtomicStatus;
  readonly judgeStatus: HumanAtomicStatus;
  readonly referenceProvenance: HumanReferenceProvenance;
  readonly referenceSourceAnnotatorIds: readonly string[];
  readonly judgeEvidence?: string;
}

export interface HumanReferenceAtomicAgreement {
  readonly comparableAtomicCount: number;
  readonly agreementCount: number;
  readonly disagreementCount: number;
  readonly agreementShare: number | null;
  /** Rows are reference statuses; columns are Judge statuses. */
  readonly confusionMatrix: HumanAtomicConfusionMatrix;
  readonly disagreements: readonly HumanReferenceJudgeAtomicDisagreement[];
}

export interface HumanReferenceDerivedDisagreement {
  readonly caseId: string;
  readonly rubricId: string;
  readonly referenceLabel: "PASS" | "PARTIAL" | "FAIL";
  readonly judgeLabel: "PASS" | "PARTIAL" | "FAIL";
}

export interface HumanReferenceDerivedAgreement {
  readonly comparableRubricCount: number;
  readonly agreementCount: number;
  readonly disagreementCount: number;
  readonly agreementShare: number | null;
  readonly disagreements: readonly HumanReferenceDerivedDisagreement[];
}

export interface HumanReferenceJudgeComparison {
  /** Use referenceAgreement, not accuracy, until a calibration protocol is established. */
  readonly referenceAgreement: HumanReferenceAtomicAgreement;
  readonly derivedLabelAgreement: HumanReferenceDerivedAgreement;
}
