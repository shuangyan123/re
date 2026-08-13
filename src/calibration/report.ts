import type {
  CalibrationAgreementMetrics,
  CalibrationAgreementSlice,
  CalibrationDisagreement,
  CalibrationRateSummary,
  CalibrationReport,
  CalibrationReviewerPairAgreement,
  HumanRubricAnnotation,
  TutorEvalDataset,
} from "../contracts/index.js";
import {
  assertValidCalibrationData,
  findCalibrationReferenceReadinessIssues,
  type CalibrationValidationInput,
} from "../contracts/calibration-validation.js";
import {
  buildCalibrationReferenceSet,
} from "./reference.js";
import {
  calibrationJudgmentKey,
  calculateAgreementForPairs,
  compareReviewerAnnotations,
  type PairedCalibrationJudgments,
} from "./agreement.js";

interface UnitContext {
  readonly category: string;
  readonly capabilityTag?: string;
  readonly subject: string;
  readonly disclosurePolicy: string;
}

function recordFromMap<T>(map: ReadonlyMap<string, T>): Readonly<Record<string, T>> {
  return Object.fromEntries(
    [...map.entries()].sort(([left], [right]) => left.localeCompare(right)),
  );
}

function summarizeRates(
  annotations: readonly HumanRubricAnnotation[],
): CalibrationRateSummary {
  const ambiguousAnnotationCount = annotations.filter(
    (annotation) => annotation.ambiguity?.present === true,
  ).length;
  const unsureAnnotationCount = annotations.filter(
    (annotation) => annotation.label === "UNSURE",
  ).length;
  return {
    annotationCount: annotations.length,
    ambiguousAnnotationCount,
    unsureAnnotationCount,
    ambiguityRate:
      annotations.length === 0 ? null : ambiguousAnnotationCount / annotations.length,
    unsureRate:
      annotations.length === 0 ? null : unsureAnnotationCount / annotations.length,
  };
}

function addGroupedAnnotation(
  groups: Map<string, HumanRubricAnnotation[]>,
  key: string,
  annotation: HumanRubricAnnotation,
): void {
  groups.set(key, [...(groups.get(key) ?? []), annotation]);
}

function contextFor(
  dataset: TutorEvalDataset,
  annotation: HumanRubricAnnotation,
): UnitContext {
  const caseValue = dataset.cases.find((item) => item.id === annotation.caseId);
  const rubric = caseValue?.evaluatorOnly.rubrics.find(
    (item) => item.id === annotation.rubricId,
  );
  if (caseValue === undefined || rubric === undefined) {
    throw new Error("validated calibration unit context missing");
  }
  return {
    category: rubric.category,
    ...(rubric.capabilityTag === undefined
      ? {}
      : { capabilityTag: rubric.capabilityTag }),
    subject: caseValue.metadata.subject,
    disclosurePolicy: caseValue.evaluatorOnly.disclosurePolicy,
  };
}

function buildPairs(
  left: readonly HumanRubricAnnotation[],
  right: readonly HumanRubricAnnotation[],
): PairedCalibrationJudgments[] {
  const rightByKey = new Map(
    right.map((annotation) => [calibrationJudgmentKey(annotation), annotation]),
  );
  return left
    .map((annotation) => {
      const counterpart = rightByKey.get(calibrationJudgmentKey(annotation));
      return counterpart === undefined
        ? undefined
        : { left: annotation, right: counterpart };
    })
    .filter((pair): pair is PairedCalibrationJudgments => pair !== undefined)
    .sort((leftPair, rightPair) =>
      calibrationJudgmentKey(leftPair.left).localeCompare(
        calibrationJudgmentKey(rightPair.left),
      ),
    );
}

function asSlice(metrics: CalibrationAgreementMetrics): CalibrationAgreementSlice {
  return {
    pairedJudgmentCount: metrics.pairedJudgmentCount,
    scoredJudgmentCount: metrics.scoredJudgmentCount,
    exactAgreement: metrics.exactAgreement,
    scoredExactAgreement: metrics.scoredExactAgreement,
    cohenKappa: metrics.cohenKappa,
    weightedCohenKappa: metrics.weightedCohenKappa,
    unsurePairCount: metrics.unsurePairCount,
    disagreementCount: metrics.disagreements.length,
  };
}

function metricsOnly(
  report: CalibrationReviewerPairAgreement,
): CalibrationAgreementMetrics {
  return {
    pairedJudgmentCount: report.pairedJudgmentCount,
    scoredJudgmentCount: report.scoredJudgmentCount,
    exactAgreement: report.exactAgreement,
    scoredExactAgreement: report.scoredExactAgreement,
    cohenKappa: report.cohenKappa,
    weightedCohenKappa: report.weightedCohenKappa,
    unsurePairCount: report.unsurePairCount,
    confusionMatrix: report.confusionMatrix,
    disagreements: report.disagreements,
  };
}

function buildAgreementSlices(
  pairs: readonly PairedCalibrationJudgments[],
  dimension: (annotation: HumanRubricAnnotation) => string | undefined,
): Readonly<Record<string, CalibrationAgreementSlice>> {
  const groups = new Map<string, PairedCalibrationJudgments[]>();
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
        asSlice(calculateAgreementForPairs(grouped)),
      ]),
    ),
  );
}

function buildAmbiguityBreakdown(
  annotations: readonly HumanRubricAnnotation[],
  dimension: (annotation: HumanRubricAnnotation) => string | undefined,
): Readonly<Record<string, CalibrationRateSummary>> {
  const groups = new Map<string, HumanRubricAnnotation[]>();
  for (const annotation of annotations) {
    const key = dimension(annotation);
    if (key !== undefined) {
      addGroupedAnnotation(groups, key, annotation);
    }
  }
  return recordFromMap(
    new Map(
      [...groups.entries()].map(([key, grouped]) => [key, summarizeRates(grouped)]),
    ),
  );
}

function mergeDisagreements(
  pairReports: readonly CalibrationReviewerPairAgreement[],
): CalibrationDisagreement[] {
  const byKey = new Map<string, CalibrationDisagreement>();
  for (const report of pairReports) {
    for (const disagreement of report.disagreements) {
      const key = `${calibrationJudgmentKey(disagreement)}|${JSON.stringify(disagreement.reviewerLabels)}`;
      byKey.set(key, disagreement);
    }
  }
  return [...byKey.values()].sort((left, right) =>
    calibrationJudgmentKey(left).localeCompare(calibrationJudgmentKey(right)),
  );
}

function buildAdjudicationSummary(
  candidatesCount: number,
  annotations: readonly HumanRubricAnnotation[],
  adjudications: readonly { readonly caseId: string; readonly responseId: string; readonly rubricId: string; readonly caseVersion: string }[],
  datasetId: string,
  datasetVersion: string,
): CalibrationReport["adjudication"] {
  const groups = new Map<string, HumanRubricAnnotation[]>();
  for (const annotation of annotations) {
    addGroupedAnnotation(groups, calibrationJudgmentKey(annotation), annotation);
  }
  const adjudicationKeys = new Set(
    adjudications.map((adjudication) =>
      calibrationJudgmentKey({
        datasetId,
        datasetVersion,
        caseId: adjudication.caseId,
        caseVersion: adjudication.caseVersion,
        responseId: adjudication.responseId,
        rubricId: adjudication.rubricId,
      }),
    ),
  );
  let requiredCount = 0;
  let completedCount = 0;
  let notRequiredCount = 0;
  for (const [key, grouped] of groups.entries()) {
    const firstLabel = grouped[0]?.label;
    const exact =
      firstLabel !== undefined &&
      firstLabel !== "UNSURE" &&
      grouped.every((annotation) => annotation.label === firstLabel);
    if (exact) {
      notRequiredCount += 1;
    } else {
      requiredCount += 1;
      if (adjudicationKeys.has(key)) {
        completedCount += 1;
      }
    }
  }
  return {
    candidateResponseCount: candidatesCount,
    annotatedResponseCount: new Set(annotations.map((annotation) => annotation.responseId)).size,
    requiredCount,
    completedCount,
    pendingCount: requiredCount - completedCount,
    notRequiredCount,
  };
}

export function buildCalibrationReport(
  input: CalibrationValidationInput,
): CalibrationReport {
  assertValidCalibrationData(input);
  const annotations = input.annotationFiles.flatMap((file) => file.annotations);
  const allReviewerIds = [...new Set(annotations.map((annotation) => annotation.reviewerId))].sort();
  const annotationsByReviewer = new Map<string, HumanRubricAnnotation[]>();
  for (const annotation of annotations) {
    annotationsByReviewer.set(annotation.reviewerId, [
      ...(annotationsByReviewer.get(annotation.reviewerId) ?? []),
      annotation,
    ]);
  }
  const pairReports: CalibrationReviewerPairAgreement[] = [];
  const allPairs: PairedCalibrationJudgments[] = [];
  for (let leftIndex = 0; leftIndex < allReviewerIds.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < allReviewerIds.length; rightIndex += 1) {
      const leftReviewerId = allReviewerIds[leftIndex];
      const rightReviewerId = allReviewerIds[rightIndex];
      if (leftReviewerId === undefined || rightReviewerId === undefined) {
        continue;
      }
      const leftAnnotations = annotationsByReviewer.get(leftReviewerId) ?? [];
      const rightAnnotations = annotationsByReviewer.get(rightReviewerId) ?? [];
      pairReports.push(
        compareReviewerAnnotations(
          leftReviewerId,
          rightReviewerId,
          leftAnnotations,
          rightAnnotations,
        ),
      );
      allPairs.push(...buildPairs(leftAnnotations, rightAnnotations));
    }
  }
  const categoryFor = (annotation: HumanRubricAnnotation): string =>
    contextFor(input.dataset, annotation).category;
  const capabilityFor = (annotation: HumanRubricAnnotation): string | undefined =>
    contextFor(input.dataset, annotation).capabilityTag;
  const subjectFor = (annotation: HumanRubricAnnotation): string =>
    contextFor(input.dataset, annotation).subject;
  const disclosureFor = (annotation: HumanRubricAnnotation): string =>
    contextFor(input.dataset, annotation).disclosurePolicy;
  const groupedByCase = buildAmbiguityBreakdown(annotations, (annotation) => annotation.caseId);
  const ambiguityByRubric = buildAmbiguityBreakdown(annotations, (annotation) => annotation.rubricId);
  const ambiguityByCategory = buildAmbiguityBreakdown(annotations, categoryFor);
  const ambiguityByCapabilityTag = buildAmbiguityBreakdown(annotations, capabilityFor);
  const ambiguityBySubject = buildAmbiguityBreakdown(annotations, subjectFor);
  const ambiguityByDisclosurePolicy = buildAmbiguityBreakdown(annotations, disclosureFor);
  const ambiguityRubricEntries = Object.entries(ambiguityByRubric)
    .filter(([, summary]) => summary.ambiguousAnnotationCount > 0 || summary.unsureAnnotationCount > 0)
    .sort(([leftId, left], [rightId, right]) =>
      (right.ambiguityRate ?? 0) - (left.ambiguityRate ?? 0) ||
      (right.unsureRate ?? 0) - (left.unsureRate ?? 0) ||
      leftId.localeCompare(rightId),
    );
  const readinessIssues =
    annotations.length === 0 ? [] : findCalibrationReferenceReadinessIssues(input);
  const referenceSet =
    annotations.length > 0 && readinessIssues.length === 0
      ? buildCalibrationReferenceSet(input)
      : null;
  const dataStatus: CalibrationReport["dataStatus"] =
    annotations.length === 0
      ? "no-data"
      : input.annotationFiles.every((file) => file.dataKind === "synthetic-fixture")
        ? "synthetic-fixture"
        : "human-calibration";
  const metrics =
    pairReports.length === 1 && pairReports[0] !== undefined
      ? metricsOnly(pairReports[0])
      : null;
  const representativePairs = allPairs;
  const adjudication = buildAdjudicationSummary(
    input.candidates.responses.length,
    annotations,
    input.adjudicationFile?.adjudications ?? [],
    input.dataset.id,
    input.dataset.version,
  );
  return {
    schemaVersion: 1,
    datasetId: input.dataset.id,
    datasetVersion: input.dataset.version,
    dataStatus,
    humanCalibrationAvailable: dataStatus === "human-calibration",
    candidateResponseCount: input.candidates.responses.length,
    annotatedResponseCount: new Set(annotations.map((annotation) => annotation.responseId)).size,
    rubricJudgmentCount: annotations.length,
    reviewerCount: allReviewerIds.length,
    metrics,
    reviewerPairAgreement: pairReports,
    ambiguity: summarizeRates(annotations),
    ambiguityByCase: groupedByCase,
    ambiguityByRubric,
    ambiguityByCategory,
    ambiguityByCapabilityTag,
    ambiguityBySubject,
    ambiguityByDisclosurePolicy,
    agreementByCategory: buildAgreementSlices(representativePairs, categoryFor),
    agreementByCapabilityTag: buildAgreementSlices(representativePairs, capabilityFor),
    agreementBySubject: buildAgreementSlices(representativePairs, subjectFor),
    agreementByDisclosurePolicy: buildAgreementSlices(representativePairs, disclosureFor),
    ambiguousRubrics: ambiguityRubricEntries.map(([rubricId]) => rubricId),
    highestDisagreement: mergeDisagreements(pairReports).slice(0, 10),
    adjudication,
    referenceSet,
  };
}

function formatMetric(value: number | null): string {
  return value === null ? "n/a" : value.toFixed(2);
}

function formatPercent(value: number | null): string {
  return value === null ? "n/a" : `${(value * 100).toFixed(1)}%`;
}

export function formatCalibrationReport(report: CalibrationReport): string {
  if (report.dataStatus === "no-data") {
    return "Calibration report\nNo human calibration data available.";
  }
  const lines = [
    "Calibration report",
    ...(report.dataStatus === "synthetic-fixture"
      ? ["Synthetic fixture only; no human calibration data available."]
      : []),
    `Responses: ${report.candidateResponseCount}`,
    `Rubric judgments: ${report.rubricJudgmentCount}`,
    `Reviewers: ${report.reviewerCount}`,
  ];
  if (report.metrics !== null) {
    lines.push(
      `Exact agreement: ${formatPercent(report.metrics.exactAgreement)}`,
      `Scored exact agreement: ${formatPercent(report.metrics.scoredExactAgreement)}`,
      `Cohen kappa: ${formatMetric(report.metrics.cohenKappa)}`,
      `Weighted kappa: ${formatMetric(report.metrics.weightedCohenKappa)}`,
    );
  } else if (report.reviewerPairAgreement.length > 0) {
    lines.push("Agreement: see reviewer-pair metrics in the JSON report.");
  }
  lines.push(
    `UNSURE: ${formatPercent(report.ambiguity.unsureRate)}`,
    `Ambiguity: ${formatPercent(report.ambiguity.ambiguityRate)}`,
    `Ambiguous rubrics: ${report.ambiguousRubrics.length}`,
    `Adjudication: ${report.adjudication.completedCount}/${report.adjudication.requiredCount} required completed`,
  );
  if (report.highestDisagreement.length > 0) {
    lines.push("Highest disagreement");
    for (const disagreement of report.highestDisagreement) {
      lines.push(
        `- ${disagreement.caseId} / ${disagreement.rubricId}: ${Object.entries(disagreement.reviewerLabels)
          .map(([reviewerId, label]) => `${reviewerId}=${label}`)
          .join(", ")}`,
      );
    }
  }
  return lines.join("\n");
}
