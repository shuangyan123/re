import type {
  TutorCriticalFailure,
  TutorCriticalFailureSeverity,
  TutorEvalCase,
  TutorEvalCategory,
} from "./tutor-eval.js";
import type {
  TutorEvalRubricApplicability,
  TutorEvalRubricFailure,
} from "./rubric.js";

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
  readonly rubrics: readonly {
    readonly id: string;
    readonly category: TutorEvalCategory;
    readonly criterion: string;
    readonly weight: number;
    readonly applicability?: TutorEvalRubricApplicability;
    readonly critical?: boolean;
    readonly criticalFailure?: TutorEvalRubricFailure;
  }[];
  readonly tutorResponse: string;
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
  readonly rubricResults: readonly TutorEvalJudgeRubricResult[];
  readonly criticalFailures: readonly TutorEvalJudgeCriticalFailure[];
  readonly factualErrors: readonly TutorEvalJudgeFactualError[];
  readonly insufficientInformation: boolean;
}

/** Short aliases matching the public TutorEval design vocabulary. */
export type TutorJudgeResult = TutorEvalJudgeResult;
export type TutorJudgeRubricResult = TutorEvalJudgeRubricResult;
