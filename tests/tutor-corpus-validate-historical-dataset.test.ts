import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";

import {
  TUTOR_EVAL_DATASET_ID,
  TUTOR_EVAL_DATASET_VERSION,
  parseTutorResponseCorpus,
  type TutorEvalDataset,
  type TutorResponseCorpus,
} from "../src/contracts/index.js";
import { deriveTutorResponseId } from "../src/corpus/index.js";
import { loadTutorEvalDataset } from "../src/datasets/index.js";
import { resolveTutorResponseCorpusDatasetVersion } from "../src/datasets/corpus-version-resolution.js";

interface CliResult {
  readonly exitCode: number | null;
  readonly stdout: string;
  readonly stderr: string;
}

interface ValidationReport {
  readonly valid: boolean;
  readonly datasetId: string;
  readonly datasetVersion: string;
  readonly coverage: {
    readonly mode: string;
    readonly selectedCaseCount: number;
    readonly availableResponseCount: number;
    readonly missingCaseCount: number;
  };
  readonly issues: readonly { readonly code: string }[];
}

const syntheticTutor = {
  provider: "synthetic",
  model: "historical-corpus-validator-test",
  promptVersion: "test",
} as const;

function runValidatorCli(args: readonly string[]): Promise<CliResult> {
  const cliPath = resolve(process.cwd(), "dist", "src", "cli", "tutor-corpus-validate.js");
  return new Promise((resolveResult, reject) => {
    const child = spawn(process.execPath, [cliPath, ...args], {
      cwd: process.cwd(),
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer | string) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk: Buffer | string) => {
      stderr += chunk.toString();
    });
    child.once("error", reject);
    child.once("close", (exitCode) => {
      resolveResult({ exitCode, stdout, stderr });
    });
  });
}

function makeFullCorpus(
  dataset: TutorEvalDataset,
  corpusDatasetVersion = dataset.version,
): TutorResponseCorpus {
  const corpusId = `validator-resolution-${corpusDatasetVersion.replaceAll(".", "-")}`;
  const responses = dataset.cases.map((tutorEvalCase) => ({
    schemaVersion: 1 as const,
    responseId: deriveTutorResponseId({
      corpusId,
      corpusVersion: "test",
      datasetId: dataset.id,
      datasetVersion: corpusDatasetVersion,
      caseId: tutorEvalCase.id,
      caseVersion: tutorEvalCase.version,
      tutor: syntheticTutor,
      runIndex: 1,
    }),
    caseId: tutorEvalCase.id,
    caseVersion: tutorEvalCase.version,
    runIndex: 1,
    responseText: `Frozen synthetic response for ${tutorEvalCase.id}.`,
    provenance: "synthetic" as const,
  }));
  return parseTutorResponseCorpus({
    schemaVersion: 1,
    corpusId,
    corpusVersion: "test",
    datasetId: dataset.id,
    datasetVersion: corpusDatasetVersion,
    createdAt: "2026-08-18T00:00:00.000Z",
    coverage: "full",
    runsPerCase: 1,
    provenance: "synthetic",
    tutor: syntheticTutor,
    responses,
  });
}

async function writeCorpus(
  directory: string,
  corpus: TutorResponseCorpus,
  name: string,
): Promise<{ readonly corpusPath: string; readonly reportPath: string }> {
  const corpusPath = join(directory, `${name}.corpus.json`);
  const reportPath = join(directory, `${name}.report.json`);
  await writeFile(corpusPath, JSON.stringify(corpus), "utf8");
  return { corpusPath, reportPath };
}

async function validateCorpus(
  directory: string,
  corpus: TutorResponseCorpus,
  name: string,
): Promise<{ readonly result: CliResult; readonly report: ValidationReport }> {
  const paths = await writeCorpus(directory, corpus, name);
  const result = await runValidatorCli([
    "--corpus",
    paths.corpusPath,
    "--full",
    "--output",
    paths.reportPath,
  ]);
  const report = JSON.parse(await readFile(paths.reportPath, "utf8")) as ValidationReport;
  return { result, report };
}

test("tutor-corpus-validate binds a full historical .2a.3 corpus to its immutable snapshot", async () => {
  const directory = await mkdtemp(join(tmpdir(), "tutor-corpus-validate-"));
  try {
    const dataset = await loadTutorEvalDataset(TUTOR_EVAL_DATASET_ID, "0.2a.3");
    const corpus = makeFullCorpus(dataset);
    const languageCase = corpus.responses.find((response) => response.caseId === "language-word-context-001");
    const languageCaseZh = corpus.responses.find((response) => response.caseId === "language-word-context-001-zh-CN");
    assert.equal(languageCase?.caseVersion, "1.0.0");
    assert.equal(languageCaseZh?.caseVersion, "1.0.0");

    const { result, report } = await validateCorpus(directory, corpus, "historical-0.2a.3");
    assert.equal(result.exitCode, 0);
    assert.equal(result.stderr, "");
    assert.equal(report.valid, true);
    assert.equal(report.datasetId, TUTOR_EVAL_DATASET_ID);
    assert.equal(report.datasetVersion, "0.2a.3");
    assert.deepEqual(report.coverage, {
      mode: "full",
      selectedCaseCount: 48,
      availableResponseCount: 48,
      missingCaseCount: 0,
    });
    assert.deepEqual(report.issues, []);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("tutor-corpus-validate accepts historical .2a.2/.2a.4 and current .2a.5 full corpora", async () => {
  const directory = await mkdtemp(join(tmpdir(), "tutor-corpus-validate-"));
  try {
    for (const version of ["0.2a.2", "0.2a.4", TUTOR_EVAL_DATASET_VERSION] as const) {
      const dataset = await loadTutorEvalDataset(TUTOR_EVAL_DATASET_ID, version);
      const { result, report } = await validateCorpus(
        directory,
        makeFullCorpus(dataset),
        `dataset-${version}`,
      );
      assert.equal(result.exitCode, 0);
      assert.equal(report.valid, true);
      assert.equal(report.datasetVersion, version);
      assert.deepEqual(report.coverage, {
        mode: "full",
        selectedCaseCount: 48,
        availableResponseCount: 48,
        missingCaseCount: 0,
      });
      assert.deepEqual(report.issues, []);
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("tutor-corpus-validate fails closed for unsupported versions and preserves the legacy alias rule", async () => {
  assert.equal(
    resolveTutorResponseCorpusDatasetVersion(TUTOR_EVAL_DATASET_ID, "0.2a"),
    "0.2a.1",
  );
  assert.equal(
    resolveTutorResponseCorpusDatasetVersion(TUTOR_EVAL_DATASET_ID, "0.2a.3"),
    "0.2a.3",
  );

  const directory = await mkdtemp(join(tmpdir(), "tutor-corpus-validate-"));
  try {
    const historical = await loadTutorEvalDataset(TUTOR_EVAL_DATASET_ID, "0.2a.3");
    const corpus = makeFullCorpus(historical, "0.2a.999");
    const paths = await writeCorpus(directory, corpus, "unsupported");
    const result = await runValidatorCli([
      "--corpus",
      paths.corpusPath,
      "--full",
      "--output",
      paths.reportPath,
    ]);
    assert.equal(result.exitCode, 1);
    assert.match(result.stderr, /TutorEval dataset configuration is invalid\./);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
