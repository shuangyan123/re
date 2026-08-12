import assert from "node:assert/strict";
import { test } from "node:test";

import {
  BenchmarkConfigurationError,
  isAiTutorJudgeResult,
  parseAiTutorJudgeInput,
  parseAiTutorJudgeResult,
  type AiTutorJudgeCriticalFailure,
  type AiTutorJudgeScores,
} from "../src/contracts/index.js";
import {
  calculatePedagogyScore100,
  determineQualityGate,
} from "../src/judge/index.js";

function makeScores(
  overrides: Partial<AiTutorJudgeScores> = {},
): AiTutorJudgeScores {
  return {
    correctness: 4,
    diagnosis: 4,
    scaffolding: 3,
    student_agency: 5,
    adaptivity: 2,
    hint_calibration: 4,
    communication: 4,
    ...overrides,
  };
}

function makeResult(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  const scores = makeScores();
  return {
    quality_gate: "PASS",
    critical_failures: [],
    scores,
    pedagogy_score_100: calculatePedagogyScore100(scores),
    answer_leakage: false,
    overhelping: "none",
    rubric_results: [
      {
        criterion: "Ask the student to find a common denominator.",
        result: "PASS",
        evidence: "The response asks a next-step question.",
      },
    ],
    primary_strength: "The tutor preserves the student's next reasoning step.",
    primary_weakness: "The diagnosis could be more explicit.",
    recommended_improvement: "Name the misconception before giving the next hint.",
    confidence: 0.88,
    ...overrides,
  };
}

test("judge input preserves empty fields instead of inventing context", () => {
  const input = parseAiTutorJudgeInput({
    learning_objective: "Guide fraction addition.",
    student_profile: "",
    conversation_history: "",
    student_message: "Can you help?",
    ground_truth: "",
    known_misconception: "",
    pedagogical_objective: "Do not reveal the final answer.",
    case_rubric: null,
    tutor_response: "Try finding a common denominator.",
  });

  assert.equal(input.student_profile, "");
  assert.equal(input.ground_truth, "");
  assert.equal(input.case_rubric, null);

  const blankRubricInput = parseAiTutorJudgeInput({
    learning_objective: "Objective",
    student_profile: "",
    conversation_history: "",
    student_message: "Question",
    ground_truth: "",
    known_misconception: "",
    pedagogical_objective: "",
    case_rubric: "",
    tutor_response: "Response",
  });
  assert.equal(blankRubricInput.case_rubric, null);
});

test("judge input rejects malformed case rubric with a stable category", () => {
  assert.throws(
    () =>
      parseAiTutorJudgeInput({
        learning_objective: "Objective",
        student_profile: "Profile",
        conversation_history: "History",
        student_message: "Question",
        ground_truth: "Answer",
        known_misconception: "Misconception",
        pedagogical_objective: "Guide",
        case_rubric: { must: ["identify the issue"] },
        tutor_response: "Hint",
      }),
    (error: unknown) =>
      error instanceof BenchmarkConfigurationError &&
      error.code === "judge_input_invalid",
  );
});

test("pedagogy score uses only the five explicit teaching dimensions", () => {
  const scores = makeScores({ correctness: 0, communication: 0 });
  assert.equal(calculatePedagogyScore100(scores), 73);
  assert.equal(determineQualityGate(scores, []), "FAIL");
});

test("critical failures force FAIL even when correctness is high", () => {
  const scores = makeScores({ correctness: 5 });
  const failures: readonly AiTutorJudgeCriticalFailure[] = [
    { code: "CF-03", evidence: "The tutor states the final answer without need." },
  ];
  assert.equal(determineQualityGate(scores, failures), "FAIL");
  assert.equal(
    parseAiTutorJudgeResult(
      makeResult({ quality_gate: "FAIL", critical_failures: failures }),
    ).quality_gate,
    "FAIL",
  );
});

test("valid judge result preserves rubric evidence and derived fields", () => {
  const result = parseAiTutorJudgeResult(makeResult());
  assert.equal(result.scores.student_agency, 5);
  assert.equal(result.rubric_results[0]?.result, "PASS");
  assert.equal(result.pedagogy_score_100, 73);
  assert.equal(result.confidence, 0.88);
  assert.equal(isAiTutorJudgeResult(result), true);
});

test("inconsistent derived score, gate, score range, and confidence fail closed", () => {
  assert.throws(
    () => parseAiTutorJudgeResult(makeResult({ pedagogy_score_100: 100 })),
    (error: unknown) =>
      error instanceof BenchmarkConfigurationError &&
      error.code === "judge_result_invalid",
  );
  assert.throws(
    () => parseAiTutorJudgeResult(makeResult({ quality_gate: "FAIL" })),
    (error: unknown) =>
      error instanceof BenchmarkConfigurationError &&
      error.code === "judge_result_invalid",
  );
  assert.throws(
    () =>
      parseAiTutorJudgeResult(
        makeResult({ scores: { ...makeScores(), diagnosis: 6 } }),
      ),
    (error: unknown) =>
      error instanceof BenchmarkConfigurationError &&
      error.code === "judge_result_invalid",
  );
  assert.throws(
    () => parseAiTutorJudgeResult(makeResult({ confidence: 1.01 })),
    (error: unknown) =>
      error instanceof BenchmarkConfigurationError &&
      error.code === "judge_result_invalid",
  );
});
