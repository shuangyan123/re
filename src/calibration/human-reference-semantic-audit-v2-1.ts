import { createHash } from "node:crypto";

import { BenchmarkConfigurationError } from "../contracts/errors.js";
import {
  HUMAN_REFERENCE_PROTOCOL_ID,
  HUMAN_REFERENCE_PROTOCOL_VERSION,
  type HumanReferenceAdjudicationFile,
  type HumanReferenceAnnotationFile,
} from "../contracts/human-reference-calibration.js";
import { parseHumanReferenceAnnotationFile } from "../contracts/human-reference-calibration-validation.js";
import {
  HUMAN_REFERENCE_SEMANTIC_AUDIT_ANNOTATIONS_KIND,
  HUMAN_REFERENCE_SEMANTIC_AUDIT_PROTOCOL_ID,
  HUMAN_REFERENCE_SEMANTIC_AUDIT_PROTOCOL_VERSION,
  HUMAN_REFERENCE_SEMANTIC_AUDIT_SCHEMA_VERSION,
  type HumanReferenceSemanticAuditAnnotations,
} from "../contracts/human-reference-semantic-audit.js";
import {
  HUMAN_REFERENCE_SEMANTIC_AUDIT_V2_ANNOTATIONS_KIND,
  HUMAN_REFERENCE_SEMANTIC_AUDIT_V2_LOCALE,
  HUMAN_REFERENCE_SEMANTIC_AUDIT_V2_PACKET_KIND,
  HUMAN_REFERENCE_SEMANTIC_AUDIT_V2_PROTOCOL_ID,
  HUMAN_REFERENCE_SEMANTIC_AUDIT_V2_QUALIFICATION_ID,
  HUMAN_REFERENCE_SEMANTIC_AUDIT_V2_QUALIFICATION_PACKET_KIND,
  HUMAN_REFERENCE_SEMANTIC_AUDIT_V2_QUALIFICATION_RESULT_KIND,
  HUMAN_REFERENCE_SEMANTIC_AUDIT_V2_QUALIFICATION_SUBMISSION_KIND,
  HUMAN_REFERENCE_SEMANTIC_AUDIT_V2_REPORT_KIND,
  HUMAN_REFERENCE_SEMANTIC_AUDIT_V2_SCHEMA_VERSION,
  HUMAN_REFERENCE_SEMANTIC_AUDIT_V2_SUBMISSION_KIND,
  type HumanReferenceSemanticAuditLocalizationDefinition,
  type HumanReferenceSemanticAuditLocalizationIdentity,
  type ReviewerQualificationAtomicAssessment,
} from "../contracts/human-reference-semantic-audit-v2.js";
import {
  HUMAN_REFERENCE_SEMANTIC_AUDIT_V21_PROTOCOL_VERSION,
  HUMAN_REFERENCE_SEMANTIC_AUDIT_V21_QUALIFICATION_VERSION,
  type HumanReferenceQualifiedSemanticAuditAnnotationsV21,
  type HumanReferenceQualifiedSemanticAuditPacketV21,
  type HumanReferenceQualifiedSemanticAuditReportV21,
  type HumanReferenceQualifiedSemanticAuditSubmissionTemplateV21,
  type ReviewerQualificationBindingV21,
  type ReviewerQualificationDefinition,
  type ReviewerQualificationPacketV21,
  type ReviewerQualificationResultV21,
  type ReviewerQualificationSubmissionTemplateV21,
} from "../contracts/human-reference-semantic-audit-v2-1.js";
import {
  buildReviewerQualificationDefinition,
  qualificationDefinitionFingerprint,
  qualificationPresentationFingerprint,
} from "../contracts/human-reference-semantic-audit-v2-1-provenance.js";
import {
  parseHumanReferenceQualifiedSemanticAuditAnnotationsV21,
  parseHumanReferenceQualifiedSemanticAuditPacketV21,
  parseHumanReferenceQualifiedSemanticAuditSubmissionV21,
  parseReviewerQualificationPacketV21,
  parseReviewerQualificationResultV21,
  parseReviewerQualificationSubmissionV21,
} from "../contracts/human-reference-semantic-audit-v2-1-validation.js";
import {
  renderLocalizedSemanticAuditReview,
  renderReviewerQualificationReview,
} from "../contracts/human-reference-semantic-audit-v2-presentation.js";
import { humanAtomicIdentityKey } from "./human-reference-agreement.js";
import {
  HUMAN_REFERENCE_SEMANTIC_AUDIT_QUALIFICATION_EXPECTED_ASSESSMENTS,
  HUMAN_REFERENCE_SEMANTIC_AUDIT_QUALIFICATION_ITEMS,
} from "./human-reference-semantic-audit-qualification-fixture.js";
import {
  buildOfficialZhCnSemanticAuditLocalization,
  buildSemanticAuditLocalizationIdentity,
} from "./human-reference-semantic-audit-v2.js";
import { buildHumanReferenceSemanticAuditReport } from "./human-reference-semantic-audit.js";

function invalid(): never {
  throw new BenchmarkConfigurationError("human_reference_semantic_audit_invalid");
}

function hash(value: string): string {
  return `sha256:${createHash("sha256").update(value, "utf8").digest("hex")}`;
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (typeof value === "object" && value !== null) {
    return `{${Object.entries(value).sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function same(left: unknown, right: unknown): boolean {
  return canonicalJson(left) === canonicalJson(right);
}

function sortedAtoms(tasks: HumanReferenceQualifiedSemanticAuditPacketV21["localizedTasks"]) {
  return tasks.flatMap((task) => task.rubrics.flatMap((rubric) => rubric.requirements.map((requirement) => ({
    caseId: task.caseId, rubricId: rubric.id, requirementId: requirement.id,
  })))).sort((left, right) => humanAtomicIdentityKey(left).localeCompare(humanAtomicIdentityKey(right)));
}

const HUMAN_REFERENCE_SEMANTIC_AUDIT_V21_QUALIFICATION_DEFINITION =
  buildReviewerQualificationDefinition(
    HUMAN_REFERENCE_SEMANTIC_AUDIT_QUALIFICATION_ITEMS,
    HUMAN_REFERENCE_SEMANTIC_AUDIT_QUALIFICATION_EXPECTED_ASSESSMENTS,
  );

export const HUMAN_REFERENCE_SEMANTIC_AUDIT_V21_QUALIFICATION_PRESENTATION_FINGERPRINT =
  "sha256:65f43e191a04301ef83b796af5395ffb46f3a6ae143bf4ea983d8a2439cdb291" as const;
export const HUMAN_REFERENCE_SEMANTIC_AUDIT_V21_QUALIFICATION_DEFINITION_FINGERPRINT =
  "sha256:3a86b044b7f7f5d06536092e649095512a7e983bb94a899d175b0dd77ba9dec7" as const;

if (qualificationPresentationFingerprint(HUMAN_REFERENCE_SEMANTIC_AUDIT_QUALIFICATION_ITEMS) !==
    HUMAN_REFERENCE_SEMANTIC_AUDIT_V21_QUALIFICATION_PRESENTATION_FINGERPRINT ||
  qualificationDefinitionFingerprint(HUMAN_REFERENCE_SEMANTIC_AUDIT_V21_QUALIFICATION_DEFINITION) !==
    HUMAN_REFERENCE_SEMANTIC_AUDIT_V21_QUALIFICATION_DEFINITION_FINGERPRINT) invalid();

function resultFingerprint(value: Omit<ReviewerQualificationResultV21, "resultFingerprint">): string {
  return hash(`${canonicalJson(value)}\n`);
}

function assertDefinition(definition: ReviewerQualificationDefinition): string {
  const definitionFingerprint = qualificationDefinitionFingerprint(definition);
  if (definition.qualificationId !== HUMAN_REFERENCE_SEMANTIC_AUDIT_V2_QUALIFICATION_ID ||
    definition.qualificationVersion !== HUMAN_REFERENCE_SEMANTIC_AUDIT_V21_QUALIFICATION_VERSION ||
    definition.qualificationPresentationFingerprint !==
      HUMAN_REFERENCE_SEMANTIC_AUDIT_V21_QUALIFICATION_PRESENTATION_FINGERPRINT) return invalid();
  return definitionFingerprint;
}

export interface ReviewerQualificationExportV21 {
  readonly packet: ReviewerQualificationPacketV21;
  readonly template: ReviewerQualificationSubmissionTemplateV21;
  readonly reviewDocument: string;
}

export function createReviewerQualificationExportV21(
  reviewerId: string,
  localization: HumanReferenceSemanticAuditLocalizationIdentity,
  definition: ReviewerQualificationDefinition = HUMAN_REFERENCE_SEMANTIC_AUDIT_V21_QUALIFICATION_DEFINITION,
): ReviewerQualificationExportV21 {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/u.test(reviewerId) || reviewerId.includes("@")) return invalid();
  const definitionFingerprint = assertDefinition(definition);
  const presentationFingerprint = qualificationPresentationFingerprint(
    HUMAN_REFERENCE_SEMANTIC_AUDIT_QUALIFICATION_ITEMS,
  );
  const qualificationBatchId = `reviewer-qualification-${hash(JSON.stringify([
    reviewerId, localization, presentationFingerprint, definitionFingerprint,
  ])).slice("sha256:".length, "sha256:".length + 16)}`;
  const packet = parseReviewerQualificationPacketV21({
    schemaVersion: HUMAN_REFERENCE_SEMANTIC_AUDIT_V2_SCHEMA_VERSION,
    packetKind: HUMAN_REFERENCE_SEMANTIC_AUDIT_V2_QUALIFICATION_PACKET_KIND,
    auditProtocolId: HUMAN_REFERENCE_SEMANTIC_AUDIT_V2_PROTOCOL_ID,
    auditProtocolVersion: HUMAN_REFERENCE_SEMANTIC_AUDIT_V21_PROTOCOL_VERSION,
    reviewerId,
    qualificationId: HUMAN_REFERENCE_SEMANTIC_AUDIT_V2_QUALIFICATION_ID,
    qualificationVersion: HUMAN_REFERENCE_SEMANTIC_AUDIT_V21_QUALIFICATION_VERSION,
    qualificationBatchId,
    qualificationPresentationFingerprint: presentationFingerprint,
    qualificationDefinitionFingerprint: definitionFingerprint,
    localization,
    items: HUMAN_REFERENCE_SEMANTIC_AUDIT_QUALIFICATION_ITEMS,
  });
  const template: ReviewerQualificationSubmissionTemplateV21 = {
    schemaVersion: packet.schemaVersion,
    packetKind: HUMAN_REFERENCE_SEMANTIC_AUDIT_V2_QUALIFICATION_SUBMISSION_KIND,
    auditProtocolId: packet.auditProtocolId,
    auditProtocolVersion: packet.auditProtocolVersion,
    reviewerId: packet.reviewerId,
    qualificationId: packet.qualificationId,
    qualificationVersion: packet.qualificationVersion,
    qualificationBatchId: packet.qualificationBatchId,
    qualificationPresentationFingerprint: packet.qualificationPresentationFingerprint,
    qualificationDefinitionFingerprint: packet.qualificationDefinitionFingerprint,
    localization: packet.localization,
    assessments: packet.items.flatMap((item) => item.requirements.map((requirement) => ({
      caseId: item.itemId, rubricId: item.itemId, requirementId: requirement.requirementId, status: "" as const,
    }))),
  };
  return { packet, template, reviewDocument: renderReviewerQualificationReview(packet.items) };
}

export function evaluateReviewerQualificationV21(
  packetValue: unknown,
  submissionValue: unknown,
  definition: ReviewerQualificationDefinition = HUMAN_REFERENCE_SEMANTIC_AUDIT_V21_QUALIFICATION_DEFINITION,
): ReviewerQualificationResultV21 {
  const packet = parseReviewerQualificationPacketV21(packetValue);
  const submission = parseReviewerQualificationSubmissionV21(submissionValue);
  const definitionFingerprint = assertDefinition(definition);
  if (packet.reviewerId !== submission.reviewerId ||
    packet.qualificationBatchId !== submission.qualificationBatchId ||
    packet.qualificationPresentationFingerprint !== submission.qualificationPresentationFingerprint ||
    packet.qualificationDefinitionFingerprint !== submission.qualificationDefinitionFingerprint ||
    packet.qualificationDefinitionFingerprint !== definitionFingerprint ||
    !same(packet.localization, submission.localization)) return invalid();
  const expected = new Map(definition.expectedAssessments.map((assessment) =>
    [humanAtomicIdentityKey(assessment), assessment.status]));
  const observed = new Map<string, ReviewerQualificationAtomicAssessment>();
  for (const assessment of submission.assessments) {
    const key = humanAtomicIdentityKey(assessment);
    if (!expected.has(key) || observed.has(key)) return invalid();
    observed.set(key, assessment);
  }
  if (observed.size !== expected.size) return invalid();
  const conformingAtomicCount = [...expected].filter(([key, status]) => observed.get(key)?.status === status).length;
  const base = {
    schemaVersion: HUMAN_REFERENCE_SEMANTIC_AUDIT_V2_SCHEMA_VERSION,
    resultKind: HUMAN_REFERENCE_SEMANTIC_AUDIT_V2_QUALIFICATION_RESULT_KIND,
    auditProtocolId: HUMAN_REFERENCE_SEMANTIC_AUDIT_V2_PROTOCOL_ID,
    auditProtocolVersion: HUMAN_REFERENCE_SEMANTIC_AUDIT_V21_PROTOCOL_VERSION,
    reviewerId: packet.reviewerId,
    qualificationId: HUMAN_REFERENCE_SEMANTIC_AUDIT_V2_QUALIFICATION_ID,
    qualificationVersion: HUMAN_REFERENCE_SEMANTIC_AUDIT_V21_QUALIFICATION_VERSION,
    qualificationBatchId: packet.qualificationBatchId,
    qualificationPresentationFingerprint: packet.qualificationPresentationFingerprint,
    qualificationDefinitionFingerprint: packet.qualificationDefinitionFingerprint,
    localization: packet.localization,
    qualificationCompleted: true,
    qualificationStatus: conformingAtomicCount === expected.size ? "qualified" : "not_qualified",
    assessedAtomicCount: expected.size,
    conformingAtomicCount,
  } as const;
  return parseReviewerQualificationResultV21({ ...base, resultFingerprint: resultFingerprint(base) });
}

function validateQualifiedResultV21(
  value: unknown,
  reviewerId: string,
  localization: HumanReferenceSemanticAuditLocalizationIdentity,
): ReviewerQualificationResultV21 {
  const result = parseReviewerQualificationResultV21(value);
  const { resultFingerprint: persisted, ...base } = result;
  if (result.reviewerId !== reviewerId || !same(result.localization, localization) ||
    result.qualificationDefinitionFingerprint !== HUMAN_REFERENCE_SEMANTIC_AUDIT_V21_QUALIFICATION_DEFINITION_FINGERPRINT ||
    result.qualificationPresentationFingerprint !== HUMAN_REFERENCE_SEMANTIC_AUDIT_V21_QUALIFICATION_PRESENTATION_FINGERPRINT ||
    result.qualificationStatus !== "qualified" || result.assessedAtomicCount !==
      HUMAN_REFERENCE_SEMANTIC_AUDIT_V21_QUALIFICATION_DEFINITION.expectedAssessments.length ||
    result.conformingAtomicCount !== result.assessedAtomicCount || resultFingerprint(base) !== persisted) return invalid();
  return result;
}

function qualificationBinding(result: ReviewerQualificationResultV21): ReviewerQualificationBindingV21 {
  return { qualificationId: result.qualificationId, qualificationVersion: result.qualificationVersion,
    qualificationBatchId: result.qualificationBatchId,
    qualificationPresentationFingerprint: result.qualificationPresentationFingerprint,
    qualificationDefinitionFingerprint: result.qualificationDefinitionFingerprint,
    qualificationResultFingerprint: result.resultFingerprint,
    qualificationStatus: "qualified", qualificationCompleted: true };
}

export interface QualifiedSemanticAuditExportV21 {
  readonly packet: HumanReferenceQualifiedSemanticAuditPacketV21;
  readonly template: HumanReferenceQualifiedSemanticAuditSubmissionTemplateV21;
  readonly reviewDocument: string;
  readonly localizedGuide: string;
}

export function createQualifiedLocalizedSemanticAuditExportV21(
  annotationValue: HumanReferenceAnnotationFile,
  reviewerId: string,
  qualificationValue: unknown,
  definition: HumanReferenceSemanticAuditLocalizationDefinition,
): QualifiedSemanticAuditExportV21 {
  const annotations = parseHumanReferenceAnnotationFile(annotationValue);
  if (annotations.requiredAnnotatorIds.includes(reviewerId)) return invalid();
  const localization = buildSemanticAuditLocalizationIdentity(annotations.tasks, definition);
  const qualification = validateQualifiedResultV21(qualificationValue, reviewerId, localization);
  const sourceCalibration = { batchId: annotations.batchId, calibrationProtocolId: HUMAN_REFERENCE_PROTOCOL_ID,
    calibrationProtocolVersion: HUMAN_REFERENCE_PROTOCOL_VERSION, dataKind: annotations.dataKind,
    ...(annotations.fixture === undefined ? {} : { fixture: annotations.fixture }) } as const;
  const reviewerQualification = qualificationBinding(qualification);
  const auditBatchId = `qualified-audit-${hash(JSON.stringify([
    annotations.batchId, reviewerId, localization, reviewerQualification,
  ])).slice("sha256:".length, "sha256:".length + 16)}`;
  const packet = parseHumanReferenceQualifiedSemanticAuditPacketV21({
    schemaVersion: HUMAN_REFERENCE_SEMANTIC_AUDIT_V2_SCHEMA_VERSION,
    packetKind: HUMAN_REFERENCE_SEMANTIC_AUDIT_V2_PACKET_KIND,
    auditProtocolId: HUMAN_REFERENCE_SEMANTIC_AUDIT_V2_PROTOCOL_ID,
    auditProtocolVersion: HUMAN_REFERENCE_SEMANTIC_AUDIT_V21_PROTOCOL_VERSION,
    auditBatchId, reviewerId, sourceCalibration, localization, reviewerQualification,
    localizedTasks: definition.localizedTasks,
  });
  return { packet, template: { schemaVersion: HUMAN_REFERENCE_SEMANTIC_AUDIT_V2_SCHEMA_VERSION,
    packetKind: HUMAN_REFERENCE_SEMANTIC_AUDIT_V2_SUBMISSION_KIND,
    auditProtocolId: HUMAN_REFERENCE_SEMANTIC_AUDIT_V2_PROTOCOL_ID,
    auditProtocolVersion: HUMAN_REFERENCE_SEMANTIC_AUDIT_V21_PROTOCOL_VERSION,
    auditBatchId, reviewerId, sourceCalibration, localization, reviewerQualification,
    reviewLocale: HUMAN_REFERENCE_SEMANTIC_AUDIT_V2_LOCALE, instructionsClear: false,
    annotations: sortedAtoms(packet.localizedTasks).map((atom) => ({ ...atom, status: "" })) },
    reviewDocument: renderLocalizedSemanticAuditReview(packet.localizedTasks), localizedGuide: definition.localizedGuide };
}

export function importQualifiedLocalizedSemanticAuditSubmissionV21(
  packetValue: unknown,
  submissionValue: unknown,
  qualificationValue: unknown,
): HumanReferenceQualifiedSemanticAuditAnnotationsV21 {
  const packet = parseHumanReferenceQualifiedSemanticAuditPacketV21(packetValue);
  const submission = parseHumanReferenceQualifiedSemanticAuditSubmissionV21(submissionValue);
  const qualification = validateQualifiedResultV21(qualificationValue, packet.reviewerId, packet.localization);
  if (packet.auditBatchId !== submission.auditBatchId || packet.reviewerId !== submission.reviewerId ||
    !same(packet.sourceCalibration, submission.sourceCalibration) || !same(packet.localization, submission.localization) ||
    !same(packet.reviewerQualification, submission.reviewerQualification) ||
    !same(packet.reviewerQualification, qualificationBinding(qualification))) return invalid();
  const expected = new Set(sortedAtoms(packet.localizedTasks).map(humanAtomicIdentityKey));
  const observed = new Set<string>();
  for (const annotation of submission.annotations) {
    const key = humanAtomicIdentityKey(annotation);
    if (!expected.has(key) || observed.has(key)) return invalid();
    observed.add(key);
  }
  if (observed.size !== expected.size) return invalid();
  return parseHumanReferenceQualifiedSemanticAuditAnnotationsV21({
    schemaVersion: HUMAN_REFERENCE_SEMANTIC_AUDIT_V2_SCHEMA_VERSION,
    dataKind: packet.sourceCalibration.dataKind,
    ...(packet.sourceCalibration.fixture === undefined ? {} : { fixture: packet.sourceCalibration.fixture }),
    annotationKind: HUMAN_REFERENCE_SEMANTIC_AUDIT_V2_ANNOTATIONS_KIND,
    auditProtocolId: HUMAN_REFERENCE_SEMANTIC_AUDIT_V2_PROTOCOL_ID,
    auditProtocolVersion: HUMAN_REFERENCE_SEMANTIC_AUDIT_V21_PROTOCOL_VERSION,
    auditBatchId: packet.auditBatchId, reviewerId: packet.reviewerId, sourceCalibration: packet.sourceCalibration,
    localization: packet.localization, reviewerQualification: packet.reviewerQualification,
    reviewLocale: submission.reviewLocale, instructionsClear: submission.instructionsClear,
    annotations: [...submission.annotations].sort((left, right) =>
      humanAtomicIdentityKey(left).localeCompare(humanAtomicIdentityKey(right))),
  });
}

export function buildQualifiedLocalizedSemanticAuditReportV21(
  annotationValue: HumanReferenceAnnotationFile,
  adjudicationValue: HumanReferenceAdjudicationFile,
  auditValue: unknown,
  qualificationValue: unknown,
): HumanReferenceQualifiedSemanticAuditReportV21 {
  const audit = parseHumanReferenceQualifiedSemanticAuditAnnotationsV21(auditValue);
  const qualification = validateQualifiedResultV21(qualificationValue, audit.reviewerId, audit.localization);
  if (!same(audit.reviewerQualification, qualificationBinding(qualification))) return invalid();
  const legacyAudit: HumanReferenceSemanticAuditAnnotations = {
    schemaVersion: HUMAN_REFERENCE_SEMANTIC_AUDIT_SCHEMA_VERSION, dataKind: audit.dataKind,
    ...(audit.fixture === undefined ? {} : { fixture: audit.fixture }),
    annotationKind: HUMAN_REFERENCE_SEMANTIC_AUDIT_ANNOTATIONS_KIND,
    auditProtocolId: HUMAN_REFERENCE_SEMANTIC_AUDIT_PROTOCOL_ID,
    auditProtocolVersion: HUMAN_REFERENCE_SEMANTIC_AUDIT_PROTOCOL_VERSION,
    auditBatchId: audit.auditBatchId, reviewerId: audit.reviewerId, sourceCalibration: audit.sourceCalibration,
    taskSetFingerprint: audit.localization.sourceTaskFingerprint,
    annotationGuide: audit.localization.sourceAnnotationGuide, annotations: audit.annotations,
  };
  const legacy = buildHumanReferenceSemanticAuditReport(annotationValue, adjudicationValue, legacyAudit);
  return { ...legacy, reportKind: HUMAN_REFERENCE_SEMANTIC_AUDIT_V2_REPORT_KIND,
    auditProtocolVersion: HUMAN_REFERENCE_SEMANTIC_AUDIT_V21_PROTOCOL_VERSION,
    reviewerId: audit.reviewerId, reviewLocale: audit.reviewLocale, localization: audit.localization,
    reviewerQualification: audit.reviewerQualification, qualificationStatus: "qualified", qualificationCompleted: true,
    instructionsClear: audit.instructionsClear,
    limitations: [...legacy.limitations,
      "Reviewer qualification establishes comprehension eligibility for this audit instrument, not calibration or accuracy.",
      "Qualification eligibility is bound to the visible presentation, hidden expected statuses, and exact pass rule.",
      "Localized presentation bytes are provenance-bound and are not the canonical source bytes."] };
}

export { buildOfficialZhCnSemanticAuditLocalization, buildSemanticAuditLocalizationIdentity };
