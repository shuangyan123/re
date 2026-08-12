/**
 * Versioned, provider-independent labels for the 0.2A dataset design.
 * These describe what a case is intended to measure; they are not Tutor
 * output scores and must not be treated as a communication-style rating.
 */
export const TUTOR_EVAL_TAXONOMY_VERSION = "0.2A" as const;

export const TUTOR_EVAL_SUBJECTS = [
  "mathematics",
  "science",
  "language",
  "history_or_social_studies",
  "programming",
] as const;

export type TutorEvalSubject = (typeof TUTOR_EVAL_SUBJECTS)[number];

export const TUTOR_EVAL_LEARNING_TASKS = [
  "concept_explanation",
  "error_diagnosis",
  "guided_problem_solving",
  "hint_request",
  "answer_checking",
  "reasoning_checking",
  "knowledge_recall",
  "transfer_preparation",
] as const;

export type TutorEvalLearningTask = (typeof TUTOR_EVAL_LEARNING_TASKS)[number];

export const TUTOR_EVAL_STUDENT_STATES = [
  "novice",
  "partial_understanding",
  "procedural_error",
  "conceptual_misconception",
  "correct_answer_wrong_reasoning",
  "overconfident_incorrect",
  "uncertain_but_correct",
  "stuck_without_attempt",
] as const;

export type TutorEvalStudentState = (typeof TUTOR_EVAL_STUDENT_STATES)[number];

export const TUTOR_EVAL_LEARNER_LEVELS = [
  "beginner",
  "elementary",
  "upper-elementary",
  "middle-school",
  "secondary",
] as const;

export type TutorEvalLearnerLevel = (typeof TUTOR_EVAL_LEARNER_LEVELS)[number];

export const TUTOR_EVAL_CAPABILITY_TAGS = [
  "factual_correctness",
  "conceptual_correctness",
  "procedural_correctness",
  "reasoning_consistency",
  "misleading_simplification",
  "error_detection",
  "error_localization",
  "misconception_identification",
  "knowledge_gap_identification",
  "correct_answer_wrong_reasoning",
  "uncertainty_detection",
  "hint_calibration",
  "scaffolding",
  "student_agency",
  "answer_non_disclosure",
  "overhelping_avoidance",
  "conceptual_prompting",
  "procedural_prompting",
  "prior_knowledge_adaptation",
  "difficulty_adaptation",
  "misconception_specific_adaptation",
  "explanation_depth_adaptation",
  "counterfactual_adaptation",
  "clear_next_step",
  "student_executable_action",
  "check_for_understanding",
  "productive_question",
] as const;

export type TutorEvalCapabilityTag = (typeof TUTOR_EVAL_CAPABILITY_TAGS)[number];

export const TUTOR_EVAL_DIFFICULTY_LEVELS = [1, 2, 3, 4, 5] as const;
export type TutorEvalDifficultyLevel = (typeof TUTOR_EVAL_DIFFICULTY_LEVELS)[number];

export interface TutorEvalDifficulty {
  /** The learner level assumed by the case, not the whole case difficulty. */
  readonly learnerLevel: TutorEvalLearnerLevel;
  /** 1 straightforward -> 5 advanced or ambiguous knowledge/problem. */
  readonly taskDifficulty: TutorEvalDifficultyLevel;
  /** 1 direct correction -> 5 subtle pedagogical trade-off. */
  readonly pedagogicalDifficulty: TutorEvalDifficultyLevel;
}

export function isTutorEvalDifficultyLevel(
  value: unknown,
): value is TutorEvalDifficultyLevel {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 1 &&
    value <= 5
  );
}
