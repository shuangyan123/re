import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildCalibrationReferenceSet,
  buildCanonicalCalibrationPilotBundle,
  compareReviewerAnnotations,
  importCanonicalCalibrationPilotSubmission,
  type CanonicalCalibrationPilotSubmissionTemplate,
} from "../src/calibration/index.js";
import {
  TUTOR_EVAL_DATASET_ID,
  type CalibrationAdjudicationFile,
  type CalibrationLabel,
} from "../src/contracts/index.js";
import { loadTutorEvalDataset } from "../src/datasets/index.js";

function completeSubmission(
  template: CanonicalCalibrationPilotSubmissionTemplate,
  labelFor: (index: number) => CalibrationLabel,
): unknown {
  return {
    ...template,
    completedAt: "2026-09-12T15:30:00.000Z",
    annotations: template.annotations.map((slot, index) => {
      const label = labelFor(index);
      return {
        ...slot,
        label,
        evidence: "Synthetic regression evidence.",
        ambiguity: label === "UNSURE"
          ? { present: true, reason: "Synthetic regression ambiguity." }
          : { present: false, reason: "" },
      };
    }),
  };
}

test("canonical calibration pilot freezes a cross-category 0.2a.6 task set", async () => {
  const bundle = await buildCanonicalCalibrationPilotBundle([
    "reviewer-a",
    "reviewer-b",
  ]);
  assert.equal(bundle.manifest.datasetId, TUTOR_EVAL_DATASET_ID);
  assert.equal(bundle.manifest.datasetVersion, "0.2a.6");
  assert.equal(bundle.manifest.caseCount, 9);
  assert.equal(bundle.manifest.responseCount, 27);
  assert.equal(bundle.manifest.rubricJudgmentCountPerReviewer, 84);
  assert.equal(bundle.candidates.dataKind, "candidate-corpus");
  assert.equal(bundle.candidates.responses.length, 27);
  assert.equal(bundle.packet.blind, true);
  assert.equal(bundle.packet.entries.length, 84);
  assert.equal(bundle.templates.length, 2);
  assert.ok(bundle.templates.every((template) => template.annotations.length === 84));
  assert.ok(bundle.templates.every((template) => template.completedAt === ""));
  assert.ok(
    bundle.templates.every((template) =>
      template.annotations.every((annotation) => annotation.label === ""),
    ),
  );

  const categories = new Set(bundle.packet.entries.map((entry) => entry.rubric.category));
  assert.deepEqual(
    [...categories].sort(),
    ["actionability", "adaptation", "correctness", "diagnosis", "guidance"],
  );
  const policies = new Set(bundle.manifest.selectedCases.map((caseValue) => caseValue.disclosurePolicy));
  assert.deepEqual(
    [...policies].sort(),
    [
      "full_solution_allowed",
      "full_solution_required",
      "hint_only",
      "no_answer",
      "partial_solution",
    ],
  );
  const subjects = new Set(bundle.manifest.selectedCases.map((caseValue) => caseValue.subject));
  assert.deepEqual(
    [...subjects].sort(),
    ["history_or_social_studies", "language", "mathematics", "programming", "science"],
  );
  assert.equal(
    bundle.manifest.selectedCases.filter((caseValue) => caseValue.locale === "zh-CN").length,
    1,
  );
  assert.ok(
    bundle.packet.entries.some(
      (entry) => entry.rubric.rubricId === "fraction-conceptual-guidance-001",
    ),
  );
  assert.ok(
    bundle.packet.entries.some(
      (entry) => entry.rubric.rubricId === "fraction-conceptual-guidance-001-zh-CN",
    ),
  );

  const reviewerVisible = JSON.stringify({
    packet: bundle.packet,
    templates: bundle.templates,
    guide: bundle.annotationGuide,
  });
  assert.doesNotMatch(
    reviewerVisible,
    /"provider"|"model"|"modelVersion"|"promptVersion"|"expectedLabel"|"judgeResult"/u,
  );
});

test("canonical calibration pilot binds current fraction 1.2.0 rubric structure", async () => {
  const dataset = await loadTutorEvalDataset(TUTOR_EVAL_DATASET_ID, "0.2a.6");
  const english = dataset.cases.find((caseValue) => caseValue.id === "fraction-misconception-001");
  const chinese = dataset.cases.find((caseValue) => caseValue.id === "fraction-misconception-001-zh-CN");
  assert.ok(english);
  assert.ok(chinese);
  assert.equal(english.version, "1.2.0");
  assert.equal(chinese.version, "1.2.0");
  assert.deepEqual(
    english.evaluatorOnly.rubrics.map((rubric) => [rubric.id, rubric.category, rubric.weight]),
    [
      ["fraction-diagnosis-001", "diagnosis", 2],
      ["fraction-conceptual-guidance-001", "guidance", 1],
      ["fraction-guidance-001", "guidance", 1],
      ["fraction-actionability-001", "actionability", 1],
      ["fraction-no-leak-001", "guidance", 1],
    ],
  );
});

test("untouched or identity-tampered pilot submissions fail closed", async () => {
  const bundle = await buildCanonicalCalibrationPilotBundle([
    "reviewer-a",
    "reviewer-b",
  ]);
  const template = bundle.templates[0]!;
  await assert.rejects(
    importCanonicalCalibrationPilotSubmission(template, template),
  );

  const completed = completeSubmission(template, () => "PASS");
  const imported = await importCanonicalCalibrationPilotSubmission(template, completed);
  assert.equal(imported.dataKind, "human-annotation");
  assert.equal(imported.reviewerId, "reviewer-a");
  assert.equal(imported.annotations.length, 84);
  assert.ok(imported.annotations.every((annotation) => annotation.label === "PASS"));

  const completedRecord = completed as Record<string, unknown>;
  const completedAnnotations = completedRecord.annotations as readonly unknown[];
  await assert.rejects(
    importCanonicalCalibrationPilotSubmission(template, {
      ...completedRecord,
      reviewerId: "reviewer-b",
    }),
  );
  await assert.rejects(
    importCanonicalCalibrationPilotSubmission(template, {
      ...completedRecord,
      datasetVersion: "0.2a.5",
    }),
  );
  await assert.rejects(
    importCanonicalCalibrationPilotSubmission(template, {
      ...completedRecord,
      annotations: completedAnnotations.slice(1),
    }),
  );
  await assert.rejects(
    importCanonicalCalibrationPilotSubmission(template, {
      ...completedRecord,
      annotations: [
        completedAnnotations[0],
        ...completedAnnotations,
      ],
    }),
  );
});

test("synthetic pilot streams exercise agreement and adjudication without becoming human evidence", async () => {
  const bundle = await buildCanonicalCalibrationPilotBundle(
    ["synthetic-reviewer-a", "synthetic-reviewer-b"],
    "synthetic-fixture",
  );
  const leftTemplate = bundle.templates[0]!;
  const rightTemplate = bundle.templates[1]!;
  const left = await importCanonicalCalibrationPilotSubmission(
    leftTemplate,
    completeSubmission(leftTemplate, () => "PASS"),
  );
  const right = await importCanonicalCalibrationPilotSubmission(
    rightTemplate,
    completeSubmission(rightTemplate, (index) => index === 0 ? "PARTIAL" : "PASS"),
  );
  assert.equal(left.dataKind, "synthetic-fixture");
  assert.equal(right.dataKind, "synthetic-fixture");

  const agreement = compareReviewerAnnotations(
    left.reviewerId,
    right.reviewerId,
    left.annotations,
    right.annotations,
  );
  assert.equal(agreement.pairedJudgmentCount, 84);
  assert.equal(agreement.disagreements.length, 1);

  const leftFirst = left.annotations[0]!;
  const rightFirst = right.annotations[0]!;
  const adjudicationFile: CalibrationAdjudicationFile = {
    schemaVersion: 1,
    dataKind: "synthetic-fixture",
    fixture: {
      synthetic: true,
      notHumanCalibrationData: true,
    },
    datasetId: TUTOR_EVAL_DATASET_ID,
    datasetVersion: "0.2a.6",
    adjudicatorId: "synthetic-adjudicator",
    adjudications: [
      {
        schemaVersion: 1,
        adjudicationId: "canonical-pilot-synthetic-adjudication-001",
        datasetId: TUTOR_EVAL_DATASET_ID,
        datasetVersion: "0.2a.6",
        caseId: leftFirst.caseId,
        caseVersion: leftFirst.caseVersion,
        responseId: leftFirst.responseId,
        rubricId: leftFirst.rubricId,
        sourceAnnotationIds: [
          leftFirst.annotationId,
          rightFirst.annotationId,
        ].sort(),
        finalLabel: "PARTIAL",
        rationale: "Synthetic regression adjudication for one intentional disagreement.",
        adjudicatorId: "synthetic-adjudicator",
        createdAt: "2026-09-12T15:31:00.000Z",
      },
    ],
  };
  const dataset = await loadTutorEvalDataset(TUTOR_EVAL_DATASET_ID, "0.2a.6");
  const reference = buildCalibrationReferenceSet({
    dataset,
    candidates: bundle.candidates,
    annotationFiles: [left, right],
    adjudicationFile,
  });
  assert.equal(reference.labels.length, 84);
  assert.equal(reference.dataKind, "synthetic-fixture");
  assert.equal(reference.humanCalibrationAvailable, false);
});
