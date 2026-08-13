import {
  assertValidTutorResponseCorpus,
  type TutorEvalDataset,
  type TutorEvalRunResult,
  type TutorResponseCorpus,
  type TutorResponseCorpusEvaluationResult,
} from "../contracts/index.js";
import { RecordedTutor } from "../adapters/recorded-tutor.js";
import {
  runTutorEval,
  type RunTutorEvalOptions,
  type TutorEvalJudgeRunOptions,
  type TutorEvalTutorOptions,
} from "./tutor-eval-runner.js";

export interface RunTutorResponseCorpusOptions {
  readonly corpus: TutorResponseCorpus;
  readonly dataset: TutorEvalDataset;
  readonly requireFull?: boolean;
  readonly judge?: TutorEvalJudgeRunOptions;
  readonly runId?: string;
  readonly now?: () => Date;
  readonly scoring?: RunTutorEvalOptions["scoring"];
}

function selectedDataset(
  dataset: TutorEvalDataset,
  corpus: TutorResponseCorpus,
): TutorEvalDataset {
  const selectedCaseIds = new Set(corpus.responses.map((response) => response.caseId));
  return {
    id: dataset.id,
    version: dataset.version,
    cases: dataset.cases.filter((tutorEvalCase) => selectedCaseIds.has(tutorEvalCase.id)),
  };
}

function tutorDescriptor(corpus: TutorResponseCorpus): TutorEvalTutorOptions {
  return corpus.tutor;
}

export async function runTutorResponseCorpus(
  options: RunTutorResponseCorpusOptions,
): Promise<TutorResponseCorpusEvaluationResult> {
  assertValidTutorResponseCorpus({
    corpus: options.corpus,
    dataset: options.dataset,
    ...(options.requireFull === undefined ? {} : { requireFull: options.requireFull }),
  });
  const selected = selectedDataset(options.dataset, options.corpus);
  const missingCaseCount = options.dataset.cases.length - selected.cases.length;
  const tutor = new RecordedTutor(options.corpus);
  const runOptions: RunTutorEvalOptions = {
    dataset: selected,
    tutor,
    tutorDescriptor: tutorDescriptor(options.corpus),
    runsPerCase: options.corpus.runsPerCase,
    runId: options.runId ?? `tutor-corpus-${options.corpus.corpusId}`,
    ...(options.now === undefined ? {} : { now: options.now }),
    ...(options.scoring === undefined ? {} : { scoring: options.scoring }),
    ...(options.judge === undefined ? {} : { judge: options.judge }),
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
    ...(options.corpus.generationSpec === undefined
      ? {}
      : { generationSpec: options.corpus.generationSpec }),
    tutor: options.corpus.tutor,
    evaluation,
  };
}
