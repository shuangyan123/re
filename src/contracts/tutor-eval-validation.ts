import { BenchmarkConfigurationError } from "./errors.js";
import {
  TUTOR_EVAL_CASE_SCHEMA_VERSION,
  TUTOR_EVAL_CRITICAL_FAILURE_SEVERITIES,
  TUTOR_EVAL_CRITICAL_FAILURE_TYPES,
  partitionTutorEvalRubrics,
  type DisclosurePolicy,
  type TutorCriticalFailure,
  type TutorCriticalFailureSeverity,
  type TutorEvalCase,
  type TutorEvalDataset,
  type TutorEvalGroundTruth,
  type TutorEvalStudentProfile,
} from "./tutor-eval.js";
import {
  TUTOR_EVAL_JUDGE_SCHEMA_VERSION,
  type TutorEvalJudgeCriticalFailure,
  type TutorEvalJudgeFactualError,
  type TutorEvalJudgeInput,
  type TutorEvalJudgeResult,
  type TutorEvalJudgeRubricResult,
} from "./tutor-eval-judge.js";
import {
  type DeterministicEvaluatorConfig,
  type DeterministicEvaluatorId,
  type TutorEvalRubric,
  type TutorEvalRubricFailure,
} from "./rubric.js";
import {
  TUTOR_EVAL_CAPABILITY_TAGS,
  TUTOR_EVAL_LEARNER_LEVELS,
  TUTOR_EVAL_LEARNING_TASKS,
  TUTOR_EVAL_STUDENT_STATES,
  isTutorEvalDifficultyLevel,
  type TutorEvalDifficulty,
} from "./tutor-eval-taxonomy.js";
import type { TutorConversationMessage } from "./tutor.js";
import { readTutorCaseLocale } from "./locale.js";
import { TUTOR_EVAL_DISCLOSURE_POLICIES } from "./tutor-eval-disclosure.js";

type UnknownRecord = Record<string, unknown>;

const categories = new Set<TutorEvalCase["evaluatorOnly"]["rubrics"][number]["category"]>([
  "correctness",
  "diagnosis",
  "guidance",
  "adaptation",
  "actionability",
]);

const disclosurePolicies = new Set<DisclosurePolicy>([
  ...TUTOR_EVAL_DISCLOSURE_POLICIES,
]);

const evaluatorIds = new Set<DeterministicEvaluatorId>([
  "contains_forbidden_phrase",
  "contains_required_concept",
  "contains_normalized_expression",
  "response_length_range",
  "direct_answer_leak",
  "matches_ground_truth",
  "empty_response",
  "structured_keyword_coverage",
]);

const criticalFailureTypes = new Set<TutorCriticalFailure>(
  TUTOR_EVAL_CRITICAL_FAILURE_TYPES,
);

const criticalFailureSeverities = new Set<TutorCriticalFailureSeverity>(
  TUTOR_EVAL_CRITICAL_FAILURE_SEVERITIES,
);

const rubricBehaviors = new Set<NonNullable<TutorEvalRubric["behavior"]>>([
  "required",
  "desirable",
  "prohibited",
]);

const reservedVisibleAnnotationKeys = new Set([
  "evaluatorOnly",
  "groundTruth",
  "knownMisconception",
  "disclosurePolicy",
  "rubrics",
  "expectedTeachingStrategy",
  "referenceAnswer",
]);

function asRecord(value: unknown): UnknownRecord | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  return value as UnknownRecord;
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function readRequiredString(record: UnknownRecord, key: string): string | null {
  return nonEmptyString(record[key]) ? (record[key] as string) : null;
}

function readOptionalString(
  record: UnknownRecord,
  key: string,
): string | null | undefined {
  if (!(key in record)) {
    return undefined;
  }
  return nonEmptyString(record[key]) ? (record[key] as string) : null;
}

function readOptionalEnum<T extends string>(
  record: UnknownRecord,
  key: string,
  values: readonly T[],
): T | null | undefined {
  if (!(key in record)) {
    return undefined;
  }
  return values.includes(record[key] as T) ? (record[key] as T) : null;
}

function readStringArray(
  record: UnknownRecord,
  key: string,
  requireItems = false,
): readonly string[] | null | undefined {
  if (!(key in record)) {
    return undefined;
  }
  const value = record[key];
  if (
    !Array.isArray(value) ||
    (requireItems && value.length === 0) ||
    !value.every(nonEmptyString)
  ) {
    return null;
  }
  return value as string[];
}

function readOptionalDifficulty(
  record: UnknownRecord,
): TutorEvalDifficulty | string | number | undefined | null {
  if (!("difficulty" in record)) {
    return undefined;
  }
  const value = record.difficulty;
  if (nonEmptyString(value)) {
    return value;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  const structured = asRecord(value);
  if (structured === null) {
    return null;
  }
  const learnerLevel = readOptionalEnum(
    structured,
    "learnerLevel",
    TUTOR_EVAL_LEARNER_LEVELS,
  );
  const taskDifficulty = structured.taskDifficulty;
  const pedagogicalDifficulty = structured.pedagogicalDifficulty;
  if (
    learnerLevel === undefined ||
    learnerLevel === null ||
    !isTutorEvalDifficultyLevel(taskDifficulty) ||
    !isTutorEvalDifficultyLevel(pedagogicalDifficulty)
  ) {
    return null;
  }
  return {
    learnerLevel,
    taskDifficulty,
    pedagogicalDifficulty,
  };
}

function hasReservedVisibleAnnotation(value: unknown): boolean {
  if (Array.isArray(value)) {
    return value.some(hasReservedVisibleAnnotation);
  }
  const record = asRecord(value);
  if (record === null) {
    return false;
  }
  return (
    Object.keys(record).some((key) => reservedVisibleAnnotationKeys.has(key)) ||
    Object.values(record).some(hasReservedVisibleAnnotation)
  );
}

function parseStudentProfile(value: unknown): TutorEvalStudentProfile | null {
  const record = asRecord(value);
  if (record === null) {
    return null;
  }
  const knownConcepts = readStringArray(record, "knownConcepts");
  const misconceptions = readStringArray(record, "misconceptions");
  const level = readOptionalString(record, "level");
  const goal = readOptionalString(record, "goal");
  if (
    knownConcepts === null ||
    misconceptions === null ||
    level === null ||
    goal === null
  ) {
    return null;
  }
  return {
    ...(knownConcepts === undefined ? {} : { knownConcepts }),
    ...(misconceptions === undefined ? {} : { misconceptions }),
    ...(level === undefined ? {} : { level }),
    ...(goal === undefined ? {} : { goal }),
  };
}

function parseConversationHistory(
  value: unknown,
): TutorEvalCase["tutorInput"]["conversationHistory"] | null {
  if (value === undefined) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    return null;
  }
  const messages: (TutorConversationMessage | null)[] = value.map((item) => {
    const record = asRecord(item);
    if (
      record === null ||
      (record.role !== "student" && record.role !== "tutor") ||
      !nonEmptyString(record.text)
    ) {
      return null;
    }
    return { role: record.role, text: record.text } as const;
  });
  return messages.some((message): message is null => message === null)
    ? null
    : messages as TutorConversationMessage[];
}

function parseGroundTruth(value: unknown): TutorEvalGroundTruth | null {
  const record = asRecord(value);
  if (record === null) {
    return null;
  }
  const finalAnswer = readOptionalString(record, "finalAnswer");
  const explanation = readOptionalString(record, "explanation");
  const acceptedAnswers = readStringArray(record, "acceptedAnswers", true);
  const requiredConcepts = readStringArray(record, "requiredConcepts", true);
  if (
    finalAnswer === null ||
    explanation === null ||
    acceptedAnswers === null ||
    requiredConcepts === null
  ) {
    return null;
  }
  return {
    ...(finalAnswer === undefined ? {} : { finalAnswer }),
    ...(explanation === undefined ? {} : { explanation }),
    ...(acceptedAnswers === undefined ? {} : { acceptedAnswers }),
    ...(requiredConcepts === undefined ? {} : { requiredConcepts }),
  };
}

function parseEvaluatorConfig(value: unknown): DeterministicEvaluatorConfig | null {
  const record = asRecord(value);
  if (record === null) {
    return null;
  }
  const forbiddenPhrases = readStringArray(record, "forbiddenPhrases", true);
  const forbiddenFinalAnswer = readOptionalString(record, "forbiddenFinalAnswer");
  const requiredConcepts = readStringArray(record, "requiredConcepts", true);
  const requiredExpression = readOptionalString(record, "requiredExpression");
  const minLength = readOptionalNumber(record, "minLength");
  const maxLength = readOptionalNumber(record, "maxLength");
  const minimumMatches = readOptionalNumber(record, "minimumMatches");
  if (
    forbiddenPhrases === null ||
    forbiddenFinalAnswer === null ||
    requiredConcepts === null ||
    requiredExpression === null ||
    minLength === null ||
    maxLength === null ||
    minimumMatches === null ||
    (minLength !== undefined && (!Number.isInteger(minLength) || minLength < 0)) ||
    (maxLength !== undefined && (!Number.isInteger(maxLength) || maxLength < 0)) ||
    (minLength !== undefined &&
      maxLength !== undefined &&
      minLength > maxLength) ||
    (minimumMatches !== undefined &&
      (!Number.isInteger(minimumMatches) || minimumMatches < 1))
  ) {
    return null;
  }
  return {
    ...(forbiddenPhrases === undefined ? {} : { forbiddenPhrases }),
    ...(forbiddenFinalAnswer === undefined ? {} : { forbiddenFinalAnswer }),
    ...(requiredConcepts === undefined ? {} : { requiredConcepts }),
    ...(requiredExpression === undefined ? {} : { requiredExpression }),
    ...(minLength === undefined ? {} : { minLength }),
    ...(maxLength === undefined ? {} : { maxLength }),
    ...(minimumMatches === undefined ? {} : { minimumMatches }),
  };
}

function readOptionalNumber(record: UnknownRecord, key: string): number | null | undefined {
  if (!(key in record)) {
    return undefined;
  }
  const value = record[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function parseCriticalFailure(value: unknown): TutorEvalRubricFailure | null {
  const record = asRecord(value);
  if (
    record === null ||
    !criticalFailureTypes.has(record.type as TutorCriticalFailure) ||
    !criticalFailureSeverities.has(record.severity as TutorCriticalFailureSeverity)
  ) {
    return null;
  }
  return {
    type: record.type as TutorCriticalFailure,
    severity: record.severity as TutorCriticalFailureSeverity,
  };
}

function isValidEvaluatorConfig(
  evaluatorId: DeterministicEvaluatorId,
  config: DeterministicEvaluatorConfig | undefined,
): boolean {
  switch (evaluatorId) {
    case "contains_forbidden_phrase":
      return (config?.forbiddenPhrases?.length ?? 0) > 0;
    case "contains_required_concept":
      return (config?.requiredConcepts?.length ?? 0) > 0;
    case "contains_normalized_expression":
      return nonEmptyString(config?.requiredExpression);
    case "response_length_range":
      return config?.minLength !== undefined || config?.maxLength !== undefined;
    case "direct_answer_leak":
      return nonEmptyString(config?.forbiddenFinalAnswer);
    case "matches_ground_truth":
      return config === undefined || Object.keys(config).length === 0;
    case "empty_response":
      return config === undefined || Object.keys(config).length === 0;
    case "structured_keyword_coverage":
      {
        const concepts = config?.requiredConcepts;
        const minimumMatches = config?.minimumMatches;
        return (
          (concepts?.length ?? 0) > 0 &&
          (minimumMatches === undefined || minimumMatches <= (concepts?.length ?? 0))
        );
      }
  }
}

function parseTutorEvalRubricValue(value: unknown): TutorEvalRubric | null {
  const record = asRecord(value);
  if (record === null) {
    return null;
  }
  const id = readRequiredString(record, "id");
  const category = categories.has(record.category as TutorEvalRubric["category"])
    ? (record.category as TutorEvalRubric["category"])
    : null;
  const criterion = readRequiredString(record, "criterion");
  const weight = record.weight;
  const applicability = record.applicability;
  const behaviorValue = record.behavior;
  const behavior =
    behaviorValue === undefined
      ? "required"
      : rubricBehaviors.has(behaviorValue as NonNullable<TutorEvalRubric["behavior"]>)
        ? (behaviorValue as NonNullable<TutorEvalRubric["behavior"]>)
        : null;
  const capabilityTag = readOptionalEnum(
    record,
    "capabilityTag",
    TUTOR_EVAL_CAPABILITY_TAGS,
  );
  const critical = record.critical;
  const evaluationTypeValue = record.evaluationType;
  const evaluatorIdValue = record.evaluatorId;
  const evaluatorId =
    evaluatorIdValue === undefined
      ? undefined
      : evaluatorIds.has(evaluatorIdValue as DeterministicEvaluatorId)
        ? (evaluatorIdValue as DeterministicEvaluatorId)
        : null;
  const evaluationType =
    evaluationTypeValue === undefined
      ? evaluatorId === undefined
        ? "judge"
        : "deterministic"
      : evaluationTypeValue === "deterministic" || evaluationTypeValue === "judge"
        ? evaluationTypeValue
        : null;
  const config =
    "config" in record ? parseEvaluatorConfig(record.config) : undefined;
  const criticalFailure =
    "criticalFailure" in record ? parseCriticalFailure(record.criticalFailure) : undefined;

  if (
    id === null ||
    category === null ||
    criterion === null ||
    typeof weight !== "number" ||
    !Number.isFinite(weight) ||
    weight <= 0 ||
    (applicability !== undefined &&
      applicability !== "required" &&
      applicability !== "optional") ||
    behavior === null ||
    capabilityTag === null ||
    (critical !== undefined && typeof critical !== "boolean") ||
    evaluatorId === null ||
    evaluationType === null ||
    config === null ||
    (evaluationType === "deterministic" &&
      (evaluatorId === undefined || !isValidEvaluatorConfig(evaluatorId, config))) ||
    (evaluationType === "judge" && evaluatorId !== undefined) ||
    ("criticalFailure" in record && criticalFailure === null)
  ) {
    return null;
  }
  if (criticalFailure === null) {
    return null;
  }

  return {
    id,
    category,
    criterion,
    weight,
    ...(applicability === undefined ? {} : { applicability }),
    behavior,
    ...(capabilityTag === undefined ? {} : { capabilityTag }),
    ...(critical === undefined ? {} : { critical }),
    ...(evaluationType === undefined ? {} : { evaluationType }),
    ...(evaluatorId === undefined ? {} : { evaluatorId }),
    ...(config === undefined ? {} : { config }),
    ...(criticalFailure === undefined ? {} : { criticalFailure }),
  };
}

export function parseTutorEvalRubric(value: unknown): TutorEvalRubric {
  const rubric = parseTutorEvalRubricValue(value);
  if (rubric === null) {
    throw new BenchmarkConfigurationError("tutor_eval_rubric_invalid");
  }
  return rubric;
}

function assertUniqueIds(items: readonly { readonly id: string }[], code: "tutor_eval_case_invalid" | "tutor_eval_rubric_invalid"): void {
  if (new Set(items.map((item) => item.id)).size !== items.length) {
    throw new BenchmarkConfigurationError(code);
  }
}

export function parseTutorEvalRubrics(value: unknown): TutorEvalRubric[] {
  if (!Array.isArray(value)) {
    throw new BenchmarkConfigurationError("tutor_eval_rubric_invalid");
  }
  const rubrics = value.map(parseTutorEvalRubric);
  assertUniqueIds(rubrics, "tutor_eval_rubric_invalid");
  return rubrics;
}

function parseTutorEvalCaseValue(value: unknown): TutorEvalCase | null {
  const record = asRecord(value);
  if (record === null || record.schemaVersion !== TUTOR_EVAL_CASE_SCHEMA_VERSION) {
    return null;
  }
  const id = readRequiredString(record, "id");
  const version = readRequiredString(record, "version");
  const locale = readTutorCaseLocale(record.locale);
  const metadataRecord = asRecord(record.metadata);
  const tutorInputRecord = asRecord(record.tutorInput);
  const evaluatorOnlyRecord = asRecord(record.evaluatorOnly);
  if (metadataRecord === null || tutorInputRecord === null || evaluatorOnlyRecord === null) {
    return null;
  }

  const subject = readRequiredString(metadataRecord, "subject");
  const topic = readRequiredString(metadataRecord, "topic");
  const difficulty = readOptionalDifficulty(metadataRecord);
  const tags = readStringArray(metadataRecord, "tags", true);
  const taxonomyVersion = readOptionalString(metadataRecord, "taxonomyVersion");
  const learningTask = readOptionalEnum(
    metadataRecord,
    "learningTask",
    TUTOR_EVAL_LEARNING_TASKS,
  );
  const studentState = readOptionalEnum(
    metadataRecord,
    "studentState",
    TUTOR_EVAL_STUDENT_STATES,
  );
  const capabilityTagsValue = readStringArray(
    metadataRecord,
    "capabilityTags",
    true,
  );
  const capabilityTags =
    capabilityTagsValue === undefined
      ? undefined
      : capabilityTagsValue === null
        ? null
      : capabilityTagsValue.every((tag) =>
          TUTOR_EVAL_CAPABILITY_TAGS.includes(
            tag as (typeof TUTOR_EVAL_CAPABILITY_TAGS)[number],
          ),
        ) && new Set(capabilityTagsValue).size === capabilityTagsValue.length
        ? (capabilityTagsValue as (typeof TUTOR_EVAL_CAPABILITY_TAGS)[number][])
        : null;
  const learningObjective = readRequiredString(tutorInputRecord, "learningObjective");
  const studentMessage = readRequiredString(tutorInputRecord, "studentMessage");
  const profileValue = tutorInputRecord.studentProfile;
  const studentProfile =
    profileValue === undefined ? undefined : parseStudentProfile(profileValue);
  const conversationHistory = parseConversationHistory(
    tutorInputRecord.conversationHistory,
  );
  const problemContext = readOptionalString(tutorInputRecord, "problemContext");
  const disclosurePolicy = evaluatorOnlyRecord.disclosurePolicy;
  const knownMisconceptionValue = evaluatorOnlyRecord.knownMisconception;
  const invalidKnownMisconception =
    "knownMisconception" in evaluatorOnlyRecord &&
    knownMisconceptionValue !== null &&
    !nonEmptyString(knownMisconceptionValue);
  const knownMisconception =
    !("knownMisconception" in evaluatorOnlyRecord)
      ? undefined
      : knownMisconceptionValue === null
        ? null
        : (knownMisconceptionValue as string);
  const groundTruth =
    evaluatorOnlyRecord.groundTruth === undefined
      ? undefined
      : parseGroundTruth(evaluatorOnlyRecord.groundTruth);
  const rubrics =
    Array.isArray(evaluatorOnlyRecord.rubrics)
      ? evaluatorOnlyRecord.rubrics.map(parseTutorEvalRubricValue)
      : null;
  const adaptationPairId = readOptionalString(record, "adaptationPairId");
  const adaptationVariant = readOptionalString(record, "adaptationVariant");

  if (
    id === null ||
    version === null ||
    locale === null ||
    subject === null ||
    topic === null ||
    difficulty === null ||
    tags === null ||
    taxonomyVersion === null ||
    learningTask === null ||
    studentState === null ||
    capabilityTags === null ||
    learningObjective === null ||
    studentMessage === null ||
    studentProfile === null ||
    conversationHistory === null ||
    problemContext === null ||
    hasReservedVisibleAnnotation(tutorInputRecord) ||
    !disclosurePolicies.has(disclosurePolicy as DisclosurePolicy) ||
    invalidKnownMisconception ||
    groundTruth === null ||
    rubrics === null ||
    rubrics.length === 0 ||
    rubrics.some((rubric): rubric is null => rubric === null) ||
    adaptationPairId === null ||
    adaptationVariant === null
  ) {
    return null;
  }
  const typedRubrics = rubrics as TutorEvalRubric[];
  if (new Set(typedRubrics.map((rubric) => rubric.id)).size !== typedRubrics.length) {
    return null;
  }
  return {
    schemaVersion: TUTOR_EVAL_CASE_SCHEMA_VERSION,
    id,
    version,
    ...(locale === undefined ? {} : { locale }),
    metadata: {
      subject,
      topic,
      ...(difficulty === undefined ? {} : { difficulty }),
      ...(tags === undefined ? {} : { tags }),
      ...(taxonomyVersion === undefined ? {} : { taxonomyVersion }),
      ...(learningTask === undefined ? {} : { learningTask }),
      ...(studentState === undefined ? {} : { studentState }),
      ...(capabilityTags === undefined ? {} : { capabilityTags }),
    },
    tutorInput: {
      learningObjective,
      ...(studentProfile === undefined ? {} : { studentProfile }),
      ...(conversationHistory === undefined ? {} : { conversationHistory }),
      studentMessage,
      ...(problemContext === undefined ? {} : { problemContext }),
    },
    evaluatorOnly: {
      ...(groundTruth === undefined ? {} : { groundTruth }),
      ...(knownMisconception === undefined ? {} : { knownMisconception }),
      disclosurePolicy: disclosurePolicy as DisclosurePolicy,
      rubrics: typedRubrics,
    },
    ...(adaptationPairId === undefined ? {} : { adaptationPairId }),
    ...(adaptationVariant === undefined ? {} : { adaptationVariant }),
  };
}

export function parseTutorEvalCase(value: unknown): TutorEvalCase {
  const tutorEvalCase = parseTutorEvalCaseValue(value);
  if (tutorEvalCase === null) {
    throw new BenchmarkConfigurationError("tutor_eval_case_invalid");
  }
  return tutorEvalCase;
}

export function parseTutorEvalCases(value: unknown): TutorEvalCase[] {
  if (!Array.isArray(value)) {
    throw new BenchmarkConfigurationError("tutor_eval_case_invalid");
  }
  const cases = value.map(parseTutorEvalCase);
  assertUniqueIds(cases, "tutor_eval_case_invalid");
  return cases;
}

export function parseTutorEvalDataset(value: unknown): TutorEvalDataset {
  const record = asRecord(value);
  if (record === null) {
    throw new BenchmarkConfigurationError("tutor_eval_dataset_invalid");
  }
  const id = readRequiredString(record, "id");
  const version = readRequiredString(record, "version");
  if (id === null || version === null || !Array.isArray(record.cases)) {
    throw new BenchmarkConfigurationError("tutor_eval_dataset_invalid");
  }
  try {
    const cases = parseTutorEvalCases(record.cases);
    return { id, version, cases };
  } catch (error) {
    if (error instanceof BenchmarkConfigurationError) {
      throw new BenchmarkConfigurationError("tutor_eval_dataset_invalid");
    }
    throw error;
  }
}

function parseJudgeCriticalFailure(
  value: unknown,
): TutorEvalJudgeCriticalFailure | null {
  const record = asRecord(value);
  if (
    record === null ||
    !criticalFailureTypes.has(record.type as TutorCriticalFailure) ||
    !criticalFailureSeverities.has(record.severity as TutorCriticalFailureSeverity) ||
    !nonEmptyString(record.evidence)
  ) {
    return null;
  }
  return {
    type: record.type as TutorCriticalFailure,
    severity: record.severity as TutorCriticalFailureSeverity,
    evidence: record.evidence as string,
  };
}

function parseJudgeFactualError(value: unknown): TutorEvalJudgeFactualError | null {
  const record = asRecord(value);
  if (
    record === null ||
    !nonEmptyString(record.description) ||
    !criticalFailureSeverities.has(record.severity as TutorCriticalFailureSeverity)
  ) {
    return null;
  }
  return {
    description: record.description as string,
    severity: record.severity as TutorCriticalFailureSeverity,
  };
}

function parseJudgeRubricResult(value: unknown): TutorEvalJudgeRubricResult | null {
  const record = asRecord(value);
  if (
    record === null ||
    !nonEmptyString(record.rubricId) ||
    (record.result !== "PASS" &&
      record.result !== "PARTIAL" &&
      record.result !== "FAIL") ||
    (record.evidence !== undefined && !nonEmptyString(record.evidence))
  ) {
    return null;
  }
  return {
    rubricId: record.rubricId as string,
    result: record.result,
    ...(record.evidence === undefined ? {} : { evidence: record.evidence as string }),
  };
}

export function parseTutorEvalJudgeResult(value: unknown): TutorEvalJudgeResult {
  const record = asRecord(value);
  const rubricResultsValue = record?.rubricResults;
  const failuresValue = record?.criticalFailures;
  const factualErrorsValue = record?.factualErrors;
  const rubricResults = Array.isArray(rubricResultsValue)
    ? rubricResultsValue.map(parseJudgeRubricResult)
    : null;
  const criticalFailures = Array.isArray(failuresValue)
    ? failuresValue.map(parseJudgeCriticalFailure)
    : null;
  const factualErrors = Array.isArray(factualErrorsValue)
    ? factualErrorsValue.map(parseJudgeFactualError)
    : null;
  if (
    record === null ||
    record.schemaVersion !== TUTOR_EVAL_JUDGE_SCHEMA_VERSION ||
    !nonEmptyString(record.caseId) ||
    rubricResults === null ||
    rubricResults.some((result): result is null => result === null) ||
    criticalFailures === null ||
    criticalFailures.some((failure): failure is null => failure === null) ||
    factualErrors === null ||
    factualErrors.some((error): error is null => error === null) ||
    typeof record.insufficientInformation !== "boolean"
  ) {
    throw new BenchmarkConfigurationError("judge_result_invalid");
  }
  const typedRubricResults = rubricResults as TutorEvalJudgeRubricResult[];
  if (
    new Set(typedRubricResults.map((result) => result.rubricId)).size !==
    typedRubricResults.length
  ) {
    throw new BenchmarkConfigurationError("judge_result_invalid");
  }
  return {
    schemaVersion: TUTOR_EVAL_JUDGE_SCHEMA_VERSION,
    caseId: record.caseId as string,
    rubricResults: typedRubricResults,
    criticalFailures: criticalFailures as TutorEvalJudgeCriticalFailure[],
    factualErrors: factualErrors as TutorEvalJudgeFactualError[],
    insufficientInformation: record.insufficientInformation,
  };
}

export function isTutorEvalJudgeResult(value: unknown): value is TutorEvalJudgeResult {
  try {
    parseTutorEvalJudgeResult(value);
    return true;
  } catch {
    return false;
  }
}

export function assertValidTutorEvalJudgeResult(
  value: unknown,
): asserts value is TutorEvalJudgeResult {
  parseTutorEvalJudgeResult(value);
}

export function buildTutorEvalJudgeInput(
  tutorEvalCase: TutorEvalCase,
  tutorResponse: string,
): TutorEvalJudgeInput {
  const tutorInput = tutorEvalCase.tutorInput;
  const hidden = tutorEvalCase.evaluatorOnly;
  const { judgeRubrics } = partitionTutorEvalRubrics(tutorEvalCase);
  return {
    caseId: tutorEvalCase.id,
    learningObjective: tutorInput.learningObjective,
    studentProfile: JSON.stringify(tutorInput.studentProfile ?? {}),
    conversationHistory: JSON.stringify(tutorInput.conversationHistory ?? []),
    studentMessage: tutorInput.studentMessage,
    problemContext: tutorInput.problemContext ?? "",
    groundTruth: JSON.stringify(hidden.groundTruth ?? {}),
    knownMisconception: hidden.knownMisconception ?? "",
    disclosurePolicy: hidden.disclosurePolicy,
    rubrics: judgeRubrics.map((rubric) => ({
      id: rubric.id,
      category: rubric.category,
      criterion: rubric.criterion,
      weight: rubric.weight,
      ...(rubric.applicability === undefined
        ? {}
        : { applicability: rubric.applicability }),
      ...(rubric.behavior === undefined ? {} : { behavior: rubric.behavior }),
      ...(rubric.capabilityTag === undefined
        ? {}
        : { capabilityTag: rubric.capabilityTag }),
      ...(rubric.critical === undefined ? {} : { critical: rubric.critical }),
      ...(rubric.criticalFailure === undefined
        ? {}
        : { criticalFailure: rubric.criticalFailure }),
    })),
    tutorResponse,
  };
}
