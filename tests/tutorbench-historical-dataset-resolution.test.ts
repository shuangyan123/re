import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import {
  BenchmarkConfigurationError,
  TUTOR_EVAL_DATASET_ID,
  parseTutorResponseCorpus,
  type TutorEvalDataset,
  type TutorResponseCorpus,
} from "../src/contracts/index.js";
import { deriveTutorResponseId } from "../src/corpus/index.js";
import { loadTutorEvalDataset } from "../src/datasets/index.js";
import {
  evaluateTutorResponseCorpus,
  type BenchmarkCorpusCliOptions,
} from "../src/cli/tutorbench-evaluate.js";

const syntheticTutor = {
  provider: "synthetic",
  model: "historical-dataset-resolution-test",
  promptVersion: "test",
} as const;

function makeCorpus(
  dataset: TutorEvalDataset,
  caseId: string,
  datasetVersion = dataset.version,
): TutorResponseCorpus {
  const tutorEvalCase = dataset.cases.find((caseValue) => caseValue.id === caseId);
  assert.ok(tutorEvalCase, `Expected historical case ${caseId} to exist.`);
  const corpusId = `historical-resolution-${datasetVersion.replaceAll(".", "-")}`;
  const responseId = deriveTutorResponseId({
    corpusId,
    corpusVersion: "test",
    datasetId: dataset.id,
    datasetVersion,
    caseId: tutorEvalCase.id,
    caseVersion: tutorEvalCase.version,
    tutor: syntheticTutor,
    runIndex: 1,
  });
  return parseTutorResponseCorpus({
    schemaVersion: 1,
    corpusId,
    corpusVersion: "test",
    datasetId: dataset.id,
    datasetVersion,
    createdAt: "2026-08-18T00:00:00.000Z",
    coverage: "partial",
    runsPerCase: 1,
    provenance: "synthetic",
    tutor: syntheticTutor,
    responses: [{
      schemaVersion: 1,
      responseId,
      caseId: tutorEvalCase.id,
      caseVersion: tutorEvalCase.version,
      runIndex: 1,
      responseText: `Frozen synthetic response for ${tutorEvalCase.id}.`,
      provenance: "synthetic",
    }],
  });
}

function evaluateOptions(corpusPath: string, caseId: string): BenchmarkCorpusCliOptions {
  return {
    corpusPath,
    requireFull: false,
    liveJudge: false,
    deepSeekJudge: false,
    chatCompletionsJudge: false,
    allowCompatibleReplay: false,
    caseIds: [caseId],
    limit: null,
    help: false,
  };
}

async function writeCorpus(directory: string, corpus: TutorResponseCorpus): Promise<string> {
  const path = join(directory, `${corpus.datasetVersion}.json`);
  await writeFile(path, JSON.stringify(corpus), "utf8");
  return path;
}

test("evaluate loads historical .2a.3 and .2a.2 corpus snapshots by recorded version", async () => {
  const directory = await mkdtemp(join(tmpdir(), "tutorbench-dataset-resolution-"));
  try {
    const historicalCases = [
      {
        version: "0.2a.3",
        caseId: "language-word-context-001",
        expectedCaseVersion: "1.0.0",
      },
      {
        version: "0.2a.2",
        caseId: "fraction-misconception-001",
        expectedCaseVersion: undefined,
      },
    ] as const;

    for (const historicalCase of historicalCases) {
      const dataset = await loadTutorEvalDataset(TUTOR_EVAL_DATASET_ID, historicalCase.version);
      const corpus = makeCorpus(dataset, historicalCase.caseId);
      const result = await evaluateTutorResponseCorpus(
        evaluateOptions(await writeCorpus(directory, corpus), historicalCase.caseId),
      );

      assert.equal(result.datasetId, TUTOR_EVAL_DATASET_ID);
      assert.equal(result.datasetVersion, historicalCase.version);
      assert.equal(result.evaluation.datasetVersion, historicalCase.version);
      assert.equal(result.evaluation.judge, null);
      const caseResult = result.evaluation.caseResults[0];
      assert.equal(caseResult?.caseId, historicalCase.caseId);
      if (historicalCase.expectedCaseVersion !== undefined) {
        assert.equal(caseResult?.caseVersion, historicalCase.expectedCaseVersion);
      }
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("evaluate rejects an unsupported formal dataset version instead of falling back to current", async () => {
  const directory = await mkdtemp(join(tmpdir(), "tutorbench-dataset-resolution-"));
  try {
    const historical = await loadTutorEvalDataset(TUTOR_EVAL_DATASET_ID, "0.2a.3");
    const corpus = makeCorpus(historical, "language-word-context-001", "0.2a.999");
    const corpusPath = await writeCorpus(directory, corpus);

    await assert.rejects(
      () => evaluateTutorResponseCorpus(
        evaluateOptions(corpusPath, "language-word-context-001"),
      ),
      (error: unknown) =>
        error instanceof BenchmarkConfigurationError &&
        error.code === "tutor_eval_dataset_invalid",
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
