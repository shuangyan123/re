import {
  CALIBRATION_CRITICAL_FAILURE_REPORT_SCHEMA_VERSION,
  type CalibrationCriticalFailureReport,
  type CriticalFailureAgreementMetrics,
  type CriticalFailureAgreementSlice,
  type CriticalFailureCalibrationValidationInput,
  type CriticalFailureDisagreement,
  type CriticalFailureReviewerPairAgreement,
  type HumanCriticalFailureAnnotation,
  type TutorCriticalFailure,
} from "../contracts/index.js";
import { TUTOR_EVAL_CRITICAL_FAILURE_TYPES } from "../contracts/tutor-eval.js";
import {
  findCriticalFailureCalibrationReferenceReadinessIssues,
  assertValidCriticalFailureCalibrationData,
} from "../contracts/critical-failure-calibration-validation.js";
import {
  calculateCriticalFailureAgreementForPairs,
  compareCriticalFailureAnnotationFiles,
  criticalFailureJudgmentKey,
  type CriticalFailureAgreementOptions,
  type PairedCriticalFailureJudgments,
} from "./critical-failure-agreement.js";
import { buildCalibrationCriticalFailureReferenceSet } from "./critical-failure-reference.js";

function asSlice(metrics: CriticalFailureAgreementMetrics): CriticalFailureAgreementSlice {
  return {
    pairedJudgmentCount: metrics.pairedJudgmentCount,
    scoredJudgmentCount: metrics.scoredJudgmentCount,
    exactAgreement: metrics.exactAgreement,
    scoredExactAgreement: metrics.scoredExactAgreement,
    cohenKappa: metrics.cohenKappa,
    unsurePairCount: metrics.unsurePairCount,
    disagreementCount: metrics.disagreements.length,
  };
}

function recordFromMap<T>(map: ReadonlyMap<string, T>): Readonly<Record<string, T>> {
  return Object.fromEntries(
    [...map.entries()].sort(([left], [right]) => left.localeCompare(right)),
  );
}

function buildPairs(
  left: readonly HumanCriticalFailureAnnotation[],
  right: readonly HumanCriticalFailureAnnotation[],
): PairedCriticalFailureJudgments[] {
  const rightByKey = new Map(
    right.map((annotation) => [criticalFailureJudgmentKey(annotation), annotation]),
  );
  return left
    .map((annotation) => {
      const counterpart = rightByKey.get(criticalFailureJudgmentKey(annotation));
      return counterpart === undefined ? undefined : { left: annotation, right: counterpart };
    })
    .filter((pair): pair is PairedCriticalFailureJudgments => pair !== undefined)
    .sort((leftPair, rightPair) =>
      criticalFailureJudgmentKey(leftPair.left).localeCompare(
        criticalFailureJudgmentKey(rightPair.left),
      ),
    );
}

function buildAgreementSlices(
  pairs: readonly PairedCriticalFailureJudgments[],
  dimension: (annotation: HumanCriticalFailureAnnotation) => string | undefined,
  options: CriticalFailureAgreementOptions = {},
): Readonly<Record<string, CriticalFailureAgreementSlice>> {
  const groups = new Map<string, PairedCriticalFailureJudgments[]>();
  for (const pair of pairs) {
    const key = dimension(pair.left);
    if (key !== undefined) {
      groups.set(key, [...(groups.get(key) ?? []), pair]);
    }
  }
  return recordFromMap(
    new Map(
      [...groups.entries()].map(([key, grouped]) => [
        key,
        asSlice(calculateCriticalFailureAgreementForPairs(grouped, options)),
      ]),
    ),
  );
}

function mergeDisagreements(
  pairReports: readonly CriticalFailureReviewerPairAgreement[],
): CriticalFailureDisagreement[] {
  const byKey = new Map<string, CriticalFailureDisagreement>();
  for (const report of pairReports) {
    for (const disagreement of report.disagreements) {
      const key = `${criticalFailureJudgmentKey(disagreement)}|${JSON.stringify(disagreement.reviewerLabels)}|${JSON.stringify(disagreement.reviewerSeverities)}`;
      byKey.set(key, disagreement);
    }
  }
  return [...byKey.values()].sort((left, right) =>
    criticalFailureJudgmentKey(left).localeCompare(criticalFailureJudgmentKey(right)),
  );
}

function buildAdjudicationSummary(
  input: CriticalFailureCalibrationValidationInput,
  annotations: readonly HumanCriticalFailureAnnotation[],
): CalibrationCriticalFailureReport["adjudication"] {
  const grouped = new Map<string, HumanCriticalFailureAnnotation[]>();
  for (const annotation of annotations) {
    grouped.set(annotation.targetId, [...(grouped.get(annotation.targetId) ?? []), annotation]);
  }
  const adjudications = new Map(
    (input.adjudicationFile?.adjudications ?? []).map((adjudication) => [
      adjudication.targetId,
      adjudication,
    ]),
  );
  let requiredCount = 0;
  let completedCount = 0;
  let notRequiredCount = 0;
  for (const target of input.targetFile.targets) {
    const targetAnnotations = grouped.get(target.targetId) ?? [];
    const first = targetAnnotations[0];
    const exact =
      first !== undefined &&
      first.decision !== "UNSURE" &&
      targetAnnotations.every((annotation) => annotation.decision === first.decision) &&
      (first.decision === "ABSENT" ||
        targetAnnotations.every((annotation) => annotation.severity === first.severity));
    if (exact) {
      notRequiredCount += 1;
    } else {
      requiredCount += 1;
      if (adjudications.has(target.targetId)) {
        completedCount += 1;
      }
    }
  }
  return {
    targetCount: input.targetFile.targets.length,
    annotatedTargetCount: grouped.size,
    requiredCount,
    completedCount,
    pendingCount: requiredCount - completedCount,
    notRequiredCount,
  };
}

function metricsOnly(
  report: CriticalFailureReviewerPairAgreement,
): CriticalFailureAgreementMetrics {
  return {
    pairedJudgmentCount: report.pairedJudgmentCount,
    scoredJudgmentCount: report.scoredJudgmentCount,
    exactAgreement: report.exactAgreement,
    scoredExactAgreement: report.scoredExactAgreement,
    cohenKappa: report.cohenKappa,
    unsurePairCount: report.unsurePairCount,
    presenceConfusionMatrix: report.presenceConfusionMatrix,
    severity: report.severity,
    type: report.type,
    disagreements: report.disagreements,
  };
}

export function buildCalibrationCriticalFailureReport(
  input: CriticalFailureCalibrationValidationInput,
): CalibrationCriticalFailureReport {
  assertValidCriticalFailureCalibrationData(input);
  const annotations = input.annotationFiles.flatMap((file) => file.annotations);
  const targetFailureTypes = new Map(
    input.targetFile.targets.map((target) => [target.targetId, target.failureType]),
  );
  const agreementOptions = { targetFailureTypes };
  const pairReports = compareCriticalFailureAnnotationFiles(
    input.annotationFiles,
    agreementOptions,
  );
  const allPairs: PairedCriticalFailureJudgments[] = [];
  for (let leftIndex = 0; leftIndex < input.annotationFiles.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < input.annotationFiles.length; rightIndex += 1) {
      const left = input.annotationFiles[leftIndex];
      const right = input.annotationFiles[rightIndex];
      if (left !== undefined && right !== undefined) {
        allPairs.push(...buildPairs(left.annotations, right.annotations));
      }
    }
  }
  const casesById = new Map(input.dataset.cases.map((caseValue) => [caseValue.id, caseValue]));
  const caseFor = (annotation: HumanCriticalFailureAnnotation) =>
    casesById.get(annotation.caseId);
  const metrics =
    pairReports.length === 1 && pairReports[0] !== undefined
      ? metricsOnly(pairReports[0])
      : null;
  const readinessIssues =
    annotations.length === 0
      ? []
      : findCriticalFailureCalibrationReferenceReadinessIssues(input);
  const referenceSet =
    annotations.length > 0 && readinessIssues.length === 0
      ? buildCalibrationCriticalFailureReferenceSet(input)
      : null;
  const dataStatus: CalibrationCriticalFailureReport["dataStatus"] =
    annotations.length === 0
      ? "no-data"
      : input.annotationFiles.every((file) => file.dataKind === "synthetic-fixture")
        ? "synthetic-fixture"
        : "human-calibration";
  const agreementByFailureType = Object.fromEntries(
    TUTOR_EVAL_CRITICAL_FAILURE_TYPES.map((failureType) => [
      failureType,
      asSlice(
        calculateCriticalFailureAgreementForPairs(
          allPairs.filter(
            (pair) => targetFailureTypes.get(pair.left.targetId) === failureType,
          ),
          agreementOptions,
        ),
      ),
    ]),
  ) as Record<TutorCriticalFailure, CriticalFailureAgreementSlice>;
  const subjectFor = (annotation: HumanCriticalFailureAnnotation): string | undefined =>
    caseFor(annotation)?.metadata.subject;
  const disclosureFor = (annotation: HumanCriticalFailureAnnotation): string | undefined =>
    caseFor(annotation)?.evaluatorOnly.disclosurePolicy;
  const reviewerCount = new Set(annotations.map((annotation) => annotation.reviewerId)).size;
  return {
    schemaVersion: CALIBRATION_CRITICAL_FAILURE_REPORT_SCHEMA_VERSION,
    datasetId: input.dataset.id,
    datasetVersion: input.dataset.version,
    dataStatus,
    humanCalibrationAvailable: dataStatus === "human-calibration",
    candidateResponseCount: input.candidates.responses.length,
    reviewTargetCount: input.targetFile.targets.length,
    annotationCount: annotations.length,
    reviewerCount,
    metrics,
    reviewerPairAgreement: pairReports,
    agreementByFailureType,
    agreementBySubject: buildAgreementSlices(allPairs, subjectFor, agreementOptions),
    agreementByDisclosurePolicy: buildAgreementSlices(
      allPairs,
      disclosureFor,
      agreementOptions,
    ),
    highestDisagreement: mergeDisagreements(pairReports).slice(0, 10),
    adjudication: buildAdjudicationSummary(input, annotations),
    referenceSet,
  };
}

function formatMetric(value: number | null): string {
  return value === null ? "n/a" : value.toFixed(2);
}

function formatPercent(value: number | null): string {
  return value === null ? "n/a" : `${(value * 100).toFixed(1)}%`;
}

export function formatCalibrationCriticalFailureReport(
  report: CalibrationCriticalFailureReport,
): string {
  if (report.dataStatus === "no-data") {
    return "Critical-failure calibration report\nNo human critical-failure calibration data available.";
  }
  const lines = [
    "Critical-failure calibration report",
    ...(report.dataStatus === "synthetic-fixture"
      ? ["Synthetic fixture only; no human calibration data available."]
      : []),
    `Responses: ${report.candidateResponseCount}`,
    `Review targets: ${report.reviewTargetCount}`,
    `Annotations: ${report.annotationCount}`,
    `Reviewers: ${report.reviewerCount}`,
  ];
  if (report.metrics !== null) {
    lines.push(
      `Presence exact agreement: ${formatPercent(report.metrics.exactAgreement)}`,
      `Presence scored exact agreement: ${formatPercent(report.metrics.scoredExactAgreement)}`,
      `Presence Cohen kappa: ${formatMetric(report.metrics.cohenKappa)}`,
      `Severity exact agreement: ${formatPercent(report.metrics.severity.exactAgreement)}`,
      `Severity weighted kappa: ${formatMetric(report.metrics.severity.weightedCohenKappa)}`,
      `Type exact agreement: ${formatPercent(report.metrics.type.exactAgreement)}`,
    );
  } else if (report.reviewerPairAgreement.length > 0) {
    lines.push("Agreement: see reviewer-pair metrics in the JSON report.");
  }
  lines.push(
    `Adjudication: ${report.adjudication.completedCount}/${report.adjudication.requiredCount} required completed`,
  );
  if (report.highestDisagreement.length > 0) {
    lines.push("Highest disagreement");
    for (const disagreement of report.highestDisagreement) {
      lines.push(
        `- ${disagreement.caseId} / ${disagreement.failureType}: ${Object.entries(
          disagreement.reviewerLabels,
        )
          .map(([reviewerId, label]) => `${reviewerId}=${label}`)
          .join(", ")}`,
      );
    }
  }
  return lines.join("\n");
}
