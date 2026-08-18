import { readFile } from "node:fs/promises";

export const JUDGE_V04_LEAKAGE_VALIDATION_SCHEMA_VERSION = 1 as const;
export const JUDGE_V04_LEAKAGE_VALIDATION_ID =
  "tutor-eval-judge-v0.4-positive-set-validation" as const;
export const JUDGE_V04_LEAKAGE_VALIDATION_EVIDENCE_STATUS = "operator_attested" as const;
export const JUDGE_V04_LEAKAGE_VALIDATION_SCOPE =
  "historical_judge_positive_human_audited_subset" as const;

export const JUDGE_V04_LEAKAGE_VALIDATION_LIMITATIONS = [
  "positive subset only",
  "historical Judge-negative cases not human audited",
  "recall unknown",
  "false-negative rate unknown",
  "full-corpus prevalence unknown",
  "calibration not established",
  "12/12 is subset agreement, not general accuracy",
] as const;

export const JUDGE_V04_LEAKAGE_VALIDATION_EXPECTED_CASES = [
  { caseId: "science-graph-error-001", locale: "en", humanLeakage: false },
  { caseId: "language-word-context-001", locale: "en", humanLeakage: false },
  { caseId: "language-word-context-001-zh-CN", locale: "zh-CN", humanLeakage: false },
  { caseId: "paired-fraction-conceptual-001", locale: "en", humanLeakage: true },
  { caseId: "paired-fraction-conceptual-001-zh-CN", locale: "zh-CN", humanLeakage: true },
  { caseId: "paired-fraction-procedural-001", locale: "en", humanLeakage: true },
  { caseId: "paired-fraction-procedural-001-zh-CN", locale: "zh-CN", humanLeakage: true },
  { caseId: "paired-multiplication-procedural-001", locale: "en", humanLeakage: true },
  { caseId: "paired-multiplication-procedural-001-zh-CN", locale: "zh-CN", humanLeakage: true },
  { caseId: "programming-loop-diagnosis-001", locale: "en", humanLeakage: true },
  { caseId: "programming-abstraction-transfer-001-zh-CN", locale: "zh-CN", humanLeakage: true },
  { caseId: "science-force-transfer-001-zh-CN", locale: "zh-CN", humanLeakage: true },
] as const;

type JudgeV04LeakageValidationLocale = "en" | "zh-CN";
type JudgeV04LeakageValidationCaseStatus = "passed" | "failed";

interface JudgeV04LeakageValidationTutor {
  readonly provider: string;
  readonly model: string;
  readonly promptVersion: string;
}

interface JudgeV04LeakageValidationSource {
  readonly datasetId: string;
  readonly datasetVersion: string;
  readonly corpusId: string;
  readonly corpusVersion: string;
  readonly tutor: JudgeV04LeakageValidationTutor;
}

interface JudgeV04LeakageValidationHistoricalJudge {
  readonly provider: string;
  readonly model: string;
  readonly promptId: string;
  readonly promptVersion: string;
  readonly observedPositiveCount: number;
}

interface JudgeV04LeakageValidationJudge {
  readonly provider: string;
  readonly model: string;
  readonly promptId: string;
  readonly promptVersion: string;
  readonly reasoningEffort: string;
  readonly thinkingMode: "enabled";
  readonly maxOutputTokens: number;
  readonly timeoutMs: number;
  readonly maxAttempts: number;
}

export interface JudgeV04LeakageValidationCase {
  readonly caseId: string;
  readonly locale: JudgeV04LeakageValidationLocale;
  readonly humanLeakage: boolean;
  readonly historicalJudgeV03Leakage: true;
  readonly judgeV04Leakage: boolean;
  readonly finalStatus: JudgeV04LeakageValidationCaseStatus;
  readonly agreesWithHuman: boolean;
  readonly criticalFailureType?: "answer_leakage";
  readonly criticalFailureSeverity?: "major";
}

interface JudgeV04LeakageValidationExecutionNotes {
  readonly caseId: "programming-loop-diagnosis-001";
  readonly initialResult: "judge_result_invalid";
  readonly initialClassificationValid: false;
  readonly recovery: "strict_resume";
  readonly reusedCaseRuns: 8;
  readonly judgeCallsMade: 1;
  readonly finalCaseRuns: 9;
  readonly finalClassificationValid: true;
}

interface JudgeV04LeakageValidationSummary {
  readonly humanConfirmedPositiveCount: number;
  readonly historicalFalsePositiveCount: number;
  readonly v04ConfirmedPositiveRetainedCount: number;
  readonly v04FalsePositiveCorrectedCount: number;
  readonly agreementCount: number;
  readonly disagreementCount: number;
  readonly observedAgreement: number;
}

export interface JudgeV04LeakageValidationArtifact {
  readonly schemaVersion: typeof JUDGE_V04_LEAKAGE_VALIDATION_SCHEMA_VERSION;
  readonly validationId: typeof JUDGE_V04_LEAKAGE_VALIDATION_ID;
  readonly evidenceStatus: typeof JUDGE_V04_LEAKAGE_VALIDATION_EVIDENCE_STATUS;
  readonly status: "preliminary";
  readonly calibrationStatus: "uncalibrated";
  readonly source: JudgeV04LeakageValidationSource;
  readonly historicalJudge: JudgeV04LeakageValidationHistoricalJudge;
  readonly validationJudge: JudgeV04LeakageValidationJudge;
  readonly scope: {
    readonly type: typeof JUDGE_V04_LEAKAGE_VALIDATION_SCOPE;
    readonly fullCorpusCaseCount: 48;
    readonly selectedCaseCount: 12;
    readonly judgeNegativeCasesHumanAudited: false;
  };
  readonly summary: JudgeV04LeakageValidationSummary;
  readonly cases: readonly JudgeV04LeakageValidationCase[];
  readonly executionNotes: JudgeV04LeakageValidationExecutionNotes;
  readonly limitations: readonly string[];
}

export class JudgeV04LeakageValidationError extends Error {
  readonly code = "judge_v04_leakage_validation_invalid" as const;

  constructor() {
    super("DeepSeek Judge v0.4 leakage validation artifact is invalid.");
    this.name = "JudgeV04LeakageValidationError";
  }
}

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(record: UnknownRecord, allowed: readonly string[]): boolean {
  const allowedKeys = new Set(allowed);
  return Object.keys(record).every((key) => allowedKeys.has(key));
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isBoolean(value: unknown): value is boolean {
  return typeof value === "boolean";
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function isRate(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1;
}

function parseTutor(value: unknown): JudgeV04LeakageValidationTutor | undefined {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, ["provider", "model", "promptVersion"]) ||
    !isNonEmptyString(value.provider) ||
    !isNonEmptyString(value.model) ||
    !isNonEmptyString(value.promptVersion)
  ) {
    return undefined;
  }
  return {
    provider: value.provider,
    model: value.model,
    promptVersion: value.promptVersion,
  };
}

function parseSource(value: unknown): JudgeV04LeakageValidationSource | undefined {
  if (!isRecord(value) || !hasOnlyKeys(value, ["datasetId", "datasetVersion", "corpusId", "corpusVersion", "tutor"])) {
    return undefined;
  }
  const tutor = parseTutor(value.tutor);
  if (
    !isNonEmptyString(value.datasetId) ||
    !isNonEmptyString(value.datasetVersion) ||
    !isNonEmptyString(value.corpusId) ||
    !isNonEmptyString(value.corpusVersion) ||
    tutor === undefined
  ) {
    return undefined;
  }
  return {
    datasetId: value.datasetId,
    datasetVersion: value.datasetVersion,
    corpusId: value.corpusId,
    corpusVersion: value.corpusVersion,
    tutor,
  };
}

function parseHistoricalJudge(
  value: unknown,
): JudgeV04LeakageValidationHistoricalJudge | undefined {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, ["provider", "model", "promptId", "promptVersion", "observedPositiveCount"]) ||
    !isNonEmptyString(value.provider) ||
    !isNonEmptyString(value.model) ||
    !isNonEmptyString(value.promptId) ||
    !isNonEmptyString(value.promptVersion) ||
    !isNonNegativeInteger(value.observedPositiveCount)
  ) {
    return undefined;
  }
  return {
    provider: value.provider,
    model: value.model,
    promptId: value.promptId,
    promptVersion: value.promptVersion,
    observedPositiveCount: value.observedPositiveCount,
  };
}

function parseValidationJudge(
  value: unknown,
): JudgeV04LeakageValidationJudge | undefined {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, [
      "provider",
      "model",
      "promptId",
      "promptVersion",
      "reasoningEffort",
      "thinkingMode",
      "maxOutputTokens",
      "timeoutMs",
      "maxAttempts",
    ]) ||
    !isNonEmptyString(value.provider) ||
    !isNonEmptyString(value.model) ||
    !isNonEmptyString(value.promptId) ||
    !isNonEmptyString(value.promptVersion) ||
    !isNonEmptyString(value.reasoningEffort) ||
    value.thinkingMode !== "enabled" ||
    !isNonNegativeInteger(value.maxOutputTokens) ||
    !isNonNegativeInteger(value.timeoutMs) ||
    !isNonNegativeInteger(value.maxAttempts)
  ) {
    return undefined;
  }
  return {
    provider: value.provider,
    model: value.model,
    promptId: value.promptId,
    promptVersion: value.promptVersion,
    reasoningEffort: value.reasoningEffort,
    thinkingMode: "enabled",
    maxOutputTokens: value.maxOutputTokens,
    timeoutMs: value.timeoutMs,
    maxAttempts: value.maxAttempts,
  };
}

function parseCase(value: unknown): JudgeV04LeakageValidationCase | undefined {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, [
      "caseId",
      "locale",
      "humanLeakage",
      "historicalJudgeV03Leakage",
      "judgeV04Leakage",
      "finalStatus",
      "agreesWithHuman",
      "criticalFailureType",
      "criticalFailureSeverity",
    ]) ||
    !isNonEmptyString(value.caseId)
  ) {
    return undefined;
  }

  const expectedCase = JUDGE_V04_LEAKAGE_VALIDATION_EXPECTED_CASES.find(
    (candidate) => candidate.caseId === value.caseId,
  );
  const humanLeakage = value.humanLeakage;
  const judgeV04Leakage = value.judgeV04Leakage;
  const agreesWithHuman = value.agreesWithHuman;
  if (
    expectedCase === undefined ||
    value.locale !== expectedCase.locale ||
    !isBoolean(humanLeakage) ||
    humanLeakage !== expectedCase.humanLeakage ||
    value.historicalJudgeV03Leakage !== true ||
    !isBoolean(judgeV04Leakage) ||
    !isNonEmptyString(value.finalStatus) ||
    (value.finalStatus !== "passed" && value.finalStatus !== "failed") ||
    !isBoolean(agreesWithHuman) ||
    agreesWithHuman !== (humanLeakage === judgeV04Leakage) ||
    (judgeV04Leakage && value.finalStatus !== "failed")
  ) {
    return undefined;
  }

  const hasCriticalFailureFields =
    value.criticalFailureType !== undefined || value.criticalFailureSeverity !== undefined;
  if (
    judgeV04Leakage &&
    (value.criticalFailureType !== "answer_leakage" || value.criticalFailureSeverity !== "major")
  ) {
    return undefined;
  }
  if (!judgeV04Leakage && hasCriticalFailureFields) {
    return undefined;
  }

  return {
    caseId: expectedCase.caseId,
    locale: expectedCase.locale,
    humanLeakage,
    historicalJudgeV03Leakage: true,
    judgeV04Leakage,
    finalStatus: value.finalStatus,
    agreesWithHuman,
    ...(judgeV04Leakage
      ? { criticalFailureType: "answer_leakage" as const, criticalFailureSeverity: "major" as const }
      : {}),
  };
}

function parseExecutionNotes(value: unknown): JudgeV04LeakageValidationExecutionNotes | undefined {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, [
      "caseId",
      "initialResult",
      "initialClassificationValid",
      "recovery",
      "reusedCaseRuns",
      "judgeCallsMade",
      "finalCaseRuns",
      "finalClassificationValid",
    ]) ||
    value.caseId !== "programming-loop-diagnosis-001" ||
    value.initialResult !== "judge_result_invalid" ||
    value.initialClassificationValid !== false ||
    value.recovery !== "strict_resume" ||
    value.reusedCaseRuns !== 8 ||
    value.judgeCallsMade !== 1 ||
    value.finalCaseRuns !== 9 ||
    value.finalClassificationValid !== true
  ) {
    return undefined;
  }
  return {
    caseId: "programming-loop-diagnosis-001",
    initialResult: "judge_result_invalid",
    initialClassificationValid: false,
    recovery: "strict_resume",
    reusedCaseRuns: 8,
    judgeCallsMade: 1,
    finalCaseRuns: 9,
    finalClassificationValid: true,
  };
}

function invalid(): never {
  throw new JudgeV04LeakageValidationError();
}

export function parseJudgeV04LeakageValidationArtifact(
  value: unknown,
): JudgeV04LeakageValidationArtifact {
  const record = isRecord(value) ? value : undefined;
  const source = parseSource(record?.source);
  const historicalJudge = parseHistoricalJudge(record?.historicalJudge);
  const validationJudge = parseValidationJudge(record?.validationJudge);
  const scope = isRecord(record?.scope) ? record.scope : undefined;
  const summary = isRecord(record?.summary) ? record.summary : undefined;
  const executionNotes = parseExecutionNotes(record?.executionNotes);
  const limitationsValue = record?.limitations;
  const parsedCases = Array.isArray(record?.cases)
    ? record.cases.map(parseCase)
    : undefined;

  if (
    record === undefined ||
    !hasOnlyKeys(record, [
      "schemaVersion",
      "validationId",
      "evidenceStatus",
      "status",
      "calibrationStatus",
      "source",
      "historicalJudge",
      "validationJudge",
      "scope",
      "summary",
      "cases",
      "executionNotes",
      "limitations",
    ]) ||
    record.schemaVersion !== JUDGE_V04_LEAKAGE_VALIDATION_SCHEMA_VERSION ||
    record.validationId !== JUDGE_V04_LEAKAGE_VALIDATION_ID ||
    record.evidenceStatus !== JUDGE_V04_LEAKAGE_VALIDATION_EVIDENCE_STATUS ||
    record.status !== "preliminary" ||
    record.calibrationStatus !== "uncalibrated" ||
    source === undefined ||
    historicalJudge === undefined ||
    validationJudge === undefined ||
    scope === undefined ||
    summary === undefined ||
    parsedCases === undefined ||
    parsedCases.some((entry): entry is undefined => entry === undefined) ||
    executionNotes === undefined ||
    !Array.isArray(limitationsValue) ||
    !limitationsValue.every(isNonEmptyString)
  ) {
    return invalid();
  }

  const cases = parsedCases as JudgeV04LeakageValidationCase[];
  const limitations = limitationsValue as string[];
  const expectedCaseIds = new Set<string>(
    JUDGE_V04_LEAKAGE_VALIDATION_EXPECTED_CASES.map((expectedCase) => expectedCase.caseId),
  );
  const caseIds = new Set(cases.map((entry) => entry.caseId));
  const humanConfirmedPositiveCount = cases.filter((entry) => entry.humanLeakage).length;
  const historicalFalsePositiveCount = cases.filter((entry) => !entry.humanLeakage).length;
  const v04ConfirmedPositiveRetainedCount = cases.filter((entry) => entry.judgeV04Leakage).length;
  const v04FalsePositiveCorrectedCount = cases.filter(
    (entry) => !entry.humanLeakage && !entry.judgeV04Leakage,
  ).length;
  const agreementCount = cases.filter((entry) => entry.agreesWithHuman).length;
  const disagreementCount = cases.length - agreementCount;

  if (
    caseIds.size !== cases.length ||
    cases.length !== JUDGE_V04_LEAKAGE_VALIDATION_EXPECTED_CASES.length ||
    caseIds.size !== expectedCaseIds.size ||
    cases.some((entry) => !expectedCaseIds.has(entry.caseId)) ||
    source.datasetId !== "tutor-eval-v0.2a" ||
    source.datasetVersion !== "0.2a.3" ||
    source.corpusId !== "preliminary-minimax-m27-tutor-bilingual-001" ||
    source.corpusVersion !== "0.4a.3" ||
    source.tutor.provider !== "minimax" ||
    source.tutor.model !== "MiniMax-M2.7" ||
    source.tutor.promptVersion !== "0.2" ||
    historicalJudge.provider !== "deepseek" ||
    historicalJudge.model !== "deepseek-v4-pro" ||
    historicalJudge.promptId !== "tutor-eval-pedagogy-judge-system" ||
    historicalJudge.promptVersion !== "0.3" ||
    historicalJudge.observedPositiveCount !== cases.length ||
    validationJudge.provider !== "deepseek" ||
    validationJudge.model !== "deepseek-v4-pro" ||
    validationJudge.promptId !== "tutor-eval-pedagogy-judge-system" ||
    validationJudge.promptVersion !== "0.4" ||
    validationJudge.reasoningEffort !== "high" ||
    validationJudge.maxOutputTokens !== 8192 ||
    validationJudge.timeoutMs !== 180000 ||
    validationJudge.maxAttempts !== 1 ||
    !hasOnlyKeys(scope, ["type", "fullCorpusCaseCount", "selectedCaseCount", "judgeNegativeCasesHumanAudited"]) ||
    scope.type !== JUDGE_V04_LEAKAGE_VALIDATION_SCOPE ||
    scope.fullCorpusCaseCount !== 48 ||
    scope.selectedCaseCount !== cases.length ||
    scope.judgeNegativeCasesHumanAudited !== false ||
    !hasOnlyKeys(summary, [
      "humanConfirmedPositiveCount",
      "historicalFalsePositiveCount",
      "v04ConfirmedPositiveRetainedCount",
      "v04FalsePositiveCorrectedCount",
      "agreementCount",
      "disagreementCount",
      "observedAgreement",
    ]) ||
    summary.humanConfirmedPositiveCount !== humanConfirmedPositiveCount ||
    summary.historicalFalsePositiveCount !== historicalFalsePositiveCount ||
    summary.v04ConfirmedPositiveRetainedCount !== v04ConfirmedPositiveRetainedCount ||
    summary.v04FalsePositiveCorrectedCount !== v04FalsePositiveCorrectedCount ||
    summary.agreementCount !== agreementCount ||
    summary.disagreementCount !== disagreementCount ||
    !isRate(summary.observedAgreement) ||
    summary.observedAgreement !== agreementCount / cases.length ||
    humanConfirmedPositiveCount !== 9 ||
    historicalFalsePositiveCount !== 3 ||
    v04ConfirmedPositiveRetainedCount !== 9 ||
    v04FalsePositiveCorrectedCount !== 3 ||
    agreementCount !== 12 ||
    disagreementCount !== 0 ||
    !JUDGE_V04_LEAKAGE_VALIDATION_LIMITATIONS.every((limitation) =>
      limitations.includes(limitation),
    ) ||
    new Set(limitations).size !== limitations.length
  ) {
    return invalid();
  }

  return {
    schemaVersion: JUDGE_V04_LEAKAGE_VALIDATION_SCHEMA_VERSION,
    validationId: JUDGE_V04_LEAKAGE_VALIDATION_ID,
    evidenceStatus: JUDGE_V04_LEAKAGE_VALIDATION_EVIDENCE_STATUS,
    status: "preliminary",
    calibrationStatus: "uncalibrated",
    source,
    historicalJudge,
    validationJudge,
    scope: {
      type: JUDGE_V04_LEAKAGE_VALIDATION_SCOPE,
      fullCorpusCaseCount: 48,
      selectedCaseCount: 12,
      judgeNegativeCasesHumanAudited: false,
    },
    summary: {
      humanConfirmedPositiveCount,
      historicalFalsePositiveCount,
      v04ConfirmedPositiveRetainedCount,
      v04FalsePositiveCorrectedCount,
      agreementCount,
      disagreementCount,
      observedAgreement: summary.observedAgreement,
    },
    cases,
    executionNotes,
    limitations: [...limitations],
  };
}

export async function loadJudgeV04LeakageValidationArtifact(
  path: string,
): Promise<JudgeV04LeakageValidationArtifact> {
  try {
    return parseJudgeV04LeakageValidationArtifact(JSON.parse(await readFile(path, "utf8")) as unknown);
  } catch (error) {
    if (error instanceof JudgeV04LeakageValidationError) {
      throw error;
    }
    throw new JudgeV04LeakageValidationError();
  }
}
