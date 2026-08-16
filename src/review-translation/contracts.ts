import { createHash } from "node:crypto";

export const REVIEW_TRANSLATION_SCHEMA_VERSION = 1 as const;
export const REVIEW_TRANSLATION_ARTIFACT_TYPE = "review-translation" as const;
export const REVIEW_TRANSLATION_TARGET_LOCALES = ["zh-CN"] as const;
export const REVIEW_TRANSLATION_DEFAULT_LOCALE = "zh-CN" as const;

export type ReviewTranslationLocale = (typeof REVIEW_TRANSLATION_TARGET_LOCALES)[number];

export const REVIEW_TRANSLATION_SOURCE_TYPES = [
  "student_message",
  "problem_context",
  "learning_objective",
  "conversation_message",
  "student_profile",
  "rubric_criterion",
  "tutor_response",
  "judge_evidence",
  "judge_factual_error",
  "judge_critical_failure_evidence",
  "critical_failure_evidence",
  "judge_diagnostic",
  "evaluation_diagnostic",
] as const;

export type ReviewTranslationSourceType =
  (typeof REVIEW_TRANSLATION_SOURCE_TYPES)[number];

export const REVIEW_TRANSLATION_FAILURE_CODES = [
  "translator_unavailable",
  "translator_invalid_response",
  "translator_timeout",
  "translator_transport_error",
] as const;

export type ReviewTranslationFailureCode =
  (typeof REVIEW_TRANSLATION_FAILURE_CODES)[number];

export type ReviewTranslationEntryStatus = "translated" | "failed";

export interface ReviewTranslationSource {
  readonly targetLocale: ReviewTranslationLocale;
  readonly sourceType: ReviewTranslationSourceType;
  readonly caseId: string;
  readonly runIndex?: number;
  /** Stable field path within the case or evaluation result. */
  readonly fieldKey: string;
  /** Exact source text used to derive sourceTextHash. */
  readonly sourceText: string;
}

export interface ReviewTranslationEntry {
  readonly entryId: string;
  readonly targetLocale: ReviewTranslationLocale;
  readonly sourceType: ReviewTranslationSourceType;
  readonly caseId: string;
  readonly runIndex?: number;
  readonly fieldKey: string;
  readonly sourceTextHash: string;
  readonly status: ReviewTranslationEntryStatus;
  readonly translatedText?: string;
  readonly failureCode?: ReviewTranslationFailureCode;
  /** Provider identity only; endpoint, credentials, and raw payloads are excluded. */
  readonly provider: string;
  readonly model?: string;
  readonly translatedAt: string;
}

export interface ReviewTranslationArtifact {
  readonly schemaVersion: typeof REVIEW_TRANSLATION_SCHEMA_VERSION;
  readonly artifactType: typeof REVIEW_TRANSLATION_ARTIFACT_TYPE;
  /** This artifact is never an evaluation input or official benchmark result. */
  readonly reviewOnly: true;
  readonly targetLocale: ReviewTranslationLocale;
  readonly sourceEvaluationRunId: string;
  readonly sourceEvaluationDatasetId: string;
  readonly sourceEvaluationDatasetVersion: string;
  readonly generatedAt: string;
  readonly translator: {
    readonly provider: string;
    readonly model?: string;
  };
  readonly entries: readonly ReviewTranslationEntry[];
}

export class ReviewTranslationArtifactError extends Error {
  readonly code = "review_translation_invalid" as const;

  constructor() {
    super("Review translation artifact is invalid.");
    this.name = "ReviewTranslationArtifactError";
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isReviewTranslationLocale(value: unknown): value is ReviewTranslationLocale {
  return REVIEW_TRANSLATION_TARGET_LOCALES.includes(
    value as ReviewTranslationLocale,
  );
}

function isSourceType(value: unknown): value is ReviewTranslationSourceType {
  return REVIEW_TRANSLATION_SOURCE_TYPES.includes(
    value as ReviewTranslationSourceType,
  );
}

function isFailureCode(value: unknown): value is ReviewTranslationFailureCode {
  return REVIEW_TRANSLATION_FAILURE_CODES.includes(
    value as ReviewTranslationFailureCode,
  );
}

function isDynamicSourceType(sourceType: ReviewTranslationSourceType): boolean {
  return [
    "tutor_response",
    "judge_evidence",
    "judge_factual_error",
    "judge_critical_failure_evidence",
    "critical_failure_evidence",
    "judge_diagnostic",
    "evaluation_diagnostic",
  ].includes(sourceType);
}

export function hashReviewTranslationSource(sourceText: string): string {
  return createHash("sha256").update(sourceText, "utf8").digest("hex");
}

export function reviewTranslationEntryKey(
  source: Pick<ReviewTranslationSource, "targetLocale" | "sourceType" | "caseId" | "runIndex" | "fieldKey">,
): string {
  return JSON.stringify([
    source.targetLocale,
    source.caseId,
    source.runIndex ?? null,
    source.sourceType,
    source.fieldKey,
  ]);
}

export function reviewTranslationEntryId(
  source: Pick<ReviewTranslationSource, "targetLocale" | "sourceType" | "caseId" | "runIndex" | "fieldKey">,
): string {
  return `review-translation-${createHash("sha256")
    .update(reviewTranslationEntryKey(source), "utf8")
    .digest("hex")
    .slice(0, 24)}`;
}

function parseEntry(value: unknown, targetLocale: ReviewTranslationLocale): ReviewTranslationEntry {
  const record = asRecord(value);
  const sourceType = record !== null && isSourceType(record.sourceType)
    ? record.sourceType
    : null;
  const runIndexValue = record?.runIndex;
  const runIndex = runIndexValue === undefined
    ? undefined
    : typeof runIndexValue === "number" && Number.isInteger(runIndexValue) && runIndexValue >= 1
      ? runIndexValue
      : null;
  const status = record?.status === "translated" || record?.status === "failed"
    ? record.status
    : null;
  if (
    record === null ||
    !nonEmptyString(record.entryId) ||
    !isReviewTranslationLocale(record.targetLocale) ||
    record.targetLocale !== targetLocale ||
    sourceType === null ||
    !nonEmptyString(record.caseId) ||
    !nonEmptyString(record.fieldKey) ||
    typeof record.sourceTextHash !== "string" ||
    !/^[a-f0-9]{64}$/u.test(record.sourceTextHash) ||
    runIndex === null ||
    status === null ||
    !nonEmptyString(record.provider) ||
    !nonEmptyString(record.translatedAt) ||
    (record.model !== undefined && !nonEmptyString(record.model)) ||
    record.entryId !== reviewTranslationEntryId({
      targetLocale,
      sourceType,
      caseId: record.caseId,
      ...(runIndex === undefined ? {} : { runIndex }),
      fieldKey: record.fieldKey,
    }) ||
    (sourceType !== null && isDynamicSourceType(sourceType) && runIndex === undefined) ||
    (sourceType !== null && !isDynamicSourceType(sourceType) && runIndex !== undefined)
  ) {
    throw new ReviewTranslationArtifactError();
  }

  if (status === "translated") {
    if (!nonEmptyString(record.translatedText) || record.failureCode !== undefined) {
      throw new ReviewTranslationArtifactError();
    }
  } else if (
    record.translatedText !== undefined ||
    !isFailureCode(record.failureCode)
  ) {
    throw new ReviewTranslationArtifactError();
  }

  return {
    entryId: record.entryId,
    targetLocale,
    sourceType,
    caseId: record.caseId,
    ...(runIndex === undefined ? {} : { runIndex }),
    fieldKey: record.fieldKey,
    sourceTextHash: record.sourceTextHash,
    status,
    ...(record.translatedText === undefined
      ? {}
      : { translatedText: record.translatedText }),
    ...(record.failureCode === undefined ? {} : { failureCode: record.failureCode }),
    provider: record.provider,
    ...(record.model === undefined ? {} : { model: record.model }),
    translatedAt: record.translatedAt,
  };
}

export function parseReviewTranslationArtifact(
  value: unknown,
): ReviewTranslationArtifact {
  const record = asRecord(value);
  const translator = asRecord(record?.translator);
  if (
    record === null ||
    record.schemaVersion !== REVIEW_TRANSLATION_SCHEMA_VERSION ||
    record.artifactType !== REVIEW_TRANSLATION_ARTIFACT_TYPE ||
    record.reviewOnly !== true ||
    !isReviewTranslationLocale(record.targetLocale) ||
    !nonEmptyString(record.sourceEvaluationRunId) ||
    !nonEmptyString(record.sourceEvaluationDatasetId) ||
    !nonEmptyString(record.sourceEvaluationDatasetVersion) ||
    !nonEmptyString(record.generatedAt) ||
    translator === null ||
    !nonEmptyString(translator.provider) ||
    (translator.model !== undefined && !nonEmptyString(translator.model)) ||
    !Array.isArray(record.entries)
  ) {
    throw new ReviewTranslationArtifactError();
  }

  const entries = record.entries.map((entry) =>
    parseEntry(entry, record.targetLocale as ReviewTranslationLocale),
  );
  const keys = entries.map((entry) => reviewTranslationEntryKey(entry));
  if (new Set(keys).size !== keys.length) {
    throw new ReviewTranslationArtifactError();
  }

  return {
    schemaVersion: REVIEW_TRANSLATION_SCHEMA_VERSION,
    artifactType: REVIEW_TRANSLATION_ARTIFACT_TYPE,
    reviewOnly: true,
    targetLocale: record.targetLocale,
    sourceEvaluationRunId: record.sourceEvaluationRunId,
    sourceEvaluationDatasetId: record.sourceEvaluationDatasetId,
    sourceEvaluationDatasetVersion: record.sourceEvaluationDatasetVersion,
    generatedAt: record.generatedAt,
    translator: {
      provider: translator.provider,
      ...(translator.model === undefined ? {} : { model: translator.model }),
    },
    entries,
  };
}
