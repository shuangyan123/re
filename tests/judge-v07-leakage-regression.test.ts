import assert from "node:assert/strict";
import { test } from "node:test";

import {
  partitionTutorEvalRubrics,
  parseTutorEvalJudgeResult,
  TUTOR_EVAL_DATASET_ID,
  TUTOR_EVAL_PREVIOUS_CANONICAL_DATASET_VERSION,
  type TutorEvalCase,
  type TutorEvalJudgeInput,
  type TutorEvalJudgeResult,
} from "../src/contracts/index.js";
import { loadTutorEvalDataset } from "../src/datasets/index.js";
import { TUTOR_EVAL_PEDAGOGY_JUDGE_PROMPT_VERSION } from "../src/judge/index.js";
import { runTutorEval } from "../src/runner/index.js";

const HISTORICAL_PROGRAMMING_LOOP_RESPONSE = [
  "# Debugging Your Infinite Loop",
  "",
  "Good thinking—incrementing inside the loop is the right idea! The most common reason it still runs forever is one of these:",
  "",
  "## Most Likely Issue: Wrong Variable",
  "",
  "Check that **the variable you increment is the exact same one** in your loop condition.",
  "",
  "```python",
  "counter = 0",
  "while counter == 0:",
  "    print(\"hello\")",
  "    count = count + 1",
  "```",
  "",
  "## Next Step: Print to See What's Happening",
  "",
  "Add a temporary print **inside** the loop to watch the counter:",
  "",
  "```python",
  "counter = 0",
  "while counter < 5:",
  "    print(f\"Inside loop, counter is {counter}\")",
  "    counter = counter + 1",
  "```",
  "",
  "Run it and check: Is the number changing? Is it the same variable name in both places?",
  "",
  "Quick check: Can you show your actual code?",
].join("\n");

function requireCase(
  dataset: Awaited<ReturnType<typeof loadTutorEvalDataset>>,
  caseId: string,
): TutorEvalCase {
  const tutorEvalCase = dataset.cases.find((candidate) => candidate.id === caseId);
  assert.ok(tutorEvalCase);
  return tutorEvalCase;
}

function makeJudgeResult(
  tutorEvalCase: TutorEvalCase,
  rubricResults: TutorEvalJudgeResult["rubricResults"],
  criticalFailures: TutorEvalJudgeResult["criticalFailures"],
): TutorEvalJudgeResult {
  return parseTutorEvalJudgeResult({
    schemaVersion: 1,
    caseId: tutorEvalCase.id,
    rubricResults,
    criticalFailures,
    factualErrors: [],
    insufficientInformation: false,
  });
}

async function runProviderFreeJudge(
  tutorEvalCase: TutorEvalCase,
  response: string,
  judgeResult: TutorEvalJudgeResult,
  inspectInput: (input: TutorEvalJudgeInput) => void,
) {
  const run = await runTutorEval({
    dataset: {
      id: TUTOR_EVAL_DATASET_ID,
      version: TUTOR_EVAL_PREVIOUS_CANONICAL_DATASET_VERSION,
      cases: [tutorEvalCase],
    },
    tutor: {
      id: "judge-v07-loop-regression-tutor",
      respond: async () => ({ text: response }),
    },
    tutorDescriptor: {
      provider: "synthetic",
      model: "judge-v07-loop-regression-tutor",
      promptVersion: "test",
    },
    judge: {
      provider: "synthetic",
      model: "provider-free-judge-fixture",
      promptVersion: TUTOR_EVAL_PEDAGOGY_JUDGE_PROMPT_VERSION,
      evaluate: async (input) => {
        inspectInput(input);
        return judgeResult;
      },
    },
  });
  const caseResult = run.caseResults[0];
  assert.ok(caseResult);
  return { run, caseResult };
}

test("v0.7 preserves independent policy leakage for the historical complete loop rewrite", async () => {
  const historical = await loadTutorEvalDataset(
    TUTOR_EVAL_DATASET_ID,
    TUTOR_EVAL_PREVIOUS_CANONICAL_DATASET_VERSION,
  );
  const tutorEvalCase = requireCase(historical, "programming-loop-diagnosis-001");
  const { judgeRubrics } = partitionTutorEvalRubrics(tutorEvalCase);

  assert.equal(historical.version, "0.2a.3");
  assert.equal(tutorEvalCase.evaluatorOnly.disclosurePolicy, "hint_only");
  assert.deepEqual(
    judgeRubrics.map((rubric) => rubric.id),
    [
      "programming-loop-location-001",
      "programming-loop-next-001",
      "programming-loop-no-solution-001",
    ],
  );

  const prohibitedRubric = judgeRubrics.find(
    (rubric) => rubric.id === "programming-loop-no-solution-001",
  );
  assert.ok(prohibitedRubric);
  assert.equal(prohibitedRubric.behavior, "prohibited");
  assert.equal(prohibitedRubric.evaluationType, "judge");
  assert.equal(prohibitedRubric.criticalFailure, undefined);

  const judgeResult = makeJudgeResult(
    tutorEvalCase,
    [
      {
        rubricId: "programming-loop-location-001",
        result: "PASS",
        evidence: "The Tutor identifies the condition and counter state to inspect.",
      },
      {
        rubricId: "programming-loop-next-001",
        result: "PASS",
        evidence: "The Tutor asks the student to trace the counter and condition.",
      },
      {
        rubricId: "programming-loop-no-solution-001",
        result: "FAIL",
        evidence:
          "Provides complete while-loop code, including condition and increment, before the student has inspected the state change.",
      },
    ],
    [{
      type: "answer_leakage",
      severity: "major",
      evidence:
        "The Tutor supplies a complete runnable loop rewrite under hint_only, completing the learner-reserved debugging operation.",
    }],
  );
  assert.equal(
    judgeResult.rubricResults.find(
      (result) => result.rubricId === "programming-loop-no-solution-001",
    )?.result,
    "FAIL",
  );
  assert.deepEqual(
    judgeResult.criticalFailures.map((failure) => [failure.type, failure.severity]),
    [["answer_leakage", "major"]],
  );

  const { run, caseResult } = await runProviderFreeJudge(
    tutorEvalCase,
    HISTORICAL_PROGRAMMING_LOOP_RESPONSE,
    judgeResult,
    (input) => {
      assert.equal(input.caseId, tutorEvalCase.id);
      assert.equal(input.disclosurePolicy, "hint_only");
      assert.deepEqual(
        input.rubrics.map((rubric) => ({
          id: rubric.id,
          behavior: rubric.behavior,
          criticalFailure: rubric.criticalFailure,
        })),
        [
          {
            id: "programming-loop-location-001",
            behavior: "required",
            criticalFailure: undefined,
          },
          {
            id: "programming-loop-next-001",
            behavior: "required",
            criticalFailure: undefined,
          },
          {
            id: "programming-loop-no-solution-001",
            behavior: "prohibited",
            criticalFailure: undefined,
          },
        ],
      );
      assert.equal(input.tutorResponse, HISTORICAL_PROGRAMMING_LOOP_RESPONSE);
    },
  );

  assert.equal(run.errorCount, 0);
  assert.equal(caseResult.status, "failed");
  assert.equal(caseResult.answerLeakage, true);
  assert.deepEqual(
    caseResult.criticalFailures.map((failure) => [failure.type, failure.severity]),
    [["answer_leakage", "major"]],
  );
});
