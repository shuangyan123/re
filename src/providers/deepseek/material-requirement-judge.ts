import {
  MaterialRequirementJudgeExecutionError,
  parseMaterialRequirementJudgeResult,
  type MaterialRequirementJudge,
  type MaterialRequirementJudgeEvaluation,
  type MaterialRequirementJudgeInput,
  type MaterialRequirementJudgeResult,
  TutorEvalJudgeExecutionError,
  type TutorEvalJudgeMetrics,
  type TutorEvalJudgeDescriptor,
} from "../../contracts/index.js";
import {
  createDeepSeekJudgeExecutor,
  type DeepSeekJudgeOptions,
} from "./tutor-eval-judge.js";

export interface DeepSeekMaterialRequirementJudgeOptions extends DeepSeekJudgeOptions {
  readonly requireReasoningSeparation?: boolean;
}

export type MaterialRequirementJudgeConfigurationErrorCode =
  | "api_key_missing"
  | "model_missing";

const configurationMessages: Readonly<
  Record<MaterialRequirementJudgeConfigurationErrorCode, string>
> = {
  api_key_missing:
    "DEEPSEEK_API_KEY is required for the live Material Requirement Judge.",
  model_missing:
    "DEEPSEEK_JUDGE_MODEL is required for the live Material Requirement Judge.",
};

export class MaterialRequirementJudgeConfigurationError extends Error {
  readonly code: MaterialRequirementJudgeConfigurationErrorCode;

  constructor(code: MaterialRequirementJudgeConfigurationErrorCode) {
    super(configurationMessages[code]);
    this.name = "MaterialRequirementJudgeConfigurationError";
    this.code = code;
  }
}

export interface DeepSeekMaterialRequirementJudge
  extends MaterialRequirementJudge {
  readonly descriptor: TutorEvalJudgeDescriptor;
  readonly evaluateWithMetrics: (
    input: MaterialRequirementJudgeInput,
  ) => Promise<MaterialRequirementJudgeEvaluation>;
}

function serializeMaterialRequirementInput(
  input: MaterialRequirementJudgeInput,
): string {
  return JSON.stringify({
    kind: "MaterialRequirementJudgeInput",
    payload: input,
  });
}

function parseMaterialRequirementResult(
  content: string,
  _metrics: TutorEvalJudgeMetrics,
  input: MaterialRequirementJudgeInput,
): MaterialRequirementJudgeResult {
  return parseMaterialRequirementJudgeResult(
    JSON.parse(content) as unknown,
    input,
  );
}

function materialFailureCode(
  code: TutorEvalJudgeExecutionError["code"],
): ConstructorParameters<typeof MaterialRequirementJudgeExecutionError>[0] {
  switch (code) {
    case "judge_unavailable":
      return "material_judge_unavailable";
    case "judge_result_invalid":
      return "material_judge_result_invalid";
    case "judge_output_truncated":
      return "material_judge_output_truncated";
    case "judge_timeout":
      return "material_judge_timeout";
    case "judge_transport_error":
      return "material_judge_transport_error";
    default:
      return "material_judge_result_invalid";
  }
}

function mapMaterialExecutionError(error: unknown): never {
  if (error instanceof MaterialRequirementJudgeExecutionError) {
    throw error;
  }
  if (error instanceof TutorEvalJudgeExecutionError) {
    throw new MaterialRequirementJudgeExecutionError(
      materialFailureCode(error.code),
      error.metrics,
    );
  }
  throw new MaterialRequirementJudgeExecutionError("material_judge_transport_error");
}

export function createDeepSeekMaterialRequirementJudge(
  options: DeepSeekMaterialRequirementJudgeOptions,
): DeepSeekMaterialRequirementJudge {
  const environment = options.environment ?? process.env;
  const model = options.model?.trim() ?? "";
  const apiKey = options.apiKey === undefined
    ? environment.DEEPSEEK_API_KEY?.trim()
    : options.apiKey?.trim();
  if (model.length === 0) {
    throw new MaterialRequirementJudgeConfigurationError("model_missing");
  }
  if (apiKey === undefined || apiKey.length === 0) {
    throw new MaterialRequirementJudgeConfigurationError("api_key_missing");
  }
  const executor = createDeepSeekJudgeExecutor({
    ...options,
    model,
    apiKey,
    serializeInput: serializeMaterialRequirementInput,
    parseResult: parseMaterialRequirementResult,
  });
  const evaluateWithMetrics = async (
    input: MaterialRequirementJudgeInput,
  ): Promise<MaterialRequirementJudgeEvaluation> => {
    try {
      return await executor.evaluateWithMetrics(input);
    } catch (error) {
      return mapMaterialExecutionError(error);
    }
  };
  return {
    descriptor: executor.descriptor,
    evaluateWithMetrics,
    evaluate: async (input) => (await evaluateWithMetrics(input)).result,
  };
}
