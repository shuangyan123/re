import {
  assertValidTutorEvalRunResult,
  parseTutorGenerationSpec,
  type TutorEvalRunResult,
  type TutorGenerationSpec,
} from "../contracts/index.js";

export interface TutorEvaluationAuditMetadata {
  readonly status?: string;
  readonly calibrationStatus?: string;
  readonly publicLeaderboardEligible?: boolean;
}

/**
 * Read-only view of both the current corpus evaluation wrapper and the older
 * raw TutorEvalRunResult artifact. Optional wrapper fields are deliberately
 * omitted when an old artifact did not record them.
 */
export interface TutorEvaluationAuditArtifact {
  readonly evaluation: TutorEvalRunResult;
  readonly corpusId?: string;
  readonly corpusVersion?: string;
  readonly generationSpec?: TutorGenerationSpec;
  readonly artifactMetadata?: TutorEvaluationAuditMetadata;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function optionalString(
  record: Record<string, unknown>,
  key: string,
): string | undefined {
  const value = record[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function parseMetadata(value: unknown): TutorEvaluationAuditMetadata | undefined {
  const record = asRecord(value);
  if (record === null) {
    return undefined;
  }
  const status = optionalString(record, "status");
  const calibrationStatus = optionalString(record, "calibrationStatus");
  return {
    ...(status === undefined ? {} : { status }),
    ...(calibrationStatus === undefined ? {} : { calibrationStatus }),
    ...(typeof record.publicLeaderboardEligible === "boolean"
      ? { publicLeaderboardEligible: record.publicLeaderboardEligible }
      : {}),
  };
}

export function parseTutorEvaluationAuditArtifact(
  value: unknown,
): TutorEvaluationAuditArtifact {
  const record = asRecord(value);
  const evaluationValue = record?.evaluation ?? value;
  assertValidTutorEvalRunResult(evaluationValue);
  const generationSpecValue = record?.generationSpec;
  const generationSpec = generationSpecValue === undefined
    ? undefined
    : parseTutorGenerationSpec(generationSpecValue);
  const corpusId = record === null ? undefined : optionalString(record, "corpusId");
  const corpusVersion = record === null
    ? undefined
    : optionalString(record, "corpusVersion");
  const artifactMetadata = parseMetadata(record?.artifactMetadata);
  return {
    evaluation: evaluationValue,
    ...(corpusId === undefined ? {} : { corpusId }),
    ...(corpusVersion === undefined ? {} : { corpusVersion }),
    ...(generationSpec === undefined ? {} : { generationSpec }),
    ...(artifactMetadata === undefined ? {} : { artifactMetadata }),
  };
}
