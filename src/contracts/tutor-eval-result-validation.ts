import { BenchmarkConfigurationError } from "./errors.js";
import {
  TUTOR_EVAL_RESULT_SCHEMA_VERSION,
  type TutorEvalCaseRunResult,
  type TutorEvalCategoryScores,
  type TutorEvalRunResult,
} from "./result.js";
import { TUTOR_EVAL_CATEGORIES } from "./tutor-eval.js";
import { isTutorEvalJudgeResult } from "./tutor-eval-validation.js";

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as UnknownRecord)
    : null;
}

function isFiniteNumberOrNull(value: unknown): value is number | null {
  return value === null || (typeof value === "number" && Number.isFinite(value));
}

function isScore(value: unknown): value is number | null {
  return (
    value === null ||
    (typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1)
  );
}

function isDiagnostic(value: unknown): boolean {
  const record = asRecord(value);
  return (
    record !== null &&
    typeof record.code === "string" &&
    typeof record.message === "string"
  );
}

function isTokenUsage(value: unknown): boolean {
  const record = asRecord(value);
  if (record === null) {
    return false;
  }
  const allowedKeys = new Set(["inputTokens", "outputTokens", "totalTokens"]);
  return Object.entries(record).every(
    ([key, tokenCount]) =>
      allowedKeys.has(key) &&
      typeof tokenCount === "number" &&
      Number.isInteger(tokenCount) &&
      tokenCount >= 0,
  );
}

function isJudgeMetrics(value: unknown): boolean {
  const record = asRecord(value);
  const allowedKeys = new Set(["latencyMs", "tokenUsage", "cost", "attempts"]);
  return (
    record !== null &&
    Object.keys(record).every((key) => allowedKeys.has(key)) &&
    typeof record.latencyMs === "number" &&
    Number.isFinite(record.latencyMs) &&
    record.latencyMs >= 0 &&
    (record.tokenUsage === null || isTokenUsage(record.tokenUsage)) &&
    (record.cost === null ||
      (typeof record.cost === "number" &&
        Number.isFinite(record.cost) &&
        record.cost >= 0)) &&
    typeof record.attempts === "number" &&
    Number.isInteger(record.attempts) &&
    record.attempts >= 1
  );
}

function isCriticalFailure(value: unknown): boolean {
  const record = asRecord(value);
  return (
    record !== null &&
    typeof record.type === "string" &&
    (record.severity === "minor" ||
      record.severity === "major" ||
      record.severity === "critical") &&
    typeof record.evidence === "string"
  );
}

function isRubricResult(value: unknown): boolean {
  const record = asRecord(value);
  return (
    record !== null &&
    typeof record.rubricId === "string" &&
    TUTOR_EVAL_CATEGORIES.includes(
      record.category as (typeof TUTOR_EVAL_CATEGORIES)[number],
    ) &&
    (record.result === "PASS" ||
      record.result === "PARTIAL" ||
      record.result === "FAIL" ||
      record.result === "ERROR") &&
    isScore(record.score) &&
    typeof record.weight === "number" &&
    Number.isFinite(record.weight) &&
    record.weight > 0 &&
    typeof record.critical === "boolean" &&
    Array.isArray(record.diagnostics) &&
    record.diagnostics.every(isDiagnostic)
  );
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function isTutorDescriptor(value: unknown): boolean {
  const record = asRecord(value);
  return (
    record !== null &&
    typeof record.provider === "string" &&
    record.provider.trim().length > 0 &&
    typeof record.model === "string" &&
    record.model.trim().length > 0 &&
    typeof record.promptVersion === "string" &&
    record.promptVersion.trim().length > 0 &&
    (record.reasoningEffort === undefined ||
      (typeof record.reasoningEffort === "string" &&
        record.reasoningEffort.trim().length > 0))
  );
}

function isJudgeDescriptor(value: unknown): boolean {
  const record = asRecord(value);
  return (
    isTutorDescriptor(value) &&
    record !== null &&
    (record.thinkingMode === undefined ||
      record.thinkingMode === "enabled" ||
      record.thinkingMode === "disabled") &&
    (record.maxOutputTokens === undefined ||
      (typeof record.maxOutputTokens === "number" &&
        Number.isInteger(record.maxOutputTokens) &&
        record.maxOutputTokens >= 1)) &&
    (record.reasoningEffort === undefined ||
      (typeof record.reasoningEffort === "string" &&
        record.reasoningEffort.trim().length > 0))
  );
}

function isCategoryScores(value: unknown): value is TutorEvalCategoryScores {
  const record = asRecord(value);
  return (
    record !== null &&
    TUTOR_EVAL_CATEGORIES.every((category) => isScore(record[category]))
  );
}

function isCaseRunResult(value: unknown): value is TutorEvalCaseRunResult {
  const record = asRecord(value);
  return (
    record !== null &&
    typeof record.caseId === "string" &&
    typeof record.caseVersion === "string" &&
    typeof record.runIndex === "number" &&
    Number.isInteger(record.runIndex) &&
    record.runIndex >= 1 &&
    (record.status === "passed" || record.status === "failed" || record.status === "error") &&
    typeof record.passed === "boolean" &&
    (typeof record.rawTutorResponse === "string" || record.rawTutorResponse === null) &&
    (record.rawJudgeResult === null || isTutorEvalJudgeResult(record.rawJudgeResult)) &&
    (record.judgeMetrics === undefined ||
      record.judgeMetrics === null ||
      isJudgeMetrics(record.judgeMetrics)) &&
    Array.isArray(record.rubricResults) &&
    record.rubricResults.every(isRubricResult) &&
    isCategoryScores(record.categoryScores) &&
    isScore(record.overallScore) &&
    (record.qualityGate === "PASS" || record.qualityGate === "FAIL") &&
    Array.isArray(record.criticalFailures) &&
    record.criticalFailures.every(isCriticalFailure) &&
    typeof record.answerLeakage === "boolean" &&
    isFiniteNumberOrNull(record.latencyMs) &&
    (record.tokenUsage === null || asRecord(record.tokenUsage) !== null) &&
    isFiniteNumberOrNull(record.cost) &&
    Array.isArray(record.diagnostics) &&
    record.diagnostics.every(isDiagnostic)
  );
}

export function isTutorEvalRunResult(value: unknown): value is TutorEvalRunResult {
  const record = asRecord(value);
  const caseResults = record?.caseResults;
  return (
    record !== null &&
    record.schemaVersion === TUTOR_EVAL_RESULT_SCHEMA_VERSION &&
    typeof record.runId === "string" &&
    typeof record.createdAt === "string" &&
    typeof record.startedAt === "string" &&
    typeof record.finishedAt === "string" &&
    typeof record.durationMs === "number" &&
    Number.isFinite(record.durationMs) &&
    record.durationMs >= 0 &&
    typeof record.datasetId === "string" &&
    typeof record.datasetVersion === "string" &&
    (record.evaluatorVersion === undefined ||
      (typeof record.evaluatorVersion === "string" &&
        record.evaluatorVersion.trim().length > 0)) &&
    asRecord(record.tutor) !== null &&
    (record.judge === null || isJudgeDescriptor(record.judge)) &&
    typeof record.runsPerCase === "number" &&
    Number.isInteger(record.runsPerCase) &&
    record.runsPerCase >= 1 &&
    isNonNegativeInteger(record.caseCount) &&
    isNonNegativeInteger(record.caseRunCount) &&
    isNonNegativeInteger(record.passedCount) &&
    isNonNegativeInteger(record.failedCount) &&
    isNonNegativeInteger(record.errorCount) &&
    record.passedCount + record.failedCount + record.errorCount === record.caseRunCount &&
    isTutorDescriptor(record.tutor) &&
    isCategoryScores(record.categoryScores) &&
    isFiniteNumberOrNull(record.overallScore) &&
    typeof record.criticalFailureRate === "number" &&
    Number.isFinite(record.criticalFailureRate) &&
    record.criticalFailureRate >= 0 &&
    record.criticalFailureRate <= 1 &&
    typeof record.answerLeakageRate === "number" &&
    Number.isFinite(record.answerLeakageRate) &&
    record.answerLeakageRate >= 0 &&
    record.answerLeakageRate <= 1 &&
    Array.isArray(caseResults) &&
    record.caseRunCount === caseResults.length &&
    caseResults.every(isCaseRunResult)
  );
}

export function assertValidTutorEvalRunResult(
  value: unknown,
): asserts value is TutorEvalRunResult {
  if (!isTutorEvalRunResult(value)) {
    throw new BenchmarkConfigurationError("tutor_eval_result_invalid");
  }
}
