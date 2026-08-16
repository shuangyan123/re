import {
  REVIEW_TRANSLATION_FAILURE_CODES,
  type ReviewTranslationFailureCode,
  type ReviewTranslationLocale,
  type ReviewTranslationSourceType,
} from "./contracts.js";

export const DEFAULT_REVIEW_TRANSLATION_TIMEOUT_MS = 30_000 as const;

export const REVIEW_TRANSLATION_INSTRUCTIONS =
  "Translate the supplied source text faithfully for human audit assistance only. Do not summarize, expand, evaluate, correct, or polish the meaning. Preserve facts, numbers, formulas, code, names, uncertainty, and errors exactly. Do not add conclusions or explanations. The translated text is not evaluation data, a gold label, or Judge evidence.";

export interface ReviewTranslationRequest {
  readonly targetLocale: ReviewTranslationLocale;
  readonly sourceType: ReviewTranslationSourceType;
  readonly caseId: string;
  readonly runIndex?: number;
  readonly fieldKey: string;
  readonly sourceText: string;
}

export interface ReviewTranslator {
  readonly provider: string;
  readonly model?: string;
  translate(request: ReviewTranslationRequest): Promise<string>;
}

export class ReviewTranslationProviderError extends Error {
  readonly code: ReviewTranslationFailureCode;

  constructor(code: ReviewTranslationFailureCode) {
    super("Review translation provider request failed.");
    this.name = "ReviewTranslationProviderError";
    this.code = code;
  }
}

export interface HttpReviewTranslatorOptions {
  readonly endpoint: string;
  readonly provider?: string;
  readonly model?: string;
  readonly timeoutMs?: number;
}

export class ReviewTranslationConfigurationError extends TypeError {
  constructor(message: string) {
    super(message);
    this.name = "ReviewTranslationConfigurationError";
  }
}

function validateEndpoint(endpoint: string): string {
  if (typeof endpoint !== "string" || endpoint.trim().length === 0) {
    throw new ReviewTranslationConfigurationError("Review translation HTTP endpoint is required.");
  }
  let parsed: URL;
  try {
    parsed = new URL(endpoint.trim());
  } catch {
    throw new ReviewTranslationConfigurationError("Review translation HTTP endpoint must be a valid URL.");
  }
  if (
    (parsed.protocol !== "http:" && parsed.protocol !== "https:") ||
    parsed.username.length > 0 ||
    parsed.password.length > 0
  ) {
    throw new ReviewTranslationConfigurationError(
      "Review translation HTTP endpoint must use http or https without embedded credentials.",
    );
  }
  return parsed.toString();
}

function validateProvider(value: string | undefined): string {
  const provider = value ?? "generic-http";
  if (provider.trim().length === 0) {
    throw new ReviewTranslationConfigurationError("Review translation provider is required.");
  }
  return provider.trim();
}

function validateModel(value: string | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (value.trim().length === 0) {
    throw new ReviewTranslationConfigurationError("Review translation model cannot be empty.");
  }
  return value.trim();
}

function validateTimeout(value: number | undefined): number {
  const timeoutMs = value ?? DEFAULT_REVIEW_TRANSLATION_TIMEOUT_MS;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1) {
    throw new ReviewTranslationConfigurationError("Review translation timeoutMs must be a positive integer.");
  }
  return timeoutMs;
}

function isResponseObject(value: unknown): value is { readonly translatedText: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    typeof (value as { readonly translatedText?: unknown }).translatedText === "string" &&
    (value as { readonly translatedText: string }).translatedText.trim().length > 0
  );
}

export class HttpReviewTranslator implements ReviewTranslator {
  readonly provider: string;
  readonly model?: string;
  readonly endpoint: string;
  readonly timeoutMs: number;

  constructor(options: HttpReviewTranslatorOptions) {
    this.endpoint = validateEndpoint(options.endpoint);
    this.provider = validateProvider(options.provider);
    const model = validateModel(options.model);
    if (model !== undefined) {
      this.model = model;
    }
    this.timeoutMs = validateTimeout(options.timeoutMs);
  }

  async translate(request: ReviewTranslationRequest): Promise<string> {
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
          body: JSON.stringify({
            schemaVersion: 1,
            reviewOnly: true,
            targetLocale: request.targetLocale,
            sourceType: request.sourceType,
            caseId: request.caseId,
            ...(request.runIndex === undefined ? {} : { runIndex: request.runIndex }),
            fieldKey: request.fieldKey,
            sourceText: request.sourceText,
            instructions: REVIEW_TRANSLATION_INSTRUCTIONS,
          }),
          signal: controller.signal,
        });
      } catch {
        throw new ReviewTranslationProviderError(
          controller.signal.aborted
            ? "translator_timeout"
            : "translator_transport_error",
        );
      }

      if (!response.ok) {
        throw new ReviewTranslationProviderError("translator_transport_error");
      }

      let body: unknown;
      try {
        body = await response.json();
      } catch {
        throw new ReviewTranslationProviderError(
          controller.signal.aborted
            ? "translator_timeout"
            : "translator_invalid_response",
        );
      }
      if (!isResponseObject(body)) {
        throw new ReviewTranslationProviderError("translator_invalid_response");
      }
      return body.translatedText;
    } finally {
      clearTimeout(timeoutId);
    }
  }
}

export function createHttpReviewTranslator(
  options: HttpReviewTranslatorOptions,
): HttpReviewTranslator {
  return new HttpReviewTranslator(options);
}

export function isReviewTranslationFailureCode(
  value: unknown,
): value is ReviewTranslationFailureCode {
  return REVIEW_TRANSLATION_FAILURE_CODES.includes(
    value as ReviewTranslationFailureCode,
  );
}
