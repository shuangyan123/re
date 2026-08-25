import { createHash } from "node:crypto";

import { BenchmarkConfigurationError } from "../contracts/errors.js";
import {
  HUMAN_REFERENCE_PROTOCOL_ID,
  HUMAN_REFERENCE_PROTOCOL_VERSION,
  type HumanAtomicConfusionMatrix,
  type HumanAtomicIdentity,
  type HumanAtomicStatus,
  type HumanReferenceAdjudicationFile,
  type HumanReferenceAnnotationFile,
  type HumanReferenceAnnotationTask,
  type HumanReferenceProvenance,
} from "../contracts/human-reference-calibration.js";
import {
  parseHumanReferenceAdjudicationFile,
  parseHumanReferenceAnnotationFile,
  parseHumanReferenceAnnotationTask,
} from "../contracts/human-reference-calibration-validation.js";
import { humanReferencePilotTaskSetFingerprint } from "../contracts/human-reference-pilot-validation.js";
import {
  HUMAN_REFERENCE_SEMANTIC_AUDIT_ANNOTATIONS_KIND,
  HUMAN_REFERENCE_SEMANTIC_AUDIT_GUIDE_FINGERPRINT,
  HUMAN_REFERENCE_SEMANTIC_AUDIT_GUIDE_ID,
  HUMAN_REFERENCE_SEMANTIC_AUDIT_GUIDE_VERSION,
  HUMAN_REFERENCE_SEMANTIC_AUDIT_PACKET_KIND,
  HUMAN_REFERENCE_SEMANTIC_AUDIT_PROTOCOL_ID,
  HUMAN_REFERENCE_SEMANTIC_AUDIT_PROTOCOL_VERSION,
  HUMAN_REFERENCE_SEMANTIC_AUDIT_REPORT_KIND,
  HUMAN_REFERENCE_SEMANTIC_AUDIT_SCHEMA_VERSION,
  HUMAN_REFERENCE_SEMANTIC_AUDIT_SUBMISSION_KIND,
  type HumanReferenceSemanticAuditAgreement,
  type HumanReferenceSemanticAuditAnnotations,
  type HumanReferenceSemanticAuditAtomicAnnotation,
  type HumanReferenceSemanticAuditCase,
  type HumanReferenceSemanticAuditDisagreement,
  type HumanReferenceSemanticAuditPacket,
  type HumanReferenceSemanticAuditReport,
  type HumanReferenceSemanticAuditSubmission,
  type HumanReferenceSemanticAuditSubmissionTemplate,
  type SemanticAuditAgreementSummary,
} from "../contracts/human-reference-semantic-audit.js";
import {
  parseHumanReferenceSemanticAuditAnnotations,
  parseHumanReferenceSemanticAuditPacket,
  parseHumanReferenceSemanticAuditSubmission,
} from "../contracts/human-reference-semantic-audit-validation.js";
import { aggregateMaterialRequirementAssessments } from "../judge/material-requirement-aggregation.js";
import { humanAtomicIdentityKey } from "./human-reference-agreement.js";
import {
  assertHumanReferenceSetReady,
  deriveHumanReferenceRubricLabels,
} from "./human-reference-reference.js";
import { buildHumanReferenceSetFromFiles } from "./human-reference-report.js";

export const HUMAN_REFERENCE_SEMANTIC_AUDIT_INSTRUCTIONS = `# Human Reference Semantic Audit Instructions

Independently annotate every atomic requirement in the supplied packet.

Use the supplied frozen annotation guide. Do not seek prior annotations,
Human Reference statuses, disagreement or adjudication history, developer
expectations, derived labels, or Judge information. Do not infer that any
particular atom is under review. Evidence is optional and may quote or
paraphrase only the visible Tutor response.
` as const;

export interface HumanReferenceSemanticAuditExport {
  readonly packet: HumanReferenceSemanticAuditPacket;
  readonly template: HumanReferenceSemanticAuditSubmissionTemplate;
  readonly auditInstructions: typeof HUMAN_REFERENCE_SEMANTIC_AUDIT_INSTRUCTIONS;
}

function invalid(): never {
  throw new BenchmarkConfigurationError("human_reference_semantic_audit_invalid");
}

function same(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function guideFingerprint(guide: string): string {
  return `sha256:${createHash("sha256").update(guide, "utf8").digest("hex")}`;
}

function visibleTaskProjection(task: HumanReferenceAnnotationTask): HumanReferenceAnnotationTask {
  // 明确 allowlist 是 audit blindness 的边界；不得 spread 含状态或来源的对象。
  return parseHumanReferenceAnnotationTask({
    schemaVersion: task.schemaVersion,
    caseId: task.caseId,
    learningObjective: task.learningObjective,
    studentProfile: task.studentProfile,
    conversationHistory: task.conversationHistory,
    studentMessage: task.studentMessage,
    problemContext: task.problemContext,
    groundTruth: task.groundTruth,
    knownMisconception: task.knownMisconception,
    disclosurePolicy: task.disclosurePolicy,
    rubrics: task.rubrics.map((rubric) => ({
      id: rubric.id,
      criterion: rubric.criterion,
      requirements: rubric.requirements.map((requirement) => ({
        id: requirement.id,
        description: requirement.description,
      })),
    })),
    tutorResponse: task.tutorResponse,
  });
}

function sortedAtoms(tasks: readonly HumanReferenceAnnotationTask[]): HumanAtomicIdentity[] {
  return tasks.flatMap((task) => task.rubrics.flatMap((rubric) =>
    rubric.requirements.map((requirement) => ({
      caseId: task.caseId,
      rubricId: rubric.id,
      requirementId: requirement.id,
    })),
  )).sort((left, right) => humanAtomicIdentityKey(left).localeCompare(humanAtomicIdentityKey(right)));
}

function auditBatchId(
  sourceBatchId: string,
  taskSetFingerprint: string,
  reviewerId: string,
): string {
  const suffix = createHash("sha256")
    .update(JSON.stringify([sourceBatchId, taskSetFingerprint, reviewerId,
      HUMAN_REFERENCE_SEMANTIC_AUDIT_GUIDE_FINGERPRINT]), "utf8")
    .digest("hex")
    .slice(0, 16);
  return `semantic-audit-${suffix}`;
}

export function createHumanReferenceSemanticAuditExport(
  annotationValue: HumanReferenceAnnotationFile,
  reviewerId: string,
  annotationGuide: string,
): HumanReferenceSemanticAuditExport {
  const annotations = parseHumanReferenceAnnotationFile(annotationValue);
  if (
    !/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/u.test(reviewerId) || reviewerId.includes("@") ||
    annotations.requiredAnnotatorIds.includes(reviewerId) ||
    guideFingerprint(annotationGuide) !== HUMAN_REFERENCE_SEMANTIC_AUDIT_GUIDE_FINGERPRINT
  ) return invalid();
  const tasks = annotations.tasks.map(visibleTaskProjection);
  const taskSetFingerprint = humanReferencePilotTaskSetFingerprint(tasks);
  const sourceCalibration = {
    batchId: annotations.batchId,
    calibrationProtocolId: HUMAN_REFERENCE_PROTOCOL_ID,
    calibrationProtocolVersion: HUMAN_REFERENCE_PROTOCOL_VERSION,
    dataKind: annotations.dataKind,
    ...(annotations.fixture === undefined ? {} : { fixture: annotations.fixture }),
  } as const;
  const annotationGuideIdentity = {
    id: HUMAN_REFERENCE_SEMANTIC_AUDIT_GUIDE_ID,
    version: HUMAN_REFERENCE_SEMANTIC_AUDIT_GUIDE_VERSION,
    fingerprint: HUMAN_REFERENCE_SEMANTIC_AUDIT_GUIDE_FINGERPRINT,
  } as const;
  const packet = parseHumanReferenceSemanticAuditPacket({
    schemaVersion: HUMAN_REFERENCE_SEMANTIC_AUDIT_SCHEMA_VERSION,
    packetKind: HUMAN_REFERENCE_SEMANTIC_AUDIT_PACKET_KIND,
    auditProtocolId: HUMAN_REFERENCE_SEMANTIC_AUDIT_PROTOCOL_ID,
    auditProtocolVersion: HUMAN_REFERENCE_SEMANTIC_AUDIT_PROTOCOL_VERSION,
    auditBatchId: auditBatchId(annotations.batchId, taskSetFingerprint, reviewerId),
    reviewerId,
    sourceCalibration,
    taskSetFingerprint,
    annotationGuide: annotationGuideIdentity,
    tasks,
  });
  const template: HumanReferenceSemanticAuditSubmissionTemplate = {
    schemaVersion: HUMAN_REFERENCE_SEMANTIC_AUDIT_SCHEMA_VERSION,
    packetKind: HUMAN_REFERENCE_SEMANTIC_AUDIT_SUBMISSION_KIND,
    auditProtocolId: HUMAN_REFERENCE_SEMANTIC_AUDIT_PROTOCOL_ID,
    auditProtocolVersion: HUMAN_REFERENCE_SEMANTIC_AUDIT_PROTOCOL_VERSION,
    auditBatchId: packet.auditBatchId,
    reviewerId: packet.reviewerId,
    sourceCalibration: packet.sourceCalibration,
    taskSetFingerprint: packet.taskSetFingerprint,
    annotationGuide: packet.annotationGuide,
    annotations: sortedAtoms(packet.tasks).map((atom) => ({ ...atom, status: "" })),
  };
  return { packet, template, auditInstructions: HUMAN_REFERENCE_SEMANTIC_AUDIT_INSTRUCTIONS };
}

function assertSameEnvelope(
  packet: HumanReferenceSemanticAuditPacket,
  submission: HumanReferenceSemanticAuditSubmission,
): void {
  if (
    packet.auditBatchId !== submission.auditBatchId ||
    packet.reviewerId !== submission.reviewerId ||
    packet.taskSetFingerprint !== submission.taskSetFingerprint ||
    !same(packet.sourceCalibration, submission.sourceCalibration) ||
    !same(packet.annotationGuide, submission.annotationGuide)
  ) invalid();
}

export function importHumanReferenceSemanticAuditSubmission(
  packetValue: unknown,
  submissionValue: unknown,
): HumanReferenceSemanticAuditAnnotations {
  const packet = parseHumanReferenceSemanticAuditPacket(packetValue);
  const submission = parseHumanReferenceSemanticAuditSubmission(submissionValue);
  assertSameEnvelope(packet, submission);
  const expected = new Map(sortedAtoms(packet.tasks).map((atom) => [humanAtomicIdentityKey(atom), atom]));
  const observed = new Set<string>();
  for (const annotation of submission.annotations) {
    const key = humanAtomicIdentityKey(annotation);
    if (!expected.has(key) || observed.has(key)) invalid();
    observed.add(key);
  }
  if (observed.size !== expected.size) invalid();
  const annotations = [...submission.annotations].sort((left, right) =>
    humanAtomicIdentityKey(left).localeCompare(humanAtomicIdentityKey(right)),
  );
  return parseHumanReferenceSemanticAuditAnnotations({
    schemaVersion: HUMAN_REFERENCE_SEMANTIC_AUDIT_SCHEMA_VERSION,
    dataKind: packet.sourceCalibration.dataKind,
    ...(packet.sourceCalibration.fixture === undefined
      ? {}
      : { fixture: packet.sourceCalibration.fixture }),
    annotationKind: HUMAN_REFERENCE_SEMANTIC_AUDIT_ANNOTATIONS_KIND,
    auditProtocolId: HUMAN_REFERENCE_SEMANTIC_AUDIT_PROTOCOL_ID,
    auditProtocolVersion: HUMAN_REFERENCE_SEMANTIC_AUDIT_PROTOCOL_VERSION,
    auditBatchId: packet.auditBatchId,
    reviewerId: packet.reviewerId,
    sourceCalibration: packet.sourceCalibration,
    taskSetFingerprint: packet.taskSetFingerprint,
    annotationGuide: packet.annotationGuide,
    annotations,
  });
}

function emptyMatrix(): Record<HumanAtomicStatus, Record<HumanAtomicStatus, number>> {
  const row = (): Record<HumanAtomicStatus, number> => ({
    SATISFIED: 0,
    OMITTED_OR_INCOMPLETE: 0,
    EXPLICIT_CONFLICT: 0,
  });
  return { SATISFIED: row(), OMITTED_OR_INCOMPLETE: row(), EXPLICIT_CONFLICT: row() };
}

function summary(comparableAtomicCount: number, agreementCount: number): SemanticAuditAgreementSummary {
  return {
    comparableAtomicCount,
    agreementCount,
    disagreementCount: comparableAtomicCount - agreementCount,
    agreementShare: comparableAtomicCount === 0 ? null : agreementCount / comparableAtomicCount,
  };
}

function groupSummaries(
  entries: readonly { readonly group: string; readonly agreed: boolean }[],
): Readonly<Record<string, SemanticAuditAgreementSummary>> {
  const counts = new Map<string, { comparable: number; agreement: number }>();
  for (const entry of entries) {
    const count = counts.get(entry.group) ?? { comparable: 0, agreement: 0 };
    count.comparable += 1;
    if (entry.agreed) count.agreement += 1;
    counts.set(entry.group, count);
  }
  return Object.fromEntries([...counts].sort(([left], [right]) => left.localeCompare(right))
    .map(([key, count]) => [key, summary(count.comparable, count.agreement)]));
}

function auditDerivedLabels(
  tasks: readonly HumanReferenceAnnotationTask[],
  auditByKey: ReadonlyMap<string, HumanReferenceSemanticAuditAtomicAnnotation>,
): Map<string, "PASS" | "PARTIAL" | "FAIL"> {
  const labels = new Map<string, "PASS" | "PARTIAL" | "FAIL">();
  for (const task of tasks) {
    for (const rubric of task.rubrics) {
      const assessments = rubric.requirements.map((requirement) => {
        const value = auditByKey.get(humanAtomicIdentityKey({
          caseId: task.caseId,
          rubricId: rubric.id,
          requirementId: requirement.id,
        }));
        if (value === undefined) return invalid();
        return { status: value.status };
      });
      labels.set(JSON.stringify([task.caseId, rubric.id]),
        aggregateMaterialRequirementAssessments(assessments));
    }
  }
  return labels;
}

export function buildHumanReferenceSemanticAuditReport(
  annotationValue: HumanReferenceAnnotationFile,
  adjudicationValue: HumanReferenceAdjudicationFile,
  auditValue: HumanReferenceSemanticAuditAnnotations,
): HumanReferenceSemanticAuditReport {
  const annotations = parseHumanReferenceAnnotationFile(annotationValue);
  const adjudications = parseHumanReferenceAdjudicationFile(adjudicationValue);
  const audit = parseHumanReferenceSemanticAuditAnnotations(auditValue);
  const reference = buildHumanReferenceSetFromFiles(annotations, adjudications);
  assertHumanReferenceSetReady(reference);
  const fingerprint = humanReferencePilotTaskSetFingerprint(reference.tasks);
  if (
    audit.sourceCalibration.batchId !== annotations.batchId ||
    audit.sourceCalibration.calibrationProtocolId !== annotations.calibrationProtocolId ||
    audit.sourceCalibration.calibrationProtocolVersion !== annotations.calibrationProtocolVersion ||
    audit.sourceCalibration.dataKind !== annotations.dataKind ||
    !same(audit.sourceCalibration.fixture, annotations.fixture) ||
    audit.taskSetFingerprint !== fingerprint
  ) invalid();

  const planned = sortedAtoms(reference.tasks);
  const auditByKey = new Map<string, HumanReferenceSemanticAuditAtomicAnnotation>();
  for (const annotation of audit.annotations) {
    const key = humanAtomicIdentityKey(annotation);
    if (auditByKey.has(key)) invalid();
    auditByKey.set(key, annotation);
  }
  if (auditByKey.size !== planned.length || planned.some((atom) => !auditByKey.has(humanAtomicIdentityKey(atom)))) {
    return invalid();
  }
  const referenceByKey = new Map(reference.references.map((item) => [humanAtomicIdentityKey(item), item]));
  const matrix = emptyMatrix();
  const disagreements: HumanReferenceSemanticAuditDisagreement[] = [];
  const grouping: { requirement: string; provenance: HumanReferenceProvenance; caseId: string; agreed: boolean }[] = [];
  let agreementCount = 0;
  for (const atom of planned) {
    const key = humanAtomicIdentityKey(atom);
    const frozen = referenceByKey.get(key);
    const audited = auditByKey.get(key);
    if (frozen === undefined || audited === undefined) return invalid();
    const agreed = frozen.status === audited.status;
    matrix[frozen.status][audited.status] += 1;
    if (agreed) agreementCount += 1;
    else disagreements.push({
      ...atom,
      frozenReferenceStatus: frozen.status,
      frozenReferenceProvenance: frozen.provenance,
      auditStatus: audited.status,
      ...(audited.evidence === undefined ? {} : { auditEvidence: audited.evidence }),
    });
    grouping.push({ requirement: atom.requirementId, provenance: frozen.provenance, caseId: atom.caseId, agreed });
  }
  const overall = summary(planned.length, agreementCount);
  const semanticAuditAgreement: HumanReferenceSemanticAuditAgreement = {
    ...overall,
    confusionMatrix: matrix as HumanAtomicConfusionMatrix,
    disagreements,
  };
  const perRequirement = groupSummaries(grouping.map((item) => ({ group: item.requirement, agreed: item.agreed })));
  const provenance = groupSummaries(grouping.map((item) => ({ group: item.provenance, agreed: item.agreed })));
  const perCase: HumanReferenceSemanticAuditCase[] = [...new Set(grouping.map((item) => item.caseId))]
    .sort((left, right) => left.localeCompare(right))
    .map((caseId) => {
      const items = grouping.filter((item) => item.caseId === caseId);
      return {
        caseId,
        ...summary(items.length, items.filter((item) => item.agreed).length),
        disagreements: disagreements.filter((item) => item.caseId === caseId),
      };
    });

  const frozenLabels = new Map(deriveHumanReferenceRubricLabels(reference)
    .map((item) => [JSON.stringify([item.caseId, item.rubricId]), item]));
  const auditLabels = auditDerivedLabels(reference.tasks, auditByKey);
  const derivedDisagreements = [...frozenLabels.entries()].flatMap(([key, frozen]) => {
    const auditLabel = auditLabels.get(key);
    if (auditLabel === undefined) return invalid();
    return auditLabel === frozen.label ? [] : [{
      caseId: frozen.caseId,
      rubricId: frozen.rubricId,
      frozenReferenceLabel: frozen.label,
      auditLabel,
    }];
  });
  const comparableRubricCount = frozenLabels.size;
  const derivedAgreementCount = comparableRubricCount - derivedDisagreements.length;
  return {
    schemaVersion: HUMAN_REFERENCE_SEMANTIC_AUDIT_SCHEMA_VERSION,
    reportKind: HUMAN_REFERENCE_SEMANTIC_AUDIT_REPORT_KIND,
    auditProtocolId: HUMAN_REFERENCE_SEMANTIC_AUDIT_PROTOCOL_ID,
    auditProtocolVersion: HUMAN_REFERENCE_SEMANTIC_AUDIT_PROTOCOL_VERSION,
    calibrationProtocolId: reference.calibrationProtocolId,
    calibrationProtocolVersion: reference.calibrationProtocolVersion,
    dataKind: reference.dataKind,
    reviewerId: audit.reviewerId,
    plannedAtomicCount: planned.length,
    comparableAtomicCount: overall.comparableAtomicCount,
    agreementCount: overall.agreementCount,
    disagreementCount: overall.disagreementCount,
    agreementShare: overall.agreementShare,
    semanticAuditAgreement,
    referenceProvenanceAgreement: {
      human_consensus: provenance.human_consensus ?? summary(0, 0),
      human_adjudicated: provenance.human_adjudicated ?? summary(0, 0),
    },
    perRequirement,
    perCase,
    derivedLabelAgreement: {
      comparableRubricCount,
      agreementCount: derivedAgreementCount,
      disagreementCount: derivedDisagreements.length,
      agreementShare: comparableRubricCount === 0 ? null : derivedAgreementCount / comparableRubricCount,
      disagreements: derivedDisagreements,
    },
    limitations: [
      "Semantic-audit disagreement identifies a reference review candidate, not an automatic reference error.",
      "The independent reviewer does not replace or mutate the frozen Human Reference.",
      "Agreement is diagnostic and is not an accuracy, gold-label, or Judge-calibration claim.",
    ],
  };
}
