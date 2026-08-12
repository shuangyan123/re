import assert from "node:assert/strict";
import { test } from "node:test";

import {
  BenchmarkConfigurationError,
  assertValidBenchmarkRunResult,
  isBenchmarkRunResult,
  parseTutorRubric,
  parseTutorScenario,
  parseTutorScenarios,
} from "../src/contracts/index.js";

test("scenario runtime validation accepts the foundation shape", () => {
  const scenario = parseTutorScenario({
    schemaVersion: 1,
    id: "scenario-1",
    title: "A scenario",
    description: "A synthetic scenario.",
    studentProfile: {
      knownConcepts: ["addition"],
      misconceptions: ["digits are always denominators"],
      level: "beginner",
      goal: "practice fractions",
    },
    learningObjective: "Guide the student.",
    initialContext: "A lesson context.",
    turns: [{ studentMessage: "Can you help?" }],
    tags: ["synthetic"],
    rubricId: "rubric-1",
  });

  assert.equal(scenario.id, "scenario-1");
  assert.equal(scenario.studentProfile.level, "beginner");
});

test("invalid scenario JSON fails closed with a stable category", () => {
  assert.throws(
    () => parseTutorScenario({ schemaVersion: 1, id: "missing-fields" }),
    (error: unknown) =>
      error instanceof BenchmarkConfigurationError &&
      error.code === "scenario_invalid" &&
      error.message === "Scenario configuration is invalid.",
  );
});

test("duplicate scenario IDs are rejected at collection validation", () => {
  const scenario = {
    schemaVersion: 1,
    id: "same-id",
    title: "A scenario",
    description: "A synthetic scenario.",
    studentProfile: {
      knownConcepts: [],
      misconceptions: [],
      level: "beginner",
      goal: "practice",
    },
    learningObjective: "Guide the student.",
    initialContext: "Context.",
    turns: [{ studentMessage: "Help" }],
    tags: ["synthetic"],
    rubricId: "rubric-1",
  };
  assert.throws(
    () => parseTutorScenarios([scenario, scenario]),
    (error: unknown) =>
      error instanceof BenchmarkConfigurationError &&
      error.code === "scenario_invalid",
  );
});

test("rubric runtime validation enforces deterministic evaluator configuration", () => {
  const rubric = parseTutorRubric({
    schemaVersion: 1,
    id: "rubric-1",
    title: "A rubric",
    passThreshold: 0.75,
    criteria: [
      {
        id: "criterion-1",
        description: "No direct answer.",
        weight: 1,
        evaluationType: "deterministic",
        evaluatorId: "direct_answer_leak",
        config: { forbiddenFinalAnswer: "3/4" },
      },
    ],
  });
  assert.equal(rubric.criteria[0]?.evaluatorId, "direct_answer_leak");

  assert.throws(
    () =>
      parseTutorRubric({
        schemaVersion: 1,
        id: "invalid-rubric",
        title: "Invalid",
        passThreshold: 0.5,
        criteria: [
          {
            id: "criterion-1",
            description: "Missing config.",
            weight: 1,
            evaluationType: "deterministic",
            evaluatorId: "direct_answer_leak",
          },
        ],
      }),
    (error: unknown) =>
      error instanceof BenchmarkConfigurationError &&
      error.code === "rubric_invalid",
  );
});

test("result schema validator accepts a minimal valid result and rejects incomplete data", () => {
  const valid = {
    schemaVersion: 1,
    runId: "run-1",
    timestamp: "2026-08-12T00:00:00.000Z",
    startedAt: "2026-08-12T00:00:00.000Z",
    finishedAt: "2026-08-12T00:00:00.000Z",
    durationMs: 0,
    tutorId: "tutor-1",
    scenarioCount: 0,
    passedCount: 0,
    failedCount: 0,
    errorCount: 0,
    totalScore: 0,
    scenarioResults: [],
  };
  assert.equal(isBenchmarkRunResult(valid), true);
  assert.doesNotThrow(() => assertValidBenchmarkRunResult(valid));
  assert.equal(isBenchmarkRunResult({ schemaVersion: 1 }), false);
});
