import type {
  CriterionResult,
  TutorRubricCriterion,
  TutorScenario,
  TutorTurnOutput,
} from "../contracts/index.js";
import type { DeterministicEvaluatorId } from "../contracts/rubric.js";

export type DeterministicEvaluator = (
  scenario: TutorScenario,
  criterion: TutorRubricCriterion,
  output: TutorTurnOutput,
) => CriterionResult;

function diagnostic(code: string, message: string) {
  return [{ code, message }] as const;
}

function result(
  criterion: TutorRubricCriterion,
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
  criterion: TutorRubricCriterion,
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

function evaluateForbiddenPhrase(
  criterion: TutorRubricCriterion,
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
  criterion: TutorRubricCriterion,
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
  criterion: TutorRubricCriterion,
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
  criterion: TutorRubricCriterion,
  output: TutorTurnOutput,
): CriterionResult {
  const forbiddenFinalAnswer = criterion.config?.forbiddenFinalAnswer;
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

function evaluateEmptyResponse(
  criterion: TutorRubricCriterion,
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
  criterion: TutorRubricCriterion,
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
  Record<DeterministicEvaluatorId, DeterministicEvaluator>
> = {
  contains_forbidden_phrase: (_scenario, criterion, output) =>
    evaluateForbiddenPhrase(criterion, output),
  contains_required_concept: (_scenario, criterion, output) =>
    evaluateRequiredConcept(criterion, output),
  response_length_range: (_scenario, criterion, output) =>
    evaluateResponseLength(criterion, output),
  direct_answer_leak: (_scenario, criterion, output) =>
    evaluateDirectAnswerLeak(criterion, output),
  empty_response: (_scenario, criterion, output) =>
    evaluateEmptyResponse(criterion, output),
  structured_keyword_coverage: (_scenario, criterion, output) =>
    evaluateKeywordCoverage(criterion, output),
};

export function evaluateDeterministicCriterion(
  scenario: TutorScenario,
  criterion: TutorRubricCriterion,
  output: TutorTurnOutput,
): CriterionResult {
  return evaluatorImplementations[criterion.evaluatorId](scenario, criterion, output);
}

export const deterministicEvaluatorIds = Object.freeze(
  Object.keys(evaluatorImplementations),
);
