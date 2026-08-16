import {
  type TutorEvalCase,
  type TutorEvalDataset,
  type TutorEvalCaseRunResult,
} from "../contracts/index.js";
import type { TutorEvaluationAuditArtifact } from "../reporting/tutor-evaluation-audit.js";
import {
  hashReviewTranslationSource,
  reviewTranslationEntryId,
  reviewTranslationEntryKey,
  ReviewTranslationArtifactError,
  type ReviewTranslationArtifact,
  type ReviewTranslationEntry,
  type ReviewTranslationFailureCode,
  type ReviewTranslationLocale,
  type ReviewTranslationSource,
  type ReviewTranslationSourceType,
} from "./contracts.js";
import {
  ReviewTranslationProviderError,
  type ReviewTranslationRequest,
  type ReviewTranslator,
} from "./provider.js";

export interface BuildReviewTranslationArtifactOptions {
  readonly artifact: TutorEvaluationAuditArtifact;
  readonly dataset: TutorEvalDataset;
  readonly targetLocale: ReviewTranslationLocale;
  readonly existing?: ReviewTranslationArtifact;
  readonly translator?: ReviewTranslator;
  readonly now?: () => string;
}

function addSource(
  sources: ReviewTranslationSource[],
  targetLocale: ReviewTranslationLocale,
  sourceType: ReviewTranslationSourceType,
  caseId: string,
  fieldKey: string,
  sourceText: string | undefined,
  runIndex?: number,
): void {
  if (sourceText === undefined || sourceText.trim().length === 0) {
    return;
  }
  sources.push({
    targetLocale,
    sourceType,
    caseId,
    ...(runIndex === undefined ? {} : { runIndex }),
    fieldKey,
    sourceText,
  });
}

function addStaticCaseSources(
  sources: ReviewTranslationSource[],
  tutorEvalCase: TutorEvalCase,
  targetLocale: ReviewTranslationLocale,
): void {
  const caseId = tutorEvalCase.id;
  const input = tutorEvalCase.tutorInput;
  addSource(sources, targetLocale, "student_message", caseId, "tutorInput.studentMessage", input.studentMessage);
  addSource(sources, targetLocale, "problem_context", caseId, "tutorInput.problemContext", input.problemContext);
  addSource(sources, targetLocale, "learning_objective", caseId, "tutorInput.learningObjective", input.learningObjective);

  input.conversationHistory?.forEach((message, index) => {
    addSource(
      sources,
      targetLocale,
      "conversation_message",
      caseId,
      `tutorInput.conversationHistory[${index}].${message.role}`,
      message.text,
    );
  });

  const profile = input.studentProfile;
  profile?.knownConcepts?.forEach((concept, index) => {
    addSource(
      sources,
      targetLocale,
      "student_profile",
      caseId,
      `tutorInput.studentProfile.knownConcepts[${index}]`,
      concept,
    );
  });
  profile?.misconceptions?.forEach((misconception, index) => {
    addSource(
      sources,
      targetLocale,
      "student_profile",
      caseId,
      `tutorInput.studentProfile.misconceptions[${index}]`,
      misconception,
    );
  });
  addSource(sources, targetLocale, "student_profile", caseId, "tutorInput.studentProfile.level", profile?.level);
  addSource(sources, targetLocale, "student_profile", caseId, "tutorInput.studentProfile.goal", profile?.goal);

  for (const rubric of tutorEvalCase.evaluatorOnly.rubrics) {
    addSource(
      sources,
      targetLocale,
      "rubric_criterion",
      caseId,
      `evaluatorOnly.rubrics[${rubric.id}].criterion`,
      rubric.criterion,
    );
  }
}

function addDynamicCaseSources(
  sources: ReviewTranslationSource[],
  caseResult: TutorEvalCaseRunResult,
  targetLocale: ReviewTranslationLocale,
): void {
  const { caseId, runIndex } = caseResult;
  addSource(sources, targetLocale, "tutor_response", caseId, "rawTutorResponse", caseResult.rawTutorResponse ?? undefined, runIndex);

  const judge = caseResult.rawJudgeResult;
  judge?.rubricResults.forEach((rubricResult) => {
    addSource(
      sources,
      targetLocale,
      "judge_evidence",
      caseId,
      `rawJudgeResult.rubricResults[${rubricResult.rubricId}].evidence`,
      rubricResult.evidence,
      runIndex,
    );
  });
  judge?.factualErrors.forEach((factualError, index) => {
    addSource(
      sources,
      targetLocale,
      "judge_factual_error",
      caseId,
      `rawJudgeResult.factualErrors[${index}].description`,
      factualError.description,
      runIndex,
    );
  });
  judge?.criticalFailures.forEach((failure, index) => {
    addSource(
      sources,
      targetLocale,
      "judge_critical_failure_evidence",
      caseId,
      `rawJudgeResult.criticalFailures[${index}].evidence`,
      failure.evidence,
      runIndex,
    );
  });

  caseResult.criticalFailures.forEach((failure, index) => {
    addSource(
      sources,
      targetLocale,
      "critical_failure_evidence",
      caseId,
      `caseResult.criticalFailures[${index}].evidence`,
      failure.evidence,
      runIndex,
    );
  });
  caseResult.rubricResults.forEach((rubricResult) => {
    rubricResult.diagnostics.forEach((diagnostic, index) => {
      addSource(
        sources,
        targetLocale,
        "evaluation_diagnostic",
        caseId,
        `caseResult.rubricResults[${rubricResult.rubricId}].diagnostics[${index}].message`,
        diagnostic.message,
        runIndex,
      );
    });
  });
  caseResult.diagnostics.forEach((diagnostic, index) => {
    const sourceType = diagnostic.code.startsWith("judge_")
      ? "judge_diagnostic"
      : "evaluation_diagnostic";
    addSource(
      sources,
      targetLocale,
      sourceType,
      caseId,
      `caseResult.diagnostics[${index}].message`,
      diagnostic.message,
      runIndex,
    );
  });
}

export function buildReviewTranslationSources(
  artifact: TutorEvaluationAuditArtifact,
  dataset: TutorEvalDataset,
  targetLocale: ReviewTranslationLocale,
): readonly ReviewTranslationSource[] {
  const sources: ReviewTranslationSource[] = [];
  const evaluatedCaseIds = new Set(
    artifact.evaluation.caseResults.map((caseResult) => caseResult.caseId),
  );
  [...dataset.cases]
    .filter((tutorEvalCase) => evaluatedCaseIds.has(tutorEvalCase.id))
    .sort((left, right) => left.id.localeCompare(right.id))
    .forEach((tutorEvalCase) => addStaticCaseSources(sources, tutorEvalCase, targetLocale));
  [...artifact.evaluation.caseResults]
    .sort((left, right) => left.caseId.localeCompare(right.caseId) || left.runIndex - right.runIndex)
    .forEach((caseResult) => addDynamicCaseSources(sources, caseResult, targetLocale));
  return sources;
}

function failureCode(error: unknown): ReviewTranslationFailureCode {
  return error instanceof ReviewTranslationProviderError
    ? error.code
    : "translator_transport_error";
}

function buildEntry(
  source: ReviewTranslationSource,
  status: "translated" | "failed",
  now: string,
  provider: string,
  model: string | undefined,
  translatedText: string | undefined,
  errorCode: ReviewTranslationFailureCode | undefined,
): ReviewTranslationEntry {
  return {
    entryId: reviewTranslationEntryId(source),
    targetLocale: source.targetLocale,
    sourceType: source.sourceType,
    caseId: source.caseId,
    ...(source.runIndex === undefined ? {} : { runIndex: source.runIndex }),
    fieldKey: source.fieldKey,
    sourceTextHash: hashReviewTranslationSource(source.sourceText),
    status,
    ...(translatedText === undefined ? {} : { translatedText }),
    ...(errorCode === undefined ? {} : { failureCode: errorCode }),
    provider,
    ...(model === undefined ? {} : { model }),
    translatedAt: now,
  };
}

function existingEntryMap(
  existing: ReviewTranslationArtifact | undefined,
): ReadonlyMap<string, ReviewTranslationEntry> {
  return new Map(existing?.entries.map((entry) => [reviewTranslationEntryKey(entry), entry]) ?? []);
}

function matchesEvaluation(
  artifact: ReviewTranslationArtifact,
  evaluation: TutorEvaluationAuditArtifact,
): boolean {
  return (
    artifact.reviewOnly === true &&
    artifact.sourceEvaluationRunId === evaluation.evaluation.runId &&
    artifact.sourceEvaluationDatasetId === evaluation.evaluation.datasetId &&
    artifact.sourceEvaluationDatasetVersion === evaluation.evaluation.datasetVersion
  );
}

export function assertReviewTranslationMatchesEvaluation(
  translation: ReviewTranslationArtifact,
  evaluation: TutorEvaluationAuditArtifact,
): void {
  if (!matchesEvaluation(translation, evaluation)) {
    throw new ReviewTranslationArtifactError();
  }
}

export async function buildReviewTranslationArtifact(
  options: BuildReviewTranslationArtifactOptions,
): Promise<ReviewTranslationArtifact> {
  if (options.existing !== undefined) {
    assertReviewTranslationMatchesEvaluation(options.existing, options.artifact);
    if (options.existing.targetLocale !== options.targetLocale) {
      throw new ReviewTranslationArtifactError();
    }
  }
  const now = options.now?.() ?? new Date().toISOString();
  const existing = existingEntryMap(options.existing);
  const entries: ReviewTranslationEntry[] = [];
  for (const source of buildReviewTranslationSources(options.artifact, options.dataset, options.targetLocale)) {
    const cached = existing.get(reviewTranslationEntryKey(source));
    if (
      cached !== undefined &&
      cached.sourceTextHash === hashReviewTranslationSource(source.sourceText) &&
      cached.status === "translated" &&
      cached.translatedText !== undefined
    ) {
      entries.push(cached);
      continue;
    }

    let translatedText: string | undefined;
    let error: ReviewTranslationFailureCode | undefined;
    if (options.translator === undefined) {
      error = "translator_unavailable";
    } else {
      const request: ReviewTranslationRequest = {
        targetLocale: source.targetLocale,
        sourceType: source.sourceType,
        caseId: source.caseId,
        ...(source.runIndex === undefined ? {} : { runIndex: source.runIndex }),
        fieldKey: source.fieldKey,
        sourceText: source.sourceText,
      };
      try {
        const result = await options.translator.translate(request);
        if (typeof result !== "string" || result.trim().length === 0) {
          error = "translator_invalid_response";
        } else {
          translatedText = result;
        }
      } catch (caught) {
        error = failureCode(caught);
      }
    }
    entries.push(buildEntry(
      source,
      translatedText === undefined ? "failed" : "translated",
      now,
      options.translator?.provider ?? "unavailable",
      options.translator?.model,
      translatedText,
      error,
    ));
  }

  const translator = options.translator === undefined
    ? { provider: "unavailable" }
    : {
        provider: options.translator.provider,
        ...(options.translator.model === undefined ? {} : { model: options.translator.model }),
      };
  return {
    schemaVersion: 1,
    artifactType: "review-translation",
    reviewOnly: true,
    targetLocale: options.targetLocale,
    sourceEvaluationRunId: options.artifact.evaluation.runId,
    sourceEvaluationDatasetId: options.artifact.evaluation.datasetId,
    sourceEvaluationDatasetVersion: options.artifact.evaluation.datasetVersion,
    generatedAt: now,
    translator,
    entries,
  };
}
