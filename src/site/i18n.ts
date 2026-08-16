export const SITE_LOCALES = ["en", "zh-CN"] as const;
export type SiteLocale = (typeof SITE_LOCALES)[number];

export const DEFAULT_SITE_LOCALE = "en" as const;

export type SiteUiTextKey =
  | "leaderboard"
  | "data"
  | "run"
  | "methodology"
  | "docs"
  | "case"
  | "runLabel"
  | "studentInput"
  | "conversationContext"
  | "evaluationCriteria"
  | "tutorResponse"
  | "originalTutorResponse"
  | "judgeResult"
  | "pass"
  | "partial"
  | "fail"
  | "error"
  | "correctness"
  | "diagnosis"
  | "guidance"
  | "adaptation"
  | "actionability"
  | "criticalFailure"
  | "answerLeakage"
  | "score"
  | "reason"
  | "evidence"
  | "missing"
  | "notAvailable"
  | "preliminary"
  | "calibration"
  | "coverage"
  | "caseId"
  | "caseVersion"
  | "dataset"
  | "datasetVersion"
  | "category"
  | "capability"
  | "targetLocale"
  | "studentMessage"
  | "problemContext"
  | "learningObjective"
  | "history"
  | "noConversationHistory"
  | "noEvaluationCriteria"
  | "noJudgeResult"
  | "noTutorResponse"
  | "actualGeneratedText"
  | "rawText"
  | "evaluatorDiagnostic"
  | "insufficientInformation"
  | "judgeRawResult"
  | "language"
  | "chinese"
  | "english"
  | "selectLanguage"
  | "backToAudit"
  | "auditRun"
  | "auditCases"
  | "status"
  | "model"
  | "provider"
  | "prompt"
  | "promptVersion"
  | "generationSpec"
  | "evaluatorVersion"
  | "noCriticalFailures"
  | "noAnswerLeakage"
  | "privateAudit"
  | "corpus"
  | "qualityGate"
  | "latency"
  | "tokenUsage"
  | "cost"
  | "attempts"
  | "judge"
  | "metrics";

const translations: Record<SiteLocale, Record<SiteUiTextKey, string>> = {
  en: {
    leaderboard: "Leaderboard",
    data: "Data",
    run: "Run",
    methodology: "Methodology",
    docs: "Docs",
    case: "Case",
    runLabel: "Run",
    studentInput: "Student input",
    conversationContext: "Conversation context",
    evaluationCriteria: "Evaluation criteria",
    tutorResponse: "Tutor response",
    originalTutorResponse: "Original Tutor response",
    judgeResult: "Judge result",
    pass: "Pass",
    partial: "Partial",
    fail: "Fail",
    error: "Error",
    correctness: "Correctness",
    diagnosis: "Diagnosis",
    guidance: "Guidance",
    adaptation: "Adaptation",
    actionability: "Actionability",
    criticalFailure: "Critical failure",
    answerLeakage: "Answer leakage",
    score: "Score",
    reason: "Reason",
    evidence: "Evidence",
    missing: "Missing",
    notAvailable: "Not available",
    preliminary: "Preliminary",
    calibration: "Calibration",
    coverage: "Coverage",
    caseId: "Case ID",
    caseVersion: "Case version",
    dataset: "Dataset",
    datasetVersion: "Dataset version",
    category: "Category",
    capability: "Capability",
    targetLocale: "Target locale",
    studentMessage: "Student message",
    problemContext: "Problem context",
    learningObjective: "Learning objective",
    history: "Conversation history",
    noConversationHistory: "No prior conversation.",
    noEvaluationCriteria: "No rubric or evaluation criteria were stored for this case.",
    noJudgeResult: "No Judge result was stored for this run.",
    noTutorResponse: "No Tutor response was stored for this run.",
    actualGeneratedText: "Actual model-generated text",
    rawText: "Raw text",
    evaluatorDiagnostic: "Evaluator diagnostic",
    insufficientInformation: "Insufficient information",
    judgeRawResult: "Judge raw result",
    language: "Language",
    chinese: "中文",
    english: "English",
    selectLanguage: "Select interface language",
    backToAudit: "Back to audit run",
    auditRun: "Audit run",
    auditCases: "Audit cases",
    status: "Status",
    model: "Model",
    provider: "Provider",
    prompt: "Prompt",
    promptVersion: "Prompt version",
    generationSpec: "Generation spec",
    evaluatorVersion: "Evaluator version",
    noCriticalFailures: "No critical failures recorded.",
    noAnswerLeakage: "No answer leakage recorded.",
    privateAudit: "Private audit",
    corpus: "Corpus",
    qualityGate: "Quality gate",
    latency: "Latency",
    tokenUsage: "Token usage",
    cost: "Cost",
    attempts: "Attempts",
    judge: "Judge",
    metrics: "Metrics",
  },
  "zh-CN": {
    leaderboard: "排行榜",
    data: "数据",
    run: "运行",
    methodology: "方法论",
    docs: "文档",
    case: "案例",
    runLabel: "运行",
    studentInput: "学生输入",
    conversationContext: "对话上下文",
    evaluationCriteria: "评价要求",
    tutorResponse: "Tutor 回复",
    originalTutorResponse: "Tutor 原始回复",
    judgeResult: "Judge 结论",
    pass: "通过",
    partial: "部分通过",
    fail: "失败",
    error: "错误",
    correctness: "正确性",
    diagnosis: "诊断能力",
    guidance: "引导能力",
    adaptation: "适应能力",
    actionability: "可执行性",
    criticalFailure: "严重失败",
    answerLeakage: "答案泄露",
    score: "分数",
    reason: "理由",
    evidence: "证据",
    missing: "缺失",
    notAvailable: "不可用",
    preliminary: "初步结果",
    calibration: "校准",
    coverage: "覆盖情况",
    caseId: "案例 ID",
    caseVersion: "案例版本",
    dataset: "数据集",
    datasetVersion: "数据集版本",
    category: "类别",
    capability: "能力标签",
    targetLocale: "目标语言区域",
    studentMessage: "学生消息",
    problemContext: "题目上下文",
    learningObjective: "学习目标",
    history: "对话历史",
    noConversationHistory: "没有此前对话。",
    noEvaluationCriteria: "此案例没有保存 rubric 或评价要求。",
    noJudgeResult: "此运行没有保存 Judge 结论。",
    noTutorResponse: "此运行没有保存 Tutor 回复。",
    actualGeneratedText: "模型实际生成的文本",
    rawText: "原始文本",
    evaluatorDiagnostic: "Evaluator 诊断",
    insufficientInformation: "信息不足",
    judgeRawResult: "Judge 原始结果",
    language: "界面语言",
    chinese: "中文",
    english: "English",
    selectLanguage: "选择界面语言",
    backToAudit: "返回审计运行",
    auditRun: "审计运行",
    auditCases: "审计案例",
    status: "状态",
    model: "模型",
    provider: "Provider",
    prompt: "Prompt",
    promptVersion: "Prompt 版本",
    generationSpec: "生成规格",
    evaluatorVersion: "Evaluator 版本",
    noCriticalFailures: "没有记录严重失败。",
    noAnswerLeakage: "没有记录答案泄露。",
    privateAudit: "私有审计",
    corpus: "Corpus",
    qualityGate: "质量门",
    latency: "延迟",
    tokenUsage: "Token 用量",
    cost: "成本",
    attempts: "尝试次数",
    judge: "Judge",
    metrics: "运行指标",
  },
};

export function resolveSiteLocale(value: string | undefined): SiteLocale {
  return value?.toLowerCase().startsWith("zh") ? "zh-CN" : DEFAULT_SITE_LOCALE;
}

export function siteText(locale: SiteLocale, key: SiteUiTextKey): string {
  return translations[locale][key];
}
