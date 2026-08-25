import {
  HUMAN_REFERENCE_PROTOCOL_ID,
  HUMAN_REFERENCE_PROTOCOL_VERSION,
  type HumanReferenceAtomicAgreement,
  type HumanReferenceCoverage,
  type HumanReferenceDataKind,
  type HumanReferenceDerivedAgreement,
  type HumanReferenceProvenance,
} from "./human-reference-calibration.js";
import type {
  MaterialRequirementJudgeResult,
} from "./material-requirement-judge.js";
import type { TutorEvalJudgeMetrics } from "./result.js";

export const HUMAN_REFERENCE_JUDGE_COMPARISON_REPORT_SCHEMA_VERSION = 1 as const;
export const HUMAN_REFERENCE_JUDGE_COMPARISON_REPORT_KIND =
  "human-reference-judge-comparison" as const;

export type HumanReferenceJudgeComparisonExecutionStatus =
  | "completed"
  | "execution_error"
  | "execution_invalid";

export interface HumanReferenceJudgeComparisonJudgeIdentity {
  readonly provider: string;
  readonly model: string;
  readonly promptId: string;
  readonly promptVersion: string;
}

export interface HumanReferenceJudgeComparisonTokenCoverage {
  readonly completeTotal: number | null;
  readonly knownTotal: number | null;
  readonly knownCount: number;
  readonly plannedCount: number;
  readonly unavailableCount: number;
  readonly coverageShare: number;
}

export interface HumanReferenceJudgeComparisonTokenUsageCoverage {
  readonly inputTokens: HumanReferenceJudgeComparisonTokenCoverage;
  readonly outputTokens: HumanReferenceJudgeComparisonTokenCoverage;
  readonly totalTokens: HumanReferenceJudgeComparisonTokenCoverage;
}

export interface HumanReferenceJudgeComparisonRequirementAgreement {
  readonly comparableAtomicCount: number;
  readonly agreementCount: number;
  readonly disagreementCount: number;
  readonly agreementShare: number | null;
}

export type HumanReferenceJudgeComparisonProvenanceAgreement =
  HumanReferenceJudgeComparisonRequirementAgreement;

export interface HumanReferenceJudgeComparisonCaseReport {
  readonly caseId: string;
  readonly status: HumanReferenceJudgeComparisonExecutionStatus;
  readonly judgeResult?: MaterialRequirementJudgeResult;
  readonly referenceAgreement?: HumanReferenceAtomicAgreement;
  readonly derivedLabelAgreement?: HumanReferenceDerivedAgreement;
  readonly executionErrorCode?: string;
  readonly metrics?: TutorEvalJudgeMetrics;
}

export interface HumanReferenceJudgeComparisonExecutionErrors {
  readonly count: number;
  readonly byCode: Readonly<Record<string, number>>;
}

export interface HumanReferenceJudgeComparisonReport {
  readonly schemaVersion: typeof HUMAN_REFERENCE_JUDGE_COMPARISON_REPORT_SCHEMA_VERSION;
  readonly reportKind: typeof HUMAN_REFERENCE_JUDGE_COMPARISON_REPORT_KIND;
  readonly calibrationProtocolId: typeof HUMAN_REFERENCE_PROTOCOL_ID;
  readonly calibrationProtocolVersion: typeof HUMAN_REFERENCE_PROTOCOL_VERSION;
  readonly dataKind: HumanReferenceDataKind;
  readonly humanReferenceDataPresent: boolean;
  readonly referenceCoverage: HumanReferenceCoverage;
  readonly judge: HumanReferenceJudgeComparisonJudgeIdentity;
  readonly plannedJudgeCalls: number;
  /** Calls that reached a terminal observed or typed-error outcome. */
  readonly completedJudgeCalls: number;
  readonly executionErrors: HumanReferenceJudgeComparisonExecutionErrors;
  /** Agreement with resolved Human Reference atoms; never an accuracy claim. */
  readonly referenceAgreement: HumanReferenceAtomicAgreement;
  readonly derivedLabelAgreement: HumanReferenceDerivedAgreement;
  readonly perRequirementAgreement: Readonly<
    Record<string, HumanReferenceJudgeComparisonRequirementAgreement>
  >;
  readonly referenceProvenanceAgreement: Readonly<
    Record<HumanReferenceProvenance, HumanReferenceJudgeComparisonProvenanceAgreement>
  >;
  readonly perCase: readonly HumanReferenceJudgeComparisonCaseReport[];
  readonly tokenUsageCoverage: HumanReferenceJudgeComparisonTokenUsageCoverage;
  readonly limitations: readonly string[];
}
