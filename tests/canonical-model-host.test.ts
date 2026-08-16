import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { createServer, type IncomingMessage } from "node:http";
import { test } from "node:test";
import { resolve } from "node:path";

import {
  buildTutorExecutionPacketFile,
  type TutorExecutionPacketFile,
} from "../src/contracts/index.js";
import {
  buildTutorBaselineGenerationSpec,
  loadTutorBaselinePrompt,
} from "../src/corpus/index.js";
import { loadTutorEvalDataset } from "../src/datasets/index.js";

interface FakeProvider {
  readonly baseURL: string;
  readonly requests: Record<string, unknown>[];
  readonly close: () => Promise<void>;
}

interface HostProcess {
  readonly endpoint: string;
  readonly child: ChildProcess;
  readonly stderr: () => string;
  readonly close: () => Promise<void>;
}

async function readJson(request: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.from(chunk));
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>;
}

async function listen(server: ReturnType<typeof createServer>): Promise<number> {
  await new Promise<void>((resolveListen, rejectListen) => {
    server.once("error", rejectListen);
    server.listen(0, "127.0.0.1", resolveListen);
  });
  const address = server.address();
  assert.ok(address !== null && typeof address !== "string");
  return address.port;
}

async function startFakeProvider(
  response: Record<string, unknown>,
  statusCode = 200,
): Promise<FakeProvider> {
  const requests: Record<string, unknown>[] = [];
  const server = createServer(async (request, serverResponse) => {
    requests.push(await readJson(request));
    serverResponse.statusCode = statusCode;
    serverResponse.setHeader("content-type", "application/json");
    serverResponse.end(JSON.stringify(response));
  });
  const port = await listen(server);
  return {
    baseURL: `http://127.0.0.1:${port}/v1`,
    requests,
    close: () => new Promise<void>((resolveClose, rejectClose) => {
      server.close((error) => (error === undefined ? resolveClose() : rejectClose(error)));
    }),
  };
}

async function startHost(baseURL: string): Promise<HostProcess> {
  const child = spawn(
    process.execPath,
    [resolve(process.cwd(), "examples/canonical-model-host/openai-server.mjs")],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        OPENAI_API_KEY: "synthetic-test-key",
        OPENAI_MODEL: "fake-model",
        OPENAI_BASE_URL: baseURL,
        OPENAI_TIMEOUT_MS: "2000",
        CANONICAL_MODEL_HOST_PORT: "0",
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  let stdout = "";
  let stderr = "";
  child.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString("utf8"); });
  const endpoint = await new Promise<string>((resolveEndpoint, rejectEndpoint) => {
    const onData = (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
      const match = stdout.match(/listening on (http:\/\/127\.0\.0\.1:\d+\/generate)/u);
      if (match?.[1] !== undefined) {
        child.stdout.off("data", onData);
        resolveEndpoint(match[1]);
      }
    };
    child.stdout.on("data", onData);
    child.once("error", rejectEndpoint);
    child.once("exit", (code) => {
      rejectEndpoint(new Error(`canonical host exited before ready: ${code ?? "unknown"}`));
    });
  });
  return {
    endpoint,
    child,
    stderr: () => stderr,
    close: async () => {
      if (child.exitCode !== null) {
        return;
      }
      child.kill();
      await once(child, "exit");
    },
  };
}

async function startChatCompletionsHost(baseURL: string): Promise<HostProcess> {
  const child = spawn(
    process.execPath,
    [resolve(process.cwd(), "examples/canonical-model-host/chat-completions-server.mjs")],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        TUTOR_MODEL_API_KEY: "synthetic-test-key",
        TUTOR_MODEL: "fake-model",
        TUTOR_MODEL_BASE_URL: baseURL,
        TUTOR_MODEL_API_PATH: "/chat/completions",
        TUTOR_MODEL_MAX_OUTPUT_TOKENS_FIELD: "max_tokens",
        TUTOR_MODEL_TIMEOUT_MS: "2000",
        CANONICAL_MODEL_HOST_PORT: "0",
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  let stdout = "";
  let stderr = "";
  child.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString("utf8"); });
  const endpoint = await new Promise<string>((resolveEndpoint, rejectEndpoint) => {
    const onData = (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
      const match = stdout.match(/listening on (http:\/\/127\.0\.0\.1:\d+\/generate)/u);
      if (match?.[1] !== undefined) {
        child.stdout.off("data", onData);
        resolveEndpoint(match[1]);
      }
    };
    child.stdout.on("data", onData);
    child.once("error", rejectEndpoint);
    child.once("exit", (code) => {
      rejectEndpoint(new Error(`generic canonical host exited before ready: ${code ?? "unknown"}`));
    });
  });
  return {
    endpoint,
    child,
    stderr: () => stderr,
    close: async () => {
      if (child.exitCode !== null) {
        return;
      }
      child.kill();
      await once(child, "exit");
    },
  };
}

async function packet(): Promise<TutorExecutionPacketFile> {
  const dataset = await loadTutorEvalDataset("tutor-eval-v0.2a");
  const promptAsset = await loadTutorBaselinePrompt();
  const generationSpec = buildTutorBaselineGenerationSpec(promptAsset);
  return buildTutorExecutionPacketFile(
    dataset,
    [dataset.cases[0]!],
    generationSpec,
    promptAsset,
  );
}

function providerResponse(
  text: string,
  output: readonly Record<string, unknown>[] = [{
    id: "message-secret",
    type: "message",
    role: "assistant",
    status: "completed",
    content: [{ type: "output_text", text }],
  }],
): Record<string, unknown> {
  return {
    id: "response-secret",
    object: "response",
    created_at: 0,
    status: "completed",
    error: null,
    incomplete_details: null,
    output_text: text,
    output,
    usage: { input_tokens: 11, output_tokens: 7, total_tokens: 18 },
  };
}

test("OpenAI canonical host forwards exact messages and baseline controls", async () => {
  const provider = await startFakeProvider(providerResponse("A fake canonical tutor response."));
  const host = await startHost(provider.baseURL);
  try {
    const executionPacket = await packet();
    const response = await fetch(host.endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(executionPacket),
    });
    assert.equal(response.status, 200);
    const body = await response.json() as Record<string, unknown>;
    assert.deepEqual(body.executionSupport, { maxOutputTokens: true });
    const output = body.output as {
      readonly text: string;
      readonly metrics: {
        readonly latencyMs: number;
        readonly tokenUsage: Record<string, number>;
      };
    };
    assert.equal(output.text, "A fake canonical tutor response.");
    assert.equal(Number.isInteger(output.metrics.latencyMs), true);
    assert.deepEqual(output.metrics.tokenUsage, {
      inputTokens: 11,
      outputTokens: 7,
      totalTokens: 18,
    });
    assert.equal(provider.requests.length, 1);
    const request = provider.requests[0]!;
    assert.equal(request.model, "fake-model");
    assert.equal(request.max_output_tokens, 1024);
    assert.equal(request.store, false);
    assert.equal("instructions" in request, false);
    assert.equal("temperature" in request, false);
    assert.equal("reasoning" in request, false);
    assert.equal("seed" in request, false);
    assert.equal("tools" in request, false);
    assert.equal("background" in request, false);
    assert.equal("stream" in request, false);
    assert.deepEqual(
      request.input,
      executionPacket.cases[0]!.messages.map((message) => ({
        role: message.role,
        content: [{ type: "input_text", text: message.content }],
      })),
    );
    const responseText = JSON.stringify(body);
    assert.doesNotMatch(responseText, /response-secret|message-secret|synthetic-test-key/u);
    assert.doesNotMatch(host.stderr(), /synthetic-test-key/u);
  } finally {
    await host.close();
    await provider.close();
  }
});

test("OpenAI canonical host preserves a provider refusal as Tutor-visible text", async () => {
  const refusal = "I cannot help with that request.";
  const provider = await startFakeProvider(providerResponse("", [{
    id: "message-secret",
    type: "message",
    role: "assistant",
    status: "completed",
    content: [{ type: "refusal", refusal }],
  }]));
  const host = await startHost(provider.baseURL);
  try {
    const response = await fetch(host.endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(await packet()),
    });
    assert.equal(response.status, 200);
    const body = await response.json() as { output: { text: string } };
    assert.equal(body.output.text, refusal);
    assert.equal(provider.requests.length, 1);
  } finally {
    await host.close();
    await provider.close();
  }
});

test("OpenAI canonical host fails provider errors without retrying", async () => {
  const provider = await startFakeProvider({ error: { message: "provider secret error" } }, 429);
  const host = await startHost(provider.baseURL);
  try {
    const response = await fetch(host.endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(await packet()),
    });
    assert.equal(response.status, 502);
    assert.deepEqual(await response.json(), { error: "provider_request_failed" });
    assert.equal(provider.requests.length, 1);
    assert.doesNotMatch(host.stderr(), /provider secret error|synthetic-test-key/u);
  } finally {
    await host.close();
    await provider.close();
  }
});

test("generic Chat Completions canonical host forwards visible messages and strips provider fields", async () => {
  const provider = await startFakeProvider({
    id: "provider-secret",
    choices: [{
      message: {
        content: "A fake Chat Completions tutor response.",
        reasoning_content: "private provider reasoning",
      },
      finish_reason: "stop",
    }],
    usage: { prompt_tokens: 13, completion_tokens: 9, total_tokens: 22 },
    rawProviderPayload: "provider secret",
  });
  const host = await startChatCompletionsHost(provider.baseURL);
  try {
    const executionPacket = await packet();
    const response = await fetch(host.endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(executionPacket),
    });
    assert.equal(response.status, 200);
    const body = await response.json() as Record<string, unknown>;
    assert.deepEqual(body.executionSupport, { maxOutputTokens: true });
    const output = body.output as {
      readonly text: string;
      readonly metrics: { readonly tokenUsage: Record<string, number> };
    };
    assert.equal(output.text, "A fake Chat Completions tutor response.");
    assert.deepEqual(output.metrics.tokenUsage, {
      inputTokens: 13,
      outputTokens: 9,
      totalTokens: 22,
    });
    assert.equal(provider.requests.length, 1);
    const request = provider.requests[0]!;
    assert.equal(request.model, "fake-model");
    assert.deepEqual(request.messages, executionPacket.cases[0]!.messages);
    assert.equal(request.max_tokens, 1024);
    assert.equal(request.stream, false);
    assert.equal("reasoning_content" in request, false);
    const responseText = JSON.stringify(body);
    assert.doesNotMatch(responseText, /provider-secret|rawProviderPayload|private provider reasoning|synthetic-test-key/u);
    assert.doesNotMatch(host.stderr(), /synthetic-test-key|provider secret/u);
  } finally {
    await host.close();
    await provider.close();
  }
});
