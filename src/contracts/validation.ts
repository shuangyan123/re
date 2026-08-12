import { BenchmarkConfigurationError } from "./errors.js";
import {
  RESULT_SCHEMA_VERSION,
  type BenchmarkRunResult,
  type CriterionResult,
  type ScenarioResult,
} from "./result.js";
import {
  RUBRIC_SCHEMA_VERSION,
  type DeterministicEvaluatorConfig,
  type DeterministicEvaluatorId,
  type TutorRubric,
  type TutorRubricCriterion,
} from "./rubric.js";
import {
  SCENARIO_SCHEMA_VERSION,
  type TutorScenario,
  type TutorScenarioTurn,
} from "./scenario.js";
import type { StudentState, TutorTurnMetrics, TutorTurnOutput } from "./tutor.js";

type UnknownRecord = Record<string, unknown>;

const evaluatorIds = new Set<DeterministicEvaluatorId>([
  "contains_forbidden_phrase",
  "contains_required_concept",
  "response_length_range",
  "direct_answer_leak",
  "matches_ground_truth",
  "empty_response",
  "structured_keyword_coverage",
]);

function asRecord(value: unknown): UnknownRecord | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  return value as UnknownRecord;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function readRequiredString(record: UnknownRecord, key: string): string | null {
  const value = record[key];
  return isNonEmptyString(value) ? value : null;
}

function readStringArray(
  record: UnknownRecord,
  key: string,
): readonly string[] | null {
  const value = record[key];
  if (!Array.isArray(value) || !value.every(isNonEmptyString)) {
    return null;
  }
  return value;
}

function readFiniteNumber(record: UnknownRecord, key: string): number | null {
  const value = record[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readOptionalStringArray(
  record: UnknownRecord,
  key: string,
): readonly string[] | null | undefined {
  if (!(key in record)) {
    return undefined;
  }
  return readStringArray(record, key);
}

function readOptionalString(
  record: UnknownRecord,
  key: string,
): string | null | undefined {
  if (!(key in record)) {
    return undefined;
  }
  const value = record[key];
  return isNonEmptyString(value) ? value : null;
}

function readOptionalNumber(
  record: UnknownRecord,
  key: string,
): number | null | undefined {
  if (!(key in record)) {
    return undefined;
  }
  return readFiniteNumber(record, key);
}

function parseStudentState(value: unknown): StudentState | null {
  const record = asRecord(value);
  if (record === null) {
    return null;
  }

  const knownConcepts = readStringArray(record, "knownConcepts");
  const misconceptions = readStringArray(record, "misconceptions");
  const level = readRequiredString(record, "level");
  const goal = readRequiredString(record, "goal");
  if (
    knownConcepts === null ||
    misconceptions === null ||
    level === null ||
    goal === null
  ) {
    return null;
  }

  return { knownConcepts, misconceptions, level, goal };
}

function parseScenarioTurn(value: unknown): TutorScenarioTurn | null {
  const record = asRecord(value);
  if (record === null) {
    return null;
  }
  const studentMessage = readRequiredString(record, "studentMessage");
  return studentMessage === null ? null : { studentMessage };
}

function parseTutorScenarioValue(value: unknown): TutorScenario | null {
  const record = asRecord(value);
  if (record === null || record.schemaVersion !== SCENARIO_SCHEMA_VERSION) {
    return null;
  }

  const id = readRequiredString(record, "id");
  const title = readRequiredString(record, "title");
  const description = readRequiredString(record, "description");
  const studentProfile = parseStudentState(record.studentProfile);
  const learningObjective = readRequiredString(record, "learningObjective");
  const initialContext = readRequiredString(record, "initialContext");
  const rubricId = readRequiredString(record, "rubricId");
  const tags = readStringArray(record, "tags");
  const turnsValue = record.turns;
  const turns = Array.isArray(turnsValue)
    ? turnsValue.map(parseScenarioTurn)
    : null;

  if (
    id === null ||
    title === null ||
    description === null ||
    studentProfile === null ||
    learningObjective === null ||
    initialContext === null ||
    rubricId === null ||
    tags === null ||
    turns === null ||
    turns.length === 0 ||
    turns.some((turn): turn is null => turn === null)
  ) {
    return null;
  }

  return {
    schemaVersion: SCENARIO_SCHEMA_VERSION,
    id,
    title,
    description,
    studentProfile,
    learningObjective,
    initialContext,
    turns: turns as TutorScenarioTurn[],
    tags,
    rubricId,
  };
}

function parseConfig(value: unknown): DeterministicEvaluatorConfig | null {
  const record = asRecord(value);
  if (record === null) {
    return null;
  }

  const forbiddenPhrases = readOptionalStringArray(record, "forbiddenPhrases");
  const forbiddenFinalAnswer = readOptionalString(
    record,
    "forbiddenFinalAnswer",
  );
  const requiredConcepts = readOptionalStringArray(record, "requiredConcepts");
  const minLength = readOptionalNumber(record, "minLength");
  const maxLength = readOptionalNumber(record, "maxLength");
  const minimumMatches = readOptionalNumber(record, "minimumMatches");

  if (
    forbiddenPhrases === null ||
    forbiddenFinalAnswer === null ||
    requiredConcepts === null ||
    minLength === null ||
    maxLength === null ||
    minimumMatches === null
  ) {
    return null;
  }
  if (
    minLength !== undefined &&
    (minLength < 0 || !Number.isInteger(minLength))
  ) {
    return null;
  }
  if (
    maxLength !== undefined &&
    (maxLength < 0 || !Number.isInteger(maxLength))
  ) {
    return null;
  }
  if (
    minLength !== undefined &&
    maxLength !== undefined &&
    minLength > maxLength
  ) {
    return null;
  }
  if (
    minimumMatches !== undefined &&
    (!Number.isInteger(minimumMatches) || minimumMatches < 1)
  ) {
    return null;
  }

  return {
    ...(forbiddenPhrases === undefined ? {} : { forbiddenPhrases }),
    ...(forbiddenFinalAnswer === undefined ? {} : { forbiddenFinalAnswer }),
    ...(requiredConcepts === undefined ? {} : { requiredConcepts }),
    ...(minLength === undefined ? {} : { minLength }),
    ...(maxLength === undefined ? {} : { maxLength }),
    ...(minimumMatches === undefined ? {} : { minimumMatches }),
  };
}

function isNonEmptyStringArray(value: readonly string[] | null): value is readonly string[] {
  return value !== null && value.length > 0;
}

function isCriterionConfigValid(
  evaluatorId: DeterministicEvaluatorId,
  config: DeterministicEvaluatorConfig | undefined,
): boolean {
  switch (evaluatorId) {
    case "contains_forbidden_phrase":
      return isNonEmptyStringArray(config?.forbiddenPhrases ?? null);
    case "contains_required_concept":
      return isNonEmptyStringArray(config?.requiredConcepts ?? null);
    case "response_length_range":
      return (
        config !== undefined &&
        (config.minLength !== undefined || config.maxLength !== undefined)
      );
    case "direct_answer_leak":
      return isNonEmptyString(config?.forbiddenFinalAnswer);
    case "matches_ground_truth":
      return config === undefined || Object.keys(config).length === 0;
    case "empty_response":
      return config === undefined || Object.keys(config).length === 0;
    case "structured_keyword_coverage": {
      const concepts = config?.requiredConcepts;
      const minimumMatches = config?.minimumMatches;
      if (concepts === undefined || !isNonEmptyStringArray(concepts)) {
        return false;
      }
      return minimumMatches === undefined || minimumMatches <= concepts.length;
    }
  }
}

function parseCriterion(value: unknown): TutorRubricCriterion | null {
  const record = asRecord(value);
  if (record === null || record.evaluationType !== "deterministic") {
    return null;
  }

  const id = readRequiredString(record, "id");
  const description = readRequiredString(record, "description");
  const weight = readFiniteNumber(record, "weight");
  const evaluatorIdValue = record.evaluatorId;
  const evaluatorId = evaluatorIds.has(evaluatorIdValue as DeterministicEvaluatorId)
    ? (evaluatorIdValue as DeterministicEvaluatorId)
    : null;
  const config = "config" in record ? parseConfig(record.config) : undefined;

  if (
    id === null ||
    description === null ||
    weight === null ||
    weight <= 0 ||
    evaluatorId === null ||
    config === null ||
    !isCriterionConfigValid(evaluatorId, config)
  ) {
    return null;
  }

  return {
    id,
    description,
    weight,
    evaluationType: "deterministic",
    evaluatorId,
    ...(config === undefined ? {} : { config }),
  };
}

function parseTutorRubricValue(value: unknown): TutorRubric | null {
  const record = asRecord(value);
  if (record === null || record.schemaVersion !== RUBRIC_SCHEMA_VERSION) {
    return null;
  }

  const id = readRequiredString(record, "id");
  const title = readRequiredString(record, "title");
  const passThreshold = readFiniteNumber(record, "passThreshold");
  const criteriaValue = record.criteria;
  const criteria = Array.isArray(criteriaValue)
    ? criteriaValue.map(parseCriterion)
    : null;

  if (
    id === null ||
    title === null ||
    passThreshold === null ||
    passThreshold < 0 ||
    passThreshold > 1 ||
    criteria === null ||
    criteria.length === 0 ||
    criteria.some((criterion): criterion is null => criterion === null)
  ) {
    return null;
  }

  const typedCriteria = criteria as TutorRubricCriterion[];
  const ids = new Set(typedCriteria.map((criterion) => criterion.id));
  if (ids.size !== typedCriteria.length) {
    return null;
  }

  return {
    schemaVersion: RUBRIC_SCHEMA_VERSION,
    id,
    title,
    passThreshold,
    criteria: typedCriteria,
  };
}

function assertUniqueIds<T extends { readonly id: string }>(items: readonly T[], code: "scenario_invalid" | "rubric_invalid"): void {
  const ids = new Set(items.map((item) => item.id));
  if (ids.size !== items.length) {
    throw new BenchmarkConfigurationError(code);
  }
}

export function parseTutorScenario(value: unknown): TutorScenario {
  const scenario = parseTutorScenarioValue(value);
  if (scenario === null) {
    throw new BenchmarkConfigurationError("scenario_invalid");
  }
  return scenario;
}

export function parseTutorScenarios(value: unknown): TutorScenario[] {
  if (!Array.isArray(value)) {
    throw new BenchmarkConfigurationError("scenario_invalid");
  }
  const scenarios = value.map(parseTutorScenario);
  assertUniqueIds(scenarios, "scenario_invalid");
  return scenarios;
}

export function parseTutorRubric(value: unknown): TutorRubric {
  const rubric = parseTutorRubricValue(value);
  if (rubric === null) {
    throw new BenchmarkConfigurationError("rubric_invalid");
  }
  return rubric;
}

export function parseTutorRubrics(value: unknown): TutorRubric[] {
  if (!Array.isArray(value)) {
    throw new BenchmarkConfigurationError("rubric_invalid");
  }
  const rubrics = value.map(parseTutorRubric);
  assertUniqueIds(rubrics, "rubric_invalid");
  return rubrics;
}

export function assertValidTutorScenario(value: unknown): asserts value is TutorScenario {
  parseTutorScenario(value);
}

export function assertValidTutorRubric(value: unknown): asserts value is TutorRubric {
  parseTutorRubric(value);
}

function isTutorTurnMetrics(value: unknown): value is TutorTurnMetrics {
  const record = asRecord(value);
  if (record === null) {
    return false;
  }
  const tokenUsage = record.tokenUsage;
  if (tokenUsage !== undefined) {
    const tokenRecord = asRecord(tokenUsage);
    if (
      tokenRecord === null ||
      Object.values(tokenRecord).some(
        (item) =>
          typeof item !== "number" ||
          !Number.isFinite(item) ||
          item < 0,
      )
    ) {
      return false;
    }
  }
  return ["latencyMs", "cost"].every((key) => {
    const item = record[key];
    return (
      item === undefined ||
      (typeof item === "number" && Number.isFinite(item) && item >= 0)
    );
  });
}

export function isTutorTurnOutput(value: unknown): value is TutorTurnOutput {
  const record = asRecord(value);
  return (
    record !== null &&
    typeof record.text === "string" &&
    (record.metrics === undefined || isTutorTurnMetrics(record.metrics))
  );
}

function isDiagnostic(value: unknown): value is { readonly code: string; readonly message: string } {
  const record = asRecord(value);
  return (
    record !== null &&
    typeof record.code === "string" &&
    typeof record.message === "string"
  );
}

function isCriterionResult(value: unknown): value is CriterionResult {
  const record = asRecord(value);
  return (
    record !== null &&
    typeof record.criterionId === "string" &&
    typeof record.evaluatorId === "string" &&
    (record.status === "passed" ||
      record.status === "failed" ||
      record.status === "error") &&
    (record.score === null ||
      (typeof record.score === "number" && Number.isFinite(record.score))) &&
    typeof record.passed === "boolean" &&
    Array.isArray(record.diagnostics) &&
    record.diagnostics.every(isDiagnostic)
  );
}

function isScenarioResult(value: unknown): value is ScenarioResult {
  const record = asRecord(value);
  return (
    record !== null &&
    typeof record.scenarioId === "string" &&
    typeof record.rubricId === "string" &&
    (record.status === "passed" ||
      record.status === "failed" ||
      record.status === "error") &&
    (record.score === null ||
      (typeof record.score === "number" && Number.isFinite(record.score))) &&
    typeof record.passed === "boolean" &&
    typeof record.turnCount === "number" &&
    Number.isInteger(record.turnCount) &&
    record.turnCount >= 0 &&
    Array.isArray(record.criterionResults) &&
    record.criterionResults.every(isCriterionResult) &&
    Array.isArray(record.diagnostics) &&
    record.diagnostics.every(isDiagnostic)
  );
}

export function isBenchmarkRunResult(value: unknown): value is BenchmarkRunResult {
  const record = asRecord(value);
  return (
    record !== null &&
    record.schemaVersion === RESULT_SCHEMA_VERSION &&
    typeof record.runId === "string" &&
    typeof record.timestamp === "string" &&
    typeof record.startedAt === "string" &&
    typeof record.finishedAt === "string" &&
    typeof record.durationMs === "number" &&
    Number.isFinite(record.durationMs) &&
    record.durationMs >= 0 &&
    typeof record.tutorId === "string" &&
    typeof record.scenarioCount === "number" &&
    Number.isInteger(record.scenarioCount) &&
    record.scenarioCount >= 0 &&
    typeof record.passedCount === "number" &&
    Number.isInteger(record.passedCount) &&
    typeof record.failedCount === "number" &&
    Number.isInteger(record.failedCount) &&
    typeof record.errorCount === "number" &&
    Number.isInteger(record.errorCount) &&
    typeof record.totalScore === "number" &&
    Number.isFinite(record.totalScore) &&
    Array.isArray(record.scenarioResults) &&
    record.scenarioResults.every(isScenarioResult)
  );
}

export function assertValidBenchmarkRunResult(
  value: unknown,
): asserts value is BenchmarkRunResult {
  if (!isBenchmarkRunResult(value)) {
    throw new Error("Benchmark result schema is invalid.");
  }
}
