import assert from "node:assert/strict";
import { test } from "node:test";

import {
  BenchmarkConfigurationError,
  TUTOR_EVAL_DATASET_ID,
  TUTOR_EVAL_DATASET_VERSION,
  TUTOR_EVAL_PREVIOUS_BILINGUAL_DATASET_VERSION,
  TUTOR_EVAL_PREVIOUS_DATASET_VERSION,
  TUTOR_EVAL_CAPABILITY_TAGS,
  TUTOR_EVAL_EVALUATOR_VERSION,
  TUTOR_EVAL_LEARNING_TASKS,
  TUTOR_EVAL_STUDENT_STATES,
  TUTOR_EVAL_LEGACY_DATASET_ID,
  parseTutorEvalCase,
  toTutorTurnInput,
  type TutorEvalCase,
} from "../src/contracts/index.js";
import {
  buildTutorEvalCoverageReport,
  findTutorEvalDatasetIntegrityIssues,
  loadTutorEvalDataset,
} from "../src/datasets/index.js";

test("the canonical 0.2A dataset loads through the runtime contract and covers all disclosure policies", async () => {
  const dataset = await loadTutorEvalDataset(TUTOR_EVAL_DATASET_ID);
  const report = buildTutorEvalCoverageReport(dataset);

  assert.equal(dataset.cases.length, 48);
  assert.equal(
    dataset.cases.filter((caseValue) => caseValue.version === "1.1.0").length,
    18,
  );
  assert.deepEqual(Object.keys(report.casesBySubject), [
    "history_or_social_studies",
    "language",
    "mathematics",
    "programming",
    "science",
  ]);
  assert.deepEqual(report.casesByDisclosurePolicy, {
    full_solution_allowed: 8,
    full_solution_required: 6,
    hint_only: 16,
    no_answer: 8,
    partial_solution: 10,
  });
  assert.deepEqual(report.casesByLocale, { en: 24, "zh-CN": 24 });
  assert.equal(report.counterfactualPairCount, 4);
  assert.equal(report.crossLocaleGroupCount, 24);
  assert.equal(report.judgeRequiredRubricCount, 118);
  const deterministicRubrics = dataset.cases
    .flatMap((caseValue) => caseValue.evaluatorOnly.rubrics)
    .filter((rubric) => rubric.evaluationType === "deterministic")
    .map((rubric) => [rubric.id, rubric.evaluatorId]);
  assert.deepEqual(deterministicRubrics, [
    ["fraction-no-leak-001", "direct_answer_leak"],
    ["equation-hint-no-leak-001", "direct_answer_leak"],
    ["wrong-reasoning-answer-001", "matches_ground_truth"],
    ["full-solution-correctness-001", "contains_normalized_expression"],
    ["fraction-no-leak-001-zh-CN", "direct_answer_leak"],
    ["equation-hint-no-leak-001-zh-CN", "direct_answer_leak"],
    ["wrong-reasoning-answer-001-zh-CN", "matches_ground_truth"],
    ["full-solution-correctness-001-zh-CN", "contains_normalized_expression"],
  ]);
  assert.equal(TUTOR_EVAL_EVALUATOR_VERSION, "0.3a.3");
  assert.equal(report.caseCount, 48);
  assert.equal(report.rubricCount, 126);
  for (const capabilityTag of TUTOR_EVAL_CAPABILITY_TAGS) {
    assert.ok(report.casesByCapabilityTag[capabilityTag] !== undefined, capabilityTag);
  }
  for (const learningTask of TUTOR_EVAL_LEARNING_TASKS) {
    assert.ok(report.casesByLearningTask[learningTask] !== undefined, learningTask);
  }
  for (const studentState of TUTOR_EVAL_STUDENT_STATES) {
    assert.ok(report.casesByStudentState[studentState] !== undefined, studentState);
  }
});

test("coverage is deterministic and keeps every configured disclosure bucket", async () => {
  const dataset = await loadTutorEvalDataset(TUTOR_EVAL_DATASET_ID);
  const first = buildTutorEvalCoverageReport(dataset);
  const second = buildTutorEvalCoverageReport({
    ...dataset,
    cases: [...dataset.cases].reverse(),
  });
  assert.deepEqual(second, first);
  assert.deepEqual(Object.keys(first.casesByDisclosurePolicy), [
    "full_solution_allowed",
    "full_solution_required",
    "hint_only",
    "no_answer",
    "partial_solution",
  ]);
});

test("legacy v0.1 cases remain readable while the canonical loader uses 0.2A", async () => {
  const legacy = await loadTutorEvalDataset(TUTOR_EVAL_LEGACY_DATASET_ID);
  const current = await loadTutorEvalDataset(TUTOR_EVAL_DATASET_ID);
  const historical = await loadTutorEvalDataset(
    TUTOR_EVAL_DATASET_ID,
    TUTOR_EVAL_PREVIOUS_DATASET_VERSION,
  );
  const historicalBilingual = await loadTutorEvalDataset(
    TUTOR_EVAL_DATASET_ID,
    TUTOR_EVAL_PREVIOUS_BILINGUAL_DATASET_VERSION,
  );
  assert.equal(legacy.version, "0.1");
  assert.equal(legacy.cases.length, 7);
  assert.equal(current.version, TUTOR_EVAL_DATASET_VERSION);
  assert.equal(current.cases.length, 48);
  assert.equal(historical.version, TUTOR_EVAL_PREVIOUS_DATASET_VERSION);
  assert.equal(historical.cases.length, 24);
  assert.ok(historical.cases.every((caseValue) => (caseValue.locale ?? "en") === "en"));
  assert.equal(historicalBilingual.version, TUTOR_EVAL_PREVIOUS_BILINGUAL_DATASET_VERSION);
  assert.equal(historicalBilingual.cases.length, 48);
  assert.ok(
    historicalBilingual.cases.some(
      (caseValue) => caseValue.id === "fraction-misconception-001-zh-CN" &&
        caseValue.version === "1.0.0",
    ),
  );
});

test("structured taxonomy and difficulty metadata are runtime validated", async () => {
  const dataset = await loadTutorEvalDataset(TUTOR_EVAL_DATASET_ID);
  const base = dataset.cases[0]!;
  assert.equal(base.metadata.taxonomyVersion, "0.2A");
  assert.deepEqual(base.metadata.difficulty, {
    learnerLevel: "upper-elementary",
    taskDifficulty: 2,
    pedagogicalDifficulty: 3,
  });

  assert.throws(
    () =>
      parseTutorEvalCase({
        ...base,
        metadata: { ...base.metadata, learningTask: "not-a-task" },
      }),
    (error: unknown) =>
      error instanceof BenchmarkConfigurationError &&
      error.code === "tutor_eval_case_invalid",
  );
  assert.throws(
    () =>
      parseTutorEvalCase({
        ...base,
        metadata: {
          ...base.metadata,
          difficulty: {
            learnerLevel: "upper-elementary",
            taskDifficulty: 6,
            pedagogicalDifficulty: 3,
          },
        },
      }),
    /TutorEval case configuration is invalid\./,
  );
});

test("evaluator-only taxonomy annotations never cross the Tutor input boundary", async () => {
  const dataset = await loadTutorEvalDataset(TUTOR_EVAL_DATASET_ID);
  const tutorEvalCase = dataset.cases.find(
    (caseValue) => caseValue.id === "fraction-misconception-001",
  )!;
  const tutorInput = toTutorTurnInput(tutorEvalCase);
  const serialized = JSON.stringify(tutorInput);

  assert.doesNotMatch(serialized, /evaluatorOnly|groundTruth|7\/12|different-sized units/);
  assert.doesNotMatch(serialized, /answer_leakage|answer_non_disclosure/);
  assert.equal(tutorInput.caseId, tutorEvalCase.id);
});

test("malformed counterfactual pairs are rejected without changing runtime scoring contracts", () => {
  const makePairCase = (
    id: string,
    state: "novice" | "procedural_error",
    variant: string,
  ): TutorEvalCase =>
    parseTutorEvalCase({
      schemaVersion: 1,
      id,
      version: "1.0.0",
      adaptationPairId: "malformed-pair",
      adaptationVariant: variant,
      metadata: {
        subject: "mathematics",
        topic: "a problem",
        taxonomyVersion: "0.2A",
        learningTask: "concept_explanation",
        studentState: state,
        difficulty: {
          learnerLevel: "elementary",
          taskDifficulty: 1,
          pedagogicalDifficulty: 2,
        },
        capabilityTags: ["conceptual_correctness"],
      },
      tutorInput: {
        learningObjective: "Explain the problem.",
        studentMessage: "Please help.",
      },
      evaluatorOnly: {
        groundTruth: { finalAnswer: "1" },
        knownMisconception: null,
        disclosurePolicy: "no_answer",
        rubrics: [
          {
            id: `${id}-rubric`,
            category: "correctness",
            criterion: "State the relevant fact.",
            weight: 1,
            behavior: "required",
            capabilityTag: "conceptual_correctness",
            evaluationType: "judge",
          },
        ],
      },
    });

  const first = makePairCase("malformed-a", "novice", "same");
  const second = makePairCase("malformed-b", "procedural_error", "same");
  const issues = findTutorEvalDatasetIntegrityIssues({
    id: "test-dataset",
    version: "0.2a",
    cases: [first, second],
  });
  assert.ok(issues.some((issue) => issue.code === "adaptation_pair_malformed"));
});

test("the integrity guard rejects duplicate category-capability rubric mappings", async () => {
  const dataset = await loadTutorEvalDataset(TUTOR_EVAL_DATASET_ID);
  const base = dataset.cases[0]!;
  const originalRubric = base.evaluatorOnly.rubrics[0]!;
  assert.ok(originalRubric.capabilityTag);
  const duplicated = {
    ...base,
    id: "duplicate-capability-001",
    evaluatorOnly: {
      ...base.evaluatorOnly,
      rubrics: [
        ...base.evaluatorOnly.rubrics,
        {
          ...originalRubric,
          id: "duplicate-capability-rubric",
          category: originalRubric.category,
          capabilityTag: originalRubric.capabilityTag,
        },
      ],
    },
  };
  const issues = findTutorEvalDatasetIntegrityIssues(
    { ...dataset, cases: [duplicated] },
    { requireTaxonomyMetadata: true },
  );
  assert.ok(
    issues.some((issue) => issue.code === "rubric_capability_duplicate"),
  );
});

test("runtime validation rejects hidden annotations placed in Tutor-visible input", async () => {
  const dataset = await loadTutorEvalDataset(TUTOR_EVAL_DATASET_ID);
  const base = dataset.cases[0]!;
  assert.throws(
    () =>
      parseTutorEvalCase({
        ...base,
        tutorInput: {
          ...base.tutorInput,
          problemContext: {
            visible: "context",
            groundTruth: "must remain hidden",
          },
        },
      }),
    (error: unknown) =>
      error instanceof BenchmarkConfigurationError &&
      error.code === "tutor_eval_case_invalid",
  );
});

test("the integrity guard rejects invalid dataset and case versions", async () => {
  const dataset = await loadTutorEvalDataset(TUTOR_EVAL_DATASET_ID);
  const issues = findTutorEvalDatasetIntegrityIssues(
    {
      ...dataset,
      version: "not-a-version",
      cases: [{ ...dataset.cases[0]!, version: "draft" }],
    },
    {
      requireTaxonomyMetadata: true,
      expectedDatasetVersion: TUTOR_EVAL_DATASET_VERSION,
    },
  );
  assert.equal(
    issues.filter((issue) => issue.code === "version_invalid").length,
    2,
  );
});
