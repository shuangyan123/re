import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { test } from "node:test";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import {
  buildHumanReferenceCalibrationReport,
  buildHumanReferenceSet,
  createHumanReferencePilotExport,
  mergeHumanReferencePilotSubmissions,
} from "../src/calibration/index.js";
import {
  parseHumanReferencePilotPacket,
  parseHumanReferencePilotSubmission,
} from "../src/contracts/index.js";
import { BenchmarkConfigurationError } from "../src/contracts/errors.js";
import type {
  HumanReferencePilotPacket,
  HumanReferencePilotSubmission,
} from "../src/contracts/human-reference-pilot.js";
import { parseTutorbenchArgs } from "../src/cli/tutorbench.js";

const syntheticFixture = {
  synthetic: true as const,
  notHumanCalibrationData: true as const,
};

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function invalid(action: () => unknown): void {
  assert.throws(
    action,
    (error: unknown) =>
      error instanceof BenchmarkConfigurationError &&
      error.code === "human_reference_calibration_invalid",
  );
}

function submissionFor(
  packet: HumanReferencePilotPacket,
  disagreementKey?: string,
): HumanReferencePilotSubmission {
  const annotations = packet.tasks.flatMap((task) =>
    task.rubrics.flatMap((rubric) =>
      rubric.requirements.map((requirement) => {
        const key = JSON.stringify([task.caseId, rubric.id, requirement.id]);
        return {
          caseId: task.caseId,
          rubricId: rubric.id,
          requirementId: requirement.id,
          status: key === disagreementKey
            ? "OMITTED_OR_INCOMPLETE" as const
            : "SATISFIED" as const,
          evidence: `${packet.annotatorId} observed the visible Tutor response for ${requirement.id}.`,
        };
      }),
    ),
  );
  return {
    schemaVersion: 1,
    packetKind: "annotator-submission",
    pilotProtocolId: packet.pilotProtocolId,
    pilotProtocolVersion: packet.pilotProtocolVersion,
    pilotId: packet.pilotId,
    batchId: packet.batchId,
    calibrationProtocolId: packet.calibrationProtocolId,
    calibrationProtocolVersion: packet.calibrationProtocolVersion,
    taskSetFingerprint: packet.taskSetFingerprint,
    annotatorId: packet.annotatorId,
    dataKind: "synthetic-fixture",
    fixture: syntheticFixture,
    annotations,
  };
}

function makePilot() {
  return createHumanReferencePilotExport(["annotator-a", "annotator-b"]);
}

async function runCli(
  cliPath: string,
  args: readonly string[],
): Promise<{ readonly exitCode: number | null; readonly stdout: string; readonly stderr: string }> {
  return new Promise((resolveResult, reject) => {
    const child = spawn(process.execPath, [cliPath, ...args], {
      cwd: process.cwd(),
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer | string) => { stdout += chunk.toString(); });
    child.stderr.on("data", (chunk: Buffer | string) => { stderr += chunk.toString(); });
    child.once("error", reject);
    child.once("close", (exitCode) => resolveResult({ exitCode, stdout, stderr }));
  });
}

test("word-context export creates deterministic, identical blind evidence packets", async () => {
  const first = await makePilot();
  const second = await makePilot();
  assert.deepEqual(first, second);
  assert.equal(first.packets.length, 2);
  assert.equal(first.tasks.length, 3);
  assert.equal(
    first.tasks.reduce(
      (count, task) => count + task.rubrics.reduce(
        (rubricCount, rubric) => rubricCount + rubric.requirements.length,
        0,
      ),
      0,
    ),
    12,
  );
  assert.deepEqual(first.packets[0]?.tasks, first.packets[1]?.tasks);
  assert.notEqual(first.packets[0]?.annotatorId, first.packets[1]?.annotatorId);
  assert.equal(first.packets[0]?.taskSetFingerprint, first.packets[1]?.taskSetFingerprint);

  const packetAJson = JSON.stringify(first.packets[0]);
  assert.doesNotMatch(packetAJson, /"expected(?:Status|Label|Result)"/u);
  assert.doesNotMatch(packetAJson, /"(?:judgeResult|judgeEvidence|reasoning|adjudication|provider|model)"/u);
  assert.doesNotMatch(packetAJson, /\b(?:PASS|PARTIAL|FAIL)\b/u);
  assert.doesNotMatch(packetAJson, /annotator-b/u);
  assert.match(packetAJson, /"tutorResponse"/u);
  assert.match(packetAJson, /"groundTruth"/u);
  assert.deepEqual(first.packets[0]?.source.fixture, syntheticFixture);
});

test("pilot submission parser accepts only the editable atomic shape", async () => {
  const pilot = await makePilot();
  const valid = submissionFor(pilot.packets[0] as HumanReferencePilotPacket);
  assert.doesNotThrow(() => parseHumanReferencePilotSubmission(valid));

  const unknownStatus = cloneJson(valid) as unknown as Record<string, unknown>;
  const unknownAnnotations = unknownStatus.annotations as Record<string, unknown>[];
  unknownAnnotations[0]!.status = "UNKNOWN";
  invalid(() => parseHumanReferencePilotSubmission(unknownStatus));

  const extraField = cloneJson(valid) as unknown as Record<string, unknown>;
  (extraField.annotations as Record<string, unknown>[])[0]!.reasoning = "hidden";
  invalid(() => parseHumanReferencePilotSubmission(extraField));

  const oversizedEvidence = cloneJson(valid) as unknown as Record<string, unknown>;
  (oversizedEvidence.annotations as Record<string, unknown>[])[0]!.evidence = "x".repeat(501);
  invalid(() => parseHumanReferencePilotSubmission(oversizedEvidence));
});

test("pilot import fail-closes on incomplete, duplicate, unexpected, identity, and ownership changes", async () => {
  const pilot = await makePilot();
  const packetA = pilot.packets[0] as HumanReferencePilotPacket;
  const packetB = pilot.packets[1] as HumanReferencePilotPacket;
  const submissionA = submissionFor(packetA);
  const submissionB = submissionFor(packetB);
  const firstAnnotation = submissionA.annotations[0]!;

  const missing = cloneJson(submissionA) as unknown as Record<string, unknown>;
  missing.annotations = (missing.annotations as unknown[]).slice(1);
  invalid(() => mergeHumanReferencePilotSubmissions(
    pilot.packets,
    [missing, submissionB],
    pilot.tasks,
  ));

  const duplicate = cloneJson(submissionA) as unknown as Record<string, unknown>;
  duplicate.annotations = [
    ...(duplicate.annotations as unknown[]),
    cloneJson(firstAnnotation),
  ];
  invalid(() => mergeHumanReferencePilotSubmissions(
    pilot.packets,
    [duplicate, submissionB],
    pilot.tasks,
  ));

  const unexpected = cloneJson(submissionA) as unknown as Record<string, unknown>;
  unexpected.annotations = [
    ...(unexpected.annotations as unknown[]),
    {
      caseId: packetA.tasks[0]!.caseId,
      rubricId: packetA.tasks[0]!.rubrics[0]!.id,
      requirementId: "unexpected-requirement",
      status: "SATISFIED",
    },
  ];
  invalid(() => mergeHumanReferencePilotSubmissions(
    pilot.packets,
    [unexpected, submissionB],
    pilot.tasks,
  ));

  const wrongOwner = cloneJson(submissionA) as unknown as Record<string, unknown>;
  (wrongOwner.annotations as Record<string, unknown>[])[0]!.rubricId = "wrong-rubric-owner";
  invalid(() => mergeHumanReferencePilotSubmissions(
    pilot.packets,
    [wrongOwner, submissionB],
    pilot.tasks,
  ));

  const wrongAnnotator = cloneJson(submissionA) as unknown as Record<string, unknown>;
  wrongAnnotator.annotatorId = "annotator-c";
  invalid(() => mergeHumanReferencePilotSubmissions(
    pilot.packets,
    [wrongAnnotator, submissionB],
    pilot.tasks,
  ));

  const wrongPilot = cloneJson(submissionA) as unknown as Record<string, unknown>;
  wrongPilot.pilotId = "another-pilot";
  invalid(() => mergeHumanReferencePilotSubmissions(
    pilot.packets,
    [wrongPilot, submissionB],
    pilot.tasks,
  ));

  const wrongFingerprint = cloneJson(submissionA) as unknown as Record<string, unknown>;
  wrongFingerprint.taskSetFingerprint = `sha256:${"f".repeat(64)}`;
  invalid(() => mergeHumanReferencePilotSubmissions(
    pilot.packets,
    [wrongFingerprint, submissionB],
    pilot.tasks,
  ));

  const changedTasks = cloneJson(pilot.packets) as unknown as Record<string, unknown>[];
  ((changedTasks[0]!.tasks as Record<string, unknown>[])[0]!.tutorResponse) =
    "Changed stale packet evidence.";
  invalid(() => mergeHumanReferencePilotSubmissions(
    changedTasks,
    [submissionA, submissionB],
    pilot.tasks,
  ));
});

test("pilot import emits canonical annotations without adjudicating disagreement", async () => {
  const pilot = await makePilot();
  const packetA = pilot.packets[0] as HumanReferencePilotPacket;
  const packetB = pilot.packets[1] as HumanReferencePilotPacket;
  const disagreementKey = JSON.stringify([
    packetA.tasks[0]!.caseId,
    packetA.tasks[0]!.rubrics[0]!.id,
    packetA.tasks[0]!.rubrics[0]!.requirements[0]!.id,
  ]);
  const submissionA = submissionFor(packetA);
  const submissionB = submissionFor(packetB, disagreementKey);
  const canonical = mergeHumanReferencePilotSubmissions(
    pilot.packets,
    [submissionA, submissionB],
    pilot.tasks,
  );

  assert.equal(canonical.dataKind, "synthetic-fixture");
  assert.deepEqual(canonical.fixture, syntheticFixture);
  assert.equal(canonical.requiredAnnotatorIds.length, 2);
  assert.equal(canonical.annotations.length, 24);
  assert.deepEqual(
    new Set(canonical.annotations.map((annotation) => annotation.annotatorId)),
    new Set(["annotator-a", "annotator-b"]),
  );
  assert.doesNotMatch(JSON.stringify(canonical), /expectedStatus|judgeEvidence|reasoning/u);

  const referenceSet = buildHumanReferenceSet({
    tasks: canonical.tasks,
    annotations: canonical.annotations,
    requiredAnnotatorIds: canonical.requiredAnnotatorIds,
    dataKind: "synthetic-fixture",
    fixture: syntheticFixture,
  });
  assert.equal(referenceSet.references.length, 11);
  assert.equal(referenceSet.unresolvedDisagreements.length, 1);
  assert.equal(referenceSet.missingAnnotations.length, 0);
  assert.equal(referenceSet.humanCalibrationAvailable, false);
  const report = buildHumanReferenceCalibrationReport(canonical);
  assert.equal(report.humanReferenceDataPresent, false);
  assert.equal(report.humanHumanAgreement.disagreementCount, 1);
  assert.equal(report.derivedReferenceLabels.length, 2);
});

test("pilot CLI exposes separate export and import commands with provider-free options", () => {
  const exportOptions = parseTutorbenchArgs([
    "human-reference-pilot-export",
    "--fixture",
    "word-context",
    "--annotator",
    "annotator-a",
    "--annotator=annotator-b",
    "--output-dir",
    "artifacts/pilot",
  ]);
  assert.equal(exportOptions.help, false);
  if (exportOptions.help || !("humanReferencePilotExport" in exportOptions)) {
    return;
  }
  assert.equal(exportOptions.humanReferencePilotExport.mode, "export");
  assert.deepEqual(exportOptions.humanReferencePilotExport.annotatorIds, [
    "annotator-a",
    "annotator-b",
  ]);

  const importOptions = parseTutorbenchArgs([
    "human-reference-pilot-import",
    "--packet-dir",
    "artifacts/pilot",
    "--submission",
    "a.json",
    "--submission=b.json",
    "--output",
    "merged.json",
  ]);
  assert.equal(importOptions.help, false);
  if (importOptions.help || !("humanReferencePilotImport" in importOptions)) {
    return;
  }
  assert.equal(importOptions.humanReferencePilotImport.mode, "import");
  assert.equal(importOptions.humanReferencePilotImport.submissionPaths.length, 2);
});

test("provider-free CLI export and import smoke uses synthetic submissions only", async () => {
  const directory = await mkdtemp(join(tmpdir(), "tutorbench-human-reference-pilot-cli-"));
  try {
    const cliPath = resolve(process.cwd(), "dist", "src", "cli", "tutorbench.js");
    const exportResult = await runCli(cliPath, [
      "human-reference-pilot-export",
      "--fixture",
      "word-context",
      "--annotator",
      "annotator-a",
      "--annotator",
      "annotator-b",
      "--output-dir",
      directory,
    ]);
    assert.equal(exportResult.exitCode, 0, exportResult.stderr);
    assert.match(exportResult.stdout, /Human-reference pilot export/u);

    const packetA = parseHumanReferencePilotPacket(JSON.parse(
      await readFile(join(directory, "annotator-a.packet.json"), "utf8"),
    ) as unknown);
    const packetB = parseHumanReferencePilotPacket(JSON.parse(
      await readFile(join(directory, "annotator-b.packet.json"), "utf8"),
    ) as unknown);
    const submissionAPath = join(directory, "annotator-a.completed.json");
    const submissionBPath = join(directory, "annotator-b.completed.json");
    await writeFile(submissionAPath, `${JSON.stringify(submissionFor(packetA), null, 2)}\n`, "utf8");
    await writeFile(submissionBPath, `${JSON.stringify(submissionFor(packetB), null, 2)}\n`, "utf8");

    const outputPath = join(directory, "human-reference-annotations.json");
    const importResult = await runCli(cliPath, [
      "human-reference-pilot-import",
      "--packet-dir",
      directory,
      "--submission",
      submissionAPath,
      "--submission",
      submissionBPath,
      "--output",
      outputPath,
    ]);
    assert.equal(importResult.exitCode, 0, importResult.stderr);
    assert.match(importResult.stdout, /Human-reference pilot import/u);
    const output = JSON.parse(await readFile(outputPath, "utf8")) as Record<string, unknown>;
    assert.equal(output.dataKind, "synthetic-fixture");
    assert.deepEqual(output.fixture, syntheticFixture);
    assert.equal((output.annotations as unknown[]).length, 24);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
