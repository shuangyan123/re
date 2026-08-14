export type BenchmarkErrorCode =
  | "scenario_invalid"
  | "rubric_invalid"
  | "tutor_eval_case_invalid"
  | "tutor_eval_dataset_invalid"
  | "tutor_eval_rubric_invalid"
  | "tutor_eval_selection_invalid"
  | "tutor_eval_result_invalid"
  | "judge_input_invalid"
  | "judge_result_invalid"
  | "calibration_candidate_invalid"
  | "calibration_annotation_invalid"
  | "calibration_adjudication_invalid"
  | "calibration_data_invalid"
  | "calibration_packet_invalid"
  | "calibration_reference_invalid"
  | "tutor_generation_spec_invalid"
  | "tutor_generation_execution_unsupported"
  | "tutor_execution_packet_invalid"
  | "tutor_response_corpus_invalid"
  | "adapter_failed"
  | "evaluation_failed"
  | "runner_failed";

const stableMessages: Record<BenchmarkErrorCode, string> = {
  scenario_invalid: "Scenario configuration is invalid.",
  rubric_invalid: "Rubric configuration is invalid.",
  tutor_eval_case_invalid: "TutorEval case configuration is invalid.",
  tutor_eval_dataset_invalid: "TutorEval dataset configuration is invalid.",
  tutor_eval_rubric_invalid: "TutorEval rubric configuration is invalid.",
  tutor_eval_selection_invalid: "TutorEval corpus selection is invalid.",
  tutor_eval_result_invalid: "TutorEval result is invalid.",
  judge_input_invalid: "AI Tutor Judge input is invalid.",
  judge_result_invalid: "AI Tutor Judge result is invalid.",
  calibration_candidate_invalid: "Calibration candidate response is invalid.",
  calibration_annotation_invalid: "Calibration annotation is invalid.",
  calibration_adjudication_invalid: "Calibration adjudication is invalid.",
  calibration_data_invalid: "Calibration data is invalid.",
  calibration_packet_invalid: "Calibration packet is invalid.",
  calibration_reference_invalid: "Calibration reference set is invalid.",
  tutor_generation_spec_invalid: "Tutor generation specification is invalid.",
  tutor_generation_execution_unsupported:
    "Tutor generation specification requires unsupported execution controls.",
  tutor_execution_packet_invalid: "Tutor execution packet is invalid.",
  tutor_response_corpus_invalid: "Tutor response corpus is invalid.",
  adapter_failed: "Tutor adapter failed for this scenario.",
  evaluation_failed: "Evaluator failed for this scenario.",
  runner_failed: "Benchmark runner failed.",
};

export class BenchmarkConfigurationError extends Error {
  readonly code:
    | "scenario_invalid"
    | "rubric_invalid"
    | "tutor_eval_case_invalid"
    | "tutor_eval_dataset_invalid"
    | "tutor_eval_rubric_invalid"
    | "tutor_eval_selection_invalid"
    | "tutor_eval_result_invalid"
    | "judge_input_invalid"
    | "judge_result_invalid"
    | "calibration_candidate_invalid"
    | "calibration_annotation_invalid"
    | "calibration_adjudication_invalid"
    | "calibration_data_invalid"
    | "calibration_packet_invalid"
    | "calibration_reference_invalid"
    | "tutor_generation_spec_invalid"
    | "tutor_generation_execution_unsupported"
    | "tutor_execution_packet_invalid"
    | "tutor_response_corpus_invalid";

  constructor(
    code:
      | "scenario_invalid"
      | "rubric_invalid"
      | "tutor_eval_case_invalid"
      | "tutor_eval_dataset_invalid"
      | "tutor_eval_rubric_invalid"
      | "tutor_eval_selection_invalid"
      | "tutor_eval_result_invalid"
      | "judge_input_invalid"
      | "judge_result_invalid"
      | "calibration_candidate_invalid"
      | "calibration_annotation_invalid"
      | "calibration_adjudication_invalid"
      | "calibration_data_invalid"
      | "calibration_packet_invalid"
      | "calibration_reference_invalid"
      | "tutor_generation_spec_invalid"
      | "tutor_generation_execution_unsupported"
      | "tutor_execution_packet_invalid"
      | "tutor_response_corpus_invalid",
  ) {
    super(stableMessages[code]);
    this.name = "BenchmarkConfigurationError";
    this.code = code;
  }
}

export class TutorGenerationExecutionError extends BenchmarkConfigurationError {
  readonly unsupportedFields: readonly (
    | "maxOutputTokens"
    | "temperature"
    | "reasoningEffort"
    | "seed"
  )[];

  constructor(
    unsupportedFields: readonly (
      | "maxOutputTokens"
      | "temperature"
      | "reasoningEffort"
      | "seed"
    )[],
  ) {
    super("tutor_generation_execution_unsupported");
    this.name = "TutorGenerationExecutionError";
    this.unsupportedFields = [...unsupportedFields];
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
