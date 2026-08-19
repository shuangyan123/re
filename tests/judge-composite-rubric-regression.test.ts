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

const COMPOSITE_RUBRIC = {
  id: "composite-evidence-boundary",
  category: "correctness" as const,
  criterion:
    "State what the observation supports, explain its implication, and state what the observation cannot establish on its own.",
  weight: 1,
  behavior: "required" as const,
  evaluationType: "judge" as const,
};

const COMPOSITE_FIXTURES = [
  {
    id: "composite-material-pass",
    response:
      "The observation supports water stress, which explains the wilted leaves. It cannot establish the presence of root disease on its own.",
    expected: "PASS" as const,
  },
  {
    id: "composite-material-omission",
    response:
      "The observation supports water stress, which explains the wilted leaves.",
    expected: "PARTIAL" as const,
  },
  {
    id: "composite-material-conflict",
    response:
      "The wilted leaves definitely prove that the plant has root disease.",
    expected: "FAIL" as const,
  },
] as const;

function makeCompositeCase(fixtureId: string): TutorEvalCase {
  return parseTutorEvalCase({
    schemaVersion: 1,
    id: fixtureId,
    version: "1.0.0",
    metadata: {
      subject: "synthetic",
      topic: "composite rubric grading",
      tags: ["provider-free", "composite-rubric"],
    },
    tutorInput: {
      learningObjective: "Interpret an observation without overclaiming.",
      studentProfile: { level: "synthetic", goal: "check an explanation" },
      studentMessage: "What can we conclude from the wilted leaves?",
      problemContext:
        "Wilted leaves are consistent with water stress, but the observation alone does not establish root disease.",
    },
    evaluatorOnly: {
      groundTruth: {
        requiredConcepts: ["water stress", "does not establish root disease"],
      },
      knownMisconception: "Treating one observation as proof of a specific cause.",
      disclosurePolicy: "full_solution_allowed",
      rubrics: [COMPOSITE_RUBRIC],
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
      rubricId: COMPOSITE_RUBRIC.id,
      result,
      evidence: `Synthetic composite-rubric evidence for ${input.caseId}.`,
    }],
    criticalFailures: [],
    factualErrors: [],
    insufficientInformation: false,
  });
}

test("v0.8 prompt defines substantive composite-rubric grading without clause splitting", async () => {
  const prompt = await loadTutorEvalPedagogyJudgePrompt();

  assert.equal(TUTOR_EVAL_PEDAGOGY_JUDGE_PROMPT_VERSION, "0.8");
  assert.match(prompt, /Material-requirement grading for composite criteria/);
  assert.match(prompt, /first identify its material requirements/);
  assert.match(
    prompt,
    /`PASS` is allowed only when all material requirements are substantially\s+satisfied/,
  );
  assert.match(
    prompt,
    /`PARTIAL` is preferred when the core direction is basically correct/,
  );
  assert.match(
    prompt,
    /`FAIL` applies when the response explicitly violates, reverses, denies, or\s+materially conflicts/,
  );
  assert.match(prompt, /do not mechanically split every\s+comma/);
  assert.match(prompt, /`definitely`\s+proves/);
  assert.match(prompt, /ordinary rubric\s+failure/);
  assert.match(prompt, /critical-failure pass and its existing case-aware boundaries/);
});

test("generic composite rubric statuses pass through parser, ownership, runner, and scorer", async () => {
  const cases = COMPOSITE_FIXTURES.map((fixture) => makeCompositeCase(fixture.id));
  const responses = new Map<string, string>(
    COMPOSITE_FIXTURES.map((fixture) => [fixture.id, fixture.response]),
  );
  const expectations = new Map<string, TutorEvalJudgeRubricStatus>(
    COMPOSITE_FIXTURES.map((fixture) => [fixture.id, fixture.expected]),
  );
  const seenInputs: TutorEvalJudgeInput[] = [];

  const result = await runTutorEval({
    dataset: {
      id: "synthetic-composite-rubric-regression",
      version: "1.0.0",
      cases,
    },
    tutor: {
      id: "synthetic-composite-rubric-tutor",
      respond: async (input) => {
        assert.ok(input.caseId);
        return { text: responses.get(input.caseId) ?? "" };
      },
    },
    tutorDescriptor: {
      provider: "synthetic",
      model: "synthetic-composite-rubric-tutor",
      promptVersion: "fixture",
    },
    judge: {
      provider: "synthetic",
      model: "provider-free-composite-rubric-fixture",
      promptId: TUTOR_EVAL_PEDAGOGY_JUDGE_PROMPT_ID,
      promptVersion: TUTOR_EVAL_PEDAGOGY_JUDGE_PROMPT_VERSION,
      evaluate: async (input) => {
        seenInputs.push(input);
        const tutorEvalCase = cases.find((candidate) => candidate.id === input.caseId);
        assert.ok(tutorEvalCase);
        const { deterministicRubrics, judgeRubrics } = partitionTutorEvalRubrics(tutorEvalCase);
        assert.deepEqual(deterministicRubrics, []);
        assert.deepEqual(judgeRubrics.map((rubric) => rubric.id), [COMPOSITE_RUBRIC.id]);
        assert.deepEqual(input.rubrics.map((rubric) => rubric.id), [COMPOSITE_RUBRIC.id]);
        assert.equal(input.disclosurePolicy, "full_solution_allowed");
        const expected = expectations.get(input.caseId);
        assert.ok(expected);
        return makeJudgeResult(input, expected);
      },
    },
    runId: "synthetic-composite-rubric-regression-run",
  });

  assert.equal(seenInputs.length, COMPOSITE_FIXTURES.length);
  assert.equal(result.errorCount, 0);
  assert.deepEqual(
    result.caseResults.map((caseResult) => ({
      id: caseResult.caseId,
      result: caseResult.rubricResults[0]?.result,
      score: caseResult.overallScore,
      status: caseResult.status,
      passed: caseResult.passed,
      criticalFailures: caseResult.criticalFailures,
    })),
    [
      {
        id: "composite-material-conflict",
        result: "FAIL",
        score: 0,
        status: "failed",
        passed: false,
        criticalFailures: [],
      },
      {
        id: "composite-material-omission",
        result: "PARTIAL",
        score: 0.5,
        status: "failed",
        passed: false,
        criticalFailures: [],
      },
      {
        id: "composite-material-pass",
        result: "PASS",
        score: 1,
        status: "passed",
        passed: true,
        criticalFailures: [],
      },
    ],
  );
});
