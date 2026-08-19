import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { test } from "node:test";
import { resolve } from "node:path";

import {
  buildTutorEvalJudgeInput,
  isTutorEvalCompleteAnswerPermitted,
  parseTutorEvalCase,
  TUTOR_EVAL_DATASET_ID,
  TUTOR_EVAL_DATASET_VERSION,
  TUTOR_EVAL_DISCLOSURE_POLICIES,
  TUTOR_EVAL_DISCLOSURE_POLICY_DEFINITIONS,
  TUTOR_EVAL_EVALUATOR_VERSION,
  resolveTutorCaseLocale,
  type DisclosurePolicy,
  type TutorEvalCase,
  type TutorEvalJudgeResult,
  type TutorEvalRubric,
} from "../src/contracts/index.js";
import { evaluateTutorEvalRubric } from "../src/evaluators/index.js";
import { loadTutorEvalDataset } from "../src/datasets/index.js";
import {
  loadTutorEvalPedagogyJudgePrompt,
  TUTOR_EVAL_PEDAGOGY_JUDGE_PROMPT_VERSION,
} from "../src/judge/index.js";
import { runTutorEval } from "../src/runner/index.js";

const allPolicies: readonly DisclosurePolicy[] = [
  "no_answer",
  "hint_only",
  "partial_solution",
  "full_solution_allowed",
  "full_solution_required",
];

function makeCase(
  id: string,
  policy: DisclosurePolicy,
  rubrics: readonly TutorEvalRubric[],
  finalAnswer?: string,
): TutorEvalCase {
  return parseTutorEvalCase({
    schemaVersion: 1,
    id,
    version: "1.0.0",
    metadata: {
      subject: "synthetic",
      topic: "disclosure semantics",
      tags: ["test"],
    },
    tutorInput: {
      learningObjective: "Help the student take the appropriate next step.",
      studentProfile: { level: "test", goal: "test" },
      studentMessage: "Please help me.",
      problemContext: "Visible problem context.",
    },
    evaluatorOnly: {
      ...(finalAnswer === undefined ? {} : { groundTruth: { finalAnswer } }),
      disclosurePolicy: policy,
      rubrics,
    },
  });
}

function answerLeakRubric(): TutorEvalRubric {
  return {
    id: "answer-boundary",
    category: "guidance",
    criterion: "Do not disclose the configured final answer.",
    weight: 1,
    behavior: "prohibited",
    evaluationType: "deterministic",
    evaluatorId: "direct_answer_leak",
    config: { forbiddenFinalAnswer: "x=4" },
    criticalFailure: { type: "answer_leakage", severity: "major" },
  };
}

function judgeResult(
  tutorEvalCase: TutorEvalCase,
  result: "PASS" | "PARTIAL" | "FAIL",
  criticalFailures: TutorEvalJudgeResult["criticalFailures"] = [],
): TutorEvalJudgeResult {
  return {
    schemaVersion: 1,
    caseId: tutorEvalCase.id,
    rubricResults: tutorEvalCase.evaluatorOnly.rubrics.map((rubric) => ({
      rubricId: rubric.id,
      result,
      evidence: `Synthetic ${result} evidence.`,
    })),
    criticalFailures,
    factualErrors: [],
    insufficientInformation: false,
  };
}

async function runWithJudge(
  tutorEvalCase: TutorEvalCase,
  responseText: string,
  result: TutorEvalJudgeResult,
) {
  const run = await runTutorEval({
    dataset: {
      id: TUTOR_EVAL_DATASET_ID,
      version: TUTOR_EVAL_DATASET_VERSION,
      cases: [tutorEvalCase],
    },
    tutor: {
      id: "semantic-test-tutor",
      respond: async () => ({ text: responseText }),
    },
    tutorDescriptor: {
      provider: "synthetic",
      model: "semantic-test-tutor",
      promptVersion: "test",
    },
    judge: {
      provider: "synthetic",
      model: "semantic-test-judge",
      promptVersion: TUTOR_EVAL_PEDAGOGY_JUDGE_PROMPT_VERSION,
      evaluate: async (input) => {
        assert.equal(input.caseId, tutorEvalCase.id);
        return result;
      },
    },
  });
  return run.caseResults[0]!;
}

test("the five disclosure policies have canonical definitions and coverage", async () => {
  const dataset = await loadTutorEvalDataset(TUTOR_EVAL_DATASET_ID);
  const counts = new Map<DisclosurePolicy, number>(allPolicies.map((policy) => [policy, 0]));
  for (const tutorEvalCase of dataset.cases) {
    counts.set(
      tutorEvalCase.evaluatorOnly.disclosurePolicy,
      (counts.get(tutorEvalCase.evaluatorOnly.disclosurePolicy) ?? 0) + 1,
    );
  }

  assert.deepEqual(TUTOR_EVAL_DISCLOSURE_POLICIES, allPolicies);
  for (const policy of allPolicies) {
    assert.ok((counts.get(policy) ?? 0) > 0, policy);
    assert.equal(
      TUTOR_EVAL_DISCLOSURE_POLICY_DEFINITIONS[policy].conceptualExplanationAllowed,
      true,
    );
  }
  assert.equal(dataset.version, TUTOR_EVAL_DATASET_VERSION);
  assert.equal(TUTOR_EVAL_EVALUATOR_VERSION, "0.3a.4");
  assert.deepEqual(
    dataset.cases
      .filter(
        (tutorEvalCase) =>
          resolveTutorCaseLocale(tutorEvalCase.locale) === "en" &&
          tutorEvalCase.evaluatorOnly.disclosurePolicy === "no_answer",
      )
      .map((tutorEvalCase) => tutorEvalCase.id),
    [
      "science-density-knowledge-001",
      "language-word-context-001",
      "history-source-context-001",
      "programming-abstraction-transfer-001",
    ],
  );
  assert.ok(
    dataset.cases
      .filter(
        (tutorEvalCase) =>
          resolveTutorCaseLocale(tutorEvalCase.locale) === "en" &&
          tutorEvalCase.evaluatorOnly.disclosurePolicy === "no_answer",
      )
      .every((tutorEvalCase) => tutorEvalCase.evaluatorOnly.groundTruth?.finalAnswer === undefined),
  );
});

test("complete-answer permission is policy-specific and concepts are not globally banned", () => {
  assert.equal(isTutorEvalCompleteAnswerPermitted("no_answer"), false);
  assert.equal(isTutorEvalCompleteAnswerPermitted("hint_only"), false);
  assert.equal(isTutorEvalCompleteAnswerPermitted("partial_solution"), false);
  assert.equal(isTutorEvalCompleteAnswerPermitted("full_solution_allowed"), true);
  assert.equal(isTutorEvalCompleteAnswerPermitted("full_solution_required"), true);

  for (const policy of allPolicies) {
    const tutorEvalCase = makeCase(
      `direct-answer-${policy}`,
      policy,
      [answerLeakRubric()],
      "x=4",
    );
    const result = evaluateTutorEvalRubric(tutorEvalCase, tutorEvalCase.evaluatorOnly.rubrics[0]!, {
      text: "The answer is x=4.",
    });
    const expected =
      policy === "full_solution_allowed" || policy === "full_solution_required"
        ? "PASS"
        : "FAIL";
    assert.equal(result.result, expected, policy);
  }
});

test("no_answer concept explanation is not inferred as leakage", async () => {
  const dataset = await loadTutorEvalDataset(TUTOR_EVAL_DATASET_ID);
  const tutorEvalCase = dataset.cases.find(
    (caseValue) => caseValue.id === "history-source-context-001",
  )!;
  const result = await runWithJudge(
    tutorEvalCase,
    "Source perspective and historical context shape an account.",
    judgeResult(tutorEvalCase, "PASS"),
  );
  assert.equal(result.status, "passed");
  assert.equal(result.answerLeakage, false);
  assert.deepEqual(result.criticalFailures, []);
});

test("full_solution_required withholding is an ordinary rubric failure", async () => {
  const tutorEvalCase = makeCase(
    "required-solution-withheld",
    "full_solution_required",
    [
      {
        id: "required-solution",
        category: "guidance",
        criterion: "Provide the complete requested solution.",
        weight: 1,
        behavior: "required",
        evaluationType: "judge",
      },
    ],
  );
  const result = await runWithJudge(
    tutorEvalCase,
    "I will not provide the solution.",
    judgeResult(tutorEvalCase, "FAIL"),
  );
  assert.equal(result.status, "failed");
  assert.equal(result.answerLeakage, false);
  assert.deepEqual(result.criticalFailures, []);
});

test("incomplete diagnosis does not become incorrect_diagnosis automatically", async () => {
  const incompleteCase = makeCase(
    "incomplete-diagnosis",
    "full_solution_required",
    [
      {
        id: "diagnosis",
        category: "diagnosis",
        criterion: "Locate the agreement mismatch.",
        weight: 1,
        behavior: "required",
        critical: true,
        evaluationType: "judge",
      },
    ],
  );
  const incompleteResult = await runWithJudge(
    incompleteCase,
    "Is the main noun the one we should check?",
    judgeResult(incompleteCase, "FAIL"),
  );
  assert.equal(incompleteResult.status, "failed");
  assert.deepEqual(incompleteResult.criticalFailures, []);

  const wrongCase = makeCase(
    "wrong-diagnosis",
    "full_solution_required",
    [
      {
        ...incompleteCase.evaluatorOnly.rubrics[0]!,
        id: "wrong-diagnosis-rubric",
        criticalFailure: { type: "incorrect_diagnosis", severity: "major" },
      },
    ],
  );
  const wrongResult = await runWithJudge(
    wrongCase,
    "The issue is punctuation, not subject-verb agreement.",
    judgeResult(wrongCase, "FAIL", [
      {
        type: "incorrect_diagnosis",
        severity: "major",
        evidence: "The Tutor identifies a different error.",
      },
    ]),
  );
  assert.deepEqual(
    wrongResult.criticalFailures.map((failure) => [failure.type, failure.severity]),
    [["incorrect_diagnosis", "major"]],
  );
});

test("canonical critical-failure mappings are limited to the audited valid set", async () => {
  const dataset = await loadTutorEvalDataset(TUTOR_EVAL_DATASET_ID);
  const mappings = dataset.cases.flatMap((tutorEvalCase) =>
    tutorEvalCase.evaluatorOnly.rubrics.flatMap((rubric) =>
      rubric.criticalFailure === undefined
        ? []
        : [[
            tutorEvalCase.id,
            rubric.id,
            rubric.criticalFailure.type,
            rubric.criticalFailure.severity,
          ] as const],
    ),
  );
  assert.deepEqual(mappings, [
    ["fraction-misconception-001", "fraction-no-leak-001", "answer_leakage", "major"],
    ["hint-only-linear-equation-001", "equation-hint-no-leak-001", "answer_leakage", "major"],
    [
      "correct-answer-wrong-reasoning-001",
      "wrong-reasoning-diagnosis-001",
      "critical_misconception_ignored",
      "major",
    ],
    ["fraction-misconception-001-zh-CN", "fraction-no-leak-001-zh-CN", "answer_leakage", "major"],
    ["hint-only-linear-equation-001-zh-CN", "equation-hint-no-leak-001-zh-CN", "answer_leakage", "major"],
    [
      "correct-answer-wrong-reasoning-001-zh-CN",
      "wrong-reasoning-diagnosis-001-zh-CN",
      "critical_misconception_ignored",
      "major",
    ],
  ]);
  const languageCase = dataset.cases.find(
    (tutorEvalCase) => tutorEvalCase.id === "language-verb-check-001",
  )!;
  assert.equal(languageCase.version, "1.0.1");
  assert.equal(
    languageCase.evaluatorOnly.rubrics.find((rubric) => rubric.id === "language-verb-diagnosis-001")
      ?.criticalFailure,
    undefined,
  );
});

test("current Judge prompt is v0.9 while the v0.2 artifact remains readable", async () => {
  const prompt = await loadTutorEvalPedagogyJudgePrompt();
  assert.equal(TUTOR_EVAL_PEDAGOGY_JUDGE_PROMPT_VERSION, "0.9");
  assert.match(prompt, /two separate evaluation layers/);
  assert.match(prompt, /Material-requirement grading for composite criteria/);
  assert.match(prompt, /Omission versus explicit material conflict/);
  assert.match(prompt, /`FAIL` is the normal status for a substantive explicit material conflict/);
  assert.match(prompt, /mandatory policy-level critical-failure pass/);
  assert.match(prompt, /does not require a dedicated atomic disclosure rubric/);
  assert.match(prompt, /Operation ownership pass/);
  assert.match(prompt, /Prohibited-rubric consistency check/);
  assert.match(prompt, /Tutor-owned teaching operations/);
  assert.match(prompt, /Required-rubric ownership boundary/);
  assert.match(prompt, /task-completing answer/);
  assert.match(prompt, /student_task_takeover/);
  assert.match(prompt, /Wrong diagnosis/);
  assert.match(prompt, /No diagnosis/);
  assert.match(prompt, /meaning A and the context supports meaning B/);
  assert.match(prompt, /vertical axis is amount, not rate/);
  assert.deepEqual(
    buildTutorEvalJudgeInput(
      makeCase("prompt-boundary", "no_answer", [
        {
          id: "concept",
          category: "correctness",
          criterion: "Explain the concept.",
          weight: 1,
          evaluationType: "judge",
        },
      ]),
      "A conceptual explanation.",
    ).disclosurePolicy,
    "no_answer",
  );
  await access(resolve(process.cwd(), "prompts/tutor-eval-pedagogy-judge-system-v0.2.md"));
  const historicalPrompt = await readFile(
    resolve(process.cwd(), "prompts/tutor-eval-pedagogy-judge-system-v0.2.md"),
    "utf8",
  );
  assert.match(historicalPrompt, /System Prompt v0\.2/);
});
