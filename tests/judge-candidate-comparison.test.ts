import assert from "node:assert/strict";
import { test } from "node:test";

import {
  TUTOR_EVAL_JUDGE_SCHEMA_VERSION,
  TutorEvalJudgeExecutionError,
} from "../src/contracts/index.js";
import {
  createWordContextDiscriminationComparisonFixture,
  WORD_CONTEXT_DISCRIMINATION_ACTIONABILITY_RUBRIC_ID,
  WORD_CONTEXT_DISCRIMINATION_CORRECTNESS_RUBRIC_ID,
} from "../src/judge/index.js";
import {
  formatJudgeCandidateComparisonReport,
  runJudgeCandidateComparison,
  type JudgeCandidateComparisonCandidate,
} from "../src/judge/candidate-comparison.js";
import { loadTutorEvalDataset } from "../src/datasets/index.js";
import type { TutorEvalJudgeRunOptions } from "../src/runner/index.js";

type FakeLabel = "PASS" | "PARTIAL" | "FAIL";

interface FakeCandidateOptions {
  readonly id: string;
  readonly provider: string;
  readonly model: string;
  readonly labelsByRepetition: readonly (readonly [FakeLabel, FakeLabel, FakeLabel])[];
  readonly leakageByRepetition?: readonly (readonly boolean[])[];
  readonly latencyMs?: number;
  readonly omitTotalTokens?: boolean;
  readonly failOnCall?: number;
  readonly failOnCalls?: readonly number[];
  readonly tokenUsageByCall?: readonly ({
    readonly inputTokens: number;
    readonly outputTokens: number;
    readonly totalTokens: number;
  } | null)[];
}

function fakeCandidate(options: FakeCandidateOptions): JudgeCandidateComparisonCandidate {
  let callCount = 0;
  const judge: TutorEvalJudgeRunOptions = {
    provider: options.provider,
    model: options.model,
    promptId: "tutor-eval-pedagogy-judge-system",
    promptVersion: "0.9",
    evaluateWithMetrics: async (input) => {
      const currentCall = callCount;
      callCount += 1;
      if (
        options.failOnCall === currentCall ||
        options.failOnCalls?.includes(currentCall) === true
      ) {
        throw new TutorEvalJudgeExecutionError("judge_transport_error");
      }
      const repetition = Math.floor(currentCall / 3);
      const fixtureIndex = currentCall % 3;
      const labels = options.labelsByRepetition[repetition] ?? options.labelsByRepetition[0];
      const label = labels?.[fixtureIndex] ?? "FAIL";
      const leakage = options.leakageByRepetition?.[repetition]?.[fixtureIndex] ?? false;
      return {
        result: {
          schemaVersion: TUTOR_EVAL_JUDGE_SCHEMA_VERSION,
          caseId: input.caseId,
          rubricResults: input.rubrics.map((rubric) => ({
            rubricId: rubric.id,
            result: rubric.id === WORD_CONTEXT_DISCRIMINATION_CORRECTNESS_RUBRIC_ID
              ? label
              : "PASS",
          })),
          criticalFailures: leakage
            ? [{ type: "answer_leakage", severity: "major", evidence: "synthetic" }]
            : [],
          factualErrors: [],
          insufficientInformation: false,
        },
        metrics: {
          latencyMs: options.latencyMs ?? currentCall + 10,
          tokenUsage: options.tokenUsageByCall?.[currentCall] ??
            (options.tokenUsageByCall === undefined
              ? {
                  inputTokens: 10,
                  outputTokens: 5,
                  ...(options.omitTotalTokens ? {} : { totalTokens: 15 }),
                }
              : null),
          cost: null,
          attempts: 1,
        },
      };
    },
  };
  return {
    id: options.id,
    provider: options.provider,
    model: options.model,
    promptId: "tutor-eval-pedagogy-judge-system",
    promptVersion: "0.9",
    generationProfile: {
      temperature: null,
      maxOutputTokens: 2048,
      seedControl: "unsupported",
    },
    executionProfile: {
      timeoutMs: 60_000,
      maxAttempts: 1,
    },
    createJudge: () => judge,
  };
}

function fixture() {
  return createWordContextDiscriminationComparisonFixture(
    () => loadTutorEvalDataset("tutor-eval-v0.2a", "0.2a.5"),
  );
}

test("candidate comparison runs multiple candidates and repetitions with stable descriptive metrics", async () => {
  const report = await runJudgeCandidateComparison({
    fixture: fixture(),
    runsPerCandidate: 3,
    candidates: [
      fakeCandidate({
        id: "deepseek/deepseek-v4-flash",
        provider: "deepseek",
        model: "deepseek-v4-flash",
        labelsByRepetition: [
          ["PASS", "PARTIAL", "FAIL"],
          ["PASS", "PARTIAL", "FAIL"],
          ["PASS", "PARTIAL", "FAIL"],
        ],
        leakageByRepetition: [[false, false, false], [false, false, false], [false, false, false]],
      }),
      fakeCandidate({
        id: "minimax/account-confirmed-m3",
        provider: "minimax",
        model: "account-confirmed-m3",
        labelsByRepetition: [
          ["PASS", "PASS", "PARTIAL"],
          ["PARTIAL", "FAIL", "FAIL"],
          ["FAIL", "PASS", "FAIL"],
        ],
        leakageByRepetition: [[false, false, true], [false, false, false], [false, false, true]],
        omitTotalTokens: true,
      }),
    ],
  });

  assert.equal(report.schemaVersion, 1);
  assert.equal(report.comparisonVersion, "0.1.1");
  assert.equal(report.fixture.version, "0.1.0");
  assert.equal(report.datasetVersion, "0.2a.5");
  assert.equal(report.evaluatorVersion, "0.3a.4");
  assert.equal(report.runsPerCandidate, 3);
  assert.equal(report.plannedJudgeCalls, 18);
  assert.equal(report.judgeCallCount, 18);
  assert.equal(report.selectionStatement, "No winner is inferred automatically.");

  const deepSeek = report.candidates[0];
  const miniMax = report.candidates[1];
  assert.ok(deepSeek);
  assert.ok(miniMax);
  assert.equal(deepSeek.candidateId, "deepseek/deepseek-v4-flash");
  assert.deepEqual(deepSeek.metrics.expectedLabelAgreement.overall, {
    agreedCount: 9,
    totalCount: 9,
    share: 1,
  });
  assert.deepEqual(deepSeek.metrics.exactExpectedRunAgreement, {
    agreedCount: 3,
    totalCount: 3,
    share: 1,
  });
  assert.deepEqual(deepSeek.metrics.labelDistribution.A, { counts: { PASS: 3 }, unavailableCount: 0 });
  assert.deepEqual(deepSeek.metrics.stability.labelByFixture.A, {
    modalLabel: "PASS",
    modalCount: 3,
    modalShare: 1,
    observedCount: 3,
    unavailableCount: 0,
    unanimous: true,
  });
  assert.equal(deepSeek.metrics.unanimousFixtureCount, 3);
  assert.deepEqual(deepSeek.metrics.tokenUsage, {
    inputTokens: 90,
    outputTokens: 45,
    totalTokens: 135,
    inputUnavailableCount: 0,
    outputUnavailableCount: 0,
    totalUnavailableCount: 0,
  });
  assert.deepEqual(deepSeek.metrics.tokenUsageCoverage.totalTokens, {
    completeTotal: 135,
    knownTotal: 135,
    knownCount: 9,
    plannedCount: 9,
    unavailableCount: 0,
    coverageShare: 1,
  });

  assert.equal(miniMax.metrics.expectedLabelAgreement.overall.agreedCount, 3);
  assert.equal(miniMax.metrics.exactExpectedRunAgreement.agreedCount, 0);
  assert.deepEqual(miniMax.metrics.labelDistribution.C, {
    counts: { PARTIAL: 1, FAIL: 2 },
    unavailableCount: 0,
  });
  assert.deepEqual(miniMax.metrics.stability.labelByFixture.C, {
    modalLabel: "FAIL",
    modalCount: 2,
    modalShare: 2 / 3,
    observedCount: 3,
    unavailableCount: 0,
    unanimous: false,
  });
  assert.deepEqual(miniMax.metrics.answerLeakageDistribution.C, {
    trueCount: 2,
    falseCount: 1,
    unavailableCount: 0,
  });
  assert.deepEqual(miniMax.metrics.stability.answerLeakageByFixture.C, {
    modalLeakage: true,
    modalCount: 2,
    modalShare: 2 / 3,
    observedCount: 3,
    unavailableCount: 0,
  });
  assert.equal(miniMax.metrics.criticalFailureDisagreementCount, 1);
  assert.equal(miniMax.metrics.tokenUsage.totalTokens, null);
  assert.equal(miniMax.metrics.tokenUsage.totalUnavailableCount, 9);
  assert.deepEqual(miniMax.metrics.tokenUsageCoverage.totalTokens, {
    completeTotal: null,
    knownTotal: 0,
    knownCount: 0,
    plannedCount: 9,
    unavailableCount: 9,
    coverageShare: 0,
  });
  assert.equal(report.pairwiseSummary[0]?.totalTokens, 135);
  assert.equal(report.pairwiseSummary[1]?.totalTokens, null);
});

test("candidate comparison separates planned agreement from observed-label agreement and availability", async () => {
  const report = await runJudgeCandidateComparison({
    fixture: fixture(),
    runsPerCandidate: 3,
    candidates: [fakeCandidate({
      id: "deepseek/deepseek-v4-flash",
      provider: "deepseek",
      model: "deepseek-v4-flash",
      labelsByRepetition: [
        ["PASS", "PARTIAL", "PARTIAL"],
        ["PASS", "PASS", "PARTIAL"],
        ["PASS", "PASS", "PARTIAL"],
      ],
      failOnCalls: [0, 1],
    })],
  });
  const candidate = report.candidates[0];
  assert.ok(candidate);

  assert.deepEqual(candidate.metrics.expectedLabelAgreement.overall, {
    agreedCount: 2,
    totalCount: 9,
    share: 2 / 9,
  });
  assert.deepEqual(candidate.metrics.expectedLabelAgreementObserved.overall, {
    agreedCount: 2,
    totalCount: 7,
    share: 2 / 7,
  });
  assert.deepEqual(candidate.metrics.semanticLabelAvailability.overall, {
    observedCount: 7,
    plannedCount: 9,
    share: 7 / 9,
  });

  assert.deepEqual(candidate.metrics.semanticLabelAvailability.byFixture, {
    A: { observedCount: 2, plannedCount: 3, share: 2 / 3 },
    B: { observedCount: 2, plannedCount: 3, share: 2 / 3 },
    C: { observedCount: 3, plannedCount: 3, share: 1 },
  });
  assert.deepEqual(candidate.metrics.expectedLabelAgreementObserved.byFixture, {
    A: { agreedCount: 2, totalCount: 2, share: 1 },
    B: { agreedCount: 0, totalCount: 2, share: 0 },
    C: { agreedCount: 0, totalCount: 3, share: 0 },
  });
  assert.deepEqual(report.pairwiseSummary[0]?.diagnosticAgreementObserved, {
    agreedCount: 2,
    totalCount: 7,
    share: 2 / 7,
  });
  assert.deepEqual(report.pairwiseSummary[0]?.semanticLabelAvailability, {
    observedCount: 7,
    plannedCount: 9,
    share: 7 / 9,
  });

  const formatted = formatJudgeCandidateComparisonReport(report);
  assert.match(formatted, /expected-label agreement \(planned\): 2\/9/u);
  assert.match(formatted, /expected-label agreement \(observed\): 2\/7/u);
  assert.match(formatted, /label availability: 7\/9/u);
  assert.match(formatted, /diagnostic agreement \(observed labels\) 2\/7/u);
  assert.match(formatted, /No winner is inferred automatically\./u);
});

test("candidate comparison reports known token totals without estimating missing usage", async () => {
  const report = await runJudgeCandidateComparison({
    fixture: fixture(),
    candidates: [fakeCandidate({
      id: "synthetic/token-coverage",
      provider: "synthetic",
      model: "token-coverage",
      labelsByRepetition: [["PASS", "PARTIAL", "FAIL"]],
      tokenUsageByCall: [
        { inputTokens: 100, outputTokens: 20, totalTokens: 120 },
        null,
        { inputTokens: 200, outputTokens: 30, totalTokens: 230 },
      ],
    })],
  });
  const candidate = report.candidates[0];
  assert.ok(candidate);

  assert.deepEqual(candidate.metrics.tokenUsageCoverage.inputTokens, {
    completeTotal: null,
    knownTotal: 300,
    knownCount: 2,
    plannedCount: 3,
    unavailableCount: 1,
    coverageShare: 2 / 3,
  });
  assert.deepEqual(candidate.metrics.tokenUsageCoverage.outputTokens, {
    completeTotal: null,
    knownTotal: 50,
    knownCount: 2,
    plannedCount: 3,
    unavailableCount: 1,
    coverageShare: 2 / 3,
  });
  assert.deepEqual(candidate.metrics.tokenUsageCoverage.totalTokens, {
    completeTotal: null,
    knownTotal: 350,
    knownCount: 2,
    plannedCount: 3,
    unavailableCount: 1,
    coverageShare: 2 / 3,
  });
  assert.equal(candidate.metrics.tokenUsage.totalTokens, null);
  assert.equal(report.pairwiseSummary[0]?.knownTotalTokens, 350);
  assert.deepEqual(report.pairwiseSummary[0]?.totalTokenCoverage, {
    observedCount: 2,
    plannedCount: 3,
    share: 2 / 3,
  });

  const formatted = formatJudgeCandidateComparisonReport(report);
  assert.match(formatted, /known total tokens: 350 \(2\/3 observations\)/u);
  assert.match(formatted, /complete total tokens: unavailable/u);
});

test("candidate comparison reports execution errors and unavailable measurements without estimating them", async () => {
  const report = await runJudgeCandidateComparison({
    fixture: fixture(),
    candidates: [fakeCandidate({
      id: "minimax/account-confirmed-m3",
      provider: "minimax",
      model: "account-confirmed-m3",
      labelsByRepetition: [["PASS", "PARTIAL", "FAIL"]],
      failOnCall: 1,
    })],
  });
  const candidate = report.candidates[0];
  assert.ok(candidate);
  assert.equal(report.plannedJudgeCalls, 3);
  assert.equal(report.judgeCallCount, 3);
  assert.equal(candidate.metrics.executionErrors.count, 1);
  assert.equal(candidate.metrics.executionErrors.byCode.judge_transport_error, 1);
  assert.equal(candidate.metrics.expectedLabelAgreement.overall.agreedCount, 2);
  assert.equal(candidate.metrics.expectedLabelAgreement.overall.totalCount, 3);
  assert.equal(candidate.metrics.answerLeakageDistribution.B?.unavailableCount, 1);
  assert.deepEqual(candidate.metrics.stability.labelByFixture.B, {
    modalLabel: null,
    modalCount: 0,
    modalShare: null,
    observedCount: 0,
    unavailableCount: 1,
    unanimous: false,
  });
  assert.equal(candidate.metrics.latency.unavailableCount, 1);
  assert.equal(candidate.metrics.tokenUsage.inputUnavailableCount, 1);
  assert.equal(candidate.metrics.tokenUsage.inputTokens, null);
});

test("word-context comparison observation keeps actionability out of the primary label contract", async () => {
  const report = await runJudgeCandidateComparison({
    fixture: fixture(),
    candidates: [fakeCandidate({
      id: "deepseek/deepseek-v4-flash",
      provider: "deepseek",
      model: "deepseek-v4-flash",
      labelsByRepetition: [["PASS", "PARTIAL", "FAIL"]],
    })],
  });
  const observations = report.candidates[0]?.repetitions[0]?.observations;
  assert.ok(observations);
  assert.deepEqual(observations.map((observation) => observation.observedLabel), [
    "PASS",
    "PARTIAL",
    "FAIL",
  ]);
  assert.equal(
    WORD_CONTEXT_DISCRIMINATION_ACTIONABILITY_RUBRIC_ID,
    "language-word-question-001",
  );
  assert.doesNotMatch(JSON.stringify(report), /rawProviderPayload|reasoning_content|apiKey|secret/u);
});
