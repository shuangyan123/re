import type {
  TutorCriticalFailure,
  TutorCriticalFailureSeverity,
  TutorEvalCategory,
} from "./tutor-eval.js";
import type { TutorEvalCapabilityTag } from "./tutor-eval-taxonomy.js";

export const RUBRIC_SCHEMA_VERSION = 1 as const;

export type DeterministicEvaluatorId =
  | "contains_forbidden_phrase"
  | "contains_required_concept"
  | "response_length_range"
  | "direct_answer_leak"
  | "matches_ground_truth"
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

export type TutorEvalRubricApplicability = "required" | "optional";
export type TutorEvalRubricEvaluationType = "deterministic" | "judge";
export type TutorEvalRubricBehavior = "required" | "desirable" | "prohibited";

export interface TutorEvalRubricFailure {
  readonly type: TutorCriticalFailure;
  readonly severity: TutorCriticalFailureSeverity;
}

/**
 * One atomic, case-specific teaching criterion. A criterion may be evaluated
 * deterministically in Foundation or reserved for the future Judge adapter.
 */
export interface TutorEvalRubric {
  readonly id: string;
  readonly category: TutorEvalCategory;
  /** One observable behavior; do not combine diagnosis, explanation, and tone. */
  readonly criterion: string;
  readonly weight: number;
  readonly applicability?: TutorEvalRubricApplicability;
  /** Required, positive-but-nonessential, or explicitly prohibited behavior. */
  readonly behavior?: TutorEvalRubricBehavior;
  /** One primary capability prevents accidental multi-counting in the dataset. */
  readonly capabilityTag?: TutorEvalCapabilityTag;
  readonly critical?: boolean;
  readonly evaluationType?: TutorEvalRubricEvaluationType;
  readonly evaluatorId?: DeterministicEvaluatorId;
  readonly config?: DeterministicEvaluatorConfig;
  readonly criticalFailure?: TutorEvalRubricFailure;
}
