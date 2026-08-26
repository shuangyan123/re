import { BenchmarkConfigurationError } from "./errors.js";
import {
  HUMAN_ATOMIC_STATUSES,
  HUMAN_REFERENCE_EVIDENCE_MAX_LENGTH,
  HUMAN_REFERENCE_PROTOCOL_ID,
  HUMAN_REFERENCE_PROTOCOL_VERSION,
  type HumanAnnotationDataKind,
  type HumanAtomicStatus,
  type HumanReferenceAnnotationTask,
  type HumanReferenceSyntheticFixtureMarker,
} from "./human-reference-calibration.js";
import { parseHumanReferenceAnnotationTask } from "./human-reference-calibration-validation.js";
import type { HumanReferenceSemanticAuditSourceIdentity } from "./human-reference-semantic-audit.js";
import {
  HUMAN_REFERENCE_SEMANTIC_AUDIT_V2_ANNOTATIONS_KIND,
  HUMAN_REFERENCE_SEMANTIC_AUDIT_V2_LOCALE,
  HUMAN_REFERENCE_SEMANTIC_AUDIT_V2_PACKET_KIND,
  HUMAN_REFERENCE_SEMANTIC_AUDIT_V2_PROTOCOL_ID,
  HUMAN_REFERENCE_SEMANTIC_AUDIT_V2_QUALIFICATION_ID,
  HUMAN_REFERENCE_SEMANTIC_AUDIT_V2_QUALIFICATION_PACKET_KIND,
  HUMAN_REFERENCE_SEMANTIC_AUDIT_V2_QUALIFICATION_RESULT_KIND,
  HUMAN_REFERENCE_SEMANTIC_AUDIT_V2_QUALIFICATION_SUBMISSION_KIND,
  HUMAN_REFERENCE_SEMANTIC_AUDIT_V2_SCHEMA_VERSION,
  HUMAN_REFERENCE_SEMANTIC_AUDIT_V2_SUBMISSION_KIND,
  type HumanReferenceSemanticAuditLocalizationIdentity,
  type ReviewerQualificationAtomicAssessment,
} from "./human-reference-semantic-audit-v2.js";
import {
  HUMAN_REFERENCE_SEMANTIC_AUDIT_V21_PROTOCOL_VERSION,
  HUMAN_REFERENCE_SEMANTIC_AUDIT_V21_QUALIFICATION_VERSION,
  type HumanReferenceQualifiedSemanticAuditAnnotationsV21,
  type HumanReferenceQualifiedSemanticAuditPacketV21,
  type HumanReferenceQualifiedSemanticAuditSubmissionV21,
  type ReviewerQualificationBindingV21,
  type ReviewerQualificationPacketV21,
  type ReviewerQualificationResultV21,
  type ReviewerQualificationSubmissionV21,
} from "./human-reference-semantic-audit-v2-1.js";
import {
  localizedPresentationFingerprint,
  localizedTaskFingerprint,
} from "./human-reference-semantic-audit-v2-presentation.js";
import { qualificationPresentationFingerprint } from "./human-reference-semantic-audit-v2-1-provenance.js";
import {
  parseHumanReferenceSemanticAuditLocalizationIdentity,
  parseReviewerQualificationItems,
} from "./human-reference-semantic-audit-v2-validation.js";

type UnknownRecord = Record<string, unknown>;
const fingerprints = /^sha256:[0-9a-f]{64}$/u;
const opaqueIds = /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/u;
const identifiers = /^[A-Za-z][A-Za-z0-9._:-]*$/u;
const statuses = new Set<string>(HUMAN_ATOMIC_STATUSES);

function invalid(): never {
  throw new BenchmarkConfigurationError("human_reference_semantic_audit_invalid");
}

function record(value: unknown): UnknownRecord | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as UnknownRecord : null;
}

function only(value: UnknownRecord, keys: readonly string[]): boolean {
  const allowed = new Set(keys);
  return Object.keys(value).every((key) => allowed.has(key));
}

function opaque(value: unknown): value is string {
  return typeof value === "string" && opaqueIds.test(value) && !value.includes("@");
}

function identifier(value: unknown): value is string {
  return typeof value === "string" && value.length <= 200 && identifiers.test(value);
}

function fingerprint(value: unknown): value is string {
  return typeof value === "string" && fingerprints.test(value);
}

function localization(value: unknown): HumanReferenceSemanticAuditLocalizationIdentity | null {
  try { return parseHumanReferenceSemanticAuditLocalizationIdentity(value); } catch { return null; }
}

function fixture(value: unknown): HumanReferenceSyntheticFixtureMarker | undefined | null {
  if (value === undefined) return undefined;
  const parsed = record(value);
  return parsed !== null && only(parsed, ["synthetic", "notHumanCalibrationData"]) &&
    parsed.synthetic === true && parsed.notHumanCalibrationData === true
    ? { synthetic: true, notHumanCalibrationData: true }
    : null;
}

function sourceIdentity(value: unknown): HumanReferenceSemanticAuditSourceIdentity | null {
  const parsed = record(value);
  const marker = fixture(parsed?.fixture);
  if (parsed === null || marker === null ||
    !only(parsed, ["batchId", "calibrationProtocolId", "calibrationProtocolVersion", "dataKind", "fixture"]) ||
    !opaque(parsed.batchId) || parsed.calibrationProtocolId !== HUMAN_REFERENCE_PROTOCOL_ID ||
    parsed.calibrationProtocolVersion !== HUMAN_REFERENCE_PROTOCOL_VERSION ||
    (parsed.dataKind !== "human-annotation" && parsed.dataKind !== "synthetic-fixture") ||
    (parsed.dataKind === "human-annotation" && marker !== undefined) ||
    (parsed.dataKind === "synthetic-fixture" && marker === undefined)) return null;
  return {
    batchId: parsed.batchId,
    calibrationProtocolId: HUMAN_REFERENCE_PROTOCOL_ID,
    calibrationProtocolVersion: HUMAN_REFERENCE_PROTOCOL_VERSION,
    dataKind: parsed.dataKind as HumanAnnotationDataKind,
    ...(marker === undefined ? {} : { fixture: marker }),
  };
}

function qualificationEnvelope(parsed: UnknownRecord | null) {
  const localized = localization(parsed?.localization);
  if (parsed === null || parsed.schemaVersion !== HUMAN_REFERENCE_SEMANTIC_AUDIT_V2_SCHEMA_VERSION ||
    parsed.auditProtocolId !== HUMAN_REFERENCE_SEMANTIC_AUDIT_V2_PROTOCOL_ID ||
    parsed.auditProtocolVersion !== HUMAN_REFERENCE_SEMANTIC_AUDIT_V21_PROTOCOL_VERSION ||
    !opaque(parsed.reviewerId) || parsed.qualificationId !== HUMAN_REFERENCE_SEMANTIC_AUDIT_V2_QUALIFICATION_ID ||
    parsed.qualificationVersion !== HUMAN_REFERENCE_SEMANTIC_AUDIT_V21_QUALIFICATION_VERSION ||
    !opaque(parsed.qualificationBatchId) || !fingerprint(parsed.qualificationPresentationFingerprint) ||
    !fingerprint(parsed.qualificationDefinitionFingerprint) || localized === null) return null;
  return {
    reviewerId: parsed.reviewerId,
    qualificationBatchId: parsed.qualificationBatchId,
    qualificationPresentationFingerprint: parsed.qualificationPresentationFingerprint,
    qualificationDefinitionFingerprint: parsed.qualificationDefinitionFingerprint,
    localization: localized,
  };
}

function qualificationBase(envelope: NonNullable<ReturnType<typeof qualificationEnvelope>>) {
  return {
    schemaVersion: HUMAN_REFERENCE_SEMANTIC_AUDIT_V2_SCHEMA_VERSION,
    auditProtocolId: HUMAN_REFERENCE_SEMANTIC_AUDIT_V2_PROTOCOL_ID,
    auditProtocolVersion: HUMAN_REFERENCE_SEMANTIC_AUDIT_V21_PROTOCOL_VERSION,
    reviewerId: envelope.reviewerId,
    qualificationId: HUMAN_REFERENCE_SEMANTIC_AUDIT_V2_QUALIFICATION_ID,
    qualificationVersion: HUMAN_REFERENCE_SEMANTIC_AUDIT_V21_QUALIFICATION_VERSION,
    qualificationBatchId: envelope.qualificationBatchId,
    qualificationPresentationFingerprint: envelope.qualificationPresentationFingerprint,
    qualificationDefinitionFingerprint: envelope.qualificationDefinitionFingerprint,
    localization: envelope.localization,
  } as const;
}

function assessment(value: unknown): ReviewerQualificationAtomicAssessment {
  const parsed = record(value);
  if (parsed === null || !only(parsed, ["caseId", "rubricId", "requirementId", "status"]) ||
    !identifier(parsed.caseId) || !identifier(parsed.rubricId) || !identifier(parsed.requirementId) ||
    typeof parsed.status !== "string" || !statuses.has(parsed.status)) return invalid();
  return { caseId: parsed.caseId, rubricId: parsed.rubricId, requirementId: parsed.requirementId,
    status: parsed.status as HumanAtomicStatus };
}

const qualificationKeys = ["schemaVersion", "packetKind", "auditProtocolId", "auditProtocolVersion",
  "reviewerId", "qualificationId", "qualificationVersion", "qualificationBatchId",
  "qualificationPresentationFingerprint", "qualificationDefinitionFingerprint", "localization"] as const;

export function parseReviewerQualificationPacketV21(value: unknown): ReviewerQualificationPacketV21 {
  const parsed = record(value);
  const envelope = qualificationEnvelope(parsed);
  let parsedItems;
  try { parsedItems = parseReviewerQualificationItems(parsed?.items); } catch { return invalid(); }
  if (envelope === null || !only(parsed as UnknownRecord, [...qualificationKeys, "items"]) ||
    parsed?.packetKind !== HUMAN_REFERENCE_SEMANTIC_AUDIT_V2_QUALIFICATION_PACKET_KIND ||
    qualificationPresentationFingerprint(parsedItems) !== envelope.qualificationPresentationFingerprint) return invalid();
  return { ...qualificationBase(envelope), packetKind: HUMAN_REFERENCE_SEMANTIC_AUDIT_V2_QUALIFICATION_PACKET_KIND,
    items: parsedItems };
}

export function parseReviewerQualificationSubmissionV21(value: unknown): ReviewerQualificationSubmissionV21 {
  const parsed = record(value);
  const envelope = qualificationEnvelope(parsed);
  let assessments: ReviewerQualificationAtomicAssessment[] | null = null;
  try { assessments = Array.isArray(parsed?.assessments) ? parsed.assessments.map(assessment) : null; } catch { return invalid(); }
  if (envelope === null || assessments === null || !only(parsed as UnknownRecord, [...qualificationKeys, "assessments"]) ||
    parsed?.packetKind !== HUMAN_REFERENCE_SEMANTIC_AUDIT_V2_QUALIFICATION_SUBMISSION_KIND) return invalid();
  return { ...qualificationBase(envelope), packetKind: HUMAN_REFERENCE_SEMANTIC_AUDIT_V2_QUALIFICATION_SUBMISSION_KIND,
    assessments };
}

export function parseReviewerQualificationResultV21(value: unknown): ReviewerQualificationResultV21 {
  const parsed = record(value);
  const envelope = qualificationEnvelope(parsed);
  const resultKeys: readonly string[] = [...qualificationKeys.filter((key) => key !== "packetKind"),
    "resultKind", "qualificationCompleted", "qualificationStatus", "assessedAtomicCount",
    "conformingAtomicCount", "resultFingerprint"];
  if (envelope === null || !only(parsed as UnknownRecord, resultKeys) ||
    parsed?.resultKind !== HUMAN_REFERENCE_SEMANTIC_AUDIT_V2_QUALIFICATION_RESULT_KIND ||
    parsed.qualificationCompleted !== true ||
    (parsed.qualificationStatus !== "qualified" && parsed.qualificationStatus !== "not_qualified") ||
    !Number.isInteger(parsed.assessedAtomicCount) || (parsed.assessedAtomicCount as number) <= 0 ||
    !Number.isInteger(parsed.conformingAtomicCount) || (parsed.conformingAtomicCount as number) < 0 ||
    (parsed.conformingAtomicCount as number) > (parsed.assessedAtomicCount as number) ||
    !fingerprint(parsed.resultFingerprint)) return invalid();
  return { ...qualificationBase(envelope), resultKind: HUMAN_REFERENCE_SEMANTIC_AUDIT_V2_QUALIFICATION_RESULT_KIND,
    qualificationCompleted: true, qualificationStatus: parsed.qualificationStatus,
    assessedAtomicCount: parsed.assessedAtomicCount as number,
    conformingAtomicCount: parsed.conformingAtomicCount as number, resultFingerprint: parsed.resultFingerprint };
}

function binding(value: unknown): ReviewerQualificationBindingV21 | null {
  const parsed = record(value);
  return parsed !== null && only(parsed, ["qualificationId", "qualificationVersion", "qualificationBatchId",
    "qualificationPresentationFingerprint", "qualificationDefinitionFingerprint", "qualificationResultFingerprint",
    "qualificationStatus", "qualificationCompleted"]) &&
    parsed.qualificationId === HUMAN_REFERENCE_SEMANTIC_AUDIT_V2_QUALIFICATION_ID &&
    parsed.qualificationVersion === HUMAN_REFERENCE_SEMANTIC_AUDIT_V21_QUALIFICATION_VERSION &&
    opaque(parsed.qualificationBatchId) && fingerprint(parsed.qualificationPresentationFingerprint) &&
    fingerprint(parsed.qualificationDefinitionFingerprint) && fingerprint(parsed.qualificationResultFingerprint) &&
    parsed.qualificationStatus === "qualified" && parsed.qualificationCompleted === true
    ? { qualificationId: HUMAN_REFERENCE_SEMANTIC_AUDIT_V2_QUALIFICATION_ID,
        qualificationVersion: HUMAN_REFERENCE_SEMANTIC_AUDIT_V21_QUALIFICATION_VERSION,
        qualificationBatchId: parsed.qualificationBatchId,
        qualificationPresentationFingerprint: parsed.qualificationPresentationFingerprint,
        qualificationDefinitionFingerprint: parsed.qualificationDefinitionFingerprint,
        qualificationResultFingerprint: parsed.qualificationResultFingerprint,
        qualificationStatus: "qualified", qualificationCompleted: true }
    : null;
}

function auditEnvelope(parsed: UnknownRecord | null) {
  const source = sourceIdentity(parsed?.sourceCalibration);
  const localized = localization(parsed?.localization);
  const qualification = binding(parsed?.reviewerQualification);
  return parsed !== null && parsed.schemaVersion === HUMAN_REFERENCE_SEMANTIC_AUDIT_V2_SCHEMA_VERSION &&
    parsed.auditProtocolId === HUMAN_REFERENCE_SEMANTIC_AUDIT_V2_PROTOCOL_ID &&
    parsed.auditProtocolVersion === HUMAN_REFERENCE_SEMANTIC_AUDIT_V21_PROTOCOL_VERSION &&
    opaque(parsed.auditBatchId) && opaque(parsed.reviewerId) && source !== null && localized !== null && qualification !== null
    ? { auditBatchId: parsed.auditBatchId, reviewerId: parsed.reviewerId, source, localization: localized, qualification }
    : null;
}

function auditBase(envelope: NonNullable<ReturnType<typeof auditEnvelope>>) {
  return { schemaVersion: HUMAN_REFERENCE_SEMANTIC_AUDIT_V2_SCHEMA_VERSION,
    auditProtocolId: HUMAN_REFERENCE_SEMANTIC_AUDIT_V2_PROTOCOL_ID,
    auditProtocolVersion: HUMAN_REFERENCE_SEMANTIC_AUDIT_V21_PROTOCOL_VERSION,
    auditBatchId: envelope.auditBatchId, reviewerId: envelope.reviewerId,
    sourceCalibration: envelope.source, localization: envelope.localization,
    reviewerQualification: envelope.qualification } as const;
}

function tasks(value: unknown): HumanReferenceAnnotationTask[] | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  try {
    const parsed = value.map(parseHumanReferenceAnnotationTask);
    return new Set(parsed.map((task) => task.caseId)).size === parsed.length ? parsed : null;
  } catch { return null; }
}

function auditAnnotation(value: unknown) {
  const parsed = record(value);
  const evidence = parsed?.evidence;
  if (parsed === null || !only(parsed, ["caseId", "rubricId", "requirementId", "status", "evidence"]) ||
    !identifier(parsed.caseId) || !identifier(parsed.rubricId) || !identifier(parsed.requirementId) ||
    typeof parsed.status !== "string" || !statuses.has(parsed.status) ||
    (evidence !== undefined && (typeof evidence !== "string" || evidence.trim().length === 0 ||
      evidence.length > HUMAN_REFERENCE_EVIDENCE_MAX_LENGTH))) return invalid();
  return { caseId: parsed.caseId, rubricId: parsed.rubricId, requirementId: parsed.requirementId,
    status: parsed.status as HumanAtomicStatus, ...(evidence === undefined ? {} : { evidence: evidence as string }) };
}

const auditKeys = ["schemaVersion", "packetKind", "auditProtocolId", "auditProtocolVersion", "auditBatchId",
  "reviewerId", "sourceCalibration", "localization", "reviewerQualification"] as const;

export function parseHumanReferenceQualifiedSemanticAuditPacketV21(
  value: unknown,
): HumanReferenceQualifiedSemanticAuditPacketV21 {
  const parsed = record(value);
  const envelope = auditEnvelope(parsed);
  const localizedTasks = tasks(parsed?.localizedTasks);
  if (envelope === null || localizedTasks === null || !only(parsed as UnknownRecord, [...auditKeys, "localizedTasks"]) ||
    parsed?.packetKind !== HUMAN_REFERENCE_SEMANTIC_AUDIT_V2_PACKET_KIND ||
    localizedTaskFingerprint(localizedTasks) !== envelope.localization.localizedTaskFingerprint ||
    localizedPresentationFingerprint(localizedTasks) !== envelope.localization.localizedPresentationFingerprint) return invalid();
  return { ...auditBase(envelope), packetKind: HUMAN_REFERENCE_SEMANTIC_AUDIT_V2_PACKET_KIND, localizedTasks };
}

export function parseHumanReferenceQualifiedSemanticAuditSubmissionV21(
  value: unknown,
): HumanReferenceQualifiedSemanticAuditSubmissionV21 {
  const parsed = record(value);
  const envelope = auditEnvelope(parsed);
  let annotations: ReturnType<typeof auditAnnotation>[] | null = null;
  try { annotations = Array.isArray(parsed?.annotations) ? parsed.annotations.map(auditAnnotation) : null; } catch { return invalid(); }
  if (envelope === null || annotations === null ||
    !only(parsed as UnknownRecord, [...auditKeys, "reviewLocale", "instructionsClear", "annotations"]) ||
    parsed?.packetKind !== HUMAN_REFERENCE_SEMANTIC_AUDIT_V2_SUBMISSION_KIND ||
    parsed.reviewLocale !== HUMAN_REFERENCE_SEMANTIC_AUDIT_V2_LOCALE || typeof parsed.instructionsClear !== "boolean") return invalid();
  return { ...auditBase(envelope), packetKind: HUMAN_REFERENCE_SEMANTIC_AUDIT_V2_SUBMISSION_KIND,
    reviewLocale: HUMAN_REFERENCE_SEMANTIC_AUDIT_V2_LOCALE, instructionsClear: parsed.instructionsClear, annotations };
}

export function parseHumanReferenceQualifiedSemanticAuditAnnotationsV21(
  value: unknown,
): HumanReferenceQualifiedSemanticAuditAnnotationsV21 {
  const parsed = record(value);
  const envelope = auditEnvelope(parsed);
  const marker = fixture(parsed?.fixture);
  let annotations: ReturnType<typeof auditAnnotation>[] | null = null;
  try { annotations = Array.isArray(parsed?.annotations) ? parsed.annotations.map(auditAnnotation) : null; } catch { return invalid(); }
  const allowed: readonly string[] = [...auditKeys.filter((key) => key !== "packetKind"), "dataKind", "fixture",
    "annotationKind", "reviewLocale", "instructionsClear", "annotations"];
  if (envelope === null || marker === null || annotations === null || !only(parsed as UnknownRecord, allowed) ||
    parsed?.annotationKind !== HUMAN_REFERENCE_SEMANTIC_AUDIT_V2_ANNOTATIONS_KIND ||
    parsed.dataKind !== envelope.source.dataKind || JSON.stringify(marker) !== JSON.stringify(envelope.source.fixture) ||
    parsed.reviewLocale !== HUMAN_REFERENCE_SEMANTIC_AUDIT_V2_LOCALE || typeof parsed.instructionsClear !== "boolean") return invalid();
  return { ...auditBase(envelope), dataKind: parsed.dataKind as HumanAnnotationDataKind,
    ...(marker === undefined ? {} : { fixture: marker }), annotationKind: HUMAN_REFERENCE_SEMANTIC_AUDIT_V2_ANNOTATIONS_KIND,
    reviewLocale: HUMAN_REFERENCE_SEMANTIC_AUDIT_V2_LOCALE, instructionsClear: parsed.instructionsClear, annotations };
}
