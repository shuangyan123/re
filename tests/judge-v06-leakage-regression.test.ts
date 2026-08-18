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
import { runTutorEval } from "../src/runner/index.js";

const HISTORICAL_LANGUAGE_WORD_RESPONSE = `You're on the right track! "Reluctant" and "unsure" are related ideas—both involve hesitation—but they don't mean exactly the same thing.

**Reluctant** means being *unwilling* or *resistant* to do something. It suggests the person knows what they could do but doesn't really want to.

**Unsure** means being *uncertain*—not confident about something.

Think about it this way: you might be sure you *should* do something, but still reluctant to actually do it. Or you might know exactly what to do but feel unsure about whether it will work.

Looking at your context clue—a character **pauses before agreeing**—this suggests they don't want to agree right away. They're hesitating because they're resistant, not necessarily because they're uncertain.

So a closer word might be "unwilling" or "hesitant." But your guess of "unsure" shows you're picking up on the hesitation, which is the key clue! That's good inference work.

Would you like to try a different word, or should we look at another clue in the sentence together?`;

const HISTORICAL_GRAPH_RESPONSE = `You're thinking that a peak on a graph means a fast rate—that's a reasonable idea that works for *rate* graphs. But let's check what this graph is actually showing.

**Can you look at the vertical axis (the y-axis) and read its label out loud?** What is it measuring—*amount* of something, or *rate* of change?

Once you confirm that, think about it: if the y-axis shows **amount**, then a high point means there's a *lot* of that substance present—not necessarily that it's changing quickly. In fact, when the amount stops increasing and levels off, that often means the reaction has *slowed down* or even *stopped*.

Does that help you reconsider what the peak means on this graph?`;

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
  tutorEvalCase: TutorEvalCase,
  response: string,
  judgeResult: TutorEvalJudgeResult,
  inspectInput?: (input: TutorEvalJudgeInput) => void,
) {
  const run = await runTutorEval({
    dataset: {
      id: TUTOR_EVAL_DATASET_ID,
      version: TUTOR_EVAL_PREVIOUS_CANONICAL_DATASET_VERSION,
      cases: [tutorEvalCase],
    },
    tutor: {
      id: "judge-v06-semantic-regression-tutor",
      respond: async () => ({ text: response }),
    },
    tutorDescriptor: {
      provider: "synthetic",
      model: "judge-v06-semantic-regression-tutor",
      promptVersion: "test",
    },
    judge: {
      provider: "synthetic",
      model: "provider-free-judge-fixture",
      promptVersion: "0.6",
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

test("v0.6 keeps the historical word-context correction Tutor-owned", async () => {
  const historical = await loadTutorEvalDataset(
    TUTOR_EVAL_DATASET_ID,
    TUTOR_EVAL_PREVIOUS_CANONICAL_DATASET_VERSION,
  );
  const tutorEvalCase = requireCase(historical, "language-word-context-001");
  const { judgeRubrics } = partitionTutorEvalRubrics(tutorEvalCase);

  assert.equal(historical.version, "0.2a.3");
  assert.equal(tutorEvalCase.evaluatorOnly.disclosurePolicy, "no_answer");
  assert.deepEqual(
    judgeRubrics.map((rubric) => rubric.id),
    ["language-word-context-001", "language-word-question-001"],
  );

  const { run, caseResult } = await runProviderFreeJudge(
    tutorEvalCase,
    HISTORICAL_LANGUAGE_WORD_RESPONSE,
    allPassJudgeResult(tutorEvalCase),
    (input) => {
      assert.equal(input.disclosurePolicy, "no_answer");
      assert.match(input.tutorResponse, /reluctant.*unwilling/s);
      assert.match(input.tutorResponse, /pauses before agreeing/);
      assert.match(input.tutorResponse, /resistant/);
    },
  );

  assert.equal(run.errorCount, 0);
  assert.equal(caseResult.answerLeakage, false);
  assert.deepEqual(caseResult.criticalFailures, []);
});

test("v0.6 keeps the historical graph diagnosis and consequence Tutor-owned", async () => {
  const historical = await loadTutorEvalDataset(
    TUTOR_EVAL_DATASET_ID,
    TUTOR_EVAL_PREVIOUS_CANONICAL_DATASET_VERSION,
  );
  const tutorEvalCase = requireCase(historical, "science-graph-error-001");

  assert.equal(historical.version, "0.2a.3");
  assert.equal(tutorEvalCase.evaluatorOnly.disclosurePolicy, "hint_only");
  const { run, caseResult } = await runProviderFreeJudge(
    tutorEvalCase,
    HISTORICAL_GRAPH_RESPONSE,
    allPassJudgeResult(tutorEvalCase),
    (input) => {
      assert.equal(input.disclosurePolicy, "hint_only");
      assert.match(input.tutorResponse, /vertical axis.*y-axis/s);
      assert.match(input.tutorResponse, /amount.*rate/s);
      assert.match(input.tutorResponse, /slowed down.*stopped/s);
      assert.match(input.tutorResponse, /reconsider what the peak means/);
    },
  );

  assert.equal(run.errorCount, 0);
  assert.equal(caseResult.answerLeakage, false);
  assert.deepEqual(caseResult.criticalFailures, []);
});

test("v0.6 preserves independent leakage detection for historical function extraction", async () => {
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
        evidence: "The Tutor recommends a small reusable function for the repeated pattern.",
      },
      {
        rubricId: "programming-abstraction-action-001",
        result: "FAIL",
        evidence:
          "The Tutor provides the extracted implementation instead of asking the student to identify the changing input.",
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
      assert.match(input.tutorResponse, /def run_task/);
      assert.match(input.tutorResponse, /run_task\(task_d\)/);
    },
  );

  assert.equal(run.errorCount, 0);
  assert.equal(caseResult.answerLeakage, true);
  assert.deepEqual(
    caseResult.criticalFailures.map((failure) => [failure.type, failure.severity]),
    [["answer_leakage", "major"]],
  );
});
