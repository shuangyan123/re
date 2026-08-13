import { BenchmarkConfigurationError } from "./errors.js";
import {
  buildTutorGenerationMessages,
  digestTutorPrompt,
  parseTutorGenerationSpec,
  type TutorGenerationMessage,
  type TutorGenerationSpec,
} from "./tutor-generation.js";
import {
  buildTutorVisibleCasePacketFile,
  type TutorVisibleCasePacket,
} from "./tutor-response-corpus.js";
import type { TutorEvalCase, TutorEvalDataset } from "./tutor-eval.js";

export const TUTOR_EXECUTION_PACKET_SCHEMA_VERSION = 1 as const;

export interface TutorExecutionPacketCase {
  readonly caseId: string;
  readonly caseVersion: string;
  readonly messages: readonly TutorGenerationMessage[];
}

/** Public host input. It contains no TutorEvalCase or evaluator-only data. */
export interface TutorExecutionPacketFile {
  readonly schemaVersion: typeof TUTOR_EXECUTION_PACKET_SCHEMA_VERSION;
  readonly datasetId: string;
  readonly datasetVersion: string;
  readonly generationSpec: TutorGenerationSpec;
  readonly cases: readonly TutorExecutionPacketCase[];
}

export type TutorExecutionPacket = TutorExecutionPacketFile;

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function identifier(value: unknown): value is string {
  return nonEmptyString(value) && value.length <= 200 && !/[\s|]/u.test(value);
}

interface UnknownRecord {
  readonly [key: string]: unknown;
}

function asRecord(value: unknown): UnknownRecord | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as UnknownRecord
    : null;
}

function hasOnlyKeys(record: UnknownRecord, allowed: readonly string[]): boolean {
  const allowedKeys = new Set(allowed);
  return Object.keys(record).every((key) => allowedKeys.has(key));
}

const forbiddenExecutionKeys = new Set([
  "evaluatoronly",
  "groundtruth",
  "knownmisconception",
  "rubrics",
  "rubricid",
  "criticalfailure",
  "criticalfailures",
  "judge",
  "judgeprompt",
  "humanannotations",
  "referencelabels",
  "disclosurepolicy",
]);

function containsForbiddenExecutionKey(value: unknown): boolean {
  if (Array.isArray(value)) {
    return value.some(containsForbiddenExecutionKey);
  }
  const record = asRecord(value);
  if (record === null) {
    return false;
  }
  return Object.entries(record).some(
    ([key, nested]) =>
      forbiddenExecutionKeys.has(key.toLowerCase()) ||
      containsForbiddenExecutionKey(nested),
  );
}

function parseMessage(value: unknown): TutorGenerationMessage | null {
  const record = asRecord(value);
  if (
    record === null ||
    !hasOnlyKeys(record, ["role", "content"]) ||
    (record.role !== "system" && record.role !== "user" && record.role !== "assistant") ||
    typeof record.content !== "string" ||
    record.content.length === 0
  ) {
    return null;
  }
  return {
    role: record.role,
    content: record.content,
  } as TutorGenerationMessage;
}

function parseCase(value: unknown): TutorExecutionPacketCase | null {
  const record = asRecord(value);
  const messages = Array.isArray(record?.messages)
    ? record.messages.map(parseMessage)
    : null;
  if (
    record === null ||
    !hasOnlyKeys(record, ["caseId", "caseVersion", "messages"]) ||
    !identifier(record.caseId) ||
    !identifier(record.caseVersion) ||
    messages === null ||
    messages.length < 3 ||
    messages.some((message): message is null => message === null) ||
    messages[0]?.role !== "system" ||
    messages[1]?.role !== "user" ||
    messages[messages.length - 1]?.role !== "user"
  ) {
    return null;
  }
  return {
    caseId: record.caseId,
    caseVersion: record.caseVersion,
    messages: messages as TutorGenerationMessage[],
  };
}

export function parseTutorExecutionPacketFile(
  value: unknown,
): TutorExecutionPacketFile {
  if (containsForbiddenExecutionKey(value)) {
    throw new BenchmarkConfigurationError("tutor_execution_packet_invalid");
  }
  const record = asRecord(value);
  const cases = Array.isArray(record?.cases)
    ? record.cases.map(parseCase)
    : null;
  let generationSpec: TutorGenerationSpec | null = null;
  try {
    generationSpec = parseTutorGenerationSpec(record?.generationSpec);
  } catch {
    generationSpec = null;
  }
  if (
    record === null ||
    !hasOnlyKeys(record, [
      "schemaVersion",
      "datasetId",
      "datasetVersion",
      "generationSpec",
      "cases",
    ]) ||
    record.schemaVersion !== TUTOR_EXECUTION_PACKET_SCHEMA_VERSION ||
    !identifier(record.datasetId) ||
    !identifier(record.datasetVersion) ||
    generationSpec === null ||
    cases === null ||
    cases.length === 0 ||
    cases.some((item): item is null => item === null) ||
    new Set((cases as TutorExecutionPacketCase[]).map((item) => item.caseId)).size !==
      (cases as TutorExecutionPacketCase[]).length
  ) {
    throw new BenchmarkConfigurationError("tutor_execution_packet_invalid");
  }
  const typedCases = cases as TutorExecutionPacketCase[];
  if (
    !typedCases.every((executionCase) => {
      const systemMessage = executionCase.messages[0];
      return systemMessage?.role === "system" &&
        digestTutorPrompt(systemMessage.content) === generationSpec.prompt.sha256;
    })
  ) {
    throw new BenchmarkConfigurationError("tutor_execution_packet_invalid");
  }
  return {
    schemaVersion: TUTOR_EXECUTION_PACKET_SCHEMA_VERSION,
    datasetId: record.datasetId,
    datasetVersion: record.datasetVersion,
    generationSpec,
    cases: [...typedCases].sort((left, right) =>
      left.caseId.localeCompare(right.caseId),
    ),
  };
}

export function assertValidTutorExecutionPacketFile(
  packet: TutorExecutionPacketFile,
): void {
  parseTutorExecutionPacketFile(packet);
}

function toExecutionCase(
  visibleCase: TutorVisibleCasePacket,
  generationSpec: TutorGenerationSpec,
  promptAsset: string,
): TutorExecutionPacketCase {
  return {
    caseId: visibleCase.caseId,
    caseVersion: visibleCase.caseVersion,
    messages: buildTutorGenerationMessages(visibleCase, generationSpec, promptAsset),
  };
}

/**
 * Converts cases through the existing visible packet before message mapping.
 * This is the single firewall path from TutorEval cases to host input.
 */
export function buildTutorExecutionPacketFile(
  dataset: TutorEvalDataset,
  selectedCases: readonly TutorEvalCase[],
  generationSpec: TutorGenerationSpec,
  promptAsset: string,
): TutorExecutionPacketFile {
  const visiblePacket = buildTutorVisibleCasePacketFile(dataset, selectedCases);
  const canonicalGenerationSpec = parseTutorGenerationSpec(generationSpec);
  const packet = {
    schemaVersion: TUTOR_EXECUTION_PACKET_SCHEMA_VERSION,
    datasetId: visiblePacket.datasetId,
    datasetVersion: visiblePacket.datasetVersion,
    generationSpec: canonicalGenerationSpec,
    cases: visiblePacket.cases.map((visibleCase) =>
      toExecutionCase(visibleCase, canonicalGenerationSpec, promptAsset),
    ),
  };
  return parseTutorExecutionPacketFile(packet);
}

export function buildTutorExecutionPacketForDataset(
  dataset: TutorEvalDataset,
  generationSpec: TutorGenerationSpec,
  promptAsset: string,
): TutorExecutionPacketFile {
  return buildTutorExecutionPacketFile(
    dataset,
    dataset.cases,
    generationSpec,
    promptAsset,
  );
}
