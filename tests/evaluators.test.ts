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
