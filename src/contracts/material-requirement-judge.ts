import type { TutorEvalJudgeInput } from "./tutor-eval-judge.js";
import type { TutorEvalJudgeMetrics } from "./result.js";

export const MATERIAL_REQUIREMENT_JUDGE_SCHEMA_VERSION = 1 as const;

export const MATERIAL_REQUIREMENT_ASSESSMENT_STATUSES = [
  "SATISFIED",
  "OMITTED_OR_INCOMPLETE",
  "EXPLICIT_CONFLICT",
] as const;

export type MaterialRequirementAssessmentStatus =
  (typeof MATERIAL_REQUIREMENT_ASSESSMENT_STATUSES)[number];

export interface MaterialRequirement {
  readonly id: string;
  readonly description: string;
}

export interface MaterialRequirementRubric {
  readonly id: string;
  readonly criterion: string;
  readonly requirements: readonly MaterialRequirement[];
}

export type MaterialRequirementJudgeContext = Pick<
  TutorEvalJudgeInput,
  | "learningObjective"
  | "studentProfile"
  | "conversationHistory"
  | "studentMessage"
  | "problemContext"
  | "groundTruth"
  | "knownMisconception"
  | "disclosurePolicy"
>;

export interface MaterialRequirementJudgeInput extends MaterialRequirementJudgeContext {
  readonly caseId: string;
  readonly rubrics: readonly MaterialRequirementRubric[];
  readonly tutorResponse: string;
}

export type MaterialRequirementJudgeFailureCode =
  | "material_judge_unavailable"
  | "material_judge_result_invalid"
  | "material_judge_output_truncated"
  | "material_judge_timeout"
  | "material_judge_transport_error";

export const MATERIAL_REQUIREMENT_JUDGE_FAILURE_MESSAGES: Readonly<
  Record<MaterialRequirementJudgeFailureCode, string>
> = {
  material_judge_unavailable:
    "The Material Requirement Judge is unavailable or not configured.",
  material_judge_result_invalid:
    "Material Requirement Judge output failed atomic result validation.",
  material_judge_output_truncated:
    "Material Requirement Judge output was truncated before a complete atomic result was returned.",
  material_judge_timeout:
    "Material Requirement Judge execution timed out before a valid result was returned.",
  material_judge_transport_error:
    "Material Requirement Judge transport failed before a valid result was returned.",
};

export class MaterialRequirementJudgeExecutionError extends Error {
  readonly code: MaterialRequirementJudgeFailureCode;
  readonly metrics?: TutorEvalJudgeMetrics;

  constructor(
    code: MaterialRequirementJudgeFailureCode,
    metrics?: TutorEvalJudgeMetrics,
  ) {
    super(MATERIAL_REQUIREMENT_JUDGE_FAILURE_MESSAGES[code]);
    this.name = "MaterialRequirementJudgeExecutionError";
    this.code = code;
    if (metrics !== undefined) {
      this.metrics = metrics;
    }
  }
}

export interface MaterialRequirementJudgeEvaluation {
  readonly result: unknown;
  readonly metrics?: TutorEvalJudgeMetrics | null;
}

/** Experimental provider-independent boundary; no production evaluator uses it. */
export interface MaterialRequirementJudge {
  evaluate(input: MaterialRequirementJudgeInput): Promise<unknown>;
  evaluateWithMetrics?(
    input: MaterialRequirementJudgeInput,
  ): Promise<MaterialRequirementJudgeEvaluation>;
}

export interface MaterialRequirementAssessment {
  readonly requirementId: string;
  readonly status: MaterialRequirementAssessmentStatus;
  readonly evidence?: string;
}

export interface MaterialRequirementRubricAssessment {
  readonly rubricId: string;
  readonly requirements: readonly MaterialRequirementAssessment[];
}

export interface MaterialRequirementJudgeResult {
  readonly schemaVersion: typeof MATERIAL_REQUIREMENT_JUDGE_SCHEMA_VERSION;
  readonly caseId: string;
  readonly rubricAssessments: readonly MaterialRequirementRubricAssessment[];
}

/** The derived label is compatible with TutorEval, but remains independently versioned. */
export type MaterialRequirementDerivedLabel = "PASS" | "PARTIAL" | "FAIL";
