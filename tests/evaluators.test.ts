import assert from "node:assert/strict";
import { test } from "node:test";

import { evaluateDeterministicCriterion } from "../src/evaluators/index.js";
import { makeCriterion, makeScenario, output } from "./helpers.js";

const scenario = makeScenario("scenario-1", "rubric-1");

test("direct-answer leakage is a deterministic proxy", () => {
  const criterion = makeCriterion({
    id: "no-final-answer",
    evaluatorId: "direct_answer_leak",
    config: { forbiddenFinalAnswer: "3/4" },
  });

  const leaked = evaluateDeterministicCriterion(scenario, criterion, output("The answer is 3/4."));
  const guided = evaluateDeterministicCriterion(
    scenario,
    criterion,
    output("Try finding a common denominator first."),
  );

  assert.equal(leaked.passed, false);
  assert.equal(leaked.score, 0);
  assert.equal(leaked.diagnostics[0]?.code, "direct_answer_detected");
  assert.equal(guided.passed, true);
  assert.equal(guided.score, 1);
});

test("direct-answer leakage normalizes bounded math expressions without widening matches", () => {
  const criterion = makeCriterion({
    id: "no-equation-answer",
    evaluatorId: "direct_answer_leak",
    config: { forbiddenFinalAnswer: "x=4" },
  });

  assert.equal(
    evaluateDeterministicCriterion(scenario, criterion, output("Use `x = 4` here.")).passed,
    false,
  );
  assert.equal(
    evaluateDeterministicCriterion(scenario, criterion, output("Try x=40 instead.")).passed,
    true,
  );
  assert.equal(
    evaluateDeterministicCriterion(scenario, criterion, output("The expression 2x=4 is different.")).passed,
    true,
  );
  for (const text of ["x=4.5", "x=4+1", "2*x=4"]) {
    assert.equal(
      evaluateDeterministicCriterion(scenario, criterion, output(text)).passed,
      true,
      text,
    );
  }
  const fractionCriterion = makeCriterion({
    id: "no-fraction-answer",
    evaluatorId: "direct_answer_leak",
    config: { forbiddenFinalAnswer: "7/12" },
  });
  for (const text of ["7/12", "7 / 12", "\\frac{7}{12}"]) {
    assert.equal(
      evaluateDeterministicCriterion(scenario, fractionCriterion, output(text)).passed,
      false,
      text,
    );
  }
  for (const text of ["7/120", "17/12", "2*7/12", "7/12+1"]) {
    assert.equal(
      evaluateDeterministicCriterion(scenario, fractionCriterion, output(text)).passed,
      true,
      text,
    );
  }
  assert.equal(
    evaluateDeterministicCriterion(scenario, criterion, output("The relation is x≠4.")).passed,
    true,
  );
  assert.equal(
    evaluateDeterministicCriterion(scenario, criterion, output("It is not x=4.")).passed,
    false,
  );
});

test("normalized-expression evaluator accepts harmless formatting but rejects non-equivalent or negated equations", () => {
  const criterion = makeCriterion({
    id: "equation-answer",
    evaluatorId: "contains_normalized_expression",
    config: { requiredExpression: "x=4" },
  });

  for (const text of ["x=4", "x = 4", "X  =   4", "`x = 4`", "\\(x = 4\\)"]) {
    assert.equal(
      evaluateDeterministicCriterion(scenario, criterion, output(text)).passed,
      true,
      text,
    );
  }
  for (const text of [
    "x=5",
    "x=40",
    "x=4.5",
    "x=4+1",
    "2x=4",
    "2*x=4",
    "x=4/2",
    "x≠4",
    "the answer is not x=4",
  ]) {
    const result = evaluateDeterministicCriterion(scenario, criterion, output(text));
    assert.equal(result.passed, false, text);
    assert.equal(result.diagnostics[0]?.code, "normalized_expression_missing");
  }
});

test("forbidden phrase evaluator rejects configured phrases", () => {
  const criterion = makeCriterion({
    evaluatorId: "contains_forbidden_phrase",
    config: { forbiddenPhrases: ["just copy this answer"] },
  });
  const result = evaluateDeterministicCriterion(
    scenario,
    criterion,
    output("Please do not just copy this answer."),
  );
  assert.equal(result.passed, false);
  assert.equal(result.diagnostics[0]?.code, "forbidden_phrase_found");
});

test("required concepts retain partial criterion scores", () => {
  const criterion = makeCriterion({
    evaluatorId: "contains_required_concept",
    config: { requiredConcepts: ["common denominator", "equivalent fractions"] },
  });
  const result = evaluateDeterministicCriterion(
    scenario,
    criterion,
    output("Find a common denominator."),
  );
  assert.equal(result.passed, false);
  assert.equal(result.score, 0.5);
});

test("natural concept matching is Unicode-aware and does not match inside larger words", () => {
  const criterion = makeCriterion({
    evaluatorId: "contains_required_concept",
    config: { requiredConcepts: ["step"] },
  });
  assert.equal(
    evaluateDeterministicCriterion(scenario, criterion, output("Take one STEP next.")).passed,
    true,
  );
  assert.equal(
    evaluateDeterministicCriterion(scenario, criterion, output("The step\u00a0is small.")).passed,
    true,
  );
  assert.equal(
    evaluateDeterministicCriterion(scenario, criterion, output("A stepmother appears.")).passed,
    false,
  );
});

test("ground-truth answer matching rejects a negated answer", () => {
  const criterion = makeCriterion({ evaluatorId: "matches_ground_truth" });
  const result = evaluateDeterministicCriterion(
    scenario,
    criterion,
    output("The result is not 12."),
    { groundTruth: { acceptedAnswers: ["12"] } },
  );
  assert.equal(result.passed, false);
  assert.equal(result.diagnostics[0]?.code, "ground_truth_mismatch");
});

test("empty response evaluator fails blank output and passes useful output", () => {
  const criterion = makeCriterion({ evaluatorId: "empty_response" });
  assert.equal(
    evaluateDeterministicCriterion(scenario, criterion, output("   ")).passed,
    false,
  );
  assert.equal(
    evaluateDeterministicCriterion(scenario, criterion, output("A hint.")).passed,
    true,
  );
});

test("length and keyword evaluators use explicit rubric configuration", () => {
  const lengthCriterion = makeCriterion({
    id: "length",
    evaluatorId: "response_length_range",
    config: { minLength: 5, maxLength: 10 },
  });
  const keywordCriterion = makeCriterion({
    id: "keywords",
    evaluatorId: "structured_keyword_coverage",
    config: { requiredConcepts: ["hint", "question"], minimumMatches: 1 },
  });

  assert.equal(
    evaluateDeterministicCriterion(scenario, lengthCriterion, output("A hint.")).passed,
    true,
  );
  assert.equal(
    evaluateDeterministicCriterion(scenario, keywordCriterion, output("Ask a question.")).passed,
    true,
  );
});
