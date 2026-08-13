import assert from "node:assert/strict";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import {
  createHttpTutor,
  runTutorBenchmark,
  type TutorEvalDataset,
  type TutorTurnInput,
} from "../src/index.js";

type RequestHandler = (
  request: IncomingMessage,
  response: ServerResponse,
) => void | Promise<void>;

interface TestServer {
  readonly endpoint: string;
  readonly close: () => Promise<void>;
}

function requireRequest(
  value: Record<string, unknown> | null,
): Record<string, unknown> {
  if (value === null) {
    throw new Error("Expected a captured HTTP request.");
  }
  return value;
}

async function startServer(handler: RequestHandler): Promise<TestServer> {
  const server = createServer((request, response) => {
    void handler(request, response);
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  assert.ok(address !== null && typeof address !== "string");
  return {
    endpoint: `http://127.0.0.1:${address.port}/respond`,
    close: async () => {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error === undefined ? resolve() : reject(error)));
      });
    },
  };
}

async function readRequestBody(request: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
}

function tutorInput(): TutorTurnInput {
  return {
    scenarioId: "case-001",
    caseId: "case-001",
    caseVersion: "1.0.0",
    runIndex: 1,
    learningObjective: "Make one useful next step.",
    initialContext: "A synthetic context.",
    conversation: [
      { role: "student", text: "I am stuck." },
      { role: "tutor", text: "What have you tried?" },
    ],
    currentStudentMessage: "I tried adding the denominators.",
    studentState: {
      knownConcepts: ["fractions"],
      misconceptions: [],
      level: "developing",
      goal: "Learn the next step.",
    },
  };
}

function deterministicDataset(): TutorEvalDataset {
  return {
    id: "synthetic-http-dataset",
    version: "1.0.0",
    cases: [
      {
        schemaVersion: 1,
        id: "http-case-001",
        version: "1.0.0",
        metadata: {
          subject: "mathematics",
          topic: "fractions",
        },
        tutorInput: {
          learningObjective: "Offer one useful next step.",
          conversationHistory: [
            { role: "student", text: "I am stuck." },
            { role: "tutor", text: "What have you tried?" },
          ],
          studentMessage: "I tried adding the denominators.",
          problemContext: "A synthetic context.",
          studentProfile: {
            knownConcepts: ["fractions"],
            level: "developing",
            goal: "Learn the next step.",
          },
        },
        evaluatorOnly: {
          groundTruth: { finalAnswer: "hidden-answer" },
          knownMisconception: "hidden-misconception",
          disclosurePolicy: "hint_only",
          rubrics: [
            {
              id: "response-present",
              category: "guidance",
              criterion: "The Tutor returns a non-empty response.",
              weight: 1,
              evaluationType: "deterministic",
              evaluatorId: "empty_response",
            },
          ],
        },
      },
    ],
  };
}

function twoCaseDataset(): TutorEvalDataset {
  const dataset = deterministicDataset();
  const firstCase = dataset.cases[0];
  assert.ok(firstCase);
  return {
    ...dataset,
    cases: [
      firstCase,
      {
        ...firstCase,
        id: "http-case-002",
      },
    ],
  };
}

test("HTTP v1 fixtures preserve the small public contract", async () => {
  const fixture = (name: string) =>
    new URL(`../../fixtures/http-v1/${name}`, import.meta.url);
  const readFixture = async (name: string): Promise<Record<string, unknown>> =>
    JSON.parse(await readFile(fixture(name), "utf8")) as Record<string, unknown>;
  const [request, minimal, metrics, invalid] = await Promise.all([
    readFixture("valid-request.json"),
    readFixture("valid-minimal-response.json"),
    readFixture("valid-metrics-response.json"),
    readFixture("invalid-response.json"),
  ]);

  assert.deepEqual(Object.keys(request).sort(), [
    "caseId",
    "caseVersion",
    "conversation",
    "currentStudentMessage",
    "initialContext",
    "learningObjective",
    "runIndex",
    "scenarioId",
    "studentState",
  ]);
  assert.deepEqual(minimal, { text: "Find a common denominator first." });
  assert.deepEqual(metrics.metrics, {
    latencyMs: 12,
    tokenUsage: { inputTokens: 10, outputTokens: 8, totalTokens: 18 },
    cost: 0.001,
  });
  assert.equal(invalid.text, undefined);
  assert.doesNotMatch(JSON.stringify(request), /evaluatorOnly|groundTruth|rubrics|hidden/i);
});

test("HTTP Tutor adapter runs through the real public benchmark runner", async () => {
  let receivedRequest: Record<string, unknown> | null = null;
  const server = await startServer(async (request, response) => {
    receivedRequest = JSON.parse(await readRequestBody(request)) as Record<string, unknown>;
    response.setHeader("content-type", "application/json");
    response.end(
      JSON.stringify({
        text: "Find a common denominator first.",
        metrics: {
          latencyMs: 12,
          tokenUsage: { inputTokens: 10, outputTokens: 8, totalTokens: 18 },
          cost: 0.001,
        },
        metadata: { rawProviderPayload: "must not cross the adapter" },
      }),
    );
  });

  try {
    const result = await runTutorBenchmark({
      tutor: createHttpTutor({ id: "python-like-tutor", endpoint: server.endpoint }),
      dataset: deterministicDataset(),
      runId: "http-run",
    });

    const request = requireRequest(receivedRequest);
    assert.deepEqual(Object.keys(request).sort(), [
      "caseId",
      "caseVersion",
      "conversation",
      "currentStudentMessage",
      "initialContext",
      "learningObjective",
      "runIndex",
      "scenarioId",
      "studentState",
    ]);
    const serializedRequest = JSON.stringify(request);
    assert.doesNotMatch(
      serializedRequest,
      /evaluatorOnly|groundTruth|rubrics|rubricId|criticalFailure|Judge|reference|hidden-misconception/i,
    );
    assert.deepEqual(request.conversation, [
      { role: "student", text: "I am stuck." },
      { role: "tutor", text: "What have you tried?" },
    ]);
    assert.equal(request.caseId, "http-case-001");
    assert.equal(result.runId, "http-run");
    assert.equal(result.passedCount, 1);
    assert.equal(result.errorCount, 0);
    assert.equal(result.caseResults[0]?.rawTutorResponse, "Find a common denominator first.");
    assert.deepEqual(result.caseResults[0]?.tokenUsage, {
      inputTokens: 10,
      outputTokens: 8,
      totalTokens: 18,
    });
    assert.equal(result.caseResults[0]?.latencyMs, 12);
    assert.equal(result.caseResults[0]?.cost, 0.001);
  } finally {
    await server.close();
  }
});

test("HTTP Tutor response validation accepts minimal and sanitized metrics output", async () => {
  const server = await startServer((_request, response) => {
    response.end(
      JSON.stringify({
        text: "A useful next step.",
        metrics: {
          latencyMs: 3,
          tokenUsage: {
            inputTokens: 1,
            outputTokens: 2,
            totalTokens: 3,
            providerPrivateField: 99,
          },
          cost: 0,
        },
        apiKey: "ignored",
      }),
    );
  });
  try {
    const output = await createHttpTutor({ id: "metrics-tutor", endpoint: server.endpoint }).respond(
      tutorInput(),
    );
    assert.deepEqual(output, {
      text: "A useful next step.",
      metrics: {
        latencyMs: 3,
        tokenUsage: { inputTokens: 1, outputTokens: 2, totalTokens: 3 },
        cost: 0,
      },
    });
  } finally {
    await server.close();
  }
});

test("HTTP Tutor maps non-success responses to one adapter failure without retry", async () => {
  let requestCount = 0;
  const server = await startServer((_request, response) => {
    requestCount += 1;
    response.statusCode = 503;
    response.end(JSON.stringify({ text: "not used" }));
  });
  try {
    await assert.rejects(
      () => createHttpTutor({ id: "failure-tutor", endpoint: server.endpoint }).respond(tutorInput()),
      /non-success status/,
    );
    assert.equal(requestCount, 1);
  } finally {
    await server.close();
  }
});

test("HTTP Tutor keeps one external case failure isolated from later cases", async () => {
  let requestCount = 0;
  const server = await startServer((_request, response) => {
    requestCount += 1;
    if (requestCount === 1) {
      response.statusCode = 503;
      response.end("unavailable");
      return;
    }
    response.end(JSON.stringify({ text: "A useful next step." }));
  });
  try {
    const result = await runTutorBenchmark({
      tutor: createHttpTutor({ id: "isolated-http-tutor", endpoint: server.endpoint }),
      dataset: twoCaseDataset(),
      runId: "isolated-http-run",
    });
    assert.equal(requestCount, 2);
    assert.deepEqual(
      result.caseResults.map((caseResult) => [caseResult.caseId, caseResult.status]),
      [
        ["http-case-001", "error"],
        ["http-case-002", "passed"],
      ],
    );
    assert.equal(result.errorCount, 1);
    assert.equal(result.passedCount, 1);
  } finally {
    await server.close();
  }
});

test("HTTP Tutor rejects invalid JSON, invalid output, and invalid metrics", async () => {
  const responseBodies = [
    { body: "not-json", message: /invalid JSON/ },
    { body: JSON.stringify({}), message: /invalid Tutor output/ },
    { body: JSON.stringify({ text: "ok", metrics: { cost: -1 } }), message: /invalid Tutor output/ },
  ] as const;

  for (const responseBody of responseBodies) {
    const server = await startServer((_request, response) => {
      response.end(responseBody.body);
    });
    try {
      await assert.rejects(
        () => createHttpTutor({ id: "invalid-tutor", endpoint: server.endpoint }).respond(tutorInput()),
        responseBody.message,
      );
    } finally {
      await server.close();
    }
  }
});

test("HTTP Tutor timeout and network failures are adapter failures", async () => {
  const timeoutServer = await startServer((_request, response) => {
    const timer = setTimeout(() => response.end(JSON.stringify({ text: "late" })), 250);
    response.on("close", () => clearTimeout(timer));
  });
  try {
    await assert.rejects(
      () =>
        createHttpTutor({
          id: "timeout-tutor",
          endpoint: timeoutServer.endpoint,
          timeoutMs: 20,
        }).respond(tutorInput()),
      /timed out/,
    );
  } finally {
    await timeoutServer.close();
  }

  const networkServer = await startServer((_request, response) => {
    response.end(JSON.stringify({ text: "unused" }));
  });
  await networkServer.close();
  await assert.rejects(
    () => createHttpTutor({ id: "network-tutor", endpoint: networkServer.endpoint }).respond(tutorInput()),
    /request failed/,
  );
});

test("HTTP Tutor validates endpoint schemes, credentials, ids, and timeouts", () => {
  assert.equal(
    createHttpTutor({ id: "https-tutor", endpoint: "https://example.com/respond" }).endpoint,
    "https://example.com/respond",
  );
  assert.throws(
    () => createHttpTutor({ id: "bad-tutor", endpoint: "file:///tmp/respond" }),
    /http or https/,
  );
  assert.throws(
    () => createHttpTutor({ id: "bad-tutor", endpoint: "http://user:pass@example.com/respond" }),
    /embedded credentials/,
  );
  assert.throws(
    () => createHttpTutor({ id: "", endpoint: "http://localhost/respond" }),
    /id is required/,
  );
  assert.throws(
    () => createHttpTutor({ id: "bad-tutor", endpoint: "http://localhost/respond", timeoutMs: 0 }),
    /positive finite integer/,
  );
});

test("HTTP adapter source stays outside provider and product dependencies", async () => {
  const source = await readFile(new URL("../../src/adapters/http-tutor.ts", import.meta.url), "utf8");
  assert.doesNotMatch(source, /openai|Review Workspace|Electron|credential repository/i);
});
