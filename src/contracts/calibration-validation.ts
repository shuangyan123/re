import { BenchmarkConfigurationError } from "./errors.js";
import {
  CALIBRATION_CONTRACT_SCHEMA_VERSION,
  type CalibrationAdjudicationFile,
  type CalibrationAdjudicationDataKind,
  type CalibrationAnnotationFile,
  type CalibrationAnnotationDataKind,
  type CalibrationCandidateDataKind,
  type CalibrationCandidateResponse,
  type CalibrationCandidateResponseFile,
  type CalibrationSourceCorpus,
  type CalibrationLabel,
  type CalibrationReferenceSet,
  type HumanRubricAnnotation,
  type RubricAdjudication,
  type SyntheticFixtureMarker,
} from "./calibration.js";
import type { TutorEvalDataset } from "./tutor-eval.js";

type UnknownRecord = Record<string, unknown>;

const labels = new Set<CalibrationLabel>([
  "PASS",
  "PARTIAL",
  "FAIL",
  "UNSURE",
]);
const responseProvenances = new Set([
  "synthetic",
  "model",
  "human-authored",
  "recorded_model",
  "review_workspace",
  "external",
]);
const candidateDataKinds = new Set(["candidate-corpus", "synthetic-fixture"]);
const annotationDataKinds = new Set(["human-annotation", "synthetic-fixture"]);
const adjudicationDataKinds = new Set(["human-adjudication", "synthetic-fixture"]);

function asRecord(value: unknown): UnknownRecord | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as UnknownRecord)
    : null;
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function identifier(value: unknown): value is string {
  return (
    nonEmptyString(value) &&
    value.length <= 200 &&
    !/[\s|]/u.test(value)
  );
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

function readOptionalNonEmptyString(
  record: UnknownRecord,
  key: string,
): string | null | undefined {
  if (!(key in record)) {
    return undefined;
  }
  return nonEmptyString(record[key]) ? record[key] as string : null;
}

function readOptionalNonNegativeNumber(
  record: UnknownRecord,
  key: string,
): number | null | undefined {
  if (!(key in record)) {
    return undefined;
  }
  const value = record[key];
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : null;
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
  return {
    synthetic: true,
    notHumanCalibrationData: true,
  };
}

function parseTutorDescriptor(
  value: unknown,
): CalibrationCandidateResponse["tutorDescriptor"] | null {
  const record = asRecord(value);
  if (record === null) {
    return null;
  }
  const provider = readOptionalNonEmptyString(record, "provider");
  const model = readOptionalNonEmptyString(record, "model");
  const modelVersion = readOptionalNonEmptyString(record, "modelVersion");
  const promptId = readOptionalNonEmptyString(record, "promptId");
  const promptVersion = readOptionalNonEmptyString(record, "promptVersion");
  const reasoningEffort = readOptionalNonEmptyString(record, "reasoningEffort");
  const temperature = readOptionalNonNegativeNumber(record, "temperature");
  const seed = record.seed;
  if (
    provider === null ||
    model === null ||
    modelVersion === null ||
    promptId === null ||
    promptVersion === null ||
    reasoningEffort === null ||
    temperature === null ||
    (seed !== undefined && (!Number.isInteger(seed) || (seed as number) < 0))
  ) {
    return null;
  }
  if (
    provider === undefined &&
    model === undefined &&
    modelVersion === undefined &&
    promptId === undefined &&
    promptVersion === undefined &&
    reasoningEffort === undefined &&
    temperature === undefined &&
    seed === undefined
  ) {
    return null;
  }
  return {
    ...(provider === undefined ? {} : { provider }),
    ...(model === undefined ? {} : { model }),
    ...(modelVersion === undefined ? {} : { modelVersion }),
    ...(promptId === undefined ? {} : { promptId }),
    ...(promptVersion === undefined ? {} : { promptVersion }),
    ...(temperature === undefined ? {} : { temperature }),
    ...(reasoningEffort === undefined ? {} : { reasoningEffort }),
    ...(seed === undefined ? {} : { seed: seed as number }),
  };
}

function parseSourceCorpus(value: unknown): CalibrationSourceCorpus | null {
  const record = asRecord(value);
  if (
    record === null ||
    !identifier(record.corpusId) ||
    !identifier(record.corpusVersion)
  ) {
    return null;
  }
  return { corpusId: record.corpusId, corpusVersion: record.corpusVersion };
}

function parseSourceRun(
  value: unknown,
): CalibrationCandidateResponse["sourceRun"] | null {
  const record = asRecord(value);
  if (
    record === null ||
    !identifier(record.runId) ||
    typeof record.runIndex !== "number" ||
    !Number.isInteger(record.runIndex) ||
    record.runIndex < 1
  ) {
    return null;
  }
  return { runId: record.runId, runIndex: record.runIndex };
}

function parseCandidateResponseValue(
  value: unknown,
): CalibrationCandidateResponse | null {
  const record = asRecord(value);
  if (
    record === null ||
    record.schemaVersion !== CALIBRATION_CONTRACT_SCHEMA_VERSION ||
    !identifier(record.responseId) ||
    !identifier(record.datasetId) ||
    !identifier(record.datasetVersion) ||
    !identifier(record.caseId) ||
    !identifier(record.caseVersion) ||
    typeof record.responseText !== "string" ||
    !responseProvenances.has(record.provenance as string)
  ) {
    return null;
  }

  const tutorDescriptor =
    record.tutorDescriptor === undefined
      ? undefined
      : parseTutorDescriptor(record.tutorDescriptor);
  const sourceRun =
    record.sourceRun === undefined ? undefined : parseSourceRun(record.sourceRun);
  const sourceCorpus =
    record.sourceCorpus === undefined
      ? undefined
      : parseSourceCorpus(record.sourceCorpus);
  if (tutorDescriptor === null || sourceRun === null || sourceCorpus === null) {
    return null;
  }

  return {
    schemaVersion: CALIBRATION_CONTRACT_SCHEMA_VERSION,
    responseId: record.responseId,
    datasetId: record.datasetId,
    datasetVersion: record.datasetVersion,
    caseId: record.caseId,
    caseVersion: record.caseVersion,
    ...(tutorDescriptor === undefined ? {} : { tutorDescriptor }),
    ...(sourceRun === undefined ? {} : { sourceRun }),
    ...(sourceCorpus === undefined ? {} : { sourceCorpus }),
    responseText: record.responseText,
    provenance: record.provenance as CalibrationCandidateResponse["provenance"],
  };
}

export function parseCalibrationCandidateResponse(
  value: unknown,
): CalibrationCandidateResponse {
  const response = parseCandidateResponseValue(value);
  if (response === null) {
    throw new BenchmarkConfigurationError("calibration_candidate_invalid");
  }
  return response;
}

function hasDuplicateIds(values: readonly string[]): boolean {
  return new Set(values).size !== values.length;
}

function parseCandidateDataKind(value: unknown): CalibrationCandidateDataKind | null {
  return candidateDataKinds.has(value as string)
    ? value as CalibrationCandidateDataKind
    : null;
}

export function parseCalibrationCandidateResponseFile(
  value: unknown,
): CalibrationCandidateResponseFile {
  const record = asRecord(value);
  const dataKind = parseCandidateDataKind(record?.dataKind);
  const fixture = parseFixtureMarker(record?.fixture);
  const responsesValue = record?.responses;
  const responses = Array.isArray(responsesValue)
    ? responsesValue.map(parseCandidateResponseValue)
    : null;
  if (
    record === null ||
    record.schemaVersion !== CALIBRATION_CONTRACT_SCHEMA_VERSION ||
    dataKind === null ||
    !identifier(record.datasetId) ||
    !identifier(record.datasetVersion) ||
    responses === null ||
    responses.some((response): response is null => response === null) ||
    hasDuplicateIds((responses as CalibrationCandidateResponse[]).map((response) => response.responseId)) ||
    (responses as CalibrationCandidateResponse[]).some(
      (response) =>
        response.datasetId !== record.datasetId ||
        response.datasetVersion !== record.datasetVersion,
    ) ||
    (dataKind === "synthetic-fixture" && fixture === undefined) ||
    fixture === null ||
    (dataKind !== "synthetic-fixture" && fixture !== undefined)
  ) {
    throw new BenchmarkConfigurationError("calibration_candidate_invalid");
  }
  const typedResponses = responses as CalibrationCandidateResponse[];
  if (
    dataKind === "synthetic-fixture" &&
    typedResponses.some((response) => response.provenance !== "synthetic")
  ) {
    throw new BenchmarkConfigurationError("calibration_candidate_invalid");
  }
  return {
    schemaVersion: CALIBRATION_CONTRACT_SCHEMA_VERSION,
    dataKind,
    ...(fixture === undefined ? {} : { fixture }),
    datasetId: record.datasetId,
    datasetVersion: record.datasetVersion,
    responses: typedResponses,
  };
}

function parseAmbiguity(
  value: unknown,
): HumanRubricAnnotation["ambiguity"] | null {
  const record = asRecord(value);
  if (record === null || typeof record.present !== "boolean") {
    return null;
  }
  const reason = readOptionalNonEmptyString(record, "reason");
  if (reason === null) {
    return null;
  }
  return {
    present: record.present,
    ...(reason === undefined ? {} : { reason }),
  };
}

function parseAnnotationValue(value: unknown): HumanRubricAnnotation | null {
  const record = asRecord(value);
  if (
    record === null ||
    record.schemaVersion !== CALIBRATION_CONTRACT_SCHEMA_VERSION ||
    !identifier(record.annotationId) ||
    !identifier(record.datasetId) ||
    !identifier(record.datasetVersion) ||
    !identifier(record.caseId) ||
    !identifier(record.caseVersion) ||
    !identifier(record.responseId) ||
    !identifier(record.rubricId) ||
    !pseudonymousId(record.reviewerId) ||
    !labels.has(record.label as CalibrationLabel) ||
    !validTimestamp(record.createdAt)
  ) {
    return null;
  }
  const evidence = readOptionalNonEmptyString(record, "evidence");
  const ambiguity =
    record.ambiguity === undefined ? undefined : parseAmbiguity(record.ambiguity);
  if (evidence === null || ambiguity === null) {
    return null;
  }
  return {
    schemaVersion: CALIBRATION_CONTRACT_SCHEMA_VERSION,
    annotationId: record.annotationId,
    datasetId: record.datasetId,
    datasetVersion: record.datasetVersion,
    caseId: record.caseId,
    caseVersion: record.caseVersion,
    responseId: record.responseId,
    rubricId: record.rubricId,
    reviewerId: record.reviewerId,
    label: record.label as CalibrationLabel,
    ...(evidence === undefined ? {} : { evidence }),
    ...(ambiguity === undefined ? {} : { ambiguity }),
    createdAt: record.createdAt,
  };
}

function parseAnnotationDataKind(value: unknown): CalibrationAnnotationDataKind | null {
  return annotationDataKinds.has(value as string)
    ? value as CalibrationAnnotationDataKind
    : null;
}

export function parseHumanRubricAnnotation(
  value: unknown,
): HumanRubricAnnotation {
  const annotation = parseAnnotationValue(value);
  if (annotation === null) {
    throw new BenchmarkConfigurationError("calibration_annotation_invalid");
  }
  return annotation;
}

export function parseCalibrationAnnotationFile(
  value: unknown,
): CalibrationAnnotationFile {
  const record = asRecord(value);
  const dataKind = parseAnnotationDataKind(record?.dataKind);
  const fixture = parseFixtureMarker(record?.fixture);
  const annotationsValue = record?.annotations;
  const annotations = Array.isArray(annotationsValue)
    ? annotationsValue.map(parseAnnotationValue)
    : null;
  if (
    record === null ||
    record.schemaVersion !== CALIBRATION_CONTRACT_SCHEMA_VERSION ||
    dataKind === null ||
    !identifier(record.datasetId) ||
    !identifier(record.datasetVersion) ||
    !pseudonymousId(record.reviewerId) ||
    annotations === null ||
    annotations.some((annotation): annotation is null => annotation === null) ||
    hasDuplicateIds((annotations as HumanRubricAnnotation[]).map((annotation) => annotation.annotationId)) ||
    (annotations as HumanRubricAnnotation[]).some(
      (annotation) =>
        annotation.datasetId !== record.datasetId ||
        annotation.datasetVersion !== record.datasetVersion,
    ) ||
    (dataKind === "synthetic-fixture" && fixture === undefined) ||
    fixture === null ||
    (dataKind !== "synthetic-fixture" && fixture !== undefined)
  ) {
    throw new BenchmarkConfigurationError("calibration_annotation_invalid");
  }
  const typedAnnotations = annotations as HumanRubricAnnotation[];
  if (typedAnnotations.some((annotation) => annotation.reviewerId !== record.reviewerId)) {
    throw new BenchmarkConfigurationError("calibration_annotation_invalid");
  }
  return {
    schemaVersion: CALIBRATION_CONTRACT_SCHEMA_VERSION,
    dataKind,
    ...(fixture === undefined ? {} : { fixture }),
    datasetId: record.datasetId,
    datasetVersion: record.datasetVersion,
    reviewerId: record.reviewerId,
    annotations: typedAnnotations,
  };
}

function parseAdjudicationValue(value: unknown): RubricAdjudication | null {
  const record = asRecord(value);
  const sourceAnnotationIds = record?.sourceAnnotationIds;
  if (
    record === null ||
    record.schemaVersion !== CALIBRATION_CONTRACT_SCHEMA_VERSION ||
    !identifier(record.adjudicationId) ||
    !identifier(record.datasetId) ||
    !identifier(record.datasetVersion) ||
    !identifier(record.caseId) ||
    !identifier(record.caseVersion) ||
    !identifier(record.responseId) ||
    !identifier(record.rubricId) ||
    !Array.isArray(sourceAnnotationIds) ||
    sourceAnnotationIds.length < 2 ||
    !sourceAnnotationIds.every(identifier) ||
    hasDuplicateIds(sourceAnnotationIds) ||
    !labels.has(record.finalLabel as CalibrationLabel) ||
    record.finalLabel === "UNSURE" ||
    !nonEmptyString(record.rationale) ||
    !pseudonymousId(record.adjudicatorId) ||
    !validTimestamp(record.createdAt)
  ) {
    return null;
  }
  return {
    schemaVersion: CALIBRATION_CONTRACT_SCHEMA_VERSION,
    adjudicationId: record.adjudicationId,
    datasetId: record.datasetId,
    datasetVersion: record.datasetVersion,
    caseId: record.caseId,
    caseVersion: record.caseVersion,
    responseId: record.responseId,
    rubricId: record.rubricId,
    sourceAnnotationIds: sourceAnnotationIds as string[],
    finalLabel: record.finalLabel as RubricAdjudication["finalLabel"],
    rationale: record.rationale,
    adjudicatorId: record.adjudicatorId,
    createdAt: record.createdAt,
  };
}

function parseAdjudicationDataKind(value: unknown): CalibrationAdjudicationDataKind | null {
  return adjudicationDataKinds.has(value as string)
    ? value as CalibrationAdjudicationDataKind
    : null;
}

export function parseRubricAdjudication(value: unknown): RubricAdjudication {
  const adjudication = parseAdjudicationValue(value);
  if (adjudication === null) {
    throw new BenchmarkConfigurationError("calibration_adjudication_invalid");
  }
  return adjudication;
}

export function parseCalibrationAdjudicationFile(
  value: unknown,
): CalibrationAdjudicationFile {
  const record = asRecord(value);
  const dataKind = parseAdjudicationDataKind(record?.dataKind);
  const fixture = parseFixtureMarker(record?.fixture);
  const adjudicationsValue = record?.adjudications;
  const adjudications = Array.isArray(adjudicationsValue)
    ? adjudicationsValue.map(parseAdjudicationValue)
    : null;
  if (
    record === null ||
    record.schemaVersion !== CALIBRATION_CONTRACT_SCHEMA_VERSION ||
    dataKind === null ||
    !identifier(record.datasetId) ||
    !identifier(record.datasetVersion) ||
    !pseudonymousId(record.adjudicatorId) ||
    adjudications === null ||
    adjudications.some((adjudication): adjudication is null => adjudication === null) ||
    hasDuplicateIds((adjudications as RubricAdjudication[]).map((adjudication) => adjudication.adjudicationId)) ||
    (adjudications as RubricAdjudication[]).some(
      (adjudication) =>
        adjudication.datasetId !== record.datasetId ||
        adjudication.datasetVersion !== record.datasetVersion,
    ) ||
    (dataKind === "synthetic-fixture" && fixture === undefined) ||
    fixture === null ||
    (dataKind !== "synthetic-fixture" && fixture !== undefined)
  ) {
    throw new BenchmarkConfigurationError("calibration_adjudication_invalid");
  }
  const typedAdjudications = adjudications as RubricAdjudication[];
  if (typedAdjudications.some((adjudication) => adjudication.adjudicatorId !== record.adjudicatorId)) {
    throw new BenchmarkConfigurationError("calibration_adjudication_invalid");
  }
  return {
    schemaVersion: CALIBRATION_CONTRACT_SCHEMA_VERSION,
    dataKind,
    ...(fixture === undefined ? {} : { fixture }),
    datasetId: record.datasetId,
    datasetVersion: record.datasetVersion,
    adjudicatorId: record.adjudicatorId,
    adjudications: typedAdjudications,
  };
}

export type CalibrationValidationIssueCode =
  | "candidate_dataset_mismatch"
  | "candidate_duplicate_response"
  | "candidate_unknown_case"
  | "candidate_case_version_mismatch"
  | "annotation_dataset_mismatch"
  | "annotation_duplicate_id"
  | "annotation_duplicate_reviewer_judgment"
  | "annotation_unknown_response"
  | "annotation_case_version_mismatch"
  | "annotation_unknown_case"
  | "annotation_unknown_rubric"
  | "duplicate_reviewer_stream"
  | "mixed_annotation_data_kind"
  | "adjudication_dataset_mismatch"
  | "adjudication_duplicate_id"
  | "adjudication_unknown_annotation"
  | "adjudication_unit_mismatch"
  | "adjudication_duplicate_source_reviewer"
  | "adjudication_data_kind_mismatch"
  | "reviewer_pair_missing"
  | "adjudication_missing"
  | "adjudication_source_incomplete";

export interface CalibrationValidationIssue {
  readonly code: CalibrationValidationIssueCode;
  readonly annotationId?: string;
  readonly responseId?: string;
  readonly caseId?: string;
  readonly rubricId?: string;
  readonly adjudicationId?: string;
}

export interface CalibrationValidationInput {
  readonly dataset: TutorEvalDataset;
  readonly candidates: CalibrationCandidateResponseFile;
  readonly annotationFiles: readonly CalibrationAnnotationFile[];
  readonly adjudicationFile?: CalibrationAdjudicationFile;
}

function identityKey(value: {
  readonly datasetId: string;
  readonly datasetVersion: string;
  readonly caseId: string;
  readonly caseVersion: string;
  readonly responseId: string;
  readonly rubricId: string;
}): string {
  return JSON.stringify([
    value.datasetId,
    value.datasetVersion,
    value.caseId,
    value.caseVersion,
    value.responseId,
    value.rubricId,
  ]);
}

function addIssue(
  issues: CalibrationValidationIssue[],
  code: CalibrationValidationIssueCode,
  details: Omit<CalibrationValidationIssue, "code"> = {},
): void {
  issues.push({ code, ...details });
}

function identityIssueDetails(
  annotation: HumanRubricAnnotation | undefined,
): Omit<CalibrationValidationIssue, "code"> {
  return annotation === undefined
    ? {}
    : {
        caseId: annotation.caseId,
        responseId: annotation.responseId,
        rubricId: annotation.rubricId,
      };
}

function sortedIssues(
  issues: readonly CalibrationValidationIssue[],
): CalibrationValidationIssue[] {
  return [...issues].sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
}

export function findCalibrationValidationIssues(
  input: CalibrationValidationInput,
): CalibrationValidationIssue[] {
  const issues: CalibrationValidationIssue[] = [];
  const casesById = new Map(input.dataset.cases.map((caseValue) => [caseValue.id, caseValue]));
  const responsesById = new Map<string, CalibrationCandidateResponse>();
  if (
    input.candidates.datasetId !== input.dataset.id ||
    input.candidates.datasetVersion !== input.dataset.version
  ) {
    addIssue(issues, "candidate_dataset_mismatch");
  }
  for (const response of input.candidates.responses) {
    if (
      response.datasetId !== input.candidates.datasetId ||
      response.datasetVersion !== input.candidates.datasetVersion
    ) {
      addIssue(issues, "candidate_dataset_mismatch", {
        responseId: response.responseId,
      });
    }
    if (responsesById.has(response.responseId)) {
      addIssue(issues, "candidate_duplicate_response", {
        responseId: response.responseId,
      });
    }
    responsesById.set(response.responseId, response);
    const caseValue = casesById.get(response.caseId);
    if (caseValue === undefined) {
      addIssue(issues, "candidate_unknown_case", {
        responseId: response.responseId,
        caseId: response.caseId,
      });
    } else if (caseValue.version !== response.caseVersion) {
      addIssue(issues, "candidate_case_version_mismatch", {
        responseId: response.responseId,
        caseId: response.caseId,
      });
    }
  }

  const annotationIds = new Map<string, HumanRubricAnnotation>();
  const annotationByUnit = new Map<string, HumanRubricAnnotation[]>();
  const annotationKinds = new Set<CalibrationDataKind>();
  const reviewerStreams = new Set<string>();
  for (const file of input.annotationFiles) {
    if (reviewerStreams.has(file.reviewerId)) {
      addIssue(issues, "duplicate_reviewer_stream");
    }
    reviewerStreams.add(file.reviewerId);
    annotationKinds.add(file.dataKind);
    if (file.datasetId !== input.dataset.id || file.datasetVersion !== input.dataset.version) {
      addIssue(issues, "annotation_dataset_mismatch");
    }
    for (const annotation of file.annotations) {
      if (
        annotation.datasetId !== file.datasetId ||
        annotation.datasetVersion !== file.datasetVersion
      ) {
        addIssue(issues, "annotation_dataset_mismatch", {
          annotationId: annotation.annotationId,
        });
      }
      if (annotationIds.has(annotation.annotationId)) {
        addIssue(issues, "annotation_duplicate_id", {
          annotationId: annotation.annotationId,
        });
      }
      annotationIds.set(annotation.annotationId, annotation);
      const response = responsesById.get(annotation.responseId);
      if (response === undefined) {
        addIssue(issues, "annotation_unknown_response", {
          annotationId: annotation.annotationId,
          responseId: annotation.responseId,
        });
      } else if (
        response.caseId !== annotation.caseId ||
        response.caseVersion !== annotation.caseVersion
      ) {
        addIssue(issues, "annotation_case_version_mismatch", {
          annotationId: annotation.annotationId,
          responseId: annotation.responseId,
          caseId: annotation.caseId,
        });
      }
      const caseValue = casesById.get(annotation.caseId);
      if (caseValue === undefined) {
        addIssue(issues, "annotation_unknown_case", {
          annotationId: annotation.annotationId,
          caseId: annotation.caseId,
        });
      } else if (caseValue.version !== annotation.caseVersion) {
        addIssue(issues, "annotation_case_version_mismatch", {
          annotationId: annotation.annotationId,
          caseId: annotation.caseId,
        });
      } else if (!caseValue.evaluatorOnly.rubrics.some((rubric) => rubric.id === annotation.rubricId)) {
        addIssue(issues, "annotation_unknown_rubric", {
          annotationId: annotation.annotationId,
          caseId: annotation.caseId,
          rubricId: annotation.rubricId,
        });
      }
      const unitKey = identityKey(annotation);
      const unitAnnotations = annotationByUnit.get(unitKey) ?? [];
      if (unitAnnotations.some((item) => item.reviewerId === annotation.reviewerId)) {
        addIssue(issues, "annotation_duplicate_reviewer_judgment", {
          annotationId: annotation.annotationId,
          caseId: annotation.caseId,
          responseId: annotation.responseId,
          rubricId: annotation.rubricId,
        });
      }
      unitAnnotations.push(annotation);
      annotationByUnit.set(unitKey, unitAnnotations);
    }
  }
  if (annotationKinds.size > 1) {
    addIssue(issues, "mixed_annotation_data_kind");
  }

  const adjudicationIds = new Set<string>();
  const adjudicationsByUnit = new Map<string, RubricAdjudication>();
  const adjudicationFile = input.adjudicationFile;
  if (adjudicationFile !== undefined) {
    if (
      adjudicationFile.datasetId !== input.dataset.id ||
      adjudicationFile.datasetVersion !== input.dataset.version
    ) {
      addIssue(issues, "adjudication_dataset_mismatch");
    }
    if (annotationKinds.size === 1) {
      const expectedKind = annotationKinds.has("synthetic-fixture")
        ? "synthetic-fixture"
        : "human-adjudication";
      if (adjudicationFile.dataKind !== expectedKind) {
        addIssue(issues, "adjudication_data_kind_mismatch");
      }
    }
    for (const adjudication of adjudicationFile.adjudications) {
      if (
        adjudication.datasetId !== adjudicationFile.datasetId ||
        adjudication.datasetVersion !== adjudicationFile.datasetVersion
      ) {
        addIssue(issues, "adjudication_dataset_mismatch", {
          adjudicationId: adjudication.adjudicationId,
        });
      }
      if (adjudicationIds.has(adjudication.adjudicationId)) {
        addIssue(issues, "adjudication_duplicate_id", {
          adjudicationId: adjudication.adjudicationId,
        });
      }
      adjudicationIds.add(adjudication.adjudicationId);
      const unitKey = identityKey(adjudication);
      const existing = adjudicationsByUnit.get(unitKey);
      if (existing !== undefined) {
        addIssue(issues, "adjudication_unit_mismatch", {
          adjudicationId: adjudication.adjudicationId,
          caseId: adjudication.caseId,
          responseId: adjudication.responseId,
          rubricId: adjudication.rubricId,
        });
      }
      adjudicationsByUnit.set(unitKey, adjudication);
      const sourceAnnotations = adjudication.sourceAnnotationIds.map((id) => annotationIds.get(id));
      if (sourceAnnotations.some((annotation) => annotation === undefined)) {
        addIssue(issues, "adjudication_unknown_annotation", {
          adjudicationId: adjudication.adjudicationId,
          caseId: adjudication.caseId,
          responseId: adjudication.responseId,
          rubricId: adjudication.rubricId,
        });
        continue;
      }
      const typedSourceAnnotations = sourceAnnotations as HumanRubricAnnotation[];
      const sourceUnitKeys = new Set(typedSourceAnnotations.map(identityKey));
      if (sourceUnitKeys.size !== 1 || !sourceUnitKeys.has(unitKey)) {
        addIssue(issues, "adjudication_unit_mismatch", {
          adjudicationId: adjudication.adjudicationId,
          caseId: adjudication.caseId,
          responseId: adjudication.responseId,
          rubricId: adjudication.rubricId,
        });
      }
      if (new Set(typedSourceAnnotations.map((annotation) => annotation.reviewerId)).size !== typedSourceAnnotations.length) {
        addIssue(issues, "adjudication_duplicate_source_reviewer", {
          adjudicationId: adjudication.adjudicationId,
        });
      }
    }
  }

  return sortedIssues(issues);
}

export function findCalibrationReferenceReadinessIssues(
  input: CalibrationValidationInput,
): CalibrationValidationIssue[] {
  const issues = findCalibrationValidationIssues(input);
  const annotationsByUnit = new Map<string, HumanRubricAnnotation[]>();
  for (const file of input.annotationFiles) {
    for (const annotation of file.annotations) {
      const key = identityKey(annotation);
      annotationsByUnit.set(key, [...(annotationsByUnit.get(key) ?? []), annotation]);
    }
  }
  const adjudicationsByUnit = new Map<string, RubricAdjudication>();
  for (const adjudication of input.adjudicationFile?.adjudications ?? []) {
    adjudicationsByUnit.set(identityKey(adjudication), adjudication);
  }
  for (const [unitKey, unitAnnotations] of annotationsByUnit.entries()) {
    if (new Set(unitAnnotations.map((annotation) => annotation.reviewerId)).size < 2) {
      const first = unitAnnotations[0];
      addIssue(issues, "reviewer_pair_missing", identityIssueDetails(first));
    }
    const labelsForUnit = unitAnnotations.map((annotation) => annotation.label);
    const exactScoredAgreement =
      labelsForUnit.length > 0 &&
      labelsForUnit[0] !== "UNSURE" &&
      labelsForUnit.every((label) => label === labelsForUnit[0]);
    if (!exactScoredAgreement) {
      const adjudication = adjudicationsByUnit.get(unitKey);
      if (adjudication === undefined) {
        const first = unitAnnotations[0];
        addIssue(issues, "adjudication_missing", identityIssueDetails(first));
      } else if (
        new Set(adjudication.sourceAnnotationIds).size !== unitAnnotations.length ||
        unitAnnotations.some((annotation) => !adjudication.sourceAnnotationIds.includes(annotation.annotationId))
      ) {
        addIssue(issues, "adjudication_source_incomplete", {
          adjudicationId: adjudication.adjudicationId,
          caseId: adjudication.caseId,
          responseId: adjudication.responseId,
          rubricId: adjudication.rubricId,
        });
      }
    }
  }
  return sortedIssues(issues);
}

export function assertValidCalibrationData(
  input: CalibrationValidationInput,
): void {
  if (findCalibrationValidationIssues(input).length > 0) {
    throw new BenchmarkConfigurationError("calibration_data_invalid");
  }
}

export function assertCalibrationReferenceReady(
  input: CalibrationValidationInput,
): void {
  if (findCalibrationReferenceReadinessIssues(input).length > 0) {
    throw new BenchmarkConfigurationError("calibration_reference_invalid");
  }
}

export function assertValidCalibrationReferenceSet(
  value: unknown,
): asserts value is CalibrationReferenceSet {
  const record = asRecord(value);
  if (
    record === null ||
    record.schemaVersion !== 1 ||
    !identifier(record.datasetId) ||
    !identifier(record.datasetVersion) ||
    (record.dataKind !== "human-reference" && record.dataKind !== "synthetic-fixture") ||
    typeof record.humanCalibrationAvailable !== "boolean" ||
    record.humanCalibrationAvailable !== (record.dataKind === "human-reference") ||
    typeof record.reviewerCount !== "number" ||
    !Number.isInteger(record.reviewerCount) ||
    record.reviewerCount < 0 ||
    !Array.isArray(record.labels)
  ) {
    throw new BenchmarkConfigurationError("calibration_reference_invalid");
  }
}

export type CalibrationDataKind =
  | "human-annotation"
  | "synthetic-fixture";
