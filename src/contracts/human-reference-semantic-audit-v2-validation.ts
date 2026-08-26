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
import {
  HUMAN_REFERENCE_SEMANTIC_AUDIT_GUIDE_FINGERPRINT,
  HUMAN_REFERENCE_SEMANTIC_AUDIT_GUIDE_ID,
  HUMAN_REFERENCE_SEMANTIC_AUDIT_GUIDE_VERSION,
  type HumanReferenceSemanticAuditGuideIdentity,
  type HumanReferenceSemanticAuditSourceIdentity,
} from "./human-reference-semantic-audit.js";
import {
  HUMAN_REFERENCE_SEMANTIC_AUDIT_V2_ANNOTATIONS_KIND,
  HUMAN_REFERENCE_SEMANTIC_AUDIT_V2_LOCALIZATION_ID,
  HUMAN_REFERENCE_SEMANTIC_AUDIT_V2_LOCALIZATION_VERSION,
  HUMAN_REFERENCE_SEMANTIC_AUDIT_V2_LOCALIZED_GUIDE_ID,
  HUMAN_REFERENCE_SEMANTIC_AUDIT_V2_LOCALIZED_GUIDE_VERSION,
  HUMAN_REFERENCE_SEMANTIC_AUDIT_V2_LOCALE,
  HUMAN_REFERENCE_SEMANTIC_AUDIT_V2_PACKET_KIND,
  HUMAN_REFERENCE_SEMANTIC_AUDIT_V2_PROTOCOL_ID,
  HUMAN_REFERENCE_SEMANTIC_AUDIT_V2_PROTOCOL_VERSION,
  HUMAN_REFERENCE_SEMANTIC_AUDIT_V2_QUALIFICATION_ID,
  HUMAN_REFERENCE_SEMANTIC_AUDIT_V2_QUALIFICATION_PACKET_KIND,
  HUMAN_REFERENCE_SEMANTIC_AUDIT_V2_QUALIFICATION_RESULT_KIND,
  HUMAN_REFERENCE_SEMANTIC_AUDIT_V2_QUALIFICATION_SUBMISSION_KIND,
  HUMAN_REFERENCE_SEMANTIC_AUDIT_V2_QUALIFICATION_VERSION,
  HUMAN_REFERENCE_SEMANTIC_AUDIT_V2_SCHEMA_VERSION,
  HUMAN_REFERENCE_SEMANTIC_AUDIT_V2_SUBMISSION_KIND,
  type HumanReferenceQualifiedSemanticAuditAnnotations,
  type HumanReferenceQualifiedSemanticAuditPacket,
  type HumanReferenceQualifiedSemanticAuditSubmission,
  type HumanReferenceSemanticAuditLocalizationIdentity,
  type ReviewerQualificationAtomicAssessment,
  type ReviewerQualificationBinding,
  type ReviewerQualificationItem,
  type ReviewerQualificationPacket,
  type ReviewerQualificationResult,
  type ReviewerQualificationSubmission,
} from "./human-reference-semantic-audit-v2.js";
import {
  localizedPresentationFingerprint,
  localizedTaskFingerprint,
  qualificationFingerprint,
} from "./human-reference-semantic-audit-v2-presentation.js";

type UnknownRecord = Record<string, unknown>;
const fingerprints = /^sha256:[0-9a-f]{64}$/u;
const opaqueIds = /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/u;
const identifiers = /^[A-Za-z][A-Za-z0-9._:-]*$/u;
const statuses = new Set<string>(HUMAN_ATOMIC_STATUSES);

function invalid(): never {
  throw new BenchmarkConfigurationError("human_reference_semantic_audit_invalid");
}

function record(value: unknown): UnknownRecord | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as UnknownRecord
    : null;
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

function sourceGuide(value: unknown): HumanReferenceSemanticAuditGuideIdentity | null {
  const parsed = record(value);
  return parsed !== null && only(parsed, ["id", "version", "fingerprint"]) &&
    parsed.id === HUMAN_REFERENCE_SEMANTIC_AUDIT_GUIDE_ID &&
    parsed.version === HUMAN_REFERENCE_SEMANTIC_AUDIT_GUIDE_VERSION &&
    parsed.fingerprint === HUMAN_REFERENCE_SEMANTIC_AUDIT_GUIDE_FINGERPRINT
    ? {
        id: HUMAN_REFERENCE_SEMANTIC_AUDIT_GUIDE_ID,
        version: HUMAN_REFERENCE_SEMANTIC_AUDIT_GUIDE_VERSION,
        fingerprint: HUMAN_REFERENCE_SEMANTIC_AUDIT_GUIDE_FINGERPRINT,
      }
    : null;
}

function localization(value: unknown): HumanReferenceSemanticAuditLocalizationIdentity | null {
  const parsed = record(value);
  const guide = sourceGuide(parsed?.sourceAnnotationGuide);
  const localizedGuide = record(parsed?.localizedAnnotationGuide);
  if (parsed === null || guide === null || localizedGuide === null ||
    !only(parsed, ["locale", "localizationId", "localizationVersion", "sourceTaskFingerprint",
      "localizedTaskFingerprint", "localizedPresentationFingerprint", "sourceAnnotationGuide",
      "localizedAnnotationGuide"]) ||
    parsed.locale !== HUMAN_REFERENCE_SEMANTIC_AUDIT_V2_LOCALE ||
    parsed.localizationId !== HUMAN_REFERENCE_SEMANTIC_AUDIT_V2_LOCALIZATION_ID ||
    parsed.localizationVersion !== HUMAN_REFERENCE_SEMANTIC_AUDIT_V2_LOCALIZATION_VERSION ||
    !fingerprint(parsed.sourceTaskFingerprint) || !fingerprint(parsed.localizedTaskFingerprint) ||
    !fingerprint(parsed.localizedPresentationFingerprint) ||
    !only(localizedGuide, ["id", "version", "fingerprint"]) ||
    localizedGuide.id !== HUMAN_REFERENCE_SEMANTIC_AUDIT_V2_LOCALIZED_GUIDE_ID ||
    localizedGuide.version !== HUMAN_REFERENCE_SEMANTIC_AUDIT_V2_LOCALIZED_GUIDE_VERSION ||
    !fingerprint(localizedGuide.fingerprint)) return null;
  return {
    locale: HUMAN_REFERENCE_SEMANTIC_AUDIT_V2_LOCALE,
    localizationId: HUMAN_REFERENCE_SEMANTIC_AUDIT_V2_LOCALIZATION_ID,
    localizationVersion: HUMAN_REFERENCE_SEMANTIC_AUDIT_V2_LOCALIZATION_VERSION,
    sourceTaskFingerprint: parsed.sourceTaskFingerprint,
    localizedTaskFingerprint: parsed.localizedTaskFingerprint,
    localizedPresentationFingerprint: parsed.localizedPresentationFingerprint,
    sourceAnnotationGuide: guide,
    localizedAnnotationGuide: {
      id: HUMAN_REFERENCE_SEMANTIC_AUDIT_V2_LOCALIZED_GUIDE_ID,
      version: HUMAN_REFERENCE_SEMANTIC_AUDIT_V2_LOCALIZED_GUIDE_VERSION,
      fingerprint: localizedGuide.fingerprint,
    },
  };
}

function items(value: unknown): ReviewerQualificationItem[] | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  const output: ReviewerQualificationItem[] = [];
  for (const candidate of value) {
    const parsed = record(candidate);
    if (parsed === null || !only(parsed, ["itemId", "evidence", "response", "requirements"]) ||
      !identifier(parsed.itemId) || typeof parsed.evidence !== "string" || parsed.evidence.length === 0 ||
      typeof parsed.response !== "string" || parsed.response.length === 0 || !Array.isArray(parsed.requirements) ||
      parsed.requirements.length === 0) return null;
    const requirements: { requirementId: string; description: string }[] = [];
    for (const candidateRequirement of parsed.requirements) {
      const requirement = record(candidateRequirement);
      if (requirement === null || !only(requirement, ["requirementId", "description"]) ||
        !identifier(requirement.requirementId) || typeof requirement.description !== "string" ||
        requirement.description.length === 0) return null;
      requirements.push({ requirementId: requirement.requirementId, description: requirement.description });
    }
    if (new Set(requirements.map((item) => item.requirementId)).size !== requirements.length) return null;
    output.push({ itemId: parsed.itemId, evidence: parsed.evidence, response: parsed.response, requirements });
  }
  return new Set(output.map((item) => item.itemId)).size === output.length ? output : null;
}

export function parseHumanReferenceSemanticAuditLocalizationIdentity(
  value: unknown,
): HumanReferenceSemanticAuditLocalizationIdentity {
  return localization(value) ?? invalid();
}

export function parseReviewerQualificationItems(value: unknown): ReviewerQualificationItem[] {
  return items(value) ?? invalid();
}

function qualificationEnvelope(parsed: UnknownRecord | null): {
  reviewerId: string;
  qualificationBatchId: string;
  qualificationFingerprint: string;
  localization: HumanReferenceSemanticAuditLocalizationIdentity;
} | null {
  const localized = localization(parsed?.localization);
  return parsed !== null && parsed.schemaVersion === HUMAN_REFERENCE_SEMANTIC_AUDIT_V2_SCHEMA_VERSION &&
    parsed.auditProtocolId === HUMAN_REFERENCE_SEMANTIC_AUDIT_V2_PROTOCOL_ID &&
    parsed.auditProtocolVersion === HUMAN_REFERENCE_SEMANTIC_AUDIT_V2_PROTOCOL_VERSION &&
    opaque(parsed.reviewerId) && parsed.qualificationId === HUMAN_REFERENCE_SEMANTIC_AUDIT_V2_QUALIFICATION_ID &&
    parsed.qualificationVersion === HUMAN_REFERENCE_SEMANTIC_AUDIT_V2_QUALIFICATION_VERSION &&
    opaque(parsed.qualificationBatchId) && fingerprint(parsed.qualificationFingerprint) && localized !== null
    ? {
        reviewerId: parsed.reviewerId,
        qualificationBatchId: parsed.qualificationBatchId,
        qualificationFingerprint: parsed.qualificationFingerprint,
        localization: localized,
      }
    : null;
}

function qualificationBase(envelope: NonNullable<ReturnType<typeof qualificationEnvelope>>) {
  return {
    schemaVersion: HUMAN_REFERENCE_SEMANTIC_AUDIT_V2_SCHEMA_VERSION,
    auditProtocolId: HUMAN_REFERENCE_SEMANTIC_AUDIT_V2_PROTOCOL_ID,
    auditProtocolVersion: HUMAN_REFERENCE_SEMANTIC_AUDIT_V2_PROTOCOL_VERSION,
    reviewerId: envelope.reviewerId,
    qualificationId: HUMAN_REFERENCE_SEMANTIC_AUDIT_V2_QUALIFICATION_ID,
    qualificationVersion: HUMAN_REFERENCE_SEMANTIC_AUDIT_V2_QUALIFICATION_VERSION,
    qualificationBatchId: envelope.qualificationBatchId,
    qualificationFingerprint: envelope.qualificationFingerprint,
    localization: envelope.localization,
  } as const;
}

function assessment(value: unknown): ReviewerQualificationAtomicAssessment {
  const parsed = record(value);
  if (parsed === null || !only(parsed, ["caseId", "rubricId", "requirementId", "status"]) ||
    !identifier(parsed.caseId) || !identifier(parsed.rubricId) || !identifier(parsed.requirementId) ||
    typeof parsed.status !== "string" || !statuses.has(parsed.status)) return invalid();
  return {
    caseId: parsed.caseId,
    rubricId: parsed.rubricId,
    requirementId: parsed.requirementId,
    status: parsed.status as HumanAtomicStatus,
  };
}

export function parseReviewerQualificationPacket(value: unknown): ReviewerQualificationPacket {
  const parsed = record(value);
  const envelope = qualificationEnvelope(parsed);
  const parsedItems = items(parsed?.items);
  if (envelope === null || parsedItems === null ||
    !only(parsed as UnknownRecord, ["schemaVersion", "packetKind", "auditProtocolId", "auditProtocolVersion",
      "reviewerId", "qualificationId", "qualificationVersion", "qualificationBatchId",
      "qualificationFingerprint", "localization", "items"]) ||
    parsed?.packetKind !== HUMAN_REFERENCE_SEMANTIC_AUDIT_V2_QUALIFICATION_PACKET_KIND ||
    qualificationFingerprint(parsedItems) !== envelope.qualificationFingerprint) return invalid();
  return { ...qualificationBase(envelope), packetKind: HUMAN_REFERENCE_SEMANTIC_AUDIT_V2_QUALIFICATION_PACKET_KIND,
    items: parsedItems };
}

export function parseReviewerQualificationSubmission(value: unknown): ReviewerQualificationSubmission {
  const parsed = record(value);
  const envelope = qualificationEnvelope(parsed);
  let assessments: ReviewerQualificationAtomicAssessment[] | null = null;
  try { assessments = Array.isArray(parsed?.assessments) ? parsed.assessments.map(assessment) : null; } catch { return invalid(); }
  if (envelope === null || assessments === null ||
    !only(parsed as UnknownRecord, ["schemaVersion", "packetKind", "auditProtocolId", "auditProtocolVersion",
      "reviewerId", "qualificationId", "qualificationVersion", "qualificationBatchId",
      "qualificationFingerprint", "localization", "assessments"]) ||
    parsed?.packetKind !== HUMAN_REFERENCE_SEMANTIC_AUDIT_V2_QUALIFICATION_SUBMISSION_KIND) return invalid();
  return { ...qualificationBase(envelope),
    packetKind: HUMAN_REFERENCE_SEMANTIC_AUDIT_V2_QUALIFICATION_SUBMISSION_KIND, assessments };
}

export function parseReviewerQualificationResult(value: unknown): ReviewerQualificationResult {
  const parsed = record(value);
  const envelope = qualificationEnvelope(parsed);
  if (envelope === null ||
    !only(parsed as UnknownRecord, ["schemaVersion", "resultKind", "auditProtocolId", "auditProtocolVersion",
      "reviewerId", "qualificationId", "qualificationVersion", "qualificationBatchId",
      "qualificationFingerprint", "localization", "qualificationCompleted", "qualificationStatus",
      "assessedAtomicCount", "conformingAtomicCount", "resultFingerprint"]) ||
    parsed?.resultKind !== HUMAN_REFERENCE_SEMANTIC_AUDIT_V2_QUALIFICATION_RESULT_KIND ||
    parsed.qualificationCompleted !== true ||
    (parsed.qualificationStatus !== "qualified" && parsed.qualificationStatus !== "not_qualified") ||
    !Number.isInteger(parsed.assessedAtomicCount) || (parsed.assessedAtomicCount as number) <= 0 ||
    !Number.isInteger(parsed.conformingAtomicCount) || (parsed.conformingAtomicCount as number) < 0 ||
    (parsed.conformingAtomicCount as number) > (parsed.assessedAtomicCount as number) ||
    !fingerprint(parsed.resultFingerprint)) return invalid();
  return {
    ...qualificationBase(envelope),
    resultKind: HUMAN_REFERENCE_SEMANTIC_AUDIT_V2_QUALIFICATION_RESULT_KIND,
    qualificationCompleted: true,
    qualificationStatus: parsed.qualificationStatus,
    assessedAtomicCount: parsed.assessedAtomicCount as number,
    conformingAtomicCount: parsed.conformingAtomicCount as number,
    resultFingerprint: parsed.resultFingerprint,
  };
}

function binding(value: unknown): ReviewerQualificationBinding | null {
  const parsed = record(value);
  return parsed !== null && only(parsed, ["qualificationId", "qualificationVersion", "qualificationBatchId",
    "qualificationFingerprint", "qualificationResultFingerprint", "qualificationStatus", "qualificationCompleted"]) &&
    parsed.qualificationId === HUMAN_REFERENCE_SEMANTIC_AUDIT_V2_QUALIFICATION_ID &&
    parsed.qualificationVersion === HUMAN_REFERENCE_SEMANTIC_AUDIT_V2_QUALIFICATION_VERSION &&
    opaque(parsed.qualificationBatchId) && fingerprint(parsed.qualificationFingerprint) &&
    fingerprint(parsed.qualificationResultFingerprint) && parsed.qualificationStatus === "qualified" &&
    parsed.qualificationCompleted === true
    ? {
        qualificationId: HUMAN_REFERENCE_SEMANTIC_AUDIT_V2_QUALIFICATION_ID,
        qualificationVersion: HUMAN_REFERENCE_SEMANTIC_AUDIT_V2_QUALIFICATION_VERSION,
        qualificationBatchId: parsed.qualificationBatchId,
        qualificationFingerprint: parsed.qualificationFingerprint,
        qualificationResultFingerprint: parsed.qualificationResultFingerprint,
        qualificationStatus: "qualified",
        qualificationCompleted: true,
      }
    : null;
}

function auditEnvelope(parsed: UnknownRecord | null): {
  auditBatchId: string;
  reviewerId: string;
  source: HumanReferenceSemanticAuditSourceIdentity;
  localization: HumanReferenceSemanticAuditLocalizationIdentity;
  qualification: ReviewerQualificationBinding;
} | null {
  const source = sourceIdentity(parsed?.sourceCalibration);
  const localized = localization(parsed?.localization);
  const qualification = binding(parsed?.reviewerQualification);
  return parsed !== null && parsed.schemaVersion === HUMAN_REFERENCE_SEMANTIC_AUDIT_V2_SCHEMA_VERSION &&
    parsed.auditProtocolId === HUMAN_REFERENCE_SEMANTIC_AUDIT_V2_PROTOCOL_ID &&
    parsed.auditProtocolVersion === HUMAN_REFERENCE_SEMANTIC_AUDIT_V2_PROTOCOL_VERSION &&
    opaque(parsed.auditBatchId) && opaque(parsed.reviewerId) && source !== null && localized !== null &&
    qualification !== null
    ? { auditBatchId: parsed.auditBatchId, reviewerId: parsed.reviewerId, source, localization: localized,
        qualification }
    : null;
}

function auditBase(envelope: NonNullable<ReturnType<typeof auditEnvelope>>) {
  return {
    schemaVersion: HUMAN_REFERENCE_SEMANTIC_AUDIT_V2_SCHEMA_VERSION,
    auditProtocolId: HUMAN_REFERENCE_SEMANTIC_AUDIT_V2_PROTOCOL_ID,
    auditProtocolVersion: HUMAN_REFERENCE_SEMANTIC_AUDIT_V2_PROTOCOL_VERSION,
    auditBatchId: envelope.auditBatchId,
    reviewerId: envelope.reviewerId,
    sourceCalibration: envelope.source,
    localization: envelope.localization,
    reviewerQualification: envelope.qualification,
  } as const;
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
  return {
    caseId: parsed.caseId,
    rubricId: parsed.rubricId,
    requirementId: parsed.requirementId,
    status: parsed.status as HumanAtomicStatus,
    ...(evidence === undefined ? {} : { evidence: evidence as string }),
  };
}

export function parseHumanReferenceQualifiedSemanticAuditPacket(
  value: unknown,
): HumanReferenceQualifiedSemanticAuditPacket {
  const parsed = record(value);
  const envelope = auditEnvelope(parsed);
  const localizedTasks = tasks(parsed?.localizedTasks);
  if (envelope === null || localizedTasks === null ||
    !only(parsed as UnknownRecord, ["schemaVersion", "packetKind", "auditProtocolId", "auditProtocolVersion",
      "auditBatchId", "reviewerId", "sourceCalibration", "localization", "reviewerQualification",
      "localizedTasks"]) || parsed?.packetKind !== HUMAN_REFERENCE_SEMANTIC_AUDIT_V2_PACKET_KIND ||
    localizedTaskFingerprint(localizedTasks) !== envelope.localization.localizedTaskFingerprint ||
    localizedPresentationFingerprint(localizedTasks) !== envelope.localization.localizedPresentationFingerprint) {
    return invalid();
  }
  return { ...auditBase(envelope), packetKind: HUMAN_REFERENCE_SEMANTIC_AUDIT_V2_PACKET_KIND, localizedTasks };
}

export function parseHumanReferenceQualifiedSemanticAuditSubmission(
  value: unknown,
): HumanReferenceQualifiedSemanticAuditSubmission {
  const parsed = record(value);
  const envelope = auditEnvelope(parsed);
  let annotations: ReturnType<typeof auditAnnotation>[] | null = null;
  try { annotations = Array.isArray(parsed?.annotations) ? parsed.annotations.map(auditAnnotation) : null; } catch { return invalid(); }
  if (envelope === null || annotations === null ||
    !only(parsed as UnknownRecord, ["schemaVersion", "packetKind", "auditProtocolId", "auditProtocolVersion",
      "auditBatchId", "reviewerId", "sourceCalibration", "localization", "reviewerQualification", "reviewLocale",
      "instructionsClear", "annotations"]) || parsed?.packetKind !== HUMAN_REFERENCE_SEMANTIC_AUDIT_V2_SUBMISSION_KIND ||
    parsed.reviewLocale !== HUMAN_REFERENCE_SEMANTIC_AUDIT_V2_LOCALE || typeof parsed.instructionsClear !== "boolean") {
    return invalid();
  }
  return { ...auditBase(envelope), packetKind: HUMAN_REFERENCE_SEMANTIC_AUDIT_V2_SUBMISSION_KIND,
    reviewLocale: HUMAN_REFERENCE_SEMANTIC_AUDIT_V2_LOCALE, instructionsClear: parsed.instructionsClear, annotations };
}

export function parseHumanReferenceQualifiedSemanticAuditAnnotations(
  value: unknown,
): HumanReferenceQualifiedSemanticAuditAnnotations {
  const parsed = record(value);
  const envelope = auditEnvelope(parsed);
  const marker = fixture(parsed?.fixture);
  let annotations: ReturnType<typeof auditAnnotation>[] | null = null;
  try { annotations = Array.isArray(parsed?.annotations) ? parsed.annotations.map(auditAnnotation) : null; } catch { return invalid(); }
  if (envelope === null || marker === null || annotations === null ||
    !only(parsed as UnknownRecord, ["schemaVersion", "dataKind", "fixture", "annotationKind", "auditProtocolId",
      "auditProtocolVersion", "auditBatchId", "reviewerId", "sourceCalibration", "localization",
      "reviewerQualification", "reviewLocale", "instructionsClear", "annotations"]) ||
    parsed?.annotationKind !== HUMAN_REFERENCE_SEMANTIC_AUDIT_V2_ANNOTATIONS_KIND ||
    parsed.dataKind !== envelope.source.dataKind || JSON.stringify(marker) !== JSON.stringify(envelope.source.fixture) ||
    parsed.reviewLocale !== HUMAN_REFERENCE_SEMANTIC_AUDIT_V2_LOCALE || typeof parsed.instructionsClear !== "boolean") {
    return invalid();
  }
  return { ...auditBase(envelope), dataKind: parsed.dataKind as HumanAnnotationDataKind,
    ...(marker === undefined ? {} : { fixture: marker }),
    annotationKind: HUMAN_REFERENCE_SEMANTIC_AUDIT_V2_ANNOTATIONS_KIND,
    reviewLocale: HUMAN_REFERENCE_SEMANTIC_AUDIT_V2_LOCALE, instructionsClear: parsed.instructionsClear, annotations };
}
