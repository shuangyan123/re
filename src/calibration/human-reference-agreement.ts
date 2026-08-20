import { BenchmarkConfigurationError } from "../contracts/errors.js";
import {
  type HumanAtomicAnnotation,
  type HumanAtomicConfusionMatrix,
  type HumanAtomicDisagreement,
  type HumanAtomicIdentity,
  type HumanAtomicStatus,
  type HumanPairwiseAgreementReport,
  type HumanPairwiseStatusSummary,
} from "../contracts/human-reference-calibration.js";
import { parseHumanAtomicAnnotation } from "../contracts/human-reference-calibration-validation.js";

function identityOf(annotation: HumanAtomicAnnotation): HumanAtomicIdentity {
  return {
    caseId: annotation.caseId,
    rubricId: annotation.rubricId,
    requirementId: annotation.requirementId,
  };
}

export function humanAtomicIdentityKey(value: HumanAtomicIdentity): string {
  return JSON.stringify([value.caseId, value.rubricId, value.requirementId]);
}

function emptyConfusionMatrix(): {
  -readonly [status in HumanAtomicStatus]: Record<HumanAtomicStatus, number>;
} {
  const row = (): Record<HumanAtomicStatus, number> => ({
    SATISFIED: 0,
    OMITTED_OR_INCOMPLETE: 0,
    EXPLICIT_CONFLICT: 0,
  });
  return {
    SATISFIED: row(),
    OMITTED_OR_INCOMPLETE: row(),
    EXPLICIT_CONFLICT: row(),
  };
}

type MutableHumanPairwiseStatusSummary = {
  -readonly [key in keyof HumanPairwiseStatusSummary]: number;
};

function emptyByStatus(): Record<HumanAtomicStatus, MutableHumanPairwiseStatusSummary> {
  const summary = (): MutableHumanPairwiseStatusSummary => ({
    annotatorACount: 0,
    annotatorBCount: 0,
    comparableCount: 0,
    agreementCount: 0,
    disagreementCount: 0,
  });
  return {
    SATISFIED: summary(),
    OMITTED_OR_INCOMPLETE: summary(),
    EXPLICIT_CONFLICT: summary(),
  };
}

function validateAnnotatorStream(
  annotatorId: string,
  annotations: readonly HumanAtomicAnnotation[],
): Map<string, HumanAtomicAnnotation> {
  if (
    !/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/u.test(annotatorId) ||
    !Array.isArray(annotations)
  ) {
    throw new BenchmarkConfigurationError("human_reference_calibration_invalid");
  }
  const byKey = new Map<string, HumanAtomicAnnotation>();
  for (const value of annotations) {
    const annotation = parseHumanAtomicAnnotation(value);
    if (annotation.annotatorId !== annotatorId) {
      throw new BenchmarkConfigurationError("human_reference_calibration_invalid");
    }
    const key = humanAtomicIdentityKey(annotation);
    if (byKey.has(key)) {
      throw new BenchmarkConfigurationError("human_reference_calibration_invalid");
    }
    byKey.set(key, annotation);
  }
  return byKey;
}

function sortedIdentities(
  identities: readonly HumanAtomicIdentity[],
): HumanAtomicIdentity[] {
  return [...identities].sort((left, right) =>
    humanAtomicIdentityKey(left).localeCompare(humanAtomicIdentityKey(right)),
  );
}

/**
 * Computes directional rows=A and columns=B agreement. Missing annotations
 * remain explicit availability observations and never enter the denominator.
 */
export function calculateHumanPairwiseAgreement(
  annotatorA: string,
  annotatorB: string,
  annotationsA: readonly HumanAtomicAnnotation[],
  annotationsB: readonly HumanAtomicAnnotation[],
): HumanPairwiseAgreementReport {
  if (annotatorA === annotatorB) {
    throw new BenchmarkConfigurationError("human_reference_calibration_invalid");
  }
  const leftByKey = validateAnnotatorStream(annotatorA, annotationsA);
  const rightByKey = validateAnnotatorStream(annotatorB, annotationsB);
  const allKeys = [...new Set([...leftByKey.keys(), ...rightByKey.keys()])].sort();
  const matrix = emptyConfusionMatrix();
  const byStatus = emptyByStatus();
  const disagreements: HumanAtomicDisagreement[] = [];
  const missingForAnnotatorA: HumanAtomicIdentity[] = [];
  const missingForAnnotatorB: HumanAtomicIdentity[] = [];
  let agreementCount = 0;

  for (const key of allKeys) {
    const left = leftByKey.get(key);
    const right = rightByKey.get(key);
    if (left === undefined && right !== undefined) {
      missingForAnnotatorA.push(identityOf(right));
      continue;
    }
    if (left !== undefined && right === undefined) {
      missingForAnnotatorB.push(identityOf(left));
      continue;
    }
    if (left === undefined || right === undefined) {
      continue;
    }
    matrix[left.status][right.status] += 1;
    const leftSummary = byStatus[left.status];
    const rightSummary = byStatus[right.status];
    leftSummary.annotatorACount += 1;
    rightSummary.annotatorBCount += 1;
    const pairSummary = byStatus[left.status];
    pairSummary.comparableCount += 1;
    if (left.status === right.status) {
      agreementCount += 1;
      pairSummary.agreementCount += 1;
    } else {
      pairSummary.disagreementCount += 1;
      disagreements.push({
        ...identityOf(left),
        annotatorAStatus: left.status,
        annotatorBStatus: right.status,
        ...(left.evidence === undefined ? {} : { annotatorAEvidence: left.evidence }),
        ...(right.evidence === undefined ? {} : { annotatorBEvidence: right.evidence }),
      });
    }
  }

  const comparableAtomicCount = allKeys.length -
    missingForAnnotatorA.length - missingForAnnotatorB.length;
  return {
    annotatorA,
    annotatorB,
    comparableAtomicCount,
    agreementCount,
    disagreementCount: comparableAtomicCount - agreementCount,
    agreementShare:
      comparableAtomicCount === 0 ? null : agreementCount / comparableAtomicCount,
    confusionMatrix: matrix as HumanAtomicConfusionMatrix,
    byStatus,
    disagreements: disagreements.sort((left, right) =>
      humanAtomicIdentityKey(left).localeCompare(humanAtomicIdentityKey(right)),
    ),
    missingForAnnotatorA: sortedIdentities(missingForAnnotatorA),
    missingForAnnotatorB: sortedIdentities(missingForAnnotatorB),
  };
}

export const compareHumanAnnotators = calculateHumanPairwiseAgreement;
