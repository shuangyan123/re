import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { test } from "node:test";

import {
  buildCalibrationPacket,
  buildCalibrationReferenceSet,
  buildCalibrationReport,
  calculateCohenKappa,
  calculateWeightedCohenKappa,
  compareReviewerAnnotations,
  formatCalibrationReport,
} from "../src/calibration/index.js";
import {
  loadCalibrationAdjudicationFile,
  loadCalibrationAnnotationFile,
  loadCalibrationCandidateResponseFile,
} from "../src/calibration/io.js";
import {
  BenchmarkConfigurationError,
  TUTOR_EVAL_PREVIOUS_DATASET_VERSION,
  type CalibrationConfusionMatrix,
  type HumanRubricAnnotation,
} from "../src/contracts/index.js";
import {
  findCalibrationReferenceReadinessIssues,
  findCalibrationValidationIssues,
  parseHumanRubricAnnotation,
} from "../src/contracts/calibration-validation.js";
import { loadTutorEvalDataset } from "../src/datasets/index.js";

const fixtureRoot = resolve(process.cwd(), "fixtures", "calibration");

async function loadFixtureInput() {
  return {
    dataset: await loadTutorEvalDataset(
      "tutor-eval-v0.2a",
      TUTOR_EVAL_PREVIOUS_DATASET_VERSION,
    ),
    candidates: await loadCalibrationCandidateResponseFile(
      resolve(fixtureRoot, "candidate-responses.json"),
    ),
    annotationFiles: [
      await loadCalibrationAnnotationFile(resolve(fixtureRoot, "reviewer-a.json")),
      await loadCalibrationAnnotationFile(resolve(fixtureRoot, "reviewer-b.json")),
    ],
    adjudicationFile: await loadCalibrationAdjudicationFile(
      resolve(fixtureRoot, "adjudication.json"),
    ),
  };
}

function makeAnnotation(
  reviewerId: string,
  annotationId: string,
  responseId: string,
  label: HumanRubricAnnotation["label"],
): HumanRubricAnnotation {
  return {
    schemaVersion: 1,
    annotationId,
    datasetId: "dataset-1",
    datasetVersion: "0.2b",
    caseId: "case-1",
    caseVersion: "1.0.0",
    responseId,
    rubricId: "rubric-1",
    reviewerId,
    label,
    createdAt: "2026-08-13T00:00:00.000Z",
  };
}

test("calibration fixture contracts and cross-record identities validate", async () => {
  const input = await loadFixtureInput();
  assert.deepEqual(findCalibrationValidationIssues(input), []);
  assert.deepEqual(findCalibrationReferenceReadinessIssues(input), []);
  assert.equal(input.candidates.responses[0]?.sourceRun?.runId, "fixture-run-001");
});

test("blind packet keeps Tutor-visible input separate from reviewer context and source metadata", async () => {
  const input = await loadFixtureInput();
  const packet = buildCalibrationPacket(input.dataset, input.candidates);
  assert.equal(packet.blind, true);
  assert.equal(packet.entries.length, 4);
  const serialized = JSON.stringify(packet);
  assert.doesNotMatch(serialized, /synthetic-good|promptVersion|tutorDescriptor|provider|model/);
  assert.doesNotMatch(JSON.stringify(packet.entries[0]?.studentVisibleContext), /evaluatorOnly|7\/12/);
  assert.equal(
    packet.entries.find((entry) => entry.rubric.rubricId === "fraction-no-leak-001")
      ?.reviewerContext?.disclosurePolicy,
    "hint_only",
  );
  assert.match(
    JSON.stringify(
      packet.entries.find((entry) => entry.rubric.rubricId === "fraction-no-leak-001"),
    ),
    /7\/12/,
  );
});

test("Cohen and weighted kappa use the scored three-label matrix", () => {
  const matrix: CalibrationConfusionMatrix = {
    PASS: { PASS: 1, PARTIAL: 1, FAIL: 0 },
    PARTIAL: { PASS: 0, PARTIAL: 1, FAIL: 0 },
    FAIL: { PASS: 0, PARTIAL: 0, FAIL: 1 },
  };
  assert.ok(Math.abs((calculateCohenKappa(matrix) ?? 0) - 7 / 11) < 0.000001);
  assert.ok(
    Math.abs((calculateWeightedCohenKappa(matrix) ?? 0) - 5 / 7) < 0.000001,
  );
});

test("UNSURE remains outside scored agreement instead of becoming PARTIAL", () => {
  const left = [makeAnnotation("reviewer-a", "a-1", "response-1", "UNSURE")];
  const right = [makeAnnotation("reviewer-b", "b-1", "response-1", "PARTIAL")];
  const agreement = compareReviewerAnnotations(
    "reviewer-a",
    "reviewer-b",
    left,
    right,
  );
  assert.equal(agreement.exactAgreement, 0);
  assert.equal(agreement.scoredJudgmentCount, 0);
  assert.equal(agreement.cohenKappa, null);
  assert.deepEqual(agreement.confusionMatrix.PARTIAL, {
    PASS: 0,
    PARTIAL: 0,
    FAIL: 0,
  });
  assert.equal(agreement.disagreements[0]?.reviewerLabels["reviewer-a"], "UNSURE");
});

test("reference aggregation preserves source annotations and synthetic provenance", async () => {
  const input = await loadFixtureInput();
  const referenceSet = buildCalibrationReferenceSet(input);
  assert.equal(referenceSet.dataKind, "synthetic-fixture");
  assert.equal(referenceSet.humanCalibrationAvailable, false);
  assert.equal(referenceSet.labels.length, 4);
  const guidance = referenceSet.labels.find(
    (label) => label.rubricId === "fraction-guidance-001",
  );
  assert.equal(guidance?.finalLabel, "PARTIAL");
  assert.deepEqual(guidance?.sourceAnnotationIds, ["annotation-a-002", "annotation-b-002"]);
  assert.equal(guidance?.adjudicationStatus, "completed");
});

test("report exposes ambiguity, dimensions, adjudication, and fixture status", async () => {
  const input = await loadFixtureInput();
  const report = buildCalibrationReport(input);
  assert.equal(report.dataStatus, "synthetic-fixture");
  assert.equal(report.humanCalibrationAvailable, false);
  assert.equal(report.metrics?.pairedJudgmentCount, 4);
  assert.equal(report.metrics?.scoredJudgmentCount, 3);
  assert.equal(report.metrics?.confusionMatrix.PASS.PASS, 2);
  assert.equal(report.metrics?.confusionMatrix.PASS.PARTIAL, 1);
  assert.equal(report.ambiguity.unsureAnnotationCount, 1);
  assert.ok(report.ambiguousRubrics.includes("fraction-actionability-001"));
  assert.equal(report.adjudication.completedCount, 2);
  assert.equal(report.adjudication.pendingCount, 0);
  assert.match(formatCalibrationReport(report), /no human calibration data available/i);
});

test("validation rejects outdated versions, unknown rubrics, duplicate streams, and missing adjudication sources", async () => {
  const input = await loadFixtureInput();
  const staleCandidates = {
    ...input.candidates,
    responses: input.candidates.responses.map((response) => ({
      ...response,
      caseVersion: "1.0.0",
    })),
  };
  const duplicateAnnotations = {
    ...input.annotationFiles[0]!,
    annotations: [
      ...input.annotationFiles[0]!.annotations,
      input.annotationFiles[0]!.annotations[0]!,
    ],
  };
  const unknownRubricAnnotations = {
    ...input.annotationFiles[1]!,
    annotations: input.annotationFiles[1]!.annotations.map((annotation, index) =>
      index === 0 ? { ...annotation, rubricId: "unknown-rubric" } : annotation,
    ),
  };
  const staleIssues = findCalibrationValidationIssues({
    ...input,
    candidates: staleCandidates,
  });
  assert.ok(staleIssues.some((issue) => issue.code === "candidate_case_version_mismatch"));
  const duplicateIssues = findCalibrationValidationIssues({
    ...input,
    annotationFiles: [duplicateAnnotations, input.annotationFiles[1]!],
  });
  assert.ok(duplicateIssues.some((issue) => issue.code === "annotation_duplicate_reviewer_judgment"));
  const unknownRubricIssues = findCalibrationValidationIssues({
    ...input,
    annotationFiles: [input.annotationFiles[0]!, unknownRubricAnnotations],
  });
  assert.ok(unknownRubricIssues.some((issue) => issue.code === "annotation_unknown_rubric"));
  const sameReviewerIssues = findCalibrationValidationIssues({
    ...input,
    annotationFiles: [
      input.annotationFiles[0]!,
      {
        ...input.annotationFiles[1]!,
        reviewerId: "reviewer-a",
        annotations: input.annotationFiles[1]!.annotations.map((annotation) => ({
          ...annotation,
          reviewerId: "reviewer-a",
        })),
      },
    ],
  });
  assert.ok(sameReviewerIssues.some((issue) => issue.code === "duplicate_reviewer_stream"));
  const incompleteIssues = findCalibrationReferenceReadinessIssues({
    ...input,
    adjudicationFile: {
      ...input.adjudicationFile,
      adjudications: [],
    },
  });
  assert.ok(incompleteIssues.some((issue) => issue.code === "adjudication_missing"));
});

test("annotation parser rejects labels and reviewer IDs outside the pseudonymous contract", () => {
  assert.throws(
    () =>
      parseHumanRubricAnnotation({
        schemaVersion: 1,
        annotationId: "annotation-1",
        datasetId: "dataset-1",
        datasetVersion: "0.2b",
        caseId: "case-1",
        caseVersion: "1.0.0",
        responseId: "response-1",
        rubricId: "rubric-1",
        reviewerId: "reviewer@example.com",
        label: "PARTIAL",
        createdAt: "2026-08-13T00:00:00.000Z",
      }),
    (error: unknown) =>
      error instanceof BenchmarkConfigurationError &&
      error.code === "calibration_annotation_invalid",
  );
  assert.throws(
    () =>
      parseHumanRubricAnnotation({
        schemaVersion: 1,
        annotationId: "annotation-1",
        datasetId: "dataset-1",
        datasetVersion: "0.2b",
        caseId: "case-1",
        caseVersion: "1.0.0",
        responseId: "response-1",
        rubricId: "rubric-1",
        reviewerId: "reviewer-a",
        label: "NOT-A-LABEL",
        createdAt: "2026-08-13T00:00:00.000Z",
      }),
    (error: unknown) =>
      error instanceof BenchmarkConfigurationError &&
      error.code === "calibration_annotation_invalid",
  );
});

test("no annotations produce an explicit no-data report rather than a calibration score", async () => {
  const input = await loadFixtureInput();
  const report = buildCalibrationReport({
    dataset: input.dataset,
    candidates: input.candidates,
    annotationFiles: [],
  });
  assert.equal(report.dataStatus, "no-data");
  assert.equal(report.metrics, null);
  assert.equal(formatCalibrationReport(report), "Calibration report\nNo human calibration data available.");
});

test("fixture JSON remains readable as portable files", async () => {
  const raw = await readFile(resolve(fixtureRoot, "reviewer-a.json"), "utf8");
  assert.equal(JSON.parse(raw).fixture.notHumanCalibrationData, true);
});
