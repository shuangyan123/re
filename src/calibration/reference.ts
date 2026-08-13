import { BenchmarkConfigurationError } from "../contracts/errors.js";
import {
  type CalibrationReferenceLabel,
  type CalibrationReferenceSet,
  type HumanRubricAnnotation,
  type RubricAdjudication,
} from "../contracts/calibration.js";
import {
  assertCalibrationReferenceReady,
  assertValidCalibrationData,
  type CalibrationValidationInput,
} from "../contracts/calibration-validation.js";
import { calibrationJudgmentKey } from "./agreement.js";

function groupAnnotations(
  annotations: readonly HumanRubricAnnotation[],
): Map<string, HumanRubricAnnotation[]> {
  const groups = new Map<string, HumanRubricAnnotation[]>();
  for (const annotation of annotations) {
    const key = calibrationJudgmentKey(annotation);
    groups.set(key, [...(groups.get(key) ?? []), annotation]);
  }
  return groups;
}
function allScoredLabelsMatch(
  annotations: readonly HumanRubricAnnotation[],
): annotations is readonly (HumanRubricAnnotation & { readonly label: Exclude<HumanRubricAnnotation["label"], "UNSURE"> })[] {
  const first = annotations[0]?.label;
  return (
    first !== undefined &&
    first !== "UNSURE" &&
    annotations.every((annotation) => annotation.label === first)
  );
}

function sortedAnnotations(
  annotations: readonly HumanRubricAnnotation[],
): HumanRubricAnnotation[] {
  return [...annotations].sort((left, right) =>
    left.annotationId.localeCompare(right.annotationId),
  );
}

export function buildCalibrationReferenceSet(
  input: CalibrationValidationInput,
): CalibrationReferenceSet {
  assertValidCalibrationData(input);
  assertCalibrationReferenceReady(input);
  const annotations = input.annotationFiles.flatMap((file) => file.annotations);
  if (annotations.length === 0) {
    throw new BenchmarkConfigurationError("calibration_reference_invalid");
  }
  const adjudicationsByUnit = new Map<string, RubricAdjudication>();
  for (const adjudication of input.adjudicationFile?.adjudications ?? []) {
    adjudicationsByUnit.set(calibrationJudgmentKey(adjudication), adjudication);
  }
  const labels: CalibrationReferenceLabel[] = [];
  for (const [unitKey, grouped] of [...groupAnnotations(annotations).entries()].sort(([left], [right]) =>
    left.localeCompare(right),
  )) {
    const orderedAnnotations = sortedAnnotations(grouped);
    const first = orderedAnnotations[0];
    if (first === undefined) {
      throw new BenchmarkConfigurationError("calibration_reference_invalid");
    }
    const exact = allScoredLabelsMatch(orderedAnnotations);
    const adjudication = adjudicationsByUnit.get(unitKey);
    if (!exact && adjudication === undefined) {
      throw new BenchmarkConfigurationError("calibration_reference_invalid");
    }
    const finalLabel = exact ? first.label : adjudication?.finalLabel;
    if (finalLabel === undefined || finalLabel === "UNSURE") {
      throw new BenchmarkConfigurationError("calibration_reference_invalid");
    }
    const sourceAnnotationIds = orderedAnnotations
      .map((annotation) => annotation.annotationId)
      .sort((left, right) => left.localeCompare(right));
    labels.push({
      referenceId: `${first.caseId}@${first.caseVersion}/${first.responseId}/${first.rubricId}`,
      datasetId: first.datasetId,
      datasetVersion: first.datasetVersion,
      caseId: first.caseId,
      caseVersion: first.caseVersion,
      responseId: first.responseId,
      rubricId: first.rubricId,
      finalLabel,
      sourceAnnotationIds,
      reviewerCount: new Set(orderedAnnotations.map((annotation) => annotation.reviewerId)).size,
      agreement: exact ? "exact" : "disagreement",
      adjudicationStatus: exact ? "not_required" : "completed",
      ...(adjudication === undefined ? {} : { adjudicationId: adjudication.adjudicationId }),
    });
  }
  const dataKind =
    input.annotationFiles.every((file) => file.dataKind === "synthetic-fixture")
      ? "synthetic-fixture"
      : "human-reference";
  return {
    schemaVersion: 1,
    datasetId: input.dataset.id,
    datasetVersion: input.dataset.version,
    dataKind,
    humanCalibrationAvailable: dataKind === "human-reference",
    reviewerCount: new Set(annotations.map((annotation) => annotation.reviewerId)).size,
    labels,
  };
}
