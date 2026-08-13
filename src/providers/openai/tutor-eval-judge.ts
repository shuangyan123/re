import OpenAI from "openai";
import type {
  Response,
  ResponseCreateParamsNonStreaming,
} from "openai/resources/responses/responses.js";
import type { ReasoningEffort } from "openai/resources/shared.js";

import {
  buildTutorEvalJudgeResultJsonSchema,
  TUTOR_EVAL_JUDGE_RESULT_SCHEMA_NAME,
} from "../../judge/index.js";
import {
  BenchmarkConfigurationError,
  parseTutorEvalJudgeResult,
  TUTOR_EVAL_JUDGE_SCHEMA_VERSION,
  TutorEvalJudgeExecutionError,
  type TutorEvalJudge,
  type TutorEvalJudgeDescriptor,
  type TutorEvalJudgeInput,
  type TutorEvalJudgeMetrics,
  type TutorEvalTokenUsage,
} from "../../contracts/index.js";

export const OPENAI_JUDGE_PROVIDER = "openai" as const;
export const DEFAULT_OPENAI_JUDGE_TIMEOUT_MS = 30_000 as const;
export const DEFAULT_OPENAI_JUDGE_MAX_ATTEMPTS = 2 as const;
export const MAX_OPENAI_JUDGE_ATTEMPTS = 3 as const;

export type OpenAIReasoningEffort = Exclude<ReasoningEffort, null>;

export interface OpenAIRequestOptions {
  readonly maxRetries?: number;
  readonly timeout?: number;
  readonly signal?: AbortSignal;
}

/** Minimal injected transport surface; the SDK object never crosses core. */
export interface OpenAIResponsesClient {
  readonly responses: {
    create(
      body: ResponseCreateParamsNonStreaming,
      options?: OpenAIRequestOptions,
    ): Promise<Response>;
  };
}

export type OpenAIJudgeConfigurationErrorCode =
  | "model_missing"
  | "model_not_pinned"
  | "prompt_invalid"
  | "timeout_invalid"
  | "attempts_invalid"
  | "temperature_invalid"
  | "reasoning_effort_invalid";

const configurationMessages: Readonly<
  Record<OpenAIJudgeConfigurationErrorCode, string>
> = {
  model_missing: "OPENAI_JUDGE_MODEL is required for an OpenAI Judge run.",
  model_not_pinned:
    "OPENAI_JUDGE_MODEL must be a concrete model identity, not latest, auto, or recommended.",
  prompt_invalid: "The versioned OpenAI Judge prompt configuration is invalid.",
  timeout_invalid: "OPENAI_JUDGE_TIMEOUT_MS must be a positive integer.",
  attempts_invalid:
    `OPENAI_JUDGE_MAX_ATTEMPTS must be an integer from 1 to ${MAX_OPENAI_JUDGE_ATTEMPTS}.`,
  temperature_invalid: "OPENAI_JUDGE_TEMPERATURE must be a number from 0 to 2.",
  reasoning_effort_invalid:
    "OPENAI_JUDGE_REASONING_EFFORT is not supported by the OpenAI Responses adapter.",
};

export class OpenAIJudgeConfigurationError extends Error {
  readonly code: OpenAIJudgeConfigurationErrorCode;

  constructor(code: OpenAIJudgeConfigurationErrorCode) {
    super(configurationMessages[code]);
    this.name = "OpenAIJudgeConfigurationError";
    this.code = code;
  }
}

export interface OpenAIJudgeEnvironmentConfig {
  readonly model: string | null;
  readonly apiKeyConfigured: boolean;
  readonly timeoutMs: number;
  readonly maxAttempts: number;
  readonly temperature?: number;
  readonly reasoningEffort?: OpenAIReasoningEffort;
}

const supportedReasoningEfforts: readonly OpenAIReasoningEffort[] = [
  "none",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
] as const;

const unpinnedModelAliases = new Set(["latest", "auto", "recommended"]);

function nonEmptyEnvironmentValue(value: string | undefined): string | null {
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
    throw new OpenAIJudgeConfigurationError(code);
  }
  return parsed;
}

function parseTemperature(value: string | undefined): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 2) {
    throw new OpenAIJudgeConfigurationError("temperature_invalid");
  }
  return parsed;
}

function parseReasoningEffort(
  value: string | undefined,
): OpenAIReasoningEffort | undefined {
  const normalized = nonEmptyEnvironmentValue(value);
  if (normalized === null) {
    return undefined;
  }
  if (!supportedReasoningEfforts.includes(normalized as OpenAIReasoningEffort)) {
    throw new OpenAIJudgeConfigurationError("reasoning_effort_invalid");
  }
  return normalized as OpenAIReasoningEffort;
}

export function readOpenAIJudgeEnvironment(
  environment: NodeJS.ProcessEnv = process.env,
): OpenAIJudgeEnvironmentConfig {
  const model = nonEmptyEnvironmentValue(environment.OPENAI_JUDGE_MODEL);
  const timeoutMs = parsePositiveInteger(
    environment.OPENAI_JUDGE_TIMEOUT_MS,
    DEFAULT_OPENAI_JUDGE_TIMEOUT_MS,
    "timeout_invalid",
  );
  const maxAttempts = parsePositiveInteger(
    environment.OPENAI_JUDGE_MAX_ATTEMPTS,
    DEFAULT_OPENAI_JUDGE_MAX_ATTEMPTS,
    "attempts_invalid",
    MAX_OPENAI_JUDGE_ATTEMPTS,
  );
  const temperature = parseTemperature(environment.OPENAI_JUDGE_TEMPERATURE);
  const reasoningEffort = parseReasoningEffort(
    environment.OPENAI_JUDGE_REASONING_EFFORT,
  );
  return {
    model,
    apiKeyConfigured: nonEmptyEnvironmentValue(environment.OPENAI_API_KEY) !== null,
    timeoutMs,
    maxAttempts,
    ...(temperature === undefined ? {} : { temperature }),
    ...(reasoningEffort === undefined ? {} : { reasoningEffort }),
  };
}

export interface OpenAIJudgeRequestOptions {
  readonly model: string;
  readonly prompt: string;
  readonly temperature?: number;
  readonly reasoningEffort?: OpenAIReasoningEffort;
}

function assertConcreteModel(model: string): void {
  if (model.trim().length === 0) {
    throw new OpenAIJudgeConfigurationError("model_missing");
  }
  if (unpinnedModelAliases.has(model.trim().toLowerCase())) {
    throw new OpenAIJudgeConfigurationError("model_not_pinned");
  }
}

function assertPromptConfiguration(options: OpenAIJudgeRequestOptions & {
  readonly promptId?: string;
  readonly promptVersion?: string;
}): void {
  assertConcreteModel(options.model);
  if (
    options.prompt.trim().length === 0 ||
    options.promptId?.trim().length === 0 ||
    options.promptVersion?.trim().length === 0
  ) {
    throw new OpenAIJudgeConfigurationError("prompt_invalid");
  }
  if (
    options.temperature !== undefined &&
    (!Number.isFinite(options.temperature) ||
      options.temperature < 0 ||
      options.temperature > 2)
  ) {
    throw new OpenAIJudgeConfigurationError("temperature_invalid");
  }
  if (
    options.reasoningEffort !== undefined &&
    !supportedReasoningEfforts.includes(options.reasoningEffort)
  ) {
    throw new OpenAIJudgeConfigurationError("reasoning_effort_invalid");
  }
}

function serializeJudgeInput(input: TutorEvalJudgeInput): string {
  return JSON.stringify({
    kind: "TutorEvalJudgeInput",
    schemaVersion: TUTOR_EVAL_JUDGE_SCHEMA_VERSION,
    payload: input,
  });
}

/** Builds a single, non-streaming Responses API request without sending it. */
export function buildOpenAIJudgeRequest(
  input: TutorEvalJudgeInput,
  options: OpenAIJudgeRequestOptions & {
    readonly promptId?: string;
    readonly promptVersion?: string;
  },
): ResponseCreateParamsNonStreaming {
  assertPromptConfiguration(options);
  return {
    model: options.model,
    instructions: options.prompt,
    input: [
      {
        role: "user",
        content: [{ type: "input_text", text: serializeJudgeInput(input) }],
      },
    ],
    store: false,
    text: {
      format: {
        type: "json_schema",
        name: TUTOR_EVAL_JUDGE_RESULT_SCHEMA_NAME,
        strict: true,
        schema: buildTutorEvalJudgeResultJsonSchema(),
      },
    },
    ...(options.temperature === undefined
      ? {}
      : { temperature: options.temperature }),
    ...(options.reasoningEffort === undefined
      ? {}
      : { reasoning: { effort: options.reasoningEffort } }),
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : null;
}

function readStatus(error: unknown): number | null {
  const record = asRecord(error);
  return typeof record?.status === "number" ? record.status : null;
}

function isTimeoutError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  return (
    error.name === "AbortError" ||
    error.name === "TimeoutError" ||
    error.name === "APIConnectionTimeoutError"
  );
}

function isTransientTransportError(error: unknown): boolean {
  const status = readStatus(error);
  if (status !== null) {
    return status === 408 || status === 409 || status === 429 || status >= 500;
  }
  return (
    error instanceof Error &&
    ["APIConnectionError", "ECONNRESET", "ECONNREFUSED", "ETIMEDOUT"].includes(
      error.name,
    )
  );
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function sanitizeUsage(response: Response): TutorEvalTokenUsage | null {
  const usage = response.usage;
  if (
    usage === undefined ||
    !isNonNegativeInteger(usage.input_tokens) ||
    !isNonNegativeInteger(usage.output_tokens) ||
    !isNonNegativeInteger(usage.total_tokens)
  ) {
    return null;
  }
  return {
    inputTokens: usage.input_tokens,
    outputTokens: usage.output_tokens,
    totalTokens: usage.total_tokens,
  };
}

function buildMetrics(
  startedAt: number,
  attempts: number,
  response?: Response,
): TutorEvalJudgeMetrics {
  return {
    latencyMs: Math.max(0, Math.round(performance.now() - startedAt)),
    tokenUsage: response === undefined ? null : sanitizeUsage(response),
    cost: null,
    attempts,
  };
}

function parseStructuredResponse(
  response: Response,
  metrics: TutorEvalJudgeMetrics,
): ReturnType<typeof parseTutorEvalJudgeResult> {
  if (
    (response.status !== undefined && response.status !== "completed") ||
    typeof response.output_text !== "string" ||
    response.output_text.trim().length === 0
  ) {
    throw new TutorEvalJudgeExecutionError("judge_result_invalid", metrics);
  }
  try {
    return parseTutorEvalJudgeResult(JSON.parse(response.output_text) as unknown);
  } catch (error) {
    if (
      error instanceof TutorEvalJudgeExecutionError &&
      error.code === "judge_result_invalid"
    ) {
      throw error;
    }
    if (
      error instanceof BenchmarkConfigurationError &&
      error.code === "judge_result_invalid"
    ) {
      throw new TutorEvalJudgeExecutionError("judge_result_invalid", metrics);
    }
    throw new TutorEvalJudgeExecutionError("judge_result_invalid", metrics);
  }
}

export interface OpenAIJudgeOptions extends OpenAIJudgeRequestOptions {
  readonly promptId: string;
  readonly promptVersion: string;
  readonly client?: OpenAIResponsesClient;
  /** Environment injection is for tests; production reads process.env. */
  readonly environment?: NodeJS.ProcessEnv;
  readonly timeoutMs?: number;
  readonly maxAttempts?: number;
}

export interface OpenAIJudge extends TutorEvalJudge {
  readonly descriptor: TutorEvalJudgeDescriptor;
  readonly evaluateWithMetrics: NonNullable<TutorEvalJudge["evaluateWithMetrics"]>;
}

export function createOpenAIJudge(options: OpenAIJudgeOptions): OpenAIJudge {
  assertPromptConfiguration(options);
  if (
    options.timeoutMs !== undefined &&
    (!Number.isInteger(options.timeoutMs) || options.timeoutMs < 1)
  ) {
    throw new OpenAIJudgeConfigurationError("timeout_invalid");
  }
  const maxAttempts = options.maxAttempts ?? DEFAULT_OPENAI_JUDGE_MAX_ATTEMPTS;
  if (
    !Number.isInteger(maxAttempts) ||
    maxAttempts < 1 ||
    maxAttempts > MAX_OPENAI_JUDGE_ATTEMPTS
  ) {
    throw new OpenAIJudgeConfigurationError("attempts_invalid");
  }
  const timeoutMs = options.timeoutMs ?? DEFAULT_OPENAI_JUDGE_TIMEOUT_MS;
  const environment = options.environment ?? process.env;
  const apiKey = nonEmptyEnvironmentValue(environment.OPENAI_API_KEY);
  const client: OpenAIResponsesClient | null =
    options.client ??
    (apiKey === null ? null : new OpenAI({ apiKey, maxRetries: 0 }));
  const descriptor: TutorEvalJudgeDescriptor = {
    provider: OPENAI_JUDGE_PROVIDER,
    model: options.model,
    promptId: options.promptId,
    promptVersion: options.promptVersion,
    ...(options.temperature === undefined
      ? {}
      : { temperature: options.temperature }),
    ...(options.reasoningEffort === undefined
      ? {}
      : { reasoningEffort: options.reasoningEffort }),
  };

  const evaluateWithMetrics: NonNullable<
    TutorEvalJudge["evaluateWithMetrics"]
  > = async (input) => {
    if (client === null) {
      throw new TutorEvalJudgeExecutionError("judge_unavailable");
    }
    const request = buildOpenAIJudgeRequest(input, options);
    const startedAt = performance.now();
    let attempts = 0;
    while (attempts < maxAttempts) {
      attempts += 1;
      try {
        const response = await client.responses.create(request, {
          maxRetries: 0,
          timeout: timeoutMs,
        });
        const metrics = buildMetrics(startedAt, attempts, response);
        return {
          result: parseStructuredResponse(response, metrics),
          metrics,
        };
      } catch (error) {
        if (error instanceof TutorEvalJudgeExecutionError) {
          throw error;
        }
        if (isTimeoutError(error)) {
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
