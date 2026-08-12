export type BenchmarkErrorCode =
  | "scenario_invalid"
  | "rubric_invalid"
  | "adapter_failed"
  | "evaluation_failed"
  | "runner_failed";

const stableMessages: Record<BenchmarkErrorCode, string> = {
  scenario_invalid: "Scenario configuration is invalid.",
  rubric_invalid: "Rubric configuration is invalid.",
  adapter_failed: "Tutor adapter failed for this scenario.",
  evaluation_failed: "Evaluator failed for this scenario.",
  runner_failed: "Benchmark runner failed.",
};

export class BenchmarkConfigurationError extends Error {
  readonly code: "scenario_invalid" | "rubric_invalid";

  constructor(code: "scenario_invalid" | "rubric_invalid") {
    super(stableMessages[code]);
    this.name = "BenchmarkConfigurationError";
    this.code = code;
  }
}

export class BenchmarkRunnerError extends Error {
  readonly code = "runner_failed" as const;

  constructor() {
    super(stableMessages.runner_failed);
    this.name = "BenchmarkRunnerError";
  }
}

export function getStableErrorMessage(code: BenchmarkErrorCode): string {
  return stableMessages[code];
}
