import assert from "node:assert/strict";
import { test } from "node:test";

import {
  parseTutorEvalCase,
  parseTutorEvalJudgeResult,
  partitionTutorEvalRubrics,
  type TutorEvalCase,
  type TutorEvalJudgeInput,
  type TutorEvalJudgeRubricStatus,
} from "../src/contracts/index.js";
import {
  loadTutorEvalPedagogyJudgePrompt,
  TUTOR_EVAL_PEDAGOGY_JUDGE_PROMPT_ID,
  TUTOR_EVAL_PEDAGOGY_JUDGE_PROMPT_VERSION,
} from "../src/judge/index.js";
import { runTutorEval } from "../src/runner/index.js";

const MEASUREMENT_RUBRIC = {
  id: "measurement-trend-boundary",
  category: "correctness" as const,
  criterion:
    "Compare the two measurements, explain that two observations alone are insufficient to establish a trend, and ask for another observation.",
  weight: 1,
  behavior: "required" as const,
  evaluationType: "judge" as const,
};

const MEASUREMENT_FIXTURES = [
  {
    id: "measurement-material-pass",
    response:
      "Measurement 2 is higher than measurement 1, but two observations alone are not enough to establish a trend. We need another data point. What is the next measurement?",
    expected: "PASS" as const,
  },
  {
    id: "measurement-material-omission",
    response:
      "Measurement 2 is higher than measurement 1. What is the next measurement?",
    expected: "PARTIAL" as const,
  },
  {
    id: "measurement-material-conflict",
    response:
      "Measurement 2 is higher than measurement 1, so these two observations prove the values are increasing over time. What is the next measurement?",
    expected: "FAIL" as const,
  },
] as const;

function makeMeasurementCase(fixtureId: string): TutorEvalCase {
  return parseTutorEvalCase({
    schemaVersion: 1,
    id: fixtureId,
    version: "1.0.0",
    metadata: {
      subject: "synthetic",
      topic: "measurement trend inference",
      tags: ["provider-free", "composite-rubric", "explicit-conflict"],
    },
    tutorInput: {
      learningObjective: "Interpret observations without overclaiming a trend.",
      studentProfile: { level: "synthetic", goal: "check an inference" },
      studentMessage: "What can these two measurements tell us?",
      problemContext:
        "Measurement 2 is higher than measurement 1, but two observations alone are insufficient to establish a trend; another observation is needed.",
    },
    evaluatorOnly: {
      groundTruth: {
        requiredConcepts: [
          "compare the two measurements",
          "two observations alone are insufficient to establish a trend",
          "ask for another observation",
        ],
      },
      knownMisconception: "Treating two observations as proof of a time trend.",
      disclosurePolicy: "full_solution_allowed",
      rubrics: [MEASUREMENT_RUBRIC],
    },
  });
}

function makeJudgeResult(
  input: TutorEvalJudgeInput,
  result: TutorEvalJudgeRubricStatus,
): ReturnType<typeof parseTutorEvalJudgeResult> {
  return parseTutorEvalJudgeResult({
    schemaVersion: 1,
    caseId: input.caseId,
    rubricResults: [{
      rubricId: MEASUREMENT_RUBRIC.id,
      result,
      evidence: `Synthetic measurement-boundary evidence for ${input.caseId}.`,
    }],
    criticalFailures: [],
    factualErrors: [],
    insufficientInformation: false,
  });
}

test("v0.9 distinguishes omission from explicit material conflict generically", async () => {
  const prompt = await loadTutorEvalPedagogyJudgePrompt();

  assert.equal(TUTOR_EVAL_PEDAGOGY_JUDGE_PROMPT_VERSION, "0.9");
  assert.match(prompt, /Omission versus explicit material conflict/);
  assert.match(
    prompt,
    /affirmatively asserts, recommends,\s+concludes, performs, or instructs/,
  );
  assert.match(
    prompt,
    /if accepted as true, makes the material requirement impossible to satisfy/,
  );
  assert.match(
    prompt,
    /`FAIL` is the normal status for a substantive explicit material conflict/,
  );
  assert.match(prompt, /not an optional preference/);
  assert.match(prompt, /two measurements/);
  assert.match(prompt, /critical-failure pass/);
  assert.doesNotMatch(
    prompt,
    /reluctant|unsure|pause before agreeing|vocabulary context|word-context|language-word-context-001/i,
  );
});

test("cross-domain omission and conflict statuses pass through parser, ownership, runner, and scorer", async () => {
  const cases = MEASUREMENT_FIXTURES.map((fixture) => makeMeasurementCase(fixture.id));
  const responses = new Map<string, string>(
    MEASUREMENT_FIXTURES.map((fixture) => [fixture.id, fixture.response]),
  );
  const expectations = new Map<string, TutorEvalJudgeRubricStatus>(
    MEASUREMENT_FIXTURES.map((fixture) => [fixture.id, fixture.expected]),
  );
  const seenInputs: TutorEvalJudgeInput[] = [];

  const result = await runTutorEval({
    dataset: {
      id: "synthetic-measurement-explicit-conflict-regression",
      version: "1.0.0",
      cases,
    },
    tutor: {
      id: "synthetic-measurement-rubric-tutor",
      respond: async (input) => {
        assert.ok(input.caseId);
        return { text: responses.get(input.caseId) ?? "" };
      },
    },
    tutorDescriptor: {
      provider: "synthetic",
      model: "synthetic-measurement-rubric-tutor",
      promptVersion: "fixture",
    },
    judge: {
      provider: "synthetic",
      model: "provider-free-measurement-rubric-fixture",
      promptId: TUTOR_EVAL_PEDAGOGY_JUDGE_PROMPT_ID,
      promptVersion: TUTOR_EVAL_PEDAGOGY_JUDGE_PROMPT_VERSION,
      evaluate: async (input) => {
        seenInputs.push(input);
        const tutorEvalCase = cases.find((candidate) => candidate.id === input.caseId);
        assert.ok(tutorEvalCase);
        const { deterministicRubrics, judgeRubrics } = partitionTutorEvalRubrics(tutorEvalCase);
        assert.deepEqual(deterministicRubrics, []);
        assert.deepEqual(judgeRubrics.map((rubric) => rubric.id), [MEASUREMENT_RUBRIC.id]);
        assert.deepEqual(input.rubrics.map((rubric) => rubric.id), [MEASUREMENT_RUBRIC.id]);
        assert.equal(input.disclosurePolicy, "full_solution_allowed");
        const expected = expectations.get(input.caseId);
        assert.ok(expected);
        return makeJudgeResult(input, expected);
      },
    },
    runId: "synthetic-measurement-explicit-conflict-regression-run",
  });

  assert.equal(seenInputs.length, MEASUREMENT_FIXTURES.length);
  assert.equal(result.errorCount, 0);
  const resultById = new Map(result.caseResults.map((caseResult) => [caseResult.caseId, caseResult]));
  assert.deepEqual(
    MEASUREMENT_FIXTURES.map((fixture) => {
      const caseResult = resultById.get(fixture.id);
      assert.ok(caseResult);
      return {
        id: fixture.id,
        result: caseResult.rubricResults[0]?.result,
        score: caseResult.overallScore,
        status: caseResult.status,
        passed: caseResult.passed,
        qualityGate: caseResult.qualityGate,
        criticalFailures: caseResult.criticalFailures,
        answerLeakage: caseResult.answerLeakage,
      };
    }),
    [
      {
        id: "measurement-material-pass",
        result: "PASS",
        score: 1,
        status: "passed",
        passed: true,
        qualityGate: "PASS",
        criticalFailures: [],
        answerLeakage: false,
      },
      {
        id: "measurement-material-omission",
        result: "PARTIAL",
        score: 0.5,
        status: "failed",
        passed: false,
        qualityGate: "PASS",
        criticalFailures: [],
        answerLeakage: false,
      },
      {
        id: "measurement-material-conflict",
        result: "FAIL",
        score: 0,
        status: "failed",
        passed: false,
        qualityGate: "PASS",
        criticalFailures: [],
        answerLeakage: false,
      },
    ],
  );
});
