import { BenchmarkConfigurationError } from "../contracts/errors.js";
import {
  type HumanAtomicAdjudication,
  type HumanAtomicAnnotation,
  type HumanAtomicMissingAssessment,
  HUMAN_REFERENCE_CALIBRATION_SCHEMA_VERSION,
  HUMAN_REFERENCE_PROTOCOL_ID,
  HUMAN_REFERENCE_PROTOCOL_VERSION,
  type HumanReferenceDerivedLabel,
  type HumanReferenceSet,
  type HumanReferenceSetBuildInput,
  type HumanReferenceAnnotationTask,
  type HumanAtomicUnresolvedDisagreement,
  type ReferenceAtomicAssessment,
} from "../contracts/human-reference-calibration.js";
import {
  parseHumanAtomicAdjudication,
  parseHumanAtomicAnnotation,
  parseHumanReferenceAnnotationTask,
} from "../contracts/human-reference-calibration-validation.js";
import { aggregateMaterialRequirementAssessments } from "../judge/material-requirement-aggregation.js";
import { humanAtomicIdentityKey } from "./human-reference-agreement.js";

function invalid(): never {
  throw new BenchmarkConfigurationError("human_reference_calibration_invalid");
}

function sortedIds(values: readonly string[]): string[] {
  return [...values].sort((left, right) => left.localeCompare(right));
}

function identityOf(value: {
  readonly caseId: string;
  readonly rubricId: string;
  readonly requirementId: string;
}): {
  readonly caseId: string;
  readonly rubricId: string;
  readonly requirementId: string;
} {
  return {
    caseId: value.caseId,
    rubricId: value.rubricId,
    requirementId: value.requirementId,
  };
}

function sameStringSet(left: readonly string[], right: readonly string[]): boolean {
  const leftSorted = sortedIds(left);
  const rightSorted = sortedIds(right);
  return leftSorted.length === rightSorted.length && leftSorted.every(
    (value, index) => value === rightSorted[index],
  );
}

function taskUnits(task: HumanReferenceAnnotationTask): {
  readonly caseId: string;
  readonly rubricId: string;
  readonly requirementId: string;
}[] {
  return task.rubrics.flatMap((rubric) => rubric.requirements.map((requirement) => ({
    caseId: task.caseId,
    rubricId: rubric.id,
    requirementId: requirement.id,
  })));
}

function annotationUnitKey(annotation: HumanAtomicAnnotation): string {
  return humanAtomicIdentityKey(annotation);
}

function adjudicationUnitKey(adjudication: HumanAtomicAdjudication): string {
  return humanAtomicIdentityKey(adjudication);
}

function validateBuildInput(input: HumanReferenceSetBuildInput): {
  readonly tasks: readonly HumanReferenceAnnotationTask[];
  readonly annotations: readonly HumanAtomicAnnotation[];
  readonly adjudications: readonly HumanAtomicAdjudication[];
  readonly requiredAnnotatorIds: readonly string[];
} {
  if (
    input === null ||
    typeof input !== "object" ||
    Array.isArray(input) ||
    !Array.isArray(input.tasks) ||
    !Array.isArray(input.annotations) ||
    !Array.isArray(input.requiredAnnotatorIds) ||
    (input.adjudications !== undefined && !Array.isArray(input.adjudications))
  ) {
    return invalid();
  }
  const dataKind = input.dataKind ?? "human-reference";
  if (
    input.tasks.length === 0 ||
    input.requiredAnnotatorIds.length < 2 ||
    new Set(input.requiredAnnotatorIds).size !== input.requiredAnnotatorIds.length ||
    input.requiredAnnotatorIds.some((id) => !/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/u.test(id)) ||
    (dataKind === "synthetic-fixture" && input.fixture === undefined) ||
    (dataKind === "human-reference" && input.fixture !== undefined) ||
    (dataKind !== "human-reference" && dataKind !== "synthetic-fixture") ||
    (input.fixture !== undefined && (
      input.fixture === null ||
      input.fixture.synthetic !== true ||
      input.fixture.notHumanCalibrationData !== true
    ))
  ) {
    return invalid();
  }
  const tasks = input.tasks.map((task) => parseHumanReferenceAnnotationTask(task));
  if (new Set(tasks.map((task) => task.caseId)).size !== tasks.length) {
    return invalid();
  }
  const annotations = input.annotations.map((annotation) => parseHumanAtomicAnnotation(annotation));
  const adjudications = (input.adjudications ?? []).map((adjudication) =>
    parseHumanAtomicAdjudication(adjudication),
  );
  const requiredAnnotatorIds = sortedIds(input.requiredAnnotatorIds);
  const taskByCaseId = new Map(tasks.map((task) => [task.caseId, task]));
  const annotationKeys = new Set<string>();
  for (const annotation of annotations) {
    const task = taskByCaseId.get(annotation.caseId);
    const rubric = task?.rubrics.find((candidate) => candidate.id === annotation.rubricId);
    if (
      task === undefined ||
      rubric === undefined ||
      !rubric.requirements.some((requirement) => requirement.id === annotation.requirementId) ||
      !requiredAnnotatorIds.includes(annotation.annotatorId) ||
      annotationKeys.has(`${annotationUnitKey(annotation)}|${annotation.annotatorId}`)
    ) {
      return invalid();
    }
    annotationKeys.add(`${annotationUnitKey(annotation)}|${annotation.annotatorId}`);
  }
  const adjudicationKeys = new Set<string>();
  for (const adjudication of adjudications) {
    if (adjudicationKeys.has(adjudicationUnitKey(adjudication))) {
      return invalid();
    }
    adjudicationKeys.add(adjudicationUnitKey(adjudication));
  }
  return { tasks, annotations, adjudications, requiredAnnotatorIds };
}

function unresolvedDisagreement(
  identity: {
    readonly caseId: string;
    readonly rubricId: string;
    readonly requirementId: string;
  },
  annotations: readonly HumanAtomicAnnotation[],
): HumanAtomicUnresolvedDisagreement {
  const sortedAnnotations = [...annotations].sort((left, right) =>
    left.annotatorId.localeCompare(right.annotatorId),
  );
  return {
    ...identityOf(identity),
    statuses: Object.fromEntries(
      sortedAnnotations
        .map((annotation) => [annotation.annotatorId, annotation.status]),
    ),
    evidenceByAnnotator: Object.fromEntries(
      sortedAnnotations
        .map((annotation) => [annotation.annotatorId, annotation.evidence]),
    ),
  };
}

function missingAssessment(
  identity: {
    readonly caseId: string;
    readonly rubricId: string;
    readonly requirementId: string;
  },
  requiredAnnotatorIds: readonly string[],
  annotations: readonly HumanAtomicAnnotation[],
): HumanAtomicMissingAssessment {
  const presentAnnotatorIds = sortedIds(annotations.map((annotation) => annotation.annotatorId));
  return {
    ...identityOf(identity),
    missingAnnotatorIds: requiredAnnotatorIds.filter((id) => !presentAnnotatorIds.includes(id)),
    presentAnnotatorIds,
  };
}

function adjudicationMatches(
  adjudication: HumanAtomicAdjudication,
  annotations: readonly HumanAtomicAnnotation[],
  requiredAnnotatorIds: readonly string[],
): boolean {
  if (!sameStringSet(adjudication.sourceAnnotatorIds, requiredAnnotatorIds)) {
    return false;
  }
  const observedStatuses = Object.fromEntries(
    annotations.map((annotation) => [annotation.annotatorId, annotation.status]),
  );
  return Object.keys(adjudication.sourceStatuses).length === requiredAnnotatorIds.length &&
    requiredAnnotatorIds.every(
      (annotatorId) => adjudication.sourceStatuses[annotatorId] === observedStatuses[annotatorId],
    );
}

function sortedReferences(
  references: readonly ReferenceAtomicAssessment[],
): ReferenceAtomicAssessment[] {
  return [...references].sort((left, right) =>
    humanAtomicIdentityKey(left).localeCompare(humanAtomicIdentityKey(right)),
  );
}

function sortedUnresolved(
  values: readonly HumanAtomicUnresolvedDisagreement[],
): HumanAtomicUnresolvedDisagreement[] {
  return [...values].sort((left, right) =>
    humanAtomicIdentityKey(left).localeCompare(humanAtomicIdentityKey(right)),
  );
}

function sortedMissing(
  values: readonly HumanAtomicMissingAssessment[],
): HumanAtomicMissingAssessment[] {
  return [...values].sort((left, right) =>
    humanAtomicIdentityKey(left).localeCompare(humanAtomicIdentityKey(right)),
  );
}

/**
 * Resolves only exact independent consensus or an explicit adjudication.
 * Missing annotations and unresolved disagreements never receive a status.
 */
export function buildHumanReferenceSet(
  input: HumanReferenceSetBuildInput,
): HumanReferenceSet {
  const normalized = validateBuildInput(input);
  const annotationsByUnit = new Map<string, HumanAtomicAnnotation[]>();
  for (const annotation of normalized.annotations) {
    const key = annotationUnitKey(annotation);
    annotationsByUnit.set(key, [...(annotationsByUnit.get(key) ?? []), annotation]);
  }
  const adjudicationsByUnit = new Map<string, HumanAtomicAdjudication>();
  for (const adjudication of normalized.adjudications) {
    adjudicationsByUnit.set(adjudicationUnitKey(adjudication), adjudication);
  }
  const references: ReferenceAtomicAssessment[] = [];
  const unresolvedDisagreements: HumanAtomicUnresolvedDisagreement[] = [];
  const missingAnnotations: HumanAtomicMissingAssessment[] = [];
  const visitedUnits = new Set<string>();
  let plannedAtomicAssessments = 0;

  for (const task of normalized.tasks) {
    for (const unit of taskUnits(task)) {
      plannedAtomicAssessments += 1;
      const key = humanAtomicIdentityKey(unit);
      visitedUnits.add(key);
      const unitAnnotations = annotationsByUnit.get(key) ?? [];
      if (unitAnnotations.length < normalized.requiredAnnotatorIds.length) {
        missingAnnotations.push(
          missingAssessment(unit, normalized.requiredAnnotatorIds, unitAnnotations),
        );
        if (adjudicationsByUnit.has(key)) {
          return invalid();
        }
        continue;
      }
      const firstStatus = unitAnnotations[0]?.status;
      const allAgree = firstStatus !== undefined && unitAnnotations.every(
        (annotation) => annotation.status === firstStatus,
      );
      if (allAgree && firstStatus !== undefined) {
        references.push({
          ...identityOf(unit),
          status: firstStatus,
          provenance: "human_consensus",
          sourceAnnotatorIds: normalized.requiredAnnotatorIds,
        });
        if (adjudicationsByUnit.has(key)) {
          return invalid();
        }
        continue;
      }
      const adjudication = adjudicationsByUnit.get(key);
      if (adjudication === undefined) {
        unresolvedDisagreements.push(unresolvedDisagreement(unit, unitAnnotations));
        continue;
      }
      if (!adjudicationMatches(adjudication, unitAnnotations, normalized.requiredAnnotatorIds)) {
        return invalid();
      }
      references.push({
        ...identityOf(unit),
        status: adjudication.adjudicatedStatus,
        provenance: "human_adjudicated",
        sourceAnnotatorIds: normalized.requiredAnnotatorIds,
      });
    }
  }
  for (const adjudication of normalized.adjudications) {
    if (!visitedUnits.has(adjudicationUnitKey(adjudication))) {
      return invalid();
    }
  }
  const resolvedAtomicAssessments = references.length;
  const unresolvedAtomicAssessments = unresolvedDisagreements.length;
  const missingAtomicAssessments = missingAnnotations.length;
  const dataKind = input.dataKind ?? "human-reference";
  const fixture = input.fixture;
  return {
    schemaVersion: HUMAN_REFERENCE_CALIBRATION_SCHEMA_VERSION,
    calibrationProtocolId: HUMAN_REFERENCE_PROTOCOL_ID,
    calibrationProtocolVersion: HUMAN_REFERENCE_PROTOCOL_VERSION,
    dataKind,
    ...(fixture === undefined ? {} : { fixture }),
    humanCalibrationAvailable: dataKind === "human-reference",
    tasks: normalized.tasks,
    references: sortedReferences(references),
    unresolvedDisagreements: sortedUnresolved(unresolvedDisagreements),
    missingAnnotations: sortedMissing(missingAnnotations),
    coverage: {
      plannedAtomicAssessments,
      resolvedAtomicAssessments,
      unresolvedAtomicAssessments,
      missingAtomicAssessments,
      referenceCoverageShare:
        plannedAtomicAssessments === 0 ? null : resolvedAtomicAssessments / plannedAtomicAssessments,
    },
  };
}

export function deriveHumanReferenceRubricLabels(
  referenceSet: HumanReferenceSet,
): readonly HumanReferenceDerivedLabel[] {
  const referencesByUnit = new Map(
    referenceSet.references.map((reference) => [humanAtomicIdentityKey(reference), reference]),
  );
  const labels: HumanReferenceDerivedLabel[] = [];
  for (const task of referenceSet.tasks) {
    for (const rubric of task.rubrics) {
      const assessments = rubric.requirements.map((requirement) =>
        referencesByUnit.get(humanAtomicIdentityKey({
          caseId: task.caseId,
          rubricId: rubric.id,
          requirementId: requirement.id,
        })),
      );
      if (assessments.some((assessment) => assessment === undefined)) {
        continue;
      }
      labels.push({
        caseId: task.caseId,
        rubricId: rubric.id,
        label: aggregateMaterialRequirementAssessments(
          assessments as ReferenceAtomicAssessment[],
        ),
      });
    }
  }
  return labels.sort((left, right) =>
    `${left.caseId}/${left.rubricId}`.localeCompare(`${right.caseId}/${right.rubricId}`),
  );
}

export function assertHumanReferenceSetReady(
  referenceSet: HumanReferenceSet,
): void {
  if (
    referenceSet.schemaVersion !== HUMAN_REFERENCE_CALIBRATION_SCHEMA_VERSION ||
    referenceSet.calibrationProtocolId !== HUMAN_REFERENCE_PROTOCOL_ID ||
    referenceSet.calibrationProtocolVersion !== HUMAN_REFERENCE_PROTOCOL_VERSION
  ) {
    return invalid();
  }
}
