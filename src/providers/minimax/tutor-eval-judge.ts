import {
  buildChatCompletionsJudgeRequest,
  ChatCompletionsJudgeConfigurationError,
  createChatCompletionsJudge,
  DEFAULT_CHAT_COMPLETIONS_JUDGE_MAX_ATTEMPTS,
  MAX_CHAT_COMPLETIONS_JUDGE_ATTEMPTS,
  type ChatCompletionsFetch,
  type ChatCompletionsJudge,
  type ChatCompletionsJudgeConfigurationErrorCode,
  type ChatCompletionsJudgeRequest,
  type ChatCompletionsJudgeRequestOptions,
  type ChatCompletionsJudgeJsonMode,
  type ChatCompletionsMaxOutputTokensField,
  type ChatCompletionsReasoningSplit,
} from "../chat-completions/index.js";
import type { TutorEvalJudgeInput } from "../../contracts/index.js";

export const MINIMAX_JUDGE_PROVIDER = "minimax" as const;
export const MINIMAX_JUDGE_BASE_URL = "https://api.minimaxi.com/v1" as const;
export const MINIMAX_JUDGE_PATH = "/chat/completions" as const;
export const DEFAULT_MINIMAX_JUDGE_TIMEOUT_MS = 60_000 as const;
export const DEFAULT_MINIMAX_JUDGE_MAX_ATTEMPTS =
  DEFAULT_CHAT_COMPLETIONS_JUDGE_MAX_ATTEMPTS;
export const MAX_MINIMAX_JUDGE_ATTEMPTS = MAX_CHAT_COMPLETIONS_JUDGE_ATTEMPTS;
export const DEFAULT_MINIMAX_JUDGE_MAX_TOKENS = 2_048 as const;
export const DEFAULT_MINIMAX_JUDGE_REASONING_SPLIT = "enabled" as const;
// The China OpenAI-compatible parameter list does not document response_format;
// keep the request conservative and let the local parser enforce JSON.
export const DEFAULT_MINIMAX_JUDGE_JSON_MODE = "disabled" as const;
export const DEFAULT_MINIMAX_JUDGE_MAX_OUTPUT_TOKENS_FIELD =
  "max_completion_tokens" as const;

export type MiniMaxJudgeConfigurationErrorCode =
  ChatCompletionsJudgeConfigurationErrorCode;

const configurationMessages: Readonly<
  Record<MiniMaxJudgeConfigurationErrorCode, string>
> = {
  provider_invalid: "The MiniMax Judge provider identity is invalid.",
  model_missing: "A concrete MiniMax Judge model is required.",
  model_not_pinned:
    "The MiniMax Judge model must be a concrete model identity, not latest, auto, or recommended.",
  prompt_invalid: "The versioned MiniMax Judge prompt configuration is invalid.",
  base_url_invalid:
    "The MiniMax Judge base URL must be an http or https URL without credentials, query, or fragment.",
  endpoint_path_invalid: "The MiniMax Judge endpoint path is invalid.",
  timeout_invalid: "The MiniMax Judge timeout must be a positive integer.",
  attempts_invalid:
    `The MiniMax Judge max attempts must be an integer from 1 to ${MAX_MINIMAX_JUDGE_ATTEMPTS}.`,
  temperature_invalid: "The MiniMax Judge temperature must be a number from 0 to 2.",
  max_tokens_invalid: "The MiniMax Judge output token limit must be a positive integer.",
  json_mode_invalid: "The MiniMax Judge JSON mode must be enabled or disabled.",
  reasoning_split_invalid:
    "The MiniMax Judge reasoning split mode must be enabled or disabled.",
  max_output_tokens_field_invalid:
    "The MiniMax Judge output token field must be max_tokens or max_completion_tokens.",
};

export class MiniMaxJudgeConfigurationError extends Error {
  readonly code: MiniMaxJudgeConfigurationErrorCode;

  constructor(code: MiniMaxJudgeConfigurationErrorCode) {
    super(configurationMessages[code]);
    this.name = "MiniMaxJudgeConfigurationError";
    this.code = code;
  }
}

export interface MiniMaxJudgeEnvironmentConfig {
  readonly model: string | null;
  readonly apiKeyConfigured: boolean;
  readonly baseUrl: string;
  readonly timeoutMs: number;
  readonly maxAttempts: number;
  readonly maxOutputTokens: number;
  readonly maxOutputTokensField: ChatCompletionsMaxOutputTokensField;
  readonly reasoningSplit: ChatCompletionsReasoningSplit;
  readonly jsonMode: ChatCompletionsJudgeJsonMode;
  readonly temperature?: number;
}

export interface MiniMaxJudgeRequestOptions
  extends Omit<
    ChatCompletionsJudgeRequestOptions,
    | "thinking"
    | "reasoningSplit"
    | "reasoningEffort"
    | "maxOutputTokens"
    | "jsonMode"
    | "maxOutputTokensField"
  > {
  readonly reasoningSplit?: ChatCompletionsReasoningSplit;
  readonly jsonMode?: ChatCompletionsJudgeJsonMode;
  readonly maxOutputTokensField?: ChatCompletionsMaxOutputTokensField;
  readonly maxOutputTokens?: number;
}

export interface MiniMaxJudgeOptions extends MiniMaxJudgeRequestOptions {
  readonly apiKey?: string | null;
  readonly baseUrl?: string;
  readonly environment?: NodeJS.ProcessEnv;
  readonly fetch?: ChatCompletionsFetch;
  readonly timeoutMs?: number;
  readonly maxAttempts?: number;
}

function nonEmpty(value: string | null | undefined): string | null {
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
    throw new MiniMaxJudgeConfigurationError(code);
  }
  return parsed;
}

function optionalTemperature(value: string | undefined): number | undefined {
  if (value === undefined || value.trim().length === 0) {
    return undefined;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 2) {
    throw new MiniMaxJudgeConfigurationError("temperature_invalid");
  }
  return parsed;
}

function parseReasoningSplit(value: string | undefined): ChatCompletionsReasoningSplit {
  const normalized = nonEmpty(value);
  if (normalized === null || normalized === "enabled") {
    return DEFAULT_MINIMAX_JUDGE_REASONING_SPLIT;
  }
  if (normalized === "disabled") {
    return normalized;
  }
  throw new MiniMaxJudgeConfigurationError("reasoning_split_invalid");
}

function parseJsonMode(value: string | undefined): ChatCompletionsJudgeJsonMode {
  const normalized = nonEmpty(value);
  if (normalized === null || normalized === "enabled") {
    return DEFAULT_MINIMAX_JUDGE_JSON_MODE;
  }
  if (normalized === "disabled") {
    return normalized;
  }
  throw new MiniMaxJudgeConfigurationError("json_mode_invalid");
}

function parseMaxOutputTokensField(
  value: string | undefined,
): ChatCompletionsMaxOutputTokensField {
  const normalized = nonEmpty(value);
  if (normalized === null) {
    return DEFAULT_MINIMAX_JUDGE_MAX_OUTPUT_TOKENS_FIELD;
  }
  if (normalized === "max_tokens" || normalized === "max_completion_tokens") {
    return normalized;
  }
  throw new MiniMaxJudgeConfigurationError("max_output_tokens_field_invalid");
}

function validateBaseUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new MiniMaxJudgeConfigurationError("base_url_invalid");
  }
  if (
    (url.protocol !== "http:" && url.protocol !== "https:") ||
    url.username.length > 0 ||
    url.password.length > 0 ||
    url.search.length > 0 ||
    url.hash.length > 0
  ) {
    throw new MiniMaxJudgeConfigurationError("base_url_invalid");
  }
  return value.replace(/\/+$/u, "");
}

export function readMiniMaxJudgeEnvironment(
  environment: NodeJS.ProcessEnv = process.env,
): MiniMaxJudgeEnvironmentConfig {
  const baseUrl = validateBaseUrl(
    nonEmpty(environment.MINIMAX_JUDGE_BASE_URL) ?? MINIMAX_JUDGE_BASE_URL,
  );
  const temperature = optionalTemperature(environment.MINIMAX_JUDGE_TEMPERATURE);
  return {
    model: nonEmpty(environment.MINIMAX_JUDGE_MODEL),
    apiKeyConfigured: nonEmpty(environment.MINIMAX_JUDGE_API_KEY) !== null,
    baseUrl,
    timeoutMs: positiveInteger(
      environment.MINIMAX_JUDGE_TIMEOUT_MS,
      DEFAULT_MINIMAX_JUDGE_TIMEOUT_MS,
      "timeout_invalid",
    ),
    maxAttempts: positiveInteger(
      environment.MINIMAX_JUDGE_MAX_ATTEMPTS,
      DEFAULT_MINIMAX_JUDGE_MAX_ATTEMPTS,
      "attempts_invalid",
      MAX_MINIMAX_JUDGE_ATTEMPTS,
    ),
    maxOutputTokens: positiveInteger(
      environment.MINIMAX_JUDGE_MAX_TOKENS,
      DEFAULT_MINIMAX_JUDGE_MAX_TOKENS,
      "max_tokens_invalid",
    ),
    maxOutputTokensField: parseMaxOutputTokensField(
      environment.MINIMAX_JUDGE_MAX_OUTPUT_TOKENS_FIELD,
    ),
    reasoningSplit: parseReasoningSplit(environment.MINIMAX_JUDGE_REASONING_SPLIT),
    jsonMode: parseJsonMode(environment.MINIMAX_JUDGE_JSON_MODE),
    ...(temperature === undefined ? {} : { temperature }),
  };
}

function assertMaxOutputTokens(value: unknown): asserts value is number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
    throw new MiniMaxJudgeConfigurationError("max_tokens_invalid");
  }
}

interface MiniMaxResolvedGeneration {
  readonly maxOutputTokens: number;
  readonly maxOutputTokensField: ChatCompletionsMaxOutputTokensField;
  readonly reasoningSplit: ChatCompletionsReasoningSplit;
  readonly jsonMode: ChatCompletionsJudgeJsonMode;
  readonly temperature?: number;
}

function resolveGeneration(
  options: MiniMaxJudgeRequestOptions,
): MiniMaxResolvedGeneration {
  const maxOutputTokens = options.maxOutputTokens ?? DEFAULT_MINIMAX_JUDGE_MAX_TOKENS;
  assertMaxOutputTokens(maxOutputTokens);
  const maxOutputTokensField = options.maxOutputTokensField ??
    DEFAULT_MINIMAX_JUDGE_MAX_OUTPUT_TOKENS_FIELD;
  if (maxOutputTokensField !== "max_tokens" && maxOutputTokensField !== "max_completion_tokens") {
    throw new MiniMaxJudgeConfigurationError("max_output_tokens_field_invalid");
  }
  const reasoningSplit = options.reasoningSplit ?? DEFAULT_MINIMAX_JUDGE_REASONING_SPLIT;
  if (reasoningSplit !== "enabled" && reasoningSplit !== "disabled") {
    throw new MiniMaxJudgeConfigurationError("reasoning_split_invalid");
  }
  const jsonMode = options.jsonMode ?? DEFAULT_MINIMAX_JUDGE_JSON_MODE;
  if (jsonMode !== "enabled" && jsonMode !== "disabled") {
    throw new MiniMaxJudgeConfigurationError("json_mode_invalid");
  }
  if (
    options.temperature !== undefined &&
    (!Number.isFinite(options.temperature) || options.temperature < 0 || options.temperature > 2)
  ) {
    throw new MiniMaxJudgeConfigurationError("temperature_invalid");
  }
  return {
    maxOutputTokens,
    maxOutputTokensField,
    reasoningSplit,
    jsonMode,
    ...(options.temperature === undefined ? {} : { temperature: options.temperature }),
  };
}

function toMiniMaxConfigurationError(error: unknown): never {
  if (error instanceof ChatCompletionsJudgeConfigurationError) {
    throw new MiniMaxJudgeConfigurationError(error.code);
  }
  throw error;
}

export function buildMiniMaxJudgeRequest(
  input: TutorEvalJudgeInput,
  options: MiniMaxJudgeRequestOptions,
): ChatCompletionsJudgeRequest {
  const generation = resolveGeneration(options);
  try {
    return buildChatCompletionsJudgeRequest(input, {
      model: options.model,
      prompt: options.prompt,
      promptId: options.promptId,
      promptVersion: options.promptVersion,
      reasoningSplit: generation.reasoningSplit,
      jsonMode: generation.jsonMode,
      maxOutputTokens: generation.maxOutputTokens,
      maxOutputTokensField: generation.maxOutputTokensField,
      ...(generation.temperature === undefined ? {} : { temperature: generation.temperature }),
    });
  } catch (error) {
    toMiniMaxConfigurationError(error);
  }
}

export type MiniMaxJudge = ChatCompletionsJudge;

export function createMiniMaxJudge(options: MiniMaxJudgeOptions): MiniMaxJudge {
  const environment = options.environment ?? process.env;
  const environmentConfig = readMiniMaxJudgeEnvironment(environment);
  const apiKey = options.apiKey === undefined
    ? nonEmpty(environment.MINIMAX_JUDGE_API_KEY)
    : nonEmpty(options.apiKey);
  const effectiveOptions: MiniMaxJudgeRequestOptions = {
    model: options.model,
    prompt: options.prompt,
    promptId: options.promptId,
    promptVersion: options.promptVersion,
    maxOutputTokens: options.maxOutputTokens ?? environmentConfig.maxOutputTokens,
    maxOutputTokensField: options.maxOutputTokensField ?? environmentConfig.maxOutputTokensField,
    reasoningSplit: options.reasoningSplit ?? environmentConfig.reasoningSplit,
    jsonMode: options.jsonMode ?? environmentConfig.jsonMode,
    ...(options.temperature === undefined
      ? environmentConfig.temperature === undefined
        ? {}
        : { temperature: environmentConfig.temperature }
      : { temperature: options.temperature }),
  };
  const generation = resolveGeneration(effectiveOptions);
  try {
    return createChatCompletionsJudge({
      model: effectiveOptions.model,
      prompt: effectiveOptions.prompt,
      promptId: effectiveOptions.promptId,
      promptVersion: effectiveOptions.promptVersion,
      provider: MINIMAX_JUDGE_PROVIDER,
      baseUrl: validateBaseUrl(options.baseUrl ?? environmentConfig.baseUrl),
      endpointPath: MINIMAX_JUDGE_PATH,
      apiKey,
      reasoningSplit: generation.reasoningSplit,
      jsonMode: generation.jsonMode,
      maxOutputTokens: generation.maxOutputTokens,
      maxOutputTokensField: generation.maxOutputTokensField,
      ...(generation.temperature === undefined ? {} : { temperature: generation.temperature }),
      requireReasoningSeparation: true,
      ...(options.fetch === undefined ? {} : { fetch: options.fetch }),
      timeoutMs: options.timeoutMs ?? environmentConfig.timeoutMs,
      maxAttempts: options.maxAttempts ?? environmentConfig.maxAttempts,
    });
  } catch (error) {
    toMiniMaxConfigurationError(error);
  }
}
