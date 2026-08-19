import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildTutorEvalJudgeInput,
  parseTutorEvalCase,
  TUTOR_EVAL_JUDGE_SCHEMA_VERSION,
  TutorEvalJudgeExecutionError,
  type TutorEvalCase,
} from "../src/contracts/index.js";
import {
  buildMiniMaxJudgeRequest,
  createMiniMaxJudge,
  DEFAULT_MINIMAX_JUDGE_JSON_MODE,
  DEFAULT_MINIMAX_JUDGE_MAX_OUTPUT_TOKENS_FIELD,
  DEFAULT_MINIMAX_JUDGE_MAX_TOKENS,
  DEFAULT_MINIMAX_JUDGE_REASONING_SPLIT,
  DEFAULT_MINIMAX_JUDGE_TIMEOUT_MS,
  MiniMaxJudgeConfigurationError,
  MINIMAX_JUDGE_BASE_URL,
  readMiniMaxJudgeEnvironment,
} from "../src/providers/minimax/index.js";
import type { ChatCompletionsFetch } from "../src/providers/chat-completions/index.js";

function makeCase(): TutorEvalCase {
  return parseTutorEvalCase({
    schemaVersion: 1,
    id: "minimax-provider-case-001",
    version: "1.0.0",
    metadata: { subject: "synthetic", topic: "MiniMax Judge" },
    tutorInput: {
      learningObjective: "Offer one next step.",
      studentMessage: "Please help.",
    },
    evaluatorOnly: {
      disclosurePolicy: "hint_only",
      rubrics: [{
        id: "minimax-guidance",
        category: "guidance",
        criterion: "The response offers a next step.",
        weight: 1,
        evaluationType: "judge",
      }],
    },
  });
}

function validResult(caseId: string): string {
  return JSON.stringify({
    schemaVersion: TUTOR_EVAL_JUDGE_SCHEMA_VERSION,
    caseId,
    rubricResults: [{
      rubricId: "minimax-guidance",
      result: "PASS",
      evidence: "The tutor proposes a concrete next step.",
    }],
    criticalFailures: [],
    factualErrors: [],
    insufficientInformation: false,
  });
}

function responseBody(content: string): { readonly status: number; json(): Promise<unknown> } {
  return {
    status: 200,
    json: async () => ({
      id: "provider-response-secret",
      choices: [{
        message: {
          content,
          reasoning_content: "provider-private-reasoning",
          reasoning_details: [{ text: "private reasoning details" }],
        },
        finish_reason: "stop",
      }],
      usage: { prompt_tokens: 12, completion_tokens: 9, total_tokens: 21 },
      rawProviderPayload: "must not persist",
    }),
  };
}

const promptOptions = {
  model: "account-confirmed-m3-model-id",
  prompt: "Tutor Judge prompt v0.9.",
  promptId: "tutor-eval-pedagogy-judge-system",
  promptVersion: "0.9",
} as const;

test("MiniMax environment uses the China canonical base and requires explicit model selection", () => {
  const environment = readMiniMaxJudgeEnvironment({});
  assert.equal(environment.model, null);
  assert.equal(environment.apiKeyConfigured, false);
  assert.equal(environment.baseUrl, MINIMAX_JUDGE_BASE_URL);
  assert.equal(environment.timeoutMs, DEFAULT_MINIMAX_JUDGE_TIMEOUT_MS);
  assert.equal(environment.maxOutputTokens, DEFAULT_MINIMAX_JUDGE_MAX_TOKENS);
  assert.equal(environment.maxOutputTokensField, DEFAULT_MINIMAX_JUDGE_MAX_OUTPUT_TOKENS_FIELD);
  assert.equal(environment.reasoningSplit, DEFAULT_MINIMAX_JUDGE_REASONING_SPLIT);
  assert.equal(environment.jsonMode, DEFAULT_MINIMAX_JUDGE_JSON_MODE);

  assert.throws(
    () => createMiniMaxJudge({ ...promptOptions, model: "", apiKey: "test-key" }),
    (error: unknown) =>
      error instanceof MiniMaxJudgeConfigurationError && error.code === "model_missing",
  );
  assert.equal(
    readMiniMaxJudgeEnvironment({ MINIMAX_JUDGE_BASE_URL: "https://operator.example/v1" }).baseUrl,
    "https://operator.example/v1",
  );
});

test("MiniMax Judge sends the explicit model, prompt v0.9, and reasoning separation request", async () => {
  const tutorEvalCase = makeCase();
  const calls: Array<{ readonly url: string; readonly init: Parameters<ChatCompletionsFetch>[1] }> = [];
  const judge = createMiniMaxJudge({
    ...promptOptions,
    apiKey: "minimax-test-secret",
    environment: {
      MINIMAX_JUDGE_MODEL: promptOptions.model,
      MINIMAX_JUDGE_MAX_TOKENS: "3072",
      MINIMAX_JUDGE_MAX_ATTEMPTS: "1",
      MINIMAX_JUDGE_TIMEOUT_MS: "45000",
    },
    fetch: async (url, init) => {
      calls.push({ url, init });
      return responseBody(validResult(tutorEvalCase.id));
    },
  });

  const evaluation = await judge.evaluateWithMetrics(
    buildTutorEvalJudgeInput(tutorEvalCase, "Candidate response."),
  );
  const call = calls[0];
  assert.ok(call);
  assert.equal(call.url, `${MINIMAX_JUDGE_BASE_URL}/chat/completions`);
  assert.equal(call.init.headers.Authorization, "Bearer minimax-test-secret");
  const request = JSON.parse(call.init.body) as Record<string, unknown>;
  assert.equal(request.model, promptOptions.model);
  assert.equal(request.response_format, undefined);
  assert.equal(request.reasoning_split, true);
  assert.equal(request.max_completion_tokens, 3072);
  assert.equal(request.max_tokens, undefined);
  assert.equal(request.stream, false);
  const messages = request.messages as readonly Record<string, unknown>[];
  assert.equal(messages[0]?.content, promptOptions.prompt);
  assert.equal((evaluation.result as { readonly caseId: string }).caseId, tutorEvalCase.id);
  assert.deepEqual(evaluation.metrics?.tokenUsage, {
    inputTokens: 12,
    outputTokens: 9,
    totalTokens: 21,
  });
  assert.doesNotMatch(
    JSON.stringify(evaluation),
    /minimax-test-secret|provider-response-secret|provider-private-reasoning|rawProviderPayload/u,
  );
});

test("MiniMax Judge fails closed for unsplit thinking, malformed JSON, and missing key", async () => {
  const tutorEvalCase = makeCase();
  let missingKeyCalls = 0;
  const missingKeyJudge = createMiniMaxJudge({
    ...promptOptions,
    environment: { MINIMAX_JUDGE_MODEL: promptOptions.model },
    fetch: async () => {
      missingKeyCalls += 1;
      return responseBody(validResult(tutorEvalCase.id));
    },
  });
  await assert.rejects(
    missingKeyJudge.evaluateWithMetrics(buildTutorEvalJudgeInput(tutorEvalCase, "Response.")),
    (error: unknown) =>
      error instanceof TutorEvalJudgeExecutionError && error.code === "judge_unavailable",
  );
  assert.equal(missingKeyCalls, 0);

  for (const content of [
    `<think>private reasoning</think>${validResult(tutorEvalCase.id)}`,
    "not-json",
  ]) {
    const judge = createMiniMaxJudge({
      ...promptOptions,
      apiKey: "test-key",
      environment: {},
      fetch: async () => responseBody(content),
    });
    await assert.rejects(
      judge.evaluateWithMetrics(buildTutorEvalJudgeInput(tutorEvalCase, "Response.")),
      (error: unknown) =>
        error instanceof TutorEvalJudgeExecutionError &&
        error.code === "judge_result_invalid" &&
        !error.message.includes("private reasoning"),
    );
  }
});

test("MiniMax request builder does not invent a model ID and keeps the canonical path", () => {
  const request = buildMiniMaxJudgeRequest(
    buildTutorEvalJudgeInput(makeCase(), "Response."),
    promptOptions,
  );
  assert.equal(request.model, promptOptions.model);
  assert.equal(request.stream, false);
  assert.equal(request.response_format, undefined);
  assert.equal(request.reasoning_split, true);
  assert.equal(request.max_completion_tokens, DEFAULT_MINIMAX_JUDGE_MAX_TOKENS);
  assert.equal((request as unknown as Record<string, unknown>).path, undefined);
});
