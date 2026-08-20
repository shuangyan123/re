import type { TutorEvalJudgeInput } from "./tutor-eval-judge.js";

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

/** Experimental provider-independent boundary; no production evaluator uses it. */
export interface MaterialRequirementJudge {
  evaluate(input: MaterialRequirementJudgeInput): Promise<unknown>;
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
