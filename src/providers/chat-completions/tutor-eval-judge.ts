import {
  parseTutorEvalJudgeResult,
  TUTOR_EVAL_JUDGE_SCHEMA_VERSION,
  TutorEvalJudgeExecutionError,
  type TutorEvalJudge,
  type TutorEvalJudgeDescriptor,
  type TutorEvalJudgeInput,
  type TutorEvalJudgeMetrics,
  type TutorEvalTokenUsage,
} from "../../contracts/index.js";

export const CHAT_COMPLETIONS_JUDGE_PATH = "/chat/completions" as const;
export const DEFAULT_CHAT_COMPLETIONS_JUDGE_TIMEOUT_MS = 30_000 as const;
export const DEFAULT_CHAT_COMPLETIONS_JUDGE_MAX_ATTEMPTS = 2 as const;
export const MAX_CHAT_COMPLETIONS_JUDGE_ATTEMPTS = 3 as const;

export type ChatCompletionsJudgeConfigurationErrorCode =
  | "provider_invalid"
  | "model_missing"
  | "model_not_pinned"
  | "prompt_invalid"
  | "base_url_invalid"
  | "endpoint_path_invalid"
  | "timeout_invalid"
  | "attempts_invalid"
  | "temperature_invalid"
  | "max_tokens_invalid"
  | "json_mode_invalid"
  | "reasoning_split_invalid"
  | "max_output_tokens_field_invalid";

const configurationMessages: Readonly<
  Record<ChatCompletionsJudgeConfigurationErrorCode, string>
> = {
  provider_invalid: "The Chat Completions Judge provider identity is required.",
  model_missing: "A concrete Chat Completions Judge model is required.",
  model_not_pinned:
    "The Chat Completions Judge model must be a concrete model identity, not latest, auto, or recommended.",
  prompt_invalid: "The versioned Chat Completions Judge prompt configuration is invalid.",
  base_url_invalid: "The Chat Completions Judge base URL is invalid.",
  endpoint_path_invalid:
    "The Chat Completions Judge endpoint path must be an absolute path without a query or fragment.",
  timeout_invalid: "The Chat Completions Judge timeout must be a positive integer.",
  attempts_invalid:
    `The Chat Completions Judge max attempts must be an integer from 1 to ${MAX_CHAT_COMPLETIONS_JUDGE_ATTEMPTS}.`,
  temperature_invalid: "The Chat Completions Judge temperature must be a number from 0 to 2.",
  max_tokens_invalid: "The Chat Completions Judge output token limit must be a positive integer.",
  json_mode_invalid:
    "The Chat Completions Judge JSON mode must be enabled or disabled.",
  reasoning_split_invalid:
    "The Chat Completions Judge reasoning split mode must be enabled or disabled.",
  max_output_tokens_field_invalid:
    "The Chat Completions Judge output token field must be max_tokens or max_completion_tokens.",
};

export class ChatCompletionsJudgeConfigurationError extends Error {
  readonly code: ChatCompletionsJudgeConfigurationErrorCode;

  constructor(code: ChatCompletionsJudgeConfigurationErrorCode) {
    super(configurationMessages[code]);
    this.name = "ChatCompletionsJudgeConfigurationError";
    this.code = code;
  }
}

export interface ChatCompletionsHttpResponse {
  readonly status: number;
  json(): Promise<unknown>;
}

export interface ChatCompletionsRequestInit {
  readonly method: "POST";
  readonly headers: Record<string, string>;
  readonly body: string;
  readonly signal: AbortSignal;
}

export type ChatCompletionsFetch = (
  url: string,
  init: ChatCompletionsRequestInit,
) => Promise<ChatCompletionsHttpResponse>;

export type ChatCompletionsThinkingMode = "enabled" | "disabled";
export type ChatCompletionsReasoningSplit = "enabled" | "disabled";
export type ChatCompletionsReasoningEffort = "high" | "max";
export type ChatCompletionsJudgeJsonMode = "enabled" | "disabled";
export type ChatCompletionsMaxOutputTokensField =
  | "max_tokens"
  | "max_completion_tokens";

export interface ChatCompletionsJudgeRequestOptions {
  readonly model: string;
  readonly prompt: string;
  readonly promptId: string;
  readonly promptVersion: string;
  readonly temperature?: number;
  /** Provider-neutral representation of an optional Chat Completions control. */
  readonly thinking?: { readonly type: ChatCompletionsThinkingMode };
  /** When enabled, request providers that support it to separate thinking from content. */
  readonly reasoningSplit?: ChatCompletionsReasoningSplit;
  readonly reasoningEffort?: ChatCompletionsReasoningEffort;
  readonly maxOutputTokens?: number;
  readonly jsonMode?: ChatCompletionsJudgeJsonMode;
  readonly maxOutputTokensField?: ChatCompletionsMaxOutputTokensField;
}

export interface ChatCompletionsJudgeRequest {
  readonly model: string;
  readonly messages: readonly [
    { readonly role: "system"; readonly content: string },
    { readonly role: "user"; readonly content: string },
  ];
  /** Chat Completions JSON mode is object-only, not strict JSON Schema mode. */
  readonly response_format?: { readonly type: "json_object" };
  readonly thinking?: { readonly type: ChatCompletionsThinkingMode };
  readonly reasoning_split?: true;
  readonly reasoning_effort?: ChatCompletionsReasoningEffort;
  readonly max_tokens?: number;
  readonly max_completion_tokens?: number;
  readonly stream: false;
  readonly temperature?: number;
}

export interface ChatCompletionsJudgeOptions
  extends ChatCompletionsJudgeRequestOptions {
  readonly provider: string;
  readonly baseUrl: string;
  readonly apiKey?: string | null;
  readonly fetch?: ChatCompletionsFetch;
  readonly timeoutMs?: number;
  readonly maxAttempts?: number;
  /** Defaults to /chat/completions; the base URL remains credential-free. */
  readonly endpointPath?: string;
  /** Reject final content that still contains an unsplit reasoning wrapper. */
  readonly requireReasoningSeparation?: boolean;
}

export interface ChatCompletionsJudge extends TutorEvalJudge {
  readonly descriptor: TutorEvalJudgeDescriptor;
  readonly evaluateWithMetrics: NonNullable<TutorEvalJudge["evaluateWithMetrics"]>;
}

export interface ChatCompletionsExecutorOptions<TInput, TResult>
  extends ChatCompletionsJudgeOptions {
  readonly serializeInput: (input: TInput) => string;
  readonly parseResult: (
    content: string,
    metrics: TutorEvalJudgeMetrics,
    input: TInput,
  ) => TResult;
}

export interface ChatCompletionsExecutor<TInput, TResult> {
  readonly descriptor: TutorEvalJudgeDescriptor;
  readonly evaluateWithMetrics: (
    input: TInput,
  ) => Promise<{ readonly result: TResult; readonly metrics: TutorEvalJudgeMetrics }>;
  readonly evaluate: (input: TInput) => Promise<TResult>;
}

const unpinnedModelAliases = new Set(["latest", "auto", "recommended"]);

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function nonEmptyString(value: string | undefined | null): string | null {
  const normalized = value?.trim();
  return normalized === undefined || normalized.length === 0 ? null : normalized;
}

function normalizedEndpointPath(value: string | undefined): string {
  const path = value === undefined ? CHAT_COMPLETIONS_JUDGE_PATH : value.trim();
  if (
    path.length === 0 ||
    !path.startsWith("/") ||
    path.includes("?") ||
    path.includes("#") ||
    path.includes("\\")
  ) {
    throw new ChatCompletionsJudgeConfigurationError("endpoint_path_invalid");
  }
  return path;
}

function normalizedJsonMode(
  value: ChatCompletionsJudgeJsonMode | undefined,
): ChatCompletionsJudgeJsonMode {
  if (value === undefined || value === "enabled" || value === "disabled") {
    return value ?? "enabled";
  }
  throw new ChatCompletionsJudgeConfigurationError("json_mode_invalid");
}

function normalizedReasoningSplit(
  value: ChatCompletionsReasoningSplit | undefined,
): ChatCompletionsReasoningSplit {
  if (value === undefined || value === "enabled" || value === "disabled") {
    return value ?? "disabled";
  }
  throw new ChatCompletionsJudgeConfigurationError("reasoning_split_invalid");
}

function normalizedMaxOutputTokensField(
  value: ChatCompletionsMaxOutputTokensField | undefined,
): ChatCompletionsMaxOutputTokensField {
  if (value === undefined || value === "max_tokens" || value === "max_completion_tokens") {
    return value ?? "max_tokens";
  }
  throw new ChatCompletionsJudgeConfigurationError("max_output_tokens_field_invalid");
}

function assertRequestConfiguration(options: ChatCompletionsJudgeOptions): void {
  if (nonEmptyString(options.provider) === null) {
    throw new ChatCompletionsJudgeConfigurationError("provider_invalid");
  }
  const model = nonEmptyString(options.model);
  if (model === null) {
    throw new ChatCompletionsJudgeConfigurationError("model_missing");
  }
  if (unpinnedModelAliases.has(model.toLowerCase())) {
    throw new ChatCompletionsJudgeConfigurationError("model_not_pinned");
  }
  if (
    nonEmptyString(options.prompt) === null ||
    nonEmptyString(options.promptId) === null ||
    nonEmptyString(options.promptVersion) === null
  ) {
    throw new ChatCompletionsJudgeConfigurationError("prompt_invalid");
  }
  let baseUrl: URL;
  try {
    baseUrl = new URL(options.baseUrl);
  } catch {
    throw new ChatCompletionsJudgeConfigurationError("base_url_invalid");
  }
  if (
    (baseUrl.protocol !== "http:" && baseUrl.protocol !== "https:") ||
    baseUrl.username.length > 0 ||
    baseUrl.password.length > 0
  ) {
    throw new ChatCompletionsJudgeConfigurationError("base_url_invalid");
  }
  normalizedEndpointPath(options.endpointPath);
  normalizedJsonMode(options.jsonMode);
  normalizedReasoningSplit(options.reasoningSplit);
  normalizedMaxOutputTokensField(options.maxOutputTokensField);
  if (
    options.temperature !== undefined &&
    (!Number.isFinite(options.temperature) ||
      options.temperature < 0 ||
      options.temperature > 2)
  ) {
    throw new ChatCompletionsJudgeConfigurationError("temperature_invalid");
  }
  if (
    options.timeoutMs !== undefined &&
    (!Number.isInteger(options.timeoutMs) || options.timeoutMs < 1)
  ) {
    throw new ChatCompletionsJudgeConfigurationError("timeout_invalid");
  }
  if (
    options.maxAttempts !== undefined &&
    (!Number.isInteger(options.maxAttempts) ||
      options.maxAttempts < 1 ||
      options.maxAttempts > MAX_CHAT_COMPLETIONS_JUDGE_ATTEMPTS)
  ) {
    throw new ChatCompletionsJudgeConfigurationError("attempts_invalid");
  }
}

function serializeJudgeInput(input: TutorEvalJudgeInput): string {
  return JSON.stringify({
    kind: "TutorEvalJudgeInput",
    schemaVersion: TUTOR_EVAL_JUDGE_SCHEMA_VERSION,
    payload: input,
  });
}

function buildChatCompletionsJudgeRequestWithUserContent(
  userContent: string,
  options: ChatCompletionsJudgeRequestOptions,
): ChatCompletionsJudgeRequest {
  const model = nonEmptyString(options.model);
  if (model === null) {
    throw new ChatCompletionsJudgeConfigurationError("model_missing");
  }
  if (unpinnedModelAliases.has(model.toLowerCase())) {
    throw new ChatCompletionsJudgeConfigurationError("model_not_pinned");
  }
  if (
    nonEmptyString(options.prompt) === null ||
    nonEmptyString(options.promptId) === null ||
    nonEmptyString(options.promptVersion) === null
  ) {
    throw new ChatCompletionsJudgeConfigurationError("prompt_invalid");
  }
  const jsonMode = normalizedJsonMode(options.jsonMode);
  const reasoningSplit = normalizedReasoningSplit(options.reasoningSplit);
  const maxOutputTokensField = normalizedMaxOutputTokensField(options.maxOutputTokensField);
  if (
    options.temperature !== undefined &&
    (!Number.isFinite(options.temperature) ||
      options.temperature < 0 ||
      options.temperature > 2)
  ) {
    throw new ChatCompletionsJudgeConfigurationError("temperature_invalid");
  }
  return {
    model,
    messages: [
      { role: "system", content: options.prompt },
      { role: "user", content: userContent },
    ],
    ...(jsonMode === "enabled" ? { response_format: { type: "json_object" } } : {}),
    ...(options.thinking === undefined ? {} : { thinking: options.thinking }),
    ...(reasoningSplit === "enabled" ? { reasoning_split: true } : {}),
    ...(options.reasoningEffort === undefined
      ? {}
      : { reasoning_effort: options.reasoningEffort }),
    ...(options.maxOutputTokens === undefined
      ? {}
      : maxOutputTokensField === "max_tokens"
        ? { max_tokens: options.maxOutputTokens }
        : { max_completion_tokens: options.maxOutputTokens }),
    stream: false,
    ...(options.temperature === undefined
      ? {}
      : { temperature: options.temperature }),
  };
}

export function buildChatCompletionsJudgeRequest(
  input: TutorEvalJudgeInput,
  options: ChatCompletionsJudgeRequestOptions,
): ChatCompletionsJudgeRequest {
  return buildChatCompletionsJudgeRequestWithUserContent(
    serializeJudgeInput(input),
    options,
  );
}

function endpointFor(baseUrl: string, endpointPath: string | undefined): string {
  return `${baseUrl.replace(/\/+$/u, "")}${normalizedEndpointPath(endpointPath)}`;
}

function readStatus(error: unknown): number | null {
  const record = asRecord(error);
  return typeof record?.status === "number" ? record.status : null;
}

function isTimeoutError(error: unknown): boolean {
  return error instanceof Error && [
    "AbortError",
    "TimeoutError",
    "APIConnectionTimeoutError",
    "ETIMEDOUT",
  ].includes(error.name);
}

function isTransientTransportError(error: unknown): boolean {
  const status = readStatus(error);
  if (status !== null) {
    return status === 408 || status === 409 || status === 429 || status >= 500;
  }
  return error instanceof Error && [
    "APIConnectionError",
    "ECONNRESET",
    "ECONNREFUSED",
    "EAI_AGAIN",
    "TypeError",
  ].includes(error.name);
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function sanitizeUsage(value: unknown): TutorEvalTokenUsage | null {
  const record = asRecord(value);
  if (record === null) {
    return null;
  }
  const usage: TutorEvalTokenUsage = {
    ...(isNonNegativeInteger(record.prompt_tokens)
      ? { inputTokens: record.prompt_tokens }
      : {}),
    ...(isNonNegativeInteger(record.completion_tokens)
      ? { outputTokens: record.completion_tokens }
      : {}),
    ...(isNonNegativeInteger(record.total_tokens)
      ? { totalTokens: record.total_tokens }
      : {}),
  };
  return Object.keys(usage).length === 0 ? null : usage;
}

function buildMetrics(
  startedAt: number,
  attempts: number,
  tokenUsage: TutorEvalTokenUsage | null = null,
): TutorEvalJudgeMetrics {
  return {
    latencyMs: Math.max(0, Math.round(performance.now() - startedAt)),
    tokenUsage,
    cost: null,
    attempts,
  };
}

function extractResponseContent(value: unknown): {
  readonly content: string | null;
  readonly finishReason: unknown;
  readonly tokenUsage: TutorEvalTokenUsage | null;
} {
  const record = asRecord(value);
  const choices = record?.choices;
  const firstChoice = Array.isArray(choices) ? asRecord(choices[0]) : null;
  const tokenUsage = sanitizeUsage(record?.usage);
  const finishReason = firstChoice?.finish_reason;
  if (finishReason === "length") {
    return {
      content: null,
      finishReason,
      tokenUsage,
    };
  }
  const message = asRecord(firstChoice?.message);
  if (typeof message?.content !== "string" || message.content.trim().length === 0) {
    throw new Error("missing_chat_completion_content");
  }
  // 只读取最终 content；provider 的 reasoning_content 不属于 benchmark evidence。
  return {
    content: message.content,
    finishReason,
    tokenUsage,
  };
}

function containsReasoningWrapper(content: string): boolean {
  const normalized = content.toLowerCase();
  return normalized.includes("<think") || normalized.includes("</think");
}

function parseProviderResult(
  content: string,
  metrics: TutorEvalJudgeMetrics,
): ReturnType<typeof parseTutorEvalJudgeResult> {
  try {
    return parseTutorEvalJudgeResult(JSON.parse(content) as unknown);
  } catch {
    throw new TutorEvalJudgeExecutionError("judge_result_invalid", metrics);
  }
}

function normalizedApiKey(value: string | null | undefined): string | null {
  return nonEmptyString(value);
}

export function createChatCompletionsExecutor<TInput, TResult>(
  options: ChatCompletionsExecutorOptions<TInput, TResult>,
): ChatCompletionsExecutor<TInput, TResult> {
  assertRequestConfiguration(options);
  const timeoutMs = options.timeoutMs ?? DEFAULT_CHAT_COMPLETIONS_JUDGE_TIMEOUT_MS;
  const maxAttempts = options.maxAttempts ?? DEFAULT_CHAT_COMPLETIONS_JUDGE_MAX_ATTEMPTS;
  const apiKey = normalizedApiKey(options.apiKey);
  const requestOptions: ChatCompletionsJudgeRequestOptions = {
    model: options.model,
    prompt: options.prompt,
    promptId: options.promptId,
    promptVersion: options.promptVersion,
    ...(options.temperature === undefined ? {} : { temperature: options.temperature }),
    ...(options.thinking === undefined ? {} : { thinking: options.thinking }),
    ...(options.reasoningSplit === undefined
      ? {}
      : { reasoningSplit: options.reasoningSplit }),
    ...(options.reasoningEffort === undefined
      ? {}
      : { reasoningEffort: options.reasoningEffort }),
    ...(options.maxOutputTokens === undefined
      ? {}
      : { maxOutputTokens: options.maxOutputTokens }),
    ...(options.jsonMode === undefined ? {} : { jsonMode: options.jsonMode }),
    ...(options.maxOutputTokensField === undefined
      ? {}
      : { maxOutputTokensField: options.maxOutputTokensField }),
  };
  const fetcher: ChatCompletionsFetch = options.fetch ?? ((url, init) =>
    fetch(url, init));
  const endpoint = endpointFor(options.baseUrl, options.endpointPath);
  const requireReasoningSeparation = options.requireReasoningSeparation ?? false;
  const descriptor: TutorEvalJudgeDescriptor = {
    provider: options.provider,
    model: options.model,
    promptId: options.promptId,
    promptVersion: options.promptVersion,
    ...(options.temperature === undefined ? {} : { temperature: options.temperature }),
    ...(options.thinking === undefined
      ? {}
      : { thinkingMode: options.thinking.type }),
    ...(options.reasoningEffort === undefined
      ? {}
      : { reasoningEffort: options.reasoningEffort }),
    ...(options.maxOutputTokens === undefined
      ? {}
      : { maxOutputTokens: options.maxOutputTokens }),
    timeoutMs,
    maxAttempts,
  };

  const evaluateWithMetrics: NonNullable<
    ChatCompletionsExecutor<TInput, TResult>["evaluateWithMetrics"]
  > = async (input: TInput) => {
    if (apiKey === null) {
      throw new TutorEvalJudgeExecutionError("judge_unavailable");
    }
    const request = buildChatCompletionsJudgeRequestWithUserContent(
      options.serializeInput(input),
      requestOptions,
    );
    const requestBody = JSON.stringify(request);
    const startedAt = performance.now();
    let attempts = 0;
    while (attempts < maxAttempts) {
      attempts += 1;
      const controller = new AbortController();
      let timedOut = false;
      let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
      const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutHandle = setTimeout(() => {
          timedOut = true;
          controller.abort();
          const error = new Error("judge_timeout");
          error.name = "TimeoutError";
          reject(error);
        }, timeoutMs);
      });
      try {
        let response: ChatCompletionsHttpResponse;
        try {
          response = await Promise.race([
            fetcher(endpoint, {
              method: "POST",
              headers: {
                Authorization: `Bearer ${apiKey}`,
                "Content-Type": "application/json",
              },
              body: requestBody,
              signal: controller.signal,
            }),
            timeoutPromise,
          ]);
        } catch (error) {
          if (timedOut || isTimeoutError(error)) {
            throw new TutorEvalJudgeExecutionError(
              "judge_timeout",
              buildMetrics(startedAt, attempts),
            );
          }
          if (isTransientTransportError(error) && attempts < maxAttempts) {
            continue;
          }
          throw new TutorEvalJudgeExecutionError(
            "judge_transport_error",
            buildMetrics(startedAt, attempts),
          );
        }

        if (response.status < 200 || response.status >= 300) {
          const statusError = Object.assign(new Error("chat_completions_http_error"), {
            status: response.status,
          });
          if (isTransientTransportError(statusError) && attempts < maxAttempts) {
            continue;
          }
          throw new TutorEvalJudgeExecutionError(
            "judge_transport_error",
            buildMetrics(startedAt, attempts),
          );
        }

        let body: unknown;
        try {
          body = await Promise.race([response.json(), timeoutPromise]);
        } catch {
          if (timedOut) {
            throw new TutorEvalJudgeExecutionError(
              "judge_timeout",
              buildMetrics(startedAt, attempts),
            );
          }
          throw new TutorEvalJudgeExecutionError(
            "judge_result_invalid",
            buildMetrics(startedAt, attempts),
          );
        }
        let extracted: {
          readonly content: string | null;
          readonly finishReason: unknown;
          readonly tokenUsage: TutorEvalTokenUsage | null;
        };
        try {
          extracted = extractResponseContent(body);
        } catch {
          if (timedOut) {
            throw new TutorEvalJudgeExecutionError(
              "judge_timeout",
              buildMetrics(startedAt, attempts),
            );
          }
          throw new TutorEvalJudgeExecutionError(
            "judge_result_invalid",
            buildMetrics(startedAt, attempts, sanitizeUsage(asRecord(body)?.usage)),
          );
        }
        const metrics = buildMetrics(startedAt, attempts, extracted.tokenUsage);
        if (extracted.finishReason === "length") {
          throw new TutorEvalJudgeExecutionError("judge_output_truncated", metrics);
        }
        if (extracted.content === null) {
          throw new TutorEvalJudgeExecutionError("judge_result_invalid", metrics);
        }
        if (requireReasoningSeparation && containsReasoningWrapper(extracted.content)) {
          // Never guess which part of an unsplit provider response is the final answer.
          throw new TutorEvalJudgeExecutionError("judge_result_invalid", metrics);
        }
        let result: TResult;
        try {
          result = options.parseResult(extracted.content, metrics, input);
        } catch (error) {
          if (error instanceof TutorEvalJudgeExecutionError) {
            throw error;
          }
          throw new TutorEvalJudgeExecutionError("judge_result_invalid", metrics);
        }
        return { result, metrics };
      } catch (error) {
        if (error instanceof TutorEvalJudgeExecutionError) {
          throw error;
        }
        if (timedOut || isTimeoutError(error)) {
          throw new TutorEvalJudgeExecutionError(
            "judge_timeout",
            buildMetrics(startedAt, attempts),
          );
        }
        throw new TutorEvalJudgeExecutionError(
          "judge_transport_error",
          buildMetrics(startedAt, attempts),
        );
      } finally {
        if (timeoutHandle !== undefined) {
          clearTimeout(timeoutHandle);
        }
      }
    }
    throw new TutorEvalJudgeExecutionError(
      "judge_transport_error",
      buildMetrics(startedAt, attempts),
    );
  };

  return {
    descriptor,
    evaluateWithMetrics,
    evaluate: async (input) => (await evaluateWithMetrics(input)).result,
  };
}

export function createChatCompletionsJudge(
  options: ChatCompletionsJudgeOptions,
): ChatCompletionsJudge {
  return createChatCompletionsExecutor({
    ...options,
    serializeInput: serializeJudgeInput,
    parseResult: parseProviderResult,
  });
}
