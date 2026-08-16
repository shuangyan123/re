import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import {
  BenchmarkConfigurationError,
  TUTOR_EVAL_DATASET_ID,
  TUTOR_EVAL_DATASET_VERSION,
  TUTOR_EVAL_PREVIOUS_DATASET_VERSION,
  TUTOR_EVAL_EVALUATOR_VERSION,
  findTutorResponseCorpusValidationIssues,
  parseCalibrationCandidateResponseFile,
  parseTutorResponseCorpus,
  type TutorEvalDataset,
  type TutorResponseCorpus,
} from "../src/contracts/index.js";
import { loadTutorEvalDataset } from "../src/datasets/index.js";
import {
  deriveTutorResponseId,
  resolveTutorResponseCorpusReplay,
  toTutorResponseCorpusSemanticReplay,
} from "../src/corpus/index.js";
import {
  evaluateTutorResponseCorpus,
  type BenchmarkCorpusCliOptions,
} from "../src/cli/tutorbench-evaluate.js";
import {
  parseCriticalCalibrationPrepareCliOptions,
  prepareCriticalCalibrationCandidates,
} from "../src/cli/calibration-critical-prepare.js";
import { runTutorResponseCorpus } from "../src/runner/index.js";
import type { TutorEvalJudgeRunOptions } from "../src/runner/index.js";

const LANGUAGE_CASE_ID = "language-verb-check-001";
const FRACTION_CASE_ID = "fraction-misconception-001";
const LANGUAGE_TUTOR_VISIBLE_FINGERPRINT =
  "c5c84ce2894fcf10708e82c145d21f02d05cc5814dd4e98d3be73b4ec7efe81e";

function loadHistoricalDataset() {
  return loadTutorEvalDataset(
    TUTOR_EVAL_DATASET_ID,
    TUTOR_EVAL_PREVIOUS_DATASET_VERSION,
  );
}

function caseVersion(
  tutorEvalCase: TutorEvalDataset["cases"][number],
  source: boolean,
): string {
  return source && tutorEvalCase.id === LANGUAGE_CASE_ID
    ? "1.0.0"
    : tutorEvalCase.version;
}

function makeCorpus(
  dataset: TutorEvalDataset,
  source: boolean,
): TutorResponseCorpus {
  const selectedCases = dataset.cases.filter((tutorEvalCase) =>
    [LANGUAGE_CASE_ID, FRACTION_CASE_ID].includes(tutorEvalCase.id),
  );
  const tutor = {
    provider: "recorded_model",
    model: "synthetic-replay-tutor",
    modelVersion: "fixture-1",
    promptId: "synthetic-replay-prompt",
    promptVersion: "0.3",
    temperature: 0,
    seed: 0,
  } as const;
  const generationSpec = {
    schemaVersion: 1 as const,
    specId: "synthetic-replay-generation",
    specVersion: "1.0.0",
    prompt: {
      id: "synthetic-replay-prompt",
      version: "0.3",
      sha256: "0000000000000000000000000000000000000000000000000000000000000000",
    },
    maxOutputTokens: 128,
    temperature: 0,
    seed: 0,
  } as const;
  const corpusIdentity = {
    corpusId: "semantic-replay-fixture",
    corpusVersion: "1.0.0",
  } as const;
  const datasetVersion = source ? "0.2a" : dataset.version;
  const responses = selectedCases.map((tutorEvalCase) => {
    const sourceVersion = caseVersion(tutorEvalCase, source);
    return {
      schemaVersion: 1 as const,
      responseId: deriveTutorResponseId({
        ...corpusIdentity,
        datasetId: TUTOR_EVAL_DATASET_ID,
        datasetVersion,
        caseId: tutorEvalCase.id,
        caseVersion: sourceVersion,
        tutor,
        generationSpec,
        runIndex: 1,
      }),
      caseId: tutorEvalCase.id,
      caseVersion: sourceVersion,
      runIndex: 1,
      responseText: `Synthetic frozen response for ${tutorEvalCase.id}.`,
      provenance: "recorded_model" as const,
    };
  });
  return parseTutorResponseCorpus({
    schemaVersion: 1,
    ...corpusIdentity,
    datasetId: TUTOR_EVAL_DATASET_ID,
    datasetVersion,
    createdAt: "2026-08-15T00:00:00.000Z",
    coverage: "partial",
    runsPerCase: 1,
    provenance: "recorded_model",
    generationSpec,
    tutor,
    responses,
  });
}

function syntheticJudge(): TutorEvalJudgeRunOptions {
  return {
    provider: "synthetic",
    model: "synthetic-judge",
    promptId: "tutor-eval-pedagogy-judge-system",
    promptVersion: "0.3",
    evaluate: async (input) => ({
      schemaVersion: 1,
      caseId: input.caseId,
      rubricResults: input.rubrics.map((rubric) => ({
        rubricId: rubric.id,
        result: "PASS" as const,
        evidence: "Synthetic replay Judge evidence.",
      })),
      criticalFailures: [],
      factualErrors: [],
      insufficientInformation: false,
    }),
  };
}

function incompatibleError(error: unknown): boolean {
  return (
    error instanceof BenchmarkConfigurationError &&
    error.code === "tutor_response_replay_incompatible"
  );
}

async function writeCorpus(corpus: TutorResponseCorpus): Promise<{
  readonly directory: string;
  readonly path: string;
}> {
  const directory = await mkdtemp(join(tmpdir(), "tutor-response-replay-"));
  const path = join(directory, "corpus.json");
  await writeFile(path, JSON.stringify(corpus), "utf8");
  return { directory, path };
}

function cliOptions(
  corpusPath: string,
  allowCompatibleReplay: boolean,
  requireFull = false,
): BenchmarkCorpusCliOptions {
  return {
    corpusPath,
    requireFull,
    liveJudge: false,
    deepSeekJudge: false,
    allowCompatibleReplay,
    caseIds: [],
    limit: null,
    help: false,
  };
}

test("old corpus remains fail-closed without the explicit replay opt-in", async () => {
  const dataset = await loadTutorEvalDataset(TUTOR_EVAL_DATASET_ID);
  const corpus = makeCorpus(dataset, true);
  const files = await writeCorpus(corpus);
  try {
    await assert.rejects(
      () => evaluateTutorResponseCorpus(cliOptions(files.path, false)),
      (error: unknown) =>
        error instanceof BenchmarkConfigurationError &&
        error.code === "tutor_response_corpus_invalid",
    );
  } finally {
    await rm(files.directory, { recursive: true, force: true });
  }
});

test("the approved 0.2a to 0.2a.1 transition is machine-checked", async () => {
  const dataset = await loadHistoricalDataset();
  const corpus = makeCorpus(dataset, true);
  const plan = resolveTutorResponseCorpusReplay(corpus, dataset);
  assert.ok(plan);
  assert.equal(plan.sourceDataset.version, "0.2a");
  assert.equal(plan.targetDataset.version, "0.2a.1");
  assert.deepEqual(plan.caseVersionMappings.map((mapping) => ({
    caseId: mapping.caseId,
    sourceVersion: mapping.sourceVersion,
    targetVersion: mapping.targetVersion,
  })), [{
    caseId: LANGUAGE_CASE_ID,
    sourceVersion: "1.0.0",
    targetVersion: "1.0.1",
  }]);
  assert.equal(
    plan.caseVersionMappings[0]?.sourceTutorVisibleFingerprint,
    LANGUAGE_TUTOR_VISIBLE_FINGERPRINT,
  );
  assert.equal(
    plan.caseVersionMappings[0]?.targetTutorVisibleFingerprint,
    LANGUAGE_TUTOR_VISIBLE_FINGERPRINT,
  );
  assert.deepEqual(
    findTutorResponseCorpusValidationIssues({ corpus, dataset: plan.sourceDataset }),
    [],
  );
});

test("explicit replay evaluates target semantics and preserves source provenance", async () => {
  const dataset = await loadHistoricalDataset();
  const corpus = makeCorpus(dataset, true);
  const plan = resolveTutorResponseCorpusReplay(corpus, dataset);
  assert.ok(plan);
  const before = JSON.stringify(corpus);
  const result = await runTutorResponseCorpus({
    corpus,
    dataset,
    semanticReplay: plan,
    caseIds: [LANGUAGE_CASE_ID],
    limit: 1,
    judge: syntheticJudge(),
  });
  assert.equal(result.datasetId, TUTOR_EVAL_DATASET_ID);
  assert.equal(result.datasetVersion, TUTOR_EVAL_PREVIOUS_DATASET_VERSION);
  assert.equal(result.corpusId, corpus.corpusId);
  assert.equal(result.corpusVersion, corpus.corpusVersion);
  assert.deepEqual(result.semanticReplay, toTutorResponseCorpusSemanticReplay(plan));
  assert.equal(result.evaluation.evaluatorVersion, TUTOR_EVAL_EVALUATOR_VERSION);
  assert.equal(result.evaluation.judge?.promptVersion, "0.3");
  assert.equal(result.evaluation.errorCount, 0);
  assert.deepEqual(result.evaluationSelection?.selectedCaseIds, [LANGUAGE_CASE_ID]);
  assert.equal(result.evaluation.caseResults[0]?.caseVersion, "1.0.1");
  assert.equal(
    result.evaluation.caseResults[0]?.rawTutorResponse,
    "Synthetic frozen response for language-verb-check-001.",
  );
  assert.equal(JSON.stringify(corpus), before);
});

test("the source response identity is validated with source versions, never target versions", async () => {
  const dataset = await loadHistoricalDataset();
  const corpus = makeCorpus(dataset, true);
  const plan = resolveTutorResponseCorpusReplay(corpus, dataset);
  assert.ok(plan);
  const response = corpus.responses.find((candidate) => candidate.caseId === LANGUAGE_CASE_ID)!;
  const sourceCase = plan.sourceDataset.cases.find((candidate) => candidate.id === LANGUAGE_CASE_ID)!;
  const targetCase = dataset.cases.find((candidate) => candidate.id === LANGUAGE_CASE_ID)!;
  const generationSpec = corpus.generationSpec;
  assert.ok(generationSpec);
  const sourceId = deriveTutorResponseId({
    corpusId: corpus.corpusId,
    corpusVersion: corpus.corpusVersion,
    datasetId: corpus.datasetId,
    datasetVersion: corpus.datasetVersion,
    caseId: LANGUAGE_CASE_ID,
    caseVersion: sourceCase.version,
    tutor: corpus.tutor,
    generationSpec,
    runIndex: response.runIndex,
  });
  const targetId = deriveTutorResponseId({
    corpusId: corpus.corpusId,
    corpusVersion: corpus.corpusVersion,
    datasetId: dataset.id,
    datasetVersion: dataset.version,
    caseId: LANGUAGE_CASE_ID,
    caseVersion: targetCase.version,
    tutor: corpus.tutor,
    generationSpec,
    runIndex: response.runIndex,
  });
  assert.equal(response.responseId, sourceId);
  assert.notEqual(response.responseId, targetId);
  const targetIdentityCorpus = {
    ...corpus,
    responses: [{ ...response, responseId: targetId }],
  };
  const targetIdentityPlan = resolveTutorResponseCorpusReplay(targetIdentityCorpus, dataset);
  assert.ok(targetIdentityPlan);
  await assert.rejects(
    () => runTutorResponseCorpus({
      corpus: targetIdentityCorpus,
      dataset,
      semanticReplay: targetIdentityPlan,
    }),
    (error: unknown) =>
      error instanceof BenchmarkConfigurationError &&
      error.code === "tutor_response_corpus_invalid",
  );
});

test("unknown dataset transitions and unmapped case-version changes are rejected", async () => {
  const dataset = await loadHistoricalDataset();
  const corpus = makeCorpus(dataset, true);
  assert.throws(
    () => resolveTutorResponseCorpusReplay(corpus, { ...dataset, version: "0.2a.2" }),
    incompatibleError,
  );
  const changedTarget = {
    ...dataset,
    cases: dataset.cases.map((tutorEvalCase) =>
      tutorEvalCase.id === FRACTION_CASE_ID
        ? { ...tutorEvalCase, version: "9.9.9" }
        : tutorEvalCase,
    ),
  };
  assert.throws(
    () => resolveTutorResponseCorpusReplay(corpus, changedTarget),
    incompatibleError,
  );
});

test("visible-input drift rejects the approved mapping even when the version is known", async () => {
  const dataset = await loadHistoricalDataset();
  const corpus = makeCorpus(dataset, true);
  const driftedTarget = {
    ...dataset,
    cases: dataset.cases.map((tutorEvalCase) =>
      tutorEvalCase.id === LANGUAGE_CASE_ID
        ? {
            ...tutorEvalCase,
            tutorInput: {
              ...tutorEvalCase.tutorInput,
              studentMessage: "The changed visible task must reject replay.",
            },
          }
        : tutorEvalCase,
    ),
  };
  assert.throws(
    () => resolveTutorResponseCorpusReplay(corpus, driftedTarget),
    incompatibleError,
  );
});

test("evaluator-only metadata differences remain replay-compatible", async () => {
  const dataset = await loadHistoricalDataset();
  const corpus = makeCorpus(dataset, true);
  const plan = resolveTutorResponseCorpusReplay(corpus, dataset);
  assert.ok(plan);
  const targetCase = dataset.cases.find((candidate) => candidate.id === LANGUAGE_CASE_ID)!;
  const sourceCase = plan.sourceDataset.cases.find((candidate) => candidate.id === LANGUAGE_CASE_ID)!;
  assert.deepEqual(
    sourceCase.tutorInput,
    targetCase.tutorInput,
  );
  assert.notEqual(sourceCase.version, targetCase.version);
  assert.equal(
    sourceCase.evaluatorOnly.rubrics.find((rubric) => rubric.id === "language-verb-diagnosis-001")
      ?.criticalFailure,
    undefined,
  );
});

test("normal current-identity evaluation does not emit semanticReplay provenance", async () => {
  const dataset = await loadTutorEvalDataset(TUTOR_EVAL_DATASET_ID);
  const corpus = makeCorpus(dataset, false);
  assert.equal(resolveTutorResponseCorpusReplay(corpus, dataset), undefined);
  const result = await runTutorResponseCorpus({
    corpus,
    dataset,
    judge: syntheticJudge(),
  });
  assert.equal(result.semanticReplay, undefined);
});

test("replay preserves full-coverage requirements and Judge error semantics", async () => {
  const dataset = await loadHistoricalDataset();
  const corpus = makeCorpus(dataset, true);
  const plan = resolveTutorResponseCorpusReplay(corpus, dataset);
  assert.ok(plan);
  await assert.rejects(
    () => runTutorResponseCorpus({ corpus, dataset, semanticReplay: plan, requireFull: true }),
    (error: unknown) =>
      error instanceof BenchmarkConfigurationError &&
      error.code === "tutor_response_corpus_invalid",
  );
  const result = await runTutorResponseCorpus({
    corpus,
    dataset,
    semanticReplay: plan,
    judge: {
      ...syntheticJudge(),
      evaluate: async () => {
        throw new Error("synthetic judge failure");
      },
    },
  });
  assert.equal(result.semanticReplay?.targetDatasetVersion, "0.2a.1");
  assert.equal(result.evaluation.errorCount, 2);
  assert.equal(result.evaluation.caseResults.every((caseResult) => caseResult.status === "error"), true);
});

test("CLI replay opt-in evaluates a temporary frozen corpus without any provider call", async () => {
  const dataset = await loadTutorEvalDataset(TUTOR_EVAL_DATASET_ID);
  const corpus = makeCorpus(dataset, true);
  const files = await writeCorpus(corpus);
  try {
    const result = await evaluateTutorResponseCorpus(cliOptions(files.path, true));
    assert.equal(result.semanticReplay?.sourceDatasetVersion, "0.2a");
    assert.equal(result.semanticReplay?.targetDatasetVersion, "0.2a.1");
    assert.equal(result.evaluation.judge, null);
    assert.equal(result.evaluation.datasetVersion, "0.2a.1");
  } finally {
    await rm(files.directory, { recursive: true, force: true });
  }
});

test("critical preparation keeps current identity and emits no review artifacts", async () => {
  const dataset = await loadTutorEvalDataset(TUTOR_EVAL_DATASET_ID);
  const corpus = makeCorpus(dataset, false);
  const files = await writeCorpus(corpus);
  const outputPath = join(files.directory, "critical-candidates.json");
  try {
    const options = parseCriticalCalibrationPrepareCliOptions([
      "--corpus",
      files.path,
      "--output",
      outputPath,
    ]);
    const result = await prepareCriticalCalibrationCandidates(options);
    const candidates = parseCalibrationCandidateResponseFile(
      JSON.parse(await readFile(outputPath, "utf8")) as unknown,
    );
    const preparedResponse = candidates.responses.find(
      (response) => response.responseId === corpus.responses[0]?.responseId,
    );
    assert.equal(result.semanticReplay, undefined);
    assert.equal(candidates.datasetVersion, TUTOR_EVAL_DATASET_VERSION);
    assert.ok(preparedResponse);
    assert.equal(preparedResponse.sourceCorpus?.corpusId, corpus.corpusId);
    assert.equal(preparedResponse.semanticReplay, undefined);
    assert.equal("targets" in candidates, false);
    assert.equal("annotations" in candidates, false);
  } finally {
    await rm(files.directory, { recursive: true, force: true });
  }
});

test("critical preparation requires explicit replay opt-in for historical corpora", async () => {
  const dataset = await loadTutorEvalDataset(TUTOR_EVAL_DATASET_ID);
  const corpus = makeCorpus(dataset, true);
  const files = await writeCorpus(corpus);
  try {
    const options = parseCriticalCalibrationPrepareCliOptions([
      "--corpus",
      files.path,
      "--output",
      join(files.directory, "critical-candidates.json"),
    ]);
    await assert.rejects(
      () => prepareCriticalCalibrationCandidates(options),
      (error: unknown) =>
        error instanceof BenchmarkConfigurationError &&
        error.code === "tutor_response_corpus_invalid",
    );
  } finally {
    await rm(files.directory, { recursive: true, force: true });
  }
});

test("critical preparation records approved replay while preserving source response identity", async () => {
  const dataset = await loadHistoricalDataset();
  const corpus = makeCorpus(dataset, true);
  const files = await writeCorpus(corpus);
  const outputPath = join(files.directory, "critical-candidates.json");
  try {
    const options = parseCriticalCalibrationPrepareCliOptions([
      "--corpus",
      files.path,
      "--output",
      outputPath,
      "--allow-compatible-replay",
    ]);
    const result = await prepareCriticalCalibrationCandidates(options);
    const candidates = parseCalibrationCandidateResponseFile(
      JSON.parse(await readFile(outputPath, "utf8")) as unknown,
    );
    const languageResponse = corpus.responses.find(
      (response) => response.caseId === LANGUAGE_CASE_ID,
    )!;
    const preparedLanguageResponse = candidates.responses.find(
      (response) => response.caseId === LANGUAGE_CASE_ID,
    )!;
    assert.equal(result.semanticReplay?.sourceDatasetVersion, "0.2a");
    assert.equal(
      result.semanticReplay?.targetDatasetVersion,
      TUTOR_EVAL_PREVIOUS_DATASET_VERSION,
    );
    assert.equal(preparedLanguageResponse.responseId, languageResponse.responseId);
    assert.equal(preparedLanguageResponse.caseVersion, "1.0.1");
    assert.equal(preparedLanguageResponse.sourceRun?.runId, corpus.corpusId);
    assert.equal(preparedLanguageResponse.semanticReplay?.sourceDatasetVersion, "0.2a");
    assert.equal(preparedLanguageResponse.semanticReplay?.targetDatasetVersion, "0.2a.1");
  } finally {
    await rm(files.directory, { recursive: true, force: true });
  }
});

test("critical preparation rejects invalid replay and corrupted source response identity", async () => {
  const dataset = await loadTutorEvalDataset(TUTOR_EVAL_DATASET_ID);
  const historicalCorpus = makeCorpus(dataset, true);
  const invalidReplayCorpus = parseTutorResponseCorpus({
    ...historicalCorpus,
    responses: historicalCorpus.responses.map((response) =>
      response.caseId === LANGUAGE_CASE_ID
        ? { ...response, caseVersion: "9.9.9" }
        : response,
    ),
  });
  const invalidReplayFiles = await writeCorpus(invalidReplayCorpus);
  const currentCorpus = makeCorpus(dataset, false);
  const corruptedCurrentCorpus = parseTutorResponseCorpus({
    ...currentCorpus,
    responses: currentCorpus.responses.map((response, index) =>
      index === 0 ? { ...response, responseId: "corrupted-source-response-id" } : response,
    ),
  });
  const corruptedFiles = await writeCorpus(corruptedCurrentCorpus);
  try {
    await assert.rejects(
      () =>
        prepareCriticalCalibrationCandidates(
          parseCriticalCalibrationPrepareCliOptions([
            "--corpus",
            invalidReplayFiles.path,
            "--output",
            join(invalidReplayFiles.directory, "critical-candidates.json"),
            "--allow-compatible-replay",
          ]),
        ),
      (error: unknown) =>
        error instanceof BenchmarkConfigurationError &&
        error.code === "tutor_response_replay_incompatible",
    );
    await assert.rejects(
      () =>
        prepareCriticalCalibrationCandidates(
          parseCriticalCalibrationPrepareCliOptions([
            "--corpus",
            corruptedFiles.path,
            "--output",
            join(corruptedFiles.directory, "critical-candidates.json"),
          ]),
        ),
      (error: unknown) =>
        error instanceof BenchmarkConfigurationError &&
        error.code === "tutor_response_corpus_invalid",
    );
  } finally {
    await rm(invalidReplayFiles.directory, { recursive: true, force: true });
    await rm(corruptedFiles.directory, { recursive: true, force: true });
  }
});

test("current-identity artifacts without the optional field remain readable in practice", async () => {
  const dataset = await loadTutorEvalDataset(TUTOR_EVAL_DATASET_ID);
  const corpus = makeCorpus(dataset, false);
  const result = await runTutorResponseCorpus({ corpus, dataset });
  const legacyArtifact = JSON.parse(JSON.stringify({
    ...result,
    semanticReplay: undefined,
  })) as { readonly semanticReplay?: unknown };
  assert.equal("semanticReplay" in legacyArtifact, false);
  assert.equal(legacyArtifact.semanticReplay, undefined);
});
