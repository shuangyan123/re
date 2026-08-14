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

function normalizeNaturalText(value: string): string {
  return value.normalize("NFKC").toLowerCase().replace(/\s+/gu, " ").trim();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function naturalConceptPattern(concept: string): RegExp | null {
  const normalizedConcept = normalizeNaturalText(concept);
  if (normalizedConcept.length === 0) {
    return null;
  }
  const words = normalizedConcept.split(" ").map(escapeRegExp);
  return new RegExp(
    `${String.raw`(?<![\p{L}\p{N}_])`}${words.join(String.raw`\s+`)}${String.raw`(?![\p{L}\p{N}_])`}`,
    "iu",
  );
}

function containsNaturalConcept(text: string, concept: string): boolean {
  const pattern = naturalConceptPattern(concept);
  return pattern === null ? false : pattern.test(normalizeNaturalText(text));
}

function containsNaturalAnswer(
  text: string,
  answer: string,
  rejectNegated: boolean,
): boolean {
  const pattern = naturalConceptPattern(answer);
  if (pattern === null) {
    return false;
  }
  const normalizedText = normalizeNaturalText(text);
  const globalPattern = new RegExp(pattern.source, `${pattern.flags}g`);
  let match = globalPattern.exec(normalizedText);
  while (match !== null) {
    if (
      !rejectNegated ||
      !expressionIsNegated(normalizedText, match.index, match.index + match[0].length)
    ) {
      return true;
    }
    match = globalPattern.exec(normalizedText);
  }
  return false;
}

interface SupportedMathExpression {
  readonly pattern: RegExp;
}

const mathExpressionLeftBoundary = String.raw`(?<![\p{L}\p{N}_+\-*/^.])`;
const mathExpressionRightBoundary = String.raw`(?![\p{L}\p{N}_+\-*/^]|[.](?=\p{N}))`;

function supportedMathExpression(expression: string): SupportedMathExpression | null {
  const normalized = expression.normalize("NFKC").trim();
  const equation = normalized.match(
    /^([a-z][a-z0-9_]*)\s*=\s*([+-]?(?:\d+(?:\.\d+)?))$/iu,
  );
  if (equation !== null) {
    const variable = escapeRegExp(equation[1]!.toLowerCase());
    const value = escapeRegExp(equation[2]!);
    return {
      pattern: new RegExp(
        `${mathExpressionLeftBoundary}${variable}\\s*=\\s*${value}${mathExpressionRightBoundary}`,
        "giu",
      ),
    };
  }
  const fraction = normalized.match(/^([+-]?\d+)\s*\/\s*(\d+)$/u);
  if (fraction !== null) {
    const numerator = escapeRegExp(fraction[1]!);
    const denominator = escapeRegExp(fraction[2]!);
    return {
      pattern: new RegExp(
        `${mathExpressionLeftBoundary}(?:${numerator}\\s*\\/\\s*${denominator}|\\\\frac\\s*\\{\\s*${numerator}\\s*\\}\\s*\\{\\s*${denominator}\\s*\\})${mathExpressionRightBoundary}`,
        "giu",
      ),
    };
  }
  return null;
}

function expressionIsNegated(
  text: string,
  start: number,
  end: number,
): boolean {
  const before = normalizeNaturalText(text.slice(Math.max(0, start - 32), start));
  const after = normalizeNaturalText(text.slice(end, end + 32));
  return (
    /(?:\bnot|\bnever|\bis not|\bisn't|\bdoes not|\bdoesn't)\s*$/u.test(before) ||
    /^(?:is not|isn't|is wrong|is false)\b/u.test(after)
  );
}

function containsMathExpression(
  text: string,
  expression: string,
  rejectNegated: boolean,
): boolean {
  const supported = supportedMathExpression(expression);
  if (supported === null) {
    return false;
  }
  const normalizedText = text.normalize("NFKC");
  let match = supported.pattern.exec(normalizedText);
  while (match !== null) {
    if (
      !rejectNegated ||
      !expressionIsNegated(normalizedText, match.index, match.index + match[0].length)
    ) {
      return true;
    }
    match = supported.pattern.exec(normalizedText);
  }
  return false;
}

function containsAnswer(text: string, answer: string): boolean {
  return (
    containsMathExpression(text, answer, true) ||
    (supportedMathExpression(answer) === null && containsNaturalAnswer(text, answer, true))
  );
}

function containsForbiddenAnswer(text: string, answer: string): boolean {
  return (
    containsMathExpression(text, answer, false) ||
    (supportedMathExpression(answer) === null && containsNaturalAnswer(text, answer, false))
  );
}

function evaluateForbiddenPhrase(
  criterion: DeterministicCriterionDefinition,
  output: TutorTurnOutput,
): CriterionResult {
  const phrases = criterion.config?.forbiddenPhrases;
  if (phrases === undefined || phrases.length === 0) {
    return errorResult(criterion);
  }
  const matched = phrases.some((phrase) => containsNaturalConcept(output.text, phrase));
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
  const matches = concepts.filter((concept) =>
    containsNaturalConcept(output.text, concept),
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

function evaluateNormalizedExpression(
  criterion: DeterministicCriterionDefinition,
  output: TutorTurnOutput,
): CriterionResult {
  const expression = criterion.config?.requiredExpression;
  if (expression === undefined || expression.trim().length === 0) {
    return errorResult(criterion);
  }
  if (supportedMathExpression(expression) === null) {
    return errorResult(
      criterion,
      "The configured expression is outside the bounded deterministic matcher.",
    );
  }
  const matched = containsMathExpression(output.text, expression, true);
  return result(
    criterion,
    matched,
    matched ? 1 : 0,
    matched ? "normalized_expression_present" : "normalized_expression_missing",
    matched
      ? "Tutor response contains the configured normalized mathematical expression."
      : "Tutor response does not contain the configured normalized mathematical expression.",
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
  const leaked = containsForbiddenAnswer(output.text, forbiddenFinalAnswer);
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
  const matched = acceptedAnswers.some((answer) => containsAnswer(output.text, answer));
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
  const matches = concepts.filter((concept) =>
    containsNaturalConcept(output.text, concept),
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
  contains_normalized_expression: (criterion, output) =>
    evaluateNormalizedExpression(criterion, output),
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
