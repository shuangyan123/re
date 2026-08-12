import { BenchmarkConfigurationError } from "./errors.js";
import {
  type AiTutorJudgeCaseRubric,
  type AiTutorJudgeCriticalFailure,
  type AiTutorJudgeInput,
  type AiTutorJudgeResult,
  type AiTutorJudgeRubricResult,
  type AiTutorJudgeScores,
  type CriticalFailureCode,
  type JudgeScore,
} from "./judge.js";
import { calculatePedagogyScore100, determineQualityGate } from "../judge/metrics.js";

type UnknownRecord = Record<string, unknown>;

const criticalFailureCodes = new Set<CriticalFailureCode>([
  "CF-01",
  "CF-02",
  "CF-03",
  "CF-04",
  "CF-05",
  "CF-06",
  "CF-07",
]);

const scoreKeys = [
  "correctness",
  "diagnosis",
  "scaffolding",
  "student_agency",
  "adaptivity",
  "hint_calibration",
  "communication",
] as const;

function asRecord(value: unknown): UnknownRecord | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  return value as UnknownRecord;
}

function readString(record: UnknownRecord, key: string): string | null {
  const value = record[key];
  return typeof value === "string" ? value : null;
}

function readRequiredString(record: UnknownRecord, key: string): string | null {
  const value = readString(record, key);
  return value !== null && value.trim().length > 0 ? value : null;
}

function readStringArray(record: UnknownRecord, key: string): readonly string[] | null {
  const value = record[key];
  return Array.isArray(value) && value.every((item) => typeof item === "string")
    ? value
    : null;
}

function parseCaseRubric(value: unknown): AiTutorJudgeCaseRubric | null {
  if (value === null || value === "") {
    return null;
  }
  const record = asRecord(value);
  if (record === null) {
    return null;
  }
  const must = readStringArray(record, "must");
  const should = readStringArray(record, "should");
  const mustNot = readStringArray(record, "must_not");
  if (must === null || should === null || mustNot === null) {
    return null;
  }
  return { must, should, must_not: mustNot };
}

export function parseAiTutorJudgeInput(value: unknown): AiTutorJudgeInput {
  const record = asRecord(value);
  if (record === null) {
    throw new BenchmarkConfigurationError("judge_input_invalid");
  }

  const input: AiTutorJudgeInput = {
    learning_objective: readString(record, "learning_objective") ?? "",
    student_profile: readString(record, "student_profile") ?? "",
    conversation_history: readString(record, "conversation_history") ?? "",
    student_message: readString(record, "student_message") ?? "",
    ground_truth: readString(record, "ground_truth") ?? "",
    known_misconception: readString(record, "known_misconception") ?? "",
    pedagogical_objective: readString(record, "pedagogical_objective") ?? "",
    case_rubric: parseCaseRubric(record.case_rubric),
    tutor_response: readString(record, "tutor_response") ?? "",
  };

  const requiredKeys = [
    "learning_objective",
    "student_profile",
    "conversation_history",
    "student_message",
    "ground_truth",
    "known_misconception",
    "pedagogical_objective",
    "case_rubric",
    "tutor_response",
  ];
  if (
    requiredKeys.some((key) => !(key in record)) ||
    requiredKeys
      .filter((key) => key !== "case_rubric")
      .some((key) => typeof record[key] !== "string") ||
    (record.case_rubric !== null &&
      record.case_rubric !== "" &&
      input.case_rubric === null)
  ) {
    throw new BenchmarkConfigurationError("judge_input_invalid");
  }
  return input;
}

function parseScore(value: unknown): JudgeScore | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 5
    ? (value as JudgeScore)
    : null;
}

function parseScores(value: unknown): AiTutorJudgeScores | null {
  const record = asRecord(value);
  if (record === null) {
    return null;
  }
  const scores = Object.fromEntries(
    scoreKeys.map((key) => [key, parseScore(record[key])]),
  ) as Record<(typeof scoreKeys)[number], JudgeScore | null>;
  if (scoreKeys.some((key) => scores[key] === null)) {
    return null;
  }
  return scores as AiTutorJudgeScores;
}

function parseCriticalFailure(value: unknown): AiTutorJudgeCriticalFailure | null {
  const record = asRecord(value);
  if (record === null) {
    return null;
  }
  const code = record.code;
  const evidence = readRequiredString(record, "evidence");
  if (!criticalFailureCodes.has(code as CriticalFailureCode) || evidence === null) {
    return null;
  }
  return { code: code as CriticalFailureCode, evidence };
}

function parseRubricResult(value: unknown): AiTutorJudgeRubricResult | null {
  const record = asRecord(value);
  if (record === null) {
    return null;
  }
  const criterion = readRequiredString(record, "criterion");
  const evidence = readRequiredString(record, "evidence");
  const result = record.result;
  if (
    criterion === null ||
    evidence === null ||
    (result !== "PASS" && result !== "PARTIAL" && result !== "FAIL")
  ) {
    return null;
  }
  return { criterion, result, evidence };
}

export function isAiTutorJudgeResult(value: unknown): value is AiTutorJudgeResult {
  try {
    parseAiTutorJudgeResult(value);
    return true;
  } catch {
    return false;
  }
}

export function parseAiTutorJudgeResult(value: unknown): AiTutorJudgeResult {
  const record = asRecord(value);
  const scores = record === null ? null : parseScores(record.scores);
  const failuresValue = record?.critical_failures;
  const rubricResultsValue = record?.rubric_results;
  const criticalFailures = Array.isArray(failuresValue)
    ? failuresValue.map(parseCriticalFailure)
    : null;
  const rubricResults = Array.isArray(rubricResultsValue)
    ? rubricResultsValue.map(parseRubricResult)
    : null;
  const pedagogyScore = record?.pedagogy_score_100;
  const confidence = record?.confidence;
  const qualityGate = record?.quality_gate;

  if (
    record === null ||
    scores === null ||
    criticalFailures === null ||
    criticalFailures.some((failure): failure is null => failure === null) ||
    rubricResults === null ||
    rubricResults.some((result): result is null => result === null) ||
    (qualityGate !== "PASS" && qualityGate !== "FAIL") ||
    typeof record.answer_leakage !== "boolean" ||
    (record.overhelping !== "none" &&
      record.overhelping !== "mild" &&
      record.overhelping !== "moderate" &&
      record.overhelping !== "severe") ||
    typeof pedagogyScore !== "number" ||
    !Number.isFinite(pedagogyScore) ||
    pedagogyScore < 0 ||
    pedagogyScore > 100 ||
    typeof confidence !== "number" ||
    !Number.isFinite(confidence) ||
    confidence < 0 ||
    confidence > 1 ||
    readRequiredString(record, "primary_strength") === null ||
    readRequiredString(record, "primary_weakness") === null ||
    readRequiredString(record, "recommended_improvement") === null
  ) {
    throw new BenchmarkConfigurationError("judge_result_invalid");
  }

  const typedFailures = criticalFailures as AiTutorJudgeCriticalFailure[];
  const expectedScore = calculatePedagogyScore100(scores);
  const expectedGate = determineQualityGate(scores, typedFailures);
  if (
    Math.abs(pedagogyScore - expectedScore) > 0.01 ||
    qualityGate !== expectedGate
  ) {
    throw new BenchmarkConfigurationError("judge_result_invalid");
  }

  return {
    quality_gate: qualityGate,
    critical_failures: typedFailures,
    scores,
    pedagogy_score_100: pedagogyScore,
    answer_leakage: record.answer_leakage,
    overhelping: record.overhelping,
    rubric_results: rubricResults as AiTutorJudgeRubricResult[],
    primary_strength: record.primary_strength as string,
    primary_weakness: record.primary_weakness as string,
    recommended_improvement: record.recommended_improvement as string,
    confidence,
  };
}

export function assertValidAiTutorJudgeResult(
  value: unknown,
): asserts value is AiTutorJudgeResult {
  parseAiTutorJudgeResult(value);
}
