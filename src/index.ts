/**
 * Stable package entry point for local and custom Tutor evaluation.
 * Advanced corpus, calibration, generation, and provider modules stay behind
 * their explicit internal paths so the default import surface stays small.
 */
export { loadTutorEvalDataset } from "./datasets/index.js";
export {
  TUTOR_EVAL_DATASET_ID,
  TUTOR_EVAL_DATASET_VERSION,
  TUTOR_EVAL_PREVIOUS_BILINGUAL_DATASET_VERSION,
  TUTOR_EVAL_PREVIOUS_DATASET_VERSION,
  TUTOR_EVAL_EVALUATOR_VERSION,
  TUTOR_EVAL_LEGACY_DATASET_ID,
  TUTOR_EVAL_LEGACY_DATASET_VERSION,
  TUTOR_CASE_LOCALES,
  DEFAULT_TUTOR_CASE_LOCALE,
  toTutorTurnInput,
} from "./contracts/index.js";
export { runTutorBenchmark, runTutorEval } from "./runner/index.js";
export { createHttpTutor } from "./adapters/http-tutor.js";

export type {
  StudentState,
  TutorConversationMessage,
  TutorMessageRole,
  TutorTokenUsage,
  TutorTurnInput,
  TutorTurnMetrics,
  TutorTurnOutput,
  TutorUnderTest,
} from "./contracts/tutor.js";
export type {
  TutorEvalCase,
  TutorEvalDataset,
} from "./contracts/tutor-eval.js";
export type { TutorCaseLocale } from "./contracts/locale.js";
export type { HttpTutorOptions } from "./adapters/http-tutor.js";
export type { TutorEvalRubric } from "./contracts/rubric.js";
export type {
  TutorEvalCaseRunResult,
  TutorEvalCategoryScores,
  TutorEvalCriticalFailure,
  TutorEvalRunResult,
  TutorEvalRubricResult,
} from "./contracts/result.js";
export type {
  RunTutorBenchmarkOptions,
} from "./runner/public-runner.js";
export type {
  RunTutorEvalOptions,
  TutorEvalJudgeRunOptions,
  TutorEvalTutorOptions,
} from "./runner/tutor-eval-runner.js";
