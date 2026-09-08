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
  | "metrics"
  | "caseLocale"
  | "allLocales"
  | "localeEnglish"
  | "localeChinese"
  | "resetFilters"
  | "showingCases"
  | "localeBreakdown"
  | "crossLocaleGroup"
  | "studentProfile"
  | "knownConcepts"
  | "misconceptions"
  | "level"
  | "goal"
  | "reviewTranslation"
  | "reviewTranslationOnly"
  | "viewOriginal"
  | "translationUnavailable"
  | "translationStale"
  | "translationFailed"
  | "community"
  | "communityPageTitle"
  | "communityMetaDescription"
  | "communityHeroTitle"
  | "communityHeroDescription"
  | "communityParticipationClosed"
  | "communityWhyEyebrow"
  | "communityWhyTitle"
  | "communityWhyCopy"
  | "communityWhyEvidence"
  | "communityWhatEyebrow"
  | "communityWhatTitle"
  | "communityWhatCopy"
  | "communityTaskRead"
  | "communityTaskJudge"
  | "communityTaskSubmit"
  | "communityTaskQualify"
  | "communityApplicationEyebrow"
  | "communityApplicationTitle"
  | "communityApplicationCopy"
  | "communityApplicationClosedNotice"
  | "communityApplicationContact"
  | "communityApplicationLocale"
  | "communityApplicationMotivation"
  | "communityApplicationExperience"
  | "communityApplicationAvailability"
  | "communityHowEyebrow"
  | "communityHowTitle"
  | "communityHowCopy"
  | "communityStepApplication"
  | "communityStepManualReview"
  | "communityStepInvitation"
  | "communityStepConsent"
  | "communityStepQualification"
  | "communityStepBlindReview"
  | "communityStatusEyebrow"
  | "communityStatusTitle"
  | "communityStatusCopy"
  | "communityStatusInfo"
  | "communityStatusInfoValue"
  | "communityStatusIntake"
  | "communityStatusIntakeValue"
  | "communityStatusCampaign"
  | "communityStatusCampaignValue"
  | "communityStatusCalibration"
  | "communityStatusCalibrationValue"
  | "communityEvidenceEyebrow"
  | "communityEvidenceTitle"
  | "communityEvidenceCopy"
  | "communityWatchEyebrow"
  | "communityWatchTitle"
  | "communityWatchCopy"
  | "communityWatchHomepage"
  | "communityWatchCases"
  | "communityWatchMethodology"
  | "communityWatchGitHub";

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
    caseLocale: "Case locale",
    allLocales: "All",
    localeEnglish: "English-language context",
    localeChinese: "Chinese-language context",
    resetFilters: "Reset filters",
    showingCases: "Showing {count} cases",
    localeBreakdown: "Language-context breakdown",
    crossLocaleGroup: "Construct cohort group",
    studentProfile: "Student profile",
    knownConcepts: "Known concepts",
    misconceptions: "Misconceptions",
    level: "Level",
    goal: "Goal",
    reviewTranslation: "Review translation",
    reviewTranslationOnly: "Review translation only — not used for evaluation.",
    viewOriginal: "View original",
    translationUnavailable: "No Chinese review translation is available.",
    translationStale: "This Chinese review translation is out of date.",
    translationFailed: "The Chinese review translation is unavailable for this field.",
    community: "Participate",
    communityPageTitle: "Participate — TutorBench",
    communityMetaDescription: "Learn why TutorBench may need human review and how future participation could work. Applications are not open yet.",
    communityHeroTitle: "Help improve TutorBench",
    communityHeroDescription: "TutorBench is a developing benchmark for evaluating how well AI systems teach, not only whether they produce correct answers. Some tutoring behaviors are difficult to validate with deterministic checks or an LLM Judge alone, so future Community Review will add structured human evaluation.",
    communityParticipationClosed: "Applications not open yet",
    communityWhyEyebrow: "Why human review",
    communityWhyTitle: "Teaching quality is more than a correct answer.",
    communityWhyCopy: "TutorBench looks at whether a Tutor understands a learner's difficulty, offers a useful next step, and adapts its help to the learner's state. These behaviors depend on context and judgment, so deterministic rules or an LLM Judge alone cannot reliably cover all of them.",
    communityWhyEvidence: "Early human review will help improve and validate the evaluation method. It is not automatically treated as a gold answer or Human Reference.",
    communityWhatEyebrow: "What participants may do",
    communityWhatTitle: "A structured review, when the program opens.",
    communityWhatCopy: "Future reviewers would work from a clear task and shared criteria. The exact materials and schedule will be announced later.",
    communityTaskRead: "Read an AI Tutor response and the evaluation task",
    communityTaskJudge: "Judge the response using the provided criteria",
    communityTaskSubmit: "Submit a structured review",
    communityTaskQualify: "Complete a short qualification step before reviewing real assignments",
    communityApplicationEyebrow: "Future application",
    communityApplicationTitle: "What we expect to ask when applications open",
    communityApplicationCopy: "The first application contract is intentionally small: one contact email, a preferred review language, a short motivation, optional relevant experience, and a coarse availability category.",
    communityApplicationClosedNotice: "Applications are not open yet. This section describes a future contract, not a form.",
    communityApplicationContact: "One contact email for a future invitation",
    communityApplicationLocale: "Preferred review language",
    communityApplicationMotivation: "A short motivation for participating",
    communityApplicationExperience: "Optional relevant experience summary",
    communityApplicationAvailability: "Approximate availability category",
    communityHowEyebrow: "How it could work",
    communityHowTitle: "A high-level path from interest to blind review.",
    communityHowCopy: "Participation would be invite-only at first. An application would not create a reviewer account automatically.",
    communityStepApplication: "Application",
    communityStepManualReview: "Manual review",
    communityStepInvitation: "Invitation",
    communityStepConsent: "Consent",
    communityStepQualification: "Qualification",
    communityStepBlindReview: "Blind review",
    communityStatusEyebrow: "Current status",
    communityStatusTitle: "Participation is not open yet.",
    communityStatusCopy: "The reviewer workflow is invite-only infrastructure under preparation. Public reviewer intake is not open, the real Community Review campaign has not started, and P5 human calibration has not started.",
    communityStatusInfo: "Public information",
    communityStatusInfoValue: "Open",
    communityStatusIntake: "Applications and reviewer intake",
    communityStatusIntakeValue: "Not open",
    communityStatusCampaign: "Real Community Review campaign",
    communityStatusCampaignValue: "Not started",
    communityStatusCalibration: "P5 human calibration",
    communityStatusCalibrationValue: "Not started",
    communityEvidenceEyebrow: "Evidence boundary",
    communityEvidenceTitle: "Human review informs the method; it does not create a gold standard.",
    communityEvidenceCopy: "Early human review will be used to improve and validate the evaluation method. Agreement is consistency evidence, not correctness; qualification is eligibility, not calibration.",
    communityWatchEyebrow: "Future announcements",
    communityWatchTitle: "Follow the benchmark for the next opening.",
    communityWatchCopy: "When participation opens, announcements will appear on the project homepage and GitHub repository. This page has no application form, waitlist, or reviewer login.",
    communityWatchHomepage: "Explore the benchmark",
    communityWatchCases: "Browse benchmark cases",
    communityWatchMethodology: "Read methodology",
    communityWatchGitHub: "Follow the repository on GitHub ↗",
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
    caseLocale: "案例语言",
    allLocales: "全部",
    localeEnglish: "英文语境",
    localeChinese: "中文语境",
    resetFilters: "重置筛选",
    showingCases: "显示 {count} 个案例",
    localeBreakdown: "按教学语境分组",
    crossLocaleGroup: "构念分组",
    studentProfile: "学生画像",
    knownConcepts: "已知概念",
    misconceptions: "常见误解",
    level: "水平",
    goal: "目标",
    reviewTranslation: "中文辅助翻译",
    reviewTranslationOnly: "辅助翻译，仅供人工阅读，不参与评测。",
    viewOriginal: "查看原文",
    translationUnavailable: "暂无中文辅助翻译。",
    translationStale: "辅助翻译已过期。",
    translationFailed: "此字段的中文辅助翻译不可用。",
    community: "参与",
    communityPageTitle: "参与 TutorBench — TutorBench",
    communityMetaDescription: "了解 TutorBench 为什么需要未来的人工评审，以及未来可能的参与方式。当前暂未开放参与申请。",
    communityHeroTitle: "参与 TutorBench",
    communityHeroDescription: "TutorBench 是一个正在完善中的 AI 教学能力评测项目。它不仅关注模型能不能答对，也关注模型能否识别学生的问题、提供合适的引导，并根据学习状态调整帮助。有些教学行为很难仅靠程序规则或 LLM Judge 可靠判断，因此后续 Community Review 会引入结构化人工评审，帮助验证和改进评测方法。",
    communityParticipationClosed: "参与申请暂未开放",
    communityWhyEyebrow: "为什么需要人工评审",
    communityWhyTitle: "教学质量不只是答案是否正确。",
    communityWhyCopy: "TutorBench 关注 Tutor 是否理解学生的困难、给出合适的下一步，并在不同学习状态下调整帮助。这些行为涉及语境和判断，不能只靠确定性规则或单独的 LLM Judge 可靠覆盖。",
    communityWhyEvidence: "早期人工评审将帮助改进和验证评测方法，不会自动被视为标准答案或 Human Reference。",
    communityWhatEyebrow: "未来可能做什么",
    communityWhatTitle: "项目开放后，评审会有清晰的任务和标准。",
    communityWhatCopy: "未来参与者会根据统一的任务说明和评审标准工作。具体材料与时间安排将在开放时另行说明。",
    communityTaskRead: "阅读 AI Tutor 的回答和评审任务",
    communityTaskJudge: "按提供的标准进行判断",
    communityTaskSubmit: "提交结构化评审",
    communityTaskQualify: "在评审真实任务前完成简短的资格验证",
    communityApplicationEyebrow: "未来申请",
    communityApplicationTitle: "开放申请后预计会询问什么",
    communityApplicationCopy: "首版申请合同会刻意保持最小：一个用于未来邀请的联系邮箱、偏好的评审语言、简短动机、可选的相关经验，以及粗粒度的可用程度。",
    communityApplicationClosedNotice: "当前尚未开放申请。本节说明未来合同，不是申请表。",
    communityApplicationContact: "用于未来邀请的一个联系邮箱",
    communityApplicationLocale: "偏好的评审语言",
    communityApplicationMotivation: "参与原因的简短说明",
    communityApplicationExperience: "可选的相关经验概述",
    communityApplicationAvailability: "粗粒度的可用程度",
    communityHowEyebrow: "参与方式",
    communityHowTitle: "从表达意愿到盲评任务的高层流程。",
    communityHowCopy: "初期参与将采用受邀制。提交申请不会自动创建 reviewer 账号。",
    communityStepApplication: "提交申请",
    communityStepManualReview: "人工审核",
    communityStepInvitation: "收到邀请",
    communityStepConsent: "阅读并确认参与说明",
    communityStepQualification: "资格验证",
    communityStepBlindReview: "盲评任务",
    communityStatusEyebrow: "当前状态",
    communityStatusTitle: "当前暂未开放参与申请。",
    communityStatusCopy: "Reviewer 流程目前仍是受邀制基础设施。公开 reviewer intake 尚未开放，真实 Community Review 尚未启动，P5 人工校准尚未开始。",
    communityStatusInfo: "公开参与说明",
    communityStatusInfoValue: "已开放",
    communityStatusIntake: "参与申请与 reviewer intake",
    communityStatusIntakeValue: "尚未开放",
    communityStatusCampaign: "真实 Community Review",
    communityStatusCampaignValue: "尚未启动",
    communityStatusCalibration: "P5 人工校准",
    communityStatusCalibrationValue: "尚未开始",
    communityEvidenceEyebrow: "证据边界",
    communityEvidenceTitle: "人工评审帮助改进方法，不会自动产生标准答案。",
    communityEvidenceCopy: "早期人工评审结果将用于帮助改进和验证评测方法。评审一致性只能说明一致性，不能说明正确性；资格验证用于确认参与资格，不等于校准。",
    communityWatchEyebrow: "后续公告",
    communityWatchTitle: "关注 benchmark，等待下一次开放。",
    communityWatchCopy: "开放参与后，公告会发布在项目主页和 GitHub 仓库。本页面没有申请表、候补名单或 reviewer 登录入口。",
    communityWatchHomepage: "查看 benchmark",
    communityWatchCases: "浏览 benchmark 案例",
    communityWatchMethodology: "阅读方法论",
    communityWatchGitHub: "在 GitHub 关注仓库 ↗",
  },
};

export function resolveSiteLocale(value: string | undefined): SiteLocale {
  return value?.toLowerCase().startsWith("zh") ? "zh-CN" : DEFAULT_SITE_LOCALE;
}

export function siteText(locale: SiteLocale, key: SiteUiTextKey): string {
  return translations[locale][key];
}
