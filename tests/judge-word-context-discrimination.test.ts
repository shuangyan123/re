import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildWordContextDiscriminationCorpus,
  buildWordContextDiscriminationReport,
  formatWordContextDiscriminationReport,
  getWordContextDiscriminationFixtureCase,
  WORD_CONTEXT_DISCRIMINATION_ACTIONABILITY_CRITERION,
  WORD_CONTEXT_DISCRIMINATION_ACTIONABILITY_RUBRIC_ID,
  WORD_CONTEXT_DISCRIMINATION_CASE_ID,
  WORD_CONTEXT_DISCRIMINATION_CASE_VERSION,
  WORD_CONTEXT_DISCRIMINATION_CORRECTNESS_CRITERION,
  WORD_CONTEXT_DISCRIMINATION_CORRECTNESS_RUBRIC_ID,
  WORD_CONTEXT_DISCRIMINATION_FIXTURES,
  WORD_CONTEXT_DISCRIMINATION_FIXTURE_VERSION,
  WORD_CONTEXT_DISCRIMINATION_JUDGE_IDENTITY,
} from "../src/judge/index.js";
import {
  buildTutorEvalJudgeInput,
  findTutorResponseCorpusValidationIssues,
  partitionTutorEvalRubrics,
  toTutorTurnInput,
  TUTOR_EVAL_DATASET_ID,
  TUTOR_EVAL_DATASET_VERSION,
  TUTOR_EVAL_EVALUATOR_VERSION,
  type TutorEvalCase,
  type TutorEvalDataset,
  type TutorEvalJudgeInput,
  type TutorEvalJudgeResult,
} from "../src/contracts/index.js";
import { loadTutorEvalDataset } from "../src/datasets/index.js";
import { parseTutorbenchArgs } from "../src/cli/tutorbench.js";
import { runTutorResponseCorpus } from "../src/runner/index.js";

async function loadCurrentDataset(): Promise<TutorEvalDataset> {
  return loadTutorEvalDataset(TUTOR_EVAL_DATASET_ID, TUTOR_EVAL_DATASET_VERSION);
}

function requireWordContextCase(dataset: TutorEvalDataset): TutorEvalCase {
  const tutorEvalCase = dataset.cases.find(
    (candidate) => candidate.id === WORD_CONTEXT_DISCRIMINATION_CASE_ID,
  );
  assert.ok(tutorEvalCase);
  return tutorEvalCase;
}

function judgeResultFor(
  input: TutorEvalJudgeInput,
): TutorEvalJudgeResult {
  const fixtureCase = WORD_CONTEXT_DISCRIMINATION_FIXTURES.find(
    (candidate) => input.tutorResponse === candidate.responseText,
  );
  assert.ok(fixtureCase);
  return {
    schemaVersion: 1,
    caseId: input.caseId,
    rubricResults: input.rubrics.map((rubric) => ({
      rubricId: rubric.id,
      result: rubric.id === WORD_CONTEXT_DISCRIMINATION_CORRECTNESS_RUBRIC_ID
        ? fixtureCase.expected.correctness
        : fixtureCase.expected.actionability,
      evidence: `Provider-free diagnostic evidence for fixture ${fixtureCase.id}.`,
    })),
    criticalFailures: [],
    factualErrors: [],
    insufficientInformation: false,
  };
}

test("A/B/C fixture keeps current dataset, case, rubric, and expectation identities", async () => {
  const dataset = await loadCurrentDataset();
  const tutorEvalCase = requireWordContextCase(dataset);
  assert.equal(dataset.version, "0.2a.5");
  assert.equal(tutorEvalCase.version, WORD_CONTEXT_DISCRIMINATION_CASE_VERSION);
  assert.equal(tutorEvalCase.crossLocaleGroupId, WORD_CONTEXT_DISCRIMINATION_CASE_ID);

  const { judgeRubrics } = partitionTutorEvalRubrics(tutorEvalCase);
  assert.deepEqual(
    judgeRubrics.map((rubric) => rubric.id),
    [
      WORD_CONTEXT_DISCRIMINATION_CORRECTNESS_RUBRIC_ID,
      WORD_CONTEXT_DISCRIMINATION_ACTIONABILITY_RUBRIC_ID,
    ],
  );
  assert.equal(
    judgeRubrics[0]?.criterion,
    WORD_CONTEXT_DISCRIMINATION_CORRECTNESS_CRITERION,
  );
  assert.equal(
    judgeRubrics[1]?.criterion,
    WORD_CONTEXT_DISCRIMINATION_ACTIONABILITY_CRITERION,
  );
  assert.deepEqual(
    WORD_CONTEXT_DISCRIMINATION_FIXTURES.map((fixtureCase) => ({
      id: fixtureCase.id,
      runIndex: fixtureCase.runIndex,
      correctness: fixtureCase.expected.correctness,
      actionability: fixtureCase.expected.actionability,
    })),
    [
      { id: "A", runIndex: 1, correctness: "PASS", actionability: "PASS" },
      { id: "B", runIndex: 2, correctness: "PARTIAL", actionability: "PASS" },
      { id: "C", runIndex: 3, correctness: "FAIL", actionability: "PASS" },
    ],
  );
  assert.deepEqual(WORD_CONTEXT_DISCRIMINATION_JUDGE_IDENTITY, {
    promptId: "tutor-eval-pedagogy-judge-system",
    promptVersion: "0.7",
    evaluatorVersion: "0.3a.4",
  });
});

test("synthetic diagnostic corpus validates and never claims recorded-model provenance", async () => {
  const dataset = await loadCurrentDataset();
  const corpus = buildWordContextDiscriminationCorpus();
  assert.equal(corpus.datasetId, TUTOR_EVAL_DATASET_ID);
  assert.equal(corpus.datasetVersion, TUTOR_EVAL_DATASET_VERSION);
  assert.equal(corpus.corpusVersion, WORD_CONTEXT_DISCRIMINATION_FIXTURE_VERSION);
  assert.equal(corpus.provenance, "synthetic");
  assert.equal(corpus.responses.length, 3);
  assert.deepEqual(
    corpus.responses.map((response) => [response.caseId, response.caseVersion, response.runIndex]),
    [
      [WORD_CONTEXT_DISCRIMINATION_CASE_ID, WORD_CONTEXT_DISCRIMINATION_CASE_VERSION, 1],
      [WORD_CONTEXT_DISCRIMINATION_CASE_ID, WORD_CONTEXT_DISCRIMINATION_CASE_VERSION, 2],
      [WORD_CONTEXT_DISCRIMINATION_CASE_ID, WORD_CONTEXT_DISCRIMINATION_CASE_VERSION, 3],
    ],
  );
  assert.deepEqual(
    findTutorResponseCorpusValidationIssues({ corpus, dataset }),
    [],
  );
  assert.doesNotMatch(
    JSON.stringify(corpus),
    /recorded_model|rawProviderPayload|reasoning_content|apiKey|systemPrompt/,
  );
});

test("provider-free runner sends each fixed response through the current Judge request shape", async () => {
  const dataset = await loadCurrentDataset();
  const corpus = buildWordContextDiscriminationCorpus();
  const seenInputs: TutorEvalJudgeInput[] = [];
  const result = await runTutorResponseCorpus({
    corpus,
    dataset,
    caseIds: [WORD_CONTEXT_DISCRIMINATION_CASE_ID],
    judge: {
      provider: "synthetic",
      model: "provider-free-judge-fixture",
      promptId: WORD_CONTEXT_DISCRIMINATION_JUDGE_IDENTITY.promptId,
      promptVersion: WORD_CONTEXT_DISCRIMINATION_JUDGE_IDENTITY.promptVersion,
      evaluate: async (input) => {
        seenInputs.push(input);
        return judgeResultFor(input);
      },
    },
    runId: "judge-word-context-discrimination-provider-free",
  });

  assert.equal(seenInputs.length, 3);
  for (const input of seenInputs) {
    assert.equal(input.caseId, WORD_CONTEXT_DISCRIMINATION_CASE_ID);
    assert.equal(input.disclosurePolicy, "no_answer");
    assert.deepEqual(
      input.rubrics.map((rubric) => ({
        id: rubric.id,
        category: rubric.category,
        criterion: rubric.criterion,
        behavior: rubric.behavior,
      })),
      [
        {
          id: WORD_CONTEXT_DISCRIMINATION_CORRECTNESS_RUBRIC_ID,
          category: "correctness",
          criterion: WORD_CONTEXT_DISCRIMINATION_CORRECTNESS_CRITERION,
          behavior: "required",
        },
        {
          id: WORD_CONTEXT_DISCRIMINATION_ACTIONABILITY_RUBRIC_ID,
          category: "actionability",
          criterion: WORD_CONTEXT_DISCRIMINATION_ACTIONABILITY_CRITERION,
          behavior: "desirable",
        },
      ],
    );
    const fixtureCase = WORD_CONTEXT_DISCRIMINATION_FIXTURES.find(
      (candidate) => candidate.responseText === input.tutorResponse,
    );
    assert.ok(fixtureCase);
    assert.equal(input.tutorResponse, fixtureCase.responseText);
    assert.doesNotMatch(
      JSON.stringify(input.tutorResponse),
      /evaluatorOnly|groundTruth|knownMisconception|rubrics|disclosurePolicy/,
    );
  }

  const report = buildWordContextDiscriminationReport(result, { judgeCallCount: 3 });
  assert.equal(result.evaluation.evaluatorVersion, TUTOR_EVAL_EVALUATOR_VERSION);
  assert.deepEqual(
    report.cases.map((fixtureCase) => ({
      id: fixtureCase.fixtureCaseId,
      expected: fixtureCase.expected,
      observed: fixtureCase.observed,
    })),
    [
      { id: "A", expected: { correctness: "PASS", actionability: "PASS" }, observed: { correctness: "PASS", actionability: "PASS" } },
      { id: "B", expected: { correctness: "PARTIAL", actionability: "PASS" }, observed: { correctness: "PARTIAL", actionability: "PASS" } },
      { id: "C", expected: { correctness: "FAIL", actionability: "PASS" }, observed: { correctness: "FAIL", actionability: "PASS" } },
    ],
  );
  assert.equal(report.judgeCallCount, 3);
  assert.equal(report.calibrationStatus, "uncalibrated");
  assert.equal(report.cases[0]?.rawJudgeEvidence.length, 2);
  const formatted = formatWordContextDiscriminationReport(report);
  assert.match(formatted, /A: correctness expected PASS \/ observed PASS/);
  assert.match(formatted, /answer leakage: false/);
  assert.match(formatted, /insufficient information: false/);
  assert.match(formatted, /no benchmark pass\/fail inferred/);
  assert.doesNotMatch(
    JSON.stringify(report),
    /rawProviderPayload|reasoning_content|apiKey|The pause before agreeing suggests hesitation/,
  );
});

test("judge input builder retains evaluator-only context for Judge but not Tutor-visible input", async () => {
  const dataset = await loadCurrentDataset();
  const tutorEvalCase = requireWordContextCase(dataset);
  const fixtureCase = getWordContextDiscriminationFixtureCase(1);
  const input = buildTutorEvalJudgeInput(tutorEvalCase, fixtureCase.responseText);
  assert.equal(input.groundTruth, JSON.stringify({ requiredConcepts: ["context", "reluctant", "unwilling", "hesitant"] }));
  assert.equal(
    input.knownMisconception,
    "The student equates reluctant with unsure even though pausing before agreeing points to being unwilling or hesitant.",
  );
  const tutorVisible = toTutorTurnInput(tutorEvalCase);
  assert.doesNotMatch(JSON.stringify(tutorVisible), /groundTruth|knownMisconception|rubrics|disclosurePolicy/);
});

test("CLI exposes the explicit three-call DeepSeek diagnostic without changing evaluate", () => {
  const parsed = parseTutorbenchArgs([
    "judge-word-context-discrimination",
    "--judge-deepseek",
    "--output",
    "artifacts/word-context-report.json",
  ]);
  assert.equal(parsed.help, false);
  if (parsed.help || !("judgeWordContextDiscrimination" in parsed)) {
    return;
  }
  assert.equal(parsed.judgeWordContextDiscrimination.deepSeekJudge, true);
  assert.match(
    parsed.judgeWordContextDiscrimination.outputPath ?? "",
    /artifacts[\\/]word-context-report\.json$/,
  );
  assert.throws(
    () => parseTutorbenchArgs(["judge-word-context-discrimination"]),
    /--judge-deepseek is required/,
  );
});
