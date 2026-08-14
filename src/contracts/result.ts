import type {
  TutorEvalJudgeResult,
} from "./tutor-eval-judge.js";
import type {
  TutorCriticalFailureSeverity,
  TutorCriticalFailure,
  TutorEvalCategory,
} from "./tutor-eval.js";

export const RESULT_SCHEMA_VERSION = 1 as const;
export const TUTOR_EVAL_RESULT_SCHEMA_VERSION = 1 as const;

export type ScenarioResultStatus = "passed" | "failed" | "error";

export interface BenchmarkDiagnostic {
  readonly code: string;
  readonly message: string;
}

export interface CriterionResult {
  readonly criterionId: string;
  readonly evaluatorId: string;
  readonly status: ScenarioResultStatus;
  readonly score: number | null;
  readonly passed: boolean;
  readonly diagnostics: readonly BenchmarkDiagnostic[];
}

export interface ScenarioResult {
  readonly scenarioId: string;
  readonly rubricId: string;
  readonly status: ScenarioResultStatus;
  readonly score: number | null;
  readonly passed: boolean;
  readonly turnCount: number;
  readonly criterionResults: readonly CriterionResult[];
  readonly diagnostics: readonly BenchmarkDiagnostic[];
}

export interface BenchmarkRunResult {
  readonly schemaVersion: typeof RESULT_SCHEMA_VERSION;
  readonly runId: string;
  readonly timestamp: string;
  readonly startedAt: string;
  readonly finishedAt: string;
  readonly durationMs: number;
  readonly tutorId: string;
  readonly scenarioCount: number;
  readonly passedCount: number;
  readonly failedCount: number;
  readonly errorCount: number;
  readonly totalScore: number;
  readonly scenarioResults: readonly ScenarioResult[];
}

export type TutorEvalRubricResultStatus = "PASS" | "PARTIAL" | "FAIL" | "ERROR";
export type TutorEvalQualityGate = "PASS" | "FAIL";

export interface TutorEvalDiagnostic {
  readonly code: string;
  readonly message: string;
}

export interface TutorEvalCriticalFailure {
  readonly type: TutorCriticalFailure;
  readonly severity: TutorCriticalFailureSeverity;
  readonly evidence: string;
}

export interface TutorEvalRubricResult {
  readonly rubricId: string;
  readonly category: TutorEvalCategory;
  readonly result: TutorEvalRubricResultStatus;
  readonly score: number | null;
  readonly weight: number;
  readonly critical: boolean;
  readonly diagnostics: readonly TutorEvalDiagnostic[];
}

export type TutorEvalCategoryScores = Readonly<
  Record<TutorEvalCategory, number | null>
>;

export interface TutorEvalTokenUsage {
  readonly inputTokens?: number;
  readonly outputTokens?: number;
  readonly totalTokens?: number;
}

/** Sanitized telemetry for one provider-independent Judge execution. */
export interface TutorEvalJudgeMetrics {
  readonly latencyMs: number;
  readonly tokenUsage: TutorEvalTokenUsage | null;
  /** Cost is null until a trustworthy provider-reported value is available. */
  readonly cost: number | null;
  readonly attempts: number;
}

export interface TutorEvalTutorDescriptor {
  readonly provider: string;
  readonly model: string;
  readonly modelVersion?: string;
  readonly promptId?: string;
  readonly promptVersion: string;
  readonly temperature?: number;
  readonly reasoningEffort?: string;
  readonly seed?: number;
}

export interface TutorEvalJudgeDescriptor {
  readonly provider: string;
  readonly model: string;
  readonly modelVersion?: string;
  readonly promptId?: string;
  readonly promptVersion: string;
  readonly temperature?: number;
  readonly reasoningEffort?: string;
  /** Optional extension; populated by providers that expose thinking mode. */
  readonly thinkingMode?: "enabled" | "disabled";
  /** Optional extension; populated when the provider request has an output cap. */
  readonly maxOutputTokens?: number;
  readonly seed?: number;
}

export interface TutorEvalCaseRunResult {
  readonly caseId: string;
  readonly caseVersion: string;
  readonly runIndex: number;
  readonly status: "passed" | "failed" | "error";
  readonly passed: boolean;
  readonly rawTutorResponse: string | null;
  readonly rawJudgeResult: TutorEvalJudgeResult | null;
  /** Optional for v1 result compatibility; populated for provider executions. */
  readonly judgeMetrics?: TutorEvalJudgeMetrics | null;
  readonly rubricResults: readonly TutorEvalRubricResult[];
  readonly categoryScores: TutorEvalCategoryScores;
  readonly overallScore: number | null;
  readonly qualityGate: TutorEvalQualityGate;
  readonly criticalFailures: readonly TutorEvalCriticalFailure[];
  readonly answerLeakage: boolean;
  readonly latencyMs: number | null;
  readonly tokenUsage: TutorEvalTokenUsage | null;
  readonly cost: number | null;
  readonly diagnostics: readonly TutorEvalDiagnostic[];
}

export interface TutorEvalRunResult {
  readonly schemaVersion: typeof TUTOR_EVAL_RESULT_SCHEMA_VERSION;
  readonly runId: string;
  readonly createdAt: string;
  readonly startedAt: string;
  readonly finishedAt: string;
  readonly durationMs: number;
  readonly datasetId: string;
  readonly datasetVersion: string;
  /** Optional for v1 result compatibility; present for versioned evaluator runs. */
  readonly evaluatorVersion?: string;
  readonly tutor: TutorEvalTutorDescriptor;
  readonly judge: TutorEvalJudgeDescriptor | null;
  readonly runsPerCase: number;
  readonly caseCount: number;
  readonly caseRunCount: number;
  readonly passedCount: number;
  readonly failedCount: number;
  readonly errorCount: number;
  readonly categoryScores: TutorEvalCategoryScores;
  readonly overallScore: number | null;
  readonly criticalFailureRate: number;
  readonly answerLeakageRate: number;
  readonly caseResults: readonly TutorEvalCaseRunResult[];
}
