import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";

import {
  buildHumanReferenceSemanticAuditReport,
  createHumanReferencePilotExport,
  createHumanReferenceSemanticAuditExport,
  HUMAN_REFERENCE_PILOT_BOUNDARY_ANNOTATION_GUIDE,
  HUMAN_REFERENCE_PILOT_BOUNDARY_FIXTURE_ID,
  importHumanReferenceSemanticAuditSubmission,
} from "../src/calibration/index.js";
import { parseTutorbenchArgs } from "../src/cli/tutorbench.js";
import {
  parseHumanReferenceAdjudicationFile,
  parseHumanReferenceAnnotationFile,
  parseHumanReferenceSemanticAuditSubmission,
  type HumanAtomicAnnotation,
  type HumanReferenceAdjudicationFile,
  type HumanReferenceAnnotationFile,
  type HumanReferenceSemanticAuditPacket,
  type HumanReferenceSemanticAuditSubmission,
} from "../src/contracts/index.js";
import { BenchmarkConfigurationError } from "../src/contracts/errors.js";
import {
  loadMaterialRequirementJudgePrompt,
  MATERIAL_REQUIREMENT_JUDGE_PROMPT_VERSION,
} from "../src/judge/index.js";

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function invalid(action: () => unknown): void {
  assert.throws(action, (error: unknown) =>
    error instanceof BenchmarkConfigurationError &&
    error.code === "human_reference_semantic_audit_invalid");
}

async function fixtureFiles(): Promise<{
  readonly annotations: HumanReferenceAnnotationFile;
  readonly adjudications: HumanReferenceAdjudicationFile;
}> {
  const annotationValue = JSON.parse(await readFile(
    resolve("fixtures/human-reference-calibration/synthetic-annotations.json"), "utf8",
  )) as HumanReferenceAnnotationFile;
  const missingTask = annotationValue.tasks.find((task) => task.caseId === "case-missing");
  assert.ok(missingTask);
  const completed: HumanReferenceAnnotationFile = {
    ...annotationValue,
    annotations: [...annotationValue.annotations, {
      schemaVersion: 1,
      caseId: "case-missing",
      rubricId: "rubric-ratio",
      requirementId: "requirement-ratio-order",
      annotatorId: "annotator-b",
      status: "SATISFIED",
      evidence: "The response preserves the named order.",
    }],
  };
  return {
    annotations: parseHumanReferenceAnnotationFile(completed),
    adjudications: parseHumanReferenceAdjudicationFile(JSON.parse(await readFile(
      resolve("fixtures/human-reference-calibration/synthetic-adjudications.json"), "utf8",
    ))),
  };
}

function completedSubmission(
  packet: HumanReferenceSemanticAuditPacket,
  overrides: Readonly<Record<string, "SATISFIED" | "OMITTED_OR_INCOMPLETE" | "EXPLICIT_CONFLICT">> = {},
): HumanReferenceSemanticAuditSubmission {
  return {
    schemaVersion: 1,
    packetKind: "human-reference-semantic-audit-submission",
    auditProtocolId: packet.auditProtocolId,
    auditProtocolVersion: packet.auditProtocolVersion,
    auditBatchId: packet.auditBatchId,
    reviewerId: packet.reviewerId,
    sourceCalibration: packet.sourceCalibration,
    taskSetFingerprint: packet.taskSetFingerprint,
    annotationGuide: packet.annotationGuide,
    annotations: packet.tasks.flatMap((task) => task.rubrics.flatMap((rubric) =>
      rubric.requirements.map((requirement) => ({
        caseId: task.caseId,
        rubricId: rubric.id,
        requirementId: requirement.id,
        status: overrides[JSON.stringify([task.caseId, rubric.id, requirement.id])] ?? "SATISFIED",
        evidence: `Visible response evidence for ${requirement.id}.`,
      })),
    )),
  };
}

function leafKeys(value: unknown, output = new Set<string>()): Set<string> {
  if (Array.isArray(value)) value.forEach((item) => leafKeys(item, output));
  else if (typeof value === "object" && value !== null) {
    Object.entries(value).forEach(([key, item]) => {
      output.add(key);
      leafKeys(item, output);
    });
  }
  return output;
}

test("export covers the full arbitrary task set and binds one opaque reviewer to frozen guide bytes", async () => {
  const pilot = await createHumanReferencePilotExport(
    ["annotator-a", "annotator-b"],
    undefined,
    HUMAN_REFERENCE_PILOT_BOUNDARY_FIXTURE_ID,
  );
  const annotations: HumanAtomicAnnotation[] = pilot.tasks.flatMap((task) =>
    task.rubrics.flatMap((rubric) => rubric.requirements.flatMap((requirement) =>
      ["annotator-a", "annotator-b"].map((annotatorId): HumanAtomicAnnotation => ({
        schemaVersion: 1,
        caseId: task.caseId,
        rubricId: rubric.id,
        requirementId: requirement.id,
        annotatorId,
        status: "SATISFIED",
      })),
    )),
  );
  const source = parseHumanReferenceAnnotationFile({
    schemaVersion: 1,
    batchId: pilot.batchId,
    calibrationProtocolId: "human-reference-material-calibration",
    calibrationProtocolVersion: "0.1.0",
    dataKind: "synthetic-fixture",
    fixture: { synthetic: true, notHumanCalibrationData: true },
    requiredAnnotatorIds: ["annotator-a", "annotator-b"],
    tasks: pilot.tasks,
    annotations,
  });
  const first = createHumanReferenceSemanticAuditExport(
    source, "reviewer-c", HUMAN_REFERENCE_PILOT_BOUNDARY_ANNOTATION_GUIDE,
  );
  const second = createHumanReferenceSemanticAuditExport(
    source, "reviewer-c", HUMAN_REFERENCE_PILOT_BOUNDARY_ANNOTATION_GUIDE,
  );
  assert.deepEqual(first, second);
  assert.equal(first.packet.tasks.length, 6);
  assert.equal(first.template.annotations.length, 24);
  assert.equal(first.packet.reviewerId, "reviewer-c");
  assert.equal(first.packet.taskSetFingerprint,
    "sha256:2e73aa96062b00908fe9f329e744cf91cb3f127865bce02ea33356069bb09285");
  assert.equal(first.packet.annotationGuide.fingerprint,
    "sha256:dcf8ebba67250311a134788919984f13777a51516cb6294ed4c24742be65ff3a");
  assert.equal(createHash("sha256").update(HUMAN_REFERENCE_PILOT_BOUNDARY_ANNOTATION_GUIDE, "utf8").digest("hex"),
    "dcf8ebba67250311a134788919984f13777a51516cb6294ed4c24742be65ff3a");
  invalid(() => createHumanReferenceSemanticAuditExport(source, "annotator-a",
    HUMAN_REFERENCE_PILOT_BOUNDARY_ANNOTATION_GUIDE));
  invalid(() => createHumanReferenceSemanticAuditExport(source, "reviewer-c",
    `${HUMAN_REFERENCE_PILOT_BOUNDARY_ANNOTATION_GUIDE}changed`));
});

test("packet and editable template do not leak prior reference, annotator, adjudication, derived, or Judge fields", async () => {
  const { annotations } = await fixtureFiles();
  const exported = createHumanReferenceSemanticAuditExport(
    annotations, "reviewer-c", HUMAN_REFERENCE_PILOT_BOUNDARY_ANNOTATION_GUIDE,
  );
  const forbiddenKeys = new Set([
    "sourceAnnotatorIds", "annotatorId", "adjudicatedStatus", "adjudicationReason",
    "referenceLabel", "expectedStatus", "expectedLabel", "judgeResult", "judgeEvidence",
    "reasoning", "referenceAgreement", "provenance", "derivedLabel",
  ]);
  for (const value of [exported.packet, exported.template]) {
    for (const key of leafKeys(value)) assert.equal(forbiddenKeys.has(key), false, key);
    const serialized = JSON.stringify(value);
    assert.doesNotMatch(serialized, /annotator-a|annotator-b|human_consensus|human_adjudicated|deepseek/iu);
    assert.doesNotMatch(serialized, /\b(?:PASS|PARTIAL|FAIL)\b/u);
  }
  assert.ok(exported.template.annotations.every((annotation) => annotation.status === ""));
  invalid(() => parseHumanReferenceSemanticAuditSubmission(exported.template));
});

test("strict import accepts exact completion and rejects missing, duplicate, extra, stale, and hidden fields", async () => {
  const { annotations } = await fixtureFiles();
  const first = createHumanReferenceSemanticAuditExport(
    annotations, "reviewer-c", HUMAN_REFERENCE_PILOT_BOUNDARY_ANNOTATION_GUIDE,
  );
  const valid = completedSubmission(first.packet);
  assert.equal(importHumanReferenceSemanticAuditSubmission(first.packet, valid).annotations.length, 3);

  const missing = { ...clone(valid), annotations: valid.annotations.slice(1) };
  invalid(() => importHumanReferenceSemanticAuditSubmission(first.packet, missing));
  const duplicate = { ...clone(valid), annotations: [...valid.annotations, valid.annotations[0]!] };
  invalid(() => importHumanReferenceSemanticAuditSubmission(first.packet, duplicate));
  const extra = { ...clone(valid), annotations: [...valid.annotations,
    { ...valid.annotations[0]!, requirementId: "extra-requirement" }] };
  invalid(() => importHumanReferenceSemanticAuditSubmission(first.packet, extra));

  for (const mutation of [
    (value: Record<string, unknown>) => { value.reviewerId = "reviewer-d"; },
    (value: Record<string, unknown>) => { value.taskSetFingerprint = `sha256:${"0".repeat(64)}`; },
    (value: Record<string, unknown>) => { value.annotationGuide = { ...valid.annotationGuide, version: "0.2.1" }; },
    (value: Record<string, unknown>) => { value.auditProtocolVersion = "0.2.0"; },
    (value: Record<string, unknown>) => { value.sourceCalibration = { ...valid.sourceCalibration, batchId: "other-pilot" }; },
    (value: Record<string, unknown>) => { value.judgeResult = {}; },
  ]) {
    const candidate = clone(valid) as unknown as Record<string, unknown>;
    mutation(candidate);
    invalid(() => importHumanReferenceSemanticAuditSubmission(first.packet, candidate));
  }
  const invalidStatus = clone(valid) as unknown as { annotations: { status: string }[] };
  invalidStatus.annotations[0]!.status = "UNSURE";
  invalid(() => importHumanReferenceSemanticAuditSubmission(first.packet, invalidStatus));
  const wrongAtom = { ...clone(valid), annotations: valid.annotations.map((annotation, index) =>
    index === 0 ? { ...annotation, rubricId: "wrong-rubric" } : annotation) };
  invalid(() => importHumanReferenceSemanticAuditSubmission(first.packet, wrongAtom));
});

test("comparison reports overall, directional confusion, provenance, dynamic requirement/case, and derived agreement without mutation", async () => {
  const { annotations, adjudications } = await fixtureFiles();
  const beforeAnnotations = clone(annotations);
  const beforeAdjudications = clone(adjudications);
  const exported = createHumanReferenceSemanticAuditExport(
    annotations, "reviewer-c", HUMAN_REFERENCE_PILOT_BOUNDARY_ANNOTATION_GUIDE,
  );
  const submission = completedSubmission(exported.packet, {
    [JSON.stringify(["case-disagreement", "rubric-evidence", "requirement-relevant-evidence"])]:
      "OMITTED_OR_INCOMPLETE",
    [JSON.stringify(["case-missing", "rubric-ratio", "requirement-ratio-order"])]:
      "OMITTED_OR_INCOMPLETE",
  });
  const audit = importHumanReferenceSemanticAuditSubmission(exported.packet, submission);
  const report = buildHumanReferenceSemanticAuditReport(annotations, adjudications, audit);
  assert.equal(report.reportKind, "human-reference-semantic-audit-report");
  assert.equal(report.plannedAtomicCount, 3);
  assert.deepEqual(
    [report.comparableAtomicCount, report.agreementCount, report.disagreementCount, report.agreementShare],
    [3, 1, 2, 1 / 3],
  );
  assert.equal(report.semanticAuditAgreement.confusionMatrix.SATISFIED.SATISFIED, 1);
  assert.equal(report.semanticAuditAgreement.confusionMatrix.SATISFIED.OMITTED_OR_INCOMPLETE, 1);
  assert.equal(report.semanticAuditAgreement.confusionMatrix.EXPLICIT_CONFLICT.OMITTED_OR_INCOMPLETE, 1);
  assert.deepEqual(report.referenceProvenanceAgreement.human_consensus,
    { comparableAtomicCount: 2, agreementCount: 1, disagreementCount: 1, agreementShare: 0.5 });
  assert.deepEqual(report.referenceProvenanceAgreement.human_adjudicated,
    { comparableAtomicCount: 1, agreementCount: 0, disagreementCount: 1, agreementShare: 0 });
  assert.equal(Object.keys(report.perRequirement).length, 3);
  assert.equal(report.perCase.length, 3);
  assert.equal(report.perCase.find((item) => item.caseId === "case-disagreement")?.disagreementCount, 1);
  assert.deepEqual(report.derivedLabelAgreement, {
    comparableRubricCount: 3,
    agreementCount: 2,
    disagreementCount: 1,
    agreementShare: 2 / 3,
    disagreements: [{
      caseId: "case-missing",
      rubricId: "rubric-ratio",
      frozenReferenceLabel: "PASS",
      auditLabel: "FAIL",
    }],
  });
  assert.deepEqual(annotations, beforeAnnotations);
  assert.deepEqual(adjudications, beforeAdjudications);
  assert.equal(report.limitations.some((value) => value.includes("automatic reference error")), true);
});

test("comparison rejects cross-pilot audit identity and never consults a provider", async () => {
  const { annotations, adjudications } = await fixtureFiles();
  const exported = createHumanReferenceSemanticAuditExport(
    annotations, "reviewer-c", HUMAN_REFERENCE_PILOT_BOUNDARY_ANNOTATION_GUIDE,
  );
  const audit = importHumanReferenceSemanticAuditSubmission(exported.packet,
    completedSubmission(exported.packet));
  const stale = clone(audit) as unknown as Record<string, unknown>;
  stale.taskSetFingerprint = `sha256:${"f".repeat(64)}`;
  invalid(() => buildHumanReferenceSemanticAuditReport(annotations, adjudications, stale as never));
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (() => { throw new Error("network access is prohibited"); }) as typeof fetch;
  try {
    assert.equal(buildHumanReferenceSemanticAuditReport(annotations, adjudications, audit).agreementCount, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("CLI routes all three provider-free semantic-audit commands", () => {
  const exported = parseTutorbenchArgs([
    "human-reference-semantic-audit-export", "--annotations", "annotations.json",
    "--reviewer", "reviewer-c", "--guide", "guide.md", "--output-dir", "audit",
  ]);
  assert.equal(exported.help, false);
  assert.ok(!exported.help && "humanReferenceSemanticAudit" in exported);
  const imported = parseTutorbenchArgs([
    "human-reference-semantic-audit-import", "--packet", "packet.json",
    "--submission", "completed.json", "--output", "audit.json",
  ]);
  assert.equal(imported.help, false);
  const compared = parseTutorbenchArgs([
    "human-reference-semantic-audit", "--annotations", "annotations.json",
    "--adjudications", "adjudications.json", "--audit", "audit.json", "--output", "report.json",
  ]);
  assert.equal(compared.help, false);
});

test("Pilot #1/#2 identities and frozen Material Requirement Judge @0.4 remain unchanged", async () => {
  const historical = await createHumanReferencePilotExport(["annotator-a", "annotator-b"]);
  assert.equal(historical.packets[0]?.pilotProtocolVersion, "0.1.0");
  const boundary = await createHumanReferencePilotExport(
    ["annotator-a", "annotator-b"], undefined, HUMAN_REFERENCE_PILOT_BOUNDARY_FIXTURE_ID,
  );
  assert.equal(boundary.taskSetFingerprint,
    "sha256:2e73aa96062b00908fe9f329e744cf91cb3f127865bce02ea33356069bb09285");
  assert.equal(createHash("sha256").update(boundary.annotationGuide, "utf8").digest("hex"),
    "dcf8ebba67250311a134788919984f13777a51516cb6294ed4c24742be65ff3a");
  assert.equal(MATERIAL_REQUIREMENT_JUDGE_PROMPT_VERSION, "0.4");
  assert.ok((await loadMaterialRequirementJudgePrompt()).length > 0);
});

test("CLI completes export, strict import, and comparison using only local files", async () => {
  const directory = await mkdtemp(join(tmpdir(), "tutorbench-semantic-audit-"));
  try {
    const { annotations, adjudications } = await fixtureFiles();
    const annotationPath = join(directory, "annotations.json");
    const adjudicationPath = join(directory, "adjudications.json");
    const guidePath = join(directory, "ANNOTATION_GUIDE.md");
    const auditDirectory = join(directory, "audit");
    await Promise.all([
      writeFile(annotationPath, JSON.stringify(annotations), "utf8"),
      writeFile(adjudicationPath, JSON.stringify(adjudications), "utf8"),
      writeFile(guidePath, HUMAN_REFERENCE_PILOT_BOUNDARY_ANNOTATION_GUIDE, "utf8"),
    ]);
    const { main } = await import("../src/cli/tutorbench.js");
    await main(["human-reference-semantic-audit-export", "--annotations", annotationPath,
      "--reviewer", "reviewer-c", "--guide", guidePath, "--output-dir", auditDirectory]);
    const packetPath = join(auditDirectory, "reviewer-c.packet.json");
    const templatePath = join(auditDirectory, "reviewer-c.submission-template.json");
    const packet = JSON.parse(await readFile(packetPath, "utf8")) as HumanReferenceSemanticAuditPacket;
    const submissionPath = join(auditDirectory, "reviewer-c.completed.json");
    await writeFile(submissionPath, JSON.stringify(completedSubmission(packet)), "utf8");
    const auditPath = join(auditDirectory, "reviewer-c.audit-annotations.json");
    await main(["human-reference-semantic-audit-import", "--packet", packetPath,
      "--submission", submissionPath, "--output", auditPath]);
    const reportPath = join(auditDirectory, "reviewer-c.report.json");
    await main(["human-reference-semantic-audit", "--annotations", annotationPath,
      "--adjudications", adjudicationPath, "--audit", auditPath, "--output", reportPath]);
    assert.equal(JSON.parse(await readFile(templatePath, "utf8")).annotations.length, 3);
    assert.equal(JSON.parse(await readFile(reportPath, "utf8")).comparableAtomicCount, 3);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
