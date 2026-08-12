import assert from "node:assert/strict";
import { test } from "node:test";

import { ScriptedTutor } from "../src/adapters/scripted-tutor.js";
import {
  buildTutorEvalJudgeInput,
  parseTutorEvalCase,
  parseTutorEvalJudgeResult,
  type TutorEvalCase,
  type TutorEvalRubric,
} from "../src/contracts/index.js";
import { evaluateTutorEvalRubric } from "../src/evaluators/index.js";
import {
  aggregateTutorEvalRubrics,
  DEFAULT_TUTOR_EVAL_SCORING_CONFIG,
} from "../src/scoring/index.js";
import { runTutorEval } from "../src/runner/index.js";

function makeCase(
  id: string,
  version = "1.0.0",
  rubricOverrides: Partial<TutorEvalRubric>[] = [{}],
): TutorEvalCase {
  const rubrics: TutorEvalRubric[] = rubricOverrides.map((override, index) => {
    const evaluationType = override.evaluationType ?? "deterministic";
    const evaluatorId =
      override.evaluatorId ??
      (evaluationType === "deterministic" ? "empty_response" : undefined);
    return {
      id: override.id ?? `rubric-${index + 1}`,
      category: override.category ?? "guidance",
      criterion: override.criterion ?? "Return a useful next step.",
      weight: override.weight ?? 1,
      evaluationType,
      ...(evaluatorId === undefined ? {} : { evaluatorId }),
      ...(override.config === undefined ? {} : { config: override.config }),
      ...(override.critical === undefined ? {} : { critical: override.critical }),
      ...(override.criticalFailure === undefined
        ? {}
        : { criticalFailure: override.criticalFailure }),
    };
  });
  return parseTutorEvalCase({
    schemaVersion: 1,
    id,
    version,
    metadata: {
      subject: "synthetic",
      topic: "testing",
      tags: ["test"],
    },
    tutorInput: {
      learningObjective: "Take one useful next step.",
      studentProfile: {
        knownConcepts: ["a concept"],
        misconceptions: ["a hidden misconception"],
        level: "test",
        goal: "test goal",
      },
      studentMessage: "Please help me.",
      problemContext: "Visible context.",
    },
    evaluatorOnly: {
      groundTruth: {
        finalAnswer: "secret-answer",
        requiredConcepts: ["a concept"],
      },
      knownMisconception: "Hidden misconception annotation.",
      disclosurePolicy: "hint_only",
      rubrics,
    },
  });
}

test("TutorEval never sends evaluator-only annotations to the Tutor", async () => {
  const tutorEvalCase = makeCase("isolation-001", "1.0.0", [
    { evaluatorId: "empty_response" },
  ]);
  const seenInputs: unknown[] = [];
  const tutor = {
    id: "capture-tutor",
    respond: async (input: Parameters<ScriptedTutor["respond"]>[0]) => {
      seenInputs.push(input);
      return { text: "A useful next step." };
    },
  };

  await runTutorEval({
    dataset: { id: "tutor-eval-v0.1", version: "0.1", cases: [tutorEvalCase] },
    tutor,
    tutorDescriptor: {
      provider: "synthetic",
      model: "capture-tutor",
      promptVersion: "test",
    },
  });

  assert.equal(seenInputs.length, 1);
  const serialized = JSON.stringify(seenInputs[0]);
  assert.doesNotMatch(serialized, /evaluatorOnly|secret-answer|Hidden misconception/);
  assert.equal((seenInputs[0] as { caseId?: string }).caseId, "isolation-001");
});

test("TutorEval judge input includes hidden annotations only at the Judge boundary", () => {
  const tutorEvalCase = makeCase("judge-boundary-001", "1.0.0", [
    { evaluatorId: "empty_response" },
  ]);
  const judgeInput = buildTutorEvalJudgeInput(tutorEvalCase, "A candidate response.");
  assert.match(judgeInput.groundTruth, /secret-answer/);
  assert.match(judgeInput.knownMisconception, /Hidden misconception/);
  assert.equal(judgeInput.tutorResponse, "A candidate response.");
});

test("case rubrics without provider-specific evaluator fields are reserved for Judge evaluation", () => {
  const baseCase = makeCase("judge-rubric-shape-001");
  const tutorEvalCase = parseTutorEvalCase({
    ...baseCase,
    evaluatorOnly: {
      ...baseCase.evaluatorOnly,
      rubrics: [
        {
          id: "judge-rubric",
          category: "guidance",
          criterion: "Judge this visible response.",
          weight: 1,
        },
      ],
    },
  });
  assert.equal(tutorEvalCase.evaluatorOnly.rubrics[0]?.evaluationType, "judge");
  const result = evaluateTutorEvalRubric(
    tutorEvalCase,
    tutorEvalCase.evaluatorOnly.rubrics[0]!,
    { text: "A response." },
  );
  assert.equal(result.result, "ERROR");
  assert.equal(result.diagnostics[0]?.code, "judge_evaluation_unavailable");
});

test("category applicability is null when no rubric exists for that category", () => {
  const tutorEvalCase = makeCase("applicability-001", "1.0.0", [
    { category: "guidance", evaluatorId: "empty_response" },
  ]);
  const result = evaluateTutorEvalRubric(
    tutorEvalCase,
    tutorEvalCase.evaluatorOnly.rubrics[0]!,
    { text: "A hint." },
  );
  const aggregate = aggregateTutorEvalRubrics(
    tutorEvalCase.evaluatorOnly.rubrics,
    [
      {
        rubricId: result.rubricId,
        category: result.category,
        result: result.result,
        score: result.score,
        weight: result.weight,
        critical: result.critical,
        diagnostics: result.diagnostics,
      },
    ],
    [],
  );
  assert.equal(aggregate.categoryScores.correctness, null);
  assert.equal(aggregate.categoryScores.guidance, 1);
});

test("weighted PASS/PARTIAL/FAIL rubric scores are aggregated in code", () => {
  const rubrics = [
    { id: "correctness-a", category: "correctness" as const, weight: 2 },
    { id: "correctness-b", category: "correctness" as const, weight: 1 },
  ];
  const aggregate = aggregateTutorEvalRubrics(
    rubrics,
    [
      {
        rubricId: "correctness-a",
        category: "correctness",
        result: "PASS",
        score: DEFAULT_TUTOR_EVAL_SCORING_CONFIG.criterionScores.PASS,
        weight: 2,
        critical: false,
        diagnostics: [],
      },
      {
        rubricId: "correctness-b",
        category: "correctness",
        result: "PARTIAL",
        score: DEFAULT_TUTOR_EVAL_SCORING_CONFIG.criterionScores.PARTIAL,
        weight: 1,
        critical: false,
        diagnostics: [],
      },
    ],
    [],
  );
  assert.equal(aggregate.categoryScores.correctness, 0.8333);
  assert.equal(aggregate.overallScore, 0.8333);
  assert.equal(aggregate.passed, true);

  const customScoring = aggregateTutorEvalRubrics(
    rubrics,
    [
      {
        rubricId: "correctness-a",
        category: "correctness",
        result: "PASS",
        score: 0.01,
        weight: 2,
        critical: false,
        diagnostics: [],
      },
      {
        rubricId: "correctness-b",
        category: "correctness",
        result: "PARTIAL",
        score: 0.99,
        weight: 1,
        critical: false,
        diagnostics: [],
      },
    ],
    [],
    {
      ...DEFAULT_TUTOR_EVAL_SCORING_CONFIG,
      criterionScores: { PASS: 0.8, PARTIAL: 0.2, FAIL: 0 },
    },
  );
  assert.equal(customScoring.categoryScores.correctness, 0.6);
});

test("a configured severe factual failure forces the quality gate to FAIL", () => {
  const aggregate = aggregateTutorEvalRubrics(
    [{ id: "fact", category: "correctness", weight: 1 }],
    [
      {
        rubricId: "fact",
        category: "correctness",
        result: "PASS",
        score: 1,
        weight: 1,
        critical: true,
        diagnostics: [],
      },
    ],
    [
      {
        type: "severe_factual_error",
        severity: "critical",
        evidence: "Synthetic factual failure.",
      },
    ],
  );
  assert.equal(aggregate.overallScore, 1);
  assert.equal(aggregate.qualityGate, "FAIL");
  assert.equal(aggregate.passed, false);
});

test("disclosure policy allows full solutions but flags unnecessary hint leakage", () => {
  const hintCase = makeCase("hint-policy-001", "1.0.0", [
    {
      id: "hint-leak",
      category: "guidance",
      evaluatorId: "direct_answer_leak",
      config: { forbiddenFinalAnswer: "secret-answer" },
      criticalFailure: { type: "answer_leakage", severity: "major" },
    },
  ]);
  const hintResult = evaluateTutorEvalRubric(
    hintCase,
    hintCase.evaluatorOnly.rubrics[0]!,
    { text: "The answer is secret-answer." },
  );
  assert.equal(hintResult.result, "FAIL");

  const allowedCase = parseTutorEvalCase({
    ...hintCase,
    id: "allowed-policy-001",
    evaluatorOnly: {
      ...hintCase.evaluatorOnly,
      disclosurePolicy: "full_solution_allowed",
    },
  });
  const allowedResult = evaluateTutorEvalRubric(
    allowedCase,
    allowedCase.evaluatorOnly.rubrics[0]!,
    { text: "The answer is secret-answer." },
  );
  assert.equal(allowedResult.result, "PASS");
});

test("ground-truth evaluator checks accepted answers without requiring reference wording", () => {
  const tutorEvalCase = makeCase("ground-truth-001", "1.0.0", [
    { category: "correctness", evaluatorId: "matches_ground_truth" },
  ]);
  const rubric = tutorEvalCase.evaluatorOnly.rubrics[0]!;
  const result = evaluateTutorEvalRubric(
    tutorEvalCase,
    rubric,
    { text: "The correct result is secret-answer, explained in my own words." },
  );
  assert.equal(result.result, "PASS");
});

test("sanitized adapter metrics are retained without persisting provider payloads", async () => {
  const tutorEvalCase = makeCase("metrics-001");
  const result = await runTutorEval({
    dataset: { id: "tutor-eval-v0.1", version: "0.1", cases: [tutorEvalCase] },
    tutor: {
      id: "metrics-tutor",
      respond: async () => ({
        text: "A response.",
        metrics: {
          tokenUsage: { inputTokens: 10, outputTokens: 4, totalTokens: 14 },
          latencyMs: 12,
          cost: 0.003,
        },
        metadata: { providerResponse: "not persisted" },
      }),
    },
    tutorDescriptor: {
      provider: "synthetic",
      model: "metrics-tutor",
      promptVersion: "test",
    },
  });
  assert.deepEqual(result.caseResults[0]?.tokenUsage, {
    inputTokens: 10,
    outputTokens: 4,
    totalTokens: 14,
  });
  assert.equal(result.caseResults[0]?.latencyMs, 12);
  assert.equal(result.caseResults[0]?.cost, 0.003);
  assert.doesNotMatch(JSON.stringify(result), /providerResponse/);
});

test("invalid TutorEval Judge output fails schema validation", () => {
  assert.throws(
    () =>
      parseTutorEvalJudgeResult({
        schemaVersion: 1,
        caseId: "case-1",
        rubricResults: [{ rubricId: "r1", result: "MAYBE" }],
        criticalFailures: [],
        factualErrors: [],
        insufficientInformation: false,
      }),
    /AI Tutor Judge result is invalid\./,
  );
});

test("runner records a clear error when injected Judge output is invalid", async () => {
  const tutorEvalCase = makeCase("invalid-judge-001", "1.0.0", [
    { evaluationType: "judge", id: "judge-rubric" },
  ]);
  const result = await runTutorEval({
    dataset: { id: "tutor-eval-v0.1", version: "0.1", cases: [tutorEvalCase] },
    tutor: new ScriptedTutor({
      id: "judge-boundary-tutor",
      responses: { "invalid-judge-001": "A response." },
    }),
    tutorDescriptor: {
      provider: "synthetic",
      model: "judge-boundary-tutor",
      promptVersion: "test",
    },
    judge: {
      provider: "synthetic",
      model: "invalid-judge",
      promptVersion: "test",
      evaluate: async () => ({ invalid: true }),
    },
  });
  assert.equal(result.errorCount, 1);
  assert.equal(result.caseResults[0]?.diagnostics[0]?.code, "judge_result_invalid");
  assert.equal(result.caseResults[0]?.rawJudgeResult, null);
  assert.equal(result.caseResults[0]?.overallScore, null);
  assert.equal(result.overallScore, null);
});

test("critical Judge factual errors become centralized quality-gate failures", async () => {
  const baseCase = makeCase("judge-factual-error-001");
  const tutorEvalCase = parseTutorEvalCase({
    ...baseCase,
    evaluatorOnly: {
      ...baseCase.evaluatorOnly,
      rubrics: [
        {
          id: "judge-rubric",
          category: "correctness",
          criterion: "The response must be factually correct.",
          weight: 1,
          evaluationType: "judge",
        },
      ],
    },
  });
  const result = await runTutorEval({
    dataset: { id: "tutor-eval-v0.1", version: "0.1", cases: [tutorEvalCase] },
    tutor: new ScriptedTutor({
      id: "factual-error-tutor",
      responses: { "judge-factual-error-001": "A response." },
    }),
    tutorDescriptor: {
      provider: "synthetic",
      model: "factual-error-tutor",
      promptVersion: "test",
    },
    judge: {
      provider: "synthetic",
      model: "synthetic-judge",
      promptVersion: "test",
      evaluate: async () => ({
        schemaVersion: 1,
        caseId: "judge-factual-error-001",
        rubricResults: [{ rubricId: "judge-rubric", result: "PASS" }],
        criticalFailures: [],
        factualErrors: [
          { description: "The response states a false fact.", severity: "critical" },
        ],
        insufficientInformation: false,
      }),
    },
  });
  assert.equal(result.failedCount, 1);
  assert.equal(result.errorCount, 0);
  assert.equal(result.caseResults[0]?.qualityGate, "FAIL");
  assert.equal(result.caseResults[0]?.criticalFailures[0]?.type, "severe_factual_error");
});

test("runner preserves dataset and case versions and supports repeated runs", async () => {
  const first = makeCase("versioned-a", "1.0.0", [{ evaluatorId: "empty_response" }]);
  const second = makeCase("versioned-b", "2.0.0", [{ evaluatorId: "empty_response" }]);
  const result = await runTutorEval({
    dataset: { id: "tutor-eval-v0.1", version: "0.1.1", cases: [second, first] },
    tutor: new ScriptedTutor({
      id: "versioned-tutor",
      responses: { "versioned-a": "Ready.", "versioned-b": "Ready." },
    }),
    tutorDescriptor: {
      provider: "synthetic",
      model: "versioned-tutor",
      promptVersion: "prompt-a",
    },
    runsPerCase: 2,
    runId: "versioned-run",
  });
  assert.equal(result.datasetVersion, "0.1.1");
  assert.deepEqual(
    result.caseResults.map((caseResult) => `${caseResult.caseId}@${caseResult.caseVersion}`),
    ["versioned-a@1.0.0", "versioned-a@1.0.0", "versioned-b@2.0.0", "versioned-b@2.0.0"],
  );
  assert.equal(result.caseRunCount, 4);
});
