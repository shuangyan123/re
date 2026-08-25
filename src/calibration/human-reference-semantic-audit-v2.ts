import { createHash } from "node:crypto";

import { BenchmarkConfigurationError } from "../contracts/errors.js";
import {
  HUMAN_REFERENCE_PROTOCOL_ID,
  HUMAN_REFERENCE_PROTOCOL_VERSION,
  type HumanAtomicIdentity,
  type HumanAtomicStatus,
  type HumanReferenceAdjudicationFile,
  type HumanReferenceAnnotationFile,
  type HumanReferenceAnnotationTask,
} from "../contracts/human-reference-calibration.js";
import { parseHumanReferenceAnnotationFile } from "../contracts/human-reference-calibration-validation.js";
import { humanReferencePilotTaskSetFingerprint } from "../contracts/human-reference-pilot-validation.js";
import {
  HUMAN_REFERENCE_SEMANTIC_AUDIT_ANNOTATIONS_KIND,
  HUMAN_REFERENCE_SEMANTIC_AUDIT_GUIDE_FINGERPRINT,
  HUMAN_REFERENCE_SEMANTIC_AUDIT_GUIDE_ID,
  HUMAN_REFERENCE_SEMANTIC_AUDIT_GUIDE_VERSION,
  HUMAN_REFERENCE_SEMANTIC_AUDIT_PROTOCOL_ID,
  HUMAN_REFERENCE_SEMANTIC_AUDIT_PROTOCOL_VERSION,
  HUMAN_REFERENCE_SEMANTIC_AUDIT_SCHEMA_VERSION,
  type HumanReferenceSemanticAuditAnnotations,
} from "../contracts/human-reference-semantic-audit.js";
import {
  HUMAN_REFERENCE_SEMANTIC_AUDIT_V2_ANNOTATIONS_KIND,
  HUMAN_REFERENCE_SEMANTIC_AUDIT_V2_LOCALIZATION_ID,
  HUMAN_REFERENCE_SEMANTIC_AUDIT_V2_LOCALIZATION_VERSION,
  HUMAN_REFERENCE_SEMANTIC_AUDIT_V2_LOCALIZED_GUIDE_ID,
  HUMAN_REFERENCE_SEMANTIC_AUDIT_V2_LOCALIZED_GUIDE_VERSION,
  HUMAN_REFERENCE_SEMANTIC_AUDIT_V2_LOCALE,
  HUMAN_REFERENCE_SEMANTIC_AUDIT_V2_PACKET_KIND,
  HUMAN_REFERENCE_SEMANTIC_AUDIT_V2_PROTOCOL_ID,
  HUMAN_REFERENCE_SEMANTIC_AUDIT_V2_PROTOCOL_VERSION,
  HUMAN_REFERENCE_SEMANTIC_AUDIT_V2_QUALIFICATION_ID,
  HUMAN_REFERENCE_SEMANTIC_AUDIT_V2_QUALIFICATION_PACKET_KIND,
  HUMAN_REFERENCE_SEMANTIC_AUDIT_V2_QUALIFICATION_RESULT_KIND,
  HUMAN_REFERENCE_SEMANTIC_AUDIT_V2_QUALIFICATION_SUBMISSION_KIND,
  HUMAN_REFERENCE_SEMANTIC_AUDIT_V2_QUALIFICATION_VERSION,
  HUMAN_REFERENCE_SEMANTIC_AUDIT_V2_REPORT_KIND,
  HUMAN_REFERENCE_SEMANTIC_AUDIT_V2_SCHEMA_VERSION,
  HUMAN_REFERENCE_SEMANTIC_AUDIT_V2_SUBMISSION_KIND,
  type HumanReferenceQualifiedSemanticAuditAnnotations,
  type HumanReferenceQualifiedSemanticAuditPacket,
  type HumanReferenceQualifiedSemanticAuditReport,
  type HumanReferenceQualifiedSemanticAuditSubmission,
  type HumanReferenceQualifiedSemanticAuditSubmissionTemplate,
  type HumanReferenceSemanticAuditLocalizationDefinition,
  type HumanReferenceSemanticAuditLocalizationIdentity,
  type ReviewerQualificationAtomicAssessment,
  type ReviewerQualificationBinding,
  type ReviewerQualificationItem,
  type ReviewerQualificationPacket,
  type ReviewerQualificationResult,
  type ReviewerQualificationSubmission,
  type ReviewerQualificationSubmissionTemplate,
} from "../contracts/human-reference-semantic-audit-v2.js";
import {
  localizedPresentationFingerprint,
  localizedTaskFingerprint,
  qualificationFingerprint,
  renderLocalizedSemanticAuditReview,
  renderReviewerQualificationReview,
} from "../contracts/human-reference-semantic-audit-v2-presentation.js";
import {
  parseHumanReferenceQualifiedSemanticAuditAnnotations,
  parseHumanReferenceQualifiedSemanticAuditPacket,
  parseHumanReferenceQualifiedSemanticAuditSubmission,
  parseReviewerQualificationPacket,
  parseReviewerQualificationResult,
  parseReviewerQualificationSubmission,
} from "../contracts/human-reference-semantic-audit-v2-validation.js";
import { humanAtomicIdentityKey } from "./human-reference-agreement.js";
import { buildHumanReferenceSemanticAuditReport } from "./human-reference-semantic-audit.js";

export const HUMAN_REFERENCE_SEMANTIC_AUDIT_PILOT_2_SOURCE_TASK_FINGERPRINT =
  "sha256:2e73aa96062b00908fe9f329e744cf91cb3f127865bce02ea33356069bb09285" as const;
export const HUMAN_REFERENCE_SEMANTIC_AUDIT_ZH_CN_LOCALIZED_GUIDE_FINGERPRINT =
  "sha256:346a18d21cfdf6989081456481cdce7d257060c7ff8f1ff9d4e1d2a4f94d624f" as const;
export const HUMAN_REFERENCE_SEMANTIC_AUDIT_ZH_CN_LOCALIZED_TASK_FINGERPRINT =
  "sha256:c8d5343fc1d41d42c1d1ad928967dd44de03afd8fc5fcc1dbc6328edabb53a18" as const;
export const HUMAN_REFERENCE_SEMANTIC_AUDIT_ZH_CN_PRESENTATION_FINGERPRINT =
  "sha256:e92fbc2182bfc544b2499e17673b9e1c2cf902eab8dc555388b6ee6fb3e1f661" as const;
export const HUMAN_REFERENCE_SEMANTIC_AUDIT_QUALIFICATION_FINGERPRINT =
  "sha256:65f43e191a04301ef83b796af5395ffb46f3a6ae143bf4ea983d8a2439cdb291" as const;

export const HUMAN_REFERENCE_SEMANTIC_AUDIT_ZH_CN_GUIDE = `# Human Reference 语义审计标注指南

指南身份：human-reference-material-annotation-guide-zh-CN@0.1.0

请逐项独立判断每个原子要求，不要把 Tutor 回答作为一个整体打分。若回答表达了明确等价的含义，无需逐字一致。

## SATISFIED

当 Tutor 回答明确满足要求，或表达了清楚等价的含义时，选择 SATISFIED。

## OMITTED_OR_INCOMPLETE

当要求没有被提及或只被部分处理，并且回答没有明确提出与要求不相容的主张时，选择 OMITTED_OR_INCOMPLETE。遗漏不等于冲突。

## EXPLICIT_CONFLICT

当回答明确提出与要求不相容的主张时，选择 EXPLICIT_CONFLICT。

如果要求说明某项证据或线索本身不足以确定某个结论，而回答声称“这项证据证明了该结论”“仅凭这条线索就能确定”或“从这条线索即可知道”，则可判为 EXPLICIT_CONFLICT。若 Tutor 只是没有说明证据不足这一限制，应选择 OMITTED_OR_INCOMPLETE。

## 原子要求相互独立

每个原子要求必须独立判断。一个原子要求未通过，不会自动使另一个原子要求未通过，也不得把某一项的状态传播到其他项。

如果一项要求只询问某条线索支持什么，而 Tutor 对这种支持关系作出解释，那么即使 Tutor 在另一处夸大了线索的证明力，该项仍可为 SATISFIED。只有在单独的证据充分性原子要求下，才判断该线索本身是否足够；除非前一要求自身也包含证据强度限制。不要跨原子重复计入同一问题。

## 评估学生提出的含义

若要求是“根据周围上下文评估学生提出的含义”，回答必须明确或以等价方式把学生提出的解释与上下文证据连接起来。只讨论上下文线索、却没有联系学生的解释，应判为 OMITTED_OR_INCOMPLETE。无需逐字复述学生的话，但必须存在可辨认的语义评估关系。

## 不要自动判定正确或错误

“不要把学生提出的含义自动视为正确或错误”所禁止的是：没有上下文评估或理由就直接下结论。它不禁止在明确分析上下文后纠正、细化或否定学生的解释。

给出最终答案本身不会造成冲突。先依据上下文评估，再提出更合适的含义，不属于自动否定。相反，没有支持理由就直接说“错了，意思是某某”，可判为 EXPLICIT_CONFLICT。

## 证据

证据为可选项。若填写，应保持简短，并且只能引用或转述可见的 Tutor 回答。不要提供隐藏推理，也不要猜测模型意图。

## 盲态复核

请独立完成提交。不要查阅其他标注者、开发者预期状态、Judge 输出、Judge 证据或推理、基准标签或裁决信息。
` as const;

const qualificationItems: readonly ReviewerQualificationItem[] = Object.freeze([
  {
    itemId: "qualification-omission-negative",
    evidence: "护理说明写明：幼苗每天需要浇水，也需要充足日照。",
    response: "请把幼苗放在有充足日照的位置。",
    requirements: [
      { requirementId: "Q1", description: "说明幼苗每天需要浇水。" },
      { requirementId: "Q2", description: "不要声称每周浇水一次就足够。" },
    ],
  },
  {
    itemId: "qualification-support-sufficiency",
    evidence: "打开加热器后，室温从 18°C 升到 20°C；同时没有记录窗户和日照变化。",
    response: "升温支持加热器可能使房间变暖，而且这已经证明升温只能由加热器造成。",
    requirements: [
      { requirementId: "Q1", description: "说明观测到的升温支持加热器可能使房间变暖。" },
      { requirementId: "Q2", description: "说明仅凭这次观测不足以确定升温只能由加热器造成。" },
    ],
  },
  {
    itemId: "qualification-contextual-correction",
    evidence: "路线图标明：过桥后小径向东转。学生猜测应向西走。",
    response: "路线图写的是过桥后向东转，所以向西的猜测不符合图中线索；这里应向东走。",
    requirements: [
      { requirementId: "Q1", description: "把学生提出的方向与路线图证据联系起来评估。" },
      { requirementId: "Q2", description: "不要在没有上下文评估的情况下直接判定学生错误。" },
    ],
  },
  {
    itemId: "qualification-unsupported-verdict",
    evidence: "路线图标明：过桥后小径向东转。学生猜测应向西走。",
    response: "错了，应该向东走。",
    requirements: [
      { requirementId: "Q1", description: "把学生提出的方向与路线图证据联系起来评估。" },
      { requirementId: "Q2", description: "不要在没有上下文评估的情况下直接判定学生错误。" },
    ],
  },
] as const);

const qualificationExpected = new Map<string, HumanAtomicStatus>([
  [JSON.stringify(["qualification-omission-negative", "qualification-omission-negative", "Q1"]),
    "OMITTED_OR_INCOMPLETE"],
  [JSON.stringify(["qualification-omission-negative", "qualification-omission-negative", "Q2"]), "SATISFIED"],
  [JSON.stringify(["qualification-support-sufficiency", "qualification-support-sufficiency", "Q1"]), "SATISFIED"],
  [JSON.stringify(["qualification-support-sufficiency", "qualification-support-sufficiency", "Q2"]),
    "EXPLICIT_CONFLICT"],
  [JSON.stringify(["qualification-contextual-correction", "qualification-contextual-correction", "Q1"]), "SATISFIED"],
  [JSON.stringify(["qualification-contextual-correction", "qualification-contextual-correction", "Q2"]), "SATISFIED"],
  [JSON.stringify(["qualification-unsupported-verdict", "qualification-unsupported-verdict", "Q1"]),
    "OMITTED_OR_INCOMPLETE"],
  [JSON.stringify(["qualification-unsupported-verdict", "qualification-unsupported-verdict", "Q2"]),
    "EXPLICIT_CONFLICT"],
]);

const localizedResponses = new Map<string, string>([
  ["You proposed that reluctant means unsure. The pause before agreeing supports hesitation, so your interpretation fits the context, although that clue alone cannot distinguish unwillingness, uncertainty, or thinking.",
    "你认为 reluctant 表示“不太确定”。同意前的停顿支持“犹豫”这一判断，所以你的解释与上下文相符；不过，仅凭这条线索无法区分人物是不愿意、不确定，还是只是在思考。"],
  ["The pause before agreeing shows hesitation.", "同意前的停顿表明人物有所犹豫。"],
  ["The pause supports unwillingness, so it proves the character was unwilling.",
    "停顿支持人物不愿意，因此它证明人物当时就是不愿意。"],
  ["The pause before agreeing suggests that the character may be uncertain.",
    "同意前的停顿说明人物可能不太确定。"],
  ["Your proposed meaning, unsure, does not fit as well here: the pause suggests reluctance. Based on that context, a better meaning is unwilling.",
    "你提出的“不太确定”在这里不太符合上下文：停顿更像是在表现不情愿。根据这条上下文线索，更合适的含义是“不愿意”。"],
  ["No, your interpretation is wrong; reluctant means unwilling.",
    "不对，你的解释错了；reluctant 的意思是“不愿意”。"],
]);

const localizedRequirements = new Map<string, string>([
  ["Evaluate the student's proposed meaning against the surrounding context.",
    "根据周围上下文评估学生提出的词义。"],
  ["Explain what the pause-before-agreeing clue supports.",
    "说明“同意前停顿”这一线索支持什么。"],
  ["State that the pause-before-agreeing clue alone is insufficient to determine whether the character is unwilling, uncertain, or simply thinking before agreeing.",
    "说明仅凭“同意前停顿”这一线索，不足以确定人物是不愿意、不确定，还是只是在同意前思考。"],
  ["Do not treat the student's proposed meaning as automatically correct or incorrect.",
    "不要把学生提出的词义自动视为正确或错误。"],
]);

function invalid(): never {
  throw new BenchmarkConfigurationError("human_reference_semantic_audit_invalid");
}

function hash(value: string): string {
  return `sha256:${createHash("sha256").update(value, "utf8").digest("hex")}`;
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (typeof value === "object" && value !== null) {
    return `{${Object.entries(value).sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function same(left: unknown, right: unknown): boolean {
  return canonicalJson(left) === canonicalJson(right);
}

function sortedAtoms(tasks: readonly HumanReferenceAnnotationTask[]): HumanAtomicIdentity[] {
  return tasks.flatMap((task) => task.rubrics.flatMap((rubric) => rubric.requirements.map((requirement) => ({
    caseId: task.caseId,
    rubricId: rubric.id,
    requirementId: requirement.id,
  })))).sort((left, right) => humanAtomicIdentityKey(left).localeCompare(humanAtomicIdentityKey(right)));
}

function resultFingerprint(value: Omit<ReviewerQualificationResult, "resultFingerprint">): string {
  return hash(`${canonicalJson(value)}\n`);
}

export function buildOfficialZhCnSemanticAuditLocalization(
  sourceTasks: readonly HumanReferenceAnnotationTask[],
): HumanReferenceSemanticAuditLocalizationDefinition {
  if (humanReferencePilotTaskSetFingerprint(sourceTasks) !==
    HUMAN_REFERENCE_SEMANTIC_AUDIT_PILOT_2_SOURCE_TASK_FINGERPRINT) {
    return invalid();
  }
  const localizedTasks = sourceTasks.map((task): HumanReferenceAnnotationTask => ({
    schemaVersion: task.schemaVersion,
    caseId: task.caseId,
    learningObjective: "使用上下文线索评估学生提出的词义；若上下文指向其他含义则予以纠正，并请学生找出支持判断的线索。",
    studentProfile: "{\"knownConcepts\":[\"句子意思\"],\"misconceptions\":[],\"level\":\"小学高年级\",\"goal\":\"推断词语的意思\"}",
    conversationHistory: "[]",
    studentMessage: "我觉得 reluctant 是“不太确定”的意思，但又不是完全有把握。",
    problemContext: "周围的句子写到人物在同意之前停顿了一下。",
    groundTruth: "{\"requiredConcepts\":[\"上下文\",\"reluctant\",\"不愿意\",\"犹豫\"]}",
    knownMisconception: "学生把 reluctant 理解成“不太确定”，但同意前停顿的线索更支持“不愿意”或“犹豫”。",
    disclosurePolicy: "no_answer",
    rubrics: task.rubrics.map((rubric) => ({
      id: rubric.id,
      criterion: "根据周围上下文评估学生提出的词义；说明“同意前停顿”这一线索支持什么、单凭它不能确定什么；不要把学生的猜测自动视为正确或错误。",
      requirements: rubric.requirements.map((requirement) => ({
        id: requirement.id,
        description: localizedRequirements.get(requirement.description) ?? invalid(),
      })),
    })),
    tutorResponse: localizedResponses.get(task.tutorResponse) ?? invalid(),
  }));
  if (hash(HUMAN_REFERENCE_SEMANTIC_AUDIT_ZH_CN_GUIDE) !==
      HUMAN_REFERENCE_SEMANTIC_AUDIT_ZH_CN_LOCALIZED_GUIDE_FINGERPRINT ||
    localizedTaskFingerprint(localizedTasks) !==
      HUMAN_REFERENCE_SEMANTIC_AUDIT_ZH_CN_LOCALIZED_TASK_FINGERPRINT ||
    localizedPresentationFingerprint(localizedTasks) !==
      HUMAN_REFERENCE_SEMANTIC_AUDIT_ZH_CN_PRESENTATION_FINGERPRINT) return invalid();
  return {
    identity: {
      locale: HUMAN_REFERENCE_SEMANTIC_AUDIT_V2_LOCALE,
      localizationId: HUMAN_REFERENCE_SEMANTIC_AUDIT_V2_LOCALIZATION_ID,
      localizationVersion: HUMAN_REFERENCE_SEMANTIC_AUDIT_V2_LOCALIZATION_VERSION,
      sourceAnnotationGuide: {
        id: HUMAN_REFERENCE_SEMANTIC_AUDIT_GUIDE_ID,
        version: HUMAN_REFERENCE_SEMANTIC_AUDIT_GUIDE_VERSION,
        fingerprint: HUMAN_REFERENCE_SEMANTIC_AUDIT_GUIDE_FINGERPRINT,
      },
      localizedAnnotationGuide: {
        id: HUMAN_REFERENCE_SEMANTIC_AUDIT_V2_LOCALIZED_GUIDE_ID,
        version: HUMAN_REFERENCE_SEMANTIC_AUDIT_V2_LOCALIZED_GUIDE_VERSION,
        fingerprint: HUMAN_REFERENCE_SEMANTIC_AUDIT_ZH_CN_LOCALIZED_GUIDE_FINGERPRINT,
      },
    },
    localizedGuide: HUMAN_REFERENCE_SEMANTIC_AUDIT_ZH_CN_GUIDE,
    localizedTasks,
  };
}

export function buildSemanticAuditLocalizationIdentity(
  sourceTasks: readonly HumanReferenceAnnotationTask[],
  definition: HumanReferenceSemanticAuditLocalizationDefinition,
): HumanReferenceSemanticAuditLocalizationIdentity {
  const sourceAtoms = sortedAtoms(sourceTasks);
  const localizedAtoms = sortedAtoms(definition.localizedTasks);
  if (!same(sourceAtoms, localizedAtoms) ||
    hash(definition.localizedGuide) !== definition.identity.localizedAnnotationGuide.fingerprint) return invalid();
  return {
    ...definition.identity,
    sourceTaskFingerprint: humanReferencePilotTaskSetFingerprint(sourceTasks),
    localizedTaskFingerprint: localizedTaskFingerprint(definition.localizedTasks),
    localizedPresentationFingerprint: localizedPresentationFingerprint(definition.localizedTasks),
  };
}

export interface ReviewerQualificationExport {
  readonly packet: ReviewerQualificationPacket;
  readonly template: ReviewerQualificationSubmissionTemplate;
  readonly reviewDocument: string;
}

export function createReviewerQualificationExport(
  reviewerId: string,
  localization: HumanReferenceSemanticAuditLocalizationIdentity,
): ReviewerQualificationExport {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/u.test(reviewerId) || reviewerId.includes("@")) return invalid();
  const fixtureFingerprint = qualificationFingerprint(qualificationItems);
  if (fixtureFingerprint !== HUMAN_REFERENCE_SEMANTIC_AUDIT_QUALIFICATION_FINGERPRINT) return invalid();
  const qualificationBatchId = `reviewer-qualification-${hash(JSON.stringify([
    reviewerId, localization, fixtureFingerprint,
  ])).slice("sha256:".length, "sha256:".length + 16)}`;
  const packet = parseReviewerQualificationPacket({
    schemaVersion: HUMAN_REFERENCE_SEMANTIC_AUDIT_V2_SCHEMA_VERSION,
    packetKind: HUMAN_REFERENCE_SEMANTIC_AUDIT_V2_QUALIFICATION_PACKET_KIND,
    auditProtocolId: HUMAN_REFERENCE_SEMANTIC_AUDIT_V2_PROTOCOL_ID,
    auditProtocolVersion: HUMAN_REFERENCE_SEMANTIC_AUDIT_V2_PROTOCOL_VERSION,
    reviewerId,
    qualificationId: HUMAN_REFERENCE_SEMANTIC_AUDIT_V2_QUALIFICATION_ID,
    qualificationVersion: HUMAN_REFERENCE_SEMANTIC_AUDIT_V2_QUALIFICATION_VERSION,
    qualificationBatchId,
    qualificationFingerprint: fixtureFingerprint,
    localization,
    items: qualificationItems,
  });
  const template: ReviewerQualificationSubmissionTemplate = {
    schemaVersion: packet.schemaVersion,
    packetKind: HUMAN_REFERENCE_SEMANTIC_AUDIT_V2_QUALIFICATION_SUBMISSION_KIND,
    auditProtocolId: packet.auditProtocolId,
    auditProtocolVersion: packet.auditProtocolVersion,
    reviewerId: packet.reviewerId,
    qualificationId: packet.qualificationId,
    qualificationVersion: packet.qualificationVersion,
    qualificationBatchId: packet.qualificationBatchId,
    qualificationFingerprint: packet.qualificationFingerprint,
    localization: packet.localization,
    assessments: packet.items.flatMap((item) => item.requirements.map((requirement) => ({
      caseId: item.itemId,
      rubricId: item.itemId,
      requirementId: requirement.requirementId,
      status: "" as const,
    }))),
  };
  return {
    packet,
    template,
    reviewDocument: renderReviewerQualificationReview(packet.items),
  };
}

function sameQualificationEnvelope(packet: ReviewerQualificationPacket, submission: ReviewerQualificationSubmission): boolean {
  return packet.reviewerId === submission.reviewerId && packet.qualificationBatchId === submission.qualificationBatchId &&
    packet.qualificationFingerprint === submission.qualificationFingerprint && same(packet.localization, submission.localization);
}

export function evaluateReviewerQualification(
  packetValue: unknown,
  submissionValue: unknown,
): ReviewerQualificationResult {
  const packet = parseReviewerQualificationPacket(packetValue);
  const submission = parseReviewerQualificationSubmission(submissionValue);
  if (!sameQualificationEnvelope(packet, submission)) return invalid();
  const expectedKeys = new Set(qualificationExpected.keys());
  const observed = new Map<string, ReviewerQualificationAtomicAssessment>();
  for (const assessment of submission.assessments) {
    const key = humanAtomicIdentityKey(assessment);
    if (!expectedKeys.has(key) || observed.has(key)) return invalid();
    observed.set(key, assessment);
  }
  if (observed.size !== expectedKeys.size) return invalid();
  const conformingAtomicCount = [...expectedKeys].filter((key) =>
    observed.get(key)?.status === qualificationExpected.get(key)).length;
  const base = {
    schemaVersion: HUMAN_REFERENCE_SEMANTIC_AUDIT_V2_SCHEMA_VERSION,
    resultKind: HUMAN_REFERENCE_SEMANTIC_AUDIT_V2_QUALIFICATION_RESULT_KIND,
    auditProtocolId: HUMAN_REFERENCE_SEMANTIC_AUDIT_V2_PROTOCOL_ID,
    auditProtocolVersion: HUMAN_REFERENCE_SEMANTIC_AUDIT_V2_PROTOCOL_VERSION,
    reviewerId: packet.reviewerId,
    qualificationId: HUMAN_REFERENCE_SEMANTIC_AUDIT_V2_QUALIFICATION_ID,
    qualificationVersion: HUMAN_REFERENCE_SEMANTIC_AUDIT_V2_QUALIFICATION_VERSION,
    qualificationBatchId: packet.qualificationBatchId,
    qualificationFingerprint: packet.qualificationFingerprint,
    localization: packet.localization,
    qualificationCompleted: true,
    qualificationStatus: conformingAtomicCount === expectedKeys.size ? "qualified" : "not_qualified",
    assessedAtomicCount: expectedKeys.size,
    conformingAtomicCount,
  } as const;
  return parseReviewerQualificationResult({ ...base, resultFingerprint: resultFingerprint(base) });
}

function validateQualifiedResult(
  value: unknown,
  reviewerId: string,
  localization: HumanReferenceSemanticAuditLocalizationIdentity,
): ReviewerQualificationResult {
  const result = parseReviewerQualificationResult(value);
  const { resultFingerprint: persisted, ...base } = result;
  if (result.reviewerId !== reviewerId || !same(result.localization, localization) ||
    result.qualificationStatus !== "qualified" || resultFingerprint(base) !== persisted) return invalid();
  return result;
}

function qualificationBinding(result: ReviewerQualificationResult): ReviewerQualificationBinding {
  return {
    qualificationId: result.qualificationId,
    qualificationVersion: result.qualificationVersion,
    qualificationBatchId: result.qualificationBatchId,
    qualificationFingerprint: result.qualificationFingerprint,
    qualificationResultFingerprint: result.resultFingerprint,
    qualificationStatus: "qualified",
    qualificationCompleted: true,
  };
}

export interface QualifiedSemanticAuditExport {
  readonly packet: HumanReferenceQualifiedSemanticAuditPacket;
  readonly template: HumanReferenceQualifiedSemanticAuditSubmissionTemplate;
  readonly reviewDocument: string;
  readonly localizedGuide: string;
}

export function createQualifiedLocalizedSemanticAuditExport(
  annotationValue: HumanReferenceAnnotationFile,
  reviewerId: string,
  qualificationValue: unknown,
  definition: HumanReferenceSemanticAuditLocalizationDefinition,
): QualifiedSemanticAuditExport {
  const annotations = parseHumanReferenceAnnotationFile(annotationValue);
  if (annotations.requiredAnnotatorIds.includes(reviewerId)) return invalid();
  const localization = buildSemanticAuditLocalizationIdentity(annotations.tasks, definition);
  const qualification = validateQualifiedResult(qualificationValue, reviewerId, localization);
  const sourceCalibration = {
    batchId: annotations.batchId,
    calibrationProtocolId: HUMAN_REFERENCE_PROTOCOL_ID,
    calibrationProtocolVersion: HUMAN_REFERENCE_PROTOCOL_VERSION,
    dataKind: annotations.dataKind,
    ...(annotations.fixture === undefined ? {} : { fixture: annotations.fixture }),
  } as const;
  const reviewerQualification = qualificationBinding(qualification);
  const auditBatchId = `qualified-audit-${hash(JSON.stringify([
    annotations.batchId, reviewerId, localization, reviewerQualification,
  ])).slice("sha256:".length, "sha256:".length + 16)}`;
  const packet = parseHumanReferenceQualifiedSemanticAuditPacket({
    schemaVersion: HUMAN_REFERENCE_SEMANTIC_AUDIT_V2_SCHEMA_VERSION,
    packetKind: HUMAN_REFERENCE_SEMANTIC_AUDIT_V2_PACKET_KIND,
    auditProtocolId: HUMAN_REFERENCE_SEMANTIC_AUDIT_V2_PROTOCOL_ID,
    auditProtocolVersion: HUMAN_REFERENCE_SEMANTIC_AUDIT_V2_PROTOCOL_VERSION,
    auditBatchId,
    reviewerId,
    sourceCalibration,
    localization,
    reviewerQualification,
    localizedTasks: definition.localizedTasks,
  });
  return {
    packet,
    template: {
      schemaVersion: HUMAN_REFERENCE_SEMANTIC_AUDIT_V2_SCHEMA_VERSION,
      packetKind: HUMAN_REFERENCE_SEMANTIC_AUDIT_V2_SUBMISSION_KIND,
      auditProtocolId: HUMAN_REFERENCE_SEMANTIC_AUDIT_V2_PROTOCOL_ID,
      auditProtocolVersion: HUMAN_REFERENCE_SEMANTIC_AUDIT_V2_PROTOCOL_VERSION,
      auditBatchId,
      reviewerId,
      sourceCalibration,
      localization,
      reviewerQualification,
      reviewLocale: HUMAN_REFERENCE_SEMANTIC_AUDIT_V2_LOCALE,
      instructionsClear: false,
      annotations: sortedAtoms(packet.localizedTasks).map((atom) => ({ ...atom, status: "" })),
    },
    reviewDocument: renderLocalizedSemanticAuditReview(packet.localizedTasks),
    localizedGuide: definition.localizedGuide,
  };
}

function sameAuditEnvelope(
  packet: HumanReferenceQualifiedSemanticAuditPacket,
  submission: HumanReferenceQualifiedSemanticAuditSubmission,
): boolean {
  return packet.auditBatchId === submission.auditBatchId && packet.reviewerId === submission.reviewerId &&
    same(packet.sourceCalibration, submission.sourceCalibration) && same(packet.localization, submission.localization) &&
    same(packet.reviewerQualification, submission.reviewerQualification);
}

export function importQualifiedLocalizedSemanticAuditSubmission(
  packetValue: unknown,
  submissionValue: unknown,
  qualificationValue: unknown,
): HumanReferenceQualifiedSemanticAuditAnnotations {
  const packet = parseHumanReferenceQualifiedSemanticAuditPacket(packetValue);
  const submission = parseHumanReferenceQualifiedSemanticAuditSubmission(submissionValue);
  const qualification = validateQualifiedResult(qualificationValue, packet.reviewerId, packet.localization);
  if (!sameAuditEnvelope(packet, submission) ||
    !same(packet.reviewerQualification, qualificationBinding(qualification))) return invalid();
  const expected = new Set(sortedAtoms(packet.localizedTasks).map(humanAtomicIdentityKey));
  const observed = new Set<string>();
  for (const annotation of submission.annotations) {
    const key = humanAtomicIdentityKey(annotation);
    if (!expected.has(key) || observed.has(key)) return invalid();
    observed.add(key);
  }
  if (observed.size !== expected.size) return invalid();
  return parseHumanReferenceQualifiedSemanticAuditAnnotations({
    schemaVersion: HUMAN_REFERENCE_SEMANTIC_AUDIT_V2_SCHEMA_VERSION,
    dataKind: packet.sourceCalibration.dataKind,
    ...(packet.sourceCalibration.fixture === undefined ? {} : { fixture: packet.sourceCalibration.fixture }),
    annotationKind: HUMAN_REFERENCE_SEMANTIC_AUDIT_V2_ANNOTATIONS_KIND,
    auditProtocolId: HUMAN_REFERENCE_SEMANTIC_AUDIT_V2_PROTOCOL_ID,
    auditProtocolVersion: HUMAN_REFERENCE_SEMANTIC_AUDIT_V2_PROTOCOL_VERSION,
    auditBatchId: packet.auditBatchId,
    reviewerId: packet.reviewerId,
    sourceCalibration: packet.sourceCalibration,
    localization: packet.localization,
    reviewerQualification: packet.reviewerQualification,
    reviewLocale: submission.reviewLocale,
    instructionsClear: submission.instructionsClear,
    annotations: [...submission.annotations].sort((left, right) =>
      humanAtomicIdentityKey(left).localeCompare(humanAtomicIdentityKey(right))),
  });
}

export function buildQualifiedLocalizedSemanticAuditReport(
  annotationValue: HumanReferenceAnnotationFile,
  adjudicationValue: HumanReferenceAdjudicationFile,
  auditValue: unknown,
  qualificationValue: unknown,
): HumanReferenceQualifiedSemanticAuditReport {
  const audit = parseHumanReferenceQualifiedSemanticAuditAnnotations(auditValue);
  const qualification = validateQualifiedResult(qualificationValue, audit.reviewerId, audit.localization);
  if (!same(audit.reviewerQualification, qualificationBinding(qualification))) return invalid();
  const legacyAudit: HumanReferenceSemanticAuditAnnotations = {
    schemaVersion: HUMAN_REFERENCE_SEMANTIC_AUDIT_SCHEMA_VERSION,
    dataKind: audit.dataKind,
    ...(audit.fixture === undefined ? {} : { fixture: audit.fixture }),
    annotationKind: HUMAN_REFERENCE_SEMANTIC_AUDIT_ANNOTATIONS_KIND,
    auditProtocolId: HUMAN_REFERENCE_SEMANTIC_AUDIT_PROTOCOL_ID,
    auditProtocolVersion: HUMAN_REFERENCE_SEMANTIC_AUDIT_PROTOCOL_VERSION,
    auditBatchId: audit.auditBatchId,
    reviewerId: audit.reviewerId,
    sourceCalibration: audit.sourceCalibration,
    taskSetFingerprint: audit.localization.sourceTaskFingerprint,
    annotationGuide: audit.localization.sourceAnnotationGuide,
    annotations: audit.annotations,
  };
  const legacy = buildHumanReferenceSemanticAuditReport(annotationValue, adjudicationValue, legacyAudit);
  return {
    ...legacy,
    reportKind: HUMAN_REFERENCE_SEMANTIC_AUDIT_V2_REPORT_KIND,
    auditProtocolVersion: HUMAN_REFERENCE_SEMANTIC_AUDIT_V2_PROTOCOL_VERSION,
    reviewerId: audit.reviewerId,
    reviewLocale: audit.reviewLocale,
    localization: audit.localization,
    reviewerQualification: audit.reviewerQualification,
    qualificationStatus: "qualified",
    qualificationCompleted: true,
    instructionsClear: audit.instructionsClear,
    limitations: [
      ...legacy.limitations,
      "Reviewer qualification establishes comprehension eligibility for this audit instrument, not calibration or accuracy.",
      "Localized presentation bytes are provenance-bound and are not the canonical source bytes.",
    ],
  };
}
