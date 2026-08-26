import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";

import {
  buildOfficialZhCnSemanticAuditLocalization,
  buildSemanticAuditLocalizationIdentity,
  createHumanReferencePilotExport,
  createQualifiedLocalizedSemanticAuditExportV21,
  createReviewerQualificationExport,
  createReviewerQualificationExportV21,
  evaluateReviewerQualification,
  evaluateReviewerQualificationV21,
  HUMAN_REFERENCE_PILOT_BOUNDARY_ANNOTATION_GUIDE,
  HUMAN_REFERENCE_PILOT_BOUNDARY_FIXTURE_ID,
  HUMAN_REFERENCE_SEMANTIC_AUDIT_V21_QUALIFICATION_DEFINITION_FINGERPRINT,
  HUMAN_REFERENCE_SEMANTIC_AUDIT_V21_QUALIFICATION_PRESENTATION_FINGERPRINT,
  HUMAN_REFERENCE_SEMANTIC_AUDIT_ZH_CN_LOCALIZED_GUIDE_FINGERPRINT,
  HUMAN_REFERENCE_SEMANTIC_AUDIT_ZH_CN_LOCALIZED_TASK_FINGERPRINT,
  HUMAN_REFERENCE_SEMANTIC_AUDIT_ZH_CN_PRESENTATION_FINGERPRINT,
} from "../src/calibration/index.js";
import {
  HUMAN_REFERENCE_SEMANTIC_AUDIT_QUALIFICATION_EXPECTED_ASSESSMENTS,
  HUMAN_REFERENCE_SEMANTIC_AUDIT_QUALIFICATION_ITEMS,
} from "../src/calibration/human-reference-semantic-audit-qualification-fixture.js";
import {
  buildReviewerQualificationDefinition,
  HUMAN_REFERENCE_SEMANTIC_AUDIT_V21_PROTOCOL_VERSION,
  HUMAN_REFERENCE_SEMANTIC_AUDIT_V21_QUALIFICATION_PASS_RULE,
  HUMAN_REFERENCE_SEMANTIC_AUDIT_V21_QUALIFICATION_VERSION,
  parseHumanReferenceAnnotationFile,
  parseReviewerQualificationResult,
  parseReviewerQualificationSubmission,
  parseReviewerQualificationSubmissionV21,
  qualificationDefinitionFingerprint,
  qualificationPresentationFingerprint,
  renderReviewerQualificationReview,
  type HumanAtomicAnnotation,
  type HumanReferenceAnnotationFile,
  type ReviewerQualificationPacket,
  type ReviewerQualificationPacketV21,
  type ReviewerQualificationSubmissionV21,
} from "../src/contracts/index.js";
import { BenchmarkConfigurationError } from "../src/contracts/errors.js";
import { MATERIAL_REQUIREMENT_JUDGE_PROMPT_VERSION, loadMaterialRequirementJudgePrompt } from "../src/judge/index.js";

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
      schemaVersion: 1 as const, caseId: task.caseId, rubricId: rubric.id,
      requirementId: requirement.id, annotatorId, status: "SATISFIED" as const,
    }))),
  ));
  return parseHumanReferenceAnnotationFile({ schemaVersion: 1, batchId: pilot.batchId,
    calibrationProtocolId: "human-reference-material-calibration", calibrationProtocolVersion: "0.1.0",
    dataKind: "synthetic-fixture", fixture: { synthetic: true, notHumanCalibrationData: true },
    requiredAnnotatorIds: ["annotator-a", "annotator-b"], tasks: pilot.tasks, annotations });
}

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

const qualificationDefinition = buildReviewerQualificationDefinition(
  HUMAN_REFERENCE_SEMANTIC_AUDIT_QUALIFICATION_ITEMS,
  HUMAN_REFERENCE_SEMANTIC_AUDIT_QUALIFICATION_EXPECTED_ASSESSMENTS,
);

function submissionV21(packet: ReviewerQualificationPacketV21): ReviewerQualificationSubmissionV21 {
  const { items, ...envelope } = packet;
  return parseReviewerQualificationSubmissionV21({ ...envelope,
    packetKind: "human-reference-semantic-audit-qualification-submission",
    assessments: items.flatMap((item) => item.requirements.map((requirement) => ({
      caseId: item.itemId, rubricId: item.itemId, requirementId: requirement.requirementId,
      status: statuses[`${item.itemId}/${requirement.requirementId}`],
    }))),
  });
}

function legacySubmission(packet: ReviewerQualificationPacket) {
  const { items, ...envelope } = packet;
  return parseReviewerQualificationSubmission({ ...envelope,
    packetKind: "human-reference-semantic-audit-qualification-submission",
    assessments: items.flatMap((item) => item.requirements.map((requirement) => ({
      caseId: item.itemId, rubricId: item.itemId, requirementId: requirement.requirementId,
      status: statuses[`${item.itemId}/${requirement.requirementId}`],
    }))),
  });
}

test("same visible qualification can no longer hide changed expected semantics", async () => {
  const source = await pilot2Source();
  const localization = buildSemanticAuditLocalizationIdentity(source.tasks,
    buildOfficialZhCnSemanticAuditLocalization(source.tasks));
  const original = createReviewerQualificationExportV21("reviewer-def", localization);
  const originalResult = evaluateReviewerQualificationV21(original.packet, submissionV21(original.packet));
  const mutatedExpected = HUMAN_REFERENCE_SEMANTIC_AUDIT_QUALIFICATION_EXPECTED_ASSESSMENTS.map((assessment, index) =>
    index === 0 ? { ...assessment, status: "SATISFIED" as const } : assessment);
  const mutatedDefinition = buildReviewerQualificationDefinition(
    HUMAN_REFERENCE_SEMANTIC_AUDIT_QUALIFICATION_ITEMS, mutatedExpected,
  );

  assert.equal(mutatedDefinition.qualificationPresentationFingerprint,
    qualificationDefinition.qualificationPresentationFingerprint);
  assert.equal(qualificationPresentationFingerprint(HUMAN_REFERENCE_SEMANTIC_AUDIT_QUALIFICATION_ITEMS),
    HUMAN_REFERENCE_SEMANTIC_AUDIT_V21_QUALIFICATION_PRESENTATION_FINGERPRINT);
  assert.notEqual(qualificationDefinitionFingerprint(mutatedDefinition),
    HUMAN_REFERENCE_SEMANTIC_AUDIT_V21_QUALIFICATION_DEFINITION_FINGERPRINT);
  invalid(() => evaluateReviewerQualificationV21(original.packet, submissionV21(original.packet), mutatedDefinition));
  invalid(() => createQualifiedLocalizedSemanticAuditExportV21(source, "reviewer-def",
    { ...originalResult, qualificationDefinitionFingerprint: qualificationDefinitionFingerprint(mutatedDefinition) },
    buildOfficialZhCnSemanticAuditLocalization(source.tasks)));
});

test("definition fingerprint is order-stable and binds the exact all-atomics pass rule", () => {
  const reversed = { ...qualificationDefinition,
    expectedAssessments: [...qualificationDefinition.expectedAssessments].reverse() };
  assert.equal(qualificationDefinitionFingerprint(reversed),
    HUMAN_REFERENCE_SEMANTIC_AUDIT_V21_QUALIFICATION_DEFINITION_FINGERPRINT);
  assert.equal(qualificationDefinition.passRule,
    HUMAN_REFERENCE_SEMANTIC_AUDIT_V21_QUALIFICATION_PASS_RULE);
  invalid(() => qualificationDefinitionFingerprint({ ...reversed,
    passRule: "percentage_threshold" as typeof HUMAN_REFERENCE_SEMANTIC_AUDIT_V21_QUALIFICATION_PASS_RULE }));
});

test("@0.2.1 result and audit binding carry both qualification fingerprints and fail closed", async () => {
  const source = await pilot2Source();
  const definition = buildOfficialZhCnSemanticAuditLocalization(source.tasks);
  const localization = buildSemanticAuditLocalizationIdentity(source.tasks, definition);
  const exported = createReviewerQualificationExportV21("reviewer-bound", localization);
  const submission = submissionV21(exported.packet);
  const result = evaluateReviewerQualificationV21(exported.packet, submission);
  assert.equal(result.auditProtocolVersion, HUMAN_REFERENCE_SEMANTIC_AUDIT_V21_PROTOCOL_VERSION);
  assert.equal(result.qualificationVersion, HUMAN_REFERENCE_SEMANTIC_AUDIT_V21_QUALIFICATION_VERSION);
  assert.equal(result.qualificationPresentationFingerprint,
    HUMAN_REFERENCE_SEMANTIC_AUDIT_V21_QUALIFICATION_PRESENTATION_FINGERPRINT);
  assert.equal(result.qualificationDefinitionFingerprint,
    HUMAN_REFERENCE_SEMANTIC_AUDIT_V21_QUALIFICATION_DEFINITION_FINGERPRINT);
  const audit = createQualifiedLocalizedSemanticAuditExportV21(source, "reviewer-bound", result, definition);
  assert.equal(audit.packet.reviewerQualification.qualificationDefinitionFingerprint,
    result.qualificationDefinitionFingerprint);

  for (const mutation of [
    { qualificationDefinitionFingerprint: `sha256:${"0".repeat(64)}` },
    { qualificationPresentationFingerprint: `sha256:${"1".repeat(64)}` },
    { reviewerId: "reviewer-other" },
    { qualificationBatchId: "stale-batch" },
    { resultFingerprint: `sha256:${"2".repeat(64)}` },
    { localization: { ...clone(result.localization), localizedTaskFingerprint: `sha256:${"3".repeat(64)}` } },
  ]) invalid(() => createQualifiedLocalizedSemanticAuditExportV21(source, "reviewer-bound",
    { ...clone(result), ...mutation }, definition));
  invalid(() => createQualifiedLocalizedSemanticAuditExportV21(source, "reviewer-bound",
    { ...clone(result), qualificationVersion: "0.1.0" }, definition));
});

test("reviewer-facing qualification artifacts contain no answer key or expected statuses", async () => {
  const source = await pilot2Source();
  const localization = buildSemanticAuditLocalizationIdentity(source.tasks,
    buildOfficialZhCnSemanticAuditLocalization(source.tasks));
  const exported = createReviewerQualificationExportV21("reviewer-blind", localization);
  const visible = JSON.stringify([exported.packet, exported.template, exported.reviewDocument]);
  assert.doesNotMatch(visible,
    /expectedStatus|expectedAssessments|answerKey|qualificationDefinition["':{]|conforming target/iu);
  for (const expected of HUMAN_REFERENCE_SEMANTIC_AUDIT_QUALIFICATION_EXPECTED_ASSESSMENTS) {
    assert.doesNotMatch(exported.reviewDocument, new RegExp(`expected.{0,20}${expected.status}`, "iu"));
  }
  assert.equal(exported.reviewDocument,
    renderReviewerQualificationReview(HUMAN_REFERENCE_SEMANTIC_AUDIT_QUALIFICATION_ITEMS));
});

test("historical @0.2.0 remains parseable without retrofitted definition provenance", async () => {
  const source = await pilot2Source();
  const localization = buildSemanticAuditLocalizationIdentity(source.tasks,
    buildOfficialZhCnSemanticAuditLocalization(source.tasks));
  const historical = createReviewerQualificationExport("reviewer-historical", localization);
  const result = evaluateReviewerQualification(historical.packet, legacySubmission(historical.packet));
  assert.equal(result.auditProtocolVersion, "0.2.0");
  assert.equal(result.qualificationVersion, "0.1.0");
  assert.equal("qualificationDefinitionFingerprint" in result, false);
  assert.equal(parseReviewerQualificationResult(result).resultFingerprint, result.resultFingerprint);
});

test("Pilot, guides, localized material, and Material Requirement Judge @0.4 stay frozen", async () => {
  const source = await pilot2Source();
  const identity = buildSemanticAuditLocalizationIdentity(source.tasks,
    buildOfficialZhCnSemanticAuditLocalization(source.tasks));
  assert.equal(identity.sourceTaskFingerprint,
    "sha256:2e73aa96062b00908fe9f329e744cf91cb3f127865bce02ea33356069bb09285");
  assert.equal(createHash("sha256").update(HUMAN_REFERENCE_PILOT_BOUNDARY_ANNOTATION_GUIDE).digest("hex"),
    "dcf8ebba67250311a134788919984f13777a51516cb6294ed4c24742be65ff3a");
  assert.equal(identity.localizedTaskFingerprint, HUMAN_REFERENCE_SEMANTIC_AUDIT_ZH_CN_LOCALIZED_TASK_FINGERPRINT);
  assert.equal(identity.localizedPresentationFingerprint, HUMAN_REFERENCE_SEMANTIC_AUDIT_ZH_CN_PRESENTATION_FINGERPRINT);
  assert.equal(identity.localizedAnnotationGuide.fingerprint,
    HUMAN_REFERENCE_SEMANTIC_AUDIT_ZH_CN_LOCALIZED_GUIDE_FINGERPRINT);
  assert.equal(MATERIAL_REQUIREMENT_JUDGE_PROMPT_VERSION, "0.4");
  assert.ok((await loadMaterialRequirementJudgePrompt()).length > 0);
});
