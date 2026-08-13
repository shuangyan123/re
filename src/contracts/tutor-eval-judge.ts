import type {
  TutorCriticalFailure,
  TutorCriticalFailureSeverity,
  TutorEvalCase,
  TutorEvalCategory,
} from "./tutor-eval.js";
import type {
  TutorEvalRubricApplicability,
  TutorEvalRubricBehavior,
  TutorEvalRubricFailure,
} from "./rubric.js";
import type { TutorEvalCapabilityTag } from "./tutor-eval-taxonomy.js";
import type { TutorEvalJudgeMetrics } from "./result.js";

export const TUTOR_EVAL_JUDGE_SCHEMA_VERSION = 1 as const;

export type TutorEvalJudgeRubricStatus = "PASS" | "PARTIAL" | "FAIL";

export const TUTOR_EVAL_JUDGE_RUBRIC_STATUSES: readonly TutorEvalJudgeRubricStatus[] = [
  "PASS",
  "PARTIAL",
  "FAIL",
] as const;

export const TUTOR_EVAL_JUDGE_FAILURE_MESSAGES: Readonly<
  Record<TutorEvalJudgeFailureCode, string>
> = {
  judge_unavailable:
    "This case contains Judge rubrics, but no Judge executor was configured.",
  judge_result_invalid: "Judge output failed schema or contract validation.",
  judge_timeout: "Judge execution timed out before a valid result was returned.",
  judge_transport_error: "Judge execution failed before a valid result was returned.",
  judge_rubric_missing: "Judge output omitted one or more requested Judge rubrics.",
  judge_rubric_unexpected:
    "Judge output returned a rubric outside the requested Judge rubric set.",
};

export interface TutorEvalJudgeInput {
  readonly caseId: string;
  readonly learningObjective: string;
  readonly studentProfile: string;
  readonly conversationHistory: string;
  readonly studentMessage: string;
  readonly problemContext: string;
  readonly groundTruth: string;
  readonly knownMisconception: string;
  readonly disclosurePolicy: TutorEvalCase["evaluatorOnly"]["disclosurePolicy"];
  /** Only the Judge-owned rubric subset for this case-scoped request. */
  readonly rubrics: readonly {
    readonly id: string;
    readonly category: TutorEvalCategory;
    readonly criterion: string;
    readonly weight: number;
    readonly applicability?: TutorEvalRubricApplicability;
    readonly behavior?: TutorEvalRubricBehavior;
    readonly capabilityTag?: TutorEvalCapabilityTag;
    readonly critical?: boolean;
    readonly criticalFailure?: TutorEvalRubricFailure;
  }[];
  readonly tutorResponse: string;
}

/**
 * Provider-independent execution boundary. A provider adapter owns transport,
 * retries, and response sanitization; the core runner receives only the
 * returned value and validates it against the Judge result contract.
 */
export interface TutorEvalJudge {
  evaluate(input: TutorEvalJudgeInput): Promise<unknown>;
  /** Optional telemetry-aware path; legacy injected Judges may use evaluate(). */
  evaluateWithMetrics?(
    input: TutorEvalJudgeInput,
  ): Promise<TutorEvalJudgeEvaluation>;
}

/** Keeps sanitized execution telemetry separate from the validated Judge result. */
export interface TutorEvalJudgeEvaluation {
  readonly result: unknown;
  readonly metrics?: TutorEvalJudgeMetrics | null;
}

export type TutorEvalJudgeFailureCode =
  | "judge_unavailable"
  | "judge_result_invalid"
  | "judge_timeout"
  | "judge_transport_error"
  | "judge_rubric_missing"
  | "judge_rubric_unexpected";

export class TutorEvalJudgeExecutionError extends Error {
  readonly code: TutorEvalJudgeFailureCode;
  readonly metrics?: TutorEvalJudgeMetrics;

  constructor(
    code: TutorEvalJudgeFailureCode,
    metrics?: TutorEvalJudgeMetrics,
  ) {
    super(TUTOR_EVAL_JUDGE_FAILURE_MESSAGES[code]);
    this.name = "TutorEvalJudgeExecutionError";
    this.code = code;
    if (metrics !== undefined) {
      this.metrics = metrics;
    }
  }
}

export interface TutorEvalJudgeRubricResult {
  readonly rubricId: string;
  readonly result: TutorEvalJudgeRubricStatus;
  readonly evidence?: string;
}

export interface TutorEvalJudgeCriticalFailure {
  readonly type: TutorCriticalFailure;
  readonly severity: TutorCriticalFailureSeverity;
  readonly evidence: string;
}

export interface TutorEvalJudgeFactualError {
  readonly description: string;
  readonly severity: TutorCriticalFailureSeverity;
}

export interface TutorEvalJudgeResult {
  readonly schemaVersion: typeof TUTOR_EVAL_JUDGE_SCHEMA_VERSION;
  readonly caseId: string;
  /** Complete result set for the Judge rubric subset requested for this case. */
  readonly rubricResults: readonly TutorEvalJudgeRubricResult[];
  readonly criticalFailures: readonly TutorEvalJudgeCriticalFailure[];
  readonly factualErrors: readonly TutorEvalJudgeFactualError[];
  readonly insufficientInformation: boolean;
}

/** Short aliases matching the public TutorEval design vocabulary. */
export type TutorJudgeResult = TutorEvalJudgeResult;
export type TutorJudgeRubricResult = TutorEvalJudgeRubricResult;
