import assert from "node:assert/strict";
import { test } from "node:test";

import {
  assertValidTutorEvalRunResult,
  buildTutorEvalJudgeInput,
  parseTutorEvalCase,
  TUTOR_EVAL_JUDGE_SCHEMA_VERSION,
  TutorEvalJudgeExecutionError,
  type TutorEvalCase,
} from "../src/contracts/index.js";
import { runTutorEval } from "../src/runner/index.js";
import {
  buildDeepSeekJudgeRequest,
  createDeepSeekJudge,
  DEEPSEEK_JUDGE_BASE_URL,
  DEFAULT_DEEPSEEK_JUDGE_MAX_TOKENS,
  DEFAULT_DEEPSEEK_JUDGE_REASONING_EFFORT,
  DEFAULT_DEEPSEEK_JUDGE_THINKING,
  DeepSeekJudgeConfigurationError,
  readDeepSeekJudgeEnvironment,
  type ChatCompletionsFetch,
} from "../src/providers/deepseek/index.js";

function makeCase(
  rubricIds: readonly string[] = ["judge-guidance"],
): TutorEvalCase {
  return parseTutorEvalCase({
    schemaVersion: 1,
    id: "deepseek-provider-case-001",
    version: "1.0.0",
    metadata: {
      subject: "synthetic",
      topic: "provider boundary",
      tags: ["test"],
    },
    tutorInput: {
      learningObjective: "Take one useful next step.",
      studentProfile: { level: "test", goal: "test" },
      studentMessage: "Please help me.",
      problemContext: "Visible problem context.",
    },
    evaluatorOnly: {
      groundTruth: { finalAnswer: "hidden-answer" },
      knownMisconception: "Hidden misconception.",
      disclosurePolicy: "hint_only",
      rubrics: rubricIds.map((id) => ({
        id,
        category: "guidance",
        criterion: "The tutor gives a calibrated next step.",
        weight: 1,
        evaluationType: "judge",
      })),
    },
  });
}

function validResult(
  caseId: string,
  rubricIds: readonly string[] = ["judge-guidance"],
): string {
  return JSON.stringify({
    schemaVersion: TUTOR_EVAL_JUDGE_SCHEMA_VERSION,
    caseId,
    rubricResults: rubricIds.map((rubricId) => ({
      rubricId,
      result: "PASS",
      evidence: "The response asks the learner to take a concrete next step.",
    })),
    criticalFailures: [],
    factualErrors: [],
    insufficientInformation: false,
  });
}

function responseBody(
  content: string,
  usage: Record<string, unknown> = {
    prompt_tokens: 11,
    completion_tokens: 7,
    total_tokens: 18,
  },
): { readonly status: number; json(): Promise<unknown> } {
  return {
    status: 200,
    json: async () => ({
      id: "provider-response-secret",
      choices: [{
        message: {
          reasoning_content: "provider-private-reasoning",
          content,
        },
      }],
      usage,
      rawProviderPayload: "must not persist",
    }),
  };
}

function makeFetch(
  respond: (call: number, url: string, init: Parameters<ChatCompletionsFetch>[1]) => Promise<{
    readonly status: number;
    json(): Promise<unknown>;
  }>,
): { readonly fetch: ChatCompletionsFetch; readonly calls: number[] } {
  const calls: number[] = [];
  return {
    calls,
    fetch: async (url, init) => {
      calls.push(calls.length + 1);
      return respond(calls.length, url, init);
    },
  };
}

const promptOptions = {
  model: "deepseek-chat",
  prompt: "Versioned Judge prompt. Return only JSON.",
  promptId: "tutor-eval-pedagogy-judge-system",
  promptVersion: "0.2",
} as const;

test("DeepSeek environment requires explicit model identity and sanitizes configuration", () => {
  const environment = readDeepSeekJudgeEnvironment({});
  assert.equal(environment.model, null);
  assert.equal(environment.apiKeyConfigured, false);
  assert.equal(environment.timeoutMs, 30_000);
  assert.equal(environment.maxAttempts, 2);
  assert.equal(environment.thinkingMode, DEFAULT_DEEPSEEK_JUDGE_THINKING);
  assert.equal(environment.reasoningEffort, DEFAULT_DEEPSEEK_JUDGE_REASONING_EFFORT);
  assert.equal(environment.maxOutputTokens, DEFAULT_DEEPSEEK_JUDGE_MAX_TOKENS);

  assert.throws(
    () => createDeepSeekJudge({ ...promptOptions, model: "", apiKey: "test-key" }),
    (error: unknown) =>
      error instanceof DeepSeekJudgeConfigurationError && error.code === "model_missing",
  );

  assert.throws(
    () => readDeepSeekJudgeEnvironment({ DEEPSEEK_JUDGE_MAX_ATTEMPTS: "4" }),
    (error: unknown) =>
      error instanceof DeepSeekJudgeConfigurationError && error.code === "attempts_invalid",
  );
  assert.throws(
    () => createDeepSeekJudge({ ...promptOptions, model: "latest", apiKey: "test-key" }),
    (error: unknown) =>
      error instanceof DeepSeekJudgeConfigurationError && error.code === "model_not_pinned",
  );
});

test("DeepSeek generation environment is strict and fail-closed", () => {
  for (const value of ["", "automatic", "ENABLED"]) {
    assert.throws(
      () => readDeepSeekJudgeEnvironment({ DEEPSEEK_JUDGE_THINKING: value }),
      (error: unknown) =>
        error instanceof DeepSeekJudgeConfigurationError && error.code === "thinking_invalid",
    );
  }
  for (const value of ["low", "", "HIGH"]) {
    assert.throws(
      () => readDeepSeekJudgeEnvironment({ DEEPSEEK_JUDGE_REASONING_EFFORT: value }),
      (error: unknown) =>
        error instanceof DeepSeekJudgeConfigurationError &&
        error.code === "reasoning_effort_invalid",
    );
  }
  for (const value of ["high", "max"] as const) {
    assert.equal(
      readDeepSeekJudgeEnvironment({ DEEPSEEK_JUDGE_REASONING_EFFORT: value })
        .reasoningEffort,
      value,
    );
  }
  assert.throws(
    () => readDeepSeekJudgeEnvironment({
      DEEPSEEK_JUDGE_THINKING: "disabled",
      DEEPSEEK_JUDGE_REASONING_EFFORT: "high",
    }),
    (error: unknown) =>
      error instanceof DeepSeekJudgeConfigurationError &&
      error.code === "reasoning_effort_conflict",
  );
  assert.throws(
    () => readDeepSeekJudgeEnvironment({ DEEPSEEK_JUDGE_TEMPERATURE: "0" }),
    (error: unknown) =>
      error instanceof DeepSeekJudgeConfigurationError && error.code === "temperature_invalid",
  );

  for (const value of ["0", "-1", "1.5", "NaN", ""]) {
    assert.throws(
      () => readDeepSeekJudgeEnvironment({ DEEPSEEK_JUDGE_MAX_TOKENS: value }),
      (error: unknown) =>
        error instanceof DeepSeekJudgeConfigurationError && error.code === "max_tokens_invalid",
    );
  }
  for (const value of ["1", "4096", "8192"]) {
    assert.equal(
      readDeepSeekJudgeEnvironment({ DEEPSEEK_JUDGE_MAX_TOKENS: value }).maxOutputTokens,
      Number(value),
    );
  }
});

test("DeepSeek builds a provider-correct Chat Completions JSON-mode request", async () => {
  const tutorEvalCase = makeCase();
  const input = buildTutorEvalJudgeInput(tutorEvalCase, "Candidate response.");
  const calls: { readonly url: string; readonly init: Parameters<ChatCompletionsFetch>[1] }[] = [];
  const judge = createDeepSeekJudge({
    ...promptOptions,
    apiKey: "deepseek-secret",
    fetch: async (url, init) => {
      calls.push({ url, init });
      return responseBody(validResult(tutorEvalCase.id));
    },
  });

  const evaluation = await judge.evaluateWithMetrics(input);
  const firstCall = calls[0];
  assert.ok(firstCall);
  assert.equal(judge.descriptor.provider, "deepseek");
  assert.equal(judge.descriptor.model, "deepseek-chat");
  assert.equal(firstCall.url, `${DEEPSEEK_JUDGE_BASE_URL}/chat/completions`);
  assert.equal(firstCall.init.headers.Authorization, "Bearer deepseek-secret");
  const request = JSON.parse(firstCall.init.body) as Record<string, unknown>;
  assert.equal(request.model, "deepseek-chat");
  assert.equal(request.stream, false);
  assert.deepEqual(request.response_format, { type: "json_object" });
  assert.deepEqual(request.thinking, { type: "enabled" });
  assert.equal(request.reasoning_effort, "high");
  assert.equal(request.max_tokens, 4096);
  assert.equal(request.temperature, undefined);
  assert.deepEqual(judge.descriptor, {
    provider: "deepseek",
    model: "deepseek-chat",
    promptId: promptOptions.promptId,
    promptVersion: promptOptions.promptVersion,
    thinkingMode: "enabled",
    reasoningEffort: "high",
    maxOutputTokens: 4096,
  });
  const messages = request.messages as readonly Record<string, unknown>[];
  assert.equal(messages[0]?.role, "system");
  assert.equal(messages[0]?.content, promptOptions.prompt);
  const serialized = JSON.parse(messages[1]?.content as string) as Record<string, unknown>;
  assert.equal(serialized.kind, "TutorEvalJudgeInput");
  assert.equal((serialized.payload as Record<string, unknown>).caseId, tutorEvalCase.id);
  assert.equal(
    (serialized.payload as Record<string, unknown>).groundTruth,
    JSON.stringify({ finalAnswer: "hidden-answer" }),
  );
  assert.equal((evaluation.result as { readonly caseId: string }).caseId, tutorEvalCase.id);
  assert.deepEqual(evaluation.metrics?.tokenUsage, {
    inputTokens: 11,
    outputTokens: 7,
    totalTokens: 18,
  });
  assert.equal(evaluation.metrics?.attempts, 1);
  assert.doesNotMatch(
    JSON.stringify(evaluation),
    /deepseek-secret|rawProviderPayload|provider-response-secret|provider-private-reasoning/,
  );
});

test("DeepSeek disabled thinking omits reasoning effort and allows effective temperature", async () => {
  const tutorEvalCase = makeCase();
  const calls: { readonly init: Parameters<ChatCompletionsFetch>[1] }[] = [];
  const judge = createDeepSeekJudge({
    ...promptOptions,
    apiKey: "test-key",
    environment: {
      DEEPSEEK_JUDGE_THINKING: "disabled",
      DEEPSEEK_JUDGE_TEMPERATURE: "0.25",
    },
    fetch: async (_url, init) => {
      calls.push({ init });
      return responseBody(validResult(tutorEvalCase.id));
    },
  });

  await judge.evaluateWithMetrics(buildTutorEvalJudgeInput(tutorEvalCase, "Response."));
  const request = JSON.parse(calls[0]?.init.body ?? "{}") as Record<string, unknown>;
  assert.deepEqual(request.thinking, { type: "disabled" });
  assert.equal(request.reasoning_effort, undefined);
  assert.equal(request.max_tokens, 4096);
  assert.equal(request.temperature, 0.25);
  assert.deepEqual(judge.descriptor, {
    provider: "deepseek",
    model: promptOptions.model,
    promptId: promptOptions.promptId,
    promptVersion: promptOptions.promptVersion,
    thinkingMode: "disabled",
    maxOutputTokens: 4096,
    temperature: 0.25,
  });
});

test("DeepSeek generation rules reject thinking temperature and disabled reasoning", () => {
  assert.throws(
    () => createDeepSeekJudge({
      ...promptOptions,
      apiKey: "test-key",
      environment: {},
      temperature: 0,
    }),
    (error: unknown) =>
      error instanceof DeepSeekJudgeConfigurationError && error.code === "temperature_invalid",
  );
  assert.throws(
    () => createDeepSeekJudge({
      ...promptOptions,
      apiKey: "test-key",
      environment: {},
      thinkingMode: "disabled",
      reasoningEffort: "high",
    }),
    (error: unknown) =>
      error instanceof DeepSeekJudgeConfigurationError &&
      error.code === "reasoning_effort_conflict",
  );
});

test("missing DeepSeek API key is unavailable without a network call", async () => {
  let calls = 0;
  const judge = createDeepSeekJudge({
    ...promptOptions,
    environment: {},
    fetch: async () => {
      calls += 1;
      return responseBody(validResult("deepseek-provider-case-001"));
    },
  });
  await assert.rejects(
    judge.evaluateWithMetrics(buildTutorEvalJudgeInput(makeCase(), "Response.")),
    (error: unknown) =>
      error instanceof TutorEvalJudgeExecutionError && error.code === "judge_unavailable",
  );
  assert.equal(calls, 0);
});

test("DeepSeek fails closed for malformed, non-JSON, incomplete, and schema-invalid output", async () => {
  for (const content of [
    "not-json",
    "```json\n{}\n```",
    JSON.stringify({ schemaVersion: 1 }),
    "",
  ]) {
    const judge = createDeepSeekJudge({
      ...promptOptions,
      apiKey: "test-key",
      fetch: async () => (content.length === 0
        ? { status: 200, json: async () => ({ choices: [{ message: {} }] }) }
        : responseBody(content)),
    });
    await assert.rejects(
      judge.evaluateWithMetrics(buildTutorEvalJudgeInput(makeCase(), "Response.")),
      (error: unknown) =>
        error instanceof TutorEvalJudgeExecutionError &&
        error.code === "judge_result_invalid" &&
        !error.message.includes("provider-private-reasoning"),
    );
  }
});

test("DeepSeek retries bounded transient 429/5xx but not non-transient 4xx", async () => {
  const transient = makeFetch(async (call) => {
    if (call === 1) {
      return { status: 429, json: async () => ({ error: "secret" }) };
    }
    return responseBody(validResult("deepseek-provider-case-001"));
  });
  const retried = createDeepSeekJudge({
    ...promptOptions,
    apiKey: "test-key",
    maxAttempts: 2,
    fetch: transient.fetch,
  });
  const retriedResult = await retried.evaluateWithMetrics(
    buildTutorEvalJudgeInput(makeCase(), "Response."),
  );
  assert.equal(transient.calls.length, 2);
  assert.equal(retriedResult.metrics?.attempts, 2);

  const serverFailure = makeFetch(async (call) => {
    if (call === 1) {
      return { status: 503, json: async () => ({ error: "secret" }) };
    }
    return responseBody(validResult("deepseek-provider-case-001"));
  });
  const serverRetried = createDeepSeekJudge({
    ...promptOptions,
    apiKey: "test-key",
    maxAttempts: 2,
    fetch: serverFailure.fetch,
  });
  await serverRetried.evaluateWithMetrics(buildTutorEvalJudgeInput(makeCase(), "Response."));
  assert.equal(serverFailure.calls.length, 2);

  const clientFailure = makeFetch(async () => ({
    status: 400,
    json: async () => ({ error: "raw provider secret" }),
  }));
  const nonRetried = createDeepSeekJudge({
    ...promptOptions,
    apiKey: "test-key",
    maxAttempts: 3,
    fetch: clientFailure.fetch,
  });
  await assert.rejects(
    nonRetried.evaluateWithMetrics(buildTutorEvalJudgeInput(makeCase(), "Response.")),
    (error: unknown) =>
      error instanceof TutorEvalJudgeExecutionError &&
      error.code === "judge_transport_error" &&
      !error.message.includes("raw provider secret"),
  );
  assert.equal(clientFailure.calls.length, 1);
});

test("DeepSeek timeout is stable and is not retried", async () => {
  let calls = 0;
  const judge = createDeepSeekJudge({
    ...promptOptions,
    apiKey: "test-key",
    maxAttempts: 3,
    fetch: async () => {
      calls += 1;
      const error = new Error("provider secret");
      error.name = "TimeoutError";
      throw error;
    },
  });
  await assert.rejects(
    judge.evaluateWithMetrics(buildTutorEvalJudgeInput(makeCase(), "Response.")),
    (error: unknown) =>
      error instanceof TutorEvalJudgeExecutionError &&
      error.code === "judge_timeout" &&
      !error.message.includes("provider secret"),
  );
  assert.equal(calls, 1);
});

test("Chat Completions timeout remains bounded even if an injected fetch ignores AbortSignal", async () => {
  const judge = createDeepSeekJudge({
    ...promptOptions,
    apiKey: "test-key",
    timeoutMs: 5,
    fetch: async () => new Promise(() => undefined),
  });
  await assert.rejects(
    judge.evaluateWithMetrics(buildTutorEvalJudgeInput(makeCase(), "Response.")),
    (error: unknown) =>
      error instanceof TutorEvalJudgeExecutionError && error.code === "judge_timeout",
  );
});

test("DeepSeek reasoning_content is ignored by Judge and run-result serialization", async () => {
  const tutorEvalCase = makeCase();
  const judge = createDeepSeekJudge({
    ...promptOptions,
    apiKey: "test-key",
    environment: {},
    fetch: async () => responseBody(validResult(tutorEvalCase.id)),
  });
  const result = await runTutorEval({
    dataset: {
      id: "tutor-eval-v0.2a",
      version: "0.2a",
      cases: [tutorEvalCase],
    },
    tutor: {
      id: "synthetic-tutor",
      respond: async () => ({ text: "Candidate response." }),
    },
    tutorDescriptor: {
      provider: "synthetic",
      model: "synthetic-tutor",
      promptVersion: "test",
    },
    judge: {
      ...judge.descriptor,
      evaluateWithMetrics: judge.evaluateWithMetrics,
    },
  });

  assert.equal(result.caseResults[0]?.status, "passed");
  assert.doesNotThrow(() => assertValidTutorEvalRunResult(result));
  assert.doesNotMatch(
    JSON.stringify(result),
    /provider-private-reasoning|reasoning_content|rawProviderPayload/,
  );
  const legacyDescriptor = {
    provider: result.judge?.provider ?? "deepseek",
    model: result.judge?.model ?? promptOptions.model,
    promptId: result.judge?.promptId,
    promptVersion: result.judge?.promptVersion ?? promptOptions.promptVersion,
  };
  assert.doesNotThrow(() =>
    assertValidTutorEvalRunResult({ ...result, judge: legacyDescriptor }),
  );
});

test("runner keeps DeepSeek rubric ownership fail-closed", async () => {
  const tutorEvalCase = makeCase();
  const judge = createDeepSeekJudge({
    ...promptOptions,
    apiKey: "test-key",
    fetch: async () => responseBody(validResult(tutorEvalCase.id, ["unexpected-rubric"])),
  });
  const result = await runTutorEval({
    dataset: {
      id: "tutor-eval-v0.2a",
      version: "0.2a",
      cases: [tutorEvalCase],
    },
    tutor: {
      id: "synthetic-tutor",
      respond: async () => ({ text: "Candidate response." }),
    },
    tutorDescriptor: {
      provider: "synthetic",
      model: "synthetic-tutor",
      promptVersion: "test",
    },
    judge: {
      ...judge.descriptor,
      evaluateWithMetrics: judge.evaluateWithMetrics,
    },
  });
  assert.equal(result.caseResults[0]?.status, "error");
  assert.equal(result.caseResults[0]?.diagnostics[0]?.code, "judge_rubric_unexpected");
  assert.equal(result.overallScore, null);
});

test("DeepSeek request builder exposes JSON mode without claiming strict schema output", () => {
  const request = buildDeepSeekJudgeRequest(
    buildTutorEvalJudgeInput(makeCase(), "Response."),
    promptOptions,
  );
  assert.deepEqual(request.response_format, { type: "json_object" });
  assert.equal(request.stream, false);
  assert.equal((request as unknown as Record<string, unknown>).text, undefined);
});
