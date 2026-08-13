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

export const TUTOR_EVAL_JUDGE_SCHEMA_VERSION = 1 as const;

export type TutorEvalJudgeRubricStatus = "PASS" | "PARTIAL" | "FAIL";

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
}

export type TutorEvalJudgeFailureCode =
  | "judge_unavailable"
  | "judge_result_invalid"
  | "judge_timeout"
  | "judge_transport_error"
  | "judge_rubric_missing"
  | "judge_rubric_unexpected";

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
