import {
  BenchmarkConfigurationError,
  assertValidTutorResponseCorpus,
  type TutorEvalCase,
  type TutorEvalDataset,
  type TutorEvalRunResult,
  type TutorResponseCorpus,
  type TutorResponseCorpusEvaluationResult,
  type TutorResponseCorpusEvaluationSelection,
  type TutorResponseCorpusEvaluationSelectionMode,
} from "../contracts/index.js";
import {
  RecordedTutor,
  SemanticReplayTutor,
} from "../adapters/recorded-tutor.js";
import {
  resolveTutorResponseCorpusReplay,
  toTutorResponseCorpusSemanticReplay,
  type TutorResponseCorpusReplayPlan,
} from "../corpus/replay.js";
import {
  runTutorEval,
  type RunTutorEvalOptions,
  type TutorEvalJudgeRunOptions,
  type TutorEvalTutorOptions,
} from "./tutor-eval-runner.js";
import {
  prepareTutorResponseCorpusResume,
  type TutorResponseCorpusResumeTelemetry,
} from "./tutor-response-corpus-resume.js";

export interface RunTutorResponseCorpusOptions {
  readonly corpus: TutorResponseCorpus;
  readonly dataset: TutorEvalDataset;
  readonly requireFull?: boolean;
  readonly judge?: TutorEvalJudgeRunOptions;
  readonly resumeEvaluation?: TutorResponseCorpusEvaluationResult;
  readonly onResume?: (telemetry: TutorResponseCorpusResumeTelemetry) => void;
  readonly onJudgeCall?: () => void;
  readonly runId?: string;
  readonly now?: () => Date;
  readonly scoring?: RunTutorEvalOptions["scoring"];
  /** Optional frozen-corpus subset; selection never calls the Tutor. */
  readonly caseIds?: readonly string[];
  readonly limit?: number;
  /** Validated source/target plan for an explicitly approved replay. */
  readonly semanticReplay?: TutorResponseCorpusReplayPlan;
}

export interface TutorResponseCorpusSelectionOptions {
  readonly caseIds?: readonly string[];
  readonly limit?: number;
}

export interface ResolvedTutorResponseCorpusSelection {
  readonly dataset: TutorEvalDataset;
  readonly selection: TutorResponseCorpusEvaluationSelection;
}

function orderedCases(dataset: TutorEvalDataset): readonly TutorEvalCase[] {
  return [...dataset.cases].sort((left, right) =>
    left.id < right.id ? -1 : left.id > right.id ? 1 : 0,
  );
}

function selectionMode(
  hasExplicitCases: boolean,
  hasLimit: boolean,
): TutorResponseCorpusEvaluationSelectionMode {
  if (hasExplicitCases && hasLimit) {
    return "explicit_cases_limit";
  }
  if (hasExplicitCases) {
    return "explicit_cases";
  }
  if (hasLimit) {
    return "available_limit";
  }
  return "all_available";
}

function validateSelectionOptions(
  options: TutorResponseCorpusSelectionOptions,
): { readonly caseIds: readonly string[]; readonly limit: number | null } {
  const caseIds = options.caseIds ?? [];
  if (
    !Array.isArray(caseIds) ||
    caseIds.some((caseId) => typeof caseId !== "string" || caseId.trim().length === 0) ||
    new Set(caseIds).size !== caseIds.length
  ) {
    throw new BenchmarkConfigurationError("tutor_eval_selection_invalid");
  }
  const limit = options.limit;
  if (limit !== undefined && (!Number.isInteger(limit) || limit < 1)) {
    throw new BenchmarkConfigurationError("tutor_eval_selection_invalid");
  }
  return {
    caseIds: [...caseIds],
    limit: limit ?? null,
  };
}

export function resolveTutorResponseCorpusSelection(
  corpus: TutorResponseCorpus,
  dataset: TutorEvalDataset,
  options: TutorResponseCorpusSelectionOptions = {},
): ResolvedTutorResponseCorpusSelection {
  const { caseIds, limit } = validateSelectionOptions(options);
  const orderedDatasetCases = orderedCases(dataset);
  const datasetById = new Map(
    orderedDatasetCases.map((tutorEvalCase) => [tutorEvalCase.id, tutorEvalCase]),
  );
  const selectedCaseIds = new Set(corpus.responses.map((response) => response.caseId));
  for (const caseId of caseIds) {
    if (!datasetById.has(caseId) || !selectedCaseIds.has(caseId)) {
      throw new BenchmarkConfigurationError("tutor_eval_selection_invalid");
    }
  }
  const availableCases = caseIds.length === 0
    ? orderedDatasetCases.filter((tutorEvalCase) => selectedCaseIds.has(tutorEvalCase.id))
    : orderedDatasetCases.filter((tutorEvalCase) => caseIds.includes(tutorEvalCase.id));
  const selectedCases = limit === null
    ? availableCases
    : availableCases.slice(0, limit);
  const finalCaseIds = selectedCases.map((tutorEvalCase) => tutorEvalCase.id);
  const finalCaseIdSet = new Set(finalCaseIds);
  return {
    dataset: {
      id: dataset.id,
      version: dataset.version,
      cases: selectedCases,
    },
    selection: {
      mode: selectionMode(caseIds.length > 0, limit !== null),
      requestedCaseIds: [...caseIds],
      selectedCaseIds: finalCaseIds,
      limit,
      selectedResponseCount: corpus.responses.filter((response) =>
        finalCaseIdSet.has(response.caseId),
      ).length,
    },
  };
}

function tutorDescriptor(corpus: TutorResponseCorpus): TutorEvalTutorOptions {
  return corpus.tutor;
}

export async function runTutorResponseCorpus(
  options: RunTutorResponseCorpusOptions,
): Promise<TutorResponseCorpusEvaluationResult> {
  const semanticReplay = options.semanticReplay === undefined
    ? undefined
    : resolveTutorResponseCorpusReplay(options.corpus, options.dataset);
  if (options.semanticReplay !== undefined && semanticReplay === undefined) {
    throw new BenchmarkConfigurationError("tutor_response_replay_incompatible");
  }
  const validationDataset = semanticReplay?.sourceDataset ?? options.dataset;
  assertValidTutorResponseCorpus({
    corpus: options.corpus,
    dataset: validationDataset,
    ...(options.requireFull === undefined ? {} : { requireFull: options.requireFull }),
  });
  const resolvedSelection = resolveTutorResponseCorpusSelection(
    options.corpus,
    options.dataset,
    {
      ...(options.caseIds === undefined ? {} : { caseIds: options.caseIds }),
      ...(options.limit === undefined ? {} : { limit: options.limit }),
    },
  );
  const selected = resolvedSelection.dataset;
  const sourceAvailableCaseCount = new Set(
    options.corpus.responses.map((response) => response.caseId),
  ).size;
  const missingCaseCount = options.dataset.cases.length - sourceAvailableCaseCount;
  const tutor = semanticReplay === undefined
    ? new RecordedTutor(options.corpus)
    : new SemanticReplayTutor(options.corpus, semanticReplay.caseVersionMappings);
  const resumePlan = options.resumeEvaluation === undefined
    ? undefined
    : prepareTutorResponseCorpusResume({
        previousEvaluation: options.resumeEvaluation,
        corpus: options.corpus,
        dataset: options.dataset,
        selectedCases: selected.cases,
        selection: resolvedSelection.selection,
        ...(semanticReplay === undefined ? {} : { semanticReplay }),
        ...(options.judge === undefined ? {} : { judge: options.judge }),
      });
  if (resumePlan !== undefined) {
    options.onResume?.({ reusedCaseRunCount: resumePlan.reusedCaseRunCount });
  }
  const runOptions: RunTutorEvalOptions = {
    dataset: selected,
    tutor,
    tutorDescriptor: tutorDescriptor(options.corpus),
    runsPerCase: options.corpus.runsPerCase,
    runId: options.runId ?? `tutor-corpus-${options.corpus.corpusId}`,
    ...(options.now === undefined ? {} : { now: options.now }),
    ...(options.scoring === undefined ? {} : { scoring: options.scoring }),
    ...(options.judge === undefined ? {} : { judge: options.judge }),
    ...(resumePlan === undefined ? {} : { reusedCaseResults: resumePlan.reusableCaseResults }),
    ...(options.onJudgeCall === undefined ? {} : { onJudgeCall: options.onJudgeCall }),
  };
  const evaluation: TutorEvalRunResult = await runTutorEval(runOptions);
  return {
    schemaVersion: 1,
    corpusId: options.corpus.corpusId,
    corpusVersion: options.corpus.corpusVersion,
    datasetId: options.dataset.id,
    datasetVersion: options.dataset.version,
    coverage: options.corpus.coverage,
    selectedCaseCount: selected.cases.length,
    availableResponseCount: options.corpus.responses.length,
    missingCaseCount,
    evaluationSelection: resolvedSelection.selection,
    ...(semanticReplay === undefined
      ? {}
      : { semanticReplay: toTutorResponseCorpusSemanticReplay(semanticReplay) }),
    ...(options.corpus.generationSpec === undefined
      ? {}
      : { generationSpec: options.corpus.generationSpec }),
    tutor: options.corpus.tutor,
    evaluation,
  };
}
