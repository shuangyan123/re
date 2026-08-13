import {
  TUTOR_EVAL_DATASET_ID,
  type TutorEvalCase,
  type TutorEvalDataset,
  type TutorEvalRunResult,
} from "../contracts/index.js";
import { loadTutorEvalDataset } from "../datasets/index.js";
import {
  runTutorEval,
  type RunTutorEvalOptions,
} from "./tutor-eval-runner.js";

/**
 * The small local-evaluation entry point. Advanced generation and corpus
 * controls remain available through their explicit modules instead of being
 * required for the first direct Tutor run.
 */
export type RunTutorBenchmarkOptions = Omit<RunTutorEvalOptions, "dataset"> & {
  readonly dataset?: string | TutorEvalDataset | readonly TutorEvalCase[];
};

function defaultTutorDescriptor(
  tutor: RunTutorEvalOptions["tutor"],
): NonNullable<RunTutorEvalOptions["tutorDescriptor"]> {
  return (
    tutor.descriptor ?? {
      provider: "custom",
      model: tutor.id,
      promptVersion: "unspecified",
    }
  );
}

/**
 * Runs the canonical TutorEval dataset with a direct TutorUnderTest.
 *
 * A caller may provide an inline dataset, a dataset loader, a Judge, or the
 * same run controls as `runTutorEval`. With no dataset, the current canonical
 * dataset is selected and loaded from the repository/package assets.
 */
export async function runTutorBenchmark(
  options: RunTutorBenchmarkOptions,
): Promise<TutorEvalRunResult> {
  const runOptions: RunTutorEvalOptions = {
    dataset: options.dataset ?? TUTOR_EVAL_DATASET_ID,
    datasetLoader: options.datasetLoader ?? loadTutorEvalDataset,
    tutor: options.tutor,
    tutorDescriptor:
      options.tutorDescriptor ?? defaultTutorDescriptor(options.tutor),
    ...(options.judge === undefined ? {} : { judge: options.judge }),
    ...(options.runsPerCase === undefined
      ? {}
      : { runsPerCase: options.runsPerCase }),
    ...(options.runId === undefined ? {} : { runId: options.runId }),
    ...(options.now === undefined ? {} : { now: options.now }),
    ...(options.scoring === undefined ? {} : { scoring: options.scoring }),
  };
  return runTutorEval(runOptions);
}
