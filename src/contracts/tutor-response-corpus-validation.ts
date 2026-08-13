import { BenchmarkConfigurationError } from "./errors.js";
import {
  TUTOR_RESPONSE_CORPUS_SCHEMA_VERSION,
  TUTOR_VISIBLE_CASE_PACKET_SCHEMA_VERSION,
  type TutorCandidateResponse,
  type TutorResponseCorpus,
  type TutorResponseCorpusCoverage,
  type TutorResponseProvenance,
  type TutorVisibleCasePacket,
  type TutorVisibleCasePacketFile,
} from "./tutor-response-corpus.js";
import type { TutorEvalDataset } from "./tutor-eval.js";
import type {
  StudentState,
  TutorConversationMessage,
  TutorTurnMetrics,
  TutorTokenUsage,
} from "./tutor.js";
import type { TutorEvalTutorDescriptor } from "./result.js";

type UnknownRecord = Record<string, unknown>;

const provenances = new Set<TutorResponseProvenance>([
  "synthetic",
  "recorded_model",
  "review_workspace",
  "external",
]);
const coverages = new Set<TutorResponseCorpusCoverage>(["full", "partial"]);

const forbiddenKeys = new Set([
  "accessToken",
  "apiKey",
  "authorization",
  "baseUrl",
  "cookie",
  "credential",
  "credentialId",
  "credentials",
  "database",
  "encryptedCredential",
  "headers",
  "password",
  "privateKey",
  "promptText",
  "rawPayload",
  "rawProviderPayload",
  "requestPayload",
  "secret",
  "systemPrompt",
  "token",
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

function validTimestamp(value: unknown): value is string {
  return nonEmptyString(value) && !Number.isNaN(Date.parse(value));
}

function hasOnlyKeys(record: UnknownRecord, allowed: readonly string[]): boolean {
  const allowedKeys = new Set(allowed);
  return Object.keys(record).every((key) => allowedKeys.has(key));
}

function containsForbiddenKey(value: unknown): boolean {
  if (Array.isArray(value)) {
    return value.some(containsForbiddenKey);
  }
  const record = asRecord(value);
  if (record === null) {
    return false;
  }
  return Object.entries(record).some(
    ([key, nested]) => forbiddenKeys.has(key) || containsForbiddenKey(nested),
  );
}

function readOptionalString(
  record: UnknownRecord,
  key: string,
): string | undefined | null {
  if (!(key in record)) {
    return undefined;
  }
  return nonEmptyString(record[key]) ? record[key] as string : null;
}

function readNonNegativeNumber(
  record: UnknownRecord,
  key: string,
): number | undefined | null {
  if (!(key in record)) {
    return undefined;
  }
  const value = record[key];
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : null;
}

function parseTokenUsage(value: unknown): TutorTokenUsage | null {
  const record = asRecord(value);
  if (
    record === null ||
    !hasOnlyKeys(record, ["inputTokens", "outputTokens", "totalTokens"])
  ) {
    return null;
  }
  const values = [record.inputTokens, record.outputTokens, record.totalTokens];
  if (
    values.some(
      (item) =>
        item !== undefined &&
        (typeof item !== "number" || !Number.isInteger(item) || item < 0),
    )
  ) {
    return null;
  }
  return {
    ...(record.inputTokens === undefined ? {} : { inputTokens: record.inputTokens as number }),
    ...(record.outputTokens === undefined ? {} : { outputTokens: record.outputTokens as number }),
    ...(record.totalTokens === undefined ? {} : { totalTokens: record.totalTokens as number }),
  };
}

function parseMetrics(value: unknown): TutorTurnMetrics | null {
  const record = asRecord(value);
  if (
    record === null ||
    !hasOnlyKeys(record, ["latencyMs", "tokenUsage", "cost"])
  ) {
    return null;
  }
  const latencyMs = readNonNegativeNumber(record, "latencyMs");
  const cost = readNonNegativeNumber(record, "cost");
  const tokenUsage =
    record.tokenUsage === undefined ? undefined : parseTokenUsage(record.tokenUsage);
  if (latencyMs === null || cost === null || tokenUsage === null) {
    return null;
  }
  return {
    ...(latencyMs === undefined ? {} : { latencyMs }),
    ...(cost === undefined ? {} : { cost }),
    ...(tokenUsage === undefined ? {} : { tokenUsage }),
  };
}

function parseTutorDescriptor(value: unknown): TutorEvalTutorDescriptor | null {
  const record = asRecord(value);
  if (
    record === null ||
    !hasOnlyKeys(record, [
      "provider",
      "model",
      "modelVersion",
      "promptId",
      "promptVersion",
      "temperature",
      "reasoningEffort",
      "seed",
    ])
  ) {
    return null;
  }
  const provider = readOptionalString(record, "provider");
  const model = readOptionalString(record, "model");
  const modelVersion = readOptionalString(record, "modelVersion");
  const promptId = readOptionalString(record, "promptId");
  const promptVersion = readOptionalString(record, "promptVersion");
  const reasoningEffort = readOptionalString(record, "reasoningEffort");
  const temperature = readNonNegativeNumber(record, "temperature");
  const seed = record.seed;
  if (
    provider === undefined ||
    model === undefined ||
    promptVersion === undefined ||
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
  return {
    provider,
    model,
    ...(modelVersion === undefined ? {} : { modelVersion }),
    ...(promptId === undefined ? {} : { promptId }),
    promptVersion,
    ...(temperature === undefined ? {} : { temperature }),
    ...(reasoningEffort === undefined ? {} : { reasoningEffort }),
    ...(seed === undefined ? {} : { seed: seed as number }),
  };
}

function parseCandidateResponse(value: unknown): TutorCandidateResponse | null {
  const record = asRecord(value);
  if (
    record === null ||
    !hasOnlyKeys(record, [
      "schemaVersion",
      "responseId",
      "caseId",
      "caseVersion",
      "runIndex",
      "responseText",
      "provenance",
      "metrics",
    ]) ||
    record.schemaVersion !== TUTOR_RESPONSE_CORPUS_SCHEMA_VERSION ||
    !identifier(record.responseId) ||
    !identifier(record.caseId) ||
    !identifier(record.caseVersion) ||
    typeof record.runIndex !== "number" ||
    !Number.isInteger(record.runIndex) ||
    record.runIndex < 1 ||
    typeof record.responseText !== "string" ||
    !provenances.has(record.provenance as TutorResponseProvenance)
  ) {
    return null;
  }
  const metrics =
    record.metrics === undefined ? undefined : parseMetrics(record.metrics);
  if (metrics === null) {
    return null;
  }
  return {
    schemaVersion: TUTOR_RESPONSE_CORPUS_SCHEMA_VERSION,
    responseId: record.responseId,
    caseId: record.caseId,
    caseVersion: record.caseVersion,
    runIndex: record.runIndex,
    responseText: record.responseText,
    provenance: record.provenance as TutorResponseProvenance,
    ...(metrics === undefined ? {} : { metrics }),
  };
}

export function parseTutorCandidateResponse(value: unknown): TutorCandidateResponse {
  if (containsForbiddenKey(value)) {
    throw new BenchmarkConfigurationError("tutor_response_corpus_invalid");
  }
  const response = parseCandidateResponse(value);
  if (response === null) {
    throw new BenchmarkConfigurationError("tutor_response_corpus_invalid");
  }
  return response;
}

export function parseTutorResponseCorpus(value: unknown): TutorResponseCorpus {
  if (containsForbiddenKey(value)) {
    throw new BenchmarkConfigurationError("tutor_response_corpus_invalid");
  }
  const record = asRecord(value);
  const responsesValue = record?.responses;
  const responses = Array.isArray(responsesValue)
    ? responsesValue.map(parseCandidateResponse)
    : null;
  const tutor = record?.tutor === undefined ? null : parseTutorDescriptor(record.tutor);
  const provenance = provenances.has(record?.provenance as TutorResponseProvenance)
    ? record?.provenance as TutorResponseProvenance
    : null;
  const coverage = coverages.has(record?.coverage as TutorResponseCorpusCoverage)
    ? record?.coverage as TutorResponseCorpusCoverage
    : null;
  if (
    record === null ||
    !hasOnlyKeys(record, [
      "schemaVersion",
      "corpusId",
      "corpusVersion",
      "datasetId",
      "datasetVersion",
      "createdAt",
      "coverage",
      "runsPerCase",
      "provenance",
      "tutor",
      "responses",
    ]) ||
    record.schemaVersion !== TUTOR_RESPONSE_CORPUS_SCHEMA_VERSION ||
    !identifier(record.corpusId) ||
    !identifier(record.corpusVersion) ||
    !identifier(record.datasetId) ||
    !identifier(record.datasetVersion) ||
    !validTimestamp(record.createdAt) ||
    coverage === null ||
    typeof record.runsPerCase !== "number" ||
    !Number.isInteger(record.runsPerCase) ||
    record.runsPerCase < 1 ||
    provenance === null ||
    tutor === null ||
    responses === null ||
    responses.some((response): response is null => response === null) ||
    responses.length === 0
  ) {
    throw new BenchmarkConfigurationError("tutor_response_corpus_invalid");
  }
  const typedResponses = responses as TutorCandidateResponse[];
  if (
    new Set(typedResponses.map((response) => response.responseId)).size !==
      typedResponses.length ||
    new Set(
      typedResponses.map((response) =>
        JSON.stringify([response.caseId, response.caseVersion, response.runIndex]),
      ),
    ).size !== typedResponses.length ||
    typedResponses.some(
      (response) =>
        response.provenance !== provenance ||
        response.runIndex > (record.runsPerCase as number),
    )
  ) {
    throw new BenchmarkConfigurationError("tutor_response_corpus_invalid");
  }
  return {
    schemaVersion: TUTOR_RESPONSE_CORPUS_SCHEMA_VERSION,
    corpusId: record.corpusId,
    corpusVersion: record.corpusVersion,
    datasetId: record.datasetId,
    datasetVersion: record.datasetVersion,
    createdAt: record.createdAt,
    coverage,
    runsPerCase: record.runsPerCase,
    provenance,
    tutor,
    responses: typedResponses,
  };
}

function parseStringArray(value: unknown): readonly string[] | null {
  return Array.isArray(value) && value.every(nonEmptyString)
    ? value as string[]
    : null;
}

function parseStudentProfile(value: unknown): StudentState | null {
  const record = asRecord(value);
  const knownConcepts = parseStringArray(record?.knownConcepts);
  const misconceptions = parseStringArray(record?.misconceptions);
  const level = record?.level;
  const goal = record?.goal;
  if (
    record === null ||
    !hasOnlyKeys(record, ["knownConcepts", "misconceptions", "level", "goal"]) ||
    knownConcepts === null ||
    misconceptions === null ||
    !nonEmptyString(level) ||
    !nonEmptyString(goal)
  ) {
    return null;
  }
  return { knownConcepts, misconceptions, level, goal };
}

function parseConversation(value: unknown): readonly TutorConversationMessage[] | null {
  if (!Array.isArray(value)) {
    return null;
  }
  const messages = value.map((item): TutorConversationMessage | null => {
    const record = asRecord(item);
    if (
      record === null ||
      !hasOnlyKeys(record, ["role", "text"]) ||
      (record.role !== "student" && record.role !== "tutor") ||
      !nonEmptyString(record.text)
    ) {
      return null;
    }
    return { role: record.role, text: record.text };
  });
  return messages.some((message): message is null => message === null)
    ? null
    : messages as TutorConversationMessage[];
}

function parseVisibleCase(value: unknown): TutorVisibleCasePacket | null {
  const record = asRecord(value);
  const studentProfile = parseStudentProfile(record?.studentProfile);
  const conversationHistory = parseConversation(record?.conversationHistory);
  if (
    record === null ||
    !hasOnlyKeys(record, [
      "caseId",
      "caseVersion",
      "learningObjective",
      "studentProfile",
      "conversationHistory",
      "studentMessage",
      "problemContext",
    ]) ||
    !identifier(record.caseId) ||
    !identifier(record.caseVersion) ||
    !nonEmptyString(record.learningObjective) ||
    studentProfile === null ||
    conversationHistory === null ||
    !nonEmptyString(record.studentMessage) ||
    typeof record.problemContext !== "string"
  ) {
    return null;
  }
  return {
    caseId: record.caseId,
    caseVersion: record.caseVersion,
    learningObjective: record.learningObjective,
    studentProfile,
    conversationHistory,
    studentMessage: record.studentMessage,
    problemContext: record.problemContext,
  };
}

export function parseTutorVisibleCasePacketFile(
  value: unknown,
): TutorVisibleCasePacketFile {
  if (containsForbiddenKey(value)) {
    throw new BenchmarkConfigurationError("tutor_response_corpus_invalid");
  }
  const record = asRecord(value);
  const casesValue = record?.cases;
  const cases = Array.isArray(casesValue)
    ? casesValue.map(parseVisibleCase)
    : null;
  if (
    record === null ||
    !hasOnlyKeys(record, ["schemaVersion", "datasetId", "datasetVersion", "cases"]) ||
    record.schemaVersion !== TUTOR_VISIBLE_CASE_PACKET_SCHEMA_VERSION ||
    !identifier(record.datasetId) ||
    !identifier(record.datasetVersion) ||
    cases === null ||
    cases.length === 0 ||
    cases.some((item): item is null => item === null) ||
    new Set((cases as TutorVisibleCasePacket[]).map((item) => item.caseId)).size !==
      (cases as TutorVisibleCasePacket[]).length
  ) {
    throw new BenchmarkConfigurationError("tutor_response_corpus_invalid");
  }
  return {
    schemaVersion: TUTOR_VISIBLE_CASE_PACKET_SCHEMA_VERSION,
    datasetId: record.datasetId,
    datasetVersion: record.datasetVersion,
    cases: cases as TutorVisibleCasePacket[],
  };
}

export type TutorResponseCorpusValidationIssueCode =
  | "dataset_mismatch"
  | "coverage_mismatch"
  | "tutor_descriptor_invalid"
  | "provenance_mismatch"
  | "unknown_case"
  | "case_version_mismatch"
  | "duplicate_response_id"
  | "duplicate_case_run"
  | "missing_response"
  | "coverage_incomplete";

export interface TutorResponseCorpusValidationIssue {
  readonly code: TutorResponseCorpusValidationIssueCode;
  readonly responseId?: string;
  readonly caseId?: string;
  readonly caseVersion?: string;
  readonly runIndex?: number;
}

export interface TutorResponseCorpusValidationInput {
  readonly corpus: TutorResponseCorpus;
  readonly dataset: TutorEvalDataset;
  readonly requireFull?: boolean;
}

function isValidTutorDescriptor(
  descriptor: TutorEvalTutorDescriptor,
): boolean {
  return (
    nonEmptyString(descriptor.provider) &&
    nonEmptyString(descriptor.model) &&
    nonEmptyString(descriptor.promptVersion) &&
    (descriptor.modelVersion === undefined || nonEmptyString(descriptor.modelVersion)) &&
    (descriptor.promptId === undefined || nonEmptyString(descriptor.promptId)) &&
    (descriptor.reasoningEffort === undefined || nonEmptyString(descriptor.reasoningEffort)) &&
    (descriptor.temperature === undefined ||
      (Number.isFinite(descriptor.temperature) && descriptor.temperature >= 0)) &&
    (descriptor.seed === undefined || Number.isInteger(descriptor.seed))
  );
}

function sortedIssues(
  issues: readonly TutorResponseCorpusValidationIssue[],
): TutorResponseCorpusValidationIssue[] {
  return [...issues].sort((left, right) =>
    JSON.stringify(left).localeCompare(JSON.stringify(right)),
  );
}

export function findTutorResponseCorpusValidationIssues(
  input: TutorResponseCorpusValidationInput,
): TutorResponseCorpusValidationIssue[] {
  const issues: TutorResponseCorpusValidationIssue[] = [];
  const { corpus, dataset } = input;
  if (
    corpus.datasetId !== dataset.id ||
    corpus.datasetVersion !== dataset.version
  ) {
    issues.push({ code: "dataset_mismatch" });
  }
  if (!isValidTutorDescriptor(corpus.tutor)) {
    issues.push({ code: "tutor_descriptor_invalid" });
  }
  const casesById = new Map(dataset.cases.map((tutorEvalCase) => [tutorEvalCase.id, tutorEvalCase]));
  const responseIds = new Set<string>();
  const caseRuns = new Set<string>();
  const responsesByCase = new Map<string, Set<number>>();
  for (const response of corpus.responses) {
    if (responseIds.has(response.responseId)) {
      issues.push({ code: "duplicate_response_id", responseId: response.responseId });
    }
    responseIds.add(response.responseId);
    const runKey = JSON.stringify([response.caseId, response.caseVersion, response.runIndex]);
    if (caseRuns.has(runKey)) {
      issues.push({
        code: "duplicate_case_run",
        responseId: response.responseId,
        caseId: response.caseId,
        caseVersion: response.caseVersion,
        runIndex: response.runIndex,
      });
    }
    caseRuns.add(runKey);
    if (response.provenance !== corpus.provenance) {
      issues.push({ code: "provenance_mismatch", responseId: response.responseId });
    }
    const tutorEvalCase = casesById.get(response.caseId);
    if (tutorEvalCase === undefined) {
      issues.push({ code: "unknown_case", responseId: response.responseId, caseId: response.caseId });
      continue;
    }
    if (tutorEvalCase.version !== response.caseVersion) {
      issues.push({
        code: "case_version_mismatch",
        responseId: response.responseId,
        caseId: response.caseId,
        caseVersion: response.caseVersion,
      });
      continue;
    }
    const runs = responsesByCase.get(response.caseId) ?? new Set<number>();
    runs.add(response.runIndex);
    responsesByCase.set(response.caseId, runs);
  }

  const requireFull = input.requireFull === true || corpus.coverage === "full";
  if (input.requireFull === true && corpus.coverage !== "full") {
    issues.push({ code: "coverage_mismatch" });
  }
  const selectedCaseIds = [...responsesByCase.keys()].sort((left, right) => left.localeCompare(right));
  for (const caseId of selectedCaseIds) {
    const runs = responsesByCase.get(caseId) ?? new Set<number>();
    for (let runIndex = 1; runIndex <= corpus.runsPerCase; runIndex += 1) {
      if (!runs.has(runIndex)) {
        issues.push({ code: "missing_response", caseId, runIndex });
      }
    }
  }
  if (requireFull) {
    for (const tutorEvalCase of dataset.cases) {
      if (!responsesByCase.has(tutorEvalCase.id)) {
        issues.push({ code: "missing_response", caseId: tutorEvalCase.id });
      }
    }
    if (responsesByCase.size !== dataset.cases.length) {
      issues.push({ code: "coverage_incomplete" });
    }
  }
  return sortedIssues(issues);
}

export function assertValidTutorResponseCorpus(
  input: TutorResponseCorpusValidationInput,
): void {
  if (findTutorResponseCorpusValidationIssues(input).length > 0) {
    throw new BenchmarkConfigurationError("tutor_response_corpus_invalid");
  }
}

export function parseAndValidateTutorResponseCorpus(
  value: unknown,
  dataset: TutorEvalDataset,
  options: Omit<TutorResponseCorpusValidationInput, "corpus" | "dataset"> = {},
): TutorResponseCorpus {
  const corpus = parseTutorResponseCorpus(value);
  assertValidTutorResponseCorpus({ corpus, dataset, ...options });
  return corpus;
}
