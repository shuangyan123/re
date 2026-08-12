import { randomUUID } from "node:crypto";

import {
  BenchmarkConfigurationError,
  BenchmarkRunnerError,
  isTutorTurnOutput,
  TUTOR_EVAL_DATASET_ID,
  TUTOR_EVAL_DATASET_VERSION,
  parseTutorEvalDataset,
  type TutorEvalCase,
  type TutorEvalDataset,
  type TutorEvalJudgeResult,
  type TutorEvalRunResult,
  type TutorEvalCaseRunResult,
  type TutorEvalCriticalFailure,
  type TutorEvalJudgeDescriptor,
  type TutorEvalTutorDescriptor,
  type TutorEvalRubricResult,
  type TutorUnderTest,
  buildTutorEvalJudgeInput,
  parseTutorEvalJudgeResult,
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

export interface TutorEvalJudgeRunOptions extends TutorEvalJudgeDescriptor {
  readonly evaluate?: (
    input: import("../contracts/tutor-eval-judge.js").TutorEvalJudgeInput,
  ) => Promise<unknown>;
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
  if (options.judge?.evaluate === undefined && options.judge !== undefined) {
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

function normalizeJudgeResult(
  tutorEvalCase: TutorEvalCase,
  value: unknown,
): TutorEvalJudgeResult {
  const result = parseTutorEvalJudgeResult(value);
  if (result.caseId !== tutorEvalCase.id) {
    throw new BenchmarkConfigurationError("judge_result_invalid");
  }
  const rubricIds = new Set(
    tutorEvalCase.evaluatorOnly.rubrics.map((rubric) => rubric.id),
  );
  if (
    result.rubricResults.some((rubricResult) => !rubricIds.has(rubricResult.rubricId))
  ) {
    throw new BenchmarkConfigurationError("judge_result_invalid");
  }
  return result;
}

function judgeRubricResults(
  tutorEvalCase: TutorEvalCase,
  result: TutorEvalJudgeResult,
): TutorEvalRubricResult[] {
  const byId = new Map(result.rubricResults.map((rubricResult) => [rubricResult.rubricId, rubricResult]));
  return tutorEvalCase.evaluatorOnly.rubrics.map((rubric) => {
    const judgeResult = byId.get(rubric.id);
    if (judgeResult === undefined) {
      return {
        rubricId: rubric.id,
        category: rubric.category,
        result: "ERROR",
        score: null,
        weight: rubric.weight,
        critical: rubric.critical ?? false,
        diagnostics: stableDiagnostic(
          "judge_rubric_missing",
          "Judge result did not include this rubric.",
        ),
      };
    }
    return {
      rubricId: rubric.id,
      category: rubric.category,
      result: judgeResult.result,
      score:
        judgeResult.result === "PASS"
          ? 1
          : judgeResult.result === "PARTIAL"
            ? 0.5
            : 0,
      weight: rubric.weight,
      critical: rubric.critical ?? false,
      diagnostics:
        judgeResult.evidence === undefined
          ? []
          : stableDiagnostic("judge_evidence", judgeResult.evidence),
    };
  });
}

function judgeFailures(
  result: TutorEvalJudgeResult,
): TutorEvalCriticalFailure[] {
  const failures = result.criticalFailures.map((failure) => ({
    type: failure.type,
    severity: failure.severity,
    evidence: failure.evidence,
  }));
  for (const factualError of result.factualErrors) {
    if (
      (factualError.severity === "major" || factualError.severity === "critical") &&
      !failures.some(
        (failure) =>
          failure.type === "severe_factual_error" &&
          failure.evidence === factualError.description,
      )
    ) {
      failures.push({
        type: "severe_factual_error",
        severity: factualError.severity,
        evidence: factualError.description,
      });
    }
  }
  return deduplicateCriticalFailures(failures);
}

async function runCase(
  tutor: TutorUnderTest,
  tutorEvalCase: TutorEvalCase,
  runIndex: number,
  judge: TutorEvalJudgeRunOptions | undefined,
  scoring: TutorEvalScoringConfig,
): Promise<TutorEvalCaseRunResult> {
  const started = performance.now();
  let rawTutorResponse: string | null = null;
  try {
    const output = await tutor.respond(toTutorTurnInput(tutorEvalCase));
    if (!isTutorTurnOutput(output)) {
      return {
        caseId: tutorEvalCase.id,
        caseVersion: tutorEvalCase.version,
        runIndex,
        status: "error",
        passed: false,
        rawTutorResponse: null,
        rawJudgeResult: null,
        rubricResults: [],
        categoryScores: {
          correctness: null,
          diagnosis: null,
          guidance: null,
          adaptation: null,
          actionability: null,
        },
        overallScore: null,
        qualityGate: "FAIL",
        criticalFailures: [],
        answerLeakage: false,
        latencyMs: Math.round(performance.now() - started),
        tokenUsage: null,
        cost: null,
        diagnostics: stableDiagnostic(
          "adapter_failed",
          "Tutor adapter returned an invalid response.",
        ),
      };
    }
    rawTutorResponse = output.text;
    let rawJudgeResult: TutorEvalJudgeResult | null = null;
    let rubricResults: TutorEvalRubricResult[];
    let criticalFailures: TutorEvalCriticalFailure[] = [];
    if (judge?.evaluate !== undefined) {
      const judgeInput = buildTutorEvalJudgeInput(tutorEvalCase, output.text);
      rawJudgeResult = normalizeJudgeResult(
        tutorEvalCase,
        await judge.evaluate(judgeInput),
      );
      rubricResults = judgeRubricResults(tutorEvalCase, rawJudgeResult);
      criticalFailures = judgeFailures(rawJudgeResult);
    } else {
      rubricResults = [...evaluateTutorEvalRubrics(tutorEvalCase, output)];
      for (const rubric of tutorEvalCase.evaluatorOnly.rubrics) {
        const rubricResult = rubricResults.find((result) => result.rubricId === rubric.id);
        if (
          rubricResult !== undefined &&
          rubricResult.result === "FAIL" &&
          rubric.criticalFailure !== undefined
        ) {
          criticalFailures.push({
            type: rubric.criticalFailure.type,
            severity: rubric.criticalFailure.severity,
            evidence:
              rubricResult.diagnostics[0]?.message ??
              `Rubric ${rubric.id} failed.`,
          });
        }
      }
    }
    criticalFailures = deduplicateCriticalFailures(criticalFailures);
    const aggregate = aggregateTutorEvalRubrics(
      tutorEvalCase.evaluatorOnly.rubrics,
      rubricResults,
      criticalFailures,
      scoring,
    );
    const hasError = rubricResults.some((result) => result.result === "ERROR");
    const latencyMs =
      output.metrics?.latencyMs ?? Math.round(performance.now() - started);
    return {
      caseId: tutorEvalCase.id,
      caseVersion: tutorEvalCase.version,
      runIndex,
      status: hasError ? "error" : aggregate.passed ? "passed" : "failed",
      passed: !hasError && aggregate.passed,
      rawTutorResponse,
      rawJudgeResult,
      rubricResults,
      categoryScores: aggregate.categoryScores,
      overallScore: hasError ? null : aggregate.overallScore,
      qualityGate: hasError ? "FAIL" : aggregate.qualityGate,
      criticalFailures,
      answerLeakage:
        rubricResults.some(tutorEvalRubricResultHasAnswerLeak) ||
        criticalFailures.some((failure) => failure.type === "answer_leakage"),
      latencyMs,
      tokenUsage: output.metrics?.tokenUsage ?? null,
      cost: output.metrics?.cost ?? null,
      diagnostics: hasError ? stableDiagnostic("evaluation_failed", "One or more rubrics could not be evaluated.") : [],
    };
  } catch (error) {
    const code =
      error instanceof BenchmarkConfigurationError &&
      error.code === "judge_result_invalid"
        ? "judge_result_invalid"
        : "adapter_failed";
    return {
      caseId: tutorEvalCase.id,
      caseVersion: tutorEvalCase.version,
      runIndex,
      status: "error",
      passed: false,
      rawTutorResponse,
      rawJudgeResult: null,
      rubricResults: [],
      categoryScores: {
        correctness: null,
        diagnosis: null,
        guidance: null,
        adaptation: null,
        actionability: null,
      },
      overallScore: null,
      qualityGate: "FAIL",
      criticalFailures: [],
      answerLeakage: false,
      latencyMs: Math.round(performance.now() - started),
      tokenUsage: null,
      cost: null,
      diagnostics: stableDiagnostic(
        code,
        code === "judge_result_invalid"
          ? "Judge output failed schema validation."
          : "Tutor adapter failed for this case.",
      ),
    };
  }
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
  const categoryScores = aggregateTutorEvalCategoryScores(aggregates);
  const overallScore = aggregateTutorEvalOverallScore(
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
