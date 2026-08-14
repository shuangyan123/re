import { randomUUID } from "node:crypto";

import {
  BenchmarkConfigurationError,
  BenchmarkRunnerError,
  isTutorTurnOutput,
  TUTOR_EVAL_DATASET_ID,
  TUTOR_EVAL_DATASET_VERSION,
  TUTOR_EVAL_EVALUATOR_VERSION,
  parseTutorEvalDataset,
  type TutorEvalCase,
  type TutorEvalDataset,
  type TutorEvalRunResult,
  type TutorEvalCaseRunResult,
  type TutorEvalCriticalFailure,
  type TutorEvalJudgeDescriptor,
  type TutorEvalTutorDescriptor,
  type TutorEvalRubricResult,
  type TutorUnderTest,
  type TutorEvalJudge,
  partitionTutorEvalRubrics,
  toTutorTurnInput,
} from "../contracts/index.js";
import {
  aggregateTutorEvalCategoryScores,
  aggregateTutorEvalOverallScore,
  aggregateTutorEvalRubrics,
  DEFAULT_TUTOR_EVAL_SCORING_CONFIG,
  type TutorEvalScoringConfig,
} from "../scoring/index.js";
import {
  evaluateTutorEvalRubrics,
  tutorEvalRubricResultHasAnswerLeak,
} from "../evaluators/index.js";
import { executeTutorEvalJudge } from "./tutor-eval-judge-execution.js";

export interface TutorEvalJudgeRunOptions extends TutorEvalJudgeDescriptor {
  readonly evaluate?: TutorEvalJudge["evaluate"];
  readonly evaluateWithMetrics?: TutorEvalJudge["evaluateWithMetrics"];
}

export interface RunTutorEvalOptions {
  readonly dataset: string | TutorEvalDataset | readonly TutorEvalCase[];
  readonly tutor: TutorUnderTest & {
    readonly descriptor?: TutorEvalTutorOptions;
  };
  readonly tutorDescriptor?: TutorEvalTutorOptions;
  readonly judge?: TutorEvalJudgeRunOptions;
  readonly runsPerCase?: number;
  readonly runId?: string;
  readonly now?: () => Date;
  readonly scoring?: TutorEvalScoringConfig;
  readonly datasetLoader?: (datasetId: string) => Promise<TutorEvalDataset>;
}

export interface TutorEvalTutorOptions {
  readonly provider: string;
  readonly model: string;
  readonly modelVersion?: string;
  readonly promptId?: string;
  readonly promptVersion: string;
  readonly temperature?: number;
  readonly reasoningEffort?: string;
  readonly seed?: number;
}

function stableDiagnostic(code: string, message: string) {
  return [{ code, message }] as const;
}

const failureSeverityRank = {
  minor: 1,
  major: 2,
  critical: 3,
} as const;

function deduplicateCriticalFailures(
  failures: readonly TutorEvalCriticalFailure[],
): TutorEvalCriticalFailure[] {
  const byType = new Map<string, TutorEvalCriticalFailure>();
  for (const failure of failures) {
    const existing = byType.get(failure.type);
    if (
      existing === undefined ||
      failureSeverityRank[failure.severity] > failureSeverityRank[existing.severity]
    ) {
      byType.set(failure.type, failure);
    }
  }
  return [...byType.values()];
}

function asTutorDescriptor(
  options: RunTutorEvalOptions,
): TutorEvalTutorDescriptor {
  return options.tutorDescriptor ?? options.tutor.descriptor ?? {
    provider: "synthetic",
    model: options.tutor.id,
    promptVersion: "unspecified",
  };
}

function asJudgeDescriptor(
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
    ...(judge.seed === undefined ? {} : { seed: judge.seed }),
  };
}

function assertDescriptor(
  descriptor: TutorEvalTutorDescriptor | TutorEvalJudgeDescriptor,
  errorCode: "tutor_eval_dataset_invalid" | "judge_result_invalid",
): void {
  if (
    typeof descriptor.provider !== "string" ||
    descriptor.provider.trim().length === 0 ||
    typeof descriptor.model !== "string" ||
    descriptor.model.trim().length === 0 ||
    typeof descriptor.promptVersion !== "string" ||
    descriptor.promptVersion.trim().length === 0 ||
    (descriptor.modelVersion !== undefined &&
      (typeof descriptor.modelVersion !== "string" ||
        descriptor.modelVersion.trim().length === 0)) ||
    (descriptor.promptId !== undefined &&
      (typeof descriptor.promptId !== "string" ||
        descriptor.promptId.trim().length === 0)) ||
    (descriptor.temperature !== undefined &&
      (typeof descriptor.temperature !== "number" ||
        !Number.isFinite(descriptor.temperature) ||
        descriptor.temperature < 0)) ||
    ("reasoningEffort" in descriptor &&
      descriptor.reasoningEffort !== undefined &&
      (typeof descriptor.reasoningEffort !== "string" ||
        descriptor.reasoningEffort.trim().length === 0)) ||
    (descriptor.seed !== undefined &&
      (typeof descriptor.seed !== "number" ||
        !Number.isInteger(descriptor.seed)))
  ) {
    throw new BenchmarkConfigurationError(errorCode);
  }
}

function validateRunOptions(options: RunTutorEvalOptions): number {
  if (
    typeof options.tutor !== "object" ||
    options.tutor === null ||
    typeof options.tutor.respond !== "function" ||
    typeof options.tutor.id !== "string" ||
    options.tutor.id.trim().length === 0
  ) {
    throw new BenchmarkRunnerError();
  }
  const runsPerCase = options.runsPerCase ?? 1;
  if (!Number.isInteger(runsPerCase) || runsPerCase < 1) {
    throw new BenchmarkConfigurationError("tutor_eval_dataset_invalid");
  }
  if (
    options.judge !== undefined &&
    options.judge.evaluate === undefined &&
    options.judge.evaluateWithMetrics === undefined
  ) {
    throw new BenchmarkConfigurationError("judge_result_invalid");
  }
  assertDescriptor(asTutorDescriptor(options), "tutor_eval_dataset_invalid");
  if (options.judge !== undefined) {
    assertDescriptor(asJudgeDescriptor(options.judge)!, "judge_result_invalid");
  }
  return runsPerCase;
}

async function resolveDataset(
  dataset: RunTutorEvalOptions["dataset"],
  datasetLoader: RunTutorEvalOptions["datasetLoader"],
): Promise<TutorEvalDataset> {
  if (typeof dataset === "string") {
    if (datasetLoader === undefined) {
      throw new BenchmarkConfigurationError("tutor_eval_dataset_invalid");
    }
    try {
      return parseTutorEvalDataset(await datasetLoader(dataset));
    } catch (error) {
      if (error instanceof BenchmarkConfigurationError) {
        throw error;
      }
      throw new BenchmarkConfigurationError("tutor_eval_dataset_invalid");
    }
  }
  if (Array.isArray(dataset)) {
    return parseTutorEvalDataset({
      id: TUTOR_EVAL_DATASET_ID,
      version: TUTOR_EVAL_DATASET_VERSION,
      cases: dataset,
    });
  }
  return parseTutorEvalDataset(dataset);
}

type TutorEvalCaseRubric = TutorEvalCase["evaluatorOnly"]["rubrics"][number];

function emptyCategoryScores() {
  return {
    correctness: null,
    diagnosis: null,
    guidance: null,
    adaptation: null,
    actionability: null,
  } as const;
}

function tutorAdapterErrorResult(
  tutorEvalCase: TutorEvalCase,
  runIndex: number,
  started: number,
  rawTutorResponse: string | null,
  message = "Tutor adapter failed for this case.",
): TutorEvalCaseRunResult {
  return {
    caseId: tutorEvalCase.id,
    caseVersion: tutorEvalCase.version,
    runIndex,
    status: "error",
    passed: false,
    rawTutorResponse,
    rawJudgeResult: null,
    judgeMetrics: null,
    rubricResults: [],
    categoryScores: emptyCategoryScores(),
    overallScore: null,
    qualityGate: "FAIL",
    criticalFailures: [],
    answerLeakage: false,
    latencyMs: Math.round(performance.now() - started),
    tokenUsage: null,
    cost: null,
    diagnostics: stableDiagnostic(
      "adapter_failed",
      message,
    ),
  };
}

function mergeRubricResults(
  rubrics: readonly TutorEvalCaseRubric[],
  results: readonly TutorEvalRubricResult[],
): TutorEvalRubricResult[] {
  const byId = new Map(results.map((result) => [result.rubricId, result]));
  return rubrics.flatMap((rubric) => {
    const result = byId.get(rubric.id);
    return result === undefined ? [] : [result];
  });
}

function deterministicCriticalFailures(
  rubrics: readonly TutorEvalCaseRubric[],
  results: readonly TutorEvalRubricResult[],
): TutorEvalCriticalFailure[] {
  const byId = new Map(results.map((result) => [result.rubricId, result]));
  const failures: TutorEvalCriticalFailure[] = [];
  for (const rubric of rubrics) {
    const result = byId.get(rubric.id);
    if (
      result?.result === "FAIL" &&
      rubric.criticalFailure !== undefined
    ) {
      failures.push({
        type: rubric.criticalFailure.type,
        severity: rubric.criticalFailure.severity,
        evidence:
          result.diagnostics[0]?.message ?? `Rubric ${rubric.id} failed.`,
      });
    }
  }
  return failures;
}

async function runCase(
  tutor: TutorUnderTest,
  tutorEvalCase: TutorEvalCase,
  runIndex: number,
  judge: TutorEvalJudgeRunOptions | undefined,
  scoring: TutorEvalScoringConfig,
): Promise<TutorEvalCaseRunResult> {
  const started = performance.now();
  let output: Awaited<ReturnType<TutorUnderTest["respond"]>>;
  try {
    output = await tutor.respond(toTutorTurnInput(tutorEvalCase, runIndex));
  } catch {
    return tutorAdapterErrorResult(tutorEvalCase, runIndex, started, null);
  }
  if (!isTutorTurnOutput(output)) {
    return tutorAdapterErrorResult(
      tutorEvalCase,
      runIndex,
      started,
      null,
      "Tutor adapter returned an invalid response.",
    );
  }

  const rawTutorResponse = output.text;
  const { deterministicRubrics, judgeRubrics } =
    partitionTutorEvalRubrics(tutorEvalCase);
  const deterministicResults = [...evaluateTutorEvalRubrics(tutorEvalCase, output)];
  const judgeExecution = await executeTutorEvalJudge(
    tutorEvalCase,
    output.text,
    judgeRubrics,
    judge,
  );
  const judgeFailure = judgeExecution.failure;

  const rubricResults = mergeRubricResults(tutorEvalCase.evaluatorOnly.rubrics, [
    ...deterministicResults,
    ...judgeExecution.rubricResults,
  ]);
  const criticalFailures = deduplicateCriticalFailures([
    ...deterministicCriticalFailures(deterministicRubrics, deterministicResults),
    ...judgeExecution.criticalFailures,
  ]);
  const aggregate = aggregateTutorEvalRubrics(
    tutorEvalCase.evaluatorOnly.rubrics,
    rubricResults,
    criticalFailures,
    scoring,
  );
  const hasError =
    judgeFailure !== null || rubricResults.some((result) => result.result === "ERROR");
  const latencyMs =
    output.metrics?.latencyMs ?? Math.round(performance.now() - started);
  return {
    caseId: tutorEvalCase.id,
    caseVersion: tutorEvalCase.version,
    runIndex,
    status: hasError ? "error" : aggregate.passed ? "passed" : "failed",
    passed: !hasError && aggregate.passed,
    rawTutorResponse,
    rawJudgeResult: judgeExecution.rawJudgeResult,
    judgeMetrics: judgeExecution.metrics,
    rubricResults,
    categoryScores: aggregate.categoryScores,
    overallScore: hasError ? null : aggregate.overallScore,
    qualityGate: aggregate.qualityGate,
    criticalFailures,
    answerLeakage:
      rubricResults.some(tutorEvalRubricResultHasAnswerLeak) ||
      criticalFailures.some((failure) => failure.type === "answer_leakage"),
    latencyMs,
    tokenUsage: output.metrics?.tokenUsage ?? null,
    cost: output.metrics?.cost ?? null,
    diagnostics:
      judgeFailure !== null
        ? stableDiagnostic(judgeFailure.code, judgeFailure.message)
        : hasError
          ? stableDiagnostic(
              "evaluation_failed",
              "One or more rubrics could not be evaluated.",
            )
          : [],
  };
}

export async function runTutorEval(
  options: RunTutorEvalOptions,
): Promise<TutorEvalRunResult> {
  const runsPerCase = validateRunOptions(options);
  const dataset = await resolveDataset(options.dataset, options.datasetLoader);
  const now = options.now ?? (() => new Date());
  const startedAtDate = now();
  const startedAt = startedAtDate.toISOString();
  const orderedCases = [...dataset.cases].sort((left, right) =>
    left.id < right.id ? -1 : left.id > right.id ? 1 : 0,
  );
  const scoring = options.scoring ?? DEFAULT_TUTOR_EVAL_SCORING_CONFIG;
  const caseResults: TutorEvalCaseRunResult[] = [];
  for (const tutorEvalCase of orderedCases) {
    for (let runIndex = 1; runIndex <= runsPerCase; runIndex += 1) {
      caseResults.push(
        await runCase(options.tutor, tutorEvalCase, runIndex, options.judge, scoring),
      );
    }
  }
  const aggregates = caseResults
    .filter((result) => result.overallScore !== null)
    .map((result) => ({
      categoryScores: result.categoryScores,
      overallScore: result.overallScore,
      qualityGate: result.qualityGate,
      passed: result.passed,
    }));
  const hasEvaluationErrors = caseResults.some((result) => result.status === "error");
  const categoryScores = hasEvaluationErrors
    ? emptyCategoryScores()
    : aggregateTutorEvalCategoryScores(aggregates);
  const overallScore = hasEvaluationErrors
    ? null
    : aggregateTutorEvalOverallScore(
        caseResults.map((result) => result.overallScore),
      );
  const failureCount = caseResults.filter((result) => result.criticalFailures.length > 0).length;
  const leakageCount = caseResults.filter((result) => result.answerLeakage).length;
  const finishedAtDate = now();
  const finishedAt = finishedAtDate.toISOString();
  return {
    schemaVersion: 1,
    runId: options.runId ?? randomUUID(),
    createdAt: startedAt,
    startedAt,
    finishedAt,
    durationMs: Math.max(0, finishedAtDate.getTime() - startedAtDate.getTime()),
    datasetId: dataset.id,
    datasetVersion: dataset.version,
    evaluatorVersion: TUTOR_EVAL_EVALUATOR_VERSION,
    tutor: asTutorDescriptor(options),
    judge: asJudgeDescriptor(options.judge),
    runsPerCase,
    caseCount: orderedCases.length,
    caseRunCount: caseResults.length,
    passedCount: caseResults.filter((result) => result.status === "passed").length,
    failedCount: caseResults.filter((result) => result.status === "failed").length,
    errorCount: caseResults.filter((result) => result.status === "error").length,
    categoryScores,
    overallScore,
    criticalFailureRate:
      caseResults.length === 0 ? 0 : failureCount / caseResults.length,
    answerLeakageRate:
      caseResults.length === 0 ? 0 : leakageCount / caseResults.length,
    caseResults,
  };
}
