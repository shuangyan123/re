import assert from "node:assert/strict";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { test } from "node:test";

import {
  createHttpTutorExecutionHost,
  HttpTutorExecutionHostRequestError,
} from "../src/adapters/http-tutor-execution-host.js";
import {
  buildTutorExecutionPacketFile,
  digestTutorPrompt,
  parseTutorExecutionPacketFile,
  resolveTutorCaseLocale,
} from "../src/contracts/index.js";
import {
  buildTutorBaselineGenerationSpec,
  loadTutorBaselinePrompt,
} from "../src/corpus/index.js";
import { loadTutorEvalDataset } from "../src/datasets/index.js";

async function readRequest(request: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.from(chunk));
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>;
}

async function startServer(
  handler: (request: IncomingMessage, response: ServerResponse) => void | Promise<void>,
): Promise<{ readonly endpoint: string; readonly close: () => Promise<void> }> {
  const server = createServer(handler);
  await new Promise<void>((resolveListen, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolveListen);
  });
  const address = server.address();
  assert.ok(address !== null && typeof address !== "string");
  return {
    endpoint: `http://127.0.0.1:${address.port}/generate`,
    close: () => new Promise<void>((resolveClose, reject) => {
      server.close((error) => (error === undefined ? resolveClose() : reject(error)));
    }),
  };
}

test("canonical HTTP host sends the validated packet and sanitizes the attested response", async () => {
  const dataset = await loadTutorEvalDataset("tutor-eval-v0.2a");
  const promptAsset = await loadTutorBaselinePrompt();
  const generationSpec = buildTutorBaselineGenerationSpec(promptAsset);
  const packet = buildTutorExecutionPacketFile(
    dataset,
    [dataset.cases[0]!],
    generationSpec,
    promptAsset,
  );
  let received: Record<string, unknown> | undefined;
  const server = await startServer(async (request, response) => {
    received = await readRequest(request);
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify({
      output: {
        text: "Canonical host output.",
        metrics: {
          latencyMs: 7,
          tokenUsage: { inputTokens: 2, outputTokens: 3, totalTokens: 5, private: 99 },
          metadata: "ignored",
        },
        rawProviderPayload: "ignored",
      },
      executionSupport: { maxOutputTokens: true },
    }));
  });
  try {
    const result = await createHttpTutorExecutionHost({ endpoint: server.endpoint }).execute(packet);
    assert.deepEqual(parseTutorExecutionPacketFile(received), packet);
    assert.equal(result.output.text, "Canonical host output.");
    assert.deepEqual(result.output.metrics, {
      latencyMs: 7,
      tokenUsage: { inputTokens: 2, outputTokens: 3, totalTokens: 5 },
    });
    assert.deepEqual(result.executionSupport, { maxOutputTokens: true });
    assert.doesNotMatch(JSON.stringify(received), /evaluatorOnly|groundTruth|knownMisconception|rubrics|currentStudentMessage|studentState/);
  } finally {
    await server.close();
  }
});

test("canonical HTTP host preserves each case locale and targetLocale in the structured packet", async () => {
  const dataset = await loadTutorEvalDataset();
  const promptAsset = await loadTutorBaselinePrompt();
  const generationSpec = buildTutorBaselineGenerationSpec(promptAsset);
  const englishCase = dataset.cases.find((tutorEvalCase) =>
    resolveTutorCaseLocale(tutorEvalCase.locale) === "en",
  );
  const chineseCase = dataset.cases.find((tutorEvalCase) =>
    resolveTutorCaseLocale(tutorEvalCase.locale) === "zh-CN",
  );
  assert.ok(englishCase);
  assert.ok(chineseCase);
  const received: Record<string, unknown>[] = [];
  const server = await startServer(async (request, response) => {
    received.push(await readRequest(request));
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify({
      output: { text: "locale fixture response" },
      executionSupport: { maxOutputTokens: true },
    }));
  });
  try {
    const host = createHttpTutorExecutionHost({ endpoint: server.endpoint });
    await host.execute(buildTutorExecutionPacketFile(
      dataset,
      [englishCase],
      generationSpec,
      promptAsset,
    ));
    await host.execute(buildTutorExecutionPacketFile(
      dataset,
      [chineseCase],
      generationSpec,
      promptAsset,
    ));
    assert.equal(received.length, 2);
    for (const [index, locale] of (["en", "zh-CN"] as const).entries()) {
      const packet = parseTutorExecutionPacketFile(received[index]);
      assert.equal(packet.cases[0]?.locale, locale);
      assert.ok(packet.cases[0]?.messages.some((message) =>
        new RegExp(`targetLocale=\\"${locale}`).test(message.content),
      ));
    }
  } finally {
    await server.close();
  }
});

test("canonical HTTP host fails closed for missing support attestation and never retries", async () => {
  let requestCount = 0;
  const server = await startServer(async (_request, response) => {
    requestCount += 1;
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify({ output: { text: "not accepted" } }));
  });
  try {
    await assert.rejects(
      () => createHttpTutorExecutionHost({ endpoint: server.endpoint }).execute({
        schemaVersion: 1,
        datasetId: "dataset",
        datasetVersion: "1.0.0",
        generationSpec: {
          schemaVersion: 1,
          specId: "spec",
          specVersion: "1.0.0",
          prompt: {
            id: "prompt",
            version: "1.0.0",
            sha256: digestTutorPrompt("prompt"),
          },
          maxOutputTokens: 100,
        },
        cases: [{
          caseId: "case",
          caseVersion: "1.0.0",
          messages: [
            { role: "system", content: "prompt" },
            { role: "user", content: "context" },
            { role: "user", content: "question" },
          ],
        }],
      }),
      (error: unknown) => error instanceof HttpTutorExecutionHostRequestError &&
        /invalid response/.test(error.message),
    );
    assert.equal(requestCount, 1);
  } finally {
    await server.close();
  }
});

test("canonical HTTP host exposes only stable structural failure codes", async () => {
  const dataset = await loadTutorEvalDataset();
  const promptAsset = await loadTutorBaselinePrompt();
  const generationSpec = buildTutorBaselineGenerationSpec(promptAsset);
  const packet = buildTutorExecutionPacketFile(
    dataset,
    [dataset.cases[0]!],
    generationSpec,
    promptAsset,
  );
  for (const [status, code] of [
    [401, "unauthorized"],
    [403, "forbidden"],
    [429, "rate_limited"],
    [503, "server_error"],
  ] as const) {
    const server = await startServer(async (_request, response) => {
      response.statusCode = status;
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({ error: "provider secret body" }));
    });
    try {
      await assert.rejects(
        () => createHttpTutorExecutionHost({ endpoint: server.endpoint }).execute(packet),
        (error: unknown) => error instanceof HttpTutorExecutionHostRequestError &&
          error.code === code &&
          !error.message.includes("provider secret body"),
      );
    } finally {
      await server.close();
    }
  }

  const invalidJsonServer = await startServer(async (_request, response) => {
    response.setHeader("content-type", "application/json");
    response.end("not-json");
  });
  try {
    await assert.rejects(
      () => createHttpTutorExecutionHost({ endpoint: invalidJsonServer.endpoint }).execute(packet),
      (error: unknown) => error instanceof HttpTutorExecutionHostRequestError &&
        error.code === "invalid_json",
    );
  } finally {
    await invalidJsonServer.close();
  }

  const invalidOutputServer = await startServer(async (_request, response) => {
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify({
      output: { text: 42 },
      executionSupport: { maxOutputTokens: true },
    }));
  });
  try {
    await assert.rejects(
      () => createHttpTutorExecutionHost({ endpoint: invalidOutputServer.endpoint }).execute(packet),
      (error: unknown) => error instanceof HttpTutorExecutionHostRequestError &&
        error.code === "invalid_response",
    );
  } finally {
    await invalidOutputServer.close();
  }
});

test("canonical transport stays separate from the TutorUnderTest HTTP adapter", async () => {
  const productSource = await readFile(resolve(process.cwd(), "src/adapters/http-tutor.ts"), "utf8");
  const canonicalSource = await readFile(resolve(process.cwd(), "src/adapters/http-tutor-execution-host.ts"), "utf8");
  assert.doesNotMatch(productSource, /TutorExecutionPacket/);
  assert.doesNotMatch(canonicalSource, /implements\s+TutorUnderTest|from ["'][^"']+TutorUnderTest/);
});
