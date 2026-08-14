import {
  buildChatCompletionsJudgeRequest,
  ChatCompletionsJudgeConfigurationError,
  createChatCompletionsJudge,
  DEFAULT_CHAT_COMPLETIONS_JUDGE_MAX_ATTEMPTS,
  DEFAULT_CHAT_COMPLETIONS_JUDGE_TIMEOUT_MS,
  MAX_CHAT_COMPLETIONS_JUDGE_ATTEMPTS,
  type ChatCompletionsFetch,
  type ChatCompletionsJudge,
  type ChatCompletionsJudgeRequest,
  type ChatCompletionsJudgeRequestOptions,
} from "../chat-completions/index.js";
import type { TutorEvalJudgeInput } from "../../contracts/index.js";

export const DEEPSEEK_JUDGE_PROVIDER = "deepseek" as const;
export const DEEPSEEK_JUDGE_BASE_URL = "https://api.deepseek.com" as const;
export const DEFAULT_DEEPSEEK_JUDGE_TIMEOUT_MS = DEFAULT_CHAT_COMPLETIONS_JUDGE_TIMEOUT_MS;
export const DEFAULT_DEEPSEEK_JUDGE_MAX_ATTEMPTS = DEFAULT_CHAT_COMPLETIONS_JUDGE_MAX_ATTEMPTS;
export const MAX_DEEPSEEK_JUDGE_ATTEMPTS = MAX_CHAT_COMPLETIONS_JUDGE_ATTEMPTS;

export type DeepSeekJudgeConfigurationErrorCode =
  | "model_missing"
  | "model_not_pinned"
  | "prompt_invalid"
  | "base_url_invalid"
  | "timeout_invalid"
  | "attempts_invalid"
  | "temperature_invalid";

export class DeepSeekJudgeConfigurationError extends Error {
  readonly code: DeepSeekJudgeConfigurationErrorCode;

  constructor(code: DeepSeekJudgeConfigurationErrorCode) {
    super(new ChatCompletionsJudgeConfigurationError(code).message);
    this.name = "DeepSeekJudgeConfigurationError";
    this.code = code;
  }
}

export interface DeepSeekJudgeEnvironmentConfig {
  readonly model: string | null;
  readonly apiKeyConfigured: boolean;
  readonly timeoutMs: number;
  readonly maxAttempts: number;
  readonly temperature?: number;
}

export interface DeepSeekJudgeRequestOptions
  extends ChatCompletionsJudgeRequestOptions {
  readonly promptId: string;
  readonly promptVersion: string;
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
  code: "timeout_invalid" | "attempts_invalid",
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

export function readDeepSeekJudgeEnvironment(
  environment: NodeJS.ProcessEnv = process.env,
): DeepSeekJudgeEnvironmentConfig {
  const temperature = parseTemperature(environment.DEEPSEEK_JUDGE_TEMPERATURE);
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
  try {
    return buildChatCompletionsJudgeRequest(input, options);
  } catch (error) {
    toGenericConfigurationError(error);
  }
}

export type DeepSeekJudge = ChatCompletionsJudge;

export function createDeepSeekJudge(options: DeepSeekJudgeOptions): DeepSeekJudge {
  const environment = options.environment ?? process.env;
  const apiKey = options.apiKey === undefined
    ? nonEmptyEnvironmentValue(environment.DEEPSEEK_API_KEY)
    : nonEmptyEnvironmentValue(options.apiKey);
  try {
    return createChatCompletionsJudge({
      ...options,
      provider: DEEPSEEK_JUDGE_PROVIDER,
      baseUrl: DEEPSEEK_JUDGE_BASE_URL,
      apiKey,
    });
  } catch (error) {
    toGenericConfigurationError(error);
  }
}
