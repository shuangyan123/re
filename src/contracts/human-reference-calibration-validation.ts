import { BenchmarkConfigurationError } from "./errors.js";
import {
  HUMAN_ATOMIC_STATUSES,
  HUMAN_REFERENCE_CALIBRATION_SCHEMA_VERSION,
  HUMAN_REFERENCE_EVIDENCE_MAX_LENGTH,
  HUMAN_REFERENCE_PROTOCOL_ID,
  HUMAN_REFERENCE_PROTOCOL_VERSION,
  type HumanAnnotationBatch,
  type HumanAtomicAdjudication,
  type HumanAtomicAnnotation,
  type HumanAtomicStatus,
  type HumanAtomicMissingAssessment,
  type HumanAtomicUnresolvedDisagreement,
  type HumanReferenceAdjudicationDataKind,
  type HumanReferenceAdjudicationFile,
  type HumanReferenceAnnotationFile,
  type HumanReferenceAnnotationTask,
  type HumanReferenceDataKind,
  type HumanReferenceSet,
  type ReferenceAtomicAssessment,
  type HumanAnnotationDataKind,
  type HumanReferenceSyntheticFixtureMarker,
} from "./human-reference-calibration.js";
import {
  parseMaterialRequirementJudgeInput,
} from "./material-requirement-validation.js";
import type { MaterialRequirementJudgeInput } from "./material-requirement-judge.js";

type UnknownRecord = Record<string, unknown>;

const statuses = new Set<string>(HUMAN_ATOMIC_STATUSES);
const dataKinds = new Set<HumanAnnotationDataKind>([
  "human-annotation",
  "synthetic-fixture",
]);
const referenceDataKinds = new Set<HumanReferenceDataKind>([
  "human-reference",
  "synthetic-fixture",
]);
const adjudicationDataKinds = new Set<HumanReferenceAdjudicationDataKind>([
  "human-adjudication",
  "synthetic-fixture",
]);
const identifierPattern = /^[A-Za-z][A-Za-z0-9._:-]*$/u;
const opaqueIdPattern = /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/u;

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

function parseStatus(value: unknown): HumanAtomicStatus | null {
  return typeof value === "string" && statuses.has(value)
    ? value as HumanAtomicStatus
    : null;
}

function parseOpaqueIdList(value: unknown, minimumLength = 1): string[] | null {
  if (
    !Array.isArray(value) ||
    value.length < minimumLength ||
    !value.every(opaqueId) ||
    new Set(value).size !== value.length
  ) {
    return null;
  }
  return [...value].sort((left, right) => left.localeCompare(right));
}

function parseTaskInput(value: UnknownRecord): MaterialRequirementJudgeInput | null {
  const input = { ...value };
  delete input.schemaVersion;
  try {
    return parseMaterialRequirementJudgeInput(input);
  } catch {
    return null;
  }
}

export function parseHumanReferenceAnnotationTask(
  value: unknown,
): HumanReferenceAnnotationTask {
  const record = asRecord(value);
  if (
    record === null ||
    record.schemaVersion !== HUMAN_REFERENCE_CALIBRATION_SCHEMA_VERSION ||
    !hasOnlyKeys(record, [
      "schemaVersion",
      "caseId",
      "learningObjective",
      "studentProfile",
      "conversationHistory",
      "studentMessage",
      "problemContext",
      "groundTruth",
      "knownMisconception",
      "disclosurePolicy",
      "rubrics",
      "tutorResponse",
    ])
  ) {
    return invalid();
  }
  const parsed = parseTaskInput(record);
  if (parsed === null) {
    return invalid();
  }
  return {
    schemaVersion: HUMAN_REFERENCE_CALIBRATION_SCHEMA_VERSION,
    ...parsed,
  };
}

export function parseHumanAtomicAnnotation(
  value: unknown,
): HumanAtomicAnnotation {
  const record = asRecord(value);
  const parsedEvidence = record === null ? null : optionalEvidence(record, "evidence");
  if (
    record === null ||
    record.schemaVersion !== HUMAN_REFERENCE_CALIBRATION_SCHEMA_VERSION ||
    !hasOnlyKeys(record, [
      "schemaVersion",
      "caseId",
      "rubricId",
      "requirementId",
      "annotatorId",
      "status",
      "evidence",
    ]) ||
    !identifier(record.caseId) ||
    !identifier(record.rubricId) ||
    !identifier(record.requirementId) ||
    !opaqueId(record.annotatorId) ||
    parseStatus(record.status) === null ||
    parsedEvidence === null
  ) {
    return invalid();
  }
  return {
    schemaVersion: HUMAN_REFERENCE_CALIBRATION_SCHEMA_VERSION,
    caseId: record.caseId,
    rubricId: record.rubricId,
    requirementId: record.requirementId,
    annotatorId: record.annotatorId,
    status: parseStatus(record.status) as HumanAtomicStatus,
    ...(parsedEvidence === undefined ? {} : { evidence: parsedEvidence }),
  };
}

function parseDataKind(value: unknown): HumanAnnotationDataKind | null {
  return typeof value === "string" && dataKinds.has(value as HumanAnnotationDataKind)
    ? value as HumanAnnotationDataKind
    : null;
}

function identityKey(value: {
  readonly caseId: string;
  readonly rubricId: string;
  readonly requirementId: string;
  readonly annotatorId?: string;
}): string {
  return JSON.stringify([
    value.caseId,
    value.rubricId,
    value.requirementId,
    value.annotatorId ?? null,
  ]);
}

function taskRequirement(
  task: HumanReferenceAnnotationTask,
  annotation: HumanAtomicAnnotation,
): boolean {
  const rubric = task.rubrics.find((candidate) => candidate.id === annotation.rubricId);
  return rubric?.requirements.some((requirement) => requirement.id === annotation.requirementId) ?? false;
}

export function parseHumanAnnotationBatch(value: unknown): HumanAnnotationBatch {
  const record = asRecord(value);
  const fixture = fixtureMarker(record?.fixture);
  const dataKind = parseDataKind(record?.dataKind);
  const tasks = Array.isArray(record?.tasks)
    ? record.tasks.map(parseHumanReferenceAnnotationTask)
    : null;
  const annotations = Array.isArray(record?.annotations)
    ? record.annotations.map(parseHumanAtomicAnnotation)
    : null;
  if (
    record === null ||
    record.schemaVersion !== HUMAN_REFERENCE_CALIBRATION_SCHEMA_VERSION ||
    !hasOnlyKeys(record, [
      "schemaVersion",
      "batchId",
      "calibrationProtocolId",
      "calibrationProtocolVersion",
      "dataKind",
      "fixture",
      "tasks",
      "annotations",
    ]) ||
    !opaqueId(record.batchId) ||
    record.calibrationProtocolId !== HUMAN_REFERENCE_PROTOCOL_ID ||
    record.calibrationProtocolVersion !== HUMAN_REFERENCE_PROTOCOL_VERSION ||
    dataKind === null ||
    fixture === null ||
    (dataKind === "synthetic-fixture" && fixture === undefined) ||
    (dataKind === "human-annotation" && fixture !== undefined) ||
    tasks === null ||
    tasks.length === 0 ||
    annotations === null ||
    new Set(tasks.map((task) => task.caseId)).size !== tasks.length
  ) {
    return invalid();
  }
  const taskByCaseId = new Map(tasks.map((task) => [task.caseId, task]));
  const annotationKeys = new Set<string>();
  for (const annotation of annotations) {
    const task = taskByCaseId.get(annotation.caseId);
    if (
      task === undefined ||
      !taskRequirement(task, annotation) ||
      annotationKeys.has(identityKey(annotation))
    ) {
      return invalid();
    }
    annotationKeys.add(identityKey(annotation));
  }
  return {
    schemaVersion: HUMAN_REFERENCE_CALIBRATION_SCHEMA_VERSION,
    batchId: record.batchId,
    calibrationProtocolId: HUMAN_REFERENCE_PROTOCOL_ID,
    calibrationProtocolVersion: HUMAN_REFERENCE_PROTOCOL_VERSION,
    dataKind,
    ...(fixture === undefined ? {} : { fixture }),
    tasks,
    annotations,
  };
}

export function parseHumanReferenceAnnotationFile(
  value: unknown,
): HumanReferenceAnnotationFile {
  const record = asRecord(value);
  const requiredAnnotatorIds = parseOpaqueIdList(record?.requiredAnnotatorIds, 2);
  if (
    record === null ||
    !hasOnlyKeys(record, [
      "schemaVersion",
      "batchId",
      "calibrationProtocolId",
      "calibrationProtocolVersion",
      "dataKind",
      "fixture",
      "tasks",
      "annotations",
      "requiredAnnotatorIds",
    ]) ||
    requiredAnnotatorIds === null
  ) {
    return invalid();
  }
  const batchRecord = { ...record };
  delete batchRecord.requiredAnnotatorIds;
  const batch = parseHumanAnnotationBatch(batchRecord);
  if (batch.annotations.some((annotation) => !requiredAnnotatorIds.includes(annotation.annotatorId))) {
    return invalid();
  }
  return {
    ...batch,
    requiredAnnotatorIds,
  };
}

function parseAdjudicationDataKind(value: unknown): HumanReferenceAdjudicationDataKind | null {
  return typeof value === "string" && adjudicationDataKinds.has(value as HumanReferenceAdjudicationDataKind)
    ? value as HumanReferenceAdjudicationDataKind
    : null;
}

export function parseHumanReferenceAdjudicationFile(
  value: unknown,
): HumanReferenceAdjudicationFile {
  const record = asRecord(value);
  const fixture = fixtureMarker(record?.fixture);
  const dataKind = parseAdjudicationDataKind(record?.dataKind);
  const adjudications = Array.isArray(record?.adjudications)
    ? record.adjudications.map(parseHumanAtomicAdjudication)
    : null;
  if (
    record === null ||
    record.schemaVersion !== HUMAN_REFERENCE_CALIBRATION_SCHEMA_VERSION ||
    !hasOnlyKeys(record, [
      "schemaVersion",
      "calibrationProtocolId",
      "calibrationProtocolVersion",
      "dataKind",
      "fixture",
      "adjudications",
    ]) ||
    record.calibrationProtocolId !== HUMAN_REFERENCE_PROTOCOL_ID ||
    record.calibrationProtocolVersion !== HUMAN_REFERENCE_PROTOCOL_VERSION ||
    dataKind === null ||
    fixture === null ||
    (dataKind === "synthetic-fixture" && fixture === undefined) ||
    (dataKind === "human-adjudication" && fixture !== undefined) ||
    adjudications === null ||
    new Set(adjudications.map((adjudication) => identityKey(adjudication))).size !== adjudications.length
  ) {
    return invalid();
  }
  return {
    schemaVersion: HUMAN_REFERENCE_CALIBRATION_SCHEMA_VERSION,
    calibrationProtocolId: HUMAN_REFERENCE_PROTOCOL_ID,
    calibrationProtocolVersion: HUMAN_REFERENCE_PROTOCOL_VERSION,
    dataKind,
    ...(fixture === undefined ? {} : { fixture }),
    adjudications,
  };
}

function parseStatusRecord(
  value: unknown,
): Readonly<Record<string, HumanAtomicStatus>> | null {
  const record = asRecord(value);
  if (record === null || Object.keys(record).some((key) => !opaqueId(key))) {
    return null;
  }
  const entries = Object.entries(record);
  if (entries.length === 0 || entries.some(([, status]) => parseStatus(status) === null)) {
    return null;
  }
  return Object.fromEntries(
    entries.map(([annotatorId, status]) => [annotatorId, parseStatus(status)]),
  ) as Record<string, HumanAtomicStatus>;
}

export function parseHumanAtomicAdjudication(
  value: unknown,
): HumanAtomicAdjudication {
  const record = asRecord(value);
  const parsedEvidence = record === null ? null : optionalEvidence(record, "evidence");
  const parsedReason = record === null ? null : optionalEvidence(record, "adjudicationReason");
  const sourceAnnotatorIds = record?.sourceAnnotatorIds;
  const sourceStatuses = parseStatusRecord(record?.sourceStatuses);
  if (
    record === null ||
    record.schemaVersion !== HUMAN_REFERENCE_CALIBRATION_SCHEMA_VERSION ||
    !hasOnlyKeys(record, [
      "schemaVersion",
      "caseId",
      "rubricId",
      "requirementId",
      "sourceAnnotatorIds",
      "sourceStatuses",
      "adjudicatedStatus",
      "evidence",
      "adjudicationReason",
      "adjudicatorId",
    ]) ||
    !identifier(record.caseId) ||
    !identifier(record.rubricId) ||
    !identifier(record.requirementId) ||
    !Array.isArray(sourceAnnotatorIds) ||
    sourceAnnotatorIds.length < 2 ||
    !sourceAnnotatorIds.every(opaqueId) ||
    new Set(sourceAnnotatorIds).size !== sourceAnnotatorIds.length ||
    sourceStatuses === null ||
    Object.keys(sourceStatuses).length !== sourceAnnotatorIds.length ||
    sourceAnnotatorIds.some((annotatorId) => !(annotatorId in sourceStatuses)) ||
    parseStatus(record.adjudicatedStatus) === null ||
    parsedEvidence === null ||
    parsedReason === null ||
    (record.adjudicatorId !== undefined && !opaqueId(record.adjudicatorId))
  ) {
    return invalid();
  }
  return {
    schemaVersion: HUMAN_REFERENCE_CALIBRATION_SCHEMA_VERSION,
    caseId: record.caseId,
    rubricId: record.rubricId,
    requirementId: record.requirementId,
    sourceAnnotatorIds: [...sourceAnnotatorIds].sort(),
    sourceStatuses,
    adjudicatedStatus: parseStatus(record.adjudicatedStatus) as HumanAtomicStatus,
    ...(parsedEvidence === undefined ? {} : { evidence: parsedEvidence }),
    ...(parsedReason === undefined ? {} : { adjudicationReason: parsedReason }),
    ...(record.adjudicatorId === undefined ? {} : { adjudicatorId: record.adjudicatorId }),
  };
}

function parseReferenceDataKind(value: unknown): HumanReferenceDataKind | null {
  return typeof value === "string" && referenceDataKinds.has(value as HumanReferenceDataKind)
    ? value as HumanReferenceDataKind
    : null;
}

function parseReferenceAtomicAssessment(
  value: unknown,
): ReferenceAtomicAssessment | null {
  const record = asRecord(value);
  const sourceAnnotatorIds = parseOpaqueIdList(record?.sourceAnnotatorIds, 2);
  const provenance = record?.provenance;
  if (
    record === null ||
    !hasOnlyKeys(record, [
      "caseId",
      "rubricId",
      "requirementId",
      "status",
      "provenance",
      "sourceAnnotatorIds",
    ]) ||
    !identifier(record.caseId) ||
    !identifier(record.rubricId) ||
    !identifier(record.requirementId) ||
    parseStatus(record.status) === null ||
    (provenance !== "human_consensus" && provenance !== "human_adjudicated") ||
    sourceAnnotatorIds === null
  ) {
    return null;
  }
  return {
    caseId: record.caseId,
    rubricId: record.rubricId,
    requirementId: record.requirementId,
    status: parseStatus(record.status) as HumanAtomicStatus,
    provenance,
    sourceAnnotatorIds,
  };
}

function parseEvidenceRecord(
  value: unknown,
): Readonly<Record<string, string | undefined>> | null {
  const record = asRecord(value);
  if (record === null || Object.keys(record).some((key) => !opaqueId(key))) {
    return null;
  }
  const entries = Object.entries(record);
  if (entries.some(([, evidenceValue]) => evidenceValue !== undefined && !evidence(evidenceValue))) {
    return null;
  }
  return Object.fromEntries(entries) as Record<string, string | undefined>;
}

function parseUnresolvedDisagreement(
  value: unknown,
): HumanAtomicUnresolvedDisagreement | null {
  const record = asRecord(value);
  const statuses = parseStatusRecord(record?.statuses);
  const evidenceByAnnotator = parseEvidenceRecord(record?.evidenceByAnnotator);
  if (
    record === null ||
    !hasOnlyKeys(record, [
      "caseId",
      "rubricId",
      "requirementId",
      "statuses",
      "evidenceByAnnotator",
    ]) ||
    !identifier(record.caseId) ||
    !identifier(record.rubricId) ||
    !identifier(record.requirementId) ||
    statuses === null ||
    Object.keys(statuses).length < 2 ||
    new Set(Object.values(statuses)).size < 2 ||
    evidenceByAnnotator === null ||
    Object.keys(evidenceByAnnotator).some((annotatorId) => !(annotatorId in statuses))
  ) {
    return null;
  }
  return {
    caseId: record.caseId,
    rubricId: record.rubricId,
    requirementId: record.requirementId,
    statuses,
    evidenceByAnnotator,
  };
}

function parseMissingAssessment(
  value: unknown,
): HumanAtomicMissingAssessment | null {
  const record = asRecord(value);
  const missingAnnotatorIds = parseOpaqueIdList(record?.missingAnnotatorIds, 1);
  const presentAnnotatorIds = parseOpaqueIdList(record?.presentAnnotatorIds, 0);
  if (
    record === null ||
    !hasOnlyKeys(record, [
      "caseId",
      "rubricId",
      "requirementId",
      "missingAnnotatorIds",
      "presentAnnotatorIds",
    ]) ||
    !identifier(record.caseId) ||
    !identifier(record.rubricId) ||
    !identifier(record.requirementId) ||
    missingAnnotatorIds === null ||
    presentAnnotatorIds === null ||
    missingAnnotatorIds.some((annotatorId) => presentAnnotatorIds.includes(annotatorId))
  ) {
    return null;
  }
  return {
    caseId: record.caseId,
    rubricId: record.rubricId,
    requirementId: record.requirementId,
    missingAnnotatorIds,
    presentAnnotatorIds,
  };
}

function parseCoverage(value: unknown): {
  readonly plannedAtomicAssessments: number;
  readonly resolvedAtomicAssessments: number;
  readonly unresolvedAtomicAssessments: number;
  readonly missingAtomicAssessments: number;
  readonly referenceCoverageShare: number | null;
} | null {
  const record = asRecord(value);
  const countKeys = [
    "plannedAtomicAssessments",
    "resolvedAtomicAssessments",
    "unresolvedAtomicAssessments",
    "missingAtomicAssessments",
  ] as const;
  if (
    record === null ||
    !hasOnlyKeys(record, [...countKeys, "referenceCoverageShare"]) ||
    countKeys.some((key) =>
      typeof record[key] !== "number" ||
      !Number.isSafeInteger(record[key]) ||
      (record[key] as number) < 0,
    ) ||
    (record.referenceCoverageShare !== null && (
      typeof record.referenceCoverageShare !== "number" ||
      !Number.isFinite(record.referenceCoverageShare) ||
      record.referenceCoverageShare < 0 ||
      record.referenceCoverageShare > 1
    ))
  ) {
    return null;
  }
  return {
    plannedAtomicAssessments: record.plannedAtomicAssessments as number,
    resolvedAtomicAssessments: record.resolvedAtomicAssessments as number,
    unresolvedAtomicAssessments: record.unresolvedAtomicAssessments as number,
    missingAtomicAssessments: record.missingAtomicAssessments as number,
    referenceCoverageShare: record.referenceCoverageShare as number | null,
  };
}

export function parseHumanReferenceSet(value: unknown): HumanReferenceSet {
  const record = asRecord(value);
  const fixture = fixtureMarker(record?.fixture);
  const dataKind = parseReferenceDataKind(record?.dataKind);
  const tasks = Array.isArray(record?.tasks)
    ? record.tasks.map(parseHumanReferenceAnnotationTask)
    : null;
  const references = Array.isArray(record?.references)
    ? record.references.map(parseReferenceAtomicAssessment)
    : null;
  const unresolvedDisagreements = Array.isArray(record?.unresolvedDisagreements)
    ? record.unresolvedDisagreements.map(parseUnresolvedDisagreement)
    : null;
  const missingAnnotations = Array.isArray(record?.missingAnnotations)
    ? record.missingAnnotations.map(parseMissingAssessment)
    : null;
  const coverage = parseCoverage(record?.coverage);
  if (
    record === null ||
    record.schemaVersion !== HUMAN_REFERENCE_CALIBRATION_SCHEMA_VERSION ||
    !hasOnlyKeys(record, [
      "schemaVersion",
      "calibrationProtocolId",
      "calibrationProtocolVersion",
      "dataKind",
      "fixture",
      "humanCalibrationAvailable",
      "tasks",
      "references",
      "unresolvedDisagreements",
      "missingAnnotations",
      "coverage",
    ]) ||
    record.calibrationProtocolId !== HUMAN_REFERENCE_PROTOCOL_ID ||
    record.calibrationProtocolVersion !== HUMAN_REFERENCE_PROTOCOL_VERSION ||
    dataKind === null ||
    fixture === null ||
    (dataKind === "synthetic-fixture" && fixture === undefined) ||
    (dataKind === "human-reference" && fixture !== undefined) ||
    typeof record.humanCalibrationAvailable !== "boolean" ||
    record.humanCalibrationAvailable !== (dataKind === "human-reference") ||
    tasks === null ||
    tasks.length === 0 ||
    new Set(tasks.map((task) => task.caseId)).size !== tasks.length ||
    references === null ||
    references.some((reference) => reference === null) ||
    unresolvedDisagreements === null ||
    unresolvedDisagreements.some((disagreement) => disagreement === null) ||
    missingAnnotations === null ||
    missingAnnotations.some((missing) => missing === null) ||
    coverage === null
  ) {
    return invalid();
  }

  const taskUnits = new Set<string>();
  const taskByUnit = new Map<string, { readonly caseId: string; readonly rubricId: string; readonly requirementId: string }>();
  for (const task of tasks) {
    for (const rubric of task.rubrics) {
      for (const requirement of rubric.requirements) {
        const unit = {
          caseId: task.caseId,
          rubricId: rubric.id,
          requirementId: requirement.id,
        };
        const key = identityKey(unit);
        taskUnits.add(key);
        taskByUnit.set(key, unit);
      }
    }
  }

  const assignedUnits = new Map<string, "reference" | "unresolved" | "missing">();
  const registerUnit = (
    unit: { readonly caseId: string; readonly rubricId: string; readonly requirementId: string },
    kind: "reference" | "unresolved" | "missing",
  ): void => {
    const key = identityKey(unit);
    if (!taskByUnit.has(key) || assignedUnits.has(key)) {
      return invalid();
    }
    assignedUnits.set(key, kind);
  };
  const typedReferences = references as ReferenceAtomicAssessment[];
  const typedUnresolved = unresolvedDisagreements as HumanAtomicUnresolvedDisagreement[];
  const typedMissing = missingAnnotations as HumanAtomicMissingAssessment[];
  typedReferences.forEach((reference) => registerUnit(reference, "reference"));
  typedUnresolved.forEach((disagreement) => registerUnit(disagreement, "unresolved"));
  typedMissing.forEach((missing) => registerUnit(missing, "missing"));
  if (assignedUnits.size !== taskUnits.size) {
    return invalid();
  }

  const expectedCoverage = {
    plannedAtomicAssessments: taskUnits.size,
    resolvedAtomicAssessments: typedReferences.length,
    unresolvedAtomicAssessments: typedUnresolved.length,
    missingAtomicAssessments: typedMissing.length,
    referenceCoverageShare: taskUnits.size === 0 ? null : typedReferences.length / taskUnits.size,
  };
  if (
    coverage.plannedAtomicAssessments !== expectedCoverage.plannedAtomicAssessments ||
    coverage.resolvedAtomicAssessments !== expectedCoverage.resolvedAtomicAssessments ||
    coverage.unresolvedAtomicAssessments !== expectedCoverage.unresolvedAtomicAssessments ||
    coverage.missingAtomicAssessments !== expectedCoverage.missingAtomicAssessments ||
    coverage.resolvedAtomicAssessments + coverage.unresolvedAtomicAssessments + coverage.missingAtomicAssessments !== coverage.plannedAtomicAssessments ||
    coverage.referenceCoverageShare !== expectedCoverage.referenceCoverageShare
  ) {
    return invalid();
  }
  return {
    schemaVersion: HUMAN_REFERENCE_CALIBRATION_SCHEMA_VERSION,
    calibrationProtocolId: HUMAN_REFERENCE_PROTOCOL_ID,
    calibrationProtocolVersion: HUMAN_REFERENCE_PROTOCOL_VERSION,
    dataKind,
    ...(fixture === undefined ? {} : { fixture }),
    humanCalibrationAvailable: record.humanCalibrationAvailable,
    tasks,
    references: typedReferences,
    unresolvedDisagreements: typedUnresolved,
    missingAnnotations: typedMissing,
    coverage,
  };
}

export function assertHumanReferenceTaskInputBoundary(
  task: HumanReferenceAnnotationTask,
): void {
  parseHumanReferenceAnnotationTask(task);
}

/**
 * Validates a complete stream for one annotator/task. Batch ingestion may keep
 * a partial stream to report availability, but this explicit check fails closed
 * on every missing, duplicate, unexpected, or wrong-owner atomic unit.
 */
export function assertHumanAnnotatorTaskComplete(
  task: HumanReferenceAnnotationTask,
  annotatorId: string,
  annotations: readonly HumanAtomicAnnotation[],
): void {
  const parsedTask = parseHumanReferenceAnnotationTask(task);
  if (!opaqueId(annotatorId) || !Array.isArray(annotations)) {
    return invalid();
  }
  const parsedAnnotations = annotations.map((annotation) => parseHumanAtomicAnnotation(annotation));
  const expected = new Set(
    parsedTask.rubrics.flatMap((rubric) => rubric.requirements.map((requirement) =>
      JSON.stringify([parsedTask.caseId, rubric.id, requirement.id]),
    )),
  );
  const observed = new Set<string>();
  for (const annotation of parsedAnnotations) {
    const key = JSON.stringify([
      annotation.caseId,
      annotation.rubricId,
      annotation.requirementId,
    ]);
    if (
      annotation.annotatorId !== annotatorId ||
      !expected.has(key) ||
      observed.has(key)
    ) {
      return invalid();
    }
    observed.add(key);
  }
  if (observed.size !== expected.size) {
    return invalid();
  }
}

export const assertHumanAnnotationTaskComplete = assertHumanAnnotatorTaskComplete;
