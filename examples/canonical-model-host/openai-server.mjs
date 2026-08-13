import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

import OpenAI from "openai";

import { parseTutorExecutionPacketFile } from "../../dist/src/contracts/index.js";

const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_PORT = 9001;
const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_REQUEST_BYTES = 2_000_000;

class CanonicalHostRequestError extends Error {
  constructor(code) {
    super(code);
    this.name = "CanonicalHostRequestError";
    this.code = code;
  }
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

function validateBaseUrl(environment) {
  const raw = environment.OPENAI_BASE_URL?.trim() || "https://api.openai.com/v1";
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    throw new CanonicalHostConfigurationError(
      "OPENAI_BASE_URL must be a valid http or https URL without credentials.",
    );
  }
  if (
    (parsed.protocol !== "http:" && parsed.protocol !== "https:") ||
    parsed.username.length > 0 ||
    parsed.password.length > 0
  ) {
    throw new CanonicalHostConfigurationError(
      "OPENAI_BASE_URL must be a valid http or https URL without credentials.",
    );
  }
  return parsed.toString().replace(/\/$/u, "");
}

function readConfiguration(environment = process.env) {
  return {
    apiKey: requiredEnvironment("OPENAI_API_KEY", environment),
    model: requiredEnvironment("OPENAI_MODEL", environment),
    baseURL: validateBaseUrl(environment),
    timeoutMs: positiveIntegerEnvironment(
      "OPENAI_TIMEOUT_MS",
      environment.OPENAI_TIMEOUT_MS,
      DEFAULT_TIMEOUT_MS,
    ),
    port: hostPortEnvironment(environment),
  };
}

function inputForMessages(messages) {
  return messages.map(({ role, content }) => ({
    role,
    content: [{ type: "input_text", text: content }],
  }));
}

function requestForPacket(packet, model) {
  const spec = packet.generationSpec;
  if (spec.seed !== undefined) {
    throw new CanonicalHostRequestError("unsupported_generation_control");
  }

  return {
    model,
    input: inputForMessages(packet.cases[0].messages),
    max_output_tokens: spec.maxOutputTokens,
    store: false,
    ...(spec.temperature === undefined ? {} : { temperature: spec.temperature }),
    ...(spec.reasoningEffort === undefined
      ? {}
      : { reasoning: { effort: spec.reasoningEffort } }),
  };
}

function executionSupportForPacket(packet) {
  const spec = packet.generationSpec;
  if (spec.seed !== undefined) {
    throw new CanonicalHostRequestError("unsupported_generation_control");
  }
  return {
    maxOutputTokens: true,
    ...(spec.temperature === undefined ? {} : { temperature: true }),
    ...(spec.reasoningEffort === undefined ? {} : { reasoningEffort: true }),
  };
}

function nonNegativeInteger(value) {
  return Number.isInteger(value) && value >= 0 ? value : undefined;
}

function sanitizedTokenUsage(usage) {
  if (usage === undefined || usage === null || typeof usage !== "object") {
    return undefined;
  }
  const inputTokens = nonNegativeInteger(usage.input_tokens);
  const outputTokens = nonNegativeInteger(usage.output_tokens);
  const totalTokens = nonNegativeInteger(usage.total_tokens);
  const result = {
    ...(inputTokens === undefined ? {} : { inputTokens }),
    ...(outputTokens === undefined ? {} : { outputTokens }),
    ...(totalTokens === undefined ? {} : { totalTokens }),
  };
  return Object.keys(result).length === 0 ? undefined : result;
}

function responseText(response) {
  if (typeof response?.output_text === "string" && response.output_text.trim().length > 0) {
    return response.output_text;
  }

  const parts = [];
  for (const item of response?.output ?? []) {
    if (item?.type !== "message" || !Array.isArray(item.content)) {
      continue;
    }
    for (const content of item.content) {
      if (content?.type === "output_text" && typeof content.text === "string") {
        parts.push(content.text);
      } else if (content?.type === "refusal" && typeof content.refusal === "string") {
        parts.push(content.refusal);
      }
    }
  }
  const combined = parts.join("\n");
  if (combined.trim().length === 0) {
    throw new CanonicalHostRequestError("provider_response_invalid");
  }
  return combined;
}

async function executePacket(client, packet, model, timeoutMs) {
  const request = requestForPacket(packet, model);
  const startedAt = performance.now();
  let response;
  try {
    response = await client.responses.create(request, {
      maxRetries: 0,
      timeout: timeoutMs,
    });
  } catch {
    throw new CanonicalHostRequestError("provider_request_failed");
  }

  if (response?.status === "failed" || response?.status === "cancelled") {
    throw new CanonicalHostRequestError("provider_response_invalid");
  }
  const text = responseText(response);
  const tokenUsage = sanitizedTokenUsage(response.usage);
  const metrics = {
    latencyMs: Math.max(0, Math.round(performance.now() - startedAt)),
    ...(tokenUsage === undefined ? {} : { tokenUsage }),
  };
  return {
    output: {
      text,
      metrics,
    },
    executionSupport: executionSupportForPacket(packet),
  };
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

async function handleRequest(request, response, client, configuration) {
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
    if (error instanceof CanonicalHostRequestError && error.code === "request_too_large") {
      sendJson(response, 413, { error: error.code });
    } else {
      sendJson(response, 400, { error: "tutor_execution_packet_invalid" });
    }
    return;
  }

  try {
    sendJson(
      response,
      200,
      await executePacket(client, packet, configuration.model, configuration.timeoutMs),
    );
  } catch (error) {
    const code = error instanceof CanonicalHostRequestError
      ? error.code
      : "provider_request_failed";
    if (code === "unsupported_generation_control") {
      sendJson(response, 422, { error: code });
      return;
    }
    console.error("Canonical model host provider execution failed.");
    sendJson(
      response,
      502,
      { error: code === "provider_response_invalid" ? code : "provider_request_failed" },
    );
  }
}

async function startServer(configuration) {
  const client = new OpenAI({
    apiKey: configuration.apiKey,
    baseURL: configuration.baseURL,
    maxRetries: 0,
    timeout: configuration.timeoutMs,
  });
  const server = createServer((request, response) => {
    void handleRequest(request, response, client, configuration).catch(() => {
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
  console.log(`OpenAI canonical model host listening on ${endpoint}`);
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
