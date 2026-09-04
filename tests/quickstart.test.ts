import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { createGuidedTutor } from "../src/cli/synthetic-guided-tutor.js";
import {
  TUTOR_EVAL_DATASET_ID,
  TUTOR_EVAL_DATASET_VERSION,
  TUTOR_EVAL_EVALUATOR_VERSION,
} from "../src/contracts/index.js";
import { loadTutorEvalDataset } from "../src/datasets/synthetic.js";
import {
  fingerprintTutorEvalCase,
  formatQuickstartSummary,
  loadQuickstartDataset,
  QUICKSTART_CASE_SELECTION,
  QUICKSTART_DATASET_ID,
  QUICKSTART_DATASET_VERSION,
  QUICKSTART_ID,
  QUICKSTART_SELECTION_ID,
  QUICKSTART_VERSION,
  QuickstartInvariantError,
  runQuickstart,
  selectQuickstartCases,
  writeQuickstartSummary,
} from "../src/quickstart.js";
import { runTutorEval } from "../src/runner/tutor-eval-runner.js";

test("Quickstart is a complete, non-official deterministic demonstration", async () => {
  const summary = await runQuickstart();

  assert.equal(summary.mode, "quickstart-demo");
  assert.equal(summary.quickstart.id, QUICKSTART_ID);
  assert.equal(summary.quickstart.version, QUICKSTART_VERSION);
  assert.equal(summary.quickstart.selectionId, QUICKSTART_SELECTION_ID);
  assert.equal(summary.dataset.id, QUICKSTART_DATASET_ID);
  assert.equal(summary.dataset.version, QUICKSTART_DATASET_VERSION);
  assert.equal(summary.dataset.kind, "development-smoke");
  assert.deepEqual(
    summary.caseResults.map((caseResult) => `${caseResult.id}@${caseResult.version}`),
    QUICKSTART_CASE_SELECTION.map((selection) => `${selection.id}@${selection.version}`),
  );
  assert.equal(summary.caseCount, 4);
  assert.equal(summary.completedCaseCount, 4);
  assert.equal(summary.passedCount, 3);
  assert.equal(summary.failedCount, 1);
  assert.equal(summary.errorCount, 0);
  assert.equal(summary.judgeRequired, false);
  assert.equal(summary.judgeUsed, false);
  assert.equal(summary.networkRequired, false);
  assert.equal(summary.networkUsed, false);
  assert.equal(summary.officialBenchmarkScore, false);
  assert.equal(summary.publicLeaderboardEligible, false);
  assert.equal(summary.caseResults[3]?.status, "failed");
  assert.ok(summary.caseResults.every((caseResult) => caseResult.deterministicChecks.errors === 0));
  assert.ok(summary.caseResults.every((caseResult) => !("rawTutorResponse" in caseResult)));

  const formatted = formatQuickstartSummary(summary);
  assert.match(formatted, /Quickstart completed/);
  assert.match(formatted, /Judge: not required/);
  assert.match(formatted, /Network: disabled/);
  assert.match(formatted, /Official benchmark score: no/);
  assert.match(formatted, /Leaderboard eligible: no/);
  assert.match(formatted, /Passed demo cases: 3/);
  assert.match(formatted, /Failed demo cases: 1/);
  assert.doesNotMatch(formatted, /TutorBench Score|Overall/);
});

test("Quickstart remains provider-free and makes no network request with provider keys present", async () => {
  const providerKeys = [
    "OPENAI_API_KEY",
    "DEEPSEEK_API_KEY",
    "MINIMAX_API_KEY",
    "TUTOR_MODEL_API_KEY",
    "CHAT_COMPLETIONS_JUDGE_API_KEY",
  ];
  const previousValues = new Map<string, string | undefined>();
  for (const key of providerKeys) {
    previousValues.set(key, process.env[key]);
    process.env[key] = "quickstart-test-placeholder";
  }

  const originalFetch = globalThis.fetch;
  let fetchCallCount = 0;
  globalThis.fetch = (() => {
    fetchCallCount += 1;
    throw new Error("Quickstart attempted network access.");
  }) as typeof fetch;
  try {
    const summary = await runQuickstart();
    assert.equal(fetchCallCount, 0);
    assert.equal(summary.judgeUsed, false);
    assert.equal(summary.networkUsed, false);
  } finally {
    globalThis.fetch = originalFetch;
    for (const key of providerKeys) {
      const previous = previousValues.get(key);
      if (previous === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = previous;
      }
    }
  }
});

test("Quickstart selection is reproducible and fingerprint-locked", async () => {
  const dataset = await loadQuickstartDataset();
  const selectedCases = selectQuickstartCases(dataset);
  assert.deepEqual(
    selectedCases.map((tutorEvalCase) => `${tutorEvalCase.id}@${tutorEvalCase.version}`),
    QUICKSTART_CASE_SELECTION.map((selection) => `${selection.id}@${selection.version}`),
  );
  assert.deepEqual(
    selectedCases.map(fingerprintTutorEvalCase),
    QUICKSTART_CASE_SELECTION.map((selection) => selection.fingerprint),
  );

  const first = await runQuickstart();
  const second = await runQuickstart();
  assert.deepEqual(second, first);
});

test("Quickstart fails closed when a selected case changes", async () => {
  const dataset = await loadQuickstartDataset();
  const firstCase = dataset.cases[0];
  assert.ok(firstCase);
  const tamperedDataset = {
    ...dataset,
    cases: dataset.cases.map((tutorEvalCase, index) =>
      index === 0
        ? {
            ...tutorEvalCase,
            evaluatorOnly: {
              ...tutorEvalCase.evaluatorOnly,
              rubrics: tutorEvalCase.evaluatorOnly.rubrics.map((rubric, rubricIndex) =>
                rubricIndex === 0
                  ? { ...rubric, evaluationType: "judge" as const }
                  : rubric,
              ),
            },
          }
        : tutorEvalCase,
    ),
  };

  assert.throws(
    () => selectQuickstartCases(tamperedDataset),
    (error: unknown) =>
      error instanceof QuickstartInvariantError &&
      /changed fingerprint|semantic Judge evaluation/.test(error.message),
  );
  assert.equal(firstCase.id, QUICKSTART_CASE_SELECTION[0]?.id);
});

test("Quickstart writes an independent summary artifact without a score", async () => {
  const outputDirectory = await mkdtemp(join(tmpdir(), "tutorbench-quickstart-"));
  const outputPath = join(outputDirectory, "quickstart.json");
  try {
    const summary = await runQuickstart();
    await writeQuickstartSummary(summary, outputPath);
    const artifact = JSON.parse(await readFile(outputPath, "utf8")) as Record<string, unknown>;
    assert.equal(artifact.mode, "quickstart-demo");
    assert.equal(artifact.officialBenchmarkScore, false);
    assert.equal(artifact.publicLeaderboardEligible, false);
    assert.equal(
      (artifact.dataset as { id: string; version: string }).id,
      QUICKSTART_DATASET_ID,
    );
    assert.equal(
      (artifact.dataset as { id: string; version: string }).version,
      QUICKSTART_DATASET_VERSION,
    );
    assert.equal(Object.hasOwn(artifact, "overallScore"), false);
  } finally {
    await rm(outputDirectory, { recursive: true, force: true });
  }
});

test("full benchmark remains canonical and fail-closed without a Judge", async () => {
  const dataset = await loadTutorEvalDataset(
    TUTOR_EVAL_DATASET_ID,
    TUTOR_EVAL_DATASET_VERSION,
  );
  const result = await runTutorEval({
    dataset,
    tutor: createGuidedTutor(),
    tutorDescriptor: {
      provider: "synthetic",
      model: "scripted-guided-tutor",
      modelVersion: "foundation",
      promptId: "synthetic-guided",
      promptVersion: "1.0.0",
      temperature: 0,
      seed: 0,
    },
    runId: "tutor-eval-v0.2a-synthetic-guided",
  });

  assert.equal(result.datasetId, TUTOR_EVAL_DATASET_ID);
  assert.equal(result.datasetVersion, TUTOR_EVAL_DATASET_VERSION);
  assert.equal(result.evaluatorVersion, TUTOR_EVAL_EVALUATOR_VERSION);
  assert.equal(result.caseCount, 48);
  assert.equal(result.caseRunCount, 48);
  assert.equal(result.errorCount, 48);
  assert.equal(result.overallScore, null);
  assert.equal(result.judge, null);
  assert.ok(result.caseResults.every((caseResult) => caseResult.rawJudgeResult === null));
  assert.ok(
    result.caseResults.some((caseResult) =>
      caseResult.diagnostics.some((diagnostic) => diagnostic.code === "judge_unavailable"),
    ),
  );
});
