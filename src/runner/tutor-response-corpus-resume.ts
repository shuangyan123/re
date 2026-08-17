import {
  BenchmarkConfigurationError,
  TUTOR_EVAL_CATEGORIES,
  TUTOR_EVAL_EVALUATOR_VERSION,
  parseTutorEvalJudgeResult,
  resolveTutorCaseLocale,
  tutorGenerationSpecsEqual,
  type TutorEvalCaseRunResult,
  type TutorEvalCase,
  type TutorEvalDataset,
  type TutorEvalJudgeDescriptor,
  type TutorEvalJudgeResult,
  type TutorEvalRubricResult,
  type TutorEvalTokenUsage,
  type TutorResponseCorpus,
  type TutorResponseCorpusEvaluationResult,
  type TutorResponseCorpusEvaluationSelection,
} from "../contracts/index.js";
import {
  parseTutorResponseCorpusEvaluationResult,
} from "../contracts/index.js";
import {
  toTutorResponseCorpusSemanticReplay,
  type TutorResponseCorpusReplayPlan,
} from "../corpus/replay.js";
import type { TutorEvalJudgeRunOptions } from "./tutor-eval-runner.js";

const CASE_RUN_SEPARATOR = "\u0000";

export interface PrepareTutorResponseCorpusResumeOptions {
  readonly previousEvaluation: TutorResponseCorpusEvaluationResult;
  readonly corpus: TutorResponseCorpus;
  readonly dataset: TutorEvalDataset;
  readonly selectedCases: readonly TutorEvalCase[];
  readonly selection: TutorResponseCorpusEvaluationSelection;
  readonly semanticReplay?: TutorResponseCorpusReplayPlan;
  readonly judge?: TutorEvalJudgeRunOptions;
}

export interface TutorResponseCorpusResumePlan {
  readonly reusableCaseResults: ReadonlyMap<string, TutorEvalCaseRunResult>;
  readonly reusedCaseRunCount: number;
}

export interface TutorResponseCorpusResumeTelemetry {
  readonly reusedCaseRunCount: number;
}

export function tutorResponseCorpusCaseRunKey(
  caseId: string,
  runIndex: number,
): string {
  return `${caseId}${CASE_RUN_SEPARATOR}${runIndex}`;
}

function invalidResume(): never {
  throw new BenchmarkConfigurationError("tutor_eval_result_invalid");
}

function descriptorIdentity(
  descriptor: {
    readonly provider: string;
    readonly model: string;
    readonly modelVersion?: string;
    readonly promptId?: string;
    readonly promptVersion: string;
    readonly temperature?: number;
    readonly reasoningEffort?: string;
    readonly seed?: number;
  },
): string {
  return JSON.stringify({
    provider: descriptor.provider,
    model: descriptor.model,
    ...(descriptor.modelVersion === undefined
      ? {}
      : { modelVersion: descriptor.modelVersion }),
    ...(descriptor.promptId === undefined ? {} : { promptId: descriptor.promptId }),
    promptVersion: descriptor.promptVersion,
    ...(descriptor.temperature === undefined
      ? {}
      : { temperature: descriptor.temperature }),
    ...(descriptor.reasoningEffort === undefined
      ? {}
      : { reasoningEffort: descriptor.reasoningEffort }),
    ...(descriptor.seed === undefined ? {} : { seed: descriptor.seed }),
  });
}

function tutorDescriptorsEqual(
  left: PrepareTutorResponseCorpusResumeOptions["corpus"]["tutor"],
  right: PrepareTutorResponseCorpusResumeOptions["corpus"]["tutor"],
): boolean {
  return descriptorIdentity(left) === descriptorIdentity(right);
}

function judgeDescriptor(
  judge: TutorEvalJudgeRunOptions | undefined,
): TutorEvalJudgeDescriptor | null {
  if (judge === undefined) {
    return null;
  }
  return {
    provider: judge.provider,
    model: judge.model,
    ...(judge.modelVersion === undefined ? {} : { modelVersion: judge.modelVersion }),
    ...(judge.promptId === undefined ? {} : { promptId: judge.promptId }),
    promptVersion: judge.promptVersion,
    ...(judge.temperature === undefined ? {} : { temperature: judge.temperature }),
    ...(judge.reasoningEffort === undefined
      ? {}
      : { reasoningEffort: judge.reasoningEffort }),
    ...(judge.thinkingMode === undefined ? {} : { thinkingMode: judge.thinkingMode }),
    ...(judge.maxOutputTokens === undefined
      ? {}
      : { maxOutputTokens: judge.maxOutputTokens }),
    ...(judge.timeoutMs === undefined ? {} : { timeoutMs: judge.timeoutMs }),
    ...(judge.maxAttempts === undefined ? {} : { maxAttempts: judge.maxAttempts }),
    ...(judge.seed === undefined ? {} : { seed: judge.seed }),
  };
}

function semanticJudgeIdentity(
  descriptor: TutorEvalJudgeDescriptor | null,
): string {
  if (descriptor === null) {
    return "null";
  }
  return JSON.stringify({
    provider: descriptor.provider,
    model: descriptor.model,
    ...(descriptor.modelVersion === undefined
      ? {}
      : { modelVersion: descriptor.modelVersion }),
    ...(descriptor.promptId === undefined ? {} : { promptId: descriptor.promptId }),
    promptVersion: descriptor.promptVersion,
    ...(descriptor.temperature === undefined
      ? {}
      : { temperature: descriptor.temperature }),
    ...(descriptor.reasoningEffort === undefined
      ? {}
      : { reasoningEffort: descriptor.reasoningEffort }),
    ...(descriptor.thinkingMode === undefined
      ? {}
      : { thinkingMode: descriptor.thinkingMode }),
    ...(descriptor.maxOutputTokens === undefined
      ? {}
      : { maxOutputTokens: descriptor.maxOutputTokens }),
    ...(descriptor.seed === undefined ? {} : { seed: descriptor.seed }),
  });
}

function caseVersionForCorpusResponse(
  tutorEvalCase: TutorEvalCase,
  semanticReplay: TutorResponseCorpusReplayPlan | undefined,
): string {
  return semanticReplay?.caseVersionMappings.find(
    (mapping) => mapping.caseId === tutorEvalCase.id,
  )?.sourceVersion ?? tutorEvalCase.version;
}

function expectedCorpusResponse(
  corpus: TutorResponseCorpus,
  tutorEvalCase: TutorEvalCase,
  runIndex: number,
  semanticReplay: TutorResponseCorpusReplayPlan | undefined,
) {
  const caseVersion = caseVersionForCorpusResponse(tutorEvalCase, semanticReplay);
  return corpus.responses.find(
    (response) =>
      response.caseId === tutorEvalCase.id &&
      response.caseVersion === caseVersion &&
      response.runIndex === runIndex,
  );
}

function canonicalTokenUsage(value: TutorEvalTokenUsage | null): TutorEvalTokenUsage | null {
  if (value === null) {
    return null;
  }
  for (const tokenCount of [value.inputTokens, value.outputTokens, value.totalTokens]) {
    if (
      tokenCount !== undefined &&
      (typeof tokenCount !== "number" || !Number.isInteger(tokenCount) || tokenCount < 0)
    ) {
      return invalidResume();
    }
  }
  return {
    ...(value.inputTokens === undefined ? {} : { inputTokens: value.inputTokens }),
    ...(value.outputTokens === undefined ? {} : { outputTokens: value.outputTokens }),
    ...(value.totalTokens === undefined ? {} : { totalTokens: value.totalTokens }),
  };
}

function canonicalRubricResult(result: TutorEvalRubricResult): TutorEvalRubricResult {
  return {
    rubricId: result.rubricId,
    category: result.category,
    result: result.result,
    score: result.score,
    weight: result.weight,
    critical: result.critical,
    diagnostics: result.diagnostics.map((diagnostic) => ({
      code: diagnostic.code,
      message: diagnostic.message,
    })),
  };
}

function canonicalCaseRunResult(
  result: TutorEvalCaseRunResult,
): TutorEvalCaseRunResult {
  let rawJudgeResult: TutorEvalJudgeResult | null = null;
  if (result.rawJudgeResult !== null) {
    try {
      rawJudgeResult = parseTutorEvalJudgeResult(result.rawJudgeResult);
    } catch {
      return invalidResume();
    }
  }
  const judgeMetrics = result.judgeMetrics ?? null;
  return {
    caseId: result.caseId,
    caseVersion: result.caseVersion,
    ...(result.locale === undefined ? {} : { locale: resolveTutorCaseLocale(result.locale) }),
    runIndex: result.runIndex,
    status: result.status,
    passed: result.passed,
    rawTutorResponse: result.rawTutorResponse,
    rawJudgeResult,
    judgeMetrics: judgeMetrics === null
      ? null
      : {
          latencyMs: judgeMetrics.latencyMs,
          tokenUsage: canonicalTokenUsage(judgeMetrics.tokenUsage),
          cost: judgeMetrics.cost,
          attempts: judgeMetrics.attempts,
        },
    rubricResults: result.rubricResults.map(canonicalRubricResult),
    categoryScores: Object.fromEntries(
      TUTOR_EVAL_CATEGORIES.map((category) => [category, result.categoryScores[category]]),
    ) as TutorEvalCaseRunResult["categoryScores"],
    overallScore: result.overallScore,
    qualityGate: result.qualityGate,
    criticalFailures: result.criticalFailures.map((failure) => ({
      type: failure.type,
      severity: failure.severity,
      evidence: failure.evidence,
    })),
    answerLeakage: result.answerLeakage,
    latencyMs: result.latencyMs,
    tokenUsage: result.tokenUsage === null
      ? null
      : canonicalTokenUsage(result.tokenUsage),
    cost: result.cost,
    diagnostics: result.diagnostics.map((diagnostic) => ({
      code: diagnostic.code,
      message: diagnostic.message,
    })),
  };
}

function validatePreviousSelection(
  previous: TutorResponseCorpusEvaluationResult,
  options: PrepareTutorResponseCorpusResumeOptions,
): void {
  const previousSelection = previous.evaluationSelection;
  if (previousSelection === undefined) {
    invalidResume();
  }
  validateSelectionShape(previousSelection, options);
  if (
    previous.selectedCaseCount !== previousSelection.selectedCaseIds.length ||
    previous.evaluation.caseCount !== previousSelection.selectedCaseIds.length ||
    previous.evaluation.caseRunCount !==
      previousSelection.selectedCaseIds.length * options.corpus.runsPerCase
  ) {
    invalidResume();
  }
  const datasetCasesById = new Map(
    options.dataset.cases.map((tutorEvalCase) => [tutorEvalCase.id, tutorEvalCase]),
  );
  const selectedCaseIds = new Set(previousSelection.selectedCaseIds);
  const availableResponseCaseIds = new Set(
    options.corpus.responses.map((response) => response.caseId),
  );
  if (
    previousSelection.selectedCaseIds.some(
      (caseId) => !datasetCasesById.has(caseId) || !availableResponseCaseIds.has(caseId),
    )
  ) {
    invalidResume();
  }
  const selectedResponseCount = options.corpus.responses.filter((response) =>
    selectedCaseIds.has(response.caseId),
  ).length;
  if (previousSelection.selectedResponseCount !== selectedResponseCount) {
    invalidResume();
  }
}

function validatePreviousCaseRuns(
  previous: TutorResponseCorpusEvaluationResult,
  options: PrepareTutorResponseCorpusResumeOptions,
): Map<string, TutorEvalCaseRunResult> {
  const previousSelection = options.previousEvaluation.evaluationSelection;
  if (previousSelection === undefined) {
    invalidResume();
  }
  const datasetCasesById = new Map(
    options.dataset.cases.map((tutorEvalCase) => [tutorEvalCase.id, tutorEvalCase]),
  );
  const selectedCaseIds = new Set(previousSelection.selectedCaseIds);
  const currentSelectedCaseIds = new Set(options.selection.selectedCaseIds);
  const seenCaseRuns = new Set<string>();
  const reusable = new Map<string, TutorEvalCaseRunResult>();
  for (const caseResult of previous.evaluation.caseResults) {
    const tutorEvalCase = datasetCasesById.get(caseResult.caseId);
    if (
      tutorEvalCase === undefined ||
      !selectedCaseIds.has(caseResult.caseId) ||
      caseResult.caseVersion !== tutorEvalCase.version ||
      caseResult.runIndex > options.corpus.runsPerCase ||
      (caseResult.locale !== undefined &&
        caseResult.locale !== resolveTutorCaseLocale(tutorEvalCase.locale))
    ) {
      invalidResume();
    }
    const caseRunKey = tutorResponseCorpusCaseRunKey(caseResult.caseId, caseResult.runIndex);
    if (seenCaseRuns.has(caseRunKey)) {
      invalidResume();
    }
    seenCaseRuns.add(caseRunKey);
    if (caseResult.status === "error") {
      continue;
    }
    if (
      caseResult.passed !== (caseResult.status === "passed") ||
      caseResult.rawTutorResponse === null ||
      caseResult.overallScore === null ||
      caseResult.rubricResults.some((rubricResult) => rubricResult.result === "ERROR")
    ) {
      invalidResume();
    }
    const response = expectedCorpusResponse(
      options.corpus,
      tutorEvalCase,
      caseResult.runIndex,
      options.semanticReplay,
    );
    if (response === undefined || caseResult.rawTutorResponse !== response.responseText) {
      invalidResume();
    }
    if (currentSelectedCaseIds.has(caseResult.caseId)) {
      reusable.set(caseRunKey, {
        ...canonicalCaseRunResult(caseResult),
        locale: resolveTutorCaseLocale(tutorEvalCase.locale),
      });
    }
  }
  if (
    seenCaseRuns.size !== previous.evaluation.caseRunCount ||
    seenCaseRuns.size !== previous.evaluation.caseResults.length
  ) {
    invalidResume();
  }
  return reusable;
}

function validateSelectionShape(
  selection: TutorResponseCorpusEvaluationSelection,
  options: PrepareTutorResponseCorpusResumeOptions,
): void {
  const orderedCases = [...options.dataset.cases].sort((left, right) =>
    left.id < right.id ? -1 : left.id > right.id ? 1 : 0,
  );
  const availableCaseIds = new Set(
    options.corpus.responses.map((response) => response.caseId),
  );
  const casesById = new Map(orderedCases.map((tutorEvalCase) => [tutorEvalCase.id, tutorEvalCase]));
  if (
    selection.requestedCaseIds.some(
      (caseId) => !casesById.has(caseId) || !availableCaseIds.has(caseId),
    )
  ) {
    invalidResume();
  }
  const availableCases = selection.requestedCaseIds.length === 0
    ? orderedCases.filter((tutorEvalCase) => availableCaseIds.has(tutorEvalCase.id))
    : orderedCases.filter((tutorEvalCase) =>
        selection.requestedCaseIds.includes(tutorEvalCase.id),
      );
  const selectedCases = selection.limit === null
    ? availableCases
    : availableCases.slice(0, selection.limit);
  const expectedMode = selection.requestedCaseIds.length > 0
    ? selection.limit === null ? "explicit_cases" : "explicit_cases_limit"
    : selection.limit === null ? "all_available" : "available_limit";
  if (
    selection.mode !== expectedMode ||
    JSON.stringify(selection.selectedCaseIds) !==
      JSON.stringify(selectedCases.map((tutorEvalCase) => tutorEvalCase.id))
  ) {
    invalidResume();
  }
}

function validateIdentity(
  previous: TutorResponseCorpusEvaluationResult,
  options: PrepareTutorResponseCorpusResumeOptions,
): void {
  const currentSemanticReplay = options.semanticReplay === undefined
    ? undefined
    : toTutorResponseCorpusSemanticReplay(options.semanticReplay);
  if (
    previous.corpusId !== options.corpus.corpusId ||
    previous.corpusVersion !== options.corpus.corpusVersion ||
    previous.datasetId !== options.dataset.id ||
    previous.datasetVersion !== options.dataset.version ||
    previous.coverage !== options.corpus.coverage ||
    previous.availableResponseCount !== options.corpus.responses.length ||
    previous.missingCaseCount !==
      options.dataset.cases.length - new Set(options.corpus.responses.map((response) => response.caseId)).size ||
    !tutorDescriptorsEqual(previous.tutor, options.corpus.tutor) ||
    !tutorDescriptorsEqual(previous.evaluation.tutor, options.corpus.tutor) ||
    !tutorGenerationSpecsEqual(previous.generationSpec, options.corpus.generationSpec) ||
    JSON.stringify(previous.semanticReplay) !== JSON.stringify(currentSemanticReplay) ||
    previous.evaluation.datasetId !== options.dataset.id ||
    previous.evaluation.datasetVersion !== options.dataset.version ||
    previous.evaluation.evaluatorVersion !== TUTOR_EVAL_EVALUATOR_VERSION ||
    previous.evaluation.runsPerCase !== options.corpus.runsPerCase ||
    semanticJudgeIdentity(previous.evaluation.judge) !==
      semanticJudgeIdentity(judgeDescriptor(options.judge))
  ) {
    invalidResume();
  }
}

/**
 * Validates and prepares only completed case-runs that can be safely reused.
 * This function performs all checks before the caller enters the Judge loop.
 */
export function prepareTutorResponseCorpusResume(
  options: PrepareTutorResponseCorpusResumeOptions,
): TutorResponseCorpusResumePlan {
  const previous = parseTutorResponseCorpusEvaluationResult(options.previousEvaluation);
  const normalizedOptions = { ...options, previousEvaluation: previous };
  validateIdentity(previous, normalizedOptions);
  validatePreviousSelection(previous, normalizedOptions);
  const reusable = validatePreviousCaseRuns(previous, normalizedOptions);
  return {
    reusableCaseResults: reusable,
    reusedCaseRunCount: reusable.size,
  };
}
