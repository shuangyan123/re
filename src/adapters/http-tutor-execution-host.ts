import {
  isTutorTurnOutput,
  parseTutorExecutionPacketFile,
  type TutorExecutionPacketFile,
  type TutorGenerationSpecExecutionSupport,
  type TutorTurnMetrics,
  type TutorTurnOutput,
} from "../contracts/index.js";

export const DEFAULT_HTTP_TUTOR_EXECUTION_HOST_TIMEOUT_MS = 30_000 as const;

export interface HttpTutorExecutionHostOptions {
  readonly endpoint: string;
  readonly timeoutMs?: number;
}

export interface TutorExecutionHostResult {
  readonly output: TutorTurnOutput;
  readonly executionSupport: TutorGenerationSpecExecutionSupport;
}

export class HttpTutorExecutionHostConfigurationError extends TypeError {
  constructor(message: string) {
    super(message);
    this.name = "HttpTutorExecutionHostConfigurationError";
  }
}

export type HttpTutorExecutionHostRequestErrorCode =
  | "timeout"
  | "transport_error"
  | "unauthorized"
  | "forbidden"
  | "rate_limited"
  | "server_error"
  | "http_error"
  | "unsupported_generation_control"
  | "invalid_json"
  | "invalid_response"
  | "output_truncated";

export class HttpTutorExecutionHostRequestError extends Error {
  readonly code: HttpTutorExecutionHostRequestErrorCode;

  constructor(code: HttpTutorExecutionHostRequestErrorCode, message: string) {
    super(message);
    this.name = "HttpTutorExecutionHostRequestError";
    this.code = code;
  }
}

function validateEndpoint(endpoint: string): string {
  if (typeof endpoint !== "string" || endpoint.trim().length === 0) {
    throw new HttpTutorExecutionHostConfigurationError(
      "Canonical Tutor execution host endpoint is required.",
    );
  }
  let parsed: URL;
  try {
    parsed = new URL(endpoint.trim());
  } catch {
    throw new HttpTutorExecutionHostConfigurationError(
      "Canonical Tutor execution host endpoint must be a valid http or https URL.",
    );
  }
  if (
    (parsed.protocol !== "http:" && parsed.protocol !== "https:") ||
    parsed.username.length > 0 ||
    parsed.password.length > 0
  ) {
    throw new HttpTutorExecutionHostConfigurationError(
      "Canonical Tutor execution host endpoint must use http or https without embedded credentials.",
    );
  }
  return parsed.toString();
}

function validateTimeout(timeoutMs: number | undefined): number {
  const resolvedTimeoutMs = timeoutMs ?? DEFAULT_HTTP_TUTOR_EXECUTION_HOST_TIMEOUT_MS;
  if (!Number.isInteger(resolvedTimeoutMs) || resolvedTimeoutMs < 1) {
    throw new HttpTutorExecutionHostConfigurationError(
      "Canonical Tutor execution host timeoutMs must be a positive finite integer.",
    );
  }
  return resolvedTimeoutMs;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function hasOnlyKeys(record: Record<string, unknown>, allowed: readonly string[]): boolean {
  const allowedKeys = new Set(allowed);
  return Object.keys(record).every((key) => allowedKeys.has(key));
}

function parseExecutionSupport(
  value: unknown,
): TutorGenerationSpecExecutionSupport | null {
  const record = asRecord(value);
  if (
    record === null ||
    !hasOnlyKeys(record, ["maxOutputTokens", "temperature", "reasoningEffort", "seed"]) ||
    typeof record.maxOutputTokens !== "boolean"
  ) {
    return null;
  }
  for (const key of ["temperature", "reasoningEffort", "seed"] as const) {
    if (record[key] !== undefined && typeof record[key] !== "boolean") {
      return null;
    }
  }
  const temperature = typeof record.temperature === "boolean"
    ? record.temperature
    : undefined;
  const reasoningEffort = typeof record.reasoningEffort === "boolean"
    ? record.reasoningEffort
    : undefined;
  const seed = typeof record.seed === "boolean" ? record.seed : undefined;
  return {
    maxOutputTokens: record.maxOutputTokens as boolean,
    ...(temperature === undefined ? {} : { temperature }),
    ...(reasoningEffort === undefined ? {} : { reasoningEffort }),
    ...(seed === undefined ? {} : { seed }),
  };
}

function sanitizeMetrics(metrics: TutorTurnMetrics | undefined): TutorTurnMetrics | undefined {
  if (metrics === undefined) {
    return undefined;
  }
  const tokenUsage = metrics.tokenUsage;
  const validTokenCount = (value: number | undefined): value is number =>
    value !== undefined && Number.isInteger(value) && value >= 0;
  const sanitizedTokenUsage = tokenUsage === undefined
    ? undefined
    : {
        ...(validTokenCount(tokenUsage.inputTokens) ? { inputTokens: tokenUsage.inputTokens } : {}),
        ...(validTokenCount(tokenUsage.outputTokens) ? { outputTokens: tokenUsage.outputTokens } : {}),
        ...(validTokenCount(tokenUsage.totalTokens) ? { totalTokens: tokenUsage.totalTokens } : {}),
      };
  const hasTokenUsage = sanitizedTokenUsage !== undefined &&
    Object.keys(sanitizedTokenUsage).length > 0;
  const sanitized = {
    ...(typeof metrics.latencyMs === "number" && Number.isFinite(metrics.latencyMs) && metrics.latencyMs >= 0
      ? { latencyMs: metrics.latencyMs }
      : {}),
    ...(hasTokenUsage ? { tokenUsage: sanitizedTokenUsage } : {}),
    ...(typeof metrics.cost === "number" && Number.isFinite(metrics.cost) && metrics.cost >= 0
      ? { cost: metrics.cost }
      : {}),
  } satisfies TutorTurnMetrics;
  return Object.keys(sanitized).length === 0 ? undefined : sanitized;
}

function parseHostResponse(value: unknown): TutorExecutionHostResult {
  const record = asRecord(value);
  const output = record?.output;
  const executionSupport = parseExecutionSupport(record?.executionSupport);
  if (
    record === null ||
    !hasOnlyKeys(record, ["output", "executionSupport"]) ||
    !isTutorTurnOutput(output) ||
    executionSupport === null
  ) {
    throw new HttpTutorExecutionHostRequestError(
      "invalid_response",
      "Canonical Tutor execution host returned an invalid response.",
    );
  }
  const metrics = sanitizeMetrics(output.metrics);
  return {
    output: {
      text: output.text,
      ...(metrics === undefined ? {} : { metrics }),
    },
    executionSupport,
  };
}

const stableProviderErrorCodes: Readonly<
  Record<string, HttpTutorExecutionHostRequestErrorCode>
> = {
  provider_request_timeout: "timeout",
  provider_request_failed: "transport_error",
  provider_unauthorized: "unauthorized",
  provider_forbidden: "forbidden",
  provider_rate_limited: "rate_limited",
  provider_server_error: "server_error",
  provider_http_error: "http_error",
  unsupported_generation_control: "unsupported_generation_control",
  provider_response_invalid: "invalid_response",
  provider_response_truncated: "output_truncated",
};

async function nonSuccessCode(
  response: Response,
): Promise<HttpTutorExecutionHostRequestErrorCode> {
  try {
    const body = asRecord(await response.json());
    const providerCode = body?.error;
    if (typeof providerCode === "string") {
      const stableCode = stableProviderErrorCodes[providerCode];
      if (stableCode !== undefined) {
        return stableCode;
      }
    }
  } catch {
    // A provider/host error body is never forwarded; status remains enough.
  }
  if (response.status === 401) {
    return "unauthorized";
  }
  if (response.status === 403) {
    return "forbidden";
  }
  if (response.status === 408) {
    return "timeout";
  }
  if (response.status === 429) {
    return "rate_limited";
  }
  if (response.status >= 500) {
    return "server_error";
  }
  return "http_error";
}

/**
 * Provider-neutral transport for the canonical packet boundary. It sends the
 * validated packet as-is and is intentionally not a TutorUnderTest adapter.
 */
export class HttpTutorExecutionHost {
  readonly endpoint: string;
  readonly timeoutMs: number;

  constructor(options: HttpTutorExecutionHostOptions) {
    this.endpoint = validateEndpoint(options.endpoint);
    this.timeoutMs = validateTimeout(options.timeoutMs);
  }

  async execute(packet: TutorExecutionPacketFile): Promise<TutorExecutionHostResult> {
    const canonicalPacket = parseTutorExecutionPacketFile(packet);
    if (canonicalPacket.cases.length !== 1) {
      throw new HttpTutorExecutionHostConfigurationError(
        "Canonical Tutor execution host requests must contain exactly one case.",
      );
    }
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      let response: Response;
      try {
        response = await fetch(this.endpoint, {
          method: "POST",
          headers: {
            accept: "application/json",
            "content-type": "application/json",
          },
          body: JSON.stringify(canonicalPacket),
          signal: controller.signal,
        });
      } catch {
        if (controller.signal.aborted) {
          throw new HttpTutorExecutionHostRequestError(
            "timeout",
            "Canonical Tutor execution host request timed out.",
          );
        }
        throw new HttpTutorExecutionHostRequestError(
          "transport_error",
          "Canonical Tutor execution host request failed.",
        );
      }
      if (!response.ok) {
        throw new HttpTutorExecutionHostRequestError(
          await nonSuccessCode(response),
          "Canonical Tutor execution host returned a non-success status.",
        );
      }
      let body: unknown;
      try {
        body = await response.json();
      } catch {
        throw new HttpTutorExecutionHostRequestError(
          "invalid_json",
          "Canonical Tutor execution host returned invalid JSON.",
        );
      }
      return parseHostResponse(body);
    } finally {
      clearTimeout(timeoutId);
    }
  }
}

export function createHttpTutorExecutionHost(
  options: HttpTutorExecutionHostOptions,
): HttpTutorExecutionHost {
  return new HttpTutorExecutionHost(options);
}
