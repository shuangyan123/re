import { isTutorTurnOutput, type TutorTurnInput, type TutorTurnMetrics, type TutorTurnOutput, type TutorUnderTest } from "../contracts/index.js";

export const DEFAULT_HTTP_TUTOR_TIMEOUT_MS = 30_000 as const;

export interface HttpTutorOptions {
  readonly id: string;
  readonly endpoint: string;
  readonly timeoutMs?: number;
}

class HttpTutorConfigurationError extends TypeError {
  constructor(message: string) {
    super(message);
    this.name = "HttpTutorConfigurationError";
  }
}

class HttpTutorRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HttpTutorRequestError";
  }
}

function validateEndpoint(endpoint: string): string {
  if (typeof endpoint !== "string" || endpoint.trim().length === 0) {
    throw new HttpTutorConfigurationError("HTTP Tutor endpoint is required.");
  }

  let parsed: URL;
  try {
    parsed = new URL(endpoint.trim());
  } catch {
    throw new HttpTutorConfigurationError(
      "HTTP Tutor endpoint must be a valid http or https URL.",
    );
  }

  if (
    (parsed.protocol !== "http:" && parsed.protocol !== "https:") ||
    parsed.username.length > 0 ||
    parsed.password.length > 0
  ) {
    throw new HttpTutorConfigurationError(
      "HTTP Tutor endpoint must use http or https without embedded credentials.",
    );
  }

  return parsed.toString();
}

function validateTimeout(timeoutMs: number | undefined): number {
  const resolvedTimeoutMs = timeoutMs ?? DEFAULT_HTTP_TUTOR_TIMEOUT_MS;
  if (!Number.isInteger(resolvedTimeoutMs) || resolvedTimeoutMs < 1) {
    throw new HttpTutorConfigurationError(
      "HTTP Tutor timeoutMs must be a positive finite integer.",
    );
  }
  return resolvedTimeoutMs;
}

function validateTutorId(id: string): string {
  if (typeof id !== "string" || id.trim().length === 0) {
    throw new HttpTutorConfigurationError("HTTP Tutor id is required.");
  }
  return id;
}

function serializeTutorTurnInput(input: TutorTurnInput): TutorTurnInput {
  return {
    scenarioId: input.scenarioId,
    ...(input.caseId === undefined ? {} : { caseId: input.caseId }),
    ...(input.caseVersion === undefined ? {} : { caseVersion: input.caseVersion }),
    ...(input.runIndex === undefined ? {} : { runIndex: input.runIndex }),
    ...(input.locale === undefined ? {} : { locale: input.locale }),
    ...(input.learningObjective === undefined
      ? {}
      : { learningObjective: input.learningObjective }),
    initialContext: input.initialContext,
    conversation: input.conversation.map((message) => ({
      role: message.role,
      text: message.text,
    })),
    currentStudentMessage: input.currentStudentMessage,
    studentState: {
      knownConcepts: [...input.studentState.knownConcepts],
      misconceptions: [...input.studentState.misconceptions],
      level: input.studentState.level,
      goal: input.studentState.goal,
    },
  };
}

function sanitizeMetrics(metrics: TutorTurnMetrics): TutorTurnMetrics {
  const tokenUsage = metrics.tokenUsage;
  return {
    ...(metrics.latencyMs === undefined ? {} : { latencyMs: metrics.latencyMs }),
    ...(tokenUsage === undefined
      ? {}
      : {
          tokenUsage: {
            ...(tokenUsage.inputTokens === undefined
              ? {}
              : { inputTokens: tokenUsage.inputTokens }),
            ...(tokenUsage.outputTokens === undefined
              ? {}
              : { outputTokens: tokenUsage.outputTokens }),
            ...(tokenUsage.totalTokens === undefined
              ? {}
              : { totalTokens: tokenUsage.totalTokens }),
          },
        }),
    ...(metrics.cost === undefined ? {} : { cost: metrics.cost }),
  };
}

function sanitizeTutorTurnOutput(value: TutorTurnOutput): TutorTurnOutput {
  return {
    text: value.text,
    ...(value.metrics === undefined ? {} : { metrics: sanitizeMetrics(value.metrics) }),
  };
}

export class HttpTutor implements TutorUnderTest {
  readonly id: string;
  readonly endpoint: string;
  readonly timeoutMs: number;

  constructor(options: HttpTutorOptions) {
    this.id = validateTutorId(options.id);
    this.endpoint = validateEndpoint(options.endpoint);
    this.timeoutMs = validateTimeout(options.timeoutMs);
  }

  async respond(input: TutorTurnInput): Promise<TutorTurnOutput> {
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
          body: JSON.stringify(serializeTutorTurnInput(input)),
          signal: controller.signal,
        });
      } catch {
        if (controller.signal.aborted) {
          throw new HttpTutorRequestError("HTTP Tutor request timed out.");
        }
        throw new HttpTutorRequestError("HTTP Tutor request failed.");
      }

      if (!response.ok) {
        throw new HttpTutorRequestError(
          "HTTP Tutor returned a non-success status.",
        );
      }

      let body: unknown;
      try {
        body = await response.json();
      } catch {
        throw new HttpTutorRequestError("HTTP Tutor returned invalid JSON.");
      }

      if (!isTutorTurnOutput(body)) {
        throw new HttpTutorRequestError(
          "HTTP Tutor returned an invalid Tutor output.",
        );
      }

      return sanitizeTutorTurnOutput(body);
    } finally {
      clearTimeout(timeoutId);
    }
  }
}

export function createHttpTutor(options: HttpTutorOptions): HttpTutor {
  return new HttpTutor(options);
}
