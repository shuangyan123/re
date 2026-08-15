import type { DisclosurePolicy } from "./tutor-eval.js";

/**
 * The policy controls what answer disclosure the evaluator may require or
 * reward. It is not a lexical instruction to ban every concept word or
 * definition from a Tutor response.
 */
export type TutorEvalDisclosureAnswerRule =
  | "not_required_or_rewarded"
  | "preserve_learner_completion"
  | "bounded_step_only"
  | "complete_answer_allowed"
  | "complete_answer_required";

export type TutorEvalDisclosureLearnerWorkRule =
  | "case_defined_task"
  | "material_task_must_remain"
  | "remaining_work_must_remain"
  | "optional"
  | "solution_required";

export interface TutorEvalDisclosurePolicyDefinition {
  readonly policy: DisclosurePolicy;
  readonly answerRule: TutorEvalDisclosureAnswerRule;
  readonly learnerWorkRule: TutorEvalDisclosureLearnerWorkRule;
  readonly conceptualExplanationAllowed: true;
}

export const TUTOR_EVAL_DISCLOSURE_POLICIES: readonly DisclosurePolicy[] = [
  "no_answer",
  "hint_only",
  "partial_solution",
  "full_solution_allowed",
  "full_solution_required",
] as const;

/**
 * Provider-independent policy semantics used by validators and evaluators.
 * Natural-language answer leakage still requires case-aware semantic judgment;
 * these definitions prevent a policy from being interpreted as "no explanation".
 */
export const TUTOR_EVAL_DISCLOSURE_POLICY_DEFINITIONS: Readonly<
  Record<DisclosurePolicy, TutorEvalDisclosurePolicyDefinition>
> = {
  no_answer: {
    policy: "no_answer",
    answerRule: "not_required_or_rewarded",
    learnerWorkRule: "case_defined_task",
    conceptualExplanationAllowed: true,
  },
  hint_only: {
    policy: "hint_only",
    answerRule: "preserve_learner_completion",
    learnerWorkRule: "material_task_must_remain",
    conceptualExplanationAllowed: true,
  },
  partial_solution: {
    policy: "partial_solution",
    answerRule: "bounded_step_only",
    learnerWorkRule: "remaining_work_must_remain",
    conceptualExplanationAllowed: true,
  },
  full_solution_allowed: {
    policy: "full_solution_allowed",
    answerRule: "complete_answer_allowed",
    learnerWorkRule: "optional",
    conceptualExplanationAllowed: true,
  },
  full_solution_required: {
    policy: "full_solution_required",
    answerRule: "complete_answer_required",
    learnerWorkRule: "solution_required",
    conceptualExplanationAllowed: true,
  },
};

export function isTutorEvalCompleteAnswerPermitted(
  policy: DisclosurePolicy,
): boolean {
  const answerRule = TUTOR_EVAL_DISCLOSURE_POLICY_DEFINITIONS[policy].answerRule;
  return (
    answerRule === "complete_answer_allowed" ||
    answerRule === "complete_answer_required"
  );
}
