import {
  BenchmarkConfigurationError,
  buildTutorEvalJudgeInput,
  parseTutorEvalJudgeResult,
  TUTOR_EVAL_JUDGE_FAILURE_MESSAGES,
  type TutorEvalCase,
  type TutorEvalJudge,
  type TutorEvalJudgeEvaluation,
  type TutorEvalJudgeMetrics,
  type TutorEvalJudgeFailureCode,
  type TutorEvalJudgeResult,
  type TutorEvalCriticalFailure,
  type TutorEvalRubric,
  type TutorEvalRubricResult,
  TutorEvalJudgeExecutionError,
} from "../contracts/index.js";

export interface TutorEvalJudgeFailureDiagnostic {
  readonly code: TutorEvalJudgeFailureCode;
  readonly message: string;
}

export interface TutorEvalJudgeExecution {
  readonly rawJudgeResult: TutorEvalJudgeResult | null;
  readonly rubricResults: readonly TutorEvalRubricResult[];
  readonly criticalFailures: readonly TutorEvalCriticalFailure[];
  readonly metrics: TutorEvalJudgeMetrics | null;
  readonly failure: TutorEvalJudgeFailureDiagnostic | null;
}

function normalizeJudgeResult(
  tutorEvalCase: TutorEvalCase,
  judgeRubrics: readonly TutorEvalRubric[],
  value: unknown,
): TutorEvalJudgeResult {
  let result: TutorEvalJudgeResult;
  try {
    result = parseTutorEvalJudgeResult(value);
  } catch (error) {
    if (
      error instanceof BenchmarkConfigurationError &&
      error.code === "judge_result_invalid"
    ) {
      throw new TutorEvalJudgeExecutionError("judge_result_invalid");
    }
    throw error;
  }
  if (result.caseId !== tutorEvalCase.id) {
    throw new TutorEvalJudgeExecutionError("judge_result_invalid");
  }
  const requestedRubricIds = new Set(judgeRubrics.map((rubric) => rubric.id));
  if (
    result.rubricResults.some(
      (rubricResult) => !requestedRubricIds.has(rubricResult.rubricId),
    )
  ) {
    throw new TutorEvalJudgeExecutionError("judge_rubric_unexpected");
  }
  if (result.rubricResults.length !== requestedRubricIds.size) {
    throw new TutorEvalJudgeExecutionError("judge_rubric_missing");
  }
  return result;
}

function judgeRubricResults(
  judgeRubrics: readonly TutorEvalRubric[],
  result: TutorEvalJudgeResult,
): TutorEvalRubricResult[] {
  const byId = new Map(
    result.rubricResults.map((rubricResult) => [rubricResult.rubricId, rubricResult]),
  );
  return judgeRubrics.map((rubric) => {
    const judgeResult = byId.get(rubric.id);
    if (judgeResult === undefined) {
      throw new TutorEvalJudgeExecutionError("judge_rubric_missing");
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
          : [{ code: "judge_evidence", message: judgeResult.evidence }],
    };
  });
}

function unresolvedJudgeRubricResults(
  judgeRubrics: readonly TutorEvalRubric[],
  failure: TutorEvalJudgeFailureDiagnostic,
): TutorEvalRubricResult[] {
  return judgeRubrics.map((rubric) => ({
    rubricId: rubric.id,
    category: rubric.category,
    result: "ERROR",
    score: null,
    weight: rubric.weight,
    critical: rubric.critical ?? false,
    diagnostics: [{ code: failure.code, message: failure.message }],
  }));
}

function judgeFailureFromError(error: unknown): TutorEvalJudgeFailureDiagnostic {
  if (error instanceof TutorEvalJudgeExecutionError) {
    return {
      code: error.code,
      message: TUTOR_EVAL_JUDGE_FAILURE_MESSAGES[error.code],
    };
  }
  if (
    error instanceof BenchmarkConfigurationError &&
    error.code === "judge_result_invalid"
  ) {
    return {
      code: "judge_result_invalid",
      message: TUTOR_EVAL_JUDGE_FAILURE_MESSAGES.judge_result_invalid,
    };
  }
  if (
    error instanceof Error &&
    (error.name === "AbortError" || error.name === "TimeoutError")
  ) {
    return {
      code: "judge_timeout",
      message: TUTOR_EVAL_JUDGE_FAILURE_MESSAGES.judge_timeout,
    };
  }
  return {
    code: "judge_transport_error",
    message: TUTOR_EVAL_JUDGE_FAILURE_MESSAGES.judge_transport_error,
  };
}

function judgeMetricsFromError(error: unknown): TutorEvalJudgeMetrics | null {
  return error instanceof TutorEvalJudgeExecutionError
    ? error.metrics ?? null
    : null;
}

function judgeCriticalFailures(
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
  return failures;
}

export async function executeTutorEvalJudge(
  tutorEvalCase: TutorEvalCase,
  tutorResponse: string,
  judgeRubrics: readonly TutorEvalRubric[],
  judge:
    | {
        readonly evaluate?: TutorEvalJudge["evaluate"];
        readonly evaluateWithMetrics?: TutorEvalJudge["evaluateWithMetrics"];
      }
    | undefined,
  onJudgeCall?: () => void,
): Promise<TutorEvalJudgeExecution> {
  if (judgeRubrics.length === 0) {
    return {
      rawJudgeResult: null,
      rubricResults: [],
      criticalFailures: [],
      metrics: null,
      failure: null,
    };
  }

  const evaluate = judge?.evaluate;
  const evaluateWithMetrics = judge?.evaluateWithMetrics;
  if (evaluate === undefined && evaluateWithMetrics === undefined) {
    const failure: TutorEvalJudgeFailureDiagnostic = {
      code: "judge_unavailable",
      message: TUTOR_EVAL_JUDGE_FAILURE_MESSAGES.judge_unavailable,
    };
    return {
      rawJudgeResult: null,
      rubricResults: unresolvedJudgeRubricResults(judgeRubrics, failure),
      criticalFailures: [],
      metrics: null,
      failure,
    };
  }

  onJudgeCall?.();
  let evaluation: TutorEvalJudgeEvaluation | null = null;
  try {
    const input = buildTutorEvalJudgeInput(tutorEvalCase, tutorResponse);
    evaluation =
      evaluateWithMetrics === undefined
        ? { result: await evaluate!(input) }
        : await evaluateWithMetrics(input);
    const result = normalizeJudgeResult(
      tutorEvalCase,
      judgeRubrics,
      evaluation.result,
    );
    return {
      rawJudgeResult: result,
      rubricResults: judgeRubricResults(judgeRubrics, result),
      criticalFailures: judgeCriticalFailures(result),
      metrics: evaluation.metrics ?? null,
      failure: null,
    };
  } catch (error) {
    const failure = judgeFailureFromError(error);
    return {
      rawJudgeResult: null,
      rubricResults: unresolvedJudgeRubricResults(judgeRubrics, failure),
      criticalFailures: [],
      metrics: judgeMetricsFromError(error) ?? evaluation?.metrics ?? null,
      failure,
    };
  }
}
