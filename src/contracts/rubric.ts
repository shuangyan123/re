export const RUBRIC_SCHEMA_VERSION = 1 as const;

export type DeterministicEvaluatorId =
  | "contains_forbidden_phrase"
  | "contains_required_concept"
  | "response_length_range"
  | "direct_answer_leak"
  | "empty_response"
  | "structured_keyword_coverage";

export interface DeterministicEvaluatorConfig {
  readonly forbiddenPhrases?: readonly string[];
  readonly forbiddenFinalAnswer?: string;
  readonly requiredConcepts?: readonly string[];
  readonly minLength?: number;
  readonly maxLength?: number;
  readonly minimumMatches?: number;
}

export interface TutorRubricCriterion {
  readonly id: string;
  readonly description: string;
  readonly weight: number;
  readonly evaluationType: "deterministic";
  readonly evaluatorId: DeterministicEvaluatorId;
  readonly config?: DeterministicEvaluatorConfig;
}

export interface TutorRubric {
  readonly schemaVersion: typeof RUBRIC_SCHEMA_VERSION;
  readonly id: string;
  readonly title: string;
  readonly passThreshold: number;
  readonly criteria: readonly TutorRubricCriterion[];
}
