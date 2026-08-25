import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";

import {
  buildOfficialZhCnSemanticAuditLocalization,
  buildQualifiedLocalizedSemanticAuditReport,
  buildSemanticAuditLocalizationIdentity,
  createHumanReferencePilotExport,
  createHumanReferenceSemanticAuditExport,
  createQualifiedLocalizedSemanticAuditExport,
  createReviewerQualificationExport,
  evaluateReviewerQualification,
  HUMAN_REFERENCE_PILOT_BOUNDARY_ANNOTATION_GUIDE,
  HUMAN_REFERENCE_PILOT_BOUNDARY_FIXTURE_ID,
  HUMAN_REFERENCE_SEMANTIC_AUDIT_PILOT_2_SOURCE_TASK_FINGERPRINT,
  HUMAN_REFERENCE_SEMANTIC_AUDIT_QUALIFICATION_FINGERPRINT,
  HUMAN_REFERENCE_SEMANTIC_AUDIT_ZH_CN_GUIDE,
  HUMAN_REFERENCE_SEMANTIC_AUDIT_ZH_CN_LOCALIZED_GUIDE_FINGERPRINT,
  HUMAN_REFERENCE_SEMANTIC_AUDIT_ZH_CN_LOCALIZED_TASK_FINGERPRINT,
  HUMAN_REFERENCE_SEMANTIC_AUDIT_ZH_CN_PRESENTATION_FINGERPRINT,
  importQualifiedLocalizedSemanticAuditSubmission,
} from "../src/calibration/index.js";
import { parseTutorbenchArgs } from "../src/cli/tutorbench.js";
import {
  HUMAN_REFERENCE_SEMANTIC_AUDIT_V2_PROTOCOL_VERSION,
  parseHumanReferenceAdjudicationFile,
  parseHumanReferenceAnnotationFile,
  parseHumanReferenceQualifiedSemanticAuditPacket,
  parseHumanReferenceQualifiedSemanticAuditSubmission,
  parseReviewerQualificationPacket,
  parseReviewerQualificationSubmission,
  renderLocalizedSemanticAuditReview,
  type HumanAtomicAnnotation,
  type HumanReferenceAdjudicationFile,
  type HumanReferenceAnnotationFile,
  type HumanReferenceQualifiedSemanticAuditPacket,
  type HumanReferenceQualifiedSemanticAuditSubmission,
  type HumanReferenceSemanticAuditLocalizationDefinition,
  type ReviewerQualificationPacket,
  type ReviewerQualificationSubmission,
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
  assert.throws(action, (error: unknown) => error instanceof BenchmarkConfigurationError &&
    error.code === "human_reference_semantic_audit_invalid");
}

async function pilot2Source(): Promise<HumanReferenceAnnotationFile> {
  const pilot = await createHumanReferencePilotExport(
    ["annotator-a", "annotator-b"], undefined, HUMAN_REFERENCE_PILOT_BOUNDARY_FIXTURE_ID,
  );
  const annotations: HumanAtomicAnnotation[] = pilot.tasks.flatMap((task) => task.rubrics.flatMap((rubric) =>
    rubric.requirements.flatMap((requirement) => ["annotator-a", "annotator-b"].map((annotatorId) => ({
      schemaVersion: 1 as const,
      caseId: task.caseId,
      rubricId: rubric.id,
      requirementId: requirement.id,
      annotatorId,
      status: "SATISFIED" as const,
    }))),
  ));
  return parseHumanReferenceAnnotationFile({
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
}

function qualificationSubmission(packet: ReviewerQualificationPacket): ReviewerQualificationSubmission {
  const statuses: Record<string, "SATISFIED" | "OMITTED_OR_INCOMPLETE" | "EXPLICIT_CONFLICT"> = {
    "qualification-omission-negative/Q1": "OMITTED_OR_INCOMPLETE",
    "qualification-omission-negative/Q2": "SATISFIED",
    "qualification-support-sufficiency/Q1": "SATISFIED",
    "qualification-support-sufficiency/Q2": "EXPLICIT_CONFLICT",
    "qualification-contextual-correction/Q1": "SATISFIED",
    "qualification-contextual-correction/Q2": "SATISFIED",
    "qualification-unsupported-verdict/Q1": "OMITTED_OR_INCOMPLETE",
    "qualification-unsupported-verdict/Q2": "EXPLICIT_CONFLICT",
  };
  return parseReviewerQualificationSubmission({
    schemaVersion: packet.schemaVersion,
    packetKind: "human-reference-semantic-audit-qualification-submission",
    auditProtocolId: packet.auditProtocolId,
    auditProtocolVersion: packet.auditProtocolVersion,
    reviewerId: packet.reviewerId,
    qualificationId: packet.qualificationId,
    qualificationVersion: packet.qualificationVersion,
    qualificationBatchId: packet.qualificationBatchId,
    qualificationFingerprint: packet.qualificationFingerprint,
    localization: packet.localization,
    assessments: packet.items.flatMap((item) => item.requirements.map((requirement) => ({
      caseId: item.itemId,
      rubricId: item.itemId,
      requirementId: requirement.requirementId,
      status: statuses[`${item.itemId}/${requirement.requirementId}`],
    }))),
  });
}

function completedAuditSubmission(
  packet: HumanReferenceQualifiedSemanticAuditPacket,
): HumanReferenceQualifiedSemanticAuditSubmission {
  return parseHumanReferenceQualifiedSemanticAuditSubmission({
    schemaVersion: packet.schemaVersion,
    packetKind: "human-reference-semantic-audit-localized-submission",
    auditProtocolId: packet.auditProtocolId,
    auditProtocolVersion: packet.auditProtocolVersion,
    auditBatchId: packet.auditBatchId,
    reviewerId: packet.reviewerId,
    sourceCalibration: packet.sourceCalibration,
    localization: packet.localization,
    reviewerQualification: packet.reviewerQualification,
    reviewLocale: "zh-CN",
    instructionsClear: true,
    annotations: packet.localizedTasks.flatMap((task) => task.rubrics.flatMap((rubric) =>
      rubric.requirements.map((requirement) => ({
        caseId: task.caseId,
        rubricId: rubric.id,
        requirementId: requirement.id,
        status: "SATISFIED",
      })),
    )),
  });
}

function keys(value: unknown, output = new Set<string>()): Set<string> {
  if (Array.isArray(value)) value.forEach((item) => keys(item, output));
  else if (typeof value === "object" && value !== null) Object.entries(value).forEach(([key, item]) => {
    output.add(key);
    keys(item, output);
  });
  return output;
}

test("@0.1.0 remains accepted while @0.2.0 localization identities are distinct and deterministic", async () => {
  const source = await pilot2Source();
  const legacy = createHumanReferenceSemanticAuditExport(
    source, "reviewer-legacy", HUMAN_REFERENCE_PILOT_BOUNDARY_ANNOTATION_GUIDE,
  );
  assert.equal(legacy.packet.auditProtocolVersion, "0.1.0");

  const first = buildOfficialZhCnSemanticAuditLocalization(source.tasks);
  const second = buildOfficialZhCnSemanticAuditLocalization(source.tasks);
  const firstIdentity = buildSemanticAuditLocalizationIdentity(source.tasks, first);
  assert.deepEqual(first, second);
  assert.equal(HUMAN_REFERENCE_SEMANTIC_AUDIT_V2_PROTOCOL_VERSION, "0.2.0");
  assert.equal(firstIdentity.sourceTaskFingerprint, HUMAN_REFERENCE_SEMANTIC_AUDIT_PILOT_2_SOURCE_TASK_FINGERPRINT);
  assert.equal(firstIdentity.localizedTaskFingerprint, HUMAN_REFERENCE_SEMANTIC_AUDIT_ZH_CN_LOCALIZED_TASK_FINGERPRINT);
  assert.equal(firstIdentity.localizedPresentationFingerprint,
    HUMAN_REFERENCE_SEMANTIC_AUDIT_ZH_CN_PRESENTATION_FINGERPRINT);
  assert.equal(firstIdentity.localizedAnnotationGuide.fingerprint,
    HUMAN_REFERENCE_SEMANTIC_AUDIT_ZH_CN_LOCALIZED_GUIDE_FINGERPRINT);
  assert.notEqual(firstIdentity.sourceTaskFingerprint, firstIdentity.localizedTaskFingerprint);
  assert.notEqual(firstIdentity.sourceAnnotationGuide.fingerprint,
    firstIdentity.localizedAnnotationGuide.fingerprint);
  assert.equal(`sha256:${createHash("sha256").update(HUMAN_REFERENCE_SEMANTIC_AUDIT_ZH_CN_GUIDE).digest("hex")}`,
    HUMAN_REFERENCE_SEMANTIC_AUDIT_ZH_CN_LOCALIZED_GUIDE_FINGERPRINT);
});

test("human-readable zh-CN material includes every visible task and semantic boundary without hidden evidence", async () => {
  const source = await pilot2Source();
  const definition = buildOfficialZhCnSemanticAuditLocalization(source.tasks);
  const review = renderLocalizedSemanticAuditReview(definition.localizedTasks);
  assert.equal((review.match(/^## 案例 /gmu) ?? []).length, source.tasks.length);
  assert.equal((review.match(/^#### 原子要求 /gmu) ?? []).length, 24);
  for (const phrase of ["遗漏不等于冲突", "原子要求相互独立", "仅凭", "上下文评估", "自动判定"]) {
    assert.match(`${HUMAN_REFERENCE_SEMANTIC_AUDIT_ZH_CN_GUIDE}\n${review}`, new RegExp(phrase, "u"));
  }
  const forbiddenKeys = new Set(["annotatorId", "sourceAnnotatorIds", "provenance", "adjudicatedStatus",
    "expectedStatus", "expectedLabel", "judgeResult", "judgeEvidence", "reasoning", "derivedLabel"]);
  for (const key of keys(definition.localizedTasks)) assert.equal(forbiddenKeys.has(key), false, key);
  const serialized = `${JSON.stringify(definition.localizedTasks)}\n${review}\n${HUMAN_REFERENCE_SEMANTIC_AUDIT_ZH_CN_GUIDE}`;
  assert.doesNotMatch(serialized, /human_consensus|human_adjudicated|DeepSeek|MiniMax|annotator-a|annotator-b/iu);
  assert.doesNotMatch(serialized, /"(?:expectedStatus|expectedLabel|judgeResult|derivedLabel)"/u);
});

test("qualification packet has no answer key and exact comprehension is required", async () => {
  const source = await pilot2Source();
  const localization = buildSemanticAuditLocalizationIdentity(source.tasks,
    buildOfficialZhCnSemanticAuditLocalization(source.tasks));
  const exported = createReviewerQualificationExport("reviewer-qualified", localization);
  assert.equal(exported.packet.qualificationFingerprint, HUMAN_REFERENCE_SEMANTIC_AUDIT_QUALIFICATION_FINGERPRINT);
  assert.equal(exported.template.assessments.length, 8);
  assert.ok(exported.template.assessments.every((item) => item.status === ""));
  assert.doesNotMatch(JSON.stringify([exported.packet, exported.template, exported.reviewDocument]),
    /expectedStatus|answerKey|qualificationStatus|human-word-context|reluctant|pause before agreeing/iu);

  const completed = qualificationSubmission(exported.packet);
  const qualified = evaluateReviewerQualification(exported.packet, completed);
  assert.equal(qualified.qualificationStatus, "qualified");
  assert.equal(qualified.conformingAtomicCount, qualified.assessedAtomicCount);

  const incorrect = clone(completed) as unknown as {
    assessments: { caseId: string; rubricId: string; requirementId: string;
      status: "SATISFIED" | "OMITTED_OR_INCOMPLETE" | "EXPLICIT_CONFLICT" }[];
  };
  incorrect.assessments[0] = { ...incorrect.assessments[0]!, status: "SATISFIED" };
  const failed = evaluateReviewerQualification(exported.packet, incorrect);
  assert.equal(failed.qualificationStatus, "not_qualified");
  invalid(() => createQualifiedLocalizedSemanticAuditExport(source, "reviewer-qualified", failed,
    buildOfficialZhCnSemanticAuditLocalization(source.tasks)));
  invalid(() => createQualifiedLocalizedSemanticAuditExport(source, "another-reviewer", qualified,
    buildOfficialZhCnSemanticAuditLocalization(source.tasks)));
});

test("qualified localized export/import is full-task, strict, and fail-closed", async () => {
  const source = await pilot2Source();
  const definition = buildOfficialZhCnSemanticAuditLocalization(source.tasks);
  const localization = buildSemanticAuditLocalizationIdentity(source.tasks, definition);
  const qualificationExport = createReviewerQualificationExport("reviewer-qualified", localization);
  const qualification = evaluateReviewerQualification(qualificationExport.packet,
    qualificationSubmission(qualificationExport.packet));
  const exported = createQualifiedLocalizedSemanticAuditExport(source, "reviewer-qualified", qualification, definition);
  assert.equal(exported.packet.localizedTasks.length, 6);
  assert.equal(exported.template.annotations.length, 24);
  assert.equal(exported.packet.reviewerQualification.qualificationStatus, "qualified");
  assert.equal(exported.packet.localization.locale, "zh-CN");
  const submission = completedAuditSubmission(exported.packet);
  const audit = importQualifiedLocalizedSemanticAuditSubmission(exported.packet, submission, qualification);
  assert.equal(audit.annotations.length, 24);
  assert.equal(audit.reviewLocale, "zh-CN");
  assert.equal(audit.instructionsClear, true);

  const packetMutations = [
    (value: Record<string, unknown>) => { value.judgeResult = {}; },
    (value: Record<string, unknown>) => {
      value.localization = { ...(value.localization as object), localizedPresentationFingerprint: `sha256:${"0".repeat(64)}` };
    },
  ];
  for (const mutate of packetMutations) {
    const candidate = clone(exported.packet) as unknown as Record<string, unknown>;
    mutate(candidate);
    invalid(() => parseHumanReferenceQualifiedSemanticAuditPacket(candidate));
  }

  const mutations = [
    (value: Record<string, unknown>) => { value.reviewerId = "other-reviewer"; },
    (value: Record<string, unknown>) => { value.reviewLocale = "en"; },
    (value: Record<string, unknown>) => { value.expectedStatus = "SATISFIED"; },
    (value: Record<string, unknown>) => { value.sourceCalibration = { ...(value.sourceCalibration as object), batchId: "other-pilot" }; },
    (value: Record<string, unknown>) => { value.reviewerQualification = { ...(value.reviewerQualification as object), qualificationResultFingerprint: `sha256:${"f".repeat(64)}` }; },
  ];
  for (const mutate of mutations) {
    const candidate = clone(submission) as unknown as Record<string, unknown>;
    mutate(candidate);
    invalid(() => importQualifiedLocalizedSemanticAuditSubmission(exported.packet, candidate, qualification));
  }
  const missing = { ...clone(submission), annotations: submission.annotations.slice(1) };
  invalid(() => importQualifiedLocalizedSemanticAuditSubmission(exported.packet, missing, qualification));
  const duplicate = { ...clone(submission), annotations: [...submission.annotations, submission.annotations[0]!] };
  invalid(() => importQualifiedLocalizedSemanticAuditSubmission(exported.packet, duplicate, qualification));
  const extra = { ...clone(submission), annotations: [...submission.annotations,
    { ...submission.annotations[0]!, requirementId: "EXTRA" }] };
  invalid(() => importQualifiedLocalizedSemanticAuditSubmission(exported.packet, extra, qualification));
  const wrongOwner = { ...clone(submission), annotations: submission.annotations.map((item, index) =>
    index === 0 ? { ...item, rubricId: "other-rubric" } : item) };
  invalid(() => importQualifiedLocalizedSemanticAuditSubmission(exported.packet, wrongOwner, qualification));
  const wrongQualification = { ...clone(qualification), reviewerId: "another-reviewer" };
  invalid(() => importQualifiedLocalizedSemanticAuditSubmission(exported.packet, submission, wrongQualification));
});

test("qualified comparison preserves directional semantics and frozen inputs without providers", async () => {
  const source = await pilot2Source();
  const before = clone(source);
  const definition = buildOfficialZhCnSemanticAuditLocalization(source.tasks);
  const localization = buildSemanticAuditLocalizationIdentity(source.tasks, definition);
  const qualificationExport = createReviewerQualificationExport("reviewer-qualified", localization);
  const qualification = evaluateReviewerQualification(qualificationExport.packet,
    qualificationSubmission(qualificationExport.packet));
  const exported = createQualifiedLocalizedSemanticAuditExport(source, "reviewer-qualified", qualification, definition);
  const audit = importQualifiedLocalizedSemanticAuditSubmission(exported.packet,
    completedAuditSubmission(exported.packet), qualification);
  const adjudications: HumanReferenceAdjudicationFile = parseHumanReferenceAdjudicationFile({
    schemaVersion: 1,
    calibrationProtocolId: "human-reference-material-calibration",
    calibrationProtocolVersion: "0.1.0",
    dataKind: "synthetic-fixture",
    fixture: { synthetic: true, notHumanCalibrationData: true },
    adjudications: [],
  });
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (() => { throw new Error("provider call prohibited"); }) as typeof fetch;
  try {
    const report = buildQualifiedLocalizedSemanticAuditReport(source, adjudications, audit, qualification);
    assert.equal(report.reportKind, "human-reference-semantic-audit-qualified-report");
    assert.equal(report.qualificationStatus, "qualified");
    assert.equal(report.qualificationCompleted, true);
    assert.equal(report.comparableAtomicCount, 24);
    assert.equal(report.semanticAuditAgreement.confusionMatrix.SATISFIED.SATISFIED, 24);
    assert.equal(report.semanticAuditAgreement.disagreements.length, 0);
    assert.equal("accuracy" in report, false);
    assert.equal("semanticAuditAgreement" in report, true);
    assert.equal(report.perCase.length, 6);
    assert.equal(Object.keys(report.perRequirement).length, 4);
  } finally { globalThis.fetch = originalFetch; }
  assert.deepEqual(source, before);
});

test("generic functions cover an arbitrary source task set without count or ID assumptions", async () => {
  const raw = JSON.parse(await readFile(resolve("fixtures/human-reference-calibration/synthetic-annotations.json"),
    "utf8")) as HumanReferenceAnnotationFile;
  const task = raw.tasks[0]!;
  const annotations = parseHumanReferenceAnnotationFile({
    ...raw,
    tasks: [task],
    annotations: raw.annotations.filter((item) => item.caseId === task.caseId),
  });
  const localizedTask = { ...task, learningObjective: `本地化：${task.learningObjective}` };
  const definition: HumanReferenceSemanticAuditLocalizationDefinition = {
    identity: {
      locale: "zh-CN",
      localizationId: "human-reference-semantic-audit-localization-zh-CN",
      localizationVersion: "0.1.0",
      sourceAnnotationGuide: { id: "human-reference-material-annotation-guide", version: "0.2.0",
        fingerprint: "sha256:dcf8ebba67250311a134788919984f13777a51516cb6294ed4c24742be65ff3a" },
      localizedAnnotationGuide: { id: "human-reference-material-annotation-guide-zh-CN", version: "0.1.0",
        fingerprint: `sha256:${createHash("sha256").update("generic guide").digest("hex")}` },
    },
    localizedGuide: "generic guide",
    localizedTasks: [localizedTask],
  };
  const localization = buildSemanticAuditLocalizationIdentity(annotations.tasks, definition);
  const qualificationExport = createReviewerQualificationExport("reviewer-generic", localization);
  const qualification = evaluateReviewerQualification(qualificationExport.packet,
    qualificationSubmission(qualificationExport.packet));
  const exported = createQualifiedLocalizedSemanticAuditExport(annotations, "reviewer-generic", qualification, definition);
  assert.equal(exported.packet.localizedTasks.length, 1);
  assert.equal(exported.template.annotations.length, task.rubrics[0]!.requirements.length);
});

test("strict parsers reject hidden qualification fields and CLI routes all @0.2.0 lifecycle commands", async () => {
  const source = await pilot2Source();
  const localization = buildSemanticAuditLocalizationIdentity(source.tasks,
    buildOfficialZhCnSemanticAuditLocalization(source.tasks));
  const exported = createReviewerQualificationExport("reviewer-qualified", localization);
  const hidden = { ...clone(exported.packet), answerKey: [] };
  invalid(() => parseReviewerQualificationPacket(hidden));

  for (const args of [
    ["human-reference-semantic-audit-qualification-export", "--annotations", "a.json", "--reviewer", "reviewer-x", "--output-dir", "out"],
    ["human-reference-semantic-audit-qualification-import", "--packet", "p.json", "--submission", "s.json", "--output", "r.json"],
    ["human-reference-semantic-audit-localized-export", "--annotations", "a.json", "--reviewer", "reviewer-x", "--qualification", "q.json", "--output-dir", "out"],
    ["human-reference-semantic-audit-localized-import", "--packet", "p.json", "--submission", "s.json", "--qualification", "q.json", "--output", "a.json"],
    ["human-reference-semantic-audit-localized", "--annotations", "a.json", "--adjudications", "j.json", "--audit", "x.json", "--qualification", "q.json", "--output", "r.json"],
  ]) {
    const parsed = parseTutorbenchArgs(args);
    assert.equal(parsed.help, false);
    assert.ok(!parsed.help && "humanReferenceSemanticAuditV2" in parsed);
  }
});

test("Pilot and guide source bytes plus Material Requirement Judge @0.4 remain frozen", async () => {
  const source = await pilot2Source();
  assert.equal(buildSemanticAuditLocalizationIdentity(source.tasks,
    buildOfficialZhCnSemanticAuditLocalization(source.tasks)).sourceTaskFingerprint,
  "sha256:2e73aa96062b00908fe9f329e744cf91cb3f127865bce02ea33356069bb09285");
  assert.equal(createHash("sha256").update(HUMAN_REFERENCE_PILOT_BOUNDARY_ANNOTATION_GUIDE).digest("hex"),
    "dcf8ebba67250311a134788919984f13777a51516cb6294ed4c24742be65ff3a");
  assert.equal(MATERIAL_REQUIREMENT_JUDGE_PROMPT_VERSION, "0.4");
  assert.ok((await loadMaterialRequirementJudgePrompt()).length > 0);
  const canonicalJudgePromptBytes = (await readFile(
    resolve("prompts/tutor-eval-material-requirement-judge-system-v0.4.md"), "utf8",
  )).replace(/\r\n/gu, "\n");
  assert.equal(createHash("sha256").update(canonicalJudgePromptBytes).digest("hex"),
    "f39ce3a005a609beae05d6dfab1036132d8d5f43732b840df4238f857aa677ac");
});

test("@0.2.0 CLI completes the provider-free qualification and localized audit lifecycle", async () => {
  const directory = await mkdtemp(join(tmpdir(), "tutorbench-qualified-audit-"));
  try {
    const source = await pilot2Source();
    const annotationsPath = join(directory, "annotations.json");
    const adjudicationsPath = join(directory, "adjudications.json");
    const qualificationDirectory = join(directory, "qualification");
    const auditDirectory = join(directory, "audit");
    const adjudications = {
      schemaVersion: 1,
      calibrationProtocolId: "human-reference-material-calibration",
      calibrationProtocolVersion: "0.1.0",
      dataKind: "synthetic-fixture",
      fixture: { synthetic: true, notHumanCalibrationData: true },
      adjudications: [],
    };
    await Promise.all([
      writeFile(annotationsPath, JSON.stringify(source), "utf8"),
      writeFile(adjudicationsPath, JSON.stringify(adjudications), "utf8"),
    ]);
    const { main } = await import("../src/cli/tutorbench.js");
    await main(["human-reference-semantic-audit-qualification-export", "--annotations", annotationsPath,
      "--reviewer", "reviewer-cli", "--output-dir", qualificationDirectory]);
    const qualificationPacketPath = join(qualificationDirectory, "reviewer-cli.qualification.packet.json");
    const qualificationPacket = parseReviewerQualificationPacket(JSON.parse(
      await readFile(qualificationPacketPath, "utf8"),
    ));
    const qualificationSubmissionPath = join(qualificationDirectory, "reviewer-cli.qualification.completed.json");
    await writeFile(qualificationSubmissionPath, JSON.stringify(qualificationSubmission(qualificationPacket)), "utf8");
    const qualificationResultPath = join(qualificationDirectory, "reviewer-cli.qualification.result.json");
    await main(["human-reference-semantic-audit-qualification-import", "--packet", qualificationPacketPath,
      "--submission", qualificationSubmissionPath, "--output", qualificationResultPath]);

    await main(["human-reference-semantic-audit-localized-export", "--annotations", annotationsPath,
      "--reviewer", "reviewer-cli", "--qualification", qualificationResultPath,
      "--output-dir", auditDirectory]);
    const auditPacketPath = join(auditDirectory, "reviewer-cli.localized.packet.json");
    const auditPacket = parseHumanReferenceQualifiedSemanticAuditPacket(JSON.parse(
      await readFile(auditPacketPath, "utf8"),
    ));
    const auditSubmissionPath = join(auditDirectory, "reviewer-cli.localized.completed.json");
    await writeFile(auditSubmissionPath, JSON.stringify(completedAuditSubmission(auditPacket)), "utf8");
    const auditAnnotationsPath = join(auditDirectory, "reviewer-cli.localized.annotations.json");
    await main(["human-reference-semantic-audit-localized-import", "--packet", auditPacketPath,
      "--submission", auditSubmissionPath, "--qualification", qualificationResultPath,
      "--output", auditAnnotationsPath]);
    const reportPath = join(auditDirectory, "reviewer-cli.localized.report.json");
    await main(["human-reference-semantic-audit-localized", "--annotations", annotationsPath,
      "--adjudications", adjudicationsPath, "--audit", auditAnnotationsPath,
      "--qualification", qualificationResultPath, "--output", reportPath]);
    const report = JSON.parse(await readFile(reportPath, "utf8")) as Record<string, unknown>;
    assert.equal(report.qualificationStatus, "qualified");
    assert.equal(report.comparableAtomicCount, 24);
    assert.ok((await readFile(join(auditDirectory, "SEMANTIC_AUDIT_REVIEW.zh-CN.md"), "utf8")).length > 0);
    assert.ok((await readFile(join(qualificationDirectory, "ANNOTATION_GUIDE.zh-CN.md"), "utf8")).length > 0);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
