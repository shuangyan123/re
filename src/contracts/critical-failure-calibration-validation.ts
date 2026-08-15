import { BenchmarkConfigurationError } from "./errors.js";
import {
  CALIBRATION_CRITICAL_FAILURE_SCHEMA_VERSION,
  CALIBRATION_CRITICAL_FAILURE_REFERENCE_SET_SCHEMA_VERSION,
  type CalibrationCriticalFailureAdjudicationFile,
  type CalibrationCriticalFailureAnnotationFile,
  type CalibrationCriticalFailureReferenceSet,
  type CalibrationCriticalFailureTarget,
  type CalibrationCriticalFailureTargetFile,
  type CriticalFailureAdjudication,
  type CriticalFailureAdjudicationDataKind,
  type CriticalFailureAnnotationDataKind,
  type CriticalFailureAnnotationDecision,
  type CriticalFailureTargetDataKind,
  type HumanCriticalFailureAnnotation,
} from "./critical-failure-calibration.js";
import type {
  CalibrationCandidateResponse,
  CalibrationCandidateResponseFile,
  SyntheticFixtureMarker,
} from "./calibration.js";
import {
  TUTOR_EVAL_CRITICAL_FAILURE_SEVERITIES,
  TUTOR_EVAL_CRITICAL_FAILURE_TYPES,
  type TutorCriticalFailure,
  type TutorCriticalFailureSeverity,
  type TutorEvalDataset,
} from "./tutor-eval.js";
import { TUTOR_RESPONSE_REPLAY_COMPATIBILITIES } from "./tutor-response-replay.js";

type UnknownRecord = Record<string, unknown>;

const annotationDecisions = new Set<CriticalFailureAnnotationDecision>([
  "PRESENT",
  "ABSENT",
  "UNSURE",
]);
const criticalFailureTypes = new Set<TutorCriticalFailure>(
  TUTOR_EVAL_CRITICAL_FAILURE_TYPES,
);
const criticalFailureSeverities = new Set<TutorCriticalFailureSeverity>(
  TUTOR_EVAL_CRITICAL_FAILURE_SEVERITIES,
);
const annotationDataKinds = new Set<CriticalFailureAnnotationDataKind>([
  "human-critical-failure-annotation",
  "synthetic-fixture",
]);
const adjudicationDataKinds = new Set<CriticalFailureAdjudicationDataKind>([
  "human-critical-failure-adjudication",
  "synthetic-fixture",
]);
const targetDataKinds = new Set<CriticalFailureTargetDataKind>([
  "critical-failure-targets",
  "synthetic-fixture",
]);

function asRecord(value: unknown): UnknownRecord | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as UnknownRecord)
    : null;
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function identifier(value: unknown): value is string {
  return nonEmptyString(value) && value.length <= 200 && !/[\s|]/u.test(value);
}

function pseudonymousId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/u.test(value) &&
    !value.includes("@")
  );
}

function validTimestamp(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 && !Number.isNaN(Date.parse(value));
}

function hasForbiddenMachineJudgmentField(record: UnknownRecord): boolean {
  return Object.keys(record).some((key) =>
    /judge|provider|model|prompt|confidence|raw.?payload|chain.?of.?thought/iu.test(key),
  );
}

function hasDuplicateIds(values: readonly string[]): boolean {
  return new Set(values).size !== values.length;
}

function parseFixtureMarker(
  value: unknown,
): SyntheticFixtureMarker | null | undefined {
  if (value === undefined) {
    return undefined;
  }
  const record = asRecord(value);
  if (
    record === null ||
    record.synthetic !== true ||
    record.notHumanCalibrationData !== true
  ) {
    return null;
  }
  return { synthetic: true, notHumanCalibrationData: true };
}

function readOptionalString(
  record: UnknownRecord,
  key: string,
  maxLength = 2000,
): string | null | undefined {
  if (!(key in record)) {
    return undefined;
  }
  return nonEmptyString(record[key]) && record[key].length <= maxLength
    ? record[key]
    : null;
}

function readOptionalEnum<T extends string>(
  record: UnknownRecord,
  key: string,
  values: ReadonlySet<T>,
): T | null | undefined {
  if (!(key in record)) {
    return undefined;
  }
  return values.has(record[key] as T) ? (record[key] as T) : null;
}

function parseAmbiguity(
  value: unknown,
): HumanCriticalFailureAnnotation["ambiguity"] | null {
  const record = asRecord(value);
  if (record === null || typeof record.present !== "boolean") {
    return null;
  }
  const reason = readOptionalString(record, "reason");
  if (reason === null) {
    return null;
  }
  return {
    present: record.present,
    ...(reason === undefined ? {} : { reason }),
  };
}

function parseTargetValue(value: unknown): CalibrationCriticalFailureTarget | null {
  const record = asRecord(value);
  if (
    record === null ||
    hasForbiddenMachineJudgmentField(record) ||
    !identifier(record.targetId) ||
    !identifier(record.datasetId) ||
    !identifier(record.datasetVersion) ||
    !identifier(record.caseId) ||
    !identifier(record.caseVersion) ||
    !identifier(record.responseId) ||
    !criticalFailureTypes.has(record.failureType as TutorCriticalFailure)
  ) {
    return null;
  }
  return {
    targetId: record.targetId,
    datasetId: record.datasetId,
    datasetVersion: record.datasetVersion,
    caseId: record.caseId,
    caseVersion: record.caseVersion,
    responseId: record.responseId,
    failureType: record.failureType as TutorCriticalFailure,
  };
}

function parseTargetDataKind(value: unknown): CriticalFailureTargetDataKind | null {
  return targetDataKinds.has(value as CriticalFailureTargetDataKind)
    ? (value as CriticalFailureTargetDataKind)
    : null;
}

export function parseCalibrationCriticalFailureTargetFile(
  value: unknown,
): CalibrationCriticalFailureTargetFile {
  const record = asRecord(value);
  const dataKind = parseTargetDataKind(record?.dataKind);
  const fixture = parseFixtureMarker(record?.fixture);
  const targets = Array.isArray(record?.targets)
    ? record.targets.map(parseTargetValue)
    : null;
  if (
    record === null ||
    hasForbiddenMachineJudgmentField(record) ||
    record.schemaVersion !== CALIBRATION_CRITICAL_FAILURE_SCHEMA_VERSION ||
    dataKind === null ||
    !identifier(record.datasetId) ||
    !identifier(record.datasetVersion) ||
    targets === null ||
    targets.some((target): target is null => target === null) ||
    hasDuplicateIds(
      (targets as CalibrationCriticalFailureTarget[]).map((target) => target.targetId),
    ) ||
    (targets as CalibrationCriticalFailureTarget[]).some(
      (target) =>
        target.datasetId !== record.datasetId ||
        target.datasetVersion !== record.datasetVersion,
    ) ||
    (dataKind === "synthetic-fixture" && fixture === undefined) ||
    fixture === null ||
    (dataKind !== "synthetic-fixture" && fixture !== undefined)
  ) {
    throw new BenchmarkConfigurationError("calibration_critical_failure_target_invalid");
  }
  return {
    schemaVersion: CALIBRATION_CRITICAL_FAILURE_SCHEMA_VERSION,
    dataKind,
    ...(fixture === undefined ? {} : { fixture }),
    datasetId: record.datasetId,
    datasetVersion: record.datasetVersion,
    targets: targets as CalibrationCriticalFailureTarget[],
  };
}

function parseAnnotationValue(value: unknown): HumanCriticalFailureAnnotation | null {
  const record = asRecord(value);
  const decision = record?.decision as CriticalFailureAnnotationDecision;
  const failureType =
    record === null
      ? undefined
      : readOptionalEnum(record, "failureType", criticalFailureTypes);
  const severity =
    record === null
      ? undefined
      : readOptionalEnum(record, "severity", criticalFailureSeverities);
  const evidence = record === null ? undefined : readOptionalString(record, "evidence", 2000);
  const ambiguity =
    record?.ambiguity === undefined ? undefined : parseAmbiguity(record.ambiguity);
  if (
    record === null ||
    hasForbiddenMachineJudgmentField(record) ||
    record.schemaVersion !== CALIBRATION_CRITICAL_FAILURE_SCHEMA_VERSION ||
    !identifier(record.annotationId) ||
    !identifier(record.targetId) ||
    !identifier(record.datasetId) ||
    !identifier(record.datasetVersion) ||
    !identifier(record.caseId) ||
    !identifier(record.caseVersion) ||
    !identifier(record.responseId) ||
    failureType === null ||
    !pseudonymousId(record.reviewerId) ||
    !annotationDecisions.has(decision) ||
    severity === null ||
    evidence === null ||
    ambiguity === null ||
    !validTimestamp(record.createdAt) ||
    (decision === "PRESENT" && (failureType === undefined || severity === undefined)) ||
    (decision !== "PRESENT" && (failureType !== undefined || severity !== undefined))
  ) {
    return null;
  }
  return {
    schemaVersion: CALIBRATION_CRITICAL_FAILURE_SCHEMA_VERSION,
    annotationId: record.annotationId,
    targetId: record.targetId,
    datasetId: record.datasetId,
    datasetVersion: record.datasetVersion,
    caseId: record.caseId,
    caseVersion: record.caseVersion,
    responseId: record.responseId,
    reviewerId: record.reviewerId,
    decision,
    ...(failureType === undefined ? {} : { failureType }),
    ...(severity === undefined ? {} : { severity }),
    ...(evidence === undefined ? {} : { evidence }),
    ...(ambiguity === undefined ? {} : { ambiguity }),
    createdAt: record.createdAt,
  };
}

function parseAnnotationDataKind(value: unknown): CriticalFailureAnnotationDataKind | null {
  return annotationDataKinds.has(value as CriticalFailureAnnotationDataKind)
    ? (value as CriticalFailureAnnotationDataKind)
    : null;
}

export function parseHumanCriticalFailureAnnotation(
  value: unknown,
): HumanCriticalFailureAnnotation {
  const annotation = parseAnnotationValue(value);
  if (annotation === null) {
    throw new BenchmarkConfigurationError("calibration_critical_failure_annotation_invalid");
  }
  return annotation;
}

export function parseCalibrationCriticalFailureAnnotationFile(
  value: unknown,
): CalibrationCriticalFailureAnnotationFile {
  const record = asRecord(value);
  const dataKind = parseAnnotationDataKind(record?.dataKind);
  const fixture = parseFixtureMarker(record?.fixture);
  const annotations = Array.isArray(record?.annotations)
    ? record.annotations.map(parseAnnotationValue)
    : null;
  if (
    record === null ||
    hasForbiddenMachineJudgmentField(record) ||
    record.schemaVersion !== CALIBRATION_CRITICAL_FAILURE_SCHEMA_VERSION ||
    dataKind === null ||
    !identifier(record.datasetId) ||
    !identifier(record.datasetVersion) ||
    !pseudonymousId(record.reviewerId) ||
    annotations === null ||
    annotations.some((annotation): annotation is null => annotation === null) ||
    hasDuplicateIds(
      (annotations as HumanCriticalFailureAnnotation[]).map(
        (annotation) => annotation.annotationId,
      ),
    ) ||
    (annotations as HumanCriticalFailureAnnotation[]).some(
      (annotation) =>
        annotation.datasetId !== record.datasetId ||
        annotation.datasetVersion !== record.datasetVersion ||
        annotation.reviewerId !== record.reviewerId,
    ) ||
    (dataKind === "synthetic-fixture" && fixture === undefined) ||
    fixture === null ||
    (dataKind !== "synthetic-fixture" && fixture !== undefined)
  ) {
    throw new BenchmarkConfigurationError("calibration_critical_failure_annotation_invalid");
  }
  return {
    schemaVersion: CALIBRATION_CRITICAL_FAILURE_SCHEMA_VERSION,
    dataKind,
    ...(fixture === undefined ? {} : { fixture }),
    datasetId: record.datasetId,
    datasetVersion: record.datasetVersion,
    reviewerId: record.reviewerId,
    annotations: annotations as HumanCriticalFailureAnnotation[],
  };
}

function parseAdjudicationValue(value: unknown): CriticalFailureAdjudication | null {
  const record = asRecord(value);
  const sourceAnnotationIds = record?.sourceAnnotationIds;
  const finalDecision = record?.finalDecision;
  const finalFailureType =
    record === null
      ? undefined
      : readOptionalEnum(record, "finalFailureType", criticalFailureTypes);
  const finalSeverity =
    record === null
      ? undefined
      : readOptionalEnum(record, "finalSeverity", criticalFailureSeverities);
  if (
    record === null ||
    record.schemaVersion !== CALIBRATION_CRITICAL_FAILURE_SCHEMA_VERSION ||
    !identifier(record.adjudicationId) ||
    !identifier(record.targetId) ||
    !identifier(record.datasetId) ||
    !identifier(record.datasetVersion) ||
    !identifier(record.caseId) ||
    !identifier(record.caseVersion) ||
    !identifier(record.responseId) ||
    !criticalFailureTypes.has(record.failureType as TutorCriticalFailure) ||
    !Array.isArray(sourceAnnotationIds) ||
    sourceAnnotationIds.length < 2 ||
    !sourceAnnotationIds.every(identifier) ||
    hasDuplicateIds(sourceAnnotationIds) ||
    (finalDecision !== "PRESENT" && finalDecision !== "ABSENT") ||
    finalFailureType === null ||
    finalSeverity === null ||
    !nonEmptyString(record.rationale) ||
    record.rationale.length > 4000 ||
    !pseudonymousId(record.adjudicatorId) ||
    !validTimestamp(record.createdAt) ||
    (finalDecision === "PRESENT" &&
      (finalFailureType === undefined || finalSeverity === undefined)) ||
    (finalDecision === "ABSENT" &&
      (finalFailureType !== undefined || finalSeverity !== undefined))
  ) {
    return null;
  }
  return {
    schemaVersion: CALIBRATION_CRITICAL_FAILURE_SCHEMA_VERSION,
    adjudicationId: record.adjudicationId,
    targetId: record.targetId,
    datasetId: record.datasetId,
    datasetVersion: record.datasetVersion,
    caseId: record.caseId,
    caseVersion: record.caseVersion,
    responseId: record.responseId,
    failureType: record.failureType as TutorCriticalFailure,
    sourceAnnotationIds: sourceAnnotationIds as string[],
    finalDecision,
    ...(finalFailureType === undefined ? {} : { finalFailureType }),
    ...(finalSeverity === undefined ? {} : { finalSeverity }),
    rationale: record.rationale,
    adjudicatorId: record.adjudicatorId,
    createdAt: record.createdAt,
  };
}

function parseAdjudicationDataKind(value: unknown): CriticalFailureAdjudicationDataKind | null {
  return adjudicationDataKinds.has(value as CriticalFailureAdjudicationDataKind)
    ? (value as CriticalFailureAdjudicationDataKind)
    : null;
}

export function parseCriticalFailureAdjudication(
  value: unknown,
): CriticalFailureAdjudication {
  const adjudication = parseAdjudicationValue(value);
  if (adjudication === null) {
    throw new BenchmarkConfigurationError("calibration_critical_failure_adjudication_invalid");
  }
  return adjudication;
}

export function parseCalibrationCriticalFailureAdjudicationFile(
  value: unknown,
): CalibrationCriticalFailureAdjudicationFile {
  const record = asRecord(value);
  const dataKind = parseAdjudicationDataKind(record?.dataKind);
  const fixture = parseFixtureMarker(record?.fixture);
  const adjudications = Array.isArray(record?.adjudications)
    ? record.adjudications.map(parseAdjudicationValue)
    : null;
  if (
    record === null ||
    record.schemaVersion !== CALIBRATION_CRITICAL_FAILURE_SCHEMA_VERSION ||
    dataKind === null ||
    !identifier(record.datasetId) ||
    !identifier(record.datasetVersion) ||
    !pseudonymousId(record.adjudicatorId) ||
    adjudications === null ||
    adjudications.some((adjudication): adjudication is null => adjudication === null) ||
    hasDuplicateIds(
      (adjudications as CriticalFailureAdjudication[]).map(
        (adjudication) => adjudication.adjudicationId,
      ),
    ) ||
    (adjudications as CriticalFailureAdjudication[]).some(
      (adjudication) =>
        adjudication.datasetId !== record.datasetId ||
        adjudication.datasetVersion !== record.datasetVersion ||
        adjudication.adjudicatorId !== record.adjudicatorId,
    ) ||
    (dataKind === "synthetic-fixture" && fixture === undefined) ||
    fixture === null ||
    (dataKind !== "synthetic-fixture" && fixture !== undefined)
  ) {
    throw new BenchmarkConfigurationError("calibration_critical_failure_adjudication_invalid");
  }
  return {
    schemaVersion: CALIBRATION_CRITICAL_FAILURE_SCHEMA_VERSION,
    dataKind,
    ...(fixture === undefined ? {} : { fixture }),
    datasetId: record.datasetId,
    datasetVersion: record.datasetVersion,
    adjudicatorId: record.adjudicatorId,
    adjudications: adjudications as CriticalFailureAdjudication[],
  };
}

export type CriticalFailureCalibrationValidationIssueCode =
  | "critical_candidate_dataset_mismatch"
  | "critical_candidate_duplicate_response"
  | "critical_candidate_unknown_case"
  | "critical_candidate_case_version_mismatch"
  | "critical_candidate_replay_invalid"
  | "critical_target_dataset_mismatch"
  | "critical_target_duplicate_id"
  | "critical_target_unknown_response"
  | "critical_target_case_version_mismatch"
  | "critical_target_unknown_case"
  | "critical_target_unknown_failure_type"
  | "critical_annotation_dataset_mismatch"
  | "critical_annotation_duplicate_id"
  | "critical_annotation_duplicate_reviewer_judgment"
  | "critical_annotation_unknown_target"
  | "critical_annotation_target_mismatch"
  | "critical_duplicate_reviewer_stream"
  | "critical_mixed_annotation_data_kind"
  | "critical_adjudication_dataset_mismatch"
  | "critical_adjudication_duplicate_id"
  | "critical_adjudication_unknown_target"
  | "critical_adjudication_duplicate_target"
  | "critical_adjudication_unknown_annotation"
  | "critical_adjudication_target_mismatch"
  | "critical_adjudication_duplicate_source_reviewer"
  | "critical_adjudication_data_kind_mismatch"
  | "critical_reviewer_pair_missing"
  | "critical_target_unannotated"
  | "critical_adjudication_missing"
  | "critical_adjudication_source_incomplete";

export interface CriticalFailureCalibrationValidationIssue {
  readonly code: CriticalFailureCalibrationValidationIssueCode;
  readonly targetId?: string;
  readonly annotationId?: string;
  readonly adjudicationId?: string;
  readonly responseId?: string;
  readonly caseId?: string;
}

export interface CriticalFailureCalibrationValidationInput {
  readonly dataset: TutorEvalDataset;
  readonly candidates: CalibrationCandidateResponseFile;
  readonly targetFile: CalibrationCriticalFailureTargetFile;
  readonly annotationFiles: readonly CalibrationCriticalFailureAnnotationFile[];
  readonly adjudicationFile?: CalibrationCriticalFailureAdjudicationFile;
}

function addIssue(
  issues: CriticalFailureCalibrationValidationIssue[],
  code: CriticalFailureCalibrationValidationIssueCode,
  details: Omit<CriticalFailureCalibrationValidationIssue, "code"> = {},
): void {
  issues.push({ code, ...details });
}

function sortedIssues(
  issues: readonly CriticalFailureCalibrationValidationIssue[],
): CriticalFailureCalibrationValidationIssue[] {
  return [...issues].sort((left, right) =>
    JSON.stringify(left).localeCompare(JSON.stringify(right)),
  );
}

function targetDetails(
  target: CalibrationCriticalFailureTarget | undefined,
): Omit<CriticalFailureCalibrationValidationIssue, "code"> {
  return target === undefined
    ? {}
    : {
        targetId: target.targetId,
        responseId: target.responseId,
        caseId: target.caseId,
      };
}

function targetIdentityMatches(
  annotation: HumanCriticalFailureAnnotation | CriticalFailureAdjudication,
  target: CalibrationCriticalFailureTarget,
): boolean {
  return (
    annotation.targetId === target.targetId &&
    annotation.datasetId === target.datasetId &&
    annotation.datasetVersion === target.datasetVersion &&
    annotation.caseId === target.caseId &&
    annotation.caseVersion === target.caseVersion &&
    annotation.responseId === target.responseId &&
    ("decision" in annotation
      ? annotation.decision !== "PRESENT" || annotation.failureType === target.failureType
      : annotation.failureType === target.failureType)
  );
}

function validateReplayProvenance(
  response: CalibrationCandidateResponse,
  dataset: TutorEvalDataset,
): boolean {
  const replay = response.semanticReplay;
  if (replay === undefined) {
    return true;
  }
  if (
    !TUTOR_RESPONSE_REPLAY_COMPATIBILITIES.some(
      (compatibility) =>
        compatibility.compatibilityId === replay.compatibilityId &&
        compatibility.sourceDatasetId === replay.sourceDatasetId &&
        compatibility.sourceDatasetVersion === replay.sourceDatasetVersion &&
        compatibility.targetDatasetId === replay.targetDatasetId &&
        compatibility.targetDatasetVersion === replay.targetDatasetVersion &&
        compatibility.caseVersionMappings.length === replay.caseVersionMappings.length &&
        compatibility.caseVersionMappings.every((mapping) =>
          replay.caseVersionMappings.some(
            (candidate) =>
              candidate.caseId === mapping.caseId &&
              candidate.sourceVersion === mapping.sourceVersion &&
              candidate.targetVersion === mapping.targetVersion,
          ),
        ),
    ) ||
    replay.targetDatasetId !== dataset.id ||
    replay.targetDatasetVersion !== dataset.version ||
    replay.sourceDatasetId !== dataset.id ||
    replay.sourceDatasetVersion === replay.targetDatasetVersion ||
    replay.caseVersionMappings.length === 0
  ) {
    return false;
  }
  const mappedCases = new Set<string>();
  for (const mapping of replay.caseVersionMappings) {
    if (mappedCases.has(mapping.caseId)) {
      return false;
    }
    mappedCases.add(mapping.caseId);
    const targetCase = dataset.cases.find((candidate) => candidate.id === mapping.caseId);
    if (
      targetCase === undefined ||
      targetCase.version !== mapping.targetVersion ||
      mapping.sourceVersion === mapping.targetVersion
    ) {
      return false;
    }
  }
  const responseMapping = replay.caseVersionMappings.find(
    (mapping) => mapping.caseId === response.caseId,
  );
  return responseMapping === undefined || responseMapping.targetVersion === response.caseVersion;
}

export function findCriticalFailureCalibrationValidationIssues(
  input: CriticalFailureCalibrationValidationInput,
): CriticalFailureCalibrationValidationIssue[] {
  const issues: CriticalFailureCalibrationValidationIssue[] = [];
  const casesById = new Map(input.dataset.cases.map((caseValue) => [caseValue.id, caseValue]));
  const responsesById = new Map<string, CalibrationCandidateResponse>();
  if (
    input.candidates.datasetId !== input.dataset.id ||
    input.candidates.datasetVersion !== input.dataset.version ||
    input.targetFile.datasetId !== input.dataset.id ||
    input.targetFile.datasetVersion !== input.dataset.version
  ) {
    addIssue(issues, "critical_candidate_dataset_mismatch");
  }
  for (const response of input.candidates.responses) {
    if (
      response.datasetId !== input.candidates.datasetId ||
      response.datasetVersion !== input.candidates.datasetVersion
    ) {
      addIssue(issues, "critical_candidate_dataset_mismatch", {
        responseId: response.responseId,
      });
    }
    if (responsesById.has(response.responseId)) {
      addIssue(issues, "critical_candidate_duplicate_response", {
        responseId: response.responseId,
      });
    }
    responsesById.set(response.responseId, response);
    const caseValue = casesById.get(response.caseId);
    if (caseValue === undefined) {
      addIssue(issues, "critical_candidate_unknown_case", {
        responseId: response.responseId,
        caseId: response.caseId,
      });
    } else if (caseValue.version !== response.caseVersion) {
      addIssue(issues, "critical_candidate_case_version_mismatch", {
        responseId: response.responseId,
        caseId: response.caseId,
      });
    }
    if (!validateReplayProvenance(response, input.dataset)) {
      addIssue(issues, "critical_candidate_replay_invalid", {
        responseId: response.responseId,
        caseId: response.caseId,
      });
    }
  }

  const targetsById = new Map<string, CalibrationCriticalFailureTarget>();
  for (const target of input.targetFile.targets) {
    if (
      target.datasetId !== input.targetFile.datasetId ||
      target.datasetVersion !== input.targetFile.datasetVersion
    ) {
      addIssue(issues, "critical_target_dataset_mismatch", targetDetails(target));
    }
    if (targetsById.has(target.targetId)) {
      addIssue(issues, "critical_target_duplicate_id", targetDetails(target));
    }
    targetsById.set(target.targetId, target);
    if (!criticalFailureTypes.has(target.failureType)) {
      addIssue(issues, "critical_target_unknown_failure_type", targetDetails(target));
    }
    const response = responsesById.get(target.responseId);
    if (response === undefined) {
      addIssue(issues, "critical_target_unknown_response", targetDetails(target));
    } else if (
      response.caseId !== target.caseId ||
      response.caseVersion !== target.caseVersion
    ) {
      addIssue(issues, "critical_target_case_version_mismatch", targetDetails(target));
    }
    const caseValue = casesById.get(target.caseId);
    if (caseValue === undefined) {
      addIssue(issues, "critical_target_unknown_case", targetDetails(target));
    } else if (caseValue.version !== target.caseVersion) {
      addIssue(issues, "critical_target_case_version_mismatch", targetDetails(target));
    }
  }

  const annotationIds = new Map<string, HumanCriticalFailureAnnotation>();
  const annotationByTarget = new Map<string, HumanCriticalFailureAnnotation[]>();
  const annotationKinds = new Set<CriticalFailureAnnotationDataKind>();
  const reviewerStreams = new Set<string>();
  for (const file of input.annotationFiles) {
    if (reviewerStreams.has(file.reviewerId)) {
      addIssue(issues, "critical_duplicate_reviewer_stream");
    }
    reviewerStreams.add(file.reviewerId);
    annotationKinds.add(file.dataKind);
    if (
      file.datasetId !== input.dataset.id ||
      file.datasetVersion !== input.dataset.version
    ) {
      addIssue(issues, "critical_annotation_dataset_mismatch");
    }
    for (const annotation of file.annotations) {
      if (
        annotation.datasetId !== file.datasetId ||
        annotation.datasetVersion !== file.datasetVersion
      ) {
        addIssue(issues, "critical_annotation_dataset_mismatch", {
          annotationId: annotation.annotationId,
          targetId: annotation.targetId,
        });
      }
      if (annotationIds.has(annotation.annotationId)) {
        addIssue(issues, "critical_annotation_duplicate_id", {
          annotationId: annotation.annotationId,
          targetId: annotation.targetId,
        });
      }
      annotationIds.set(annotation.annotationId, annotation);
      const target = targetsById.get(annotation.targetId);
      if (target === undefined) {
        addIssue(issues, "critical_annotation_unknown_target", {
          annotationId: annotation.annotationId,
          targetId: annotation.targetId,
        });
      } else if (!targetIdentityMatches(annotation, target)) {
        addIssue(issues, "critical_annotation_target_mismatch", {
          annotationId: annotation.annotationId,
          targetId: annotation.targetId,
          responseId: annotation.responseId,
          caseId: annotation.caseId,
        });
      }
      const targetAnnotations = annotationByTarget.get(annotation.targetId) ?? [];
      if (targetAnnotations.some((item) => item.reviewerId === annotation.reviewerId)) {
        addIssue(issues, "critical_annotation_duplicate_reviewer_judgment", {
          annotationId: annotation.annotationId,
          targetId: annotation.targetId,
          responseId: annotation.responseId,
          caseId: annotation.caseId,
        });
      }
      targetAnnotations.push(annotation);
      annotationByTarget.set(annotation.targetId, targetAnnotations);
    }
  }
  if (annotationKinds.size > 1) {
    addIssue(issues, "critical_mixed_annotation_data_kind");
  }

  const adjudicationIds = new Set<string>();
  const adjudicationByTarget = new Map<string, CriticalFailureAdjudication>();
  const adjudicationFile = input.adjudicationFile;
  if (adjudicationFile !== undefined) {
    if (
      adjudicationFile.datasetId !== input.dataset.id ||
      adjudicationFile.datasetVersion !== input.dataset.version
    ) {
      addIssue(issues, "critical_adjudication_dataset_mismatch");
    }
    if (annotationKinds.size === 1) {
      const expectedKind = annotationKinds.has("synthetic-fixture")
        ? "synthetic-fixture"
        : "human-critical-failure-adjudication";
      if (adjudicationFile.dataKind !== expectedKind) {
        addIssue(issues, "critical_adjudication_data_kind_mismatch");
      }
    }
    for (const adjudication of adjudicationFile.adjudications) {
      if (
        adjudication.datasetId !== adjudicationFile.datasetId ||
        adjudication.datasetVersion !== adjudicationFile.datasetVersion
      ) {
        addIssue(issues, "critical_adjudication_dataset_mismatch", {
          adjudicationId: adjudication.adjudicationId,
          targetId: adjudication.targetId,
        });
      }
      if (adjudicationIds.has(adjudication.adjudicationId)) {
        addIssue(issues, "critical_adjudication_duplicate_id", {
          adjudicationId: adjudication.adjudicationId,
          targetId: adjudication.targetId,
        });
      }
      adjudicationIds.add(adjudication.adjudicationId);
      const target = targetsById.get(adjudication.targetId);
      if (target === undefined) {
        addIssue(issues, "critical_adjudication_unknown_target", {
          adjudicationId: adjudication.adjudicationId,
          targetId: adjudication.targetId,
        });
      } else {
        if (adjudicationByTarget.has(adjudication.targetId)) {
          addIssue(issues, "critical_adjudication_duplicate_target", {
            adjudicationId: adjudication.adjudicationId,
            targetId: adjudication.targetId,
          });
        }
        adjudicationByTarget.set(adjudication.targetId, adjudication);
        if (!targetIdentityMatches(adjudication, target)) {
          addIssue(issues, "critical_adjudication_target_mismatch", {
            adjudicationId: adjudication.adjudicationId,
            targetId: adjudication.targetId,
          });
        }
        if (
          adjudication.finalDecision === "PRESENT" &&
          adjudication.finalFailureType !== target.failureType
        ) {
          addIssue(issues, "critical_adjudication_target_mismatch", {
            adjudicationId: adjudication.adjudicationId,
            targetId: adjudication.targetId,
          });
        }
      }
      const sourceAnnotations = adjudication.sourceAnnotationIds.map((id) =>
        annotationIds.get(id),
      );
      if (sourceAnnotations.some((annotation) => annotation === undefined)) {
        addIssue(issues, "critical_adjudication_unknown_annotation", {
          adjudicationId: adjudication.adjudicationId,
          targetId: adjudication.targetId,
        });
        continue;
      }
      const typedSourceAnnotations = sourceAnnotations as HumanCriticalFailureAnnotation[];
      if (
        typedSourceAnnotations.some(
          (annotation) => annotation.targetId !== adjudication.targetId,
        )
      ) {
        addIssue(issues, "critical_adjudication_target_mismatch", {
          adjudicationId: adjudication.adjudicationId,
          targetId: adjudication.targetId,
        });
      }
      if (
        new Set(typedSourceAnnotations.map((annotation) => annotation.reviewerId)).size !==
        typedSourceAnnotations.length
      ) {
        addIssue(issues, "critical_adjudication_duplicate_source_reviewer", {
          adjudicationId: adjudication.adjudicationId,
          targetId: adjudication.targetId,
        });
      }
    }
  }

  return sortedIssues(issues);
}

export function findCriticalFailureCalibrationReferenceReadinessIssues(
  input: CriticalFailureCalibrationValidationInput,
): CriticalFailureCalibrationValidationIssue[] {
  const issues = findCriticalFailureCalibrationValidationIssues(input);
  const annotations = input.annotationFiles.flatMap((file) => file.annotations);
  if (annotations.length === 0) {
    return sortedIssues(issues);
  }
  const annotationsByTarget = new Map<string, HumanCriticalFailureAnnotation[]>();
  for (const annotation of annotations) {
    annotationsByTarget.set(annotation.targetId, [
      ...(annotationsByTarget.get(annotation.targetId) ?? []),
      annotation,
    ]);
  }
  const adjudicationsByTarget = new Map<string, CriticalFailureAdjudication>();
  for (const adjudication of input.adjudicationFile?.adjudications ?? []) {
    adjudicationsByTarget.set(adjudication.targetId, adjudication);
  }
  for (const target of input.targetFile.targets) {
    const grouped = annotationsByTarget.get(target.targetId) ?? [];
    if (grouped.length === 0) {
      addIssue(issues, "critical_target_unannotated", targetDetails(target));
      continue;
    }
    if (new Set(grouped.map((annotation) => annotation.reviewerId)).size < 2) {
      addIssue(issues, "critical_reviewer_pair_missing", targetDetails(target));
    }
    const exact =
      grouped.length > 0 &&
      grouped.every((annotation) => annotation.decision === grouped[0]?.decision) &&
      grouped[0]?.decision !== "UNSURE" &&
      (grouped[0]?.decision === "ABSENT" ||
        grouped.every((annotation) => annotation.severity === grouped[0]?.severity));
    if (!exact) {
      const adjudication = adjudicationsByTarget.get(target.targetId);
      if (adjudication === undefined) {
        addIssue(issues, "critical_adjudication_missing", targetDetails(target));
      } else {
        const sourceIds = new Set(adjudication.sourceAnnotationIds);
        const annotationIds = new Set(grouped.map((annotation) => annotation.annotationId));
        if (
          sourceIds.size !== annotationIds.size ||
          [...annotationIds].some((annotationId) => !sourceIds.has(annotationId))
        ) {
          addIssue(issues, "critical_adjudication_source_incomplete", {
            adjudicationId: adjudication.adjudicationId,
            ...targetDetails(target),
          });
        }
      }
    }
  }
  return sortedIssues(issues);
}

export function assertValidCriticalFailureCalibrationData(
  input: CriticalFailureCalibrationValidationInput,
): void {
  if (findCriticalFailureCalibrationValidationIssues(input).length > 0) {
    throw new BenchmarkConfigurationError("calibration_critical_failure_data_invalid");
  }
}

export function assertCriticalFailureCalibrationReferenceReady(
  input: CriticalFailureCalibrationValidationInput,
): void {
  if (findCriticalFailureCalibrationReferenceReadinessIssues(input).length > 0) {
    throw new BenchmarkConfigurationError("calibration_critical_failure_reference_invalid");
  }
}

export function assertValidCriticalFailureReferenceSet(
  value: unknown,
): asserts value is CalibrationCriticalFailureReferenceSet {
  const record = asRecord(value);
  const dataKind = record?.dataKind;
  const labels = Array.isArray(record?.labels) ? record.labels : null;
  const labelRecords = labels?.map(asRecord) ?? null;
  if (
    record === null ||
    hasForbiddenMachineJudgmentField(record) ||
    record.schemaVersion !== CALIBRATION_CRITICAL_FAILURE_REFERENCE_SET_SCHEMA_VERSION ||
    !identifier(record.datasetId) ||
    !identifier(record.datasetVersion) ||
    !["human-critical-failure-reference", "synthetic-fixture"].includes(dataKind as string) ||
    typeof record.humanCalibrationAvailable !== "boolean" ||
    record.humanCalibrationAvailable !== (dataKind === "human-critical-failure-reference") ||
    typeof record.reviewerCount !== "number" ||
    !Number.isInteger(record.reviewerCount) ||
    record.reviewerCount < 0 ||
    labels === null ||
    labelRecords === null ||
    labelRecords.some((label): label is null => label === null)
  ) {
    throw new BenchmarkConfigurationError("calibration_critical_failure_reference_invalid");
  }
  const parsedLabels = labelRecords as UnknownRecord[];
  const referenceIds = parsedLabels.map((label) => label.referenceId);
  const targetIds = parsedLabels.map((label) => label.targetId);
  if (hasDuplicateIds(referenceIds.filter((id): id is string => typeof id === "string"))) {
    throw new BenchmarkConfigurationError("calibration_critical_failure_reference_invalid");
  }
  if (hasDuplicateIds(targetIds.filter((id): id is string => typeof id === "string"))) {
    throw new BenchmarkConfigurationError("calibration_critical_failure_reference_invalid");
  }
  for (const label of parsedLabels) {
    const finalSeverity = readOptionalEnum(label, "finalSeverity", criticalFailureSeverities);
    const sourceAnnotationIds = label.sourceAnnotationIds;
    const finalDecision = label.finalDecision;
    if (
      hasForbiddenMachineJudgmentField(label) ||
      !identifier(label.referenceId) ||
      !identifier(label.targetId) ||
      !identifier(label.datasetId) ||
      !identifier(label.datasetVersion) ||
      !identifier(label.caseId) ||
      !identifier(label.caseVersion) ||
      !identifier(label.responseId) ||
      !criticalFailureTypes.has(label.failureType as TutorCriticalFailure) ||
      label.datasetId !== record.datasetId ||
      label.datasetVersion !== record.datasetVersion ||
      (finalDecision !== "PRESENT" && finalDecision !== "ABSENT") ||
      finalSeverity === null ||
      (finalDecision === "PRESENT" && finalSeverity === undefined) ||
      (finalDecision === "ABSENT" && finalSeverity !== undefined) ||
      !Array.isArray(sourceAnnotationIds) ||
      sourceAnnotationIds.length === 0 ||
      !sourceAnnotationIds.every(identifier) ||
      hasDuplicateIds(sourceAnnotationIds) ||
      typeof label.reviewerCount !== "number" ||
      !Number.isInteger(label.reviewerCount) ||
      label.reviewerCount < 1 ||
      !["exact", "disagreement"].includes(label.agreement as string) ||
      !["not_required", "required", "completed"].includes(
        label.adjudicationStatus as string,
      ) ||
      (label.agreement === "exact" &&
        (label.adjudicationStatus !== "not_required" || label.adjudicationId !== undefined)) ||
      (label.agreement === "disagreement" &&
        (label.adjudicationStatus !== "completed" || !identifier(label.adjudicationId)))
    ) {
      throw new BenchmarkConfigurationError("calibration_critical_failure_reference_invalid");
    }
  }
}
