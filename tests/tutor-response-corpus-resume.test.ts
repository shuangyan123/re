import assert from "node:assert/strict";
import { test } from "node:test";

import {
  BenchmarkConfigurationError,
  TUTOR_EVAL_CATEGORIES,
  parseTutorResponseCorpus,
  type TutorEvalCaseRunResult,
  type TutorEvalDataset,
  type TutorResponseCorpus,
  type TutorResponseCorpusEvaluationResult,
} from "../src/contracts/index.js";
import { loadTutorEvalDataset } from "../src/datasets/index.js";
import { deriveTutorResponseId } from "../src/corpus/index.js";
import { runTutorResponseCorpus, type TutorEvalJudgeRunOptions } from "../src/runner/index.js";

interface ResumeFixture {
  readonly dataset: TutorEvalDataset;
  readonly corpus: TutorResponseCorpus;
}

interface CallCounter {
  count: number;
}

interface JudgeOverrides {
  readonly model?: string;
  readonly promptVersion?: string;
  readonly thinkingMode?: "enabled" | "disabled";
  readonly reasoningEffort?: string;
  readonly maxOutputTokens?: number;
  readonly timeoutMs?: number;
  readonly maxAttempts?: number;
}

async function makeFixture(full: boolean): Promise<ResumeFixture> {
  const dataset = await loadTutorEvalDataset("tutor-eval-v0.2a");
  const selectedCases = full
    ? dataset.cases
    : dataset.cases.filter((tutorEvalCase) =>
        tutorEvalCase.evaluatorOnly.rubrics.some((rubric) => rubric.evaluationType === "judge"),
      ).slice(0, 3);
  assert.equal(selectedCases.length, full ? 48 : 3);
  const tutor = {
    provider: "synthetic",
    model: "resume-fixture-tutor",
    modelVersion: "fixture-1",
    promptId: "resume-fixture-prompt",
    promptVersion: "fixture-1",
    temperature: 0,
    reasoningEffort: "low",
    seed: 7,
  } as const;
  const corpusId = full ? "resume-full-corpus" : "resume-partial-corpus";
  const responses = selectedCases.map((tutorEvalCase) => ({
    schemaVersion: 1 as const,
    responseId: deriveTutorResponseId({
      corpusId,
      corpusVersion: "fixture-1",
      datasetId: dataset.id,
      datasetVersion: dataset.version,
      caseId: tutorEvalCase.id,
      caseVersion: tutorEvalCase.version,
      tutor,
      runIndex: 1,
    }),
    caseId: tutorEvalCase.id,
    caseVersion: tutorEvalCase.version,
    runIndex: 1,
    responseText: `Synthetic frozen response for ${tutorEvalCase.id}.`,
    provenance: "synthetic" as const,
  }));
  return {
    dataset,
    corpus: parseTutorResponseCorpus({
      schemaVersion: 1,
      corpusId,
      corpusVersion: "fixture-1",
      datasetId: dataset.id,
      datasetVersion: dataset.version,
      createdAt: "2026-08-17T00:00:00.000Z",
      coverage: full ? "full" : "partial",
      runsPerCase: 1,
      provenance: "synthetic",
      tutor,
      responses,
    }),
  };
}

function makeJudge(
  counter: CallCounter,
  overrides: JudgeOverrides = {},
): TutorEvalJudgeRunOptions {
  const thinkingMode = overrides.thinkingMode ?? "enabled";
  const reasoningEffort = thinkingMode === "disabled"
    ? undefined
    : overrides.reasoningEffort ?? "high";
  return {
    provider: "deepseek",
    model: overrides.model ?? "deepseek-v4-pro",
    modelVersion: "v4-pro-fixture",
    promptId: "tutor-eval-pedagogy-judge-system",
    promptVersion: overrides.promptVersion ?? "0.3",
    thinkingMode,
    ...(reasoningEffort === undefined ? {} : { reasoningEffort }),
    maxOutputTokens: overrides.maxOutputTokens ?? 8192,
    timeoutMs: overrides.timeoutMs ?? 60_000,
    maxAttempts: overrides.maxAttempts ?? 2,
    seed: 11,
    evaluate: async (input) => {
      counter.count += 1;
      return {
        schemaVersion: 1,
        caseId: input.caseId,
        rubricResults: input.rubrics.map((rubric) => ({
          rubricId: rubric.id,
          result: "PASS" as const,
          evidence: "Synthetic final Judge evidence.",
        })),
        criticalFailures: [],
        factualErrors: [],
        insufficientInformation: false,
      };
    },
  };
}

function emptyCategoryScores(): TutorEvalCaseRunResult["categoryScores"] {
  return Object.fromEntries(TUTOR_EVAL_CATEGORIES.map((category) => [category, null])) as
    TutorEvalCaseRunResult["categoryScores"];
}

function errorCaseRun(result: TutorEvalCaseRunResult): TutorEvalCaseRunResult {
  return {
    ...result,
    status: "error",
    passed: false,
    rawJudgeResult: null,
    judgeMetrics: null,
    rubricResults: result.rubricResults.map((rubricResult) => ({
      ...rubricResult,
      result: "ERROR" as const,
      score: null,
      diagnostics: [{ code: "judge_timeout", message: "Synthetic timeout." }],
    })),
    categoryScores: emptyCategoryScores(),
    overallScore: null,
    qualityGate: "FAIL",
    criticalFailures: [],
    answerLeakage: false,
    diagnostics: [{ code: "judge_timeout", message: "Synthetic timeout." }],
  };
}

function replaceCaseResults(
  artifact: TutorResponseCorpusEvaluationResult,
  caseResults: readonly TutorEvalCaseRunResult[],
): TutorResponseCorpusEvaluationResult {
  const passedCount = caseResults.filter((result) => result.status === "passed").length;
  const failedCount = caseResults.filter((result) => result.status === "failed").length;
  const errorCount = caseResults.filter((result) => result.status === "error").length;
  return {
    ...artifact,
    evaluation: {
      ...artifact.evaluation,
      caseRunCount: caseResults.length,
      passedCount,
      failedCount,
      errorCount,
      caseResults,
    },
  };
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

async function assertResumeFailsClosed(
  fixture: ResumeFixture,
  previousEvaluation: TutorResponseCorpusEvaluationResult,
  overrides: JudgeOverrides = {},
): Promise<void> {
  const calls = { count: 0 };
  await assert.rejects(
    () => runTutorResponseCorpus({
      corpus: fixture.corpus,
      dataset: fixture.dataset,
      resumeEvaluation: previousEvaluation,
      judge: makeJudge(calls, overrides),
    }),
    (error: unknown) =>
      error instanceof BenchmarkConfigurationError &&
      error.code === "tutor_eval_result_invalid",
  );
  assert.equal(calls.count, 0);
}

test("resume reuses 45 completed runs, reruns 3 errors, and recomputes the final artifact", async () => {
  const fixture = await makeFixture(true);
  const firstCalls = { count: 0 };
  const previous = await runTutorResponseCorpus({
    corpus: fixture.corpus,
    dataset: fixture.dataset,
    requireFull: true,
    judge: makeJudge(firstCalls),
  });
  const timeoutCaseIds = previous.evaluation.caseResults
    .filter((caseResult) => caseResult.rawJudgeResult !== null)
    .slice(0, 3)
    .map((caseResult) => caseResult.caseId);
  assert.equal(timeoutCaseIds.length, 3);
  const resumedInput = replaceCaseResults(
    previous,
    previous.evaluation.caseResults.map((caseResult) =>
      timeoutCaseIds.includes(caseResult.caseId) ? errorCaseRun(caseResult) : caseResult,
    ),
  );
  const recoveryCalls = { count: 0 };
  let reusedCaseRunCount = -1;
  const recovered = await runTutorResponseCorpus({
    corpus: fixture.corpus,
    dataset: fixture.dataset,
    requireFull: true,
    resumeEvaluation: resumedInput,
    judge: makeJudge(recoveryCalls, { timeoutMs: 180_000, maxAttempts: 3 }),
    onResume: (telemetry) => {
      reusedCaseRunCount = telemetry.reusedCaseRunCount;
    },
  });
  assert.equal(reusedCaseRunCount, 45);
  assert.equal(recoveryCalls.count, 3);
  assert.equal(recovered.evaluation.caseRunCount, 48);
  assert.equal(recovered.evaluation.errorCount, 0);
  assert.equal(
    recovered.evaluation.passedCount +
      recovered.evaluation.failedCount +
      recovered.evaluation.errorCount,
    48,
  );
  assert.deepEqual(
    recovered.evaluation.caseResults.map((result) => `${result.caseId}@${result.runIndex}`),
    [...recovered.evaluation.caseResults]
      .sort((left, right) =>
        left.caseId < right.caseId ||
        (left.caseId === right.caseId && left.runIndex < right.runIndex)
          ? -1
          : left.caseId === right.caseId && left.runIndex === right.runIndex
            ? 0
            : 1,
      )
      .map((result) => `${result.caseId}@${result.runIndex}`),
  );
});

test("both passed and failed completed case-runs are reusable", async () => {
  const fixture = await makeFixture(false);
  const previous = await runTutorResponseCorpus({
    corpus: fixture.corpus,
    dataset: fixture.dataset,
    judge: makeJudge({ count: 0 }),
  });
  const caseResults = previous.evaluation.caseResults.map((result, index) =>
    index === 0
      ? { ...result, status: "passed" as const, passed: true, qualityGate: "PASS" as const }
      : index === 1
        ? { ...result, status: "failed" as const, passed: false, qualityGate: "FAIL" as const }
        : result,
  );
  const reusableArtifact = replaceCaseResults(previous, caseResults);
  const calls = { count: 0 };
  const resumed = await runTutorResponseCorpus({
    corpus: fixture.corpus,
    dataset: fixture.dataset,
    resumeEvaluation: reusableArtifact,
    judge: makeJudge(calls),
  });
  assert.equal(calls.count, 0);
  assert.equal(resumed.evaluation.caseResults[0]?.status, "passed");
  assert.equal(resumed.evaluation.caseResults[1]?.status, "failed");
  assert.equal(resumed.evaluation.errorCount, 0);
});

test("changed execution timeout and max attempts do not invalidate completed Judge results", async () => {
  const fixture = await makeFixture(false);
  const previous = await runTutorResponseCorpus({
    corpus: fixture.corpus,
    dataset: fixture.dataset,
    judge: makeJudge({ count: 0 }),
  });
  const calls = { count: 0 };
  const resumed = await runTutorResponseCorpus({
    corpus: fixture.corpus,
    dataset: fixture.dataset,
    resumeEvaluation: previous,
    judge: makeJudge(calls, { timeoutMs: 180_000, maxAttempts: 3 }),
  });
  assert.equal(calls.count, 0);
  assert.equal(resumed.evaluation.errorCount, 0);
});

test("changed Judge semantic identity fails closed before any call", async () => {
  const fixture = await makeFixture(false);
  const previous = await runTutorResponseCorpus({
    corpus: fixture.corpus,
    dataset: fixture.dataset,
    judge: makeJudge({ count: 0 }),
  });
  for (const overrides of [
    { model: "different-model" },
    { promptVersion: "0.4" },
    { thinkingMode: "disabled" as const },
    { reasoningEffort: "max" },
    { maxOutputTokens: 16_384 },
  ]) {
    await assertResumeFailsClosed(fixture, previous, overrides);
  }
});

test("changed dataset, corpus, case version, and frozen response fail closed", async () => {
  const fixture = await makeFixture(false);
  const previous = await runTutorResponseCorpus({
    corpus: fixture.corpus,
    dataset: fixture.dataset,
    judge: makeJudge({ count: 0 }),
  });
  await assertResumeFailsClosed(
    fixture,
    { ...previous, datasetVersion: "different-dataset-version" },
  );
  await assertResumeFailsClosed(
    fixture,
    { ...previous, corpusId: "different-corpus" },
  );
  await assertResumeFailsClosed(
    fixture,
    { ...previous, tutor: { ...previous.tutor, model: "different-tutor" } },
  );
  await assertResumeFailsClosed(
    fixture,
    {
      ...previous,
      generationSpec: {
        schemaVersion: 1,
        specId: "different-generation",
        specVersion: "1.0.0",
        prompt: {
          id: "different-prompt",
          version: "1.0.0",
          sha256: "0000000000000000000000000000000000000000000000000000000000000000",
        },
        maxOutputTokens: 128,
      },
    },
  );
  await assertResumeFailsClosed(
    fixture,
    replaceCaseResults(previous, previous.evaluation.caseResults.map((result, index) =>
      index === 0 ? { ...result, caseVersion: "stale-case-version" } : result,
    )),
  );
  await assertResumeFailsClosed(
    fixture,
    replaceCaseResults(previous, previous.evaluation.caseResults.map((result, index) =>
      index === 0 ? { ...result, rawTutorResponse: "not the frozen response" } : result,
    )),
  );
});

test("selection mismatch never reuses an unrelated case-run", async () => {
  const fixture = await makeFixture(false);
  const previous = await runTutorResponseCorpus({
    corpus: fixture.corpus,
    dataset: fixture.dataset,
    caseIds: [fixture.corpus.responses[0]!.caseId],
    judge: makeJudge({ count: 0 }),
  });
  const targetCaseId = fixture.corpus.responses[1]!.caseId;
  const calls = { count: 0 };
  let reusedCaseRunCount = -1;
  const result = await runTutorResponseCorpus({
    corpus: fixture.corpus,
    dataset: fixture.dataset,
    caseIds: [targetCaseId],
    resumeEvaluation: previous,
    judge: makeJudge(calls),
    onResume: (telemetry) => {
      reusedCaseRunCount = telemetry.reusedCaseRunCount;
    },
  });
  assert.equal(reusedCaseRunCount, 0);
  assert.equal(calls.count, 1);
  assert.deepEqual(result.evaluationSelection?.selectedCaseIds, [targetCaseId]);
  assert.equal(result.evaluation.caseResults[0]?.caseId, targetCaseId);
});

test("duplicate or conflicting case-run identities fail closed", async () => {
  const fixture = await makeFixture(false);
  const previous = await runTutorResponseCorpus({
    corpus: fixture.corpus,
    dataset: fixture.dataset,
    judge: makeJudge({ count: 0 }),
  });
  const first = previous.evaluation.caseResults[0]!;
  const duplicate = replaceCaseResults(previous, [
    ...previous.evaluation.caseResults,
    { ...first, status: "failed" as const, passed: false },
  ]);
  await assertResumeFailsClosed(fixture, duplicate);
});

test("resume recomputes aggregates from canonical case-run order", async () => {
  const fixture = await makeFixture(false);
  const previous = await runTutorResponseCorpus({
    corpus: fixture.corpus,
    dataset: fixture.dataset,
    judge: makeJudge({ count: 0 }),
  });
  const reversed = [...previous.evaluation.caseResults].reverse();
  const staleAggregates: TutorResponseCorpusEvaluationResult = {
    ...previous,
    evaluation: {
      ...previous.evaluation,
      caseResults: reversed,
      passedCount: 0,
      failedCount: 0,
      errorCount: reversed.length,
      categoryScores: emptyCategoryScores(),
      overallScore: null,
      criticalFailureRate: 0,
      answerLeakageRate: 0,
    },
  };
  const resumed = await runTutorResponseCorpus({
    corpus: fixture.corpus,
    dataset: fixture.dataset,
    resumeEvaluation: staleAggregates,
    judge: makeJudge({ count: 0 }),
  });
  assert.equal(resumed.evaluation.errorCount, 0);
  assert.equal(resumed.evaluation.passedCount + resumed.evaluation.failedCount, 3);
  assert.notEqual(resumed.evaluation.overallScore, null);
  assert.notDeepEqual(resumed.evaluation.categoryScores, emptyCategoryScores());
  assert.deepEqual(
    resumed.evaluation.caseResults.map((result) => result.caseId),
    [...resumed.evaluation.caseResults].map((result) => result.caseId).sort(),
  );
});

test("reused results are canonicalized without hidden provider metadata", async () => {
  const fixture = await makeFixture(false);
  const previous = await runTutorResponseCorpus({
    corpus: fixture.corpus,
    dataset: fixture.dataset,
    judge: makeJudge({ count: 0 }),
  });
  const targetIndex = previous.evaluation.caseResults.findIndex(
    (result) => result.rawJudgeResult !== null,
  );
  assert.ok(targetIndex >= 0);
  const contaminated = clone(previous) as unknown as {
    evaluation: { caseResults: Array<Record<string, unknown>> };
  };
  const target = contaminated.evaluation.caseResults[targetIndex];
  assert.ok(target);
  target.providerPayload = { secret: "must-not-persist" };
  if (typeof target.rawJudgeResult === "object" && target.rawJudgeResult !== null) {
    target.rawJudgeResult = {
      ...(target.rawJudgeResult as Record<string, unknown>),
      reasoning_content: "hidden reasoning must not persist",
      requestId: "provider-request-id",
    };
  }
  const resumed = await runTutorResponseCorpus({
    corpus: fixture.corpus,
    dataset: fixture.dataset,
    resumeEvaluation: contaminated as unknown as TutorResponseCorpusEvaluationResult,
    judge: makeJudge({ count: 0 }),
  });
  const serialized = JSON.stringify(resumed);
  assert.doesNotMatch(serialized, /must-not-persist|reasoning_content|provider-request-id/);
});
