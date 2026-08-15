import { BenchmarkConfigurationError } from "../contracts/errors.js";
import {
  CALIBRATION_CRITICAL_FAILURE_REFERENCE_SET_SCHEMA_VERSION,
  type CalibrationCriticalFailureReferenceLabel,
  type CalibrationCriticalFailureReferenceSet,
  type CriticalFailureAdjudication,
  type CriticalFailureCalibrationValidationInput,
  type HumanCriticalFailureAnnotation,
} from "../contracts/index.js";
import {
  assertCriticalFailureCalibrationReferenceReady,
  assertValidCriticalFailureCalibrationData,
} from "../contracts/critical-failure-calibration-validation.js";

function groupAnnotations(
  annotations: readonly HumanCriticalFailureAnnotation[],
): Map<string, HumanCriticalFailureAnnotation[]> {
  const groups = new Map<string, HumanCriticalFailureAnnotation[]>();
  for (const annotation of annotations) {
    groups.set(annotation.targetId, [
      ...(groups.get(annotation.targetId) ?? []),
      annotation,
    ]);
  }
  return groups;
}

function sortedAnnotations(
  annotations: readonly HumanCriticalFailureAnnotation[],
): HumanCriticalFailureAnnotation[] {
  return [...annotations].sort((left, right) =>
    left.annotationId.localeCompare(right.annotationId),
  );
}

function exactAgreement(
  annotations: readonly HumanCriticalFailureAnnotation[],
): boolean {
  const first = annotations[0];
  return (
    first !== undefined &&
    first.decision !== "UNSURE" &&
    annotations.every((annotation) => annotation.decision === first.decision) &&
    (first.decision === "ABSENT" ||
      annotations.every((annotation) => annotation.severity === first.severity))
  );
}

function sourceIds(
  annotations: readonly HumanCriticalFailureAnnotation[],
): string[] {
  return annotations
    .map((annotation) => annotation.annotationId)
    .sort((left, right) => left.localeCompare(right));
}

export function buildCalibrationCriticalFailureReferenceSet(
  input: CriticalFailureCalibrationValidationInput,
): CalibrationCriticalFailureReferenceSet {
  assertValidCriticalFailureCalibrationData(input);
  assertCriticalFailureCalibrationReferenceReady(input);
  const annotations = input.annotationFiles.flatMap((file) => file.annotations);
  if (annotations.length === 0) {
    throw new BenchmarkConfigurationError("calibration_critical_failure_reference_invalid");
  }
  const adjudicationsByTarget = new Map<string, CriticalFailureAdjudication>();
  for (const adjudication of input.adjudicationFile?.adjudications ?? []) {
    adjudicationsByTarget.set(adjudication.targetId, adjudication);
  }
  const grouped = groupAnnotations(annotations);
  const labels: CalibrationCriticalFailureReferenceLabel[] = [];
  for (const target of [...input.targetFile.targets].sort((left, right) =>
    left.targetId.localeCompare(right.targetId),
  )) {
    const orderedAnnotations = sortedAnnotations(grouped.get(target.targetId) ?? []);
    if (orderedAnnotations.length === 0) {
      throw new BenchmarkConfigurationError("calibration_critical_failure_reference_invalid");
    }
    const exact = exactAgreement(orderedAnnotations);
    const adjudication = adjudicationsByTarget.get(target.targetId);
    if (!exact && adjudication === undefined) {
      throw new BenchmarkConfigurationError("calibration_critical_failure_reference_invalid");
    }
    const first = orderedAnnotations[0];
    if (first === undefined) {
      throw new BenchmarkConfigurationError("calibration_critical_failure_reference_invalid");
    }
    const finalDecision = exact
      ? first.decision
      : adjudication?.finalDecision;
    if (finalDecision === undefined || finalDecision === "UNSURE") {
      throw new BenchmarkConfigurationError("calibration_critical_failure_reference_invalid");
    }
    const finalSeverity = exact
      ? first.severity
      : adjudication?.finalSeverity;
    if (finalDecision === "PRESENT" && finalSeverity === undefined) {
      throw new BenchmarkConfigurationError("calibration_critical_failure_reference_invalid");
    }
    labels.push({
      referenceId: `${target.targetId}/reference`,
      targetId: target.targetId,
      datasetId: target.datasetId,
      datasetVersion: target.datasetVersion,
      caseId: target.caseId,
      caseVersion: target.caseVersion,
      responseId: target.responseId,
      failureType: target.failureType,
      finalDecision,
      ...(finalSeverity === undefined ? {} : { finalSeverity }),
      sourceAnnotationIds: sourceIds(orderedAnnotations),
      reviewerCount: new Set(orderedAnnotations.map((annotation) => annotation.reviewerId)).size,
      agreement: exact ? "exact" : "disagreement",
      adjudicationStatus: exact ? "not_required" : "completed",
      ...(adjudication === undefined ? {} : { adjudicationId: adjudication.adjudicationId }),
    });
  }
  const dataKind = input.annotationFiles.every(
    (file) => file.dataKind === "synthetic-fixture",
  )
    ? "synthetic-fixture"
    : "human-critical-failure-reference";
  return {
    schemaVersion: CALIBRATION_CRITICAL_FAILURE_REFERENCE_SET_SCHEMA_VERSION,
    datasetId: input.dataset.id,
    datasetVersion: input.dataset.version,
    dataKind,
    humanCalibrationAvailable: dataKind === "human-critical-failure-reference",
    reviewerCount: new Set(annotations.map((annotation) => annotation.reviewerId)).size,
    labels,
  };
}
