import assert from "node:assert/strict";
import { resolve } from "node:path";
import { test } from "node:test";

import {
  buildCalibrationCriticalFailurePacket,
  buildCalibrationCriticalFailureReferenceSet,
  buildCalibrationCriticalFailureReport,
  compareCalibrationCriticalFailureJudgeLabels,
  compareCriticalFailureReviewerAnnotations,
  toCalibrationCandidateResponseFile,
} from "../src/calibration/index.js";
import {
  loadCalibrationCandidateResponseFile,
  loadCalibrationCriticalFailureAdjudicationFile,
  loadCalibrationCriticalFailureAnnotationFile,
  loadCalibrationCriticalFailureTargetFile,
} from "../src/calibration/io.js";
import {
  BenchmarkConfigurationError,
  type CalibrationCandidateResponseFile,
  type CriticalFailureCalibrationValidationInput,
  type TutorResponseCorpus,
} from "../src/contracts/index.js";
import {
  findCriticalFailureCalibrationReferenceReadinessIssues,
  findCriticalFailureCalibrationValidationIssues,
  parseCalibrationCriticalFailureAnnotationFile,
  parseCalibrationCriticalFailureTargetFile,
  parseHumanCriticalFailureAnnotation,
} from "../src/contracts/critical-failure-calibration-validation.js";
import { parseCalibrationCandidateResponseFile } from "../src/contracts/calibration-validation.js";
import { loadTutorEvalDataset } from "../src/datasets/index.js";

const fixtureRoot = resolve(process.cwd(), "fixtures", "calibration");

async function loadCriticalFixtureInput(): Promise<CriticalFailureCalibrationValidationInput> {
  const [dataset, candidates, targetFile, reviewerA, reviewerB, adjudicationFile] =
    await Promise.all([
      loadTutorEvalDataset("tutor-eval-v0.2a"),
      loadCalibrationCandidateResponseFile(
        resolve(fixtureRoot, "critical-failure-candidate-responses.json"),
      ),
      loadCalibrationCriticalFailureTargetFile(
        resolve(fixtureRoot, "critical-failure-targets.json"),
      ),
      loadCalibrationCriticalFailureAnnotationFile(
        resolve(fixtureRoot, "critical-reviewer-a.json"),
      ),
      loadCalibrationCriticalFailureAnnotationFile(
        resolve(fixtureRoot, "critical-reviewer-b.json"),
      ),
      loadCalibrationCriticalFailureAdjudicationFile(
        resolve(fixtureRoot, "critical-adjudication.json"),
      ),
    ]);
  return {
    dataset,
    candidates,
    targetFile,
    annotationFiles: [reviewerA, reviewerB],
    adjudicationFile,
  };
}

test("critical-failure fixture identities and blind packet are provider-independent", async () => {
  const input = await loadCriticalFixtureInput();
  assert.deepEqual(findCriticalFailureCalibrationValidationIssues(input), []);
  assert.deepEqual(findCriticalFailureCalibrationReferenceReadinessIssues(input), []);
  const packet = buildCalibrationCriticalFailurePacket(
    input.dataset,
    input.candidates,
    input.targetFile,
  );
  assert.equal(packet.blind, true);
  assert.equal(packet.entries.length, 6);
  const leakage = packet.entries.find(
    (entry) => entry.failureType === "answer_leakage" && entry.caseId === "fraction-misconception-001",
  );
  assert.equal(leakage?.reviewerContext.disclosurePolicy, "hint_only");
  const diagnosis = packet.entries.find((entry) => entry.failureType === "incorrect_diagnosis");
  assert.match(JSON.stringify(diagnosis), /nearby noun|subject|verb/i);
  const serialized = JSON.stringify(packet);
  assert.doesNotMatch(serialized, /provider|model|tutorDescriptor|Judge|judgeOutput|reviewerId/i);
  assert.doesNotMatch(serialized, /evaluatorOnly|synthetic-good/);
});

test("critical annotation parser enforces three-state and severity semantics", () => {
  const base = {
    schemaVersion: 1,
    annotationId: "critical-test-1",
    targetId: "target-1",
    datasetId: "tutor-eval-v0.2a",
    datasetVersion: "0.2a.1",
    caseId: "case-1",
    caseVersion: "1.0.0",
    responseId: "response-1",
    reviewerId: "reviewer-a",
    createdAt: "2026-08-15T00:00:00.000Z",
  };
  assert.throws(
    () => parseHumanCriticalFailureAnnotation({ ...base, decision: "PRESENT" }),
    (error: unknown) =>
      error instanceof BenchmarkConfigurationError &&
      error.code === "calibration_critical_failure_annotation_invalid",
  );
  assert.throws(
    () => parseHumanCriticalFailureAnnotation({ ...base, decision: "ABSENT", severity: "major" }),
    (error: unknown) =>
      error instanceof BenchmarkConfigurationError &&
      error.code === "calibration_critical_failure_annotation_invalid",
  );
  const absent = parseHumanCriticalFailureAnnotation({
    ...base,
    decision: "ABSENT",
  });
  assert.equal(absent.failureType, undefined);
  assert.throws(
    () => parseHumanCriticalFailureAnnotation({ ...base, decision: "UNSURE", severity: "major" }),
    (error: unknown) =>
      error instanceof BenchmarkConfigurationError &&
      error.code === "calibration_critical_failure_annotation_invalid",
  );
  const unsure = parseHumanCriticalFailureAnnotation({
    ...base,
    decision: "UNSURE",
    evidence: "The excerpt is ambiguous.",
    ambiguity: { present: true, reason: "Observable boundary is unclear." },
  });
  assert.equal(unsure.decision, "UNSURE");
  assert.equal(unsure.failureType, undefined);
  assert.throws(
    () =>
      parseHumanCriticalFailureAnnotation({
        ...base,
        decision: "ABSENT",
        failureType: "not-a-critical-failure",
      }),
    (error: unknown) =>
      error instanceof BenchmarkConfigurationError &&
      error.code === "calibration_critical_failure_annotation_invalid",
  );
  assert.throws(
    () =>
      parseHumanCriticalFailureAnnotation({
        ...base,
        decision: "PRESENT",
        failureType: "answer_leakage",
        severity: "extreme",
      }),
    (error: unknown) =>
      error instanceof BenchmarkConfigurationError &&
      error.code === "calibration_critical_failure_annotation_invalid",
  );
  assert.throws(
    () =>
      parseHumanCriticalFailureAnnotation({
        ...base,
        decision: "PRESENT",
        failureType: "answer_leakage",
        severity: "major",
        reviewerId: "person@example.com",
      }),
    (error: unknown) =>
      error instanceof BenchmarkConfigurationError &&
      error.code === "calibration_critical_failure_annotation_invalid",
  );
});

test("critical agreement keeps UNSURE out of scored presence and reports severity disagreement", async () => {
  const input = await loadCriticalFixtureInput();
  const report = buildCalibrationCriticalFailureReport(input);
  assert.equal(report.metrics?.pairedJudgmentCount, 6);
  assert.equal(report.metrics?.scoredJudgmentCount, 5);
  assert.equal(report.metrics?.unsurePairCount, 1);
  assert.equal(report.metrics?.scoredExactAgreement, 0.8);
  assert.equal(report.metrics?.severity.pairedJudgmentCount, 2);
  assert.equal(report.metrics?.severity.exactAgreement, 0.5);
  assert.equal(report.metrics?.type.exactAgreement, 2 / 3);
  assert.equal(report.metrics?.presenceConfusionMatrix.PRESENT.ABSENT, 1);
  assert.ok(report.highestDisagreement.some((item) => item.failureType === "instruction_violation"));
});

test("atomic targets support multiple failure types for one response", async () => {
  const input = await loadCriticalFixtureInput();
  const conceptualTargets = input.targetFile.targets.filter(
    (target) => target.responseId === "critical-response-leakage",
  );
  assert.deepEqual(
    conceptualTargets.map((target) => target.failureType).sort(),
    ["answer_leakage", "student_task_takeover"],
  );
  const pair = compareCriticalFailureReviewerAnnotations(
    "reviewer-a",
    "reviewer-b",
    input.annotationFiles[0]!.annotations,
    input.annotationFiles[1]!.annotations,
  );
  assert.equal(pair.unpairedLeft.length, 0);
  assert.equal(pair.unpairedRight.length, 0);
  assert.equal(pair.type.pairedResponseCount, 4);
});

test("critical target registry rejects duplicate semantic judgment atoms", async () => {
  const input = await loadCriticalFixtureInput();
  const firstTarget = input.targetFile.targets[0]!;

  assert.throws(
    () =>
      parseCalibrationCriticalFailureTargetFile({
        ...input.targetFile,
        targets: [firstTarget, firstTarget],
      }),
    (error: unknown) =>
      error instanceof BenchmarkConfigurationError &&
      error.code === "calibration_critical_failure_target_invalid",
  );
  assert.throws(
    () =>
      parseCalibrationCriticalFailureTargetFile({
        ...input.targetFile,
        targets: [
          firstTarget,
          { ...firstTarget, targetId: "target-duplicate-semantic" },
        ],
      }),
    (error: unknown) =>
      error instanceof BenchmarkConfigurationError &&
      error.code === "calibration_critical_failure_target_invalid",
  );

  const validIssues = findCriticalFailureCalibrationValidationIssues(input);
  assert.equal(
    validIssues.some((issue) => issue.code === "critical_target_duplicate_semantic_identity"),
    false,
  );

  const semanticDuplicateIssues = findCriticalFailureCalibrationValidationIssues({
    ...input,
    targetFile: {
      ...input.targetFile,
      targets: [
        ...input.targetFile.targets,
        { ...firstTarget, targetId: "target-cross-file-semantic-duplicate" },
      ],
    },
  });
  assert.ok(
    semanticDuplicateIssues.some(
      (issue) =>
        issue.code === "critical_target_duplicate_semantic_identity" &&
        issue.targetId === "target-cross-file-semantic-duplicate",
    ),
  );

  const caseMismatchIssues = findCriticalFailureCalibrationValidationIssues({
    ...input,
    targetFile: {
      ...input.targetFile,
      targets: [
        ...input.targetFile.targets,
        {
          ...firstTarget,
          targetId: "target-case-mismatch",
          caseId: "history-source-context-001",
          caseVersion: "1.0.0",
        },
      ],
    },
  });
  assert.ok(
    caseMismatchIssues.some(
      (issue) => issue.code === "critical_target_case_version_mismatch",
    ),
  );
  assert.equal(
    caseMismatchIssues.some(
      (issue) => issue.code === "critical_target_duplicate_semantic_identity",
    ),
    false,
  );

  const crossDatasetIssues = findCriticalFailureCalibrationValidationIssues({
    ...input,
    targetFile: {
      ...input.targetFile,
      targets: [
        ...input.targetFile.targets,
        { ...firstTarget, targetId: "target-dataset-version", datasetVersion: "0.2a" },
      ],
    },
  });
  assert.ok(
    crossDatasetIssues.some(
      (issue) => issue.code === "critical_target_dataset_mismatch",
    ),
  );
  assert.equal(
    crossDatasetIssues.some(
      (issue) => issue.code === "critical_target_duplicate_semantic_identity",
    ),
    false,
  );
});

test("critical annotations stay target-bound and reviewer streams stay isolated", async () => {
  const input = await loadCriticalFixtureInput();
  const targetMismatch = {
    ...input.annotationFiles[0]!,
    annotations: input.annotationFiles[0]!.annotations.map((annotation, index) =>
      index === 0 ? { ...annotation, responseId: "critical-response-history" } : annotation,
    ),
  };
  const mismatchIssues = findCriticalFailureCalibrationValidationIssues({
    ...input,
    annotationFiles: [targetMismatch, input.annotationFiles[1]!],
  });
  assert.ok(
    mismatchIssues.some(
      (issue) => issue.code === "critical_annotation_target_mismatch",
    ),
  );

  const duplicate = {
    ...input.annotationFiles[0]!,
    annotations: [
      ...input.annotationFiles[0]!.annotations,
      {
        ...input.annotationFiles[0]!.annotations[0]!,
        annotationId: "critical-a-duplicate",
      },
    ],
  };
  const duplicateIssues = findCriticalFailureCalibrationValidationIssues({
    ...input,
    annotationFiles: [duplicate, input.annotationFiles[1]!],
  });
  assert.ok(
    duplicateIssues.some(
      (issue) => issue.code === "critical_annotation_duplicate_reviewer_judgment",
    ),
  );

  assert.throws(
    () =>
      parseCalibrationCriticalFailureAnnotationFile({
        ...input.annotationFiles[0]!,
        annotations: [
          {
            ...input.annotationFiles[0]!.annotations[0]!,
            reviewerId: "reviewer-b",
          },
        ],
      }),
    (error: unknown) =>
      error instanceof BenchmarkConfigurationError &&
      error.code === "calibration_critical_failure_annotation_invalid",
  );
});

test("reference aggregation uses exact agreement or completed adjudication only", async () => {
  const input = await loadCriticalFixtureInput();
  const before = JSON.stringify(input.annotationFiles);
  const referenceSet = buildCalibrationCriticalFailureReferenceSet(input);
  assert.equal(referenceSet.humanCalibrationAvailable, false);
  assert.equal(referenceSet.labels.length, 6);
  const leakage = referenceSet.labels.find(
    (label) => label.failureType === "answer_leakage" && label.caseId === "fraction-misconception-001",
  );
  assert.equal(leakage?.finalDecision, "PRESENT");
  assert.equal(leakage?.finalSeverity, "major");
  assert.equal(leakage?.agreement, "exact");
  const adjudicated = referenceSet.labels.find(
    (label) => label.failureType === "incorrect_diagnosis",
  );
  assert.equal(adjudicated?.finalDecision, "ABSENT");
  assert.equal(adjudicated?.adjudicationStatus, "completed");
  assert.equal(JSON.stringify(input.annotationFiles), before);
  const unresolved: CriticalFailureCalibrationValidationInput = {
    dataset: input.dataset,
    candidates: input.candidates,
    targetFile: input.targetFile,
    annotationFiles: input.annotationFiles,
  };
  assert.ok(
    findCriticalFailureCalibrationReferenceReadinessIssues(unresolved).some(
      (issue) => issue.code === "critical_adjudication_missing",
    ),
  );
});

test("Judge labels stay a separate provider-independent comparison input", async () => {
  const input = await loadCriticalFixtureInput();
  const referenceSet = buildCalibrationCriticalFailureReferenceSet(input);
  const judgeLabels = referenceSet.labels.map((label) => ({
    schemaVersion: 1 as const,
    targetId: label.targetId,
    datasetId: label.datasetId,
    datasetVersion: label.datasetVersion,
    caseId: label.caseId,
    caseVersion: label.caseVersion,
    responseId: label.responseId,
    failureType: label.failureType,
    decision:
      label.failureType === "answer_leakage" && label.caseId === "fraction-misconception-001"
        ? "ABSENT" as const
        : label.finalDecision,
    ...(label.finalSeverity === undefined ? {} : { severity: label.finalSeverity }),
  }));
  const comparison = compareCalibrationCriticalFailureJudgeLabels({
    referenceSet,
    judgeLabels,
    dataset: input.dataset,
  });
  assert.equal(comparison.falseNegativeCount, 1);
  assert.equal(comparison.falsePositiveCount, 0);
  assert.equal(comparison.recall, 0.5);
  assert.equal(comparison.byDisclosurePolicy.hint_only?.falseNegativeCount, 1);
  assert.equal("provider" in judgeLabels[0]!, false);
});

test("semantic replay provenance keeps target calibration identity separate from source response identity", () => {
  const candidateFile: CalibrationCandidateResponseFile = {
    schemaVersion: 1,
    dataKind: "candidate-corpus",
    datasetId: "tutor-eval-v0.2a",
    datasetVersion: "0.2a.1",
    responses: [
      {
        schemaVersion: 1,
        responseId: "tutor-response-source-identity",
        datasetId: "tutor-eval-v0.2a",
        datasetVersion: "0.2a.1",
        caseId: "language-verb-check-001",
        caseVersion: "1.0.1",
        sourceCorpus: { corpusId: "source-corpus", corpusVersion: "1" },
        sourceRun: { runId: "source-corpus", runIndex: 1 },
        semanticReplay: {
          compatibilityId:
            "tutor-eval-v0.2a-0.2a-to-0.2a.1-language-verb-1.0.0-to-1.0.1",
          sourceDatasetId: "tutor-eval-v0.2a",
          sourceDatasetVersion: "0.2a",
          targetDatasetId: "tutor-eval-v0.2a",
          targetDatasetVersion: "0.2a.1",
          caseVersionMappings: [
            { caseId: "language-verb-check-001", sourceVersion: "1.0.0", targetVersion: "1.0.1" },
          ],
        },
        responseText: "Synthetic replay response.",
        provenance: "recorded_model",
      },
    ],
  };
  const parsed = parseCalibrationCriticalFailureAnnotationFile({
    schemaVersion: 1,
    dataKind: "synthetic-fixture",
    fixture: { synthetic: true, notHumanCalibrationData: true },
    datasetId: "tutor-eval-v0.2a",
    datasetVersion: "0.2a.1",
    reviewerId: "reviewer-a",
    annotations: [],
  });
  assert.equal(parsed.annotations.length, 0);
  const parsedCandidate = parseCalibrationCandidateResponseFile(candidateFile);
  assert.equal(parsedCandidate.responses[0]?.responseId, "tutor-response-source-identity");
  assert.equal(parsedCandidate.responses[0]?.semanticReplay?.targetDatasetVersion, "0.2a.1");
});

test("corpus conversion can project an audited replay to target calibration identity without re-signing responseId", async () => {
  const dataset = await loadTutorEvalDataset("tutor-eval-v0.2a");
  const corpus: TutorResponseCorpus = {
    schemaVersion: 1,
    corpusId: "source-corpus",
    corpusVersion: "1",
    datasetId: "tutor-eval-v0.2a",
    datasetVersion: "0.2a",
    createdAt: "2026-08-15T00:00:00.000Z",
    coverage: "partial",
    runsPerCase: 1,
    provenance: "synthetic",
    tutor: { provider: "synthetic", model: "fixture", promptVersion: "1" },
    responses: [
      {
        schemaVersion: 1,
        responseId: "source-response-identity",
        caseId: "language-verb-check-001",
        caseVersion: "1.0.0",
        runIndex: 1,
        responseText: "Synthetic source response.",
        provenance: "synthetic",
      },
    ],
  };
  const semanticReplay = {
    compatibilityId:
      "tutor-eval-v0.2a-0.2a-to-0.2a.1-language-verb-1.0.0-to-1.0.1",
    sourceDatasetId: "tutor-eval-v0.2a",
    sourceDatasetVersion: "0.2a",
    targetDatasetId: "tutor-eval-v0.2a",
    targetDatasetVersion: "0.2a.1",
    caseVersionMappings: [
      { caseId: "language-verb-check-001", sourceVersion: "1.0.0", targetVersion: "1.0.1" },
    ],
  } as const;
  const candidates = toCalibrationCandidateResponseFile(corpus, {
    dataset,
    semanticReplay,
  });
  assert.equal(candidates.datasetVersion, "0.2a.1");
  assert.equal(candidates.responses[0]?.responseId, "source-response-identity");
  assert.equal(candidates.responses[0]?.caseVersion, "1.0.1");
  assert.equal(candidates.responses[0]?.semanticReplay?.sourceDatasetVersion, "0.2a");
  assert.equal(candidates.responses[0]?.sourceCorpus?.corpusId, "source-corpus");
});
