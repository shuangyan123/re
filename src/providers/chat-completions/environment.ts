import {
  ChatCompletionsJudgeConfigurationError,
  DEFAULT_CHAT_COMPLETIONS_JUDGE_MAX_ATTEMPTS,
  DEFAULT_CHAT_COMPLETIONS_JUDGE_TIMEOUT_MS,
  MAX_CHAT_COMPLETIONS_JUDGE_ATTEMPTS,
  type ChatCompletionsJudgeJsonMode,
  type ChatCompletionsReasoningSplit,
  type ChatCompletionsMaxOutputTokensField,
} from "./tutor-eval-judge.js";

export interface ChatCompletionsJudgeEnvironmentConfig {
  readonly provider: string | null;
  readonly model: string | null;
  readonly baseUrl: string | null;
  readonly endpointPath: string;
  readonly apiKeyConfigured: boolean;
  readonly timeoutMs: number;
  readonly maxAttempts: number;
  readonly jsonMode: ChatCompletionsJudgeJsonMode;
  readonly reasoningSplit: ChatCompletionsReasoningSplit;
  readonly maxOutputTokensField: ChatCompletionsMaxOutputTokensField;
  readonly maxOutputTokens?: number;
  readonly temperature?: number;
}

function nonEmpty(value: string | undefined): string | null {
  const normalized = value?.trim();
  return normalized === undefined || normalized.length === 0 ? null : normalized;
}

function positiveInteger(
  value: string | undefined,
  fallback: number,
  code: "timeout_invalid" | "attempts_invalid" | "max_tokens_invalid",
  maximum?: number,
): number {
  if (value === undefined || value.trim().length === 0) {
    return fallback;
  }
  const parsed = Number(value);
  if (
    !Number.isInteger(parsed) ||
    parsed < 1 ||
    (maximum !== undefined && parsed > maximum)
  ) {
    throw new ChatCompletionsJudgeConfigurationError(code);
  }
  return parsed;
}

function optionalTemperature(value: string | undefined): number | undefined {
  if (value === undefined || value.trim().length === 0) {
    return undefined;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 2) {
    throw new ChatCompletionsJudgeConfigurationError("temperature_invalid");
  }
  return parsed;
}

function jsonMode(value: string | undefined): ChatCompletionsJudgeJsonMode {
  const normalized = nonEmpty(value);
  if (normalized === null || normalized === "enabled") {
    return "enabled";
  }
  if (normalized === "disabled") {
    return "disabled";
  }
  throw new ChatCompletionsJudgeConfigurationError("json_mode_invalid");
}

function reasoningSplit(value: string | undefined): ChatCompletionsReasoningSplit {
  const normalized = nonEmpty(value);
  if (normalized === null || normalized === "disabled") {
    return "disabled";
  }
  if (normalized === "enabled") {
    return "enabled";
  }
  throw new ChatCompletionsJudgeConfigurationError("reasoning_split_invalid");
}

function maxOutputTokensField(
  value: string | undefined,
): ChatCompletionsMaxOutputTokensField {
  const normalized = nonEmpty(value);
  if (normalized === null || normalized === "max_tokens") {
    return "max_tokens";
  }
  if (normalized === "max_completion_tokens") {
    return "max_completion_tokens";
  }
  throw new ChatCompletionsJudgeConfigurationError(
    "max_output_tokens_field_invalid",
  );
}

function validateBaseUrl(value: string | null): string | null {
  if (value === null) {
    return null;
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new ChatCompletionsJudgeConfigurationError("base_url_invalid");
  }
  if (
    (url.protocol !== "http:" && url.protocol !== "https:") ||
    url.username.length > 0 ||
    url.password.length > 0 ||
    url.search.length > 0 ||
    url.hash.length > 0
  ) {
    throw new ChatCompletionsJudgeConfigurationError("base_url_invalid");
  }
  return value.replace(/\/+$/u, "");
}

function validateEndpointPath(value: string): string {
  if (
    value.length === 0 ||
    !value.startsWith("/") ||
    value.includes("?") ||
    value.includes("#") ||
    value.includes("\\")
  ) {
    throw new ChatCompletionsJudgeConfigurationError("endpoint_path_invalid");
  }
  return value;
}

export function readChatCompletionsJudgeEnvironment(
  environment: NodeJS.ProcessEnv = process.env,
): ChatCompletionsJudgeEnvironmentConfig {
  const endpointPath = validateEndpointPath(
    nonEmpty(environment.CHAT_COMPLETIONS_JUDGE_API_PATH) ?? "/chat/completions",
  );
  const maxOutputTokens = nonEmpty(environment.CHAT_COMPLETIONS_JUDGE_MAX_TOKENS) === null
    ? undefined
    : positiveInteger(
        environment.CHAT_COMPLETIONS_JUDGE_MAX_TOKENS,
        1,
        "max_tokens_invalid",
      );
  const temperature = optionalTemperature(environment.CHAT_COMPLETIONS_JUDGE_TEMPERATURE);
  return {
    provider: nonEmpty(environment.CHAT_COMPLETIONS_JUDGE_PROVIDER),
    model: nonEmpty(environment.CHAT_COMPLETIONS_JUDGE_MODEL),
    baseUrl: validateBaseUrl(nonEmpty(environment.CHAT_COMPLETIONS_JUDGE_BASE_URL)),
    endpointPath,
    apiKeyConfigured: nonEmpty(environment.CHAT_COMPLETIONS_JUDGE_API_KEY) !== null,
    timeoutMs: positiveInteger(
      environment.CHAT_COMPLETIONS_JUDGE_TIMEOUT_MS,
      DEFAULT_CHAT_COMPLETIONS_JUDGE_TIMEOUT_MS,
      "timeout_invalid",
    ),
    maxAttempts: positiveInteger(
      environment.CHAT_COMPLETIONS_JUDGE_MAX_ATTEMPTS,
      DEFAULT_CHAT_COMPLETIONS_JUDGE_MAX_ATTEMPTS,
      "attempts_invalid",
      MAX_CHAT_COMPLETIONS_JUDGE_ATTEMPTS,
    ),
    jsonMode: jsonMode(environment.CHAT_COMPLETIONS_JUDGE_JSON_MODE),
    reasoningSplit: reasoningSplit(environment.CHAT_COMPLETIONS_JUDGE_REASONING_SPLIT),
    maxOutputTokensField: maxOutputTokensField(
      environment.CHAT_COMPLETIONS_JUDGE_MAX_OUTPUT_TOKENS_FIELD,
    ),
    ...(maxOutputTokens === undefined ? {} : { maxOutputTokens }),
    ...(temperature === undefined ? {} : { temperature }),
  };
}

export function readChatCompletionsJudgeApiKey(
  environment: NodeJS.ProcessEnv = process.env,
): string | null {
  return nonEmpty(environment.CHAT_COMPLETIONS_JUDGE_API_KEY);
}
