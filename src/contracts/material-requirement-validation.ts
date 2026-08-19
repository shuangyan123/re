import { BenchmarkConfigurationError } from "./errors.js";
import {
  MATERIAL_REQUIREMENT_ASSESSMENT_STATUSES,
  MATERIAL_REQUIREMENT_JUDGE_SCHEMA_VERSION,
  type MaterialRequirement,
  type MaterialRequirementAssessment,
  type MaterialRequirementJudgeInput,
  type MaterialRequirementJudgeResult,
  type MaterialRequirementRubric,
  type MaterialRequirementRubricAssessment,
} from "./material-requirement-judge.js";

type UnknownRecord = Record<string, unknown>;

const statuses = new Set<string>(MATERIAL_REQUIREMENT_ASSESSMENT_STATUSES);
const identifierPattern = /^[A-Za-z][A-Za-z0-9._:-]*$/u;
export const MATERIAL_REQUIREMENT_EVIDENCE_MAX_LENGTH = 500 as const;

function invalid(): never {
  throw new BenchmarkConfigurationError("material_requirement_judge_invalid");
}

function asRecord(value: unknown): UnknownRecord | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as UnknownRecord
    : null;
}

function hasOnlyKeys(record: UnknownRecord, keys: readonly string[]): boolean {
  const allowed = new Set(keys);
  return Object.keys(record).every((key) => allowed.has(key));
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function identifier(value: unknown): value is string {
  return nonEmptyString(value) && identifierPattern.test(value);
}

function parseRequirement(value: unknown): MaterialRequirement | null {
  const record = asRecord(value);
  if (
    record === null ||
    !hasOnlyKeys(record, ["id", "description"]) ||
    !identifier(record.id) ||
    !nonEmptyString(record.description)
  ) {
    return null;
  }
  return { id: record.id, description: record.description };
}

function parseRubric(value: unknown): MaterialRequirementRubric | null {
  const record = asRecord(value);
  if (
    record === null ||
    !hasOnlyKeys(record, ["id", "criterion", "requirements"]) ||
    !identifier(record.id) ||
    !nonEmptyString(record.criterion) ||
    !Array.isArray(record.requirements) ||
    record.requirements.length === 0
  ) {
    return null;
  }
  const requirements = record.requirements.map(parseRequirement);
  if (
    requirements.some((requirement) => requirement === null) ||
    new Set(requirements.map((requirement) => requirement?.id)).size !== requirements.length
  ) {
    return null;
  }
  return {
    id: record.id,
    criterion: record.criterion,
    requirements: requirements as MaterialRequirement[],
  };
}

export function parseMaterialRequirementJudgeInput(
  value: unknown,
): MaterialRequirementJudgeInput {
  const record = asRecord(value);
  if (
    record === null ||
    !hasOnlyKeys(record, ["caseId", "rubrics", "tutorResponse"]) ||
    !identifier(record.caseId) ||
    !Array.isArray(record.rubrics) ||
    record.rubrics.length === 0 ||
    !nonEmptyString(record.tutorResponse)
  ) {
    return invalid();
  }
  const rubrics = record.rubrics.map(parseRubric);
  if (
    rubrics.some((rubric) => rubric === null) ||
    new Set(rubrics.map((rubric) => rubric?.id)).size !== rubrics.length
  ) {
    return invalid();
  }
  return {
    caseId: record.caseId,
    rubrics: rubrics as MaterialRequirementRubric[],
    tutorResponse: record.tutorResponse,
  };
}

function parseAssessment(value: unknown): MaterialRequirementAssessment | null {
  const record = asRecord(value);
  if (
    record === null ||
    !hasOnlyKeys(record, ["requirementId", "status", "evidence"]) ||
    !identifier(record.requirementId) ||
    typeof record.status !== "string" ||
    !statuses.has(record.status) ||
    (record.evidence !== undefined && (
      !nonEmptyString(record.evidence) ||
      record.evidence.length > MATERIAL_REQUIREMENT_EVIDENCE_MAX_LENGTH
    ))
  ) {
    return null;
  }
  return {
    requirementId: record.requirementId,
    status: record.status as MaterialRequirementAssessment["status"],
    ...(record.evidence === undefined ? {} : { evidence: record.evidence }),
  };
}

function parseRubricAssessment(
  value: unknown,
): MaterialRequirementRubricAssessment | null {
  const record = asRecord(value);
  if (
    record === null ||
    !hasOnlyKeys(record, ["rubricId", "requirements"]) ||
    !identifier(record.rubricId) ||
    !Array.isArray(record.requirements)
  ) {
    return null;
  }
  const requirements = record.requirements.map(parseAssessment);
  if (
    requirements.some((assessment) => assessment === null) ||
    new Set(requirements.map((assessment) => assessment?.requirementId)).size !== requirements.length
  ) {
    return null;
  }
  return {
    rubricId: record.rubricId,
    requirements: requirements as MaterialRequirementAssessment[],
  };
}

/**
 * Parses against the supplied request so every rubric and requirement must
 * appear exactly once under its original owner. Extra fields fail closed.
 */
export function parseMaterialRequirementJudgeResult(
  value: unknown,
  expectedInput: MaterialRequirementJudgeInput,
): MaterialRequirementJudgeResult {
  const input = parseMaterialRequirementJudgeInput(expectedInput);
  const record = asRecord(value);
  if (
    record === null ||
    !hasOnlyKeys(record, ["schemaVersion", "caseId", "rubricAssessments"]) ||
    record.schemaVersion !== MATERIAL_REQUIREMENT_JUDGE_SCHEMA_VERSION ||
    record.caseId !== input.caseId ||
    !Array.isArray(record.rubricAssessments)
  ) {
    return invalid();
  }
  const rubricAssessments = record.rubricAssessments.map(parseRubricAssessment);
  if (
    rubricAssessments.some((assessment) => assessment === null) ||
    rubricAssessments.length !== input.rubrics.length ||
    new Set(rubricAssessments.map((assessment) => assessment?.rubricId)).size !== rubricAssessments.length
  ) {
    return invalid();
  }
  for (const rubric of input.rubrics) {
    const observed = rubricAssessments.find(
      (assessment) => assessment?.rubricId === rubric.id,
    );
    const expectedIds = new Set(rubric.requirements.map((requirement) => requirement.id));
    if (
      observed === undefined ||
      observed === null ||
      observed.requirements.length !== expectedIds.size ||
      observed.requirements.some((assessment) => !expectedIds.has(assessment.requirementId))
    ) {
      return invalid();
    }
  }
  return {
    schemaVersion: MATERIAL_REQUIREMENT_JUDGE_SCHEMA_VERSION,
    caseId: input.caseId,
    rubricAssessments: rubricAssessments as MaterialRequirementRubricAssessment[],
  };
}
