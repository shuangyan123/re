import { BenchmarkConfigurationError } from "../contracts/errors.js";
import {
  parseMaterialRequirementJudgeResult,
} from "../contracts/material-requirement-validation.js";
import type {
  MaterialRequirementAssessment,
  MaterialRequirementJudgeResult,
  MaterialRequirementRubricAssessment,
} from "../contracts/material-requirement-judge.js";
import {
  type HumanAtomicConfusionMatrix,
  type HumanAtomicStatus,
  type HumanReferenceAtomicAgreement,
  type HumanReferenceDerivedAgreement,
  type HumanReferenceDerivedDisagreement,
  type HumanReferenceJudgeAtomicDisagreement,
  type HumanReferenceJudgeComparison,
  type HumanReferenceSet,
} from "../contracts/human-reference-calibration.js";
import { aggregateMaterialRequirementAssessments } from "../judge/material-requirement-aggregation.js";
import { humanAtomicIdentityKey } from "./human-reference-agreement.js";
import { assertHumanReferenceSetReady } from "./human-reference-reference.js";

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

function atomicAgreement(
  referenceSet: HumanReferenceSet,
  judgeResult: MaterialRequirementJudgeResult,
): HumanReferenceAtomicAgreement {
  const references = referenceSet.references.filter(
    (reference) => reference.caseId === judgeResult.caseId,
  );
  const judgeByKey = new Map<string, MaterialRequirementAssessment>(
    judgeResult.rubricAssessments.flatMap((rubric) => rubric.requirements.map((assessment) => [
      humanAtomicIdentityKey({
        caseId: judgeResult.caseId,
        rubricId: rubric.rubricId,
        requirementId: assessment.requirementId,
      }),
      assessment,
    ])),
  );
  const matrix = emptyConfusionMatrix();
  const disagreements: HumanReferenceJudgeAtomicDisagreement[] = [];
  let agreementCount = 0;
  for (const reference of references) {
    const judge = judgeByKey.get(humanAtomicIdentityKey(reference));
    if (judge === undefined) {
      continue;
    }
    matrix[reference.status][judge.status] += 1;
    if (reference.status === judge.status) {
      agreementCount += 1;
    } else {
      disagreements.push({
        caseId: reference.caseId,
        rubricId: reference.rubricId,
        requirementId: reference.requirementId,
        referenceStatus: reference.status,
        judgeStatus: judge.status,
        referenceProvenance: reference.provenance,
        referenceSourceAnnotatorIds: reference.sourceAnnotatorIds,
        ...(judge.evidence === undefined ? {} : { judgeEvidence: judge.evidence }),
      });
    }
  }
  const comparableAtomicCount = references.filter((reference) =>
    judgeByKey.has(humanAtomicIdentityKey(reference)),
  ).length;
  return {
    comparableAtomicCount,
    agreementCount,
    disagreementCount: comparableAtomicCount - agreementCount,
    agreementShare:
      comparableAtomicCount === 0 ? null : agreementCount / comparableAtomicCount,
    confusionMatrix: matrix as HumanAtomicConfusionMatrix,
    disagreements: disagreements.sort((left, right) =>
      humanAtomicIdentityKey(left).localeCompare(humanAtomicIdentityKey(right)),
    ),
  };
}

function derivedAgreement(
  referenceSet: HumanReferenceSet,
  judgeResult: MaterialRequirementJudgeResult,
): HumanReferenceDerivedAgreement {
  const referencesByKey = new Map(
    referenceSet.references
      .filter((reference) => reference.caseId === judgeResult.caseId)
      .map((reference) => [humanAtomicIdentityKey(reference), reference]),
  );
  const judgeByRubric = new Map<string, MaterialRequirementRubricAssessment>(
    judgeResult.rubricAssessments.map((rubric) => [rubric.rubricId, rubric]),
  );
  const disagreements: HumanReferenceDerivedDisagreement[] = [];
  let comparableRubricCount = 0;
  let agreementCount = 0;
  const task = referenceSet.tasks.find((candidate) => candidate.caseId === judgeResult.caseId);
  if (task === undefined) {
    return {
      comparableRubricCount,
      agreementCount,
      disagreementCount: 0,
      agreementShare: null,
      disagreements,
    };
  }
  for (const rubric of task.rubrics) {
    const judgeRubric = judgeByRubric.get(rubric.id);
    if (judgeRubric === undefined) {
      continue;
    }
    const referenceAssessments = rubric.requirements.map((requirement) =>
      referencesByKey.get(humanAtomicIdentityKey({
        caseId: task.caseId,
        rubricId: rubric.id,
        requirementId: requirement.id,
      })),
    );
    if (referenceAssessments.some((assessment) => assessment === undefined)) {
      continue;
    }
    const referenceLabel = aggregateMaterialRequirementAssessments(
      referenceAssessments as { readonly status: HumanAtomicStatus }[],
    );
    const judgeLabel = aggregateMaterialRequirementAssessments(judgeRubric.requirements);
    comparableRubricCount += 1;
    if (referenceLabel === judgeLabel) {
      agreementCount += 1;
    } else {
      disagreements.push({
        caseId: task.caseId,
        rubricId: rubric.id,
        referenceLabel,
        judgeLabel,
      });
    }
  }
  return {
    comparableRubricCount,
    agreementCount,
    disagreementCount: comparableRubricCount - agreementCount,
    agreementShare:
      comparableRubricCount === 0 ? null : agreementCount / comparableRubricCount,
    disagreements: disagreements.sort((left, right) =>
      `${left.caseId}/${left.rubricId}`.localeCompare(`${right.caseId}/${right.rubricId}`),
    ),
  };
}

/**
 * Compares one validated Material Requirement Judge result to only resolved
 * human consensus/adjudicated atoms. Unresolved or missing reference units are
 * excluded from both semantic denominators.
 */
export function compareJudgeToHumanReference(
  judgeResult: MaterialRequirementJudgeResult,
  humanReference: HumanReferenceSet,
): HumanReferenceJudgeComparison {
  assertHumanReferenceSetReady(humanReference);
  const task = humanReference.tasks.find((candidate) => candidate.caseId === judgeResult.caseId);
  if (task === undefined) {
    throw new BenchmarkConfigurationError("human_reference_calibration_invalid");
  }
  const input = { ...task };
  delete (input as { schemaVersion?: unknown }).schemaVersion;
  const parsedJudgeResult = parseMaterialRequirementJudgeResult(judgeResult, input);
  return {
    referenceAgreement: atomicAgreement(humanReference, parsedJudgeResult),
    derivedLabelAgreement: derivedAgreement(humanReference, parsedJudgeResult),
  };
}
