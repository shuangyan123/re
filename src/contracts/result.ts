export const RESULT_SCHEMA_VERSION = 1 as const;

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
