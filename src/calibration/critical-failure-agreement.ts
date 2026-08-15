import { BenchmarkConfigurationError } from "../contracts/errors.js";
import {
  type CalibrationCriticalFailureAnnotationFile,
  type CriticalFailureAgreementMetrics,
  type CriticalFailureDisagreement,
  type CriticalFailureJudgmentIdentity,
  type CriticalFailurePresenceConfusionMatrix,
  type CriticalFailureReviewerPairAgreement,
  type CriticalFailureSeverityAgreementMetrics,
  type CriticalFailureSeverityConfusionMatrix,
  type CriticalFailureTypeAgreementMetrics,
  type HumanCriticalFailureAnnotation,
  type ScoredCriticalFailureDecision,
} from "../contracts/index.js";
import {
  TUTOR_EVAL_CRITICAL_FAILURE_SEVERITIES,
  type TutorCriticalFailure,
  type TutorCriticalFailureSeverity,
} from "../contracts/tutor-eval.js";

const presenceLabels: readonly ScoredCriticalFailureDecision[] = ["PRESENT", "ABSENT"];
const severityLabels: readonly TutorCriticalFailureSeverity[] = [
  ...TUTOR_EVAL_CRITICAL_FAILURE_SEVERITIES,
];

export interface PairedCriticalFailureJudgments {
  readonly left: HumanCriticalFailureAnnotation;
  readonly right: HumanCriticalFailureAnnotation;
}

export interface CriticalFailureAgreementOptions {
  /** Resolves omitted ABSENT/UNSURE types from the explicit target registry. */
  readonly targetFailureTypes?: ReadonlyMap<string, TutorCriticalFailure>;
}

export function criticalFailureJudgmentKey(
  value: CriticalFailureJudgmentIdentity | HumanCriticalFailureAnnotation,
): string {
  return JSON.stringify([
    value.targetId,
    value.datasetId,
    value.datasetVersion,
    value.caseId,
    value.caseVersion,
    value.responseId,
  ]);
}

function identityOf(
  annotation: HumanCriticalFailureAnnotation,
  options: CriticalFailureAgreementOptions = {},
): CriticalFailureJudgmentIdentity {
  const failureType =
    options.targetFailureTypes?.get(annotation.targetId) ?? annotation.failureType;
  return {
    targetId: annotation.targetId,
    datasetId: annotation.datasetId,
    datasetVersion: annotation.datasetVersion,
    caseId: annotation.caseId,
    caseVersion: annotation.caseVersion,
    responseId: annotation.responseId,
    ...(failureType === undefined ? {} : { failureType }),
  };
}

function emptyPresenceMatrix(): {
  [label in ScoredCriticalFailureDecision]: Record<ScoredCriticalFailureDecision, number>;
} {
  const row = (): Record<ScoredCriticalFailureDecision, number> => ({
    PRESENT: 0,
    ABSENT: 0,
  });
  return { PRESENT: row(), ABSENT: row() };
}

function emptySeverityMatrix(): {
  [label in TutorCriticalFailureSeverity]: Record<TutorCriticalFailureSeverity, number>;
} {
  const row = (): Record<TutorCriticalFailureSeverity, number> => ({
    minor: 0,
    major: 0,
    critical: 0,
  });
  return { minor: row(), major: row(), critical: row() };
}

function matrixTotal<L extends string>(
  labels: readonly L[],
  matrix: Readonly<Record<L, Readonly<Record<L, number>>>>,
): number {
  return labels.reduce(
    (total, left) =>
      total + labels.reduce((rowTotal, right) => rowTotal + matrix[left][right], 0),
    0,
  );
}

function calculateKappa<L extends string>(
  labels: readonly L[],
  matrix: Readonly<Record<L, Readonly<Record<L, number>>>>,
): number | null {
  const total = matrixTotal(labels, matrix);
  if (total === 0) {
    return null;
  }
  const observed = labels.reduce((sum, label) => sum + matrix[label][label], 0) / total;
  const rowTotals = new Map(
    labels.map((label) => [
      label,
      labels.reduce((sum, right) => sum + matrix[label][right], 0),
    ]),
  );
  const columnTotals = new Map(
    labels.map((label) => [
      label,
      labels.reduce((sum, left) => sum + matrix[left][label], 0),
    ]),
  );
  const expected =
    labels.reduce(
      (sum, label) => sum + (rowTotals.get(label) ?? 0) * (columnTotals.get(label) ?? 0),
      0,
    ) /
    (total * total);
  if (expected === 1) {
    return observed === 1 ? 1 : 0;
  }
  return (observed - expected) / (1 - expected);
}

function calculateWeightedKappa(
  labels: readonly TutorCriticalFailureSeverity[],
  matrix: Readonly<Record<TutorCriticalFailureSeverity, Readonly<Record<TutorCriticalFailureSeverity, number>>>>,
): number | null {
  const total = matrixTotal(labels, matrix);
  if (total === 0) {
    return null;
  }
  const distance = (left: TutorCriticalFailureSeverity, right: TutorCriticalFailureSeverity): number =>
    Math.abs(labels.indexOf(left) - labels.indexOf(right)) / (labels.length - 1);
  const observed =
    labels.reduce(
      (sum, left) =>
        sum + labels.reduce((rowSum, right) =>
          rowSum + matrix[left][right] * (1 - distance(left, right)), 0),
      0,
    ) / total;
  const rowTotals = new Map(
    labels.map((label) => [
      label,
      labels.reduce((sum, right) => sum + matrix[label][right], 0),
    ]),
  );
  const columnTotals = new Map(
    labels.map((label) => [
      label,
      labels.reduce((sum, left) => sum + matrix[left][label], 0),
    ]),
  );
  const expected =
    labels.reduce(
      (sum, left) =>
        sum +
        labels.reduce(
          (rowSum, right) =>
            rowSum +
            (rowTotals.get(left) ?? 0) *
              (columnTotals.get(right) ?? 0) *
              (1 - distance(left, right)),
          0,
        ),
      0,
    ) /
    (total * total);
  if (expected === 1) {
    return observed === 1 ? 1 : 0;
  }
  return (observed - expected) / (1 - expected);
}

function responseKey(annotation: HumanCriticalFailureAnnotation): string {
  return JSON.stringify([
    annotation.datasetId,
    annotation.datasetVersion,
    annotation.caseId,
    annotation.caseVersion,
    annotation.responseId,
  ]);
}

function sortedFailureTypes(
  values: readonly TutorCriticalFailure[],
): TutorCriticalFailure[] {
  return [...values].sort((left, right) => left.localeCompare(right));
}

function typeAgreementForPairs(
  pairs: readonly PairedCriticalFailureJudgments[],
): CriticalFailureTypeAgreementMetrics {
  const groups = new Map<string, PairedCriticalFailureJudgments[]>();
  for (const pair of pairs) {
    groups.set(responseKey(pair.left), [...(groups.get(responseKey(pair.left)) ?? []), pair]);
  }
  let scoredResponseCount = 0;
  let exactMatches = 0;
  let unsureResponseCount = 0;
  const disagreements: CriticalFailureTypeAgreementMetrics["disagreements"][number][] = [];
  for (const grouped of groups.values()) {
    const first = grouped[0];
    if (first === undefined) {
      continue;
    }
    const hasUnsure = grouped.some(
      (pair) => pair.left.decision === "UNSURE" || pair.right.decision === "UNSURE",
    );
    if (hasUnsure) {
      unsureResponseCount += 1;
      continue;
    }
    scoredResponseCount += 1;
    const leftFailureTypes = sortedFailureTypes(
      grouped
        .flatMap((pair) =>
          pair.left.decision === "PRESENT" && pair.left.failureType !== undefined
            ? [pair.left.failureType]
            : [],
        ),
    );
    const rightFailureTypes = sortedFailureTypes(
      grouped
        .flatMap((pair) =>
          pair.right.decision === "PRESENT" && pair.right.failureType !== undefined
            ? [pair.right.failureType]
            : [],
        ),
    );
    if (JSON.stringify(leftFailureTypes) === JSON.stringify(rightFailureTypes)) {
      exactMatches += 1;
    } else {
      disagreements.push({
        datasetId: first.left.datasetId,
        datasetVersion: first.left.datasetVersion,
        caseId: first.left.caseId,
        caseVersion: first.left.caseVersion,
        responseId: first.left.responseId,
        leftFailureTypes,
        rightFailureTypes,
      });
    }
  }
  return {
    pairedResponseCount: groups.size,
    scoredResponseCount,
    exactAgreement: scoredResponseCount === 0 ? null : exactMatches / scoredResponseCount,
    unsureResponseCount,
    disagreements: disagreements.sort((left, right) =>
      JSON.stringify(left).localeCompare(JSON.stringify(right)),
    ),
  };
}

function severityAgreementForPairs(
  pairs: readonly PairedCriticalFailureJudgments[],
  options: CriticalFailureAgreementOptions = {},
): CriticalFailureSeverityAgreementMetrics {
  const matrix = emptySeverityMatrix();
  const disagreements: CriticalFailureDisagreement[] = [];
  let exactMatches = 0;
  let pairedJudgmentCount = 0;
  for (const pair of pairs) {
    if (pair.left.decision !== "PRESENT" || pair.right.decision !== "PRESENT") {
      continue;
    }
    const leftSeverity = pair.left.severity;
    const rightSeverity = pair.right.severity;
    if (leftSeverity === undefined || rightSeverity === undefined) {
      throw new BenchmarkConfigurationError("calibration_critical_failure_data_invalid");
    }
    pairedJudgmentCount += 1;
    matrix[leftSeverity][rightSeverity] += 1;
    if (leftSeverity === rightSeverity) {
      exactMatches += 1;
    } else {
      disagreements.push({
        ...identityOf(pair.left, options),
        reviewerLabels: {
          [pair.left.reviewerId]: pair.left.decision,
          [pair.right.reviewerId]: pair.right.decision,
        },
        reviewerSeverities: {
          [pair.left.reviewerId]: leftSeverity,
          [pair.right.reviewerId]: rightSeverity,
        },
      });
    }
  }
  return {
    pairedJudgmentCount,
    exactAgreement: pairedJudgmentCount === 0 ? null : exactMatches / pairedJudgmentCount,
    weightedCohenKappa: calculateWeightedKappa(severityLabels, matrix),
    confusionMatrix: matrix,
    disagreements: disagreements.sort((left, right) =>
      criticalFailureJudgmentKey(left).localeCompare(criticalFailureJudgmentKey(right)),
    ),
  };
}

export function calculateCriticalFailureAgreementForPairs(
  pairs: readonly PairedCriticalFailureJudgments[],
  options: CriticalFailureAgreementOptions = {},
): CriticalFailureAgreementMetrics {
  const matrix = emptyPresenceMatrix();
  let exactMatches = 0;
  let unsurePairCount = 0;
  const disagreements: CriticalFailureDisagreement[] = [];
  for (const pair of pairs) {
    if (pair.left.decision === pair.right.decision) {
      exactMatches += 1;
    }
    if (pair.left.decision === "UNSURE" || pair.right.decision === "UNSURE") {
      unsurePairCount += 1;
    }
    if (
      pair.left.decision !== "UNSURE" &&
      pair.right.decision !== "UNSURE"
    ) {
      matrix[pair.left.decision][pair.right.decision] += 1;
    }
    const severityDiffers =
      pair.left.decision === "PRESENT" &&
      pair.right.decision === "PRESENT" &&
      pair.left.severity !== pair.right.severity;
    if (pair.left.decision !== pair.right.decision || severityDiffers) {
      disagreements.push({
        ...identityOf(pair.left, options),
        reviewerLabels: {
          [pair.left.reviewerId]: pair.left.decision,
          [pair.right.reviewerId]: pair.right.decision,
        },
        reviewerSeverities: {
          [pair.left.reviewerId]: pair.left.severity ?? null,
          [pair.right.reviewerId]: pair.right.severity ?? null,
        },
      });
    }
  }
  const scoredJudgmentCount = matrixTotal(presenceLabels, matrix);
  const scoredExactMatches = presenceLabels.reduce(
    (sum, label) => sum + matrix[label][label],
    0,
  );
  const severity = severityAgreementForPairs(pairs, options);
  return {
    pairedJudgmentCount: pairs.length,
    scoredJudgmentCount,
    exactAgreement: pairs.length === 0 ? null : exactMatches / pairs.length,
    scoredExactAgreement:
      scoredJudgmentCount === 0 ? null : scoredExactMatches / scoredJudgmentCount,
    cohenKappa: calculateKappa(presenceLabels, matrix),
    unsurePairCount,
    presenceConfusionMatrix: matrix,
    severity,
    type: typeAgreementForPairs(pairs),
    disagreements: disagreements.sort((left, right) =>
      criticalFailureJudgmentKey(left).localeCompare(criticalFailureJudgmentKey(right)),
    ),
  };
}

function validateStream(
  reviewerId: string,
  annotations: readonly HumanCriticalFailureAnnotation[],
): Map<string, HumanCriticalFailureAnnotation> {
  const byKey = new Map<string, HumanCriticalFailureAnnotation>();
  for (const annotation of annotations) {
    if (annotation.reviewerId !== reviewerId) {
      throw new BenchmarkConfigurationError("calibration_critical_failure_data_invalid");
    }
    const key = criticalFailureJudgmentKey(annotation);
    if (byKey.has(key)) {
      throw new BenchmarkConfigurationError("calibration_critical_failure_data_invalid");
    }
    byKey.set(key, annotation);
  }
  return byKey;
}

export function compareCriticalFailureReviewerAnnotations(
  leftReviewerId: string,
  rightReviewerId: string,
  leftAnnotations: readonly HumanCriticalFailureAnnotation[],
  rightAnnotations: readonly HumanCriticalFailureAnnotation[],
  options: CriticalFailureAgreementOptions = {},
): CriticalFailureReviewerPairAgreement {
  if (leftReviewerId === rightReviewerId) {
    throw new BenchmarkConfigurationError("calibration_critical_failure_data_invalid");
  }
  const leftByKey = validateStream(leftReviewerId, leftAnnotations);
  const rightByKey = validateStream(rightReviewerId, rightAnnotations);
  const allKeys = [...new Set([...leftByKey.keys(), ...rightByKey.keys()])].sort();
  const pairs: PairedCriticalFailureJudgments[] = [];
  const unpairedLeft: CriticalFailureJudgmentIdentity[] = [];
  const unpairedRight: CriticalFailureJudgmentIdentity[] = [];
  for (const key of allKeys) {
    const left = leftByKey.get(key);
    const right = rightByKey.get(key);
    if (left !== undefined && right !== undefined) {
      pairs.push({ left, right });
    } else if (left !== undefined) {
      unpairedLeft.push(identityOf(left, options));
    } else if (right !== undefined) {
      unpairedRight.push(identityOf(right, options));
    }
  }
  const metrics = calculateCriticalFailureAgreementForPairs(pairs, options);
  return {
    ...metrics,
    leftReviewerId,
    rightReviewerId,
    unpairedLeft,
    unpairedRight,
  };
}

export function compareCriticalFailureAnnotationFiles(
  annotationFiles: readonly CalibrationCriticalFailureAnnotationFile[],
  options: CriticalFailureAgreementOptions = {},
): readonly CriticalFailureReviewerPairAgreement[] {
  const byReviewer = new Map<string, HumanCriticalFailureAnnotation[]>();
  for (const file of annotationFiles) {
    byReviewer.set(file.reviewerId, [...file.annotations]);
  }
  const reviewerIds = [...byReviewer.keys()].sort();
  const reports: CriticalFailureReviewerPairAgreement[] = [];
  for (let leftIndex = 0; leftIndex < reviewerIds.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < reviewerIds.length; rightIndex += 1) {
      const leftReviewerId = reviewerIds[leftIndex];
      const rightReviewerId = reviewerIds[rightIndex];
      if (leftReviewerId === undefined || rightReviewerId === undefined) {
        continue;
      }
      reports.push(
        compareCriticalFailureReviewerAnnotations(
          leftReviewerId,
          rightReviewerId,
          byReviewer.get(leftReviewerId) ?? [],
          byReviewer.get(rightReviewerId) ?? [],
          options,
        ),
      );
    }
  }
  return reports;
}

export function toCriticalFailureSeverityConfusionMatrix(
  metrics: CriticalFailureSeverityAgreementMetrics,
): CriticalFailureSeverityConfusionMatrix {
  return metrics.confusionMatrix;
}

export function toCriticalFailurePresenceConfusionMatrix(
  metrics: CriticalFailureAgreementMetrics,
): CriticalFailurePresenceConfusionMatrix {
  return metrics.presenceConfusionMatrix;
}
