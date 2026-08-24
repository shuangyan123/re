import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { test } from "node:test";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import {
  buildHumanReferenceCalibrationReport,
  buildHumanReferenceSet,
  HUMAN_REFERENCE_PILOT_ANNOTATION_GUIDE,
  HUMAN_REFERENCE_PILOT_BOUNDARY_ANNOTATION_GUIDE,
  HUMAN_REFERENCE_PILOT_BOUNDARY_FIXTURE_ID,
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
import {
  loadMaterialRequirementJudgePrompt,
  MATERIAL_REQUIREMENT_JUDGE_PROMPT_VERSION,
} from "../src/judge/index.js";

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
    ...(packet.annotationGuideId === undefined ? {} : {
      annotationGuideId: packet.annotationGuideId,
      annotationGuideVersion: packet.annotationGuideVersion,
    }),
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

function makeBoundaryPilot() {
  return createHumanReferencePilotExport(
    ["annotator-a", "annotator-b"],
    undefined,
    HUMAN_REFERENCE_PILOT_BOUNDARY_FIXTURE_ID,
  );
}

function atomicCount(tasks: readonly HumanReferencePilotPacket["tasks"][number][]): number {
  return tasks.reduce(
    (count, task) => count + task.rubrics.reduce(
      (rubricCount, rubric) => rubricCount + rubric.requirements.length,
      0,
    ),
    0,
  );
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

test("Pilot #1 remains frozen while Pilot #2 binds a versioned boundary guide", async () => {
  const historical = await makePilot();
  assert.equal(historical.source.fixtureId, "word-context");
  assert.equal(historical.source.fixtureVersion, "0.2.0");
  assert.equal(historical.tasks.length, 3);
  assert.equal(atomicCount(historical.tasks), 12);
  assert.deepEqual(
    historical.tasks.map((task) => task.caseId),
    ["material-word-context-A", "material-word-context-B", "material-word-context-C"],
  );
  assert.equal(historical.packets[0]?.pilotProtocolVersion, "0.1.0");
  assert.equal("annotationGuideId" in historical.packets[0]!, false);
  assert.equal("annotationGuideVersion" in historical.packets[0]!, false);
  assert.equal(historical.annotationGuide, HUMAN_REFERENCE_PILOT_ANNOTATION_GUIDE);
  assert.equal(
    createHash("sha256").update(HUMAN_REFERENCE_PILOT_ANNOTATION_GUIDE, "utf8").digest("hex"),
    "13ddf866e0dfff92cab7ef767e6fdb1feab225cf15959889e4260f770c6d31df",
  );

  const boundary = await makeBoundaryPilot();
  assert.equal(boundary.pilotId, "human-reference-word-context-boundaries-002");
  assert.equal(boundary.source.diagnosticId, "human-reference-atomic-boundary-diagnostic");
  assert.equal(boundary.source.diagnosticVersion, "0.1.0");
  assert.equal(boundary.source.fixtureId, "word-context-human-boundaries");
  assert.equal(boundary.source.fixtureVersion, "0.1.0");
  assert.equal(boundary.tasks.length, 6);
  assert.equal(atomicCount(boundary.tasks), 24);
  assert.ok(boundary.tasks.every((task) =>
    task.rubrics.length === 1 &&
    task.rubrics[0]?.requirements.map((requirement) => requirement.id).join(",") ===
      "R1,R2,R3,R4",
  ));
  assert.equal(boundary.packets[0]?.pilotProtocolVersion, "0.2.0");
  assert.equal(
    boundary.packets[0]?.annotationGuideId,
    "human-reference-material-annotation-guide",
  );
  assert.equal(boundary.packets[0]?.annotationGuideVersion, "0.2.0");
  assert.equal(boundary.annotationGuide, HUMAN_REFERENCE_PILOT_BOUNDARY_ANNOTATION_GUIDE);
  assert.deepEqual(boundary.packets[0]?.tasks, boundary.packets[1]?.tasks);
  assert.notEqual(boundary.packets[0]?.annotatorId, boundary.packets[1]?.annotatorId);
});

test("Pilot #2 guide preserves the clarified atomic boundary semantics", () => {
  const guide = HUMAN_REFERENCE_PILOT_BOUNDARY_ANNOTATION_GUIDE;
  assert.match(guide, /Omission is not conflict/u);
  assert.match(guide, /clue alone is insufficient[\s\S]*EXPLICIT_CONFLICT/u);
  assert.match(guide, /Failure on one atomic does not[\s\S]*propagated across\s+atomics/u);
  assert.match(guide, /clue X supports[\s\S]*separate[\s\S]*evidence-sufficiency atomic/u);
  assert.match(guide, /connect the\s+student's proposed meaning with context evidence/u);
  assert.match(guide, /context-grounded[\s\S]*is not automatic rejection/u);
  assert.match(guide, /Evidence is optional/u);
  assert.match(guide, /Do not consult another annotator/u);
  assert.doesNotMatch(
    guide,
    /material-word-context-[ABC]|human-word-context-boundary-[A-F]|DeepSeek|MiniMax|OpenAI|\bR[1-4]\b/u,
  );
});

test("Pilot #2 packets are blind allowlist projections with 24 empty template atoms", async () => {
  const pilot = await makeBoundaryPilot();
  const packetA = pilot.packets[0]!;
  const packetB = pilot.packets[1]!;
  assert.deepEqual(packetA.tasks, packetB.tasks);
  assert.equal(packetA.taskSetFingerprint, packetB.taskSetFingerprint);
  assert.equal(pilot.templates[0]?.annotations.length, 24);
  assert.equal(pilot.templates[1]?.annotations.length, 24);
  assert.deepEqual(pilot.templates[0]?.annotations, pilot.templates[1]?.annotations);
  assert.ok(pilot.templates.every((template) =>
    template.annotations.every((annotation) => annotation.status === ""),
  ));
  assert.ok(pilot.templates.every((template) => template.dataKind === "human-annotation"));
  assert.ok(pilot.templates.every((template) => !("fixture" in template)));

  const serialized = JSON.stringify({ packets: pilot.packets, templates: pilot.templates });
  assert.doesNotMatch(serialized, /expectedStatus|expectedDerivedLabel|judgeResult|judgeEvidence/u);
  assert.doesNotMatch(serialized, /adjudication|providerMetadata|hiddenReasoning/u);
  assert.doesNotMatch(serialized, /\b(?:PASS|PARTIAL|FAIL)\b/u);
  invalid(() => parseHumanReferencePilotSubmission(pilot.templates[0]));
});

test("pilot export derives identical editable templates from both packets", async () => {
  const pilot = await makePilot();
  assert.equal(pilot.templates.length, 2);
  const templateA = pilot.templates[0]!;
  const templateB = pilot.templates[1]!;
  const expectedAtoms = pilot.tasks.flatMap((task) =>
    task.rubrics.flatMap((rubric) =>
      rubric.requirements.map((requirement) => ({
        caseId: task.caseId,
        rubricId: rubric.id,
        requirementId: requirement.id,
      })),
    ),
  ).sort((left, right) =>
    left.caseId.localeCompare(right.caseId) ||
    left.rubricId.localeCompare(right.rubricId) ||
    left.requirementId.localeCompare(right.requirementId),
  );

  assert.equal(templateA.annotatorId, "annotator-a");
  assert.equal(templateB.annotatorId, "annotator-b");
  assert.equal(templateA.dataKind, "human-annotation");
  assert.equal(templateB.dataKind, "human-annotation");
  assert.equal("fixture" in templateA, false);
  assert.equal("fixture" in templateB, false);
  assert.equal(templateA.annotations.length, 12);
  assert.equal(templateB.annotations.length, 12);
  assert.deepEqual(templateA.annotations, templateB.annotations);
  assert.deepEqual(
    templateA.annotations.map(({ caseId, rubricId, requirementId }) => ({
      caseId,
      rubricId,
      requirementId,
    })),
    expectedAtoms,
  );
  assert.ok(templateA.annotations.every((annotation) => annotation.status === ""));
  assert.ok(templateA.annotations.every((annotation) => !("evidence" in annotation)));

  assert.equal(templateA.pilotId, pilot.pilotId);
  assert.equal(templateA.batchId, pilot.batchId);
  assert.equal(templateA.taskSetFingerprint, pilot.taskSetFingerprint);
  assert.equal(templateA.schemaVersion, pilot.packets[0]!.schemaVersion);
  assert.equal(templateA.pilotProtocolId, pilot.packets[0]!.pilotProtocolId);
  assert.equal(templateA.pilotProtocolVersion, pilot.packets[0]!.pilotProtocolVersion);
  assert.equal(templateA.calibrationProtocolId, pilot.packets[0]!.calibrationProtocolId);
  assert.equal(templateA.calibrationProtocolVersion, pilot.packets[0]!.calibrationProtocolVersion);
  assert.equal(templateA.annotatorId, pilot.packets[0]!.annotatorId);
  assert.equal(templateB.pilotId, pilot.pilotId);
  assert.equal(templateB.batchId, pilot.batchId);
  assert.equal(templateB.taskSetFingerprint, pilot.taskSetFingerprint);
  assert.equal(templateB.schemaVersion, pilot.packets[1]!.schemaVersion);
  assert.equal(templateB.pilotProtocolId, pilot.packets[1]!.pilotProtocolId);
  assert.equal(templateB.pilotProtocolVersion, pilot.packets[1]!.pilotProtocolVersion);
  assert.equal(templateB.calibrationProtocolId, pilot.packets[1]!.calibrationProtocolId);
  assert.equal(templateB.calibrationProtocolVersion, pilot.packets[1]!.calibrationProtocolVersion);
  assert.equal(templateB.annotatorId, pilot.packets[1]!.annotatorId);

  const serialized = JSON.stringify(templateA);
  assert.doesNotMatch(serialized, /"expected(?:Status|Label|Result)"/u);
  assert.doesNotMatch(serialized, /"(?:judgeResult|judgeEvidence|reasoning|adjudication|provider|model)"/u);
  assert.doesNotMatch(serialized, /"status":"(?:PASS|PARTIAL|FAIL)"/u);
  assert.doesNotMatch(serialized, /annotator-b/u);
});

test("editable pilot templates remain separate from the strict submission parser", async () => {
  const pilot = await makePilot();
  const template = pilot.templates[0]!;
  invalid(() => parseHumanReferencePilotSubmission(template));

  const completed = {
    ...template,
    annotations: template.annotations.map((annotation) => ({
      ...annotation,
      status: "SATISFIED" as const,
    })),
  };
  assert.doesNotThrow(() => parseHumanReferencePilotSubmission(completed));
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

test("Pilot #2 import is complete, independent, and fail-closed across pilot boundaries", async () => {
  const historical = await makePilot();
  const pilot = await makeBoundaryPilot();
  const packetA = pilot.packets[0]!;
  const packetB = pilot.packets[1]!;
  const submissionA = submissionFor(packetA);
  const submissionB = submissionFor(packetB);

  const canonical = mergeHumanReferencePilotSubmissions(
    pilot.packets,
    [submissionA, submissionB],
    pilot.tasks,
  );
  assert.equal(canonical.requiredAnnotatorIds.length, 2);
  assert.equal(canonical.annotations.length, 48);
  assert.equal(canonical.dataKind, "synthetic-fixture");
  assert.deepEqual(canonical.fixture, syntheticFixture);

  invalid(() => mergeHumanReferencePilotSubmissions(
    pilot.packets,
    [submissionFor(historical.packets[0]!), submissionB],
    pilot.tasks,
  ));
  invalid(() => mergeHumanReferencePilotSubmissions(
    historical.packets,
    [submissionA, submissionFor(historical.packets[1]!)],
    historical.tasks,
  ));

  const wrongFingerprint = cloneJson(submissionA) as unknown as Record<string, unknown>;
  wrongFingerprint.taskSetFingerprint = `sha256:${"f".repeat(64)}`;
  invalid(() => mergeHumanReferencePilotSubmissions(
    pilot.packets,
    [wrongFingerprint, submissionB],
    pilot.tasks,
  ));

  const wrongGuide = cloneJson(submissionA) as unknown as Record<string, unknown>;
  wrongGuide.annotationGuideVersion = "0.1.0";
  invalid(() => parseHumanReferencePilotSubmission(wrongGuide));

  const wrongPacketGuide = cloneJson(packetA) as unknown as Record<string, unknown>;
  wrongPacketGuide.annotationGuideVersion = "0.1.0";
  invalid(() => parseHumanReferencePilotPacket(wrongPacketGuide));

  invalid(() => mergeHumanReferencePilotSubmissions(
    pilot.packets,
    [submissionA, cloneJson(submissionA)],
    pilot.tasks,
  ));

  const wrongOwner = cloneJson(submissionA) as unknown as Record<string, unknown>;
  (wrongOwner.annotations as Record<string, unknown>[])[0]!.rubricId = "wrong-owner";
  invalid(() => mergeHumanReferencePilotSubmissions(
    pilot.packets,
    [wrongOwner, submissionB],
    pilot.tasks,
  ));

  const duplicate = cloneJson(submissionA) as unknown as Record<string, unknown>;
  duplicate.annotations = [
    ...(duplicate.annotations as unknown[]),
    cloneJson((duplicate.annotations as unknown[])[0]),
  ];
  invalid(() => mergeHumanReferencePilotSubmissions(
    pilot.packets,
    [duplicate, submissionB],
    pilot.tasks,
  ));

  const missing = cloneJson(submissionA) as unknown as Record<string, unknown>;
  missing.annotations = (missing.annotations as unknown[]).slice(1);
  invalid(() => mergeHumanReferencePilotSubmissions(
    pilot.packets,
    [missing, submissionB],
    pilot.tasks,
  ));

  const extra = cloneJson(submissionA) as unknown as Record<string, unknown>;
  extra.annotations = [
    ...(extra.annotations as unknown[]),
    {
      caseId: packetA.tasks[0]!.caseId,
      rubricId: packetA.tasks[0]!.rubrics[0]!.id,
      requirementId: "extra-atom",
      status: "SATISFIED",
    },
  ];
  invalid(() => mergeHumanReferencePilotSubmissions(
    pilot.packets,
    [extra, submissionB],
    pilot.tasks,
  ));
});

test("Pilot #2 real submissions retain human provenance without synthetic markers", async () => {
  const pilot = await makeBoundaryPilot();
  const realSubmissions = pilot.packets.map((packet) => {
    const synthetic = submissionFor(packet);
    const { fixture: _fixture, ...human } = synthetic;
    return { ...human, dataKind: "human-annotation" as const };
  });
  const canonical = mergeHumanReferencePilotSubmissions(
    pilot.packets,
    realSubmissions,
    pilot.tasks,
  );
  assert.equal(canonical.dataKind, "human-annotation");
  assert.equal("fixture" in canonical, false);
  assert.equal(JSON.stringify(canonical).includes("notHumanCalibrationData"), false);
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

  const boundaryOptions = parseTutorbenchArgs([
    "human-reference-pilot-export",
    "--fixture",
    "word-context-human-boundaries",
    "--annotator",
    "annotator-a",
    "--annotator",
    "annotator-b",
  ]);
  assert.equal(boundaryOptions.help, false);
  if (!boundaryOptions.help && "humanReferencePilotExport" in boundaryOptions) {
    assert.equal(
      boundaryOptions.humanReferencePilotExport.fixture,
      "word-context-human-boundaries",
    );
    assert.equal(
      boundaryOptions.humanReferencePilotExport.pilotId,
      "human-reference-word-context-boundaries-002",
    );
  }

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

test("Material Requirement Judge v0.4 prompt remains frozen", async () => {
  assert.equal(MATERIAL_REQUIREMENT_JUDGE_PROMPT_VERSION, "0.4");
  const prompt = await loadMaterialRequirementJudgePrompt();
  assert.equal(
    createHash("sha256").update(prompt.replace(/\r\n/gu, "\n"), "utf8").digest("hex"),
    "f39ce3a005a609beae05d6dfab1036132d8d5f43732b840df4238f857aa677ac",
  );
});

test("provider-free Pilot #2 CLI export and import binds the clarified guide", async () => {
  const directory = await mkdtemp(join(tmpdir(), "tutorbench-human-reference-boundary-pilot-cli-"));
  try {
    const cliPath = resolve(process.cwd(), "dist", "src", "cli", "tutorbench.js");
    const exportResult = await runCli(cliPath, [
      "human-reference-pilot-export",
      "--fixture",
      "word-context-human-boundaries",
      "--annotator",
      "annotator-a",
      "--annotator",
      "annotator-b",
      "--pilot-id",
      "human-reference-word-context-boundaries-002",
      "--output-dir",
      directory,
    ]);
    assert.equal(exportResult.exitCode, 0, exportResult.stderr);
    assert.match(exportResult.stdout, /Tasks: 6/u);
    assert.match(exportResult.stdout, /Atomic requirements: 24/u);

    const packetA = parseHumanReferencePilotPacket(JSON.parse(
      await readFile(join(directory, "annotator-a.packet.json"), "utf8"),
    ) as unknown);
    const packetB = parseHumanReferencePilotPacket(JSON.parse(
      await readFile(join(directory, "annotator-b.packet.json"), "utf8"),
    ) as unknown);
    assert.equal(packetA.annotationGuideVersion, "0.2.0");
    assert.deepEqual(packetA.tasks, packetB.tasks);
    assert.equal(
      await readFile(join(directory, "ANNOTATION_GUIDE.md"), "utf8"),
      HUMAN_REFERENCE_PILOT_BOUNDARY_ANNOTATION_GUIDE,
    );

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
    const output = JSON.parse(await readFile(outputPath, "utf8")) as Record<string, unknown>;
    assert.equal((output.annotations as unknown[]).length, 48);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
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
    assert.match(exportResult.stdout, /Packets:/u);
    assert.match(exportResult.stdout, /Submission templates:/u);
    assert.match(exportResult.stdout, /Annotation guide:/u);

    assert.deepEqual((await readdir(directory)).sort(), [
      "ANNOTATION_GUIDE.md",
      "annotator-a.packet.json",
      "annotator-a.submission-template.json",
      "annotator-b.packet.json",
      "annotator-b.submission-template.json",
    ]);

    const packetA = parseHumanReferencePilotPacket(JSON.parse(
      await readFile(join(directory, "annotator-a.packet.json"), "utf8"),
    ) as unknown);
    const packetB = parseHumanReferencePilotPacket(JSON.parse(
      await readFile(join(directory, "annotator-b.packet.json"), "utf8"),
    ) as unknown);
    const templateA = JSON.parse(
      await readFile(join(directory, "annotator-a.submission-template.json"), "utf8"),
    ) as Record<string, unknown>;
    const templateB = JSON.parse(
      await readFile(join(directory, "annotator-b.submission-template.json"), "utf8"),
    ) as Record<string, unknown>;
    invalid(() => parseHumanReferencePilotSubmission(templateA));
    invalid(() => parseHumanReferencePilotSubmission(templateB));
    assert.equal(templateA.dataKind, "human-annotation");
    assert.equal(templateB.dataKind, "human-annotation");
    assert.equal("fixture" in templateA, false);
    assert.equal("fixture" in templateB, false);
    assert.deepEqual(templateA.annotations, templateB.annotations);
    assert.equal((templateA.annotations as unknown[]).length, 12);
    const guide = await readFile(join(directory, "ANNOTATION_GUIDE.md"), "utf8");
    assert.equal(guide, HUMAN_REFERENCE_PILOT_ANNOTATION_GUIDE);
    assert.match(guide, /## SATISFIED/u);
    assert.match(guide, /## OMITTED_OR_INCOMPLETE/u);
    assert.match(guide, /## EXPLICIT_CONFLICT/u);
    assert.match(guide, /atomic requirement independently/u);
    assert.match(guide, /another annotator/u);
    assert.doesNotMatch(
      guide,
      /reluctant|unsure|hesitation|unwilling|pause-before-agreeing|material-word-context-[ABC]|\bR[1-4]\b/iu,
    );
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
