import assert from "node:assert/strict";
import { test } from "node:test";

import {
  MaterialRequirementJudgeExecutionError,
  type MaterialRequirementJudgeInput,
  type MaterialRequirementJudgeResult,
} from "../src/contracts/index.js";
import {
  createDeepSeekMaterialRequirementJudge,
  DEEPSEEK_JUDGE_BASE_URL,
  MaterialRequirementJudgeConfigurationError,
  type ChatCompletionsFetch,
} from "../src/providers/deepseek/index.js";
import {
  createSyntheticMaterialRequirementFixtureJudge,
  loadMaterialRequirementDiagnosticFixtures,
  runMaterialRequirementDiagnostic,
  type MaterialRequirementDiagnosticFixture,
} from "../src/judge/index.js";

function responseBody(
  content: string,
  finishReason: string | null = "stop",
  usage: Record<string, unknown> = {
    prompt_tokens: 100,
    completion_tokens: 40,
    total_tokens: 140,
  },
): { readonly status: number; json(): Promise<unknown> } {
  return {
    status: 200,
    json: async () => ({
      id: "provider-response-secret",
      choices: [{
        message: {
          reasoning_content: "secret reasoning must not persist",
          content,
        },
        finish_reason: finishReason,
      }],
      usage,
      rawProviderPayload: "must not persist",
    }),
  };
}

function materialJudgeOptions(
  fetch: ChatCompletionsFetch,
  overrides: Record<string, string> = {},
) {
  return {
    model: "deepseek-v4-flash",
    prompt: "Material Requirement Judge prompt v0.1.",
    promptId: "tutor-eval-material-requirement-judge-system",
    promptVersion: "0.1",
    fetch,
    requireReasoningSeparation: true,
    environment: {
      DEEPSEEK_API_KEY: "test-key",
      DEEPSEEK_JUDGE_MODEL: "deepseek-v4-flash",
      DEEPSEEK_JUDGE_THINKING: "disabled",
      DEEPSEEK_JUDGE_TEMPERATURE: "0",
      DEEPSEEK_JUDGE_MAX_TOKENS: "4096",
      DEEPSEEK_JUDGE_TIMEOUT_MS: "1000",
      DEEPSEEK_JUDGE_MAX_ATTEMPTS: "2",
      ...overrides,
    },
  } as const;
}

function allCases(fixtures: readonly MaterialRequirementDiagnosticFixture[]) {
  return fixtures.flatMap((fixture) => fixture.cases);
}

function validAtomicResult(fixtureCase: {
  readonly expected: MaterialRequirementJudgeResult;
}): string {
  return JSON.stringify(fixtureCase.expected);
}

test("Material DeepSeek adapter serializes complete context and preserves atomic result semantics", async () => {
  const fixtures = await loadMaterialRequirementDiagnosticFixtures();
  const cases = allCases(fixtures);
  const calls: { readonly url: string; readonly init: Parameters<ChatCompletionsFetch>[1] }[] = [];
  const fetch: ChatCompletionsFetch = async (url, init) => {
    calls.push({ url, init });
    const request = JSON.parse(init.body) as {
      readonly model: string;
      readonly messages: readonly { readonly role: string; readonly content: string }[];
      readonly thinking?: { readonly type: string };
      readonly temperature?: number;
      readonly max_tokens?: number;
    };
    const payload = JSON.parse(request.messages[1]!.content) as {
      readonly kind: string;
      readonly schemaVersion?: unknown;
      readonly payload: MaterialRequirementJudgeInput;
    };
    assert.equal(url, `${DEEPSEEK_JUDGE_BASE_URL}/chat/completions`);
    assert.equal(init.method, "POST");
    assert.equal(init.headers.Authorization, "Bearer test-key");
    assert.equal(request.model, "deepseek-v4-flash");
    assert.equal(request.messages[0]?.role, "system");
    assert.equal(request.messages[0]?.content, "Material Requirement Judge prompt v0.1.");
    assert.equal(payload.kind, "MaterialRequirementJudgeInput");
    assert.equal(payload.schemaVersion, undefined);
    assert.equal(request.thinking?.type, "disabled");
    assert.equal(request.temperature, 0);
    assert.equal(request.max_tokens, 4096);
    assert.match(payload.payload.studentMessage, /measurement|reluctant|unsure/i);
    assert.equal(typeof payload.payload.problemContext, "string");
    assert.equal(typeof payload.payload.groundTruth, "string");
    assert.equal(typeof payload.payload.knownMisconception, "string");
    assert.equal(typeof payload.payload.tutorResponse, "string");
    assert.ok(payload.payload.rubrics[0]?.requirements.length);
    const fixtureCase = cases.find((candidate) => candidate.input.caseId === payload.payload.caseId);
    assert.ok(fixtureCase);
    return responseBody(validAtomicResult(fixtureCase));
  };
  const judge = createDeepSeekMaterialRequirementJudge(materialJudgeOptions(fetch));
  const report = await runMaterialRequirementDiagnostic(judge, fixtures, {
    mode: "live",
    provider: "deepseek",
    model: judge.descriptor.model,
  });
  assert.equal(calls.length, 6);
  assert.equal(report.plannedCalls, 6);
  assert.equal(report.completedCalls, 6);
  assert.deepEqual(report.semanticAvailability, {
    observedCases: 6,
    plannedCases: 6,
    share: 1,
  });
  assert.equal(report.executionErrors.count, 0);
  assert.equal(report.tokenUsageCoverage.totalTokens.completeTotal, 840);
  assert.equal(report.tokenUsageCoverage.totalTokens.knownTotal, 840);
  assert.equal(report.fixtures[0]!.cases[0]!.attempts, 1);
  assert.equal(report.fixtures[0]!.cases[0]!.cost, null);
  assert.match(JSON.stringify(report), /synthetic-fixture/);
  assert.doesNotMatch(JSON.stringify(report), /test-key|reasoning_content|rawProviderPayload|secret reasoning/);
});

test("Material DeepSeek adapter strictly parses atomic results and rejects provider labels", async () => {
  const fixtures = await loadMaterialRequirementDiagnosticFixtures();
  const fixtureCase = fixtures[0]!.cases[0]!;
  const fetch: ChatCompletionsFetch = async () => responseBody(JSON.stringify({
    schemaVersion: 1,
    caseId: fixtureCase.input.caseId,
    rubricAssessments: [{
      rubricId: fixtureCase.input.rubrics[0]!.id,
      requirements: fixtureCase.input.rubrics[0]!.requirements.map((requirement) => ({
        requirementId: requirement.id,
        status: "PASS",
      })),
    }],
  }));
  const judge = createDeepSeekMaterialRequirementJudge(materialJudgeOptions(fetch));
  await assert.rejects(
    judge.evaluateWithMetrics(fixtureCase.input),
    (error: unknown) =>
      error instanceof MaterialRequirementJudgeExecutionError &&
      error.code === "material_judge_result_invalid",
  );
});

test("Material DeepSeek truncation and reasoning separation fail closed with sanitized metrics", async () => {
  const fixtures = await loadMaterialRequirementDiagnosticFixtures();
  const fixtureCase = fixtures[0]!.cases[0]!;
  const truncated = createDeepSeekMaterialRequirementJudge(materialJudgeOptions(
    async () => responseBody("partial", "length", {
      prompt_tokens: 17,
      completion_tokens: 4096,
      total_tokens: 4113,
    }),
  ));
  await assert.rejects(
    truncated.evaluateWithMetrics(fixtureCase.input),
    (error: unknown) =>
      error instanceof MaterialRequirementJudgeExecutionError &&
      error.code === "material_judge_output_truncated" &&
      error.metrics?.tokenUsage?.totalTokens === 4113,
  );

  const wrapped = createDeepSeekMaterialRequirementJudge(materialJudgeOptions(
    async () => responseBody(`<think>hidden</think>${validAtomicResult(fixtureCase)}`),
  ));
  await assert.rejects(
    wrapped.evaluateWithMetrics(fixtureCase.input),
    (error: unknown) =>
      error instanceof MaterialRequirementJudgeExecutionError &&
      error.code === "material_judge_result_invalid",
  );

  const timeoutJudge = createDeepSeekMaterialRequirementJudge({
    ...materialJudgeOptions(async (_url, init) => {
      await new Promise<void>((resolve) => {
        init.signal.addEventListener("abort", () => resolve(), { once: true });
      });
      return responseBody("never");
    }),
    timeoutMs: 10,
  });
  await assert.rejects(
    timeoutJudge.evaluateWithMetrics(fixtureCase.input),
    (error: unknown) =>
      error instanceof MaterialRequirementJudgeExecutionError &&
      error.code === "material_judge_timeout",
  );
});

test("Material DeepSeek retries transient transport failures and bounds non-transient failures", async () => {
  const fixtures = await loadMaterialRequirementDiagnosticFixtures();
  const fixtureCase = fixtures[0]!.cases[0]!;
  let calls = 0;
  const retried = createDeepSeekMaterialRequirementJudge(materialJudgeOptions(
    async () => {
      calls += 1;
      if (calls === 1) {
        return { status: 429, json: async () => ({}) };
      }
      return responseBody(validAtomicResult(fixtureCase));
    },
  ));
  const evaluation = await retried.evaluateWithMetrics(fixtureCase.input);
  assert.equal(calls, 2);
  assert.equal(evaluation.metrics?.attempts, 2);

  calls = 0;
  const nonTransient = createDeepSeekMaterialRequirementJudge(materialJudgeOptions(
    async () => {
      calls += 1;
      return { status: 400, json: async () => ({}) };
    },
  ));
  await assert.rejects(
    nonTransient.evaluateWithMetrics(fixtureCase.input),
    (error: unknown) =>
      error instanceof MaterialRequirementJudgeExecutionError &&
      error.code === "material_judge_transport_error",
  );
  assert.equal(calls, 1);
});

test("Material DeepSeek missing credentials or model fails before any fetch", () => {
  let calls = 0;
  const fetch: ChatCompletionsFetch = async () => {
    calls += 1;
    return responseBody("never");
  };
  assert.throws(
    () => createDeepSeekMaterialRequirementJudge({
      ...materialJudgeOptions(fetch),
      apiKey: null,
    }),
    (error: unknown) =>
      error instanceof MaterialRequirementJudgeConfigurationError &&
      error.code === "api_key_missing",
  );
  assert.throws(
    () => createDeepSeekMaterialRequirementJudge({
      ...materialJudgeOptions(fetch),
      model: "",
      apiKey: "test-key",
    }),
    (error: unknown) =>
      error instanceof MaterialRequirementJudgeConfigurationError &&
      error.code === "model_missing",
  );
  assert.equal(calls, 0);
});

test("material diagnostic is fail-soft and reports semantic availability separately from execution errors", async () => {
  const fixtures = await loadMaterialRequirementDiagnosticFixtures();
  const wordFixture = fixtures[0]!;
  const baseJudge = createSyntheticMaterialRequirementFixtureJudge(fixtures);
  let caseNumber = 0;
  const report = await runMaterialRequirementDiagnostic({
    evaluateWithMetrics: async (input) => {
      caseNumber += 1;
      if (caseNumber === 1) {
        throw new MaterialRequirementJudgeExecutionError(
          "material_judge_transport_error",
          {
            latencyMs: 9,
            tokenUsage: null,
            cost: null,
            attempts: 2,
          },
        );
      }
      return {
        result: await baseJudge.evaluate(input),
        metrics: {
          latencyMs: 3,
          tokenUsage: null,
          cost: null,
          attempts: 1,
        },
      };
    },
    evaluate: async (input) => baseJudge.evaluate(input),
  }, [wordFixture]);
  assert.equal(report.plannedCalls, 3);
  assert.equal(report.completedCalls, 3);
  assert.deepEqual(report.semanticAvailability, {
    observedCases: 2,
    plannedCases: 3,
    share: 2 / 3,
  });
  assert.equal(report.executionErrors.count, 1);
  assert.equal(report.executionErrors.byCode.material_judge_transport_error, 1);
  assert.equal(report.fixtures[0]!.cases[0]!.status, "error");
  assert.deepEqual(report.fixtures[0]!.cases[0]!.rubrics, []);
  assert.equal(report.tokenUsageCoverage.totalTokens.knownTotal, null);
  assert.equal(report.fixtures[0]!.cases[1]!.status, "observed");
  assert.equal(report.fixtures[0]!.cases[1]!.rubrics[0]!.observedDerivedLabel, "PARTIAL");
});
