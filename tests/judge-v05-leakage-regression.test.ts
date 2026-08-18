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
import {
  TUTOR_EVAL_PEDAGOGY_JUDGE_PROMPT_VERSION,
} from "../src/judge/index.js";
import { runTutorEval } from "../src/runner/index.js";

const HISTORICAL_PROGRAMMING_RESPONSE = `def run_task(task_name):
    print(f"Starting {task_name}")
    result = task_name()
    print("Completed!")
    return result

run_task(task_a)
run_task(task_b)
run_task(task_c)
run_task(task_d)`;

function requireCase(
  dataset: Awaited<ReturnType<typeof loadTutorEvalDataset>>,
  caseId: string,
): TutorEvalCase {
  const tutorEvalCase = dataset.cases.find((candidate) => candidate.id === caseId);
  assert.ok(tutorEvalCase, `${caseId} must exist in ${dataset.version}`);
  return tutorEvalCase;
}

function makeJudgeResult(
  tutorEvalCase: TutorEvalCase,
  rubricResults: TutorEvalJudgeResult["rubricResults"],
  criticalFailures: TutorEvalJudgeResult["criticalFailures"] = [],
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

function allPassJudgeResult(tutorEvalCase: TutorEvalCase): TutorEvalJudgeResult {
  const { judgeRubrics } = partitionTutorEvalRubrics(tutorEvalCase);
  return makeJudgeResult(
    tutorEvalCase,
    judgeRubrics.map((rubric) => ({
      rubricId: rubric.id,
      result: "PASS",
      evidence: "The response satisfies the supplied atomic rubric.",
    })),
  );
}

async function runProviderFreeJudge(
  datasetVersion: string,
  tutorEvalCase: TutorEvalCase,
  response: string,
  judgeResult: TutorEvalJudgeResult,
  inspectInput?: (input: TutorEvalJudgeInput) => void,
) {
  const run = await runTutorEval({
    dataset: {
      id: TUTOR_EVAL_DATASET_ID,
      version: datasetVersion,
      cases: [tutorEvalCase],
    },
    tutor: {
      id: "judge-v05-semantic-regression-tutor",
      respond: async () => ({ text: response }),
    },
    tutorDescriptor: {
      provider: "synthetic",
      model: "judge-v05-semantic-regression-tutor",
      promptVersion: "test",
    },
    judge: {
      provider: "synthetic",
      model: "provider-free-judge-fixture",
      promptVersion: TUTOR_EVAL_PEDAGOGY_JUDGE_PROMPT_VERSION,
      evaluate: async (input) => {
        inspectInput?.(input);
        return judgeResult;
      },
    },
  });
  const caseResult = run.caseResults[0];
  assert.ok(caseResult);
  return { run, caseResult };
}

test("v0.5 regression mirrors historical programming abstraction without a disclosure rubric", async () => {
  const historical = await loadTutorEvalDataset(
    TUTOR_EVAL_DATASET_ID,
    TUTOR_EVAL_PREVIOUS_CANONICAL_DATASET_VERSION,
  );
  const tutorEvalCase = requireCase(historical, "programming-abstraction-transfer-001");
  const { judgeRubrics } = partitionTutorEvalRubrics(tutorEvalCase);

  assert.equal(historical.version, "0.2a.3");
  assert.equal(tutorEvalCase.evaluatorOnly.disclosurePolicy, "no_answer");
  assert.deepEqual(
    judgeRubrics.map((rubric) => rubric.id),
    [
      "programming-abstraction-adaptation-001",
      "programming-abstraction-action-001",
    ],
  );
  assert.ok(judgeRubrics.every((rubric) => rubric.criticalFailure === undefined));

  const judgeResult = makeJudgeResult(
    tutorEvalCase,
    [
      {
        rubricId: "programming-abstraction-adaptation-001",
        result: "PASS",
        evidence: "The Tutor provides a small reusable function for the repeated pattern.",
      },
      {
        rubricId: "programming-abstraction-action-001",
        result: "FAIL",
        evidence:
          "The Tutor provides a function and pseudocode directly, but does not ask the student to identify the changing input before extracting.",
      },
    ],
    [{
      type: "answer_leakage",
      severity: "major",
      evidence:
        "The Tutor directly provides the complete extracted function implementation under no_answer, completing the central learner operation.",
    }],
  );

  const { run, caseResult } = await runProviderFreeJudge(
    historical.version,
    tutorEvalCase,
    HISTORICAL_PROGRAMMING_RESPONSE,
    judgeResult,
    (input) => {
      assert.equal(input.disclosurePolicy, "no_answer");
      assert.deepEqual(
        input.rubrics.map((rubric) => rubric.id),
        [
          "programming-abstraction-adaptation-001",
          "programming-abstraction-action-001",
        ],
      );
      assert.ok(input.rubrics.every((rubric) => rubric.criticalFailure === undefined));
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

test("v0.5 negative controls keep allowed concepts, abstraction advice, and local diagnosis non-leaking", async () => {
  const current = await loadTutorEvalDataset(TUTOR_EVAL_DATASET_ID);
  const historical = await loadTutorEvalDataset(
    TUTOR_EVAL_DATASET_ID,
    TUTOR_EVAL_PREVIOUS_CANONICAL_DATASET_VERSION,
  );
  const cases = [
    {
      datasetVersion: current.version,
      tutorEvalCase: requireCase(current, "science-density-knowledge-001"),
      response: "Density is mass divided by volume: density = mass / volume.",
    },
    {
      datasetVersion: historical.version,
      tutorEvalCase: requireCase(historical, "programming-abstraction-transfer-001"),
      response:
        "A small reusable function is a good fit here. First identify the one changing input and the repeated operation; then you can extract the function.",
    },
    {
      datasetVersion: current.version,
      tutorEvalCase: requireCase(current, "science-graph-error-001"),
      response:
        "The vertical axis is amount, not rate; reread it and reconsider what the peak means.",
    },
    {
      datasetVersion: current.version,
      tutorEvalCase: requireCase(current, "language-word-context-001"),
      response:
        "Reluctant is closer to unwilling or hesitant than unsure. The pause before agreeing is the context clue. Which phrase shows that pause?",
    },
  ] as const;

  for (const entry of cases) {
    const { judgeRubrics } = partitionTutorEvalRubrics(entry.tutorEvalCase);
    assert.ok(judgeRubrics.length > 0, entry.tutorEvalCase.id);
    assert.ok(
      judgeRubrics.every((rubric) => rubric.criticalFailure === undefined),
      entry.tutorEvalCase.id,
    );
    const { run, caseResult } = await runProviderFreeJudge(
      entry.datasetVersion,
      entry.tutorEvalCase,
      entry.response,
      allPassJudgeResult(entry.tutorEvalCase),
      (input) => assert.equal(input.disclosurePolicy, entry.tutorEvalCase.evaluatorOnly.disclosurePolicy),
    );
    assert.equal(run.errorCount, 0, entry.tutorEvalCase.id);
    assert.equal(caseResult.answerLeakage, false, entry.tutorEvalCase.id);
    assert.deepEqual(caseResult.criticalFailures, [], entry.tutorEvalCase.id);
  }
});
