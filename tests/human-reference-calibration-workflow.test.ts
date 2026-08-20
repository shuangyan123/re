import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";

import {
  buildHumanReferenceCalibrationReport,
  buildHumanReferenceSet,
  loadHumanReferenceAdjudicationFile,
  loadHumanReferenceAnnotationFile,
  loadHumanReferenceSet,
  writeHumanReferenceJson,
} from "../src/calibration/index.js";
import {
  assertHumanReferenceSetReady,
} from "../src/calibration/human-reference-reference.js";
import { parseTutorbenchArgs } from "../src/cli/tutorbench.js";
import { BenchmarkConfigurationError } from "../src/contracts/errors.js";
import type {
  HumanReferenceAnnotationFile,
} from "../src/contracts/human-reference-calibration.js";

const annotationsPath = resolve(
  process.cwd(),
  "fixtures",
  "human-reference-calibration",
  "synthetic-annotations.json",
);
const adjudicationsPath = resolve(
  process.cwd(),
  "fixtures",
  "human-reference-calibration",
  "synthetic-adjudications.json",
);

function cloneJson(value: unknown): Record<string, unknown> {
  return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
}

function record(value: unknown): Record<string, unknown> {
  assert.equal(typeof value, "object");
  assert.notEqual(value, null);
  assert.equal(Array.isArray(value), false);
  return value as Record<string, unknown>;
}

function array(value: unknown): unknown[] {
  assert.equal(Array.isArray(value), true);
  return value as unknown[];
}

async function expectInvalidSet(
  directory: string,
  name: string,
  value: unknown,
): Promise<void> {
  const path = join(directory, `${name}.json`);
  await writeFile(path, `${JSON.stringify(value)}\n`, "utf8");
  await assert.rejects(
    () => loadHumanReferenceSet(path),
    (error: unknown) =>
      error instanceof BenchmarkConfigurationError &&
      error.code === "human_reference_calibration_invalid",
  );
}

test("human-reference calibration ingests real fixture bytes and reports provenance, agreement, and coverage", async () => {
  const annotationFile = await loadHumanReferenceAnnotationFile(annotationsPath);
  const adjudicationFile = await loadHumanReferenceAdjudicationFile(adjudicationsPath);
  const report = buildHumanReferenceCalibrationReport(annotationFile, adjudicationFile);

  assert.equal(report.dataKind, "synthetic-fixture");
  assert.equal(report.humanReferenceDataPresent, false);
  assert.deepEqual(report.referenceCoverage, {
    plannedAtomicAssessments: 3,
    resolvedAtomicAssessments: 2,
    unresolvedAtomicAssessments: 0,
    missingAtomicAssessments: 1,
    referenceCoverageShare: 2 / 3,
  });
  assert.equal(report.humanHumanAgreement.comparableAtomicCount, 2);
  assert.equal(report.humanHumanAgreement.agreementCount, 1);
  assert.equal(report.humanHumanAgreement.disagreementCount, 1);
  assert.equal(report.resolvedReferences.length, 2);
  assert.equal(report.unresolvedDisagreements.length, 0);
  assert.equal(report.missingAnnotations.length, 1);
  assert.deepEqual(
    report.derivedReferenceLabels.map((label) => label.label),
    ["PASS", "FAIL"],
  );

  const directory = await mkdtemp(join(tmpdir(), "tutorbench-human-reference-"));
  try {
    const outputPath = join(directory, "report.json");
    await writeHumanReferenceJson(report, outputPath);
    const persisted = JSON.parse(await readFile(outputPath, "utf8")) as Record<string, unknown>;
    assert.equal(persisted.humanReferenceDataPresent, false);
    assert.equal("accuracy" in persisted, false);
    assert.equal("calibratedScore" in persisted, false);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("human-reference CLI parses options and executes without a provider", async () => {
  const outputPath = resolve(process.cwd(), "artifacts", "workflow-test-report.json");
  const parsed = parseTutorbenchArgs([
    "human-reference-calibration",
    `--annotations=${annotationsPath}`,
    `--adjudications=${adjudicationsPath}`,
    `--output=${outputPath}`,
  ]);
  assert.equal(parsed.help, false);
  if (
    parsed.help ||
    !("humanReferenceCalibration" in parsed) ||
    parsed.humanReferenceCalibration.help
  ) {
    return;
  }
  assert.equal(parsed.humanReferenceCalibration.annotationPath, annotationsPath);
  assert.equal(parsed.humanReferenceCalibration.adjudicationPath, adjudicationsPath);
  assert.equal(parsed.humanReferenceCalibration.outputPath, outputPath);

  const cliPath = resolve(process.cwd(), "dist", "src", "cli", "tutorbench.js");
  const result = await new Promise<{ readonly exitCode: number | null; readonly stdout: string; readonly stderr: string }>(
    (resolveResult, reject) => {
      const child = spawn(process.execPath, [
        cliPath,
        "human-reference-calibration",
        "--annotations",
        annotationsPath,
        "--adjudications",
        adjudicationsPath,
        "--output",
        outputPath,
      ], { cwd: process.cwd(), stdio: ["ignore", "pipe", "pipe"] });
      let stdout = "";
      let stderr = "";
      child.stdout.on("data", (chunk: Buffer | string) => { stdout += chunk.toString(); });
      child.stderr.on("data", (chunk: Buffer | string) => { stderr += chunk.toString(); });
      child.once("error", reject);
      child.once("close", (exitCode) => resolveResult({ exitCode, stdout, stderr }));
    },
  );
  assert.equal(result.exitCode, 0, result.stderr);
  assert.match(result.stdout, /Human-reference calibration report/);
  assert.doesNotMatch(result.stdout, /API key|provider call|Judge execution/i);
  const report = JSON.parse(await readFile(outputPath, "utf8")) as Record<string, unknown>;
  assert.equal(report.humanReferenceDataPresent, false);
});

test("strict persisted HumanReferenceSet rejects forged coverage, ownership, provenance, and hidden fields", async () => {
  const annotationFile = await loadHumanReferenceAnnotationFile(annotationsPath);
  const adjudicationFile = await loadHumanReferenceAdjudicationFile(adjudicationsPath);
  const referenceSet = buildHumanReferenceSet({
    tasks: annotationFile.tasks,
    annotations: annotationFile.annotations,
    requiredAnnotatorIds: annotationFile.requiredAnnotatorIds,
    adjudications: adjudicationFile.adjudications,
    dataKind: "synthetic-fixture",
    ...(annotationFile.fixture === undefined ? {} : { fixture: annotationFile.fixture }),
  });
  const directory = await mkdtemp(join(tmpdir(), "tutorbench-human-reference-tamper-"));
  try {
    const tamperCases: ReadonlyArray<readonly [string, (value: Record<string, unknown>) => void]> = [
      ["forged-coverage", (value) => {
        const coverage = record(value.coverage);
        coverage.resolvedAtomicAssessments = 3;
      }],
      ["duplicate-reference", (value) => {
        const references = array(value.references);
        references.push(cloneJson(references[0]));
      }],
      ["nonexistent-requirement", (value) => {
        const reference = record(array(value.references)[0]);
        reference.requirementId = "requirement-does-not-exist";
      }],
      ["wrong-rubric-owner", (value) => {
        const reference = record(array(value.references)[0]);
        reference.rubricId = "rubric-ratio";
      }],
      ["reference-and-missing-overlap", (value) => {
        const reference = record(array(value.references)[0]);
        array(value.missingAnnotations).push({
          caseId: reference.caseId,
          rubricId: reference.rubricId,
          requirementId: reference.requirementId,
          missingAnnotatorIds: ["annotator-b"],
          presentAnnotatorIds: ["annotator-a"],
        });
      }],
      ["synthetic-pretends-human-reference", (value) => {
        value.dataKind = "human-reference";
      }],
      ["developer-expected-provenance", (value) => {
        record(array(value.references)[0]).provenance = "developer_expected";
      }],
      ["invalid-status", (value) => {
        record(array(value.references)[0]).status = "PASS";
      }],
      ["reference-extra-field", (value) => {
        record(array(value.references)[0]).rawProviderPayload = {};
      }],
      ["task-expected-status", (value) => {
        record(array(value.tasks)[0]).expectedStatus = "SATISFIED";
      }],
      ["task-raw-provider-payload", (value) => {
        record(array(value.tasks)[0]).rawProviderPayload = {};
      }],
      ["task-reasoning", (value) => {
        record(array(value.tasks)[0]).reasoning = "hidden";
      }],
      ["malformed-protocol", (value) => {
        value.calibrationProtocolVersion = "9.9.9";
      }],
      ["forged-availability", (value) => {
        value.humanCalibrationAvailable = true;
      }],
    ];
    for (const [name, tamper] of tamperCases) {
      const tampered = cloneJson(referenceSet);
      tamper(tampered);
      await expectInvalidSet(directory, name, tampered);
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("a valid incomplete reference set is parseable but has no unresolved reference label", async () => {
  const annotationFile: HumanReferenceAnnotationFile =
    await loadHumanReferenceAnnotationFile(annotationsPath);
  const incomplete = buildHumanReferenceSet({
    tasks: annotationFile.tasks,
    annotations: annotationFile.annotations,
    requiredAnnotatorIds: annotationFile.requiredAnnotatorIds,
    dataKind: "synthetic-fixture",
    ...(annotationFile.fixture === undefined ? {} : { fixture: annotationFile.fixture }),
  });
  assert.equal(incomplete.coverage.resolvedAtomicAssessments, 1);
  assert.equal(incomplete.coverage.unresolvedAtomicAssessments, 1);
  assert.equal(incomplete.coverage.missingAtomicAssessments, 1);
  assert.equal(incomplete.humanCalibrationAvailable, false);
  assert.doesNotThrow(() => assertHumanReferenceSetReady(incomplete));
  assert.equal(
    incomplete.references.some((reference) => reference.caseId === "case-disagreement"),
    false,
  );
});
