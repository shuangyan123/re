import assert from "node:assert/strict";
import { test } from "node:test";

import {
  HUMAN_ATOMIC_STATUSES,
  HUMAN_REFERENCE_CALIBRATION_SCHEMA_VERSION,
  HUMAN_REFERENCE_PROTOCOL_ID,
  HUMAN_REFERENCE_PROTOCOL_VERSION,
  type HumanAtomicAnnotation,
  type HumanAtomicAdjudication,
  type HumanReferenceAnnotationTask,
} from "../src/contracts/index.js";
import {
  buildHumanReferenceSet,
  calculateHumanPairwiseAgreement,
  compareHumanAnnotators,
  compareJudgeToHumanReference,
  deriveHumanReferenceRubricLabels,
  humanAtomicIdentityKey,
} from "../src/calibration/index.js";
import {
  parseHumanAnnotationBatch,
  parseHumanAtomicAdjudication,
  parseHumanAtomicAnnotation,
  assertHumanAnnotatorTaskComplete,
  parseHumanReferenceAnnotationTask,
} from "../src/contracts/index.js";
import {
  TUTOR_EVAL_DATASET_VERSION,
  TUTOR_EVAL_EVALUATOR_VERSION,
} from "../src/contracts/tutor-eval.js";
import {
  MATERIAL_REQUIREMENT_ATOMIC_BOUNDARIES_FIXTURE_VERSION,
  MATERIAL_REQUIREMENT_DIAGNOSTIC_VERSION,
  MATERIAL_REQUIREMENT_EPISTEMIC_STRENGTH_FIXTURE_VERSION,
  MATERIAL_REQUIREMENT_WORD_CONTEXT_FIXTURE_VERSION,
} from "../src/judge/material-requirement-discrimination.js";
import {
  MATERIAL_REQUIREMENT_JUDGE_PROMPT_VERSION,
} from "../src/judge/material-requirement-prompt.js";
import {
  TUTOR_EVAL_PEDAGOGY_JUDGE_PROMPT_VERSION,
} from "../src/judge/tutor-eval-pedagogy-prompt.js";

function task(
  caseId: string,
  requirementId: string,
): HumanReferenceAnnotationTask {
  return parseHumanReferenceAnnotationTask({
    schemaVersion: HUMAN_REFERENCE_CALIBRATION_SCHEMA_VERSION,
    caseId,
    learningObjective: "Assess the visible Tutor response against one material requirement.",
    studentProfile: JSON.stringify({ level: "synthetic" }),
    conversationHistory: JSON.stringify([]),
    studentMessage: "A synthetic student message.",
    problemContext: "A synthetic problem context.",
    groundTruth: JSON.stringify({ expected: "synthetic" }),
    knownMisconception: "A synthetic misconception.",
    disclosurePolicy: "hint_only",
    rubrics: [{
      id: "rubric-material",
      criterion: "Assess the material requirement.",
      requirements: [{ id: requirementId, description: `Requirement ${requirementId}.` }],
    }],
    tutorResponse: `Visible Tutor response for ${caseId}.`,
  });
}

function annotation(
  caseId: string,
  requirementId: string,
  annotatorId: string,
  status: HumanAtomicAnnotation["status"],
  evidence = `${annotatorId} visible evidence`,
): HumanAtomicAnnotation {
  return parseHumanAtomicAnnotation({
    schemaVersion: HUMAN_REFERENCE_CALIBRATION_SCHEMA_VERSION,
    caseId,
    rubricId: "rubric-material",
    requirementId,
    annotatorId,
    status,
    evidence,
  });
}

const tasks = [
  task("case-consensus", "R-CONSENSUS"),
  task("case-disagreement", "R-DISAGREEMENT"),
  task("case-missing", "R-MISSING"),
] as const;

const annotations = [
  annotation("case-consensus", "R-CONSENSUS", "annotator-a", "SATISFIED"),
  annotation("case-consensus", "R-CONSENSUS", "annotator-b", "SATISFIED"),
  annotation("case-disagreement", "R-DISAGREEMENT", "annotator-a", "OMITTED_OR_INCOMPLETE"),
  annotation("case-disagreement", "R-DISAGREEMENT", "annotator-b", "EXPLICIT_CONFLICT"),
  annotation("case-missing", "R-MISSING", "annotator-a", "SATISFIED"),
] as const;

const syntheticFixture = { synthetic: true as const, notHumanCalibrationData: true as const };

function buildInput(
  adjudications: readonly HumanAtomicAdjudication[] = [],
) {
  return {
    tasks,
    annotations,
    requiredAnnotatorIds: ["annotator-a", "annotator-b"],
    adjudications,
    dataKind: "synthetic-fixture" as const,
    fixture: syntheticFixture,
  };
}

test("human reference task reuses the exact Material Judge visible evidence boundary", () => {
  const referenceTask = tasks[0];
  assert.equal(referenceTask.schemaVersion, HUMAN_REFERENCE_CALIBRATION_SCHEMA_VERSION);
  assert.equal(referenceTask.tutorResponse, "Visible Tutor response for case-consensus.");
  assert.throws(
    () => parseHumanReferenceAnnotationTask({
      ...referenceTask,
      expectedStatus: "SATISFIED",
    }),
    /Human reference calibration data is invalid/,
  );
  assert.throws(
    () => parseHumanReferenceAnnotationTask({
      ...referenceTask,
      priorJudgeResult: { status: "SATISFIED" },
    }),
    /Human reference calibration data is invalid/,
  );
});

test("human annotation and adjudication parsers enforce atomic privacy and strict fields", () => {
  assert.deepEqual(HUMAN_ATOMIC_STATUSES, [
    "SATISFIED",
    "OMITTED_OR_INCOMPLETE",
    "EXPLICIT_CONFLICT",
  ]);
  for (const status of ["PASS", "PARTIAL", "FAIL", "UNSURE"]) {
    assert.throws(
      () => parseHumanAtomicAnnotation({
        ...annotations[0],
        status,
      }),
      /Human reference calibration data is invalid/,
    );
  }
  for (const forbiddenField of ["reasoning", "reasoning_content", "rawProviderPayload"]) {
    assert.throws(
      () => parseHumanAtomicAnnotation({ ...annotations[0], [forbiddenField]: "hidden" }),
      /Human reference calibration data is invalid/,
    );
  }
  assert.throws(
    () => parseHumanAtomicAnnotation({
      ...annotations[0],
      evidence: "x".repeat(501),
    }),
    /Human reference calibration data is invalid/,
  );
  const adjudication = parseHumanAtomicAdjudication({
    schemaVersion: HUMAN_REFERENCE_CALIBRATION_SCHEMA_VERSION,
    caseId: "case-disagreement",
    rubricId: "rubric-material",
    requirementId: "R-DISAGREEMENT",
    sourceAnnotatorIds: ["annotator-a", "annotator-b"],
    sourceStatuses: {
      "annotator-a": "OMITTED_OR_INCOMPLETE",
      "annotator-b": "EXPLICIT_CONFLICT",
    },
    adjudicatedStatus: "EXPLICIT_CONFLICT",
    adjudicationReason: "The visible response makes the stronger conflicting claim.",
  });
  assert.deepEqual(adjudication.sourceAnnotatorIds, ["annotator-a", "annotator-b"]);
  assert.throws(
    () => parseHumanAtomicAdjudication({
      ...adjudication,
      sourceStatuses: { "annotator-a": "OMITTED_OR_INCOMPLETE" },
    }),
    /Human reference calibration data is invalid/,
  );
});

test("batch parser keeps synthetic provenance explicit and rejects ownership or leakage", () => {
  const batch = parseHumanAnnotationBatch({
    schemaVersion: HUMAN_REFERENCE_CALIBRATION_SCHEMA_VERSION,
    batchId: "synthetic-material-batch",
    calibrationProtocolId: HUMAN_REFERENCE_PROTOCOL_ID,
    calibrationProtocolVersion: HUMAN_REFERENCE_PROTOCOL_VERSION,
    dataKind: "synthetic-fixture",
    fixture: syntheticFixture,
    tasks,
    annotations,
  });
  assert.equal(batch.dataKind, "synthetic-fixture");
  assert.deepEqual(batch.fixture, syntheticFixture);
  assert.throws(
    () => parseHumanAnnotationBatch({
      ...batch,
      annotations: [{
        ...annotations[0],
        rubricId: "wrong-owner",
      }],
    }),
    /Human reference calibration data is invalid/,
  );
  assert.throws(
    () => parseHumanAnnotationBatch({
      ...batch,
      annotations: [{ ...annotations[0], expectedDerivedLabel: "PASS" }],
    }),
    /Human reference calibration data is invalid/,
  );
});

test("complete annotator validation is strict while batch construction can report missing availability", () => {
  assertHumanAnnotatorTaskComplete(
    tasks[0],
    "annotator-a",
    [annotations[0]],
  );
  assert.throws(
    () => assertHumanAnnotatorTaskComplete(
      tasks[0],
      "annotator-a",
      [],
    ),
    /Human reference calibration data is invalid/,
  );
  assert.throws(
    () => assertHumanAnnotatorTaskComplete(
      tasks[0],
      "annotator-a",
      [annotation("case-consensus", "R-CONSENSUS", "annotator-b", "SATISFIED")],
    ),
    /Human reference calibration data is invalid/,
  );
});

test("pairwise agreement is directional, excludes missing atoms, and reports disagreement evidence", () => {
  const report = calculateHumanPairwiseAgreement(
    "annotator-a",
    "annotator-b",
    annotations.filter((value) => value.annotatorId === "annotator-a"),
    annotations.filter((value) => value.annotatorId === "annotator-b"),
  );
  assert.equal(report.comparableAtomicCount, 2);
  assert.equal(report.agreementCount, 1);
  assert.equal(report.disagreementCount, 1);
  assert.equal(report.agreementShare, 0.5);
  assert.equal(report.confusionMatrix.SATISFIED.SATISFIED, 1);
  assert.equal(report.confusionMatrix.OMITTED_OR_INCOMPLETE.EXPLICIT_CONFLICT, 1);
  assert.equal(report.confusionMatrix.EXPLICIT_CONFLICT.OMITTED_OR_INCOMPLETE, 0);
  assert.equal(report.missingForAnnotatorB.length, 1);
  assert.equal(report.missingForAnnotatorA.length, 0);
  assert.equal(report.disagreements[0]?.annotatorAStatus, "OMITTED_OR_INCOMPLETE");
  assert.equal(report.disagreements[0]?.annotatorBStatus, "EXPLICIT_CONFLICT");
  assert.deepEqual(
    compareHumanAnnotators(
      "annotator-a",
      "annotator-b",
      [annotation("case-matrix", "R-MATRIX", "annotator-a", "SATISFIED")],
      [annotation("case-matrix", "R-MATRIX", "annotator-b", "OMITTED_OR_INCOMPLETE")],
    ).confusionMatrix,
    {
      SATISFIED: { SATISFIED: 0, OMITTED_OR_INCOMPLETE: 1, EXPLICIT_CONFLICT: 0 },
      OMITTED_OR_INCOMPLETE: { SATISFIED: 0, OMITTED_OR_INCOMPLETE: 0, EXPLICIT_CONFLICT: 0 },
      EXPLICIT_CONFLICT: { SATISFIED: 0, OMITTED_OR_INCOMPLETE: 0, EXPLICIT_CONFLICT: 0 },
    },
  );
});

test("reference builder resolves consensus and explicit adjudication but never majority or missing atoms", () => {
  const unresolved = buildHumanReferenceSet(buildInput());
  assert.equal(unresolved.humanCalibrationAvailable, false);
  assert.equal(unresolved.references.length, 1);
  assert.equal(unresolved.references[0]?.provenance, "human_consensus");
  assert.equal(unresolved.unresolvedDisagreements.length, 1);
  assert.equal(unresolved.missingAnnotations.length, 1);
  assert.deepEqual(unresolved.coverage, {
    plannedAtomicAssessments: 3,
    resolvedAtomicAssessments: 1,
    unresolvedAtomicAssessments: 1,
    missingAtomicAssessments: 1,
    referenceCoverageShare: 1 / 3,
  });
  assert.equal(deriveHumanReferenceRubricLabels(unresolved).length, 1);
  assert.equal(deriveHumanReferenceRubricLabels(unresolved)[0]?.label, "PASS");

  const adjudication = parseHumanAtomicAdjudication({
    schemaVersion: HUMAN_REFERENCE_CALIBRATION_SCHEMA_VERSION,
    caseId: "case-disagreement",
    rubricId: "rubric-material",
    requirementId: "R-DISAGREEMENT",
    sourceAnnotatorIds: ["annotator-a", "annotator-b"],
    sourceStatuses: {
      "annotator-a": "OMITTED_OR_INCOMPLETE",
      "annotator-b": "EXPLICIT_CONFLICT",
    },
    adjudicatedStatus: "EXPLICIT_CONFLICT",
    adjudicationReason: "Explicit adjudication for the disagreement.",
  });
  const resolved = buildHumanReferenceSet(buildInput([adjudication]));
  assert.equal(resolved.references.length, 2);
  assert.equal(resolved.references[1]?.provenance, "human_adjudicated");
  assert.equal(resolved.unresolvedDisagreements.length, 0);
  assert.equal(resolved.missingAnnotations.length, 1);
  assert.deepEqual(
    deriveHumanReferenceRubricLabels(resolved).map((value) => value.label),
    ["PASS", "FAIL"],
  );
  assert.throws(
    () => buildHumanReferenceSet(buildInput([{
      ...adjudication,
      sourceStatuses: {
        "annotator-a": "SATISFIED",
        "annotator-b": "EXPLICIT_CONFLICT",
      },
    }])),
    /Human reference calibration data is invalid/,
  );
});

test("Judge/reference comparison reports referenceAgreement and shares the existing aggregator", () => {
  const adjudication = parseHumanAtomicAdjudication({
    schemaVersion: HUMAN_REFERENCE_CALIBRATION_SCHEMA_VERSION,
    caseId: "case-disagreement",
    rubricId: "rubric-material",
    requirementId: "R-DISAGREEMENT",
    sourceAnnotatorIds: ["annotator-a", "annotator-b"],
    sourceStatuses: {
      "annotator-a": "OMITTED_OR_INCOMPLETE",
      "annotator-b": "EXPLICIT_CONFLICT",
    },
    adjudicatedStatus: "EXPLICIT_CONFLICT",
    adjudicationReason: "The independent adjudicator selected the conflict atom.",
  });
  const reference = buildHumanReferenceSet(buildInput([adjudication]));
  const comparison = compareJudgeToHumanReference({
    schemaVersion: 1,
    caseId: "case-disagreement",
    rubricAssessments: [{
      rubricId: "rubric-material",
      requirements: [{
        requirementId: "R-DISAGREEMENT",
        status: "EXPLICIT_CONFLICT",
        evidence: "The visible response makes the definitive claim.",
      }],
    }],
  }, reference);
  assert.equal(comparison.referenceAgreement.comparableAtomicCount, 1);
  assert.equal(comparison.referenceAgreement.agreementCount, 1);
  assert.equal(comparison.referenceAgreement.agreementShare, 1);
  assert.equal(comparison.derivedLabelAgreement.comparableRubricCount, 1);
  assert.equal(comparison.derivedLabelAgreement.agreementCount, 1);
  assert.equal(comparison.derivedLabelAgreement.disagreementCount, 0);
  assert.equal(comparison.referenceAgreement.confusionMatrix.EXPLICIT_CONFLICT.EXPLICIT_CONFLICT, 1);
  assert.doesNotMatch(JSON.stringify(comparison), /accuracy|gold|expectedStatus|judgeReasoning/i);
  assert.throws(
    () => compareJudgeToHumanReference(
      {
        schemaVersion: 1,
        caseId: "case-disagreement",
        rubricAssessments: [{
          rubricId: "rubric-material",
          requirements: [{
            requirementId: "R-DISAGREEMENT",
            status: "EXPLICIT_CONFLICT",
          }],
        }],
      },
      { ...reference, calibrationProtocolVersion: "0.0.0" } as unknown as typeof reference,
    ),
    /Human reference calibration data is invalid/,
  );
});

test("new protocol identity does not change the frozen Judge or production versions", () => {
  assert.equal(HUMAN_REFERENCE_PROTOCOL_ID, "human-reference-material-calibration");
  assert.equal(HUMAN_REFERENCE_PROTOCOL_VERSION, "0.1.0");
  assert.equal(HUMAN_REFERENCE_CALIBRATION_SCHEMA_VERSION, 1);
  assert.equal(MATERIAL_REQUIREMENT_JUDGE_PROMPT_VERSION, "0.4");
  assert.equal(MATERIAL_REQUIREMENT_DIAGNOSTIC_VERSION, "0.2.0");
  assert.equal(MATERIAL_REQUIREMENT_WORD_CONTEXT_FIXTURE_VERSION, "0.2.0");
  assert.equal(MATERIAL_REQUIREMENT_ATOMIC_BOUNDARIES_FIXTURE_VERSION, "0.1.0");
  assert.equal(MATERIAL_REQUIREMENT_EPISTEMIC_STRENGTH_FIXTURE_VERSION, "0.1.0");
  assert.equal(TUTOR_EVAL_PEDAGOGY_JUDGE_PROMPT_VERSION, "0.9");
  assert.equal(TUTOR_EVAL_EVALUATOR_VERSION, "0.3a.4");
  assert.equal(TUTOR_EVAL_DATASET_VERSION, "0.2a.5");
  assert.equal(humanAtomicIdentityKey({
    caseId: "case-consensus",
    rubricId: "rubric-material",
    requirementId: "R-CONSENSUS",
  }), '["case-consensus","rubric-material","R-CONSENSUS"]');
});
