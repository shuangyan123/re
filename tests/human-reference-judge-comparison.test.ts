import assert from "node:assert/strict";
import { readFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";

import {
  buildHumanReferenceSet,
  compareJudgeBatchToHumanReference,
  materialRequirementJudgeInputFromHumanReferenceTask,
  runHumanReferenceJudgeComparison,
  writeHumanReferenceJudgeComparisonJson,
} from "../src/calibration/index.js";
import { runHumanReferenceJudgeComparisonCli } from "../src/cli/human-reference-judge-comparison.js";
import { parseTutorbenchArgs } from "../src/cli/tutorbench.js";
import {
  MaterialRequirementJudgeConfigurationError,
} from "../src/providers/deepseek/material-requirement-judge.js";
import {
  HUMAN_ATOMIC_STATUSES,
  HUMAN_REFERENCE_CALIBRATION_SCHEMA_VERSION,
  HUMAN_REFERENCE_PROTOCOL_ID,
  HUMAN_REFERENCE_PROTOCOL_VERSION,
  parseHumanAtomicAdjudication,
  parseHumanAtomicAnnotation,
  parseHumanReferenceAnnotationTask,
  type HumanAtomicAnnotation,
  type HumanReferenceAnnotationTask,
  type MaterialRequirementJudgeInput,
  type MaterialRequirementJudgeResult,
} from "../src/contracts/index.js";
import {
  MATERIAL_REQUIREMENT_JUDGE_PROMPT_ID,
  MATERIAL_REQUIREMENT_JUDGE_PROMPT_VERSION,
} from "../src/judge/material-requirement-prompt.js";

const syntheticFixture = { synthetic: true as const, notHumanCalibrationData: true as const };

function task(
  caseId: string,
  requirements: readonly { readonly id: string; readonly description: string }[],
): HumanReferenceAnnotationTask {
  return parseHumanReferenceAnnotationTask({
    schemaVersion: HUMAN_REFERENCE_CALIBRATION_SCHEMA_VERSION,
    caseId,
    learningObjective: "Assess each material requirement in a visible Tutor response.",
    studentProfile: JSON.stringify({ level: "synthetic" }),
    conversationHistory: JSON.stringify([]),
    studentMessage: "A synthetic student message.",
    problemContext: "A synthetic problem context.",
    groundTruth: JSON.stringify({ expected: "synthetic" }),
    knownMisconception: "A synthetic misconception.",
    disclosurePolicy: "hint_only",
    rubrics: [{
      id: "rubric-material",
      criterion: "Assess the material requirements.",
      requirements,
    }],
    tutorResponse: `Visible Tutor response for ${caseId}.`,
  });
}

function annotation(
  caseId: string,
  requirementId: string,
  annotatorId: string,
  status: HumanAtomicAnnotation["status"],
): HumanAtomicAnnotation {
  return parseHumanAtomicAnnotation({
    schemaVersion: HUMAN_REFERENCE_CALIBRATION_SCHEMA_VERSION,
    caseId,
    rubricId: "rubric-material",
    requirementId,
    annotatorId,
    status,
    evidence: `${annotatorId} evidence for ${requirementId}`,
  });
}

const tasks = [
  task("case-a", [
    { id: "R1", description: "Relate the response to the proposed meaning." },
    { id: "R2", description: "State the evidence limitation." },
  ]),
  task("case-b", [
    { id: "R1", description: "Relate the response to the proposed meaning." },
  ]),
  task("case-error", [
    { id: "R-ERROR", description: "Keep the synthetic response bounded." },
  ]),
] as const;

const annotations = [
  annotation("case-a", "R1", "annotator-a", "SATISFIED"),
  annotation("case-a", "R1", "annotator-b", "SATISFIED"),
  annotation("case-a", "R2", "annotator-a", "OMITTED_OR_INCOMPLETE"),
  annotation("case-a", "R2", "annotator-b", "EXPLICIT_CONFLICT"),
  annotation("case-b", "R1", "annotator-a", "OMITTED_OR_INCOMPLETE"),
  annotation("case-b", "R1", "annotator-b", "OMITTED_OR_INCOMPLETE"),
  annotation("case-error", "R-ERROR", "annotator-a", "SATISFIED"),
  annotation("case-error", "R-ERROR", "annotator-b", "SATISFIED"),
] as const;

const adjudication = parseHumanAtomicAdjudication({
  schemaVersion: HUMAN_REFERENCE_CALIBRATION_SCHEMA_VERSION,
  caseId: "case-a",
  rubricId: "rubric-material",
  requirementId: "R2",
  sourceAnnotatorIds: ["annotator-a", "annotator-b"],
  sourceStatuses: {
    "annotator-a": "OMITTED_OR_INCOMPLETE",
    "annotator-b": "EXPLICIT_CONFLICT",
  },
  adjudicatedStatus: "EXPLICIT_CONFLICT",
  adjudicationReason: "Synthetic explicit adjudication.",
});

function referenceSet() {
  return buildHumanReferenceSet({
    tasks,
    annotations,
    requiredAnnotatorIds: ["annotator-a", "annotator-b"],
    adjudications: [adjudication],
    dataKind: "synthetic-fixture",
    fixture: syntheticFixture,
  });
}

function judgeResult(
  caseId: string,
  requirements: readonly { readonly requirementId: string; readonly status: string }[],
): MaterialRequirementJudgeResult {
  return {
    schemaVersion: 1,
    caseId,
    rubricAssessments: [{
      rubricId: "rubric-material",
      requirements,
    }],
  } as MaterialRequirementJudgeResult;
}

function completedExecutions(
  caseAResult: unknown = judgeResult("case-a", [
    { requirementId: "R1", status: "SATISFIED" },
    { requirementId: "R2", status: "OMITTED_OR_INCOMPLETE" },
  ]),
): readonly { readonly caseId: string; readonly result?: unknown; readonly executionErrorCode?: string }[] {
  return [
    { caseId: "case-a", result: caseAResult },
    {
      caseId: "case-b",
      result: judgeResult("case-b", [{ requirementId: "R1", status: "EXPLICIT_CONFLICT" }]),
    },
    { caseId: "case-error", executionErrorCode: "material_judge_unavailable" },
  ];
}

test("batch comparison aggregates atomic, derived, requirement, and provenance agreement", () => {
  const report = compareJudgeBatchToHumanReference(completedExecutions(), referenceSet());

  assert.equal(report.reportKind, "human-reference-judge-comparison");
  assert.equal(report.plannedJudgeCalls, 3);
  assert.equal(report.completedJudgeCalls, 3);
  assert.equal(report.executionErrors.count, 1);
  assert.equal(report.referenceAgreement.comparableAtomicCount, 3);
  assert.equal(report.referenceAgreement.agreementCount, 1);
  assert.equal(report.referenceAgreement.disagreementCount, 2);
  assert.equal(report.referenceAgreement.agreementShare, 1 / 3);
  assert.equal(report.referenceAgreement.confusionMatrix.SATISFIED.SATISFIED, 1);
  assert.equal(report.referenceAgreement.confusionMatrix.EXPLICIT_CONFLICT.OMITTED_OR_INCOMPLETE, 1);
  assert.equal(report.referenceAgreement.confusionMatrix.OMITTED_OR_INCOMPLETE.EXPLICIT_CONFLICT, 1);
  assert.equal(report.derivedLabelAgreement.comparableRubricCount, 2);
  assert.equal(report.derivedLabelAgreement.agreementCount, 1);
  assert.equal(report.derivedLabelAgreement.disagreementCount, 1);

  assert.deepEqual(report.perRequirementAgreement, {
    R1: {
      comparableAtomicCount: 2,
      agreementCount: 1,
      disagreementCount: 1,
      agreementShare: 0.5,
    },
    R2: {
      comparableAtomicCount: 1,
      agreementCount: 0,
      disagreementCount: 1,
      agreementShare: 0,
    },
  });
  assert.deepEqual(report.referenceProvenanceAgreement, {
    human_consensus: {
      comparableAtomicCount: 2,
      agreementCount: 1,
      disagreementCount: 1,
      agreementShare: 0.5,
    },
    human_adjudicated: {
      comparableAtomicCount: 1,
      agreementCount: 0,
      disagreementCount: 1,
      agreementShare: 0,
    },
  });
  assert.equal(report.perCase.find((value) => value.caseId === "case-error")?.status, "execution_error");
});

test("runner sends only the exact Material Requirement visible input and calls once per task", async () => {
  const reference = referenceSet();
  const inputs: MaterialRequirementJudgeInput[] = [];
  const judge = {
    evaluate: async (input: MaterialRequirementJudgeInput) => {
      const taskValue = reference.tasks.find((value) => value.caseId === input.caseId);
      assert.ok(taskValue);
      return judgeResult(
        input.caseId,
        taskValue.rubrics.flatMap((rubric) => rubric.requirements.map((requirement) => ({
          requirementId: requirement.id,
          status: "SATISFIED",
        }))),
      );
    },
    evaluateWithMetrics: async (input: MaterialRequirementJudgeInput) => {
      inputs.push(input);
      const taskValue = reference.tasks.find((value) => value.caseId === input.caseId);
      assert.ok(taskValue);
      return {
        result: judgeResult(
          input.caseId,
          taskValue.rubrics.flatMap((rubric) => rubric.requirements.map((requirement) => ({
            requirementId: requirement.id,
            status: "SATISFIED",
          }))),
        ),
        metrics: {
          latencyMs: 3,
          tokenUsage: { inputTokens: 10, outputTokens: 4, totalTokens: 14 },
          cost: null,
          attempts: 1,
        },
      };
    },
  };
  const report = await runHumanReferenceJudgeComparison(reference, {
    judge,
    judgeIdentity: {
      provider: "synthetic-test",
      model: "local-fake",
      promptId: MATERIAL_REQUIREMENT_JUDGE_PROMPT_ID,
      promptVersion: MATERIAL_REQUIREMENT_JUDGE_PROMPT_VERSION,
    },
  });

  assert.equal(inputs.length, reference.tasks.length);
  assert.equal(report.completedJudgeCalls, reference.tasks.length);
  const allowedKeys = [
    "caseId",
    "learningObjective",
    "studentProfile",
    "conversationHistory",
    "studentMessage",
    "problemContext",
    "groundTruth",
    "knownMisconception",
    "disclosurePolicy",
    "rubrics",
    "tutorResponse",
  ].sort();
  for (const input of inputs) {
    assert.deepEqual(Object.keys(input).sort(), allowedKeys);
    assert.equal("schemaVersion" in input, false);
    assert.equal("status" in input, false);
    assert.equal("provenance" in input, false);
    assert.equal("annotatorId" in input, false);
    assert.equal("adjudication" in input, false);
    assert.equal("expectedLabel" in input, false);
  }
  assert.deepEqual(report.tokenUsageCoverage.totalTokens, {
    completeTotal: 42,
    knownTotal: 42,
    knownCount: 3,
    plannedCount: 3,
    unavailableCount: 0,
    coverageShare: 1,
  });
});

test("invalid or mismatched Judge results fail closed as execution-invalid", () => {
  const invalidResults: readonly unknown[] = [
    judgeResult("wrong-case", [{ requirementId: "R1", status: "SATISFIED" }]),
    {
      schemaVersion: 1,
      caseId: "case-a",
      rubricAssessments: [{ rubricId: "wrong-rubric", requirements: [{ requirementId: "R1", status: "SATISFIED" }] }],
    },
    judgeResult("case-a", [{ requirementId: "wrong-requirement", status: "SATISFIED" }]),
    judgeResult("case-a", [{ requirementId: "R1", status: "PASS" }]),
  ];
  for (const result of invalidResults) {
    const report = compareJudgeBatchToHumanReference(
      completedExecutions(result),
      referenceSet(),
    );
    const invalidCase = report.perCase.find((value) => value.caseId === "case-a");
    assert.equal(invalidCase?.status, "execution_invalid");
    assert.equal(invalidCase?.executionErrorCode, "material_judge_result_invalid");
    assert.equal(invalidCase?.referenceAgreement, undefined);
    assert.equal(report.referenceAgreement.comparableAtomicCount, 1);
  }
});

test("CLI requires explicit DeepSeek opt-in and exposes deterministic options", () => {
  const annotationsPath = resolve("fixtures", "human-reference-calibration", "synthetic-annotations.json");
  assert.throws(
    () => parseTutorbenchArgs([
      "human-reference-judge-comparison",
      "--annotations",
      annotationsPath,
    ]),
    /--judge-deepseek is required/,
  );
  const parsed = parseTutorbenchArgs([
    "human-reference-judge-comparison",
    `--annotations=${annotationsPath}`,
    "--adjudications=fixtures/human-reference-calibration/synthetic-adjudications.json",
    "--judge-deepseek",
    "--output=artifacts/comparison.json",
  ]);
  assert.equal(parsed.help, false);
  if (
    parsed.help ||
    !("humanReferenceJudgeComparison" in parsed) ||
    parsed.humanReferenceJudgeComparison.help
  ) {
    return;
  }
  assert.equal(parsed.humanReferenceJudgeComparison.judgeDeepSeek, true);
  assert.equal(parsed.humanReferenceJudgeComparison.annotationPath, resolve(annotationsPath));
  assert.equal(parsed.humanReferenceJudgeComparison.outputPath, resolve("artifacts/comparison.json"));
});

test("comparison CLI reuses strict DeepSeek configuration errors without a network call", async () => {
  const parsed = parseTutorbenchArgs([
    "human-reference-judge-comparison",
    "--annotations",
    resolve("fixtures", "human-reference-calibration", "synthetic-annotations.json"),
    "--judge-deepseek",
  ]);
  assert.equal(parsed.help, false);
  if (
    parsed.help ||
    !("humanReferenceJudgeComparison" in parsed)
  ) {
    return;
  }
  const comparisonOptions = parsed.humanReferenceJudgeComparison;
  if (comparisonOptions.help) {
    return;
  }
  await assert.rejects(
    () => runHumanReferenceJudgeComparisonCli(comparisonOptions, {}),
    (error: unknown) =>
      error instanceof MaterialRequirementJudgeConfigurationError &&
      error.code === "api_key_missing",
  );
  await assert.rejects(
    () => runHumanReferenceJudgeComparisonCli(
      comparisonOptions,
      { DEEPSEEK_API_KEY: "configured-but-no-model" },
    ),
    (error: unknown) =>
      error instanceof MaterialRequirementJudgeConfigurationError &&
      error.code === "model_missing",
  );
});

test("comparison report is provider-safe and keeps frozen protocol/prompt identities", async () => {
  const report = compareJudgeBatchToHumanReference(completedExecutions(), referenceSet(), {
    judge: {
      provider: "synthetic-test",
      model: "local-fake",
      promptId: MATERIAL_REQUIREMENT_JUDGE_PROMPT_ID,
      promptVersion: MATERIAL_REQUIREMENT_JUDGE_PROMPT_VERSION,
    },
  });
  assert.equal(report.calibrationProtocolId, HUMAN_REFERENCE_PROTOCOL_ID);
  assert.equal(report.calibrationProtocolVersion, HUMAN_REFERENCE_PROTOCOL_VERSION);
  assert.equal(report.judge.promptVersion, "0.4");
  const serialized = JSON.stringify(report);
  assert.doesNotMatch(serialized, /accuracy|gold|reasoning_content|rawProviderPayload/i);

  const directory = await mkdtemp(join(tmpdir(), "tutorbench-human-reference-comparison-"));
  try {
    const outputPath = join(directory, "comparison.json");
    await writeHumanReferenceJudgeComparisonJson(report, outputPath);
    const persisted = await readFile(outputPath, "utf8");
    assert.doesNotMatch(persisted, /accuracy|gold|reasoning_content|rawProviderPayload/i);
    assert.match(persisted, /human-reference-judge-comparison/);

    const unsafeReport = {
      ...report,
      rawProviderPayload: { hidden: true },
      perCase: report.perCase.map((caseReport) => ({
        ...caseReport,
        rawProviderPayload: { hidden: true },
        ...(caseReport.judgeResult === undefined
          ? {}
          : { judgeResult: { ...caseReport.judgeResult, reasoning_content: "hidden" } }),
      })),
    } as typeof report & { readonly rawProviderPayload: unknown };
    const unsafePath = join(directory, "comparison-unsafe.json");
    await writeHumanReferenceJudgeComparisonJson(unsafeReport, unsafePath);
    assert.doesNotMatch(await readFile(unsafePath, "utf8"), /reasoning_content|rawProviderPayload/i);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("frozen Material Judge status vocabulary remains atomic", () => {
  assert.deepEqual(HUMAN_ATOMIC_STATUSES, [
    "SATISFIED",
    "OMITTED_OR_INCOMPLETE",
    "EXPLICIT_CONFLICT",
  ]);
  assert.equal(MATERIAL_REQUIREMENT_JUDGE_PROMPT_ID, "tutor-eval-material-requirement-judge-system");
  assert.equal(MATERIAL_REQUIREMENT_JUDGE_PROMPT_VERSION, "0.4");
  assert.doesNotThrow(() => materialRequirementJudgeInputFromHumanReferenceTask(tasks[0]));
});
