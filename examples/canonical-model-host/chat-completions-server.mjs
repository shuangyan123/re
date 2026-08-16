import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

import { parseTutorExecutionPacketFile } from "../../dist/src/contracts/index.js";

const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_PORT = 9001;
const DEFAULT_TIMEOUT_MS = 60_000;
const MAX_REQUEST_BYTES = 2_000_000;
const MAX_RESPONSE_BYTES = 8_000_000;

class CanonicalHostRequestError extends Error {
  constructor(code) {
    super(code);
    this.name = "CanonicalHostRequestError";
    this.code = code;
  }
}

function providerStatusCode(status) {
  if (status === 401) return "provider_unauthorized";
  if (status === 403) return "provider_forbidden";
  if (status === 429) return "provider_rate_limited";
  if (status >= 500) return "provider_server_error";
  return "provider_http_error";
}

class CanonicalHostConfigurationError extends Error {
  constructor(message) {
    super(message);
    this.name = "CanonicalHostConfigurationError";
  }
}

function requiredEnvironment(name, environment) {
  const value = environment[name]?.trim();
  if (value === undefined || value.length === 0) {
    throw new CanonicalHostConfigurationError(`${name} is required.`);
  }
  return value;
}

function positiveIntegerEnvironment(name, value, fallback) {
  if (value === undefined || value.trim().length === 0) {
    return fallback;
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new CanonicalHostConfigurationError(`${name} must be a positive integer.`);
  }
  return parsed;
}

function hostPortEnvironment(environment) {
  const value = environment.CANONICAL_MODEL_HOST_PORT?.trim();
  if (value === undefined || value.length === 0) {
    return DEFAULT_PORT;
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 65_535) {
    throw new CanonicalHostConfigurationError(
      "CANONICAL_MODEL_HOST_PORT must be an integer from 0 to 65535.",
    );
  }
  return parsed;
}

function endpointPathEnvironment(environment) {
  const path = environment.TUTOR_MODEL_API_PATH?.trim() || "/chat/completions";
  if (!path.startsWith("/") || path.includes("?") || path.includes("#") || path.includes("\\")) {
    throw new CanonicalHostConfigurationError(
      "TUTOR_MODEL_API_PATH must be an absolute path without a query or fragment.",
    );
  }
  return path;
}

function maxOutputTokensFieldEnvironment(environment) {
  const field = environment.TUTOR_MODEL_MAX_OUTPUT_TOKENS_FIELD?.trim() || "max_tokens";
  if (field !== "max_tokens" && field !== "max_completion_tokens") {
    throw new CanonicalHostConfigurationError(
      "TUTOR_MODEL_MAX_OUTPUT_TOKENS_FIELD must be max_tokens or max_completion_tokens.",
    );
  }
  return field;
}

function validateBaseUrl(environment) {
  const raw = requiredEnvironment("TUTOR_MODEL_BASE_URL", environment);
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    throw new CanonicalHostConfigurationError(
      "TUTOR_MODEL_BASE_URL must be a valid http or https URL without credentials.",
    );
  }
  if (
    (parsed.protocol !== "http:" && parsed.protocol !== "https:") ||
    parsed.username.length > 0 ||
    parsed.password.length > 0 ||
    parsed.search.length > 0 ||
    parsed.hash.length > 0
  ) {
    throw new CanonicalHostConfigurationError(
      "TUTOR_MODEL_BASE_URL must be a valid http or https URL without credentials.",
    );
  }
  return parsed.toString().replace(/\/+$/u, "");
}

function readConfiguration(environment = process.env) {
  return {
    apiKey: requiredEnvironment("TUTOR_MODEL_API_KEY", environment),
    model: requiredEnvironment("TUTOR_MODEL", environment),
    baseUrl: validateBaseUrl(environment),
    apiPath: endpointPathEnvironment(environment),
    maxOutputTokensField: maxOutputTokensFieldEnvironment(environment),
    timeoutMs: positiveIntegerEnvironment(
      "TUTOR_MODEL_TIMEOUT_MS",
      environment.TUTOR_MODEL_TIMEOUT_MS,
      DEFAULT_TIMEOUT_MS,
    ),
    port: hostPortEnvironment(environment),
  };
}

function nonNegativeInteger(value) {
  return Number.isInteger(value) && value >= 0 ? value : undefined;
}

function sanitizedTokenUsage(usage) {
  if (usage === undefined || usage === null || typeof usage !== "object") {
    return undefined;
  }
  const inputTokens = nonNegativeInteger(usage.prompt_tokens ?? usage.input_tokens);
  const outputTokens = nonNegativeInteger(usage.completion_tokens ?? usage.output_tokens);
  const totalTokens = nonNegativeInteger(usage.total_tokens);
  const result = {
    ...(inputTokens === undefined ? {} : { inputTokens }),
    ...(outputTokens === undefined ? {} : { outputTokens }),
    ...(totalTokens === undefined ? {} : { totalTokens }),
  };
  return Object.keys(result).length === 0 ? undefined : result;
}

function requestForPacket(packet, configuration) {
  const spec = packet.generationSpec;
  if (spec.seed !== undefined || spec.reasoningEffort !== undefined) {
    throw new CanonicalHostRequestError("unsupported_generation_control");
  }
  return {
    model: configuration.model,
    messages: packet.cases[0].messages,
    stream: false,
    [configuration.maxOutputTokensField]: spec.maxOutputTokens,
    ...(spec.temperature === undefined ? {} : { temperature: spec.temperature }),
  };
}

function executionSupportForPacket(packet) {
  const spec = packet.generationSpec;
  if (spec.seed !== undefined || spec.reasoningEffort !== undefined) {
    throw new CanonicalHostRequestError("unsupported_generation_control");
  }
  return {
    maxOutputTokens: true,
    ...(spec.temperature === undefined ? {} : { temperature: true }),
  };
}

function responseText(body) {
  const choices = Array.isArray(body?.choices) ? body.choices : [];
  const choice = choices[0];
  if (choice?.finish_reason === "length") {
    throw new CanonicalHostRequestError("provider_response_truncated");
  }
  const content = choice?.message?.content;
  if (typeof content !== "string" || content.trim().length === 0) {
    throw new CanonicalHostRequestError("provider_response_invalid");
  }
  const providerStatus = body?.base_resp?.status_code;
  if (typeof providerStatus === "number" && providerStatus !== 0) {
    throw new CanonicalHostRequestError("provider_response_invalid");
  }
  return content;
}

async function readUpstreamJson(response) {
  const text = await response.text();
  if (Buffer.byteLength(text, "utf8") > MAX_RESPONSE_BYTES) {
    throw new CanonicalHostRequestError("provider_response_invalid");
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new CanonicalHostRequestError("provider_response_invalid");
  }
}

async function executePacket(packet, configuration) {
  const requestBody = JSON.stringify(requestForPacket(packet, configuration));
  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), configuration.timeoutMs);
  const startedAt = performance.now();
  let response;
  try {
    response = await fetch(`${configuration.baseUrl}${configuration.apiPath}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${configuration.apiKey}`,
        "Content-Type": "application/json",
      },
      body: requestBody,
      signal: controller.signal,
    });
    if (response.status < 200 || response.status >= 300) {
      throw new CanonicalHostRequestError(providerStatusCode(response.status));
    }
    const body = await readUpstreamJson(response);
    const text = responseText(body);
    const tokenUsage = sanitizedTokenUsage(body?.usage);
    return {
      output: {
        text,
        metrics: {
          latencyMs: Math.max(0, Math.round(performance.now() - startedAt)),
          ...(tokenUsage === undefined ? {} : { tokenUsage }),
        },
      },
      executionSupport: executionSupportForPacket(packet),
    };
  } catch (error) {
    if (error instanceof CanonicalHostRequestError) {
      throw error;
    }
    if (error?.name === "AbortError") {
      throw new CanonicalHostRequestError("provider_request_timeout");
    }
    throw new CanonicalHostRequestError("provider_request_failed");
  } finally {
    clearTimeout(timeoutHandle);
  }
}

async function readJsonBody(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.from(chunk);
    size += buffer.length;
    if (size > MAX_REQUEST_BYTES) {
      throw new CanonicalHostRequestError("request_too_large");
    }
    chunks.push(buffer);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new CanonicalHostRequestError("invalid_json");
  }
}

function sendJson(response, statusCode, body) {
  response.statusCode = statusCode;
  response.setHeader("content-type", "application/json");
  response.end(JSON.stringify(body));
}

async function handleRequest(request, response, configuration) {
  if (request.method !== "POST" || request.url !== "/generate") {
    sendJson(response, 404, { error: "not_found" });
    return;
  }
  let packet;
  try {
    packet = parseTutorExecutionPacketFile(await readJsonBody(request));
    if (packet.cases.length !== 1) {
      throw new CanonicalHostRequestError("exactly_one_case_required");
    }
  } catch (error) {
    const code = error instanceof CanonicalHostRequestError && error.code === "request_too_large"
      ? error.code
      : "tutor_execution_packet_invalid";
    sendJson(response, code === "request_too_large" ? 413 : 400, { error: code });
    return;
  }
  try {
    sendJson(response, 200, await executePacket(packet, configuration));
  } catch (error) {
    const code = error instanceof CanonicalHostRequestError
      ? error.code
      : "provider_request_failed";
    const statusCode = code === "unsupported_generation_control"
      ? 422
      : code === "provider_unauthorized"
        ? 401
        : code === "provider_forbidden"
          ? 403
          : code === "provider_rate_limited"
            ? 429
            : code === "provider_request_timeout"
              ? 504
              : 502;
    sendJson(response, statusCode, { error: code });
  }
}

async function startServer(configuration) {
  const server = createServer((request, response) => {
    void handleRequest(request, response, configuration).catch(() => {
      if (!response.headersSent) {
        sendJson(response, 500, { error: "canonical_host_failed" });
      }
    });
  });
  await new Promise((resolveListen, rejectListen) => {
    server.once("error", rejectListen);
    server.listen(configuration.port, DEFAULT_HOST, resolveListen);
  });
  const address = server.address();
  if (address === null || typeof address === "string") {
    server.close();
    throw new CanonicalHostConfigurationError("Canonical model host did not bind to a TCP port.");
  }
  const endpoint = `http://${DEFAULT_HOST}:${address.port}/generate`;
  console.log(`Generic Chat Completions canonical model host listening on ${endpoint}`);
  return server;
}

async function main() {
  const configuration = readConfiguration();
  const server = await startServer(configuration);
  const close = () => new Promise((resolveClose) => {
    server.close(() => resolveClose());
  });
  process.once("SIGINT", () => { void close().then(() => process.exit(0)); });
  process.once("SIGTERM", () => { void close().then(() => process.exit(0)); });
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    await main();
  } catch (error) {
    if (error instanceof CanonicalHostConfigurationError) {
      console.error(`Canonical model host configuration failed: ${error.message}`);
    } else {
      console.error("Canonical model host failed to start.");
    }
    process.exitCode = 1;
  }
}
