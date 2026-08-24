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
  HumanReferencePilotSubmissionTemplate,
  HumanReferencePilotSubmissionTemplateAnnotation,
  HumanReferencePilotSubmission,
} from "../contracts/human-reference-pilot.js";
import {
  HUMAN_REFERENCE_PILOT_PACKET_KIND,
  HUMAN_REFERENCE_PILOT_ANNOTATION_GUIDE_ID,
  HUMAN_REFERENCE_PILOT_ANNOTATION_GUIDE_VERSION,
  HUMAN_REFERENCE_PILOT_BOUNDARY_ANNOTATION_GUIDE_VERSION,
  HUMAN_REFERENCE_PILOT_BOUNDARY_PROTOCOL_VERSION,
  HUMAN_REFERENCE_PILOT_PROTOCOL_ID,
  HUMAN_REFERENCE_PILOT_PROTOCOL_VERSION,
  HUMAN_REFERENCE_PILOT_SCHEMA_VERSION,
  HUMAN_REFERENCE_PILOT_SUBMISSION_KIND,
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
export const HUMAN_REFERENCE_PILOT_BOUNDARY_FIXTURE_ID =
  "word-context-human-boundaries" as const;
export type HumanReferencePilotFixtureId =
  | typeof HUMAN_REFERENCE_PILOT_FIXTURE_ID
  | typeof HUMAN_REFERENCE_PILOT_BOUNDARY_FIXTURE_ID;
export const HUMAN_REFERENCE_PILOT_DEFAULT_ID =
  "human-reference-word-context-001" as const;
export const HUMAN_REFERENCE_PILOT_BOUNDARY_DEFAULT_ID =
  "human-reference-word-context-boundaries-002" as const;

export const HUMAN_REFERENCE_PILOT_ANNOTATION_GUIDE = `# Human Reference Annotation Guide

Judge each atomic requirement independently.

Do not rate the Tutor response as a whole.

Allowed statuses:

## SATISFIED

Use SATISFIED when the Tutor response explicitly satisfies the requirement,
or states a clearly equivalent meaning.

Do not require exact wording.

## OMITTED_OR_INCOMPLETE

Use OMITTED_OR_INCOMPLETE when the requirement is not addressed or only
partially addressed, and the Tutor response does not explicitly make a claim
incompatible with the requirement.

## EXPLICIT_CONFLICT

Use EXPLICIT_CONFLICT when the Tutor response explicitly states something that
is incompatible with the requirement.

A missing statement is not an explicit conflict.
An incomplete explanation is not automatically an explicit conflict.

## Atomic independence

Evaluate each atomic requirement independently.

Failure on one requirement does not automatically imply failure on another.
Do not copy one status across multiple requirements only because the overall
response seems good or bad.

## Evidence

Evidence is optional. When used, keep it short and quote or paraphrase only
the visible Tutor response.

Do not provide hidden reasoning or speculate about model intent.

## Blind annotation

Complete your submission independently. Do not consult another annotator,
developer expected labels, Judge results, benchmark labels, or adjudications.
` as const;

export const HUMAN_REFERENCE_PILOT_BOUNDARY_ANNOTATION_GUIDE = `# Human Reference Annotation Guide

Guide identity: human-reference-material-annotation-guide@0.2.0

Judge each atomic requirement independently. Do not rate the Tutor response as
a whole, and do not require exact wording when the response states a clearly
equivalent meaning.

## SATISFIED

Use SATISFIED when the Tutor response explicitly satisfies the requirement or
states a clearly equivalent meaning.

## OMITTED_OR_INCOMPLETE

Use OMITTED_OR_INCOMPLETE when the requirement is not addressed or is only
partially addressed, and the response does not explicitly make a claim that is
incompatible with the requirement. Omission is not conflict.

## EXPLICIT_CONFLICT

Use EXPLICIT_CONFLICT when the response explicitly states a claim incompatible
with the requirement.

If a requirement says that evidence or a clue alone is insufficient to
establish X, statements such as "this evidence proves X", "this clue definitely
determines X", or "we know X from this clue alone" are EXPLICIT_CONFLICT. If the
Tutor merely does not mention the insufficiency limitation, use
OMITTED_OR_INCOMPLETE instead.

## Atomic independence

Evaluate each atomic requirement independently. Failure on one atomic does not
automatically imply failure on another, and must not be propagated across
atomics.

If one requirement asks only what clue X supports and the Tutor explains that
support, that atomic can be SATISFIED even when the Tutor overstates the clue's
strength. Judge whether clue X alone is sufficient only under the separate
evidence-sufficiency atomic, unless the first requirement itself includes an
evidential-strength limit. Do not cross-atomic double count.

## Evaluating the proposed meaning

For a requirement to "Evaluate the student's proposed meaning against the
surrounding context," the response must explicitly or equivalently connect the
student's proposed meaning with context evidence. Discussing a context clue
without connecting it back to the proposed interpretation is
OMITTED_OR_INCOMPLETE. Exact repetition of the student's words is not required,
but a recognizable semantic evaluation relation is required.

## Automatically correct or incorrect

"Do not treat the student's proposed meaning as automatically correct or
incorrect" prohibits an unsupported verdict made without contextual evaluation
or reasoning. It does not prohibit correcting, refining, or rejecting the
student's interpretation after explicitly analyzing the context.

Giving a final answer does not by itself create a conflict. A context-grounded
evaluation followed by a better meaning is not automatic rejection. By
contrast, an unsupported verdict such as "No, that is wrong; it means X" can be
EXPLICIT_CONFLICT.

## Evidence

Evidence is optional. When used, keep it short and quote or paraphrase only the
visible Tutor response. Do not provide hidden reasoning or speculate about
model intent.

## Blind annotation

Complete the submission independently. Do not consult another annotator,
developer expected labels, Judge output, Judge evidence or reasoning, benchmark
labels, or adjudications.
` as const;

const HUMAN_REFERENCE_PILOT_CASE_IDS = [
  "material-word-context-A",
  "material-word-context-B",
  "material-word-context-C",
] as const;

const HUMAN_REFERENCE_PILOT_BOUNDARY_CASE_IDS = [
  "human-word-context-boundary-A",
  "human-word-context-boundary-B",
  "human-word-context-boundary-C",
  "human-word-context-boundary-D",
  "human-word-context-boundary-E",
  "human-word-context-boundary-F",
] as const;

const HUMAN_REFERENCE_PILOT_BOUNDARY_RESPONSES = [
  "You proposed that reluctant means unsure. The pause before agreeing supports hesitation, so your interpretation fits the context, although that clue alone cannot distinguish unwillingness, uncertainty, or thinking.",
  "The pause before agreeing shows hesitation.",
  "The pause supports unwillingness, so it proves the character was unwilling.",
  "The pause before agreeing suggests that the character may be uncertain.",
  "Your proposed meaning, unsure, does not fit as well here: the pause suggests reluctance. Based on that context, a better meaning is unwilling.",
  "No, your interpretation is wrong; reluctant means unwilling.",
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

export const HUMAN_REFERENCE_WORD_CONTEXT_BOUNDARY_PILOT_SOURCE: HumanReferencePilotSource =
  Object.freeze({
    diagnosticId: "human-reference-atomic-boundary-diagnostic",
    diagnosticVersion: "0.1.0",
    fixtureId: HUMAN_REFERENCE_PILOT_BOUNDARY_FIXTURE_ID,
    fixtureVersion: "0.1.0",
    datasetId: TUTOR_EVAL_DATASET_ID,
    datasetVersion: TUTOR_EVAL_DATASET_VERSION,
    dataKind: "synthetic-fixture",
    fixture: syntheticFixture,
  });

interface HumanReferencePilotProfile {
  readonly fixtureId: HumanReferencePilotFixtureId;
  readonly defaultPilotId: string;
  readonly protocolVersion:
    | typeof HUMAN_REFERENCE_PILOT_PROTOCOL_VERSION
    | typeof HUMAN_REFERENCE_PILOT_BOUNDARY_PROTOCOL_VERSION;
  readonly annotationGuideId: typeof HUMAN_REFERENCE_PILOT_ANNOTATION_GUIDE_ID;
  readonly annotationGuideVersion:
    | typeof HUMAN_REFERENCE_PILOT_ANNOTATION_GUIDE_VERSION
    | typeof HUMAN_REFERENCE_PILOT_BOUNDARY_ANNOTATION_GUIDE_VERSION;
  readonly annotationGuide: string;
  readonly source: HumanReferencePilotSource;
  readonly caseIds: readonly string[];
  readonly atomicCount: number;
}

function profileFor(fixtureId: string): HumanReferencePilotProfile {
  if (fixtureId === HUMAN_REFERENCE_PILOT_FIXTURE_ID) {
    return {
      fixtureId,
      defaultPilotId: HUMAN_REFERENCE_PILOT_DEFAULT_ID,
      protocolVersion: HUMAN_REFERENCE_PILOT_PROTOCOL_VERSION,
      annotationGuideId: HUMAN_REFERENCE_PILOT_ANNOTATION_GUIDE_ID,
      annotationGuideVersion: HUMAN_REFERENCE_PILOT_ANNOTATION_GUIDE_VERSION,
      annotationGuide: HUMAN_REFERENCE_PILOT_ANNOTATION_GUIDE,
      source: HUMAN_REFERENCE_WORD_CONTEXT_PILOT_SOURCE,
      caseIds: HUMAN_REFERENCE_PILOT_CASE_IDS,
      atomicCount: 12,
    };
  }
  if (fixtureId === HUMAN_REFERENCE_PILOT_BOUNDARY_FIXTURE_ID) {
    return {
      fixtureId,
      defaultPilotId: HUMAN_REFERENCE_PILOT_BOUNDARY_DEFAULT_ID,
      protocolVersion: HUMAN_REFERENCE_PILOT_BOUNDARY_PROTOCOL_VERSION,
      annotationGuideId: HUMAN_REFERENCE_PILOT_ANNOTATION_GUIDE_ID,
      annotationGuideVersion: HUMAN_REFERENCE_PILOT_BOUNDARY_ANNOTATION_GUIDE_VERSION,
      annotationGuide: HUMAN_REFERENCE_PILOT_BOUNDARY_ANNOTATION_GUIDE,
      source: HUMAN_REFERENCE_WORD_CONTEXT_BOUNDARY_PILOT_SOURCE,
      caseIds: HUMAN_REFERENCE_PILOT_BOUNDARY_CASE_IDS,
      atomicCount: 24,
    };
  }
  return invalid();
}

export interface HumanReferencePilotExport {
  readonly pilotId: string;
  readonly batchId: string;
  readonly source: HumanReferencePilotSource;
  readonly taskSetFingerprint: string;
  readonly tasks: readonly HumanReferenceAnnotationTask[];
  readonly packets: readonly HumanReferencePilotPacket[];
  readonly templates: readonly HumanReferencePilotSubmissionTemplate[];
  readonly annotationGuide: string;
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
  const profile = profileFor(fixtureId);
  const fixtures = await loadMaterialRequirementDiagnosticFixtures();
  const fixture = fixtures.find((candidate) => candidate.id === HUMAN_REFERENCE_PILOT_FIXTURE_ID);
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
  const tasks = profile.fixtureId === HUMAN_REFERENCE_PILOT_FIXTURE_ID
    ? fixture.cases.map((fixtureCase) => visibleTaskProjection(fixtureCase.input))
    : HUMAN_REFERENCE_PILOT_BOUNDARY_CASE_IDS.map((caseId, index) => visibleTaskProjection({
      ...fixture.cases[0]!.input,
      caseId,
      tutorResponse: HUMAN_REFERENCE_PILOT_BOUNDARY_RESPONSES[index],
    }));
  if (
    new Set(tasks.map((task) => task.caseId)).size !== tasks.length ||
    tasks.reduce(
      (count, task) => count + task.rubrics.reduce(
        (rubricCount, rubric) => rubricCount + rubric.requirements.length,
        0,
      ),
      0,
    ) !== profile.atomicCount ||
    tasks.length !== profile.caseIds.length ||
    tasks.some((task, index) => task.caseId !== profile.caseIds[index])
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
  pilotId: string | undefined = undefined,
  fixtureId: HumanReferencePilotFixtureId = HUMAN_REFERENCE_PILOT_FIXTURE_ID,
): HumanReferencePilotExport {
  const profile = profileFor(fixtureId);
  const effectivePilotId = pilotId ?? profile.defaultPilotId;
  if (
    annotatorIds.length !== 2 ||
    new Set(annotatorIds).size !== 2 ||
    annotatorIds.some((annotatorId) => !opaqueId(annotatorId)) ||
    !opaqueId(effectivePilotId) ||
    tasks.length !== profile.caseIds.length
  ) {
    return invalid();
  }
  const parsedTasks = tasks.map((task) => parseHumanReferenceAnnotationTask(task));
  const taskSetFingerprint = humanReferencePilotTaskSetFingerprint(parsedTasks);
  const batchId = batchIdFor(effectivePilotId, taskSetFingerprint);
  const packets = annotatorIds.map((annotatorId) => parseHumanReferencePilotPacket({
    schemaVersion: HUMAN_REFERENCE_PILOT_SCHEMA_VERSION,
    packetKind: HUMAN_REFERENCE_PILOT_PACKET_KIND,
    pilotProtocolId: HUMAN_REFERENCE_PILOT_PROTOCOL_ID,
    pilotProtocolVersion: profile.protocolVersion,
    ...(profile.protocolVersion === HUMAN_REFERENCE_PILOT_BOUNDARY_PROTOCOL_VERSION ? {
      annotationGuideId: profile.annotationGuideId,
      annotationGuideVersion: profile.annotationGuideVersion,
    } : {}),
    pilotId: effectivePilotId,
    batchId,
    calibrationProtocolId: HUMAN_REFERENCE_PROTOCOL_ID,
    calibrationProtocolVersion: HUMAN_REFERENCE_PROTOCOL_VERSION,
    source: profile.source,
    taskSetFingerprint,
    annotatorId,
    tasks: parsedTasks,
  }));
  const templates = packets.map(buildHumanReferencePilotSubmissionTemplate);
  return {
    pilotId: effectivePilotId,
    batchId,
    source: profile.source,
    taskSetFingerprint,
    tasks: parsedTasks,
    packets,
    templates,
    annotationGuide: profile.annotationGuide,
  };
}

function compareAtomicIdentifiers(
  left: HumanReferencePilotSubmissionTemplateAnnotation,
  right: HumanReferencePilotSubmissionTemplateAnnotation,
): number {
  return left.caseId.localeCompare(right.caseId) ||
    left.rubricId.localeCompare(right.rubricId) ||
    left.requirementId.localeCompare(right.requirementId);
}

/**
 * Projects one packet into an editable submission document. The projection
 * allowlists only identity and atomic IDs; visible task evidence and any
 * diagnostic metadata never cross into the submission template.
 */
export function buildHumanReferencePilotSubmissionTemplate(
  packet: HumanReferencePilotPacket,
): HumanReferencePilotSubmissionTemplate {
  const parsedPacket = parseHumanReferencePilotPacket(packet);
  const annotations = parsedPacket.tasks.flatMap((task) =>
    task.rubrics.flatMap((rubric) =>
      rubric.requirements.map((requirement): HumanReferencePilotSubmissionTemplateAnnotation => ({
        caseId: task.caseId,
        rubricId: rubric.id,
        requirementId: requirement.id,
        status: "",
      })),
    ),
  ).sort(compareAtomicIdentifiers);
  return {
    schemaVersion: HUMAN_REFERENCE_PILOT_SCHEMA_VERSION,
    packetKind: HUMAN_REFERENCE_PILOT_SUBMISSION_KIND,
    pilotProtocolId: HUMAN_REFERENCE_PILOT_PROTOCOL_ID,
    pilotProtocolVersion: parsedPacket.pilotProtocolVersion,
    ...(parsedPacket.pilotProtocolVersion === HUMAN_REFERENCE_PILOT_BOUNDARY_PROTOCOL_VERSION ? {
      annotationGuideId: parsedPacket.annotationGuideId,
      annotationGuideVersion: parsedPacket.annotationGuideVersion,
    } : {}),
    pilotId: parsedPacket.pilotId,
    batchId: parsedPacket.batchId,
    calibrationProtocolId: parsedPacket.calibrationProtocolId,
    calibrationProtocolVersion: parsedPacket.calibrationProtocolVersion,
    taskSetFingerprint: parsedPacket.taskSetFingerprint,
    annotatorId: parsedPacket.annotatorId,
    dataKind: "human-annotation",
    annotations,
  };
}

export async function createHumanReferencePilotExport(
  annotatorIds: readonly string[],
  pilotId: string | undefined = undefined,
  fixtureId: HumanReferencePilotFixtureId = HUMAN_REFERENCE_PILOT_FIXTURE_ID,
): Promise<HumanReferencePilotExport> {
  return buildHumanReferencePilotExport(
    await loadHumanReferencePilotTasks(fixtureId),
    annotatorIds,
    pilotId,
    fixtureId,
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
  const profile = firstPacket === undefined ? undefined : profileFor(firstPacket.source.fixtureId);
  if (
    firstPacket === undefined ||
    secondPacket === undefined ||
    firstPacket.annotatorId === secondPacket.annotatorId ||
    profile === undefined ||
    !sameSource(firstPacket.source, profile.source) ||
    !sameSource(secondPacket.source, profile.source) ||
    firstPacket.pilotProtocolVersion !== profile.protocolVersion ||
    secondPacket.pilotProtocolVersion !== profile.protocolVersion ||
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
      submission.pilotProtocolVersion !== packet.pilotProtocolVersion ||
      (packet.pilotProtocolVersion === HUMAN_REFERENCE_PILOT_BOUNDARY_PROTOCOL_VERSION &&
        (submission.pilotProtocolVersion !== HUMAN_REFERENCE_PILOT_BOUNDARY_PROTOCOL_VERSION ||
          submission.annotationGuideId !== packet.annotationGuideId ||
          submission.annotationGuideVersion !== packet.annotationGuideVersion)) ||
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
