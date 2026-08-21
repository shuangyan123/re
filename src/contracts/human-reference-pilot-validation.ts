import { createHash } from "node:crypto";

import { BenchmarkConfigurationError } from "./errors.js";
import {
  HUMAN_ATOMIC_STATUSES,
  HUMAN_REFERENCE_EVIDENCE_MAX_LENGTH,
  HUMAN_REFERENCE_PROTOCOL_ID,
  HUMAN_REFERENCE_PROTOCOL_VERSION,
  type HumanAnnotationDataKind,
  type HumanReferenceAnnotationTask,
  type HumanReferenceSyntheticFixtureMarker,
} from "./human-reference-calibration.js";
import { parseHumanReferenceAnnotationTask } from "./human-reference-calibration-validation.js";
import {
  HUMAN_REFERENCE_PILOT_PACKET_KIND,
  HUMAN_REFERENCE_PILOT_PROTOCOL_ID,
  HUMAN_REFERENCE_PILOT_PROTOCOL_VERSION,
  HUMAN_REFERENCE_PILOT_SCHEMA_VERSION,
  HUMAN_REFERENCE_PILOT_SUBMISSION_KIND,
  type HumanReferencePilotAtomicAnnotation,
  type HumanReferencePilotPacket,
  type HumanReferencePilotSource,
  type HumanReferencePilotSubmission,
} from "./human-reference-pilot.js";

type UnknownRecord = Record<string, unknown>;

const statuses = new Set<string>(HUMAN_ATOMIC_STATUSES);
const dataKinds = new Set<HumanAnnotationDataKind>([
  "human-annotation",
  "synthetic-fixture",
]);
const identifierPattern = /^[A-Za-z][A-Za-z0-9._:-]*$/u;
const opaqueIdPattern = /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/u;
const versionPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,79}$/u;
const fingerprintPattern = /^sha256:[0-9a-f]{64}$/u;

function invalid(): never {
  throw new BenchmarkConfigurationError("human_reference_calibration_invalid");
}

function asRecord(value: unknown): UnknownRecord | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as UnknownRecord
    : null;
}

function hasOnlyKeys(record: UnknownRecord, keys: readonly string[]): boolean {
  const allowed = new Set(keys);
  return Object.keys(record).every((key) => allowed.has(key));
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function identifier(value: unknown): value is string {
  return nonEmptyString(value) && value.length <= 200 && identifierPattern.test(value);
}

function version(value: unknown): value is string {
  return typeof value === "string" && versionPattern.test(value);
}

function opaqueId(value: unknown): value is string {
  return typeof value === "string" && opaqueIdPattern.test(value) && !value.includes("@");
}

function evidence(value: unknown): value is string {
  return nonEmptyString(value) && value.length <= HUMAN_REFERENCE_EVIDENCE_MAX_LENGTH;
}

function optionalEvidence(record: UnknownRecord, key: string): string | undefined | null {
  if (!(key in record)) {
    return undefined;
  }
  return evidence(record[key]) ? record[key] as string : null;
}

function fixtureMarker(value: unknown): HumanReferenceSyntheticFixtureMarker | undefined | null {
  if (value === undefined) {
    return undefined;
  }
  const record = asRecord(value);
  if (
    record === null ||
    !hasOnlyKeys(record, ["synthetic", "notHumanCalibrationData"]) ||
    record.synthetic !== true ||
    record.notHumanCalibrationData !== true
  ) {
    return null;
  }
  return { synthetic: true, notHumanCalibrationData: true };
}

function parseStatus(value: unknown): HumanReferencePilotAtomicAnnotation["status"] | null {
  return typeof value === "string" && statuses.has(value)
    ? value as HumanReferencePilotAtomicAnnotation["status"]
    : null;
}

function parseTask(value: unknown): HumanReferenceAnnotationTask | null {
  const record = asRecord(value);
  if (record === null) {
    return null;
  }
  try {
    return parseHumanReferenceAnnotationTask(record);
  } catch {
    return null;
  }
}

/**
 * Keeps the task fingerprint independent of input array order while binding
 * every visible field, rubric owner, and atomic requirement identity.
 */
export function humanReferencePilotTaskSetFingerprint(
  tasks: readonly HumanReferenceAnnotationTask[],
): string {
  const normalized = [...tasks]
    .map((task) => ({
      schemaVersion: task.schemaVersion,
      caseId: task.caseId,
      learningObjective: task.learningObjective,
      studentProfile: task.studentProfile,
      conversationHistory: task.conversationHistory,
      studentMessage: task.studentMessage,
      problemContext: task.problemContext,
      groundTruth: task.groundTruth,
      knownMisconception: task.knownMisconception,
      disclosurePolicy: task.disclosurePolicy,
      rubrics: [...task.rubrics]
        .map((rubric) => ({
          id: rubric.id,
          criterion: rubric.criterion,
          requirements: [...rubric.requirements]
            .map((requirement) => ({
              id: requirement.id,
              description: requirement.description,
            }))
            .sort((left, right) => left.id.localeCompare(right.id)),
        }))
        .sort((left, right) => left.id.localeCompare(right.id)),
      tutorResponse: task.tutorResponse,
    }))
    .sort((left, right) => left.caseId.localeCompare(right.caseId));
  return `sha256:${createHash("sha256").update(JSON.stringify(normalized), "utf8").digest("hex")}`;
}

function parseSource(value: unknown): HumanReferencePilotSource | null {
  const record = asRecord(value);
  const fixture = fixtureMarker(record?.fixture);
  if (
    record === null ||
    !hasOnlyKeys(record, [
      "diagnosticId",
      "diagnosticVersion",
      "fixtureId",
      "fixtureVersion",
      "datasetId",
      "datasetVersion",
      "dataKind",
      "fixture",
    ]) ||
    !identifier(record.diagnosticId) ||
    !version(record.diagnosticVersion) ||
    !identifier(record.fixtureId) ||
    !version(record.fixtureVersion) ||
    !identifier(record.datasetId) ||
    !version(record.datasetVersion) ||
    record.dataKind !== "synthetic-fixture" ||
    fixture === null ||
    fixture === undefined
  ) {
    return null;
  }
  return {
    diagnosticId: record.diagnosticId,
    diagnosticVersion: record.diagnosticVersion,
    fixtureId: record.fixtureId,
    fixtureVersion: record.fixtureVersion,
    datasetId: record.datasetId,
    datasetVersion: record.datasetVersion,
    dataKind: "synthetic-fixture",
    fixture,
  };
}

function parsePacketTasks(value: unknown): HumanReferenceAnnotationTask[] | null {
  if (!Array.isArray(value) || value.length === 0) {
    return null;
  }
  const tasks = value.map(parseTask);
  if (
    tasks.some((task) => task === null) ||
    new Set(tasks.map((task) => task?.caseId)).size !== tasks.length
  ) {
    return null;
  }
  return tasks as HumanReferenceAnnotationTask[];
}

export function parseHumanReferencePilotPacket(
  value: unknown,
): HumanReferencePilotPacket {
  const record = asRecord(value);
  const source = parseSource(record?.source);
  const tasks = parsePacketTasks(record?.tasks);
  if (
    record === null ||
    !hasOnlyKeys(record, [
      "schemaVersion",
      "packetKind",
      "pilotProtocolId",
      "pilotProtocolVersion",
      "pilotId",
      "batchId",
      "calibrationProtocolId",
      "calibrationProtocolVersion",
      "source",
      "taskSetFingerprint",
      "annotatorId",
      "tasks",
    ]) ||
    record.schemaVersion !== HUMAN_REFERENCE_PILOT_SCHEMA_VERSION ||
    record.packetKind !== HUMAN_REFERENCE_PILOT_PACKET_KIND ||
    record.pilotProtocolId !== HUMAN_REFERENCE_PILOT_PROTOCOL_ID ||
    record.pilotProtocolVersion !== HUMAN_REFERENCE_PILOT_PROTOCOL_VERSION ||
    !opaqueId(record.pilotId) ||
    !opaqueId(record.batchId) ||
    record.calibrationProtocolId !== HUMAN_REFERENCE_PROTOCOL_ID ||
    record.calibrationProtocolVersion !== HUMAN_REFERENCE_PROTOCOL_VERSION ||
    source === null ||
    typeof record.taskSetFingerprint !== "string" ||
    !fingerprintPattern.test(record.taskSetFingerprint) ||
    !opaqueId(record.annotatorId) ||
    tasks === null ||
    humanReferencePilotTaskSetFingerprint(tasks) !== record.taskSetFingerprint
  ) {
    return invalid();
  }
  return {
    schemaVersion: HUMAN_REFERENCE_PILOT_SCHEMA_VERSION,
    packetKind: HUMAN_REFERENCE_PILOT_PACKET_KIND,
    pilotProtocolId: HUMAN_REFERENCE_PILOT_PROTOCOL_ID,
    pilotProtocolVersion: HUMAN_REFERENCE_PILOT_PROTOCOL_VERSION,
    pilotId: record.pilotId,
    batchId: record.batchId,
    calibrationProtocolId: HUMAN_REFERENCE_PROTOCOL_ID,
    calibrationProtocolVersion: HUMAN_REFERENCE_PROTOCOL_VERSION,
    source,
    taskSetFingerprint: record.taskSetFingerprint,
    annotatorId: record.annotatorId,
    tasks,
  };
}

export function parseHumanReferencePilotAtomicAnnotation(
  value: unknown,
): HumanReferencePilotAtomicAnnotation {
  const record = asRecord(value);
  const parsedEvidence = record === null ? null : optionalEvidence(record, "evidence");
  if (
    record === null ||
    !hasOnlyKeys(record, ["caseId", "rubricId", "requirementId", "status", "evidence"]) ||
    !identifier(record.caseId) ||
    !identifier(record.rubricId) ||
    !identifier(record.requirementId) ||
    parseStatus(record.status) === null ||
    parsedEvidence === null
  ) {
    return invalid();
  }
  return {
    caseId: record.caseId,
    rubricId: record.rubricId,
    requirementId: record.requirementId,
    status: parseStatus(record.status) as HumanReferencePilotAtomicAnnotation["status"],
    ...(parsedEvidence === undefined ? {} : { evidence: parsedEvidence }),
  };
}

export function parseHumanReferencePilotSubmission(
  value: unknown,
): HumanReferencePilotSubmission {
  const record = asRecord(value);
  const fixture = fixtureMarker(record?.fixture);
  const dataKind = record?.dataKind;
  const annotations = Array.isArray(record?.annotations)
    ? record.annotations.map(parseHumanReferencePilotAtomicAnnotation)
    : null;
  if (
    record === null ||
    !hasOnlyKeys(record, [
      "schemaVersion",
      "packetKind",
      "pilotProtocolId",
      "pilotProtocolVersion",
      "pilotId",
      "batchId",
      "calibrationProtocolId",
      "calibrationProtocolVersion",
      "taskSetFingerprint",
      "annotatorId",
      "dataKind",
      "fixture",
      "annotations",
    ]) ||
    record.schemaVersion !== HUMAN_REFERENCE_PILOT_SCHEMA_VERSION ||
    record.packetKind !== HUMAN_REFERENCE_PILOT_SUBMISSION_KIND ||
    record.pilotProtocolId !== HUMAN_REFERENCE_PILOT_PROTOCOL_ID ||
    record.pilotProtocolVersion !== HUMAN_REFERENCE_PILOT_PROTOCOL_VERSION ||
    !opaqueId(record.pilotId) ||
    !opaqueId(record.batchId) ||
    record.calibrationProtocolId !== HUMAN_REFERENCE_PROTOCOL_ID ||
    record.calibrationProtocolVersion !== HUMAN_REFERENCE_PROTOCOL_VERSION ||
    typeof record.taskSetFingerprint !== "string" ||
    !fingerprintPattern.test(record.taskSetFingerprint) ||
    !opaqueId(record.annotatorId) ||
    (typeof dataKind !== "string" || !dataKinds.has(dataKind as HumanAnnotationDataKind)) ||
    fixture === null ||
    (dataKind === "synthetic-fixture" && fixture === undefined) ||
    (dataKind === "human-annotation" && fixture !== undefined) ||
    annotations === null
  ) {
    return invalid();
  }
  return {
    schemaVersion: HUMAN_REFERENCE_PILOT_SCHEMA_VERSION,
    packetKind: HUMAN_REFERENCE_PILOT_SUBMISSION_KIND,
    pilotProtocolId: HUMAN_REFERENCE_PILOT_PROTOCOL_ID,
    pilotProtocolVersion: HUMAN_REFERENCE_PILOT_PROTOCOL_VERSION,
    pilotId: record.pilotId,
    batchId: record.batchId,
    calibrationProtocolId: HUMAN_REFERENCE_PROTOCOL_ID,
    calibrationProtocolVersion: HUMAN_REFERENCE_PROTOCOL_VERSION,
    taskSetFingerprint: record.taskSetFingerprint,
    annotatorId: record.annotatorId,
    dataKind: dataKind as HumanAnnotationDataKind,
    ...(fixture === undefined ? {} : { fixture }),
    annotations,
  };
}
