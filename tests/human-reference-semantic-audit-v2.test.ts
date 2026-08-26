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
  createQualifiedLocalizedSemanticAuditExportV21,
  createReviewerQualificationExport,
  createReviewerQualificationExportV21,
  evaluateReviewerQualification,
  evaluateReviewerQualificationV21,
  HUMAN_REFERENCE_PILOT_BOUNDARY_ANNOTATION_GUIDE,
  HUMAN_REFERENCE_PILOT_BOUNDARY_FIXTURE_ID,
  HUMAN_REFERENCE_SEMANTIC_AUDIT_PILOT_2_SOURCE_TASK_FINGERPRINT,
  HUMAN_REFERENCE_SEMANTIC_AUDIT_QUALIFICATION_FINGERPRINT,
  HUMAN_REFERENCE_SEMANTIC_AUDIT_V21_QUALIFICATION_DEFINITION_FINGERPRINT,
  HUMAN_REFERENCE_SEMANTIC_AUDIT_V21_QUALIFICATION_PRESENTATION_FINGERPRINT,
  HUMAN_REFERENCE_SEMANTIC_AUDIT_ZH_CN_GUIDE,
  HUMAN_REFERENCE_SEMANTIC_AUDIT_ZH_CN_LOCALIZED_GUIDE_FINGERPRINT,
  HUMAN_REFERENCE_SEMANTIC_AUDIT_ZH_CN_LOCALIZED_TASK_FINGERPRINT,
  HUMAN_REFERENCE_SEMANTIC_AUDIT_ZH_CN_PRESENTATION_FINGERPRINT,
  importQualifiedLocalizedSemanticAuditSubmission,
  importQualifiedLocalizedSemanticAuditSubmissionV21,
} from "../src/calibration/index.js";
import { parseTutorbenchArgs } from "../src/cli/tutorbench.js";
import {
  HUMAN_REFERENCE_SEMANTIC_AUDIT_V2_PROTOCOL_VERSION,
  parseHumanReferenceAdjudicationFile,
  parseHumanReferenceAnnotationFile,
  parseHumanReferenceQualifiedSemanticAuditPacket,
  parseHumanReferenceQualifiedSemanticAuditPacketV21,
  parseHumanReferenceQualifiedSemanticAuditSubmission,
  parseHumanReferenceQualifiedSemanticAuditSubmissionV21,
  parseReviewerQualificationPacket,
  parseReviewerQualificationPacketV21,
  parseReviewerQualificationSubmission,
  parseReviewerQualificationSubmissionV21,
  renderLocalizedSemanticAuditReview,
  type HumanAtomicAnnotation,
  type HumanReferenceAdjudicationFile,
  type HumanReferenceAnnotationFile,
  type HumanReferenceQualifiedSemanticAuditPacket,
  type HumanReferenceQualifiedSemanticAuditSubmission,
  type HumanReferenceQualifiedSemanticAuditPacketV21,
  type HumanReferenceQualifiedSemanticAuditSubmissionV21,
  type HumanReferenceSemanticAuditLocalizationDefinition,
  type ReviewerQualificationPacket,
  type ReviewerQualificationSubmission,
  type ReviewerQualificationPacketV21,
  type ReviewerQualificationSubmissionV21,
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

function qualificationSubmissionV21(packet: ReviewerQualificationPacketV21): ReviewerQualificationSubmissionV21 {
  const { items, ...envelope } = packet;
  const historical = qualificationSubmission({ ...envelope,
    auditProtocolVersion: "0.2.0", qualificationVersion: "0.1.0",
    qualificationFingerprint: packet.qualificationPresentationFingerprint, items } as ReviewerQualificationPacket);
  return parseReviewerQualificationSubmissionV21({ ...envelope,
    packetKind: "human-reference-semantic-audit-qualification-submission",
    assessments: historical.assessments,
  });
}

function completedAuditSubmissionV21(
  packet: HumanReferenceQualifiedSemanticAuditPacketV21,
): HumanReferenceQualifiedSemanticAuditSubmissionV21 {
  return parseHumanReferenceQualifiedSemanticAuditSubmissionV21({
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
        caseId: task.caseId, rubricId: rubric.id, requirementId: requirement.id, status: "SATISFIED",
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

test("strict @0.2.0 parsers reject hidden qualification fields and CLI routes lifecycle commands", async () => {
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
  const identity = buildSemanticAuditLocalizationIdentity(source.tasks,
    buildOfficialZhCnSemanticAuditLocalization(source.tasks));
  assert.equal(identity.sourceTaskFingerprint,
    "sha256:2e73aa96062b00908fe9f329e744cf91cb3f127865bce02ea33356069bb09285");
  assert.equal(createHash("sha256").update(HUMAN_REFERENCE_PILOT_BOUNDARY_ANNOTATION_GUIDE).digest("hex"),
    "dcf8ebba67250311a134788919984f13777a51516cb6294ed4c24742be65ff3a");
  assert.equal(identity.localizedTaskFingerprint,
    "sha256:c8d5343fc1d41d42c1d1ad928967dd44de03afd8fc5fcc1dbc6328edabb53a18");
  assert.equal(identity.localizedPresentationFingerprint,
    "sha256:e92fbc2182bfc544b2499e17673b9e1c2cf902eab8dc555388b6ee6fb3e1f661");
  assert.equal(identity.localizedAnnotationGuide.fingerprint,
    "sha256:346a18d21cfdf6989081456481cdce7d257060c7ff8f1ff9d4e1d2a4f94d624f");
  assert.equal(HUMAN_REFERENCE_SEMANTIC_AUDIT_V21_QUALIFICATION_PRESENTATION_FINGERPRINT,
    "sha256:65f43e191a04301ef83b796af5395ffb46f3a6ae143bf4ea983d8a2439cdb291");
  assert.equal(HUMAN_REFERENCE_SEMANTIC_AUDIT_V21_QUALIFICATION_DEFINITION_FINGERPRINT,
    "sha256:3a86b044b7f7f5d06536092e649095512a7e983bb94a899d175b0dd77ba9dec7");
  assert.equal(MATERIAL_REQUIREMENT_JUDGE_PROMPT_VERSION, "0.4");
  assert.ok((await loadMaterialRequirementJudgePrompt()).length > 0);
  const canonicalJudgePromptBytes = (await readFile(
    resolve("prompts/tutor-eval-material-requirement-judge-system-v0.4.md"), "utf8",
  )).replace(/\r\n/gu, "\n");
  assert.equal(createHash("sha256").update(canonicalJudgePromptBytes).digest("hex"),
    "f39ce3a005a609beae05d6dfab1036132d8d5f43732b840df4238f857aa677ac");
});

test("@0.2.1 CLI completes the provider-free qualification and localized audit lifecycle", async () => {
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
    const qualificationPacket = parseReviewerQualificationPacketV21(JSON.parse(
      await readFile(qualificationPacketPath, "utf8"),
    ));
    const qualificationSubmissionPath = join(qualificationDirectory, "reviewer-cli.qualification.completed.json");
    await writeFile(qualificationSubmissionPath, JSON.stringify(qualificationSubmissionV21(qualificationPacket)), "utf8");
    const qualificationResultPath = join(qualificationDirectory, "reviewer-cli.qualification.result.json");
    await main(["human-reference-semantic-audit-qualification-import", "--packet", qualificationPacketPath,
      "--submission", qualificationSubmissionPath, "--output", qualificationResultPath]);

    await main(["human-reference-semantic-audit-localized-export", "--annotations", annotationsPath,
      "--reviewer", "reviewer-cli", "--qualification", qualificationResultPath,
      "--output-dir", auditDirectory]);
    const auditPacketPath = join(auditDirectory, "reviewer-cli.localized.packet.json");
    const auditPacket = parseHumanReferenceQualifiedSemanticAuditPacketV21(JSON.parse(
      await readFile(auditPacketPath, "utf8"),
    ));
    const auditSubmissionPath = join(auditDirectory, "reviewer-cli.localized.completed.json");
    await writeFile(auditSubmissionPath, JSON.stringify(completedAuditSubmissionV21(auditPacket)), "utf8");
    const auditAnnotationsPath = join(auditDirectory, "reviewer-cli.localized.annotations.json");
    await main(["human-reference-semantic-audit-localized-import", "--packet", auditPacketPath,
      "--submission", auditSubmissionPath, "--qualification", qualificationResultPath,
      "--output", auditAnnotationsPath]);
    const reportPath = join(auditDirectory, "reviewer-cli.localized.report.json");
    await main(["human-reference-semantic-audit-localized", "--annotations", annotationsPath,
      "--adjudications", adjudicationsPath, "--audit", auditAnnotationsPath,
      "--qualification", qualificationResultPath, "--output", reportPath]);
    const report = JSON.parse(await readFile(reportPath, "utf8")) as Record<string, unknown>;
    assert.equal(report.auditProtocolVersion, "0.2.1");
    assert.equal(report.qualificationStatus, "qualified");
    const reportQualification = report.reviewerQualification as Record<string, unknown>;
    assert.equal(reportQualification.qualificationDefinitionFingerprint,
      HUMAN_REFERENCE_SEMANTIC_AUDIT_V21_QUALIFICATION_DEFINITION_FINGERPRINT);
    const persistedQualification = JSON.parse(await readFile(qualificationResultPath, "utf8")) as Record<string, unknown>;
    assert.equal(persistedQualification.auditProtocolVersion, "0.2.1");
    assert.equal(persistedQualification.qualificationVersion, "0.1.1");
    assert.equal(typeof persistedQualification.qualificationDefinitionFingerprint, "string");
    assert.equal(report.comparableAtomicCount, 24);
    assert.ok((await readFile(join(auditDirectory, "SEMANTIC_AUDIT_REVIEW.zh-CN.md"), "utf8")).length > 0);
    assert.ok((await readFile(join(qualificationDirectory, "ANNOTATION_GUIDE.zh-CN.md"), "utf8")).length > 0);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("current CLI preserves the historical @0.2.0 qualification and localized lifecycle", async () => {
  const directory = await mkdtemp(join(tmpdir(), "tutorbench-qualified-audit-v20-"));
  try {
    const source = await pilot2Source();
    const definition = buildOfficialZhCnSemanticAuditLocalization(source.tasks);
    const localization = buildSemanticAuditLocalizationIdentity(source.tasks, definition);
    const qualificationExport = createReviewerQualificationExport("reviewer-historical-cli", localization);
    const qualificationSubmissionValue = qualificationSubmission(qualificationExport.packet);
    const annotationsPath = join(directory, "annotations.json");
    const adjudicationsPath = join(directory, "adjudications.json");
    const qualificationPacketPath = join(directory, "qualification.packet.json");
    const qualificationSubmissionPath = join(directory, "qualification.completed.json");
    const qualificationResultPath = join(directory, "qualification.result.json");
    const auditDirectory = join(directory, "audit");
    await Promise.all([
      writeFile(annotationsPath, JSON.stringify(source), "utf8"),
      writeFile(adjudicationsPath, JSON.stringify({ schemaVersion: 1,
        calibrationProtocolId: "human-reference-material-calibration", calibrationProtocolVersion: "0.1.0",
        dataKind: "synthetic-fixture", fixture: { synthetic: true, notHumanCalibrationData: true },
        adjudications: [] }), "utf8"),
      writeFile(qualificationPacketPath, JSON.stringify(qualificationExport.packet), "utf8"),
      writeFile(qualificationSubmissionPath, JSON.stringify(qualificationSubmissionValue), "utf8"),
    ]);
    const { main } = await import("../src/cli/tutorbench.js");
    await main(["human-reference-semantic-audit-qualification-import", "--packet", qualificationPacketPath,
      "--submission", qualificationSubmissionPath, "--output", qualificationResultPath]);
    const qualification = JSON.parse(await readFile(qualificationResultPath, "utf8")) as Record<string, unknown>;
    assert.equal(qualification.auditProtocolVersion, "0.2.0");
    assert.equal(qualification.qualificationVersion, "0.1.0");
    assert.equal("qualificationDefinitionFingerprint" in qualification, false);

    await main(["human-reference-semantic-audit-localized-export", "--annotations", annotationsPath,
      "--reviewer", "reviewer-historical-cli", "--qualification", qualificationResultPath,
      "--output-dir", auditDirectory]);
    const auditPacketPath = join(auditDirectory, "reviewer-historical-cli.localized.packet.json");
    const auditPacket = parseHumanReferenceQualifiedSemanticAuditPacket(JSON.parse(
      await readFile(auditPacketPath, "utf8"),
    ));
    assert.equal(auditPacket.auditProtocolVersion, "0.2.0");
    const auditSubmissionPath = join(directory, "audit.completed.json");
    await writeFile(auditSubmissionPath, JSON.stringify(completedAuditSubmission(auditPacket)), "utf8");
    const auditAnnotationsPath = join(directory, "audit.annotations.json");
    await main(["human-reference-semantic-audit-localized-import", "--packet", auditPacketPath,
      "--submission", auditSubmissionPath, "--qualification", qualificationResultPath,
      "--output", auditAnnotationsPath]);
    const persistedAudit = JSON.parse(await readFile(auditAnnotationsPath, "utf8")) as Record<string, unknown>;
    assert.equal(persistedAudit.auditProtocolVersion, "0.2.0");
    assert.equal(JSON.stringify(persistedAudit).includes("qualificationDefinitionFingerprint"), false);

    const reportPath = join(directory, "audit.report.json");
    await main(["human-reference-semantic-audit-localized", "--annotations", annotationsPath,
      "--adjudications", adjudicationsPath, "--audit", auditAnnotationsPath,
      "--qualification", qualificationResultPath, "--output", reportPath]);
    const report = JSON.parse(await readFile(reportPath, "utf8")) as Record<string, unknown>;
    assert.equal(report.auditProtocolVersion, "0.2.0");
    assert.equal(report.qualificationStatus, "qualified");
    assert.equal(report.comparableAtomicCount, 24);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("CLI version dispatch rejects invalid envelopes, tampering, and cross-version artifacts", async () => {
  const directory = await mkdtemp(join(tmpdir(), "tutorbench-audit-dispatch-invalid-"));
  try {
    const source = await pilot2Source();
    const definition = buildOfficialZhCnSemanticAuditLocalization(source.tasks);
    const localization = buildSemanticAuditLocalizationIdentity(source.tasks, definition);
    const v20Export = createReviewerQualificationExport("reviewer-cross", localization);
    const v20Submission = qualificationSubmission(v20Export.packet);
    const v20Result = evaluateReviewerQualification(v20Export.packet, v20Submission);
    const v21Export = createReviewerQualificationExportV21("reviewer-cross", localization);
    const v21Submission = qualificationSubmissionV21(v21Export.packet);
    const v21Result = evaluateReviewerQualificationV21(v21Export.packet, v21Submission);
    const v20AuditExport = createQualifiedLocalizedSemanticAuditExport(
      source, "reviewer-cross", v20Result, definition,
    );
    const v20Audit = importQualifiedLocalizedSemanticAuditSubmission(
      v20AuditExport.packet, completedAuditSubmission(v20AuditExport.packet), v20Result,
    );
    const v20AuditSubmission = completedAuditSubmission(v20AuditExport.packet);
    const v21AuditExport = createQualifiedLocalizedSemanticAuditExportV21(
      source, "reviewer-cross", v21Result, definition,
    );
    const v21Audit = importQualifiedLocalizedSemanticAuditSubmissionV21(
      v21AuditExport.packet, completedAuditSubmissionV21(v21AuditExport.packet), v21Result,
    );
    const v21AuditSubmission = completedAuditSubmissionV21(v21AuditExport.packet);
    const paths = new Map<string, string>();
    const persist = async (name: string, value: unknown): Promise<string> => {
      const path = join(directory, `${name}.json`);
      await writeFile(path, typeof value === "string" ? value : JSON.stringify(value), "utf8");
      paths.set(name, path);
      return path;
    };
    await Promise.all([
      persist("v20-packet", v20Export.packet), persist("v20-submission", v20Submission),
      persist("v20-result", v20Result), persist("v20-audit", v20Audit),
      persist("v20-audit-packet", v20AuditExport.packet), persist("v20-audit-submission", v20AuditSubmission),
      persist("v21-packet", v21Export.packet), persist("v21-submission", v21Submission),
      persist("v21-result", v21Result), persist("v21-audit", v21Audit),
      persist("v21-audit-packet", v21AuditExport.packet), persist("v21-audit-submission", v21AuditSubmission),
      persist("unknown", { ...v20Export.packet, auditProtocolVersion: "9.9.9" }),
      persist("wrong-id", { ...v20Export.packet, auditProtocolId: "different-protocol" }),
      persist("missing-version", { auditProtocolId: "human-reference-semantic-audit" }),
      persist("malformed-json", "{stale"),
      persist("tampered", { ...v21Export.packet, auditProtocolVersion: "0.2.0" }),
      persist("annotations", source),
      persist("adjudications", { schemaVersion: 1, calibrationProtocolId: "human-reference-material-calibration",
        calibrationProtocolVersion: "0.1.0", dataKind: "synthetic-fixture",
        fixture: { synthetic: true, notHumanCalibrationData: true }, adjudications: [] }),
    ]);
    const path = (name: string): string => paths.get(name)!;
    const { main } = await import("../src/cli/tutorbench.js");
    const invalidCli = async (args: readonly string[]): Promise<void> => {
      await assert.rejects(main([...args]), (error: unknown) => error instanceof BenchmarkConfigurationError &&
        error.code === "human_reference_semantic_audit_invalid");
    };
    for (const packet of ["unknown", "wrong-id", "missing-version", "malformed-json", "tampered"]) {
      await invalidCli(["human-reference-semantic-audit-qualification-import", "--packet", path(packet),
        "--submission", path("v20-submission"), "--output", join(directory, `${packet}.result.json`)]);
    }
    await invalidCli(["human-reference-semantic-audit-qualification-import", "--packet", path("v20-packet"),
      "--submission", path("v21-submission"), "--output", join(directory, "cross-20-21.json")]);
    await invalidCli(["human-reference-semantic-audit-qualification-import", "--packet", path("v21-packet"),
      "--submission", path("v20-submission"), "--output", join(directory, "cross-21-20.json")]);
    await invalidCli(["human-reference-semantic-audit-localized-import", "--packet", path("v20-audit-packet"),
      "--submission", path("v21-audit-submission"), "--qualification", path("v20-result"),
      "--output", join(directory, "audit-packet20-submission21.json")]);
    await invalidCli(["human-reference-semantic-audit-localized-import", "--packet", path("v21-audit-packet"),
      "--submission", path("v20-audit-submission"), "--qualification", path("v21-result"),
      "--output", join(directory, "audit-packet21-submission20.json")]);
    await invalidCli(["human-reference-semantic-audit-localized", "--annotations", path("annotations"),
      "--adjudications", path("adjudications"), "--audit", path("v20-audit"),
      "--qualification", path("v21-result"), "--output", join(directory, "audit20-qual21.json")]);
    await invalidCli(["human-reference-semantic-audit-localized", "--annotations", path("annotations"),
      "--adjudications", path("adjudications"), "--audit", path("v21-audit"),
      "--qualification", path("v20-result"), "--output", join(directory, "audit21-qual20.json")]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
