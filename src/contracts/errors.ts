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
  | "material_requirement_judge_invalid"
  | "calibration_candidate_invalid"
  | "calibration_annotation_invalid"
  | "calibration_adjudication_invalid"
  | "calibration_data_invalid"
  | "calibration_packet_invalid"
  | "calibration_reference_invalid"
  | "human_reference_calibration_invalid"
  | "human_reference_semantic_audit_invalid"
  | "calibration_critical_failure_target_invalid"
  | "calibration_critical_failure_annotation_invalid"
  | "calibration_critical_failure_adjudication_invalid"
  | "calibration_critical_failure_data_invalid"
  | "calibration_critical_failure_reference_invalid"
  | "tutor_generation_spec_invalid"
  | "tutor_generation_execution_unsupported"
  | "tutor_execution_packet_invalid"
  | "tutor_response_corpus_invalid"
  | "tutor_response_replay_incompatible"
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
  material_requirement_judge_invalid:
    "Material Requirement Judge input or result is invalid.",
  calibration_candidate_invalid: "Calibration candidate response is invalid.",
  calibration_annotation_invalid: "Calibration annotation is invalid.",
  calibration_adjudication_invalid: "Calibration adjudication is invalid.",
  calibration_data_invalid: "Calibration data is invalid.",
  calibration_packet_invalid: "Calibration packet is invalid.",
  calibration_reference_invalid: "Calibration reference set is invalid.",
  human_reference_calibration_invalid:
    "Human reference calibration data is invalid.",
  human_reference_semantic_audit_invalid:
    "Human reference semantic audit data is invalid.",
  calibration_critical_failure_target_invalid:
    "Critical-failure calibration target registry is invalid.",
  calibration_critical_failure_annotation_invalid:
    "Critical-failure calibration annotation is invalid.",
  calibration_critical_failure_adjudication_invalid:
    "Critical-failure calibration adjudication is invalid.",
  calibration_critical_failure_data_invalid:
    "Critical-failure calibration data is invalid.",
  calibration_critical_failure_reference_invalid:
    "Critical-failure calibration reference set is invalid.",
  tutor_generation_spec_invalid: "Tutor generation specification is invalid.",
  tutor_generation_execution_unsupported:
    "Tutor generation specification requires unsupported execution controls.",
  tutor_execution_packet_invalid: "Tutor execution packet is invalid.",
  tutor_response_corpus_invalid: "Tutor response corpus is invalid.",
  tutor_response_replay_incompatible:
    "Tutor response corpus replay compatibility is not approved.",
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
    | "material_requirement_judge_invalid"
    | "calibration_candidate_invalid"
    | "calibration_annotation_invalid"
    | "calibration_adjudication_invalid"
    | "calibration_data_invalid"
    | "calibration_packet_invalid"
    | "calibration_reference_invalid"
    | "human_reference_calibration_invalid"
    | "human_reference_semantic_audit_invalid"
    | "calibration_critical_failure_target_invalid"
    | "calibration_critical_failure_annotation_invalid"
    | "calibration_critical_failure_adjudication_invalid"
    | "calibration_critical_failure_data_invalid"
    | "calibration_critical_failure_reference_invalid"
    | "tutor_generation_spec_invalid"
    | "tutor_generation_execution_unsupported"
    | "tutor_execution_packet_invalid"
    | "tutor_response_corpus_invalid"
    | "tutor_response_replay_incompatible";

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
      | "material_requirement_judge_invalid"
      | "calibration_candidate_invalid"
      | "calibration_annotation_invalid"
      | "calibration_adjudication_invalid"
      | "calibration_data_invalid"
      | "calibration_packet_invalid"
      | "calibration_reference_invalid"
      | "human_reference_calibration_invalid"
      | "human_reference_semantic_audit_invalid"
      | "calibration_critical_failure_target_invalid"
      | "calibration_critical_failure_annotation_invalid"
      | "calibration_critical_failure_adjudication_invalid"
      | "calibration_critical_failure_data_invalid"
      | "calibration_critical_failure_reference_invalid"
      | "tutor_generation_spec_invalid"
      | "tutor_generation_execution_unsupported"
      | "tutor_execution_packet_invalid"
      | "tutor_response_corpus_invalid"
      | "tutor_response_replay_incompatible",
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
