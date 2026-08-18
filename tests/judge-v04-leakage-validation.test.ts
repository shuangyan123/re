import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { resolve } from "node:path";

import {
  JUDGE_V04_LEAKAGE_VALIDATION_LIMITATIONS,
  loadJudgeV04LeakageValidationArtifact,
  parseJudgeV04LeakageValidationArtifact,
} from "../src/audits/index.js";

const artifactPath = resolve(
  process.cwd(),
  "docs/audits/tutor-eval-judge-v0.4-positive-set-validation-v0.1.json",
);

test("real Judge v0.4 leakage validation artifact is provider-free and exact", async () => {
  const artifact = await loadJudgeV04LeakageValidationArtifact(artifactPath);
  const caseIds = artifact.cases.map((entry) => entry.caseId);
  const expectedCaseIds = [
    "science-graph-error-001",
    "language-word-context-001",
    "language-word-context-001-zh-CN",
    "paired-fraction-conceptual-001",
    "paired-fraction-conceptual-001-zh-CN",
    "paired-fraction-procedural-001",
    "paired-fraction-procedural-001-zh-CN",
    "paired-multiplication-procedural-001",
    "paired-multiplication-procedural-001-zh-CN",
    "programming-loop-diagnosis-001",
    "programming-abstraction-transfer-001-zh-CN",
    "science-force-transfer-001-zh-CN",
  ];

  assert.equal(artifact.schemaVersion, 1);
  assert.equal(artifact.validationId, "tutor-eval-judge-v0.4-positive-set-validation");
  assert.equal(artifact.evidenceStatus, "operator_attested");
  assert.equal(artifact.status, "preliminary");
  assert.equal(artifact.calibrationStatus, "uncalibrated");
  assert.deepEqual([...caseIds].sort(), [...expectedCaseIds].sort());
  assert.equal(caseIds.length, 12);
  assert.equal(new Set(caseIds).size, 12);
  assert.equal(artifact.cases.filter((entry) => entry.humanLeakage).length, 9);
  assert.equal(artifact.cases.filter((entry) => !entry.humanLeakage).length, 3);
  assert.ok(artifact.cases.every((entry) => entry.historicalJudgeV03Leakage));
  assert.ok(artifact.cases.every((entry) => entry.judgeV04Leakage === entry.humanLeakage));
  assert.ok(artifact.cases.every((entry) => entry.agreesWithHuman));
  assert.equal(artifact.summary.agreementCount, 12);
  assert.equal(artifact.summary.disagreementCount, 0);
  assert.equal(artifact.summary.observedAgreement, 1);
  assert.equal(artifact.summary.humanConfirmedPositiveCount, 9);
  assert.equal(artifact.summary.historicalFalsePositiveCount, 3);
  assert.equal(artifact.summary.v04ConfirmedPositiveRetainedCount, 9);
  assert.equal(artifact.summary.v04FalsePositiveCorrectedCount, 3);

  const leakageCases = artifact.cases.filter((entry) => entry.judgeV04Leakage);
  assert.equal(leakageCases.length, 9);
  for (const entry of leakageCases) {
    assert.equal(entry.criticalFailureType, "answer_leakage");
    assert.equal(entry.criticalFailureSeverity, "major");
  }
  for (const caseId of [
    "science-graph-error-001",
    "language-word-context-001",
    "language-word-context-001-zh-CN",
  ]) {
    const entry = artifact.cases.find((candidate) => candidate.caseId === caseId);
    assert.ok(entry);
    assert.equal(entry.humanLeakage, false);
    assert.equal(entry.judgeV04Leakage, false);
  }
  assert.equal(
    artifact.cases.find((entry) => entry.caseId === "language-word-context-001")?.finalStatus,
    "failed",
  );
  assert.equal(
    artifact.cases.find((entry) => entry.caseId === "language-word-context-001-zh-CN")?.finalStatus,
    "failed",
  );

  assert.deepEqual(artifact.executionNotes, {
    caseId: "programming-loop-diagnosis-001",
    initialResult: "judge_result_invalid",
    initialClassificationValid: false,
    recovery: "strict_resume",
    reusedCaseRuns: 8,
    judgeCallsMade: 1,
    finalCaseRuns: 9,
    finalClassificationValid: true,
  });
  assert.equal(artifact.executionNotes.initialClassificationValid, false);
  assert.equal(artifact.executionNotes.finalClassificationValid, true);
  assert.equal(artifact.summary.disagreementCount, 0);
  assert.equal(
    artifact.cases.find((entry) => entry.caseId === artifact.executionNotes.caseId)
      ?.agreesWithHuman,
    true,
  );
  for (const limitation of JUDGE_V04_LEAKAGE_VALIDATION_LIMITATIONS) {
    assert.ok(artifact.limitations.includes(limitation));
  }
  assert.ok(artifact.limitations.includes("historical Judge-negative cases not human audited"));
  assert.ok(artifact.limitations.includes("recall unknown"));
  assert.ok(artifact.limitations.includes("false-negative rate unknown"));
  assert.ok(artifact.limitations.includes("calibration not established"));

  const serialized = await readFile(artifactPath, "utf8");
  assert.doesNotMatch(
    serialized,
    /rawTutorResponse|rawJudgeResult|rawProviderPayload|reasoning_content|hiddenReasoning|apiKey|requestId/u,
  );
});

test("v0.4 validation parser rejects duplicate cases and unknown provider payload fields", async () => {
  const raw = JSON.parse(await readFile(artifactPath, "utf8")) as Record<string, unknown>;
  const cases = raw.cases as unknown[];
  assert.throws(
    () => parseJudgeV04LeakageValidationArtifact({ ...raw, cases: [...cases, cases[0]] }),
    /DeepSeek Judge v0\.4 leakage validation artifact is invalid/,
  );
  assert.throws(
    () => parseJudgeV04LeakageValidationArtifact({ ...raw, rawProviderPayload: {} }),
    /DeepSeek Judge v0\.4 leakage validation artifact is invalid/,
  );
});
