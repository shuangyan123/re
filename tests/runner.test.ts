import assert from "node:assert/strict";
import { test } from "node:test";

import { ScriptedTutor } from "../src/adapters/scripted-tutor.js";
import { BenchmarkConfigurationError } from "../src/contracts/index.js";
import { runBenchmark } from "../src/runner/index.js";
import { makeCriterion, makeRubric, makeScenario } from "./helpers.js";

function fixedClock() {
  let call = 0;
  return () => new Date(`2026-08-12T00:00:0${call++}.000Z`);
}

test("scripted tutor adapter returns configured output and exposes stable identity", async () => {
  const tutor = new ScriptedTutor({
    id: "scripted-test-tutor",
    responses: { "scenario-1": "A synthetic answer." },
  });
  const response = await tutor.respond({
    scenarioId: "scenario-1",
    initialContext: "Context",
    conversation: [],
    currentStudentMessage: "Help",
    studentState: {
      knownConcepts: [],
      misconceptions: [],
      level: "test",
      goal: "test",
    },
  });
  assert.equal(tutor.id, "scripted-test-tutor");
  assert.equal(response.text, "A synthetic answer.");
});

test("runner sorts scenarios deterministically and produces a valid result", async () => {
  const scenarios = [
    makeScenario("scenario-b", "rubric-1"),
    makeScenario("scenario-a", "rubric-1"),
  ];
  const rubric = makeRubric();
  const result = await runBenchmark(
    new ScriptedTutor({
      id: "scripted-test-tutor",
      responses: { "scenario-a": "Ready.", "scenario-b": "Ready." },
    }),
    scenarios,
    [rubric],
    { runId: "run-1", now: fixedClock() },
  );

  assert.deepEqual(
    result.scenarioResults.map((scenario) => scenario.scenarioId),
    ["scenario-a", "scenario-b"],
  );
  assert.equal(result.scenarioCount, 2);
  assert.equal(result.passedCount, 2);
  assert.equal(result.failedCount, 0);
  assert.equal(result.errorCount, 0);
  assert.equal(result.runId, "run-1");
  assert.equal(result.durationMs, 1_000);
});

test("bad tutor scores lower than guided tutor without model-specific rules", async () => {
  const scenarios = [
    makeScenario("scenario-a", "rubric-1"),
    makeScenario("scenario-b", "rubric-1"),
  ];
  const rubric = makeRubric(
    [
      makeCriterion({
        id: "no-leak",
        evaluatorId: "direct_answer_leak",
        weight: 0.7,
        config: { forbiddenFinalAnswer: "final answer" },
      }),
      makeCriterion({ id: "not-empty", evaluatorId: "empty_response", weight: 0.3 }),
    ],
    0.75,
  );
  const guided = await runBenchmark(
    new ScriptedTutor({
      id: "scripted-guided-tutor",
      responses: {
        "scenario-a": "Here is a hint.",
        "scenario-b": "Try a smaller step.",
      },
    }),
    scenarios,
    [rubric],
    { runId: "guided", now: fixedClock() },
  );
  const bad = await runBenchmark(
    new ScriptedTutor({
      id: "scripted-bad-tutor",
      responses: {
        "scenario-a": "The final answer is final answer.",
        "scenario-b": "The final answer is final answer.",
      },
    }),
    scenarios,
    [rubric],
    { runId: "bad", now: fixedClock() },
  );

  assert.equal(guided.passedCount, 2);
  assert.equal(bad.failedCount, 2);
  assert.ok(guided.totalScore > bad.totalScore);
});

test("one scenario evaluator failure does not erase another scenario result", async () => {
  const scenarios = [makeScenario("scenario-a", "rubric-1"), makeScenario("scenario-b", "rubric-1")];
  const rubric = makeRubric();
  const result = await runBenchmark(
    new ScriptedTutor({
      id: "scripted-test-tutor",
      responses: { "scenario-a": "Ready.", "scenario-b": "Ready." },
    }),
    scenarios,
    [rubric],
    {
      runId: "run-with-error",
      now: fixedClock(),
      evaluators: {
        empty_response: (scenario) => {
          if (scenario.id === "scenario-a") {
            throw new Error("test-only evaluator failure");
          }
          return {
            criterionId: "criterion-1",
            evaluatorId: "empty_response",
            status: "passed",
            score: 1,
            passed: true,
            diagnostics: [{ code: "non_empty_response", message: "Tutor response is non-empty." }],
          };
        },
      },
    },
  );

  assert.equal(result.scenarioResults.length, 2);
  assert.equal(result.scenarioResults[0]?.status, "error");
  assert.equal(result.scenarioResults[1]?.status, "passed");
  assert.equal(result.errorCount, 1);
  assert.equal(result.passedCount, 1);
});

test("invalid scenario configuration fails closed before adapter execution", async () => {
  const tutor = new ScriptedTutor({ id: "scripted-test-tutor", responses: {} });
  await assert.rejects(
    () =>
      runBenchmark(
        tutor,
        [{ id: "invalid" } as never],
        [makeRubric()],
      ),
    (error: unknown) =>
      error instanceof BenchmarkConfigurationError &&
      error.code === "scenario_invalid",
  );
});
