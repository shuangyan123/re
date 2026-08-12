import type {
  CriterionResult,
  TutorRubricCriterion,
  TutorScenario,
  TutorTurnOutput,
} from "../contracts/index.js";
import type { DeterministicEvaluatorId } from "../contracts/rubric.js";
import type {
  DisclosurePolicy,
  TutorEvalGroundTruth,
} from "../contracts/tutor-eval.js";

export interface DeterministicCriterionDefinition {
  readonly id: string;
  readonly evaluatorId: DeterministicEvaluatorId;
  readonly config?: TutorRubricCriterion["config"];
}

export interface DeterministicEvaluationContext {
  readonly disclosurePolicy?: DisclosurePolicy;
  readonly groundTruth?: TutorEvalGroundTruth;
}

export type DeterministicEvaluator = (
  scenario: TutorScenario,
  criterion: TutorRubricCriterion,
  output: TutorTurnOutput,
) => CriterionResult;

function diagnostic(code: string, message: string) {
  return [{ code, message }] as const;
}

function result(
  criterion: DeterministicCriterionDefinition,
  passed: boolean,
  score: number,
  code: string,
  message: string,
): CriterionResult {
  return {
    criterionId: criterion.id,
    evaluatorId: criterion.evaluatorId,
    status: passed ? "passed" : "failed",
    score,
    passed,
    diagnostics: diagnostic(code, message),
  };
}

function errorResult(
  criterion: DeterministicCriterionDefinition,
  message = "Evaluator configuration is invalid.",
): CriterionResult {
  return {
    criterionId: criterion.id,
    evaluatorId: criterion.evaluatorId,
    status: "error",
    score: null,
    passed: false,
    diagnostics: diagnostic("evaluator_config_invalid", message),
  };
}

function normalizedText(output: TutorTurnOutput): string {
  return output.text.trim().toLowerCase();
}

function containsAnswer(text: string, answer: string): boolean {
  const normalizedAnswer = answer.trim().toLowerCase();
  if (normalizedAnswer.length === 0) {
    return false;
  }
  const escaped = normalizedAnswer.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(
    `(?:^|[^a-z0-9])${escaped}(?:$|[^a-z0-9])`,
  ).test(text);
}

function evaluateForbiddenPhrase(
  criterion: DeterministicCriterionDefinition,
  output: TutorTurnOutput,
): CriterionResult {
  const phrases = criterion.config?.forbiddenPhrases;
  if (phrases === undefined || phrases.length === 0) {
    return errorResult(criterion);
  }
  const text = normalizedText(output);
  const matched = phrases.some((phrase) => text.includes(phrase.toLowerCase()));
  return result(
    criterion,
    !matched,
    matched ? 0 : 1,
    matched ? "forbidden_phrase_found" : "forbidden_phrase_absent",
    matched
      ? "Tutor response contains a forbidden phrase."
      : "Tutor response contains no forbidden phrase.",
  );
}

function evaluateRequiredConcept(
  criterion: DeterministicCriterionDefinition,
  output: TutorTurnOutput,
): CriterionResult {
  const concepts = criterion.config?.requiredConcepts;
  if (concepts === undefined || concepts.length === 0) {
    return errorResult(criterion);
  }
  const text = normalizedText(output);
  const matches = concepts.filter((concept) =>
    text.includes(concept.toLowerCase()),
  ).length;
  const score = matches / concepts.length;
  const passed = matches === concepts.length;
  return result(
    criterion,
    passed,
    score,
    passed ? "required_concepts_present" : "required_concepts_missing",
    passed
      ? "Tutor response contains all required concepts."
      : "Tutor response is missing one or more required concepts.",
  );
}

function evaluateResponseLength(
  criterion: DeterministicCriterionDefinition,
  output: TutorTurnOutput,
): CriterionResult {
  const minLength = criterion.config?.minLength;
  const maxLength = criterion.config?.maxLength;
  if (minLength === undefined && maxLength === undefined) {
    return errorResult(criterion);
  }
  const length = output.text.trim().length;
  const passed =
    (minLength === undefined || length >= minLength) &&
    (maxLength === undefined || length <= maxLength);
  return result(
    criterion,
    passed,
    passed ? 1 : 0,
    passed ? "response_length_in_range" : "response_length_out_of_range",
    passed
      ? "Tutor response length is within the configured range."
      : "Tutor response length is outside the configured range.",
  );
}

function evaluateDirectAnswerLeak(
  criterion: DeterministicCriterionDefinition,
  output: TutorTurnOutput,
  context: DeterministicEvaluationContext = {},
): CriterionResult {
  const forbiddenFinalAnswer = criterion.config?.forbiddenFinalAnswer;
  if (
    context.disclosurePolicy === "full_solution_allowed" ||
    context.disclosurePolicy === "full_solution_required"
  ) {
    return result(
      criterion,
      true,
      1,
      "answer_disclosure_allowed",
      "The case disclosure policy allows a complete solution.",
    );
  }
  if (forbiddenFinalAnswer === undefined) {
    return errorResult(criterion);
  }
  const leaked = normalizedText(output).includes(
    forbiddenFinalAnswer.toLowerCase(),
  );
  return result(
    criterion,
    !leaked,
    leaked ? 0 : 1,
    leaked ? "direct_answer_detected" : "direct_answer_not_detected",
    leaked
      ? "Tutor response matches the configured direct-answer proxy."
      : "Tutor response does not match the configured direct-answer proxy.",
  );
}

function evaluateGroundTruthMatch(
  criterion: DeterministicCriterionDefinition,
  output: TutorTurnOutput,
  context: DeterministicEvaluationContext,
): CriterionResult {
  const groundTruth = context.groundTruth;
  const acceptedAnswers = groundTruth?.acceptedAnswers ??
    (groundTruth?.finalAnswer === undefined ? [] : [groundTruth.finalAnswer]);
  if (acceptedAnswers.length === 0) {
    return errorResult(
      criterion,
      "Ground truth does not define an accepted answer.",
    );
  }
  const text = normalizedText(output);
  const matched = acceptedAnswers.some((answer) => containsAnswer(text, answer));
  return result(
    criterion,
    matched,
    matched ? 1 : 0,
    matched ? "ground_truth_match" : "ground_truth_mismatch",
    matched
      ? "Tutor response contains an accepted ground-truth answer."
      : "Tutor response does not contain an accepted ground-truth answer.",
  );
}

function evaluateEmptyResponse(
  criterion: DeterministicCriterionDefinition,
  output: TutorTurnOutput,
): CriterionResult {
  const empty = output.text.trim().length === 0;
  return result(
    criterion,
    !empty,
    empty ? 0 : 1,
    empty ? "empty_response" : "non_empty_response",
    empty ? "Tutor response is empty." : "Tutor response is non-empty.",
  );
}

function evaluateKeywordCoverage(
  criterion: DeterministicCriterionDefinition,
  output: TutorTurnOutput,
): CriterionResult {
  const concepts = criterion.config?.requiredConcepts;
  const minimumMatches = criterion.config?.minimumMatches ?? concepts?.length;
  if (
    concepts === undefined ||
    concepts.length === 0 ||
    minimumMatches === undefined
  ) {
    return errorResult(criterion);
  }
  const text = normalizedText(output);
  const matches = concepts.filter((concept) =>
    text.includes(concept.toLowerCase()),
  ).length;
  const score = matches / concepts.length;
  const passed = matches >= minimumMatches;
  return result(
    criterion,
    passed,
    score,
    passed ? "keyword_coverage_met" : "keyword_coverage_below_minimum",
    passed
      ? "Tutor response meets the configured keyword coverage."
      : "Tutor response is below the configured keyword coverage.",
  );
}

const evaluatorImplementations: Readonly<
  Record<
    DeterministicEvaluatorId,
    (criterion: DeterministicCriterionDefinition, output: TutorTurnOutput) => CriterionResult
  >
> = {
  contains_forbidden_phrase: (criterion, output) => evaluateForbiddenPhrase(criterion, output),
  contains_required_concept: (criterion, output) => evaluateRequiredConcept(criterion, output),
  response_length_range: (criterion, output) => evaluateResponseLength(criterion, output),
  direct_answer_leak: (criterion, output) => evaluateDirectAnswerLeak(criterion, output),
  matches_ground_truth: (criterion, output) =>
    evaluateGroundTruthMatch(criterion, output, {}),
  empty_response: (criterion, output) => evaluateEmptyResponse(criterion, output),
  structured_keyword_coverage: (criterion, output) => evaluateKeywordCoverage(criterion, output),
};

export function evaluateDeterministicCriterion(
  _scenario: TutorScenario,
  criterion: TutorRubricCriterion,
  output: TutorTurnOutput,
  context: DeterministicEvaluationContext = {},
): CriterionResult {
  if (criterion.evaluatorId === "direct_answer_leak") {
    return evaluateDirectAnswerLeak(criterion, output, context);
  }
  if (criterion.evaluatorId === "matches_ground_truth") {
    return evaluateGroundTruthMatch(criterion, output, context);
  }
  return evaluatorImplementations[criterion.evaluatorId](criterion, output);
}

export function evaluateTutorEvalDeterministicCriterion(
  criterion: DeterministicCriterionDefinition,
  output: TutorTurnOutput,
  context: DeterministicEvaluationContext = {},
): CriterionResult {
  if (criterion.evaluatorId === "direct_answer_leak") {
    return evaluateDirectAnswerLeak(criterion, output, context);
  }
  if (criterion.evaluatorId === "matches_ground_truth") {
    return evaluateGroundTruthMatch(criterion, output, context);
  }
  return evaluatorImplementations[criterion.evaluatorId](criterion, output);
}

export const deterministicEvaluatorIds = Object.freeze(
  Object.keys(evaluatorImplementations),
);
