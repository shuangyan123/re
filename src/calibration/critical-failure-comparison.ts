import { BenchmarkConfigurationError } from "../contracts/errors.js";
import {
  type CalibrationCriticalFailureReferenceLabel,
  type CalibrationCriticalFailureReferenceSet,
  type CalibrationJudgeCriticalFailureComparison,
  type CalibrationJudgeCriticalFailureLabel,
  type CriticalFailureComparisonBreakdown,
  type TutorCriticalFailure,
  type TutorCriticalFailureSeverity,
  type TutorEvalDataset,
} from "../contracts/index.js";
import { TUTOR_EVAL_CRITICAL_FAILURE_TYPES } from "../contracts/tutor-eval.js";

interface ComparisonPair {
  readonly human: CalibrationCriticalFailureReferenceLabel;
  readonly judge: CalibrationJudgeCriticalFailureLabel;
}

export interface CriticalFailureJudgeComparisonInput {
  readonly referenceSet: CalibrationCriticalFailureReferenceSet;
  readonly judgeLabels: readonly CalibrationJudgeCriticalFailureLabel[];
  readonly dataset?: TutorEvalDataset;
}

const severities: readonly TutorCriticalFailureSeverity[] = ["minor", "major", "critical"];

function labelKey(value: {
  readonly targetId: string;
  readonly datasetId: string;
  readonly datasetVersion: string;
  readonly caseId: string;
  readonly caseVersion: string;
  readonly responseId: string;
  readonly failureType: TutorCriticalFailure;
}): string {
  return JSON.stringify([
    value.targetId,
    value.datasetId,
    value.datasetVersion,
    value.caseId,
    value.caseVersion,
    value.responseId,
    value.failureType,
  ]);
}

function weightedKappa(
  pairs: readonly ComparisonPair[],
): number | null {
  const matrix: Record<TutorCriticalFailureSeverity, Record<TutorCriticalFailureSeverity, number>> = {
    minor: { minor: 0, major: 0, critical: 0 },
    major: { minor: 0, major: 0, critical: 0 },
    critical: { minor: 0, major: 0, critical: 0 },
  };
  const scored = pairs.filter(
    (pair) =>
      pair.human.finalDecision === "PRESENT" &&
      pair.judge.decision === "PRESENT" &&
      pair.human.finalSeverity !== undefined &&
      pair.judge.severity !== undefined,
  );
  for (const pair of scored) {
    const humanSeverity = pair.human.finalSeverity;
    const judgeSeverity = pair.judge.severity;
    if (humanSeverity === undefined || judgeSeverity === undefined) {
      continue;
    }
    matrix[humanSeverity][judgeSeverity] += 1;
  }
  const total = scored.length;
  if (total === 0) {
    return null;
  }
  const distance = (left: TutorCriticalFailureSeverity, right: TutorCriticalFailureSeverity): number =>
    Math.abs(severities.indexOf(left) - severities.indexOf(right)) / 2;
  const observed =
    severities.reduce(
      (sum, left) =>
        sum + severities.reduce(
          (rowSum, right) => rowSum + matrix[left][right] * (1 - distance(left, right)),
          0,
        ),
      0,
    ) / total;
  const rowTotals = new Map(
    severities.map((severity) => [
      severity,
      severities.reduce((sum, right) => sum + matrix[severity][right], 0),
    ]),
  );
  const columnTotals = new Map(
    severities.map((severity) => [
      severity,
      severities.reduce((sum, left) => sum + matrix[left][severity], 0),
    ]),
  );
  const expected =
    severities.reduce(
      (sum, left) =>
        sum + severities.reduce(
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

function breakdownForPairs(
  pairs: readonly ComparisonPair[],
): CriticalFailureComparisonBreakdown {
  let exact = 0;
  let falsePositiveCount = 0;
  let falseNegativeCount = 0;
  let truePositiveCount = 0;
  let severityExact = 0;
  let severityPairCount = 0;
  for (const pair of pairs) {
    if (pair.human.finalDecision === pair.judge.decision) {
      exact += 1;
    }
    if (
      pair.human.finalDecision === "ABSENT" &&
      pair.judge.decision === "PRESENT"
    ) {
      falsePositiveCount += 1;
    }
    if (
      pair.human.finalDecision === "PRESENT" &&
      pair.judge.decision === "ABSENT"
    ) {
      falseNegativeCount += 1;
    }
    if (
      pair.human.finalDecision === "PRESENT" &&
      pair.judge.decision === "PRESENT"
    ) {
      truePositiveCount += 1;
      if (pair.human.finalSeverity !== undefined && pair.judge.severity !== undefined) {
        severityPairCount += 1;
        if (pair.human.finalSeverity === pair.judge.severity) {
          severityExact += 1;
        }
      }
    }
  }
  const precisionDenominator = truePositiveCount + falsePositiveCount;
  const recallDenominator = truePositiveCount + falseNegativeCount;
  const precision =
    precisionDenominator === 0 ? null : truePositiveCount / precisionDenominator;
  const recall = recallDenominator === 0 ? null : truePositiveCount / recallDenominator;
  const f1 =
    precision === null || recall === null || precision + recall === 0
      ? null
      : (2 * precision * recall) / (precision + recall);
  return {
    pairedLabelCount: pairs.length,
    exactPresenceAgreement: pairs.length === 0 ? null : exact / pairs.length,
    falsePositiveCount,
    falseNegativeCount,
    precision,
    recall,
    f1,
    severityExactAgreement:
      severityPairCount === 0 ? null : severityExact / severityPairCount,
    weightedSeverityAgreement: weightedKappa(pairs),
  };
}

function groupBy(
  pairs: readonly ComparisonPair[],
  keyFor: (pair: ComparisonPair) => string | undefined,
): Readonly<Record<string, CriticalFailureComparisonBreakdown>> {
  const groups = new Map<string, ComparisonPair[]>();
  for (const pair of pairs) {
    const key = keyFor(pair);
    if (key !== undefined) {
      groups.set(key, [...(groups.get(key) ?? []), pair]);
    }
  }
  return Object.fromEntries(
    [...groups.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([key, values]) => [
      key,
      breakdownForPairs(values),
    ]),
  );
}

function typeExactAgreement(pairs: readonly ComparisonPair[]): number | null {
  const groups = new Map<string, ComparisonPair[]>();
  for (const pair of pairs) {
    const key = JSON.stringify([
      pair.human.datasetId,
      pair.human.datasetVersion,
      pair.human.caseId,
      pair.human.caseVersion,
      pair.human.responseId,
    ]);
    groups.set(key, [...(groups.get(key) ?? []), pair]);
  }
  if (groups.size === 0) {
    return null;
  }
  let matches = 0;
  for (const grouped of groups.values()) {
    const humanTypes = grouped
      .filter((pair) => pair.human.finalDecision === "PRESENT")
      .map((pair) => pair.human.failureType)
      .sort();
    const judgeTypes = grouped
      .filter((pair) => pair.judge.decision === "PRESENT")
      .map((pair) => pair.judge.failureType)
      .sort();
    if (JSON.stringify(humanTypes) === JSON.stringify(judgeTypes)) {
      matches += 1;
    }
  }
  return matches / groups.size;
}

export function compareCalibrationCriticalFailureJudgeLabels(
  input: CriticalFailureJudgeComparisonInput,
): CalibrationJudgeCriticalFailureComparison {
  const humanByKey = new Map<string, CalibrationCriticalFailureReferenceLabel>();
  for (const label of input.referenceSet.labels) {
    const key = labelKey(label);
    if (humanByKey.has(key)) {
      throw new BenchmarkConfigurationError("calibration_critical_failure_data_invalid");
    }
    humanByKey.set(key, label);
  }
  const judgeByKey = new Map<string, CalibrationJudgeCriticalFailureLabel>();
  for (const label of input.judgeLabels) {
    const key = labelKey(label);
    if (judgeByKey.has(key)) {
      throw new BenchmarkConfigurationError("calibration_critical_failure_data_invalid");
    }
    judgeByKey.set(key, label);
  }
  const pairs: ComparisonPair[] = [];
  for (const [key, human] of humanByKey.entries()) {
    const judge = judgeByKey.get(key);
    if (judge !== undefined) {
      pairs.push({ human, judge });
    }
  }
  const overall = breakdownForPairs(pairs);
  const byFailureType = Object.fromEntries(
    TUTOR_EVAL_CRITICAL_FAILURE_TYPES.map((failureType) => [
      failureType,
      breakdownForPairs(pairs.filter((pair) => pair.human.failureType === failureType)),
    ]),
  ) as Record<TutorCriticalFailure, CriticalFailureComparisonBreakdown>;
  const bySeverity = Object.fromEntries(
    severities.map((severity) => [
      severity,
      breakdownForPairs(
        pairs.filter((pair) => pair.human.finalDecision === "PRESENT" && pair.human.finalSeverity === severity),
      ),
    ]),
  ) as Record<TutorCriticalFailureSeverity, CriticalFailureComparisonBreakdown>;
  const caseFor = (pair: ComparisonPair) =>
    input.dataset?.cases.find((candidate) => candidate.id === pair.human.caseId);
  const subjectFor = (pair: ComparisonPair): string | undefined =>
    caseFor(pair)?.metadata.subject;
  const disclosureFor = (pair: ComparisonPair): string | undefined =>
    caseFor(pair)?.evaluatorOnly.disclosurePolicy;
  return {
    pairedLabelCount: pairs.length,
    unpairedReferenceCount: humanByKey.size - pairs.length,
    unpairedJudgeCount: judgeByKey.size - pairs.length,
    exactPresenceAgreement: overall.exactPresenceAgreement,
    falsePositiveCount: overall.falsePositiveCount,
    falseNegativeCount: overall.falseNegativeCount,
    precision: overall.precision,
    recall: overall.recall,
    f1: overall.f1,
    typeExactAgreement: typeExactAgreement(pairs),
    severityExactAgreement: overall.severityExactAgreement,
    weightedSeverityAgreement: overall.weightedSeverityAgreement,
    byFailureType,
    bySeverity,
    byCase: groupBy(pairs, (pair) => pair.human.caseId),
    bySubject: groupBy(pairs, subjectFor),
    byDisclosurePolicy: groupBy(pairs, disclosureFor),
  };
}
