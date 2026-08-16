import {
  buildChatCompletionsJudgeRequest,
  ChatCompletionsJudgeConfigurationError,
  createChatCompletionsJudge,
  DEFAULT_CHAT_COMPLETIONS_JUDGE_MAX_ATTEMPTS,
  MAX_CHAT_COMPLETIONS_JUDGE_ATTEMPTS,
  type ChatCompletionsFetch,
  type ChatCompletionsJudgeConfigurationErrorCode,
  type ChatCompletionsJudge,
  type ChatCompletionsJudgeRequest,
  type ChatCompletionsJudgeRequestOptions,
} from "../chat-completions/index.js";
import type { TutorEvalJudgeInput } from "../../contracts/index.js";

export const DEEPSEEK_JUDGE_PROVIDER = "deepseek" as const;
export const DEEPSEEK_JUDGE_BASE_URL = "https://api.deepseek.com" as const;
export const DEFAULT_DEEPSEEK_JUDGE_TIMEOUT_MS = 60_000 as const;
export const DEFAULT_DEEPSEEK_JUDGE_MAX_ATTEMPTS = DEFAULT_CHAT_COMPLETIONS_JUDGE_MAX_ATTEMPTS;
export const MAX_DEEPSEEK_JUDGE_ATTEMPTS = MAX_CHAT_COMPLETIONS_JUDGE_ATTEMPTS;
export const DEFAULT_DEEPSEEK_JUDGE_THINKING = "enabled" as const;
export const DEFAULT_DEEPSEEK_JUDGE_REASONING_EFFORT = "high" as const;
export const DEFAULT_DEEPSEEK_JUDGE_MAX_TOKENS = 8192 as const;

export type DeepSeekJudgeThinkingMode = "enabled" | "disabled";
export type DeepSeekJudgeReasoningEffort = "high" | "max";

export type DeepSeekJudgeConfigurationErrorCode =
  | ChatCompletionsJudgeConfigurationErrorCode
  | "thinking_invalid"
  | "reasoning_effort_invalid"
  | "reasoning_effort_conflict"
  | "max_tokens_invalid";

const configurationMessages: Readonly<
  Record<DeepSeekJudgeConfigurationErrorCode, string>
> = {
  provider_invalid: "The DeepSeek Judge provider identity is invalid.",
  model_missing: "A concrete DeepSeek Chat Completions Judge model is required.",
  model_not_pinned:
    "The DeepSeek Judge model must be a concrete model identity, not latest, auto, or recommended.",
  prompt_invalid: "The versioned DeepSeek Judge prompt configuration is invalid.",
  base_url_invalid: "The DeepSeek Judge base URL is invalid.",
  timeout_invalid: "The DeepSeek Judge timeout must be a positive integer.",
  attempts_invalid:
    `The DeepSeek Judge max attempts must be an integer from 1 to ${MAX_DEEPSEEK_JUDGE_ATTEMPTS}.`,
  temperature_invalid:
    "DEEPSEEK_JUDGE_TEMPERATURE must be a number from 0 to 2 and is not supported when thinking is enabled.",
  thinking_invalid:
    "DEEPSEEK_JUDGE_THINKING must be enabled or disabled.",
  reasoning_effort_invalid:
    "DEEPSEEK_JUDGE_REASONING_EFFORT must be high or max.",
  reasoning_effort_conflict:
    "DEEPSEEK_JUDGE_REASONING_EFFORT cannot be configured when thinking is disabled.",
  max_tokens_invalid:
    "DEEPSEEK_JUDGE_MAX_TOKENS must be a positive integer.",
  endpoint_path_invalid: "The DeepSeek Judge endpoint path is invalid.",
  json_mode_invalid: "The DeepSeek Judge JSON mode is invalid.",
  max_output_tokens_field_invalid: "The DeepSeek Judge output token field is invalid.",
};

export class DeepSeekJudgeConfigurationError extends Error {
  readonly code: DeepSeekJudgeConfigurationErrorCode;

  constructor(code: DeepSeekJudgeConfigurationErrorCode) {
    super(configurationMessages[code]);
    this.name = "DeepSeekJudgeConfigurationError";
    this.code = code;
  }
}

export interface DeepSeekJudgeEnvironmentConfig {
  readonly model: string | null;
  readonly apiKeyConfigured: boolean;
  readonly timeoutMs: number;
  readonly maxAttempts: number;
  readonly thinkingMode: DeepSeekJudgeThinkingMode;
  readonly reasoningEffort?: DeepSeekJudgeReasoningEffort;
  readonly maxOutputTokens: number;
  readonly temperature?: number;
}

export interface DeepSeekJudgeRequestOptions
  extends Omit<
    ChatCompletionsJudgeRequestOptions,
    "thinking" | "reasoningEffort" | "maxOutputTokens"
  > {
  readonly promptId: string;
  readonly promptVersion: string;
  readonly thinkingMode?: DeepSeekJudgeThinkingMode;
  readonly reasoningEffort?: DeepSeekJudgeReasoningEffort;
  readonly maxOutputTokens?: number;
}

export interface DeepSeekJudgeOptions extends DeepSeekJudgeRequestOptions {
  readonly apiKey?: string | null;
  readonly environment?: NodeJS.ProcessEnv;
  readonly fetch?: ChatCompletionsFetch;
  readonly timeoutMs?: number;
  readonly maxAttempts?: number;
}

function nonEmptyEnvironmentValue(value: string | null | undefined): string | null {
  const normalized = value?.trim();
  return normalized === undefined || normalized.length === 0 ? null : normalized;
}

function parsePositiveInteger(
  value: string | undefined,
  fallback: number,
  code: "timeout_invalid" | "attempts_invalid" | "max_tokens_invalid",
  maximum?: number,
): number {
  if (value === undefined) {
    return fallback;
  }
  const parsed = Number(value);
  if (
    !Number.isInteger(parsed) ||
    parsed < 1 ||
    (maximum !== undefined && parsed > maximum)
  ) {
    throw new DeepSeekJudgeConfigurationError(code);
  }
  return parsed;
}

function parseTemperature(value: string | undefined): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 2) {
    throw new DeepSeekJudgeConfigurationError("temperature_invalid");
  }
  return parsed;
}

function parseThinkingMode(value: string | undefined): DeepSeekJudgeThinkingMode {
  if (value === undefined) {
    return DEFAULT_DEEPSEEK_JUDGE_THINKING;
  }
  const normalized = value.trim();
  if (normalized === "enabled" || normalized === "disabled") {
    return normalized;
  }
  throw new DeepSeekJudgeConfigurationError("thinking_invalid");
}

function parseReasoningEffort(
  value: string | undefined,
): DeepSeekJudgeReasoningEffort | undefined {
  if (value === undefined) {
    return undefined;
  }
  const normalized = value.trim();
  if (normalized === "high" || normalized === "max") {
    return normalized;
  }
  throw new DeepSeekJudgeConfigurationError("reasoning_effort_invalid");
}

function assertMaxOutputTokens(value: unknown): asserts value is number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
    throw new DeepSeekJudgeConfigurationError("max_tokens_invalid");
  }
}

interface DeepSeekJudgeResolvedGenerationConfig {
  readonly thinkingMode: DeepSeekJudgeThinkingMode;
  readonly reasoningEffort?: DeepSeekJudgeReasoningEffort;
  readonly maxOutputTokens: number;
  readonly temperature?: number;
}

function resolveDeepSeekJudgeGeneration(
  options: DeepSeekJudgeRequestOptions,
): DeepSeekJudgeResolvedGenerationConfig {
  const thinkingMode = options.thinkingMode === undefined
    ? DEFAULT_DEEPSEEK_JUDGE_THINKING
    : options.thinkingMode;
  if (thinkingMode !== "enabled" && thinkingMode !== "disabled") {
    throw new DeepSeekJudgeConfigurationError("thinking_invalid");
  }

  const configuredReasoningEffort = options.reasoningEffort;
  if (
    configuredReasoningEffort !== undefined &&
    configuredReasoningEffort !== "high" &&
    configuredReasoningEffort !== "max"
  ) {
    throw new DeepSeekJudgeConfigurationError("reasoning_effort_invalid");
  }
  if (thinkingMode === "disabled" && configuredReasoningEffort !== undefined) {
    throw new DeepSeekJudgeConfigurationError("reasoning_effort_conflict");
  }
  const reasoningEffort = thinkingMode === "enabled"
    ? configuredReasoningEffort ?? DEFAULT_DEEPSEEK_JUDGE_REASONING_EFFORT
    : undefined;

  const maxOutputTokens = options.maxOutputTokens === undefined
    ? DEFAULT_DEEPSEEK_JUDGE_MAX_TOKENS
    : options.maxOutputTokens;
  assertMaxOutputTokens(maxOutputTokens);

  const temperature = options.temperature;
  if (
    temperature !== undefined &&
    (typeof temperature !== "number" ||
      !Number.isFinite(temperature) ||
      temperature < 0 ||
      temperature > 2)
  ) {
    throw new DeepSeekJudgeConfigurationError("temperature_invalid");
  }
  if (thinkingMode === "enabled" && temperature !== undefined) {
    throw new DeepSeekJudgeConfigurationError("temperature_invalid");
  }

  return {
    thinkingMode,
    ...(reasoningEffort === undefined ? {} : { reasoningEffort }),
    maxOutputTokens,
    ...(temperature === undefined ? {} : { temperature }),
  };
}

export function readDeepSeekJudgeEnvironment(
  environment: NodeJS.ProcessEnv = process.env,
): DeepSeekJudgeEnvironmentConfig {
  const thinkingMode = parseThinkingMode(environment.DEEPSEEK_JUDGE_THINKING);
  const reasoningEffort = parseReasoningEffort(
    environment.DEEPSEEK_JUDGE_REASONING_EFFORT,
  );
  if (
    thinkingMode === "disabled" &&
    environment.DEEPSEEK_JUDGE_REASONING_EFFORT !== undefined
  ) {
    throw new DeepSeekJudgeConfigurationError("reasoning_effort_conflict");
  }
  const temperature = parseTemperature(environment.DEEPSEEK_JUDGE_TEMPERATURE);
  if (thinkingMode === "enabled" && temperature !== undefined) {
    throw new DeepSeekJudgeConfigurationError("temperature_invalid");
  }
  return {
    model: nonEmptyEnvironmentValue(environment.DEEPSEEK_JUDGE_MODEL),
    apiKeyConfigured: nonEmptyEnvironmentValue(environment.DEEPSEEK_API_KEY) !== null,
    timeoutMs: parsePositiveInteger(
      environment.DEEPSEEK_JUDGE_TIMEOUT_MS,
      DEFAULT_DEEPSEEK_JUDGE_TIMEOUT_MS,
      "timeout_invalid",
    ),
    maxAttempts: parsePositiveInteger(
      environment.DEEPSEEK_JUDGE_MAX_ATTEMPTS,
      DEFAULT_DEEPSEEK_JUDGE_MAX_ATTEMPTS,
      "attempts_invalid",
      MAX_DEEPSEEK_JUDGE_ATTEMPTS,
    ),
    thinkingMode,
    ...(thinkingMode === "enabled"
      ? { reasoningEffort: reasoningEffort ?? DEFAULT_DEEPSEEK_JUDGE_REASONING_EFFORT }
      : {}),
    maxOutputTokens: parsePositiveInteger(
      environment.DEEPSEEK_JUDGE_MAX_TOKENS,
      DEFAULT_DEEPSEEK_JUDGE_MAX_TOKENS,
      "max_tokens_invalid",
    ),
    ...(temperature === undefined ? {} : { temperature }),
  };
}

function toGenericConfigurationError(error: unknown): never {
  if (error instanceof ChatCompletionsJudgeConfigurationError) {
    throw new DeepSeekJudgeConfigurationError(error.code);
  }
  throw error;
}

export function buildDeepSeekJudgeRequest(
  input: TutorEvalJudgeInput,
  options: DeepSeekJudgeRequestOptions,
): ChatCompletionsJudgeRequest {
  const generation = resolveDeepSeekJudgeGeneration(options);
  try {
    return buildChatCompletionsJudgeRequest(input, {
      model: options.model,
      prompt: options.prompt,
      promptId: options.promptId,
      promptVersion: options.promptVersion,
      thinking: { type: generation.thinkingMode },
      ...(generation.reasoningEffort === undefined
        ? {}
        : { reasoningEffort: generation.reasoningEffort }),
      maxOutputTokens: generation.maxOutputTokens,
      ...(generation.temperature === undefined
        ? {}
        : { temperature: generation.temperature }),
    });
  } catch (error) {
    toGenericConfigurationError(error);
  }
}

export type DeepSeekJudge = ChatCompletionsJudge;

export function createDeepSeekJudge(options: DeepSeekJudgeOptions): DeepSeekJudge {
  const environment = options.environment ?? process.env;
  const environmentConfig = readDeepSeekJudgeEnvironment(environment);
  const apiKey = options.apiKey === undefined
    ? nonEmptyEnvironmentValue(environment.DEEPSEEK_API_KEY)
    : nonEmptyEnvironmentValue(options.apiKey);
  const effectiveOptions: DeepSeekJudgeRequestOptions = {
    model: options.model,
    prompt: options.prompt,
    promptId: options.promptId,
    promptVersion: options.promptVersion,
    thinkingMode: options.thinkingMode === undefined
      ? environmentConfig.thinkingMode
      : options.thinkingMode,
    ...(options.reasoningEffort === undefined
      ? environmentConfig.reasoningEffort === undefined
        ? {}
        : { reasoningEffort: environmentConfig.reasoningEffort }
      : { reasoningEffort: options.reasoningEffort }),
    maxOutputTokens: options.maxOutputTokens === undefined
      ? environmentConfig.maxOutputTokens
      : options.maxOutputTokens,
    ...(options.temperature === undefined
      ? environmentConfig.temperature === undefined
        ? {}
        : { temperature: environmentConfig.temperature }
      : { temperature: options.temperature }),
  };
  const generation = resolveDeepSeekJudgeGeneration(effectiveOptions);
  try {
    return createChatCompletionsJudge({
      model: effectiveOptions.model,
      prompt: effectiveOptions.prompt,
      promptId: effectiveOptions.promptId,
      promptVersion: effectiveOptions.promptVersion,
      provider: DEEPSEEK_JUDGE_PROVIDER,
      baseUrl: DEEPSEEK_JUDGE_BASE_URL,
      apiKey,
      thinking: { type: generation.thinkingMode },
      ...(generation.reasoningEffort === undefined
        ? {}
        : { reasoningEffort: generation.reasoningEffort }),
      maxOutputTokens: generation.maxOutputTokens,
      ...(generation.temperature === undefined
        ? {}
        : { temperature: generation.temperature }),
      ...(options.fetch === undefined ? {} : { fetch: options.fetch }),
      timeoutMs: options.timeoutMs === undefined
        ? environmentConfig.timeoutMs
        : options.timeoutMs,
      maxAttempts: options.maxAttempts === undefined
        ? environmentConfig.maxAttempts
        : options.maxAttempts,
    });
  } catch (error) {
    toGenericConfigurationError(error);
  }
}
