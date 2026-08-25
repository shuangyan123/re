import { createHash } from "node:crypto";

import type { HumanReferenceAnnotationTask } from "./human-reference-calibration.js";
import type { ReviewerQualificationItem } from "./human-reference-semantic-audit-v2.js";

function hash(value: string): string {
  return `sha256:${createHash("sha256").update(value, "utf8").digest("hex")}`;
}

function section(label: string, value: string): string[] {
  return [`### ${label}`, "", value, ""];
}

function readableStructuredValue(value: string): string {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (Array.isArray(parsed)) return parsed.length === 0 ? "（无）" : parsed.map((item) => `- ${String(item)}`).join("\n");
    if (typeof parsed !== "object" || parsed === null) return String(parsed);
    const labels: Readonly<Record<string, string>> = {
      knownConcepts: "已掌握概念",
      misconceptions: "已有误解",
      level: "学习阶段",
      goal: "学习目标",
      requiredConcepts: "关键概念",
    };
    return Object.entries(parsed).map(([key, item]) => {
      const rendered = Array.isArray(item) ? (item.length === 0 ? "无" : item.join("、")) : String(item);
      return `- ${labels[key] ?? key}：${rendered}`;
    }).join("\n");
  } catch {
    return value;
  }
}

export function renderLocalizedSemanticAuditReview(
  tasks: readonly HumanReferenceAnnotationTask[],
): string {
  const lines = [
    "# Human Reference 语义审计复核表",
    "",
    "请仅依据本文件中可见的材料，逐项独立判断 Tutor 回答是否满足要求。",
    "每个原子要求只能选择 SATISFIED、OMITTED_OR_INCOMPLETE 或 EXPLICIT_CONFLICT。",
    "不要根据某一项的结论推断其他项；可见证据不足时不要猜测隐藏意图。",
    "",
  ];
  tasks.forEach((task, taskIndex) => {
    lines.push(`## 案例 ${taskIndex + 1}`, "", `<!-- caseId:${task.caseId} -->`, "");
    lines.push(...section("学习目标", task.learningObjective));
    lines.push(...section("学生情况", readableStructuredValue(task.studentProfile)));
    lines.push(...section("对话历史", readableStructuredValue(task.conversationHistory)));
    lines.push(...section("学生的话", task.studentMessage));
    lines.push(...section("题目与上下文", task.problemContext));
    lines.push(...section("参考事实", readableStructuredValue(task.groundTruth)));
    lines.push(...section("已知误解", task.knownMisconception));
    lines.push(...section("作答披露规则", task.disclosurePolicy === "no_answer" ? "不要直接给出答案" : task.disclosurePolicy));
    lines.push(...section("Tutor 回答", task.tutorResponse));
    task.rubrics.forEach((rubric) => {
      lines.push("### 评审维度", "", rubric.criterion, "", `<!-- rubricId:${rubric.id} -->`, "");
      rubric.requirements.forEach((requirement, requirementIndex) => {
        lines.push(
          `#### 原子要求 ${requirementIndex + 1}`,
          "",
          requirement.description,
          "",
          `<!-- requirementId:${requirement.id} -->`,
          "",
          "选择：",
          "",
          "- [ ] SATISFIED",
          "- [ ] OMITTED_OR_INCOMPLETE",
          "- [ ] EXPLICIT_CONFLICT",
          "",
          "可选的简短证据：____________________",
          "",
        );
      });
    });
  });
  return `${lines.join("\n").trimEnd()}\n`;
}

export function localizedTaskFingerprint(tasks: readonly HumanReferenceAnnotationTask[]): string {
  return hash(`${JSON.stringify(tasks)}\n`);
}

export function localizedPresentationFingerprint(
  tasks: readonly HumanReferenceAnnotationTask[],
): string {
  return hash(renderLocalizedSemanticAuditReview(tasks));
}

export function renderReviewerQualificationReview(
  items: readonly ReviewerQualificationItem[],
): string {
  const lines = [
    "# 语义审计复核员理解检查",
    "",
    "这些是中性的合成练习，不属于真实审计任务。请逐项独立判断。",
    "本文件不包含答案；完成结果仅用于确认是否理解本审计工具。",
    "",
  ];
  items.forEach((item, itemIndex) => {
    lines.push(`## 练习 ${itemIndex + 1}`, "", `<!-- itemId:${item.itemId} -->`, "");
    lines.push(...section("可见事实", item.evidence));
    lines.push(...section("待评审回答", item.response));
    item.requirements.forEach((requirement, requirementIndex) => {
      lines.push(
        `### 原子要求 ${requirementIndex + 1}`,
        "",
        requirement.description,
        "",
        `<!-- requirementId:${requirement.requirementId} -->`,
        "",
        "选择：",
        "",
        "- [ ] SATISFIED",
        "- [ ] OMITTED_OR_INCOMPLETE",
        "- [ ] EXPLICIT_CONFLICT",
        "",
      );
    });
  });
  return `${lines.join("\n").trimEnd()}\n`;
}

export function qualificationFingerprint(items: readonly ReviewerQualificationItem[]): string {
  return hash(renderReviewerQualificationReview(items));
}
