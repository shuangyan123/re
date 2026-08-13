import { BenchmarkConfigurationError } from "../contracts/errors.js";
import type {
  CalibrationAgreementMetrics,
  CalibrationConfusionMatrix,
  CalibrationDisagreement,
  CalibrationJudgmentIdentity,
  CalibrationLabel,
  CalibrationReviewerPairAgreement,
  HumanRubricAnnotation,
  ScoredCalibrationLabel,
} from "../contracts/calibration.js";

const scoredLabels: readonly ScoredCalibrationLabel[] = [
  "PASS",
  "PARTIAL",
  "FAIL",
];

type MutableCalibrationConfusionMatrix = {
  [label in ScoredCalibrationLabel]: Record<ScoredCalibrationLabel, number>;
};

export interface PairedCalibrationJudgments {
  readonly left: HumanRubricAnnotation;
  readonly right: HumanRubricAnnotation;
}

function identityOf(annotation: HumanRubricAnnotation): CalibrationJudgmentIdentity {
  return {
    datasetId: annotation.datasetId,
    datasetVersion: annotation.datasetVersion,
    caseId: annotation.caseId,
    caseVersion: annotation.caseVersion,
    responseId: annotation.responseId,
    rubricId: annotation.rubricId,
  };
}

export function calibrationJudgmentKey(
  value: CalibrationJudgmentIdentity,
): string {
  return JSON.stringify([
    value.datasetId,
    value.datasetVersion,
    value.caseId,
    value.caseVersion,
    value.responseId,
    value.rubricId,
  ]);
}

function emptyConfusionMatrix(): MutableCalibrationConfusionMatrix {
  const row = (): Record<ScoredCalibrationLabel, number> => ({
    PASS: 0,
    PARTIAL: 0,
    FAIL: 0,
  });
  return {
    PASS: row(),
    PARTIAL: row(),
    FAIL: row(),
  };
}

function isScoredLabel(value: CalibrationLabel): value is ScoredCalibrationLabel {
  return value !== "UNSURE";
}

function matrixTotal(matrix: CalibrationConfusionMatrix): number {
  return scoredLabels.reduce(
    (total, left) =>
      total + scoredLabels.reduce((rowTotal, right) => rowTotal + matrix[left][right], 0),
    0,
  );
}

export function calculateCohenKappa(
  matrix: CalibrationConfusionMatrix,
): number | null {
  const total = matrixTotal(matrix);
  if (total === 0) {
    return null;
  }
  const observed = scoredLabels.reduce(
    (sum, label) => sum + matrix[label][label],
    0,
  ) / total;
  const rowTotals = Object.fromEntries(
    scoredLabels.map((label) => [
      label,
      scoredLabels.reduce((sum, right) => sum + matrix[label][right], 0),
    ]),
  ) as Record<ScoredCalibrationLabel, number>;
  const columnTotals = Object.fromEntries(
    scoredLabels.map((label) => [
      label,
      scoredLabels.reduce((sum, left) => sum + matrix[left][label], 0),
    ]),
  ) as Record<ScoredCalibrationLabel, number>;
  const expected = scoredLabels.reduce(
    (sum, label) => sum + rowTotals[label] * columnTotals[label],
    0,
  ) / (total * total);
  if (expected === 1) {
    return observed === 1 ? 1 : 0;
  }
  return (observed - expected) / (1 - expected);
}

export function calculateWeightedCohenKappa(
  matrix: CalibrationConfusionMatrix,
): number | null {
  const total = matrixTotal(matrix);
  if (total === 0) {
    return null;
  }
  const observed = scoredLabels.reduce(
    (sum, left) =>
      sum +
      scoredLabels.reduce(
        (rowSum, right) =>
          rowSum + matrix[left][right] * (1 - Math.abs(scoredLabels.indexOf(left) - scoredLabels.indexOf(right)) / 2),
        0,
      ),
    0,
  ) / total;
  const rowTotals = Object.fromEntries(
    scoredLabels.map((label) => [
      label,
      scoredLabels.reduce((sum, right) => sum + matrix[label][right], 0),
    ]),
  ) as Record<ScoredCalibrationLabel, number>;
  const columnTotals = Object.fromEntries(
    scoredLabels.map((label) => [
      label,
      scoredLabels.reduce((sum, left) => sum + matrix[left][label], 0),
    ]),
  ) as Record<ScoredCalibrationLabel, number>;
  const expected = scoredLabels.reduce(
    (sum, left) =>
      sum +
      scoredLabels.reduce(
        (rowSum, right) =>
          rowSum +
          rowTotals[left] *
            columnTotals[right] *
            (1 - Math.abs(scoredLabels.indexOf(left) - scoredLabels.indexOf(right)) / 2),
        0,
      ),
    0,
  ) / (total * total);
  if (expected === 1) {
    return observed === 1 ? 1 : 0;
  }
  return (observed - expected) / (1 - expected);
}

export function calculateAgreementForPairs(
  pairs: readonly PairedCalibrationJudgments[],
): CalibrationAgreementMetrics {
  const matrix = emptyConfusionMatrix();
  let exactMatches = 0;
  let unsurePairCount = 0;
  const disagreements: CalibrationDisagreement[] = [];
  for (const pair of pairs) {
    if (pair.left.label === pair.right.label) {
      exactMatches += 1;
    }
    if (pair.left.label === "UNSURE" || pair.right.label === "UNSURE") {
      unsurePairCount += 1;
    }
    if (isScoredLabel(pair.left.label) && isScoredLabel(pair.right.label)) {
      matrix[pair.left.label][pair.right.label] += 1;
    }
    if (pair.left.label !== pair.right.label) {
      disagreements.push({
        ...identityOf(pair.left),
        reviewerLabels: {
          [pair.left.reviewerId]: pair.left.label,
          [pair.right.reviewerId]: pair.right.label,
        },
      });
    }
  }
  const scoredJudgmentCount = matrixTotal(matrix);
  const scoredExactMatches = scoredLabels.reduce(
    (sum, label) => sum + matrix[label][label],
    0,
  );
  return {
    pairedJudgmentCount: pairs.length,
    scoredJudgmentCount,
    exactAgreement: pairs.length === 0 ? null : exactMatches / pairs.length,
    scoredExactAgreement:
      scoredJudgmentCount === 0 ? null : scoredExactMatches / scoredJudgmentCount,
    cohenKappa: calculateCohenKappa(matrix),
    weightedCohenKappa: calculateWeightedCohenKappa(matrix),
    unsurePairCount,
    confusionMatrix: matrix,
    disagreements: disagreements.sort((left, right) =>
      calibrationJudgmentKey(left).localeCompare(calibrationJudgmentKey(right)),
    ),
  };
}

function validateStream(
  reviewerId: string,
  annotations: readonly HumanRubricAnnotation[],
): Map<string, HumanRubricAnnotation> {
  const byKey = new Map<string, HumanRubricAnnotation>();
  for (const annotation of annotations) {
    if (annotation.reviewerId !== reviewerId) {
      throw new BenchmarkConfigurationError("calibration_data_invalid");
    }
    const key = calibrationJudgmentKey(identityOf(annotation));
    if (byKey.has(key)) {
      throw new BenchmarkConfigurationError("calibration_data_invalid");
    }
    byKey.set(key, annotation);
  }
  return byKey;
}

export function compareReviewerAnnotations(
  leftReviewerId: string,
  rightReviewerId: string,
  leftAnnotations: readonly HumanRubricAnnotation[],
  rightAnnotations: readonly HumanRubricAnnotation[],
): CalibrationReviewerPairAgreement {
  if (leftReviewerId === rightReviewerId) {
    throw new BenchmarkConfigurationError("calibration_data_invalid");
  }
  const leftByKey = validateStream(leftReviewerId, leftAnnotations);
  const rightByKey = validateStream(rightReviewerId, rightAnnotations);
  const allKeys = [...new Set([...leftByKey.keys(), ...rightByKey.keys()])].sort();
  const pairs: PairedCalibrationJudgments[] = [];
  const unpairedLeft: CalibrationJudgmentIdentity[] = [];
  const unpairedRight: CalibrationJudgmentIdentity[] = [];
  for (const key of allKeys) {
    const left = leftByKey.get(key);
    const right = rightByKey.get(key);
    if (left !== undefined && right !== undefined) {
      pairs.push({ left, right });
    } else if (left !== undefined) {
      unpairedLeft.push(identityOf(left));
    } else if (right !== undefined) {
      unpairedRight.push(identityOf(right));
    }
  }
  const metrics = calculateAgreementForPairs(pairs);
  return {
    ...metrics,
    leftReviewerId,
    rightReviewerId,
    unpairedLeft,
    unpairedRight,
  };
}
