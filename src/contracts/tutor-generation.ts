import { createHash } from "node:crypto";

import {
  BenchmarkConfigurationError,
  TutorGenerationExecutionError,
} from "./errors.js";
import type { TutorVisibleCasePacket } from "./tutor-response-corpus.js";
import { resolveTutorCaseLocale } from "./locale.js";

export const TUTOR_GENERATION_SPEC_SCHEMA_VERSION = 1 as const;
export const TUTOR_MIN_OUTPUT_TOKENS = 1 as const;
export const TUTOR_MAX_OUTPUT_TOKENS = 32_768 as const;
export const TUTOR_GENERATION_OPTIONAL_CONTROLS = [
  "temperature",
  "reasoningEffort",
  "seed",
] as const;

export const TUTOR_GENERATION_REQUIRED_CONTROLS = [
  "maxOutputTokens",
] as const;

export type TutorGenerationMessageRole = "system" | "user" | "assistant";

export interface TutorGenerationMessage {
  readonly role: TutorGenerationMessageRole;
  readonly content: string;
}

export interface TutorPromptIdentity {
  readonly id: string;
  readonly version: string;
  readonly sha256: string;
}

/**
 * Benchmark identity only. Provider, credentials, connection IDs, and raw
 * provider options belong to the execution host and are intentionally absent.
 */
export interface TutorGenerationSpec {
  readonly schemaVersion: typeof TUTOR_GENERATION_SPEC_SCHEMA_VERSION;
  readonly specId: string;
  readonly specVersion: string;
  readonly prompt: TutorPromptIdentity;
  readonly maxOutputTokens: number;
  readonly temperature?: number;
  readonly reasoningEffort?: string;
  readonly seed?: number;
}

export type TutorGenerationOptionalControl =
  (typeof TUTOR_GENERATION_OPTIONAL_CONTROLS)[number];

export type TutorGenerationRequiredControl =
  (typeof TUTOR_GENERATION_REQUIRED_CONTROLS)[number];

export type TutorGenerationExecutionControl =
  | TutorGenerationRequiredControl
  | TutorGenerationOptionalControl;

/**
 * Host capability attestation for generation controls. A true value means the
 * host will honor every specified value for that control exactly; false or
 * absent means the control cannot be used by the host. Required controls must
 * be attested even when they are not optional in the generation spec.
 */
export type TutorGenerationSpecExecutionSupport = Readonly<
  Partial<Record<TutorGenerationExecutionControl, boolean>>
>;

type TutorGenerationSpecWithoutVersion = Omit<
  TutorGenerationSpec,
  "schemaVersion"
>;

interface UnknownRecord {
  readonly [key: string]: unknown;
}

function asRecord(value: unknown): UnknownRecord | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as UnknownRecord
    : null;
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function identifier(value: unknown): value is string {
  return nonEmptyString(value) && value.length <= 200 && !/[\s|]/u.test(value);
}

function hasOnlyKeys(record: UnknownRecord, allowed: readonly string[]): boolean {
  const allowedKeys = new Set(allowed);
  return Object.keys(record).every((key) => allowedKeys.has(key));
}

function optionalNumber(
  record: UnknownRecord,
  key: string,
): number | undefined | null {
  if (!(key in record)) {
    return undefined;
  }
  return typeof record[key] === "number" && Number.isFinite(record[key])
    ? record[key] as number
    : null;
}

function optionalString(
  record: UnknownRecord,
  key: string,
): string | undefined | null {
  if (!(key in record)) {
    return undefined;
  }
  return nonEmptyString(record[key]) ? record[key] as string : null;
}

function parsePromptIdentity(value: unknown): TutorPromptIdentity | null {
  const record = asRecord(value);
  if (
    record === null ||
    !hasOnlyKeys(record, ["id", "version", "sha256"]) ||
    !identifier(record.id) ||
    !identifier(record.version) ||
    typeof record.sha256 !== "string" ||
    !/^[a-f0-9]{64}$/u.test(record.sha256)
  ) {
    return null;
  }
  return {
    id: record.id,
    version: record.version,
    sha256: record.sha256,
  };
}

export function isTutorGenerationSpec(value: unknown): value is TutorGenerationSpec {
  const record = asRecord(value);
  const prompt = parsePromptIdentity(record?.prompt);
  const temperature = record === null ? null : optionalNumber(record, "temperature");
  const reasoningEffort = record === null
    ? null
    : optionalString(record, "reasoningEffort");
  const seed = record?.seed;
  return (
    record !== null &&
    hasOnlyKeys(record, [
      "schemaVersion",
      "specId",
      "specVersion",
      "prompt",
      "maxOutputTokens",
      "temperature",
      "reasoningEffort",
      "seed",
    ]) &&
    record.schemaVersion === TUTOR_GENERATION_SPEC_SCHEMA_VERSION &&
    identifier(record.specId) &&
    identifier(record.specVersion) &&
    prompt !== null &&
    typeof record.maxOutputTokens === "number" &&
    Number.isInteger(record.maxOutputTokens) &&
    record.maxOutputTokens >= TUTOR_MIN_OUTPUT_TOKENS &&
    record.maxOutputTokens <= TUTOR_MAX_OUTPUT_TOKENS &&
    temperature !== null &&
    (temperature === undefined || (temperature >= 0 && temperature <= 2)) &&
    reasoningEffort !== null &&
    (reasoningEffort === undefined || reasoningEffort.length <= 100) &&
    (seed === undefined || (
      typeof seed === "number" &&
      Number.isInteger(seed) &&
      seed >= 0 &&
      seed <= 2_147_483_647
    ))
  );
}

/** Returns the exact field order used when a spec is serialized. */
export function canonicalizeTutorGenerationSpec(
  spec: TutorGenerationSpec,
): TutorGenerationSpec {
  return {
    schemaVersion: TUTOR_GENERATION_SPEC_SCHEMA_VERSION,
    specId: spec.specId,
    specVersion: spec.specVersion,
    prompt: {
      id: spec.prompt.id,
      version: spec.prompt.version,
      sha256: spec.prompt.sha256,
    },
    maxOutputTokens: spec.maxOutputTokens,
    ...(spec.temperature === undefined ? {} : { temperature: spec.temperature }),
    ...(spec.reasoningEffort === undefined
      ? {}
      : { reasoningEffort: spec.reasoningEffort }),
    ...(spec.seed === undefined ? {} : { seed: spec.seed }),
  };
}

export function parseTutorGenerationSpec(value: unknown): TutorGenerationSpec {
  if (!isTutorGenerationSpec(value)) {
    throw new BenchmarkConfigurationError("tutor_generation_spec_invalid");
  }
  return canonicalizeTutorGenerationSpec(value);
}

export function assertValidTutorGenerationSpec(spec: TutorGenerationSpec): void {
  parseTutorGenerationSpec(spec);
}

/**
 * Fails closed when a host cannot honor a required generation control. The
 * benchmark core does not infer support from provider names or SDK behavior.
 */
export function assertTutorGenerationSpecExecutionSupport(
  spec: TutorGenerationSpec,
  support: TutorGenerationSpecExecutionSupport,
): void {
  const canonicalSpec = parseTutorGenerationSpec(spec);
  const unsupportedFields: TutorGenerationExecutionControl[] = [
    ...TUTOR_GENERATION_REQUIRED_CONTROLS.filter(
      (field) => support[field] !== true,
    ),
    ...TUTOR_GENERATION_OPTIONAL_CONTROLS.filter(
      (field) => canonicalSpec[field] !== undefined && support[field] !== true,
    ),
  ];
  if (unsupportedFields.length > 0) {
    throw new TutorGenerationExecutionError(unsupportedFields);
  }
}

export function createTutorGenerationSpec(
  input: TutorGenerationSpecWithoutVersion,
): TutorGenerationSpec {
  return parseTutorGenerationSpec({
    schemaVersion: TUTOR_GENERATION_SPEC_SCHEMA_VERSION,
    ...input,
  });
}

/** Hashes the exact UTF-8 bytes represented by a prompt string. */
export function digestTutorPrompt(promptAsset: string | Uint8Array): string {
  return createHash("sha256")
    .update(typeof promptAsset === "string" ? Buffer.from(promptAsset, "utf8") : promptAsset)
    .digest("hex");
}

export function tutorGenerationSpecsEqual(
  left: TutorGenerationSpec | undefined,
  right: TutorGenerationSpec | undefined,
): boolean {
  if (left === undefined || right === undefined) {
    return left === right;
  }
  return JSON.stringify(canonicalizeTutorGenerationSpec(left)) ===
    JSON.stringify(canonicalizeTutorGenerationSpec(right));
}

/** Stable student profile encoding with an explicit field order. */
export function serializeTutorStudentProfile(
  profile: TutorVisibleCasePacket["studentProfile"],
): string {
  return JSON.stringify({
    level: profile.level,
    knownConcepts: [...profile.knownConcepts],
    misconceptions: [...profile.misconceptions],
    goal: profile.goal,
  });
}

/** Stable, evaluator-free context encoding used before conversation turns. */
export function serializeTutorVisibleBenchmarkContext(
  visibleCase: TutorVisibleCasePacket,
): string {
  return [
    "Tutor Benchmark visible context",
    `targetLocale=${JSON.stringify(resolveTutorCaseLocale(visibleCase.locale))}`,
    `learningObjective=${JSON.stringify(visibleCase.learningObjective)}`,
    `studentProfile=${serializeTutorStudentProfile(visibleCase.studentProfile)}`,
    `problemContext=${JSON.stringify(visibleCase.problemContext)}`,
  ].join("\n");
}

function toGenerationMessageRole(
  role: "student" | "tutor",
): "user" | "assistant" {
  return role === "student" ? "user" : "assistant";
}

/**
 * Builds the one canonical message sequence executed by every future host.
 * The generation spec validates the prompt asset identity but is not copied
 * into message text; hosts receive it separately as execution parameters.
 */
export function buildTutorGenerationMessages(
  visibleCase: TutorVisibleCasePacket,
  generationSpec: TutorGenerationSpec,
  promptAsset: string,
): readonly TutorGenerationMessage[] {
  const spec = parseTutorGenerationSpec(generationSpec);
  if (promptAsset.length === 0 || digestTutorPrompt(promptAsset) !== spec.prompt.sha256) {
    throw new BenchmarkConfigurationError("tutor_generation_spec_invalid");
  }
  return [
    { role: "system", content: promptAsset },
    {
      role: "user",
      content: serializeTutorVisibleBenchmarkContext(visibleCase),
    },
    ...visibleCase.conversationHistory.map((message) => ({
      role: toGenerationMessageRole(message.role),
      content: message.text,
    })),
    { role: "user", content: visibleCase.studentMessage },
  ];
}
