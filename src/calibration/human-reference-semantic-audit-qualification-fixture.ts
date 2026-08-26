import type {
  HumanAtomicStatus,
} from "../contracts/human-reference-calibration.js";
import type {
  ReviewerQualificationItem,
} from "../contracts/human-reference-semantic-audit-v2.js";

export interface ReviewerQualificationExpectedAssessment {
  readonly caseId: string;
  readonly rubricId: string;
  readonly requirementId: string;
  readonly status: HumanAtomicStatus;
}

// 这是已发布的 @0.1.0 可见练习。新版本复用其字节，但以独立定义指纹绑定隐藏判定语义。
export const HUMAN_REFERENCE_SEMANTIC_AUDIT_QUALIFICATION_ITEMS: readonly ReviewerQualificationItem[] =
  Object.freeze([
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

export const HUMAN_REFERENCE_SEMANTIC_AUDIT_QUALIFICATION_EXPECTED_ASSESSMENTS:
readonly ReviewerQualificationExpectedAssessment[] = Object.freeze([
  { caseId: "qualification-omission-negative", rubricId: "qualification-omission-negative",
    requirementId: "Q1", status: "OMITTED_OR_INCOMPLETE" },
  { caseId: "qualification-omission-negative", rubricId: "qualification-omission-negative",
    requirementId: "Q2", status: "SATISFIED" },
  { caseId: "qualification-support-sufficiency", rubricId: "qualification-support-sufficiency",
    requirementId: "Q1", status: "SATISFIED" },
  { caseId: "qualification-support-sufficiency", rubricId: "qualification-support-sufficiency",
    requirementId: "Q2", status: "EXPLICIT_CONFLICT" },
  { caseId: "qualification-contextual-correction", rubricId: "qualification-contextual-correction",
    requirementId: "Q1", status: "SATISFIED" },
  { caseId: "qualification-contextual-correction", rubricId: "qualification-contextual-correction",
    requirementId: "Q2", status: "SATISFIED" },
  { caseId: "qualification-unsupported-verdict", rubricId: "qualification-unsupported-verdict",
    requirementId: "Q1", status: "OMITTED_OR_INCOMPLETE" },
  { caseId: "qualification-unsupported-verdict", rubricId: "qualification-unsupported-verdict",
    requirementId: "Q2", status: "EXPLICIT_CONFLICT" },
] as const);
