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
  createChatCompletionsJudge,
  readChatCompletionsJudgeEnvironment,
  type ChatCompletionsFetch,
} from "../src/providers/chat-completions/index.js";
import { runTutorEval } from "../src/runner/index.js";

function makeCase(): TutorEvalCase {
  return parseTutorEvalCase({
    schemaVersion: 1,
    id: "generic-chat-case-001",
    version: "1.0.0",
    metadata: { subject: "synthetic", topic: "generic judge" },
    tutorInput: {
      learningObjective: "Offer one next step.",
      studentMessage: "Please help.",
    },
    evaluatorOnly: {
      disclosurePolicy: "hint_only",
      rubrics: [{
        id: "generic-guidance",
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
      rubricId: "generic-guidance",
      result: "PASS",
      evidence: "The tutor proposes a concrete next step.",
    }],
    criticalFailures: [],
    factualErrors: [],
    insufficientInformation: false,
  });
}

function responseBody(content: string, finishReason = "stop") {
  return {
    status: 200,
    json: async () => ({
      choices: [{
        message: {
          content,
          reasoning_content: "private reasoning must not persist",
        },
        finish_reason: finishReason,
      }],
      usage: { prompt_tokens: 10, completion_tokens: 8, total_tokens: 18 },
      provider_payload: "must not persist",
    }),
  };
}

const baseOptions = {
  provider: "minimax",
  model: "MiniMax-Text-01",
  baseUrl: "https://api.minimax.io/v1",
  endpointPath: "/chat/completions",
  prompt: "Versioned Judge prompt.",
  promptId: "tutor-eval-pedagogy-judge-system",
  promptVersion: "0.3",
} as const;

test("generic Chat Completions environment keeps provider settings explicit", () => {
  const environment = readChatCompletionsJudgeEnvironment({
    CHAT_COMPLETIONS_JUDGE_PROVIDER: "minimax",
    CHAT_COMPLETIONS_JUDGE_MODEL: "MiniMax-Text-01",
    CHAT_COMPLETIONS_JUDGE_BASE_URL: "https://api.minimax.io/v1",
    CHAT_COMPLETIONS_JUDGE_API_PATH: "/chat/completions",
    CHAT_COMPLETIONS_JUDGE_API_KEY: "local-secret",
    CHAT_COMPLETIONS_JUDGE_MAX_OUTPUT_TOKENS_FIELD: "max_completion_tokens",
    CHAT_COMPLETIONS_JUDGE_MAX_TOKENS: "4096",
    CHAT_COMPLETIONS_JUDGE_JSON_MODE: "disabled",
    CHAT_COMPLETIONS_JUDGE_TIMEOUT_MS: "45000",
    CHAT_COMPLETIONS_JUDGE_MAX_ATTEMPTS: "1",
  });
  assert.equal(environment.provider, "minimax");
  assert.equal(environment.model, "MiniMax-Text-01");
  assert.equal(environment.maxOutputTokensField, "max_completion_tokens");
  assert.equal(environment.maxOutputTokens, 4096);
  assert.equal(environment.jsonMode, "disabled");
  assert.equal(environment.timeoutMs, 45_000);
  assert.equal(environment.maxAttempts, 1);
  assert.equal(environment.apiKeyConfigured, true);
});

test("generic Chat Completions Judge sends only the strict visible request envelope", async () => {
  const tutorEvalCase = makeCase();
  const calls: Array<{ readonly url: string; readonly init: Parameters<ChatCompletionsFetch>[1] }> = [];
  const judge = createChatCompletionsJudge({
    ...baseOptions,
    apiKey: "judge-secret",
    maxOutputTokens: 4096,
    maxOutputTokensField: "max_completion_tokens",
    jsonMode: "disabled",
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
  assert.equal(call.url, "https://api.minimax.io/v1/chat/completions");
  assert.equal(call.init.headers.Authorization, "Bearer judge-secret");
  const body = JSON.parse(call.init.body) as Record<string, unknown>;
  assert.equal(body.max_completion_tokens, 4096);
  assert.equal(body.max_tokens, undefined);
  assert.equal(body.response_format, undefined);
  assert.equal(body.stream, false);
  assert.equal((evaluation.result as { readonly caseId: string }).caseId, tutorEvalCase.id);
  assert.ok(evaluation.metrics);
  assert.deepEqual(evaluation.metrics.tokenUsage, {
    inputTokens: 10,
    outputTokens: 8,
    totalTokens: 18,
  });
  assert.doesNotMatch(JSON.stringify(evaluation), /judge-secret|reasoning_content|provider_payload/);
});

test("generic Chat Completions Judge fails closed for missing key, malformed output, HTTP errors, and timeout", async () => {
  let missingKeyCalls = 0;
  const missingKeyJudge = createChatCompletionsJudge({
    ...baseOptions,
    fetch: async () => {
      missingKeyCalls += 1;
      return responseBody(validResult(makeCase().id));
    },
  });
  await assert.rejects(
    missingKeyJudge.evaluateWithMetrics(buildTutorEvalJudgeInput(makeCase(), "Response.")),
    (error: unknown) => error instanceof TutorEvalJudgeExecutionError && error.code === "judge_unavailable",
  );
  assert.equal(missingKeyCalls, 0);

  for (const fetch of [
    async () => responseBody("not-json"),
    async () => ({ status: 401, json: async () => ({ error: "secret" }) }),
    async () => ({ status: 200, json: async () => ({ choices: [{ message: {} }] }) }),
  ] satisfies readonly ChatCompletionsFetch[]) {
    const judge = createChatCompletionsJudge({
      ...baseOptions,
      apiKey: "test-key",
      maxAttempts: 1,
      fetch,
    });
    await assert.rejects(
      judge.evaluateWithMetrics(buildTutorEvalJudgeInput(makeCase(), "Response.")),
      (error: unknown) => error instanceof TutorEvalJudgeExecutionError &&
        ["judge_result_invalid", "judge_transport_error"].includes(error.code) &&
        !error.message.includes("secret"),
    );
  }

  const timeoutJudge = createChatCompletionsJudge({
    ...baseOptions,
    apiKey: "test-key",
    timeoutMs: 5,
    maxAttempts: 3,
    fetch: async () => new Promise(() => undefined),
  });
  await assert.rejects(
    timeoutJudge.evaluateWithMetrics(buildTutorEvalJudgeInput(makeCase(), "Response.")),
    (error: unknown) => error instanceof TutorEvalJudgeExecutionError && error.code === "judge_timeout",
  );
});

test("generic Judge result still uses rubric ownership and preserves critical failures", async () => {
  const tutorEvalCase = makeCase();
  const judge = createChatCompletionsJudge({
    ...baseOptions,
    apiKey: "test-key",
    fetch: async () => responseBody(validResult(tutorEvalCase.id)),
  });
  const result = await runTutorEval({
    dataset: { id: "generic-judge-dataset", version: "1.0.0", cases: [tutorEvalCase] },
    tutor: { id: "fixture-tutor", respond: async () => ({ text: "Candidate response." }) },
    tutorDescriptor: { provider: "fixture", model: "fixture-tutor", promptVersion: "test" },
    judge: { ...judge.descriptor, evaluateWithMetrics: judge.evaluateWithMetrics },
  });
  assert.equal(result.caseResults[0]?.status, "passed");
  assert.equal(result.caseResults[0]?.rubricResults[0]?.result, "PASS");
  assert.equal(result.caseResults[0]?.criticalFailures.length, 0);
});
