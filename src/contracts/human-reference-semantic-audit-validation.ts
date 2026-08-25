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
import { humanReferencePilotTaskSetFingerprint } from "./human-reference-pilot-validation.js";
import {
  HUMAN_REFERENCE_SEMANTIC_AUDIT_ANNOTATIONS_KIND,
  HUMAN_REFERENCE_SEMANTIC_AUDIT_GUIDE_FINGERPRINT,
  HUMAN_REFERENCE_SEMANTIC_AUDIT_GUIDE_ID,
  HUMAN_REFERENCE_SEMANTIC_AUDIT_GUIDE_VERSION,
  HUMAN_REFERENCE_SEMANTIC_AUDIT_PACKET_KIND,
  HUMAN_REFERENCE_SEMANTIC_AUDIT_PROTOCOL_ID,
  HUMAN_REFERENCE_SEMANTIC_AUDIT_PROTOCOL_VERSION,
  HUMAN_REFERENCE_SEMANTIC_AUDIT_SCHEMA_VERSION,
  HUMAN_REFERENCE_SEMANTIC_AUDIT_SUBMISSION_KIND,
  type HumanReferenceSemanticAuditAnnotations,
  type HumanReferenceSemanticAuditAtomicAnnotation,
  type HumanReferenceSemanticAuditGuideIdentity,
  type HumanReferenceSemanticAuditPacket,
  type HumanReferenceSemanticAuditSourceIdentity,
  type HumanReferenceSemanticAuditSubmission,
} from "./human-reference-semantic-audit.js";

type UnknownRecord = Record<string, unknown>;
const statuses = new Set<string>(HUMAN_ATOMIC_STATUSES);
const fingerprintPattern = /^sha256:[0-9a-f]{64}$/u;
const opaqueIdPattern = /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/u;
const identifierPattern = /^[A-Za-z][A-Za-z0-9._:-]*$/u;

function invalid(): never {
  throw new BenchmarkConfigurationError("human_reference_semantic_audit_invalid");
}

function asRecord(value: unknown): UnknownRecord | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as UnknownRecord
    : null;
}

function only(record: UnknownRecord, keys: readonly string[]): boolean {
  const allowed = new Set(keys);
  return Object.keys(record).every((key) => allowed.has(key));
}

function opaqueId(value: unknown): value is string {
  return typeof value === "string" && opaqueIdPattern.test(value) && !value.includes("@");
}

function identifier(value: unknown): value is string {
  return typeof value === "string" && value.length <= 200 && identifierPattern.test(value);
}

function fixture(value: unknown): HumanReferenceSyntheticFixtureMarker | undefined | null {
  if (value === undefined) return undefined;
  const record = asRecord(value);
  return record !== null && only(record, ["synthetic", "notHumanCalibrationData"]) &&
    record.synthetic === true && record.notHumanCalibrationData === true
    ? { synthetic: true, notHumanCalibrationData: true }
    : null;
}

function sourceIdentity(value: unknown): HumanReferenceSemanticAuditSourceIdentity | null {
  const record = asRecord(value);
  const marker = fixture(record?.fixture);
  if (
    record === null ||
    !only(record, ["batchId", "calibrationProtocolId", "calibrationProtocolVersion", "dataKind", "fixture"]) ||
    !opaqueId(record.batchId) ||
    record.calibrationProtocolId !== HUMAN_REFERENCE_PROTOCOL_ID ||
    record.calibrationProtocolVersion !== HUMAN_REFERENCE_PROTOCOL_VERSION ||
    (record.dataKind !== "human-annotation" && record.dataKind !== "synthetic-fixture") ||
    marker === null ||
    (record.dataKind === "synthetic-fixture" && marker === undefined) ||
    (record.dataKind === "human-annotation" && marker !== undefined)
  ) return null;
  return {
    batchId: record.batchId,
    calibrationProtocolId: HUMAN_REFERENCE_PROTOCOL_ID,
    calibrationProtocolVersion: HUMAN_REFERENCE_PROTOCOL_VERSION,
    dataKind: record.dataKind as HumanAnnotationDataKind,
    ...(marker === undefined ? {} : { fixture: marker }),
  };
}

function guideIdentity(value: unknown): HumanReferenceSemanticAuditGuideIdentity | null {
  const record = asRecord(value);
  return record !== null && only(record, ["id", "version", "fingerprint"]) &&
    record.id === HUMAN_REFERENCE_SEMANTIC_AUDIT_GUIDE_ID &&
    record.version === HUMAN_REFERENCE_SEMANTIC_AUDIT_GUIDE_VERSION &&
    record.fingerprint === HUMAN_REFERENCE_SEMANTIC_AUDIT_GUIDE_FINGERPRINT
    ? {
        id: HUMAN_REFERENCE_SEMANTIC_AUDIT_GUIDE_ID,
        version: HUMAN_REFERENCE_SEMANTIC_AUDIT_GUIDE_VERSION,
        fingerprint: HUMAN_REFERENCE_SEMANTIC_AUDIT_GUIDE_FINGERPRINT,
      }
    : null;
}

function tasks(value: unknown): HumanReferenceAnnotationTask[] | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  try {
    const parsed = value.map(parseHumanReferenceAnnotationTask);
    return new Set(parsed.map((task) => task.caseId)).size === parsed.length ? parsed : null;
  } catch {
    return null;
  }
}

function annotation(value: unknown): HumanReferenceSemanticAuditAtomicAnnotation {
  const record = asRecord(value);
  const evidence = record?.evidence;
  if (
    record === null ||
    !only(record, ["caseId", "rubricId", "requirementId", "status", "evidence"]) ||
    !identifier(record.caseId) || !identifier(record.rubricId) || !identifier(record.requirementId) ||
    typeof record.status !== "string" || !statuses.has(record.status) ||
    (evidence !== undefined &&
      (typeof evidence !== "string" || evidence.trim().length === 0 ||
        evidence.length > HUMAN_REFERENCE_EVIDENCE_MAX_LENGTH))
  ) return invalid();
  return {
    caseId: record.caseId,
    rubricId: record.rubricId,
    requirementId: record.requirementId,
    status: record.status as HumanAtomicStatus,
    ...(evidence === undefined ? {} : { evidence: evidence as string }),
  };
}

function envelope(record: UnknownRecord | null): {
  source: HumanReferenceSemanticAuditSourceIdentity;
  guide: HumanReferenceSemanticAuditGuideIdentity;
} | null {
  const source = sourceIdentity(record?.sourceCalibration);
  const guide = guideIdentity(record?.annotationGuide);
  return record !== null &&
    record.schemaVersion === HUMAN_REFERENCE_SEMANTIC_AUDIT_SCHEMA_VERSION &&
    record.auditProtocolId === HUMAN_REFERENCE_SEMANTIC_AUDIT_PROTOCOL_ID &&
    record.auditProtocolVersion === HUMAN_REFERENCE_SEMANTIC_AUDIT_PROTOCOL_VERSION &&
    opaqueId(record.auditBatchId) && opaqueId(record.reviewerId) &&
    typeof record.taskSetFingerprint === "string" && fingerprintPattern.test(record.taskSetFingerprint) &&
    source !== null && guide !== null
    ? { source, guide }
    : null;
}

export function parseHumanReferenceSemanticAuditPacket(
  value: unknown,
): HumanReferenceSemanticAuditPacket {
  const record = asRecord(value);
  const parsedEnvelope = envelope(record);
  const parsedTasks = tasks(record?.tasks);
  if (
    parsedEnvelope === null || parsedTasks === null ||
    !only(record as UnknownRecord, ["schemaVersion", "packetKind", "auditProtocolId", "auditProtocolVersion", "auditBatchId", "reviewerId", "sourceCalibration", "taskSetFingerprint", "annotationGuide", "tasks"]) ||
    record?.packetKind !== HUMAN_REFERENCE_SEMANTIC_AUDIT_PACKET_KIND ||
    humanReferencePilotTaskSetFingerprint(parsedTasks) !== record.taskSetFingerprint
  ) return invalid();
  return {
    schemaVersion: HUMAN_REFERENCE_SEMANTIC_AUDIT_SCHEMA_VERSION,
    packetKind: HUMAN_REFERENCE_SEMANTIC_AUDIT_PACKET_KIND,
    auditProtocolId: HUMAN_REFERENCE_SEMANTIC_AUDIT_PROTOCOL_ID,
    auditProtocolVersion: HUMAN_REFERENCE_SEMANTIC_AUDIT_PROTOCOL_VERSION,
    auditBatchId: record.auditBatchId as string,
    reviewerId: record.reviewerId as string,
    sourceCalibration: parsedEnvelope.source,
    taskSetFingerprint: record.taskSetFingerprint as string,
    annotationGuide: parsedEnvelope.guide,
    tasks: parsedTasks,
  };
}

export function parseHumanReferenceSemanticAuditSubmission(
  value: unknown,
): HumanReferenceSemanticAuditSubmission {
  const record = asRecord(value);
  const parsedEnvelope = envelope(record);
  let annotations: HumanReferenceSemanticAuditAtomicAnnotation[] | null = null;
  try {
    annotations = Array.isArray(record?.annotations) ? record.annotations.map(annotation) : null;
  } catch {
    return invalid();
  }
  if (
    parsedEnvelope === null || annotations === null ||
    !only(record as UnknownRecord, ["schemaVersion", "packetKind", "auditProtocolId", "auditProtocolVersion", "auditBatchId", "reviewerId", "sourceCalibration", "taskSetFingerprint", "annotationGuide", "annotations"]) ||
    record?.packetKind !== HUMAN_REFERENCE_SEMANTIC_AUDIT_SUBMISSION_KIND
  ) return invalid();
  return {
    schemaVersion: HUMAN_REFERENCE_SEMANTIC_AUDIT_SCHEMA_VERSION,
    packetKind: HUMAN_REFERENCE_SEMANTIC_AUDIT_SUBMISSION_KIND,
    auditProtocolId: HUMAN_REFERENCE_SEMANTIC_AUDIT_PROTOCOL_ID,
    auditProtocolVersion: HUMAN_REFERENCE_SEMANTIC_AUDIT_PROTOCOL_VERSION,
    auditBatchId: record.auditBatchId as string,
    reviewerId: record.reviewerId as string,
    sourceCalibration: parsedEnvelope.source,
    taskSetFingerprint: record.taskSetFingerprint as string,
    annotationGuide: parsedEnvelope.guide,
    annotations,
  };
}

export function parseHumanReferenceSemanticAuditAnnotations(
  value: unknown,
): HumanReferenceSemanticAuditAnnotations {
  const record = asRecord(value);
  const parsedEnvelope = envelope(record);
  const marker = fixture(record?.fixture);
  let annotations: HumanReferenceSemanticAuditAtomicAnnotation[] | null = null;
  try {
    annotations = Array.isArray(record?.annotations) ? record.annotations.map(annotation) : null;
  } catch {
    return invalid();
  }
  if (
    parsedEnvelope === null || annotations === null || marker === null ||
    !only(record as UnknownRecord, ["schemaVersion", "dataKind", "fixture", "annotationKind", "auditProtocolId", "auditProtocolVersion", "auditBatchId", "reviewerId", "sourceCalibration", "taskSetFingerprint", "annotationGuide", "annotations"]) ||
    record?.annotationKind !== HUMAN_REFERENCE_SEMANTIC_AUDIT_ANNOTATIONS_KIND ||
    record.dataKind !== parsedEnvelope.source.dataKind ||
    JSON.stringify(marker) !== JSON.stringify(parsedEnvelope.source.fixture)
  ) return invalid();
  return {
    schemaVersion: HUMAN_REFERENCE_SEMANTIC_AUDIT_SCHEMA_VERSION,
    dataKind: record.dataKind as HumanAnnotationDataKind,
    ...(marker === undefined ? {} : { fixture: marker }),
    annotationKind: HUMAN_REFERENCE_SEMANTIC_AUDIT_ANNOTATIONS_KIND,
    auditProtocolId: HUMAN_REFERENCE_SEMANTIC_AUDIT_PROTOCOL_ID,
    auditProtocolVersion: HUMAN_REFERENCE_SEMANTIC_AUDIT_PROTOCOL_VERSION,
    auditBatchId: record.auditBatchId as string,
    reviewerId: record.reviewerId as string,
    sourceCalibration: parsedEnvelope.source,
    taskSetFingerprint: record.taskSetFingerprint as string,
    annotationGuide: parsedEnvelope.guide,
    annotations,
  };
}
