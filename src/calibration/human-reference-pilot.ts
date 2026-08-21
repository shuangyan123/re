import { BenchmarkConfigurationError } from "../contracts/errors.js";
import {
  HUMAN_REFERENCE_CALIBRATION_SCHEMA_VERSION,
  HUMAN_REFERENCE_PROTOCOL_ID,
  HUMAN_REFERENCE_PROTOCOL_VERSION,
  type HumanAnnotationDataKind,
  type HumanAtomicAnnotation,
  type HumanReferenceAnnotationFile,
  type HumanReferenceAnnotationTask,
  type HumanReferenceSyntheticFixtureMarker,
} from "../contracts/human-reference-calibration.js";
import {
  parseHumanAtomicAnnotation,
  parseHumanReferenceAnnotationFile,
  parseHumanReferenceAnnotationTask,
} from "../contracts/human-reference-calibration-validation.js";
import {
  parseHumanReferencePilotPacket,
  parseHumanReferencePilotSubmission,
  humanReferencePilotTaskSetFingerprint,
} from "../contracts/human-reference-pilot-validation.js";
import type {
  HumanReferencePilotPacket,
  HumanReferencePilotSource,
  HumanReferencePilotSubmission,
} from "../contracts/human-reference-pilot.js";
import {
  HUMAN_REFERENCE_PILOT_PACKET_KIND,
  HUMAN_REFERENCE_PILOT_PROTOCOL_ID,
  HUMAN_REFERENCE_PILOT_PROTOCOL_VERSION,
  HUMAN_REFERENCE_PILOT_SCHEMA_VERSION,
} from "../contracts/human-reference-pilot.js";
import {
  TUTOR_EVAL_DATASET_ID,
  TUTOR_EVAL_DATASET_VERSION,
} from "../contracts/tutor-eval.js";
import {
  loadMaterialRequirementDiagnosticFixtures,
  MATERIAL_REQUIREMENT_DIAGNOSTIC_ID,
  MATERIAL_REQUIREMENT_DIAGNOSTIC_VERSION,
  MATERIAL_REQUIREMENT_WORD_CONTEXT_FIXTURE_VERSION,
} from "../judge/material-requirement-discrimination.js";

export const HUMAN_REFERENCE_PILOT_FIXTURE_ID = "word-context" as const;
export const HUMAN_REFERENCE_PILOT_DEFAULT_ID =
  "human-reference-word-context-001" as const;

const HUMAN_REFERENCE_PILOT_CASE_IDS = [
  "material-word-context-A",
  "material-word-context-B",
  "material-word-context-C",
] as const;

const syntheticFixture: HumanReferenceSyntheticFixtureMarker = Object.freeze({
  synthetic: true,
  notHumanCalibrationData: true,
});

export const HUMAN_REFERENCE_WORD_CONTEXT_PILOT_SOURCE: HumanReferencePilotSource =
  Object.freeze({
    diagnosticId: MATERIAL_REQUIREMENT_DIAGNOSTIC_ID,
    diagnosticVersion: MATERIAL_REQUIREMENT_DIAGNOSTIC_VERSION,
    fixtureId: HUMAN_REFERENCE_PILOT_FIXTURE_ID,
    fixtureVersion: MATERIAL_REQUIREMENT_WORD_CONTEXT_FIXTURE_VERSION,
    datasetId: TUTOR_EVAL_DATASET_ID,
    datasetVersion: TUTOR_EVAL_DATASET_VERSION,
    dataKind: "synthetic-fixture",
    fixture: syntheticFixture,
  });

export interface HumanReferencePilotExport {
  readonly pilotId: string;
  readonly batchId: string;
  readonly source: HumanReferencePilotSource;
  readonly taskSetFingerprint: string;
  readonly tasks: readonly HumanReferenceAnnotationTask[];
  readonly packets: readonly HumanReferencePilotPacket[];
}

function invalid(): never {
  throw new BenchmarkConfigurationError("human_reference_calibration_invalid");
}

function opaqueId(value: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/u.test(value) && !value.includes("@");
}

function sameJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function visibleTaskProjection(value: unknown): HumanReferenceAnnotationTask {
  const input = value as {
    readonly caseId: string;
    readonly learningObjective: string;
    readonly studentProfile: string;
    readonly conversationHistory: string;
    readonly studentMessage: string;
    readonly problemContext: string;
    readonly groundTruth: string;
    readonly knownMisconception: string;
    readonly disclosurePolicy: string;
    readonly rubrics: readonly {
      readonly id: string;
      readonly criterion: string;
      readonly requirements: readonly { readonly id: string; readonly description: string }[];
    }[];
    readonly tutorResponse: string;
  };
  // Explicit allowlisting is the blindness boundary. Do not spread a
  // diagnostic case: its expected result is intentionally out of scope.
  return parseHumanReferenceAnnotationTask({
    schemaVersion: HUMAN_REFERENCE_CALIBRATION_SCHEMA_VERSION,
    caseId: input.caseId,
    learningObjective: input.learningObjective,
    studentProfile: input.studentProfile,
    conversationHistory: input.conversationHistory,
    studentMessage: input.studentMessage,
    problemContext: input.problemContext,
    groundTruth: input.groundTruth,
    knownMisconception: input.knownMisconception,
    disclosurePolicy: input.disclosurePolicy,
    rubrics: input.rubrics.map((rubric) => ({
      id: rubric.id,
      criterion: rubric.criterion,
      requirements: rubric.requirements.map((requirement) => ({
        id: requirement.id,
        description: requirement.description,
      })),
    })),
    tutorResponse: input.tutorResponse,
  });
}

export async function loadHumanReferencePilotTasks(
  fixtureId: string = HUMAN_REFERENCE_PILOT_FIXTURE_ID,
): Promise<readonly HumanReferenceAnnotationTask[]> {
  if (fixtureId !== HUMAN_REFERENCE_PILOT_FIXTURE_ID) {
    return invalid();
  }
  const fixtures = await loadMaterialRequirementDiagnosticFixtures();
  const fixture = fixtures.find((candidate) => candidate.id === fixtureId);
  if (
    fixture === undefined ||
    fixture.version !== MATERIAL_REQUIREMENT_WORD_CONTEXT_FIXTURE_VERSION ||
    fixture.cases.length !== HUMAN_REFERENCE_PILOT_CASE_IDS.length ||
    fixture.cases.some((fixtureCase, index) =>
      fixtureCase.input.caseId !== HUMAN_REFERENCE_PILOT_CASE_IDS[index],
    )
  ) {
    return invalid();
  }
  const tasks = fixture.cases.map((fixtureCase) => visibleTaskProjection(fixtureCase.input));
  if (
    new Set(tasks.map((task) => task.caseId)).size !== tasks.length ||
    tasks.reduce(
      (count, task) => count + task.rubrics.reduce(
        (rubricCount, rubric) => rubricCount + rubric.requirements.length,
        0,
      ),
      0,
    ) !== 12
  ) {
    return invalid();
  }
  return tasks;
}

function batchIdFor(pilotId: string, taskSetFingerprint: string): string {
  const suffix = taskSetFingerprint.slice("sha256:".length, "sha256:".length + 12);
  const batchId = `${pilotId}-${suffix}`;
  if (!opaqueId(batchId)) {
    return invalid();
  }
  return batchId;
}

export function buildHumanReferencePilotExport(
  tasks: readonly HumanReferenceAnnotationTask[],
  annotatorIds: readonly string[],
  pilotId: string = HUMAN_REFERENCE_PILOT_DEFAULT_ID,
): HumanReferencePilotExport {
  if (
    annotatorIds.length !== 2 ||
    new Set(annotatorIds).size !== 2 ||
    annotatorIds.some((annotatorId) => !opaqueId(annotatorId)) ||
    !opaqueId(pilotId) ||
    tasks.length !== HUMAN_REFERENCE_PILOT_CASE_IDS.length
  ) {
    return invalid();
  }
  const parsedTasks = tasks.map((task) => parseHumanReferenceAnnotationTask(task));
  const taskSetFingerprint = humanReferencePilotTaskSetFingerprint(parsedTasks);
  const batchId = batchIdFor(pilotId, taskSetFingerprint);
  const packets = annotatorIds.map((annotatorId) => parseHumanReferencePilotPacket({
    schemaVersion: HUMAN_REFERENCE_PILOT_SCHEMA_VERSION,
    packetKind: HUMAN_REFERENCE_PILOT_PACKET_KIND,
    pilotProtocolId: HUMAN_REFERENCE_PILOT_PROTOCOL_ID,
    pilotProtocolVersion: HUMAN_REFERENCE_PILOT_PROTOCOL_VERSION,
    pilotId,
    batchId,
    calibrationProtocolId: HUMAN_REFERENCE_PROTOCOL_ID,
    calibrationProtocolVersion: HUMAN_REFERENCE_PROTOCOL_VERSION,
    source: HUMAN_REFERENCE_WORD_CONTEXT_PILOT_SOURCE,
    taskSetFingerprint,
    annotatorId,
    tasks: parsedTasks,
  }));
  return {
    pilotId,
    batchId,
    source: HUMAN_REFERENCE_WORD_CONTEXT_PILOT_SOURCE,
    taskSetFingerprint,
    tasks: parsedTasks,
    packets,
  };
}

export async function createHumanReferencePilotExport(
  annotatorIds: readonly string[],
  pilotId: string = HUMAN_REFERENCE_PILOT_DEFAULT_ID,
): Promise<HumanReferencePilotExport> {
  return buildHumanReferencePilotExport(
    await loadHumanReferencePilotTasks(),
    annotatorIds,
    pilotId,
  );
}

interface AtomicUnit {
  readonly caseId: string;
  readonly rubricId: string;
  readonly requirementId: string;
}

function atomicKey(value: AtomicUnit): string {
  return JSON.stringify([value.caseId, value.rubricId, value.requirementId]);
}

function taskUnits(tasks: readonly HumanReferenceAnnotationTask[]): Map<string, AtomicUnit> {
  const units = new Map<string, AtomicUnit>();
  for (const task of tasks) {
    for (const rubric of task.rubrics) {
      for (const requirement of rubric.requirements) {
        const unit = {
          caseId: task.caseId,
          rubricId: rubric.id,
          requirementId: requirement.id,
        };
        const key = atomicKey(unit);
        if (units.has(key)) {
          return invalid();
        }
        units.set(key, unit);
      }
    }
  }
  return units;
}

function sameSource(left: HumanReferencePilotSource, right: HumanReferencePilotSource): boolean {
  return sameJson(left, right);
}

function sameTaskSet(
  left: readonly HumanReferenceAnnotationTask[],
  right: readonly HumanReferenceAnnotationTask[],
): boolean {
  return humanReferencePilotTaskSetFingerprint(left) === humanReferencePilotTaskSetFingerprint(right);
}

function canonicalAnnotation(
  submission: HumanReferencePilotSubmission,
  annotation: HumanReferencePilotSubmission["annotations"][number],
): HumanAtomicAnnotation {
  return parseHumanAtomicAnnotation({
    schemaVersion: HUMAN_REFERENCE_CALIBRATION_SCHEMA_VERSION,
    caseId: annotation.caseId,
    rubricId: annotation.rubricId,
    requirementId: annotation.requirementId,
    annotatorId: submission.annotatorId,
    status: annotation.status,
    ...(annotation.evidence === undefined ? {} : { evidence: annotation.evidence }),
  });
}

/**
 * Imports exactly two complete submissions and emits only the existing
 * canonical HumanReferenceAnnotationFile. No consensus or label is derived.
 */
export function mergeHumanReferencePilotSubmissions(
  packetValues: readonly unknown[],
  submissionValues: readonly unknown[],
  expectedTasks: readonly HumanReferenceAnnotationTask[],
): HumanReferenceAnnotationFile {
  if (packetValues.length !== 2 || submissionValues.length !== 2) {
    return invalid();
  }
  const packets = packetValues.map((packet) => parseHumanReferencePilotPacket(packet));
  const submissions = submissionValues.map((submission) =>
    parseHumanReferencePilotSubmission(submission),
  );
  const [firstPacket, secondPacket] = packets;
  if (
    firstPacket === undefined ||
    secondPacket === undefined ||
    firstPacket.annotatorId === secondPacket.annotatorId ||
    !sameSource(firstPacket.source, HUMAN_REFERENCE_WORD_CONTEXT_PILOT_SOURCE) ||
    !sameSource(secondPacket.source, HUMAN_REFERENCE_WORD_CONTEXT_PILOT_SOURCE) ||
    firstPacket.pilotId !== secondPacket.pilotId ||
    firstPacket.batchId !== secondPacket.batchId ||
    firstPacket.calibrationProtocolId !== secondPacket.calibrationProtocolId ||
    firstPacket.calibrationProtocolVersion !== secondPacket.calibrationProtocolVersion ||
    firstPacket.taskSetFingerprint !== secondPacket.taskSetFingerprint ||
    !sameTaskSet(firstPacket.tasks, secondPacket.tasks) ||
    !sameTaskSet(firstPacket.tasks, expectedTasks)
  ) {
    return invalid();
  }

  const packetByAnnotator = new Map(packets.map((packet) => [packet.annotatorId, packet]));
  const expectedUnits = taskUnits(firstPacket.tasks);
  const requiredAnnotatorIds = [...packetByAnnotator.keys()].sort((left, right) =>
    left.localeCompare(right),
  );
  const canonicalAnnotations: HumanAtomicAnnotation[] = [];
  let dataKind: HumanAnnotationDataKind | undefined;
  let fixture: HumanReferenceSyntheticFixtureMarker | undefined;

  for (const submission of submissions) {
    const packet = packetByAnnotator.get(submission.annotatorId);
    if (
      packet === undefined ||
      submission.pilotId !== packet.pilotId ||
      submission.batchId !== packet.batchId ||
      submission.calibrationProtocolId !== packet.calibrationProtocolId ||
      submission.calibrationProtocolVersion !== packet.calibrationProtocolVersion ||
      submission.taskSetFingerprint !== packet.taskSetFingerprint
    ) {
      return invalid();
    }
    if (dataKind === undefined) {
      dataKind = submission.dataKind;
      fixture = submission.fixture;
    } else if (dataKind !== submission.dataKind || !sameJson(fixture, submission.fixture)) {
      return invalid();
    }
    const observed = new Set<string>();
    for (const annotation of submission.annotations) {
      const key = atomicKey(annotation);
      if (!expectedUnits.has(key) || observed.has(key)) {
        return invalid();
      }
      observed.add(key);
      canonicalAnnotations.push(canonicalAnnotation(submission, annotation));
    }
    if (observed.size !== expectedUnits.size) {
      return invalid();
    }
  }
  if (dataKind === undefined) {
    return invalid();
  }

  canonicalAnnotations.sort((left, right) => {
    const leftKey = `${atomicKey(left)}|${left.annotatorId}`;
    const rightKey = `${atomicKey(right)}|${right.annotatorId}`;
    return leftKey.localeCompare(rightKey);
  });
  const candidate: HumanReferenceAnnotationFile = {
    schemaVersion: HUMAN_REFERENCE_CALIBRATION_SCHEMA_VERSION,
    batchId: firstPacket.batchId,
    calibrationProtocolId: HUMAN_REFERENCE_PROTOCOL_ID,
    calibrationProtocolVersion: HUMAN_REFERENCE_PROTOCOL_VERSION,
    dataKind,
    ...(fixture === undefined ? {} : { fixture }),
    requiredAnnotatorIds,
    tasks: firstPacket.tasks,
    annotations: canonicalAnnotations,
  };
  const canonical = parseHumanReferenceAnnotationFile(candidate);
  // Completeness is checked after conversion, so no generated object is
  // trusted merely because this importer created it.
  for (const annotatorId of requiredAnnotatorIds) {
    for (const task of canonical.tasks) {
      const annotations = canonical.annotations.filter((annotation) =>
        annotation.annotatorId === annotatorId && annotation.caseId === task.caseId,
      );
      const expectedTask = parseHumanReferenceAnnotationTask(task);
      const expectedAnnotationCount = expectedTask.rubrics.reduce(
        (count, rubric) => count + rubric.requirements.length,
        0,
      );
      if (annotations.length !== expectedAnnotationCount) {
        return invalid();
      }
    }
  }
  return canonical;
}
