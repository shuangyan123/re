import type { TutorEvalCase, TutorEvalRunResult } from "../contracts/index.js";
import {
  hashReviewTranslationSource,
  reviewTranslationEntryKey,
  type ReviewTranslationArtifact,
  type ReviewTranslationSource,
} from "./contracts.js";

export type ReviewTranslationLookupStatus =
  | "translated"
  | "missing"
  | "stale"
  | "failed"
  | "artifact_mismatch";

export interface ReviewTranslationLookupResult {
  readonly status: ReviewTranslationLookupStatus;
  readonly translatedText?: string;
}

export interface ReviewTranslationLookup {
  readonly targetLocale: "zh-CN";
  get(source: ReviewTranslationSource): ReviewTranslationLookupResult;
}

function emptyResult(
  status: Exclude<ReviewTranslationLookupStatus, "translated">,
): ReviewTranslationLookupResult {
  return { status };
}

export function createReviewTranslationLookup(
  evaluation: TutorEvalRunResult,
  translation: ReviewTranslationArtifact | undefined,
): ReviewTranslationLookup {
  const artifactMatches = translation !== undefined &&
    translation.reviewOnly === true &&
    translation.targetLocale === "zh-CN" &&
    translation.sourceEvaluationRunId === evaluation.runId &&
    translation.sourceEvaluationDatasetId === evaluation.datasetId &&
    translation.sourceEvaluationDatasetVersion === evaluation.datasetVersion;
  const entries = artifactMatches
    ? new Map(translation.entries.map((entry) => [reviewTranslationEntryKey(entry), entry]))
    : new Map();
  return {
    targetLocale: "zh-CN",
    get(source): ReviewTranslationLookupResult {
      if (translation !== undefined && !artifactMatches) {
        return emptyResult("artifact_mismatch");
      }
      const entry = entries.get(reviewTranslationEntryKey(source));
      if (entry === undefined) {
        return emptyResult("missing");
      }
      if (entry.sourceTextHash !== hashReviewTranslationSource(source.sourceText)) {
        return emptyResult("stale");
      }
      if (entry.status !== "translated" || entry.translatedText === undefined) {
        return emptyResult("failed");
      }
      return { status: "translated", translatedText: entry.translatedText };
    },
  };
}
export function sourceForCaseField(
  targetLocale: "zh-CN",
  tutorEvalCase: TutorEvalCase,
  sourceType: ReviewTranslationSource["sourceType"],
  fieldKey: string,
  sourceText: string,
): ReviewTranslationSource {
  return {
    targetLocale,
    sourceType,
    caseId: tutorEvalCase.id,
    fieldKey,
    sourceText,
  };
}
