import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { resolve } from "node:path";

import {
  loadManualLeakageAuditArtifact,
  MANUAL_LEAKAGE_AUDIT_LIMITATIONS,
  parseManualLeakageAuditArtifact,
  summarizeManualLeakageAudit,
} from "../src/audits/index.js";

const artifactPath = resolve(
  process.cwd(),
  "docs/audits/tutor-eval-manual-leakage-positive-set-audit-v0.1.json",
);

test("manual leakage audit artifact validates the preliminary positive-set counts", async () => {
  const artifact = await loadManualLeakageAuditArtifact(artifactPath);
  assert.equal(artifact.schemaVersion, 1);
  assert.equal(artifact.sourceDatasetId, "tutor-eval-v0.2a");
  assert.equal(artifact.sourceDatasetVersion, "0.2a.3");
  assert.deepEqual(artifact.sourceTutor, { provider: "minimax", model: "MiniMax-M2.7" });
  assert.deepEqual(artifact.sourceJudge, { provider: "deepseek", model: "deepseek-v4-pro" });
  assert.deepEqual(artifact.sourceJudgePrompt, {
    id: "tutor-eval-pedagogy-judge-system",
    version: "0.3",
  });
  assert.equal(artifact.scope.type, "judge_positive_only");
  assert.equal(artifact.entries.length, 12);
  assert.equal(artifact.auditedJudgePositiveCount, 12);
  assert.equal(artifact.humanConfirmedPositiveCount, 9);
  assert.equal(artifact.humanDisagreedCount, 3);
  assert.equal(artifact.cohort.judgeObservedPositiveRate, 0.25);
  assert.equal(artifact.cohort.humanConfirmedLowerBoundRate, 0.1875);

  const caseIds = artifact.entries.map((entry) => entry.caseId);
  assert.equal(new Set(caseIds).size, 12);
  assert.equal(
    artifact.entries.filter((entry) => entry.humanDecision.agreement === "agree").length,
    9,
  );
  assert.equal(
    artifact.entries.filter((entry) => entry.humanDecision.agreement === "disagree").length,
    3,
  );
  for (const entry of artifact.entries) {
    assert.equal(entry.judgeCriticalFailure.type, "answer_leakage");
    assert.equal(entry.judgeCriticalFailure.severity, "major");
    assert.equal(entry.humanDecision.confidence, "high");
    assert.ok(entry.humanDecision.rationale.length > 0);
  }
  for (const limitation of MANUAL_LEAKAGE_AUDIT_LIMITATIONS) {
    assert.ok(artifact.limitations.includes(limitation));
  }
  assert.doesNotMatch(JSON.stringify(artifact), /reasoning_content|rawProviderPayload|apiKey|secret/u);
});

test("manual leakage audit summary preserves the lower-bound limitation", async () => {
  const artifact = await loadManualLeakageAuditArtifact(artifactPath);
  const summary = summarizeManualLeakageAudit(artifact);
  assert.deepEqual(summary, {
    auditedJudgePositiveCount: 12,
    humanConfirmedPositiveCount: 9,
    humanDisagreedCount: 3,
    positiveAgreementRate: 0.75,
    limitation:
      "This audit covers Judge-positive cases only. Judge-negative cases were not human-audited, so recall and total leakage prevalence are unknown.",
  });
});

test("manual leakage audit parser rejects duplicate case IDs", async () => {
  const raw = JSON.parse(await readFile(artifactPath, "utf8")) as {
    entries: Array<Record<string, unknown>>;
  };
  const duplicate = {
    ...raw,
    entries: [...raw.entries, raw.entries[0]],
    auditedJudgePositiveCount: 13,
    humanConfirmedPositiveCount: 10,
  };
  assert.throws(() => parseManualLeakageAuditArtifact(duplicate), /Manual leakage audit artifact is invalid/);
});
