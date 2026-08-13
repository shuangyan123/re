import {
  BenchmarkConfigurationError,
  buildTutorEvalJudgeInput,
  parseTutorEvalJudgeResult,
  type TutorEvalCase,
  type TutorEvalJudge,
  type TutorEvalJudgeFailureCode,
  type TutorEvalJudgeResult,
  type TutorEvalCriticalFailure,
  type TutorEvalRubric,
  type TutorEvalRubricResult,
} from "../contracts/index.js";

export interface TutorEvalJudgeFailureDiagnostic {
  readonly code: TutorEvalJudgeFailureCode;
  readonly message: string;
}

export interface TutorEvalJudgeExecution {
  readonly rawJudgeResult: TutorEvalJudgeResult | null;
  readonly rubricResults: readonly TutorEvalRubricResult[];
  readonly criticalFailures: readonly TutorEvalCriticalFailure[];
  readonly failure: TutorEvalJudgeFailureDiagnostic | null;
}

const judgeFailureMessages: Readonly<Record<TutorEvalJudgeFailureCode, string>> = {
  judge_unavailable:
    "This case contains Judge rubrics, but no Judge executor was configured.",
  judge_result_invalid: "Judge output failed schema or contract validation.",
  judge_timeout: "Judge execution timed out before a valid result was returned.",
  judge_transport_error: "Judge execution failed before a valid result was returned.",
  judge_rubric_missing: "Judge output omitted one or more requested Judge rubrics.",
  judge_rubric_unexpected:
    "Judge output returned a rubric outside the requested Judge rubric set.",
};

class TutorEvalJudgeFailure extends Error {
  readonly code: TutorEvalJudgeFailureCode;

  constructor(code: TutorEvalJudgeFailureCode) {
    super(judgeFailureMessages[code]);
    this.name = "TutorEvalJudgeFailure";
    this.code = code;
  }
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
      throw new TutorEvalJudgeFailure("judge_result_invalid");
    }
    throw error;
  }
  if (result.caseId !== tutorEvalCase.id) {
    throw new TutorEvalJudgeFailure("judge_result_invalid");
  }
  const requestedRubricIds = new Set(judgeRubrics.map((rubric) => rubric.id));
  if (
    result.rubricResults.some(
      (rubricResult) => !requestedRubricIds.has(rubricResult.rubricId),
    )
  ) {
    throw new TutorEvalJudgeFailure("judge_rubric_unexpected");
  }
  if (result.rubricResults.length !== requestedRubricIds.size) {
    throw new TutorEvalJudgeFailure("judge_rubric_missing");
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
      throw new TutorEvalJudgeFailure("judge_rubric_missing");
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
  if (error instanceof TutorEvalJudgeFailure) {
    return { code: error.code, message: judgeFailureMessages[error.code] };
  }
  if (
    error instanceof BenchmarkConfigurationError &&
    error.code === "judge_result_invalid"
  ) {
    return {
      code: "judge_result_invalid",
      message: judgeFailureMessages.judge_result_invalid,
    };
  }
  if (
    error instanceof Error &&
    (error.name === "AbortError" || error.name === "TimeoutError")
  ) {
    return { code: "judge_timeout", message: judgeFailureMessages.judge_timeout };
  }
  return {
    code: "judge_transport_error",
    message: judgeFailureMessages.judge_transport_error,
  };
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
  judge: { readonly evaluate?: TutorEvalJudge["evaluate"] } | undefined,
): Promise<TutorEvalJudgeExecution> {
  if (judgeRubrics.length === 0) {
    return {
      rawJudgeResult: null,
      rubricResults: [],
      criticalFailures: [],
      failure: null,
    };
  }

  if (judge?.evaluate === undefined) {
    const failure: TutorEvalJudgeFailureDiagnostic = {
      code: "judge_unavailable",
      message: judgeFailureMessages.judge_unavailable,
    };
    return {
      rawJudgeResult: null,
      rubricResults: unresolvedJudgeRubricResults(judgeRubrics, failure),
      criticalFailures: [],
      failure,
    };
  }

  try {
    const result = normalizeJudgeResult(
      tutorEvalCase,
      judgeRubrics,
      await judge.evaluate(buildTutorEvalJudgeInput(tutorEvalCase, tutorResponse)),
    );
    return {
      rawJudgeResult: result,
      rubricResults: judgeRubricResults(judgeRubrics, result),
      criticalFailures: judgeCriticalFailures(result),
      failure: null,
    };
  } catch (error) {
    const failure = judgeFailureFromError(error);
    return {
      rawJudgeResult: null,
      rubricResults: unresolvedJudgeRubricResults(judgeRubrics, failure),
      criticalFailures: [],
      failure,
    };
  }
}
