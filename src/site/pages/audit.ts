import type {
  TutorEvalCase,
  TutorEvalCategory,
  TutorEvalCaseRunResult,
  TutorEvalRubric,
} from "../../contracts/index.js";
import type { TutorEvaluationAuditArtifact } from "../../reporting/index.js";
import {
  escapeHtml,
  humanize,
  renderCodeBlock,
  renderDimensionPills,
  renderEmptyState,
  renderStatusBadge,
  renderUiText,
  type SitePage,
} from "../html.js";
import { siteText, type SiteLocale, type SiteUiTextKey } from "../i18n.js";
import { renderTutorMarkdown } from "../markdown.js";

export interface TutorEvaluationAuditPageInput {
  readonly artifact: TutorEvaluationAuditArtifact;
  readonly dataset: { readonly id: string; readonly version: string; readonly cases: readonly TutorEvalCase[] };
  readonly caseId: string;
  readonly runIndex: number;
  readonly locale: SiteLocale;
}

export interface TutorEvaluationAuditIndexInput {
  readonly artifact: TutorEvaluationAuditArtifact;
  readonly dataset: TutorEvaluationAuditPageInput["dataset"];
  readonly locale: SiteLocale;
}

const categoryTextKeys: Readonly<Record<TutorEvalCategory, SiteUiTextKey>> = {
  correctness: "correctness",
  diagnosis: "diagnosis",
  guidance: "guidance",
  adaptation: "adaptation",
  actionability: "actionability",
};

function page(
  title: string,
  description: string,
  route: string,
  content: string,
): SitePage {
  return { title, description, route, content };
}

function localizedKeyValueList(
  items: ReadonlyArray<readonly [SiteUiTextKey, string]>,
  locale: SiteLocale,
): string {
  return `<dl class="key-value-list">${items
    .map(
      ([key, value]) =>
        `<div><dt>${renderUiText(key, locale)}</dt><dd>${escapeHtml(value)}</dd></div>`,
    )
    .join("")}</dl>`;
}

function categoryLabel(value: string, locale: SiteLocale): string {
  const key = categoryTextKeys[value as TutorEvalCategory];
  return key === undefined
    ? escapeHtml(humanize(value))
    : renderUiText(key, locale);
}

function resultLabel(
  value: "PASS" | "PARTIAL" | "FAIL" | "ERROR" | "passed" | "failed" | "error",
  locale: SiteLocale,
): string {
  if (value === "PASS" || value === "passed") {
    return renderUiText("pass", locale);
  }
  if (value === "FAIL" || value === "failed") {
    return renderUiText("fail", locale);
  }
  if (value === "PARTIAL") {
    return renderUiText("partial", locale);
  }
  return renderUiText("error", locale);
}

function resultBadge(
  value: "PASS" | "PARTIAL" | "FAIL" | "ERROR" | "passed" | "failed" | "error",
  locale: SiteLocale,
): string {
  const tone = value === "PASS" || value === "passed"
    ? "success"
    : value === "ERROR" || value === "error"
      ? "danger"
      : "warning";
  return `<span class="status-badge status-${tone}">${resultLabel(value, locale)}</span>`;
}

function renderConversation(caseValue: TutorEvalCase, locale: SiteLocale): string {
  const history = caseValue.tutorInput.conversationHistory ?? [];
  if (history.length === 0) {
    return `<p class="muted">${renderUiText("noConversationHistory", locale)}</p>`;
  }
  return `<ol class="conversation-list">${history
    .map(
      (message) => `<li><span class="conversation-role">${escapeHtml(humanize(message.role))}</span><p class="audit-plain-text">${escapeHtml(message.text)}</p></li>`,
    )
    .join("")}</ol>`;
}

function renderCaseContext(caseValue: TutorEvalCase, locale: SiteLocale): string {
  const input = caseValue.tutorInput;
  return `<section class="panel detail-section audit-section" aria-labelledby="audit-student-input">
    <div class="panel-heading"><div><p class="eyebrow">${renderUiText("studentInput", locale)}</p><h2 id="audit-student-input">${renderUiText("conversationContext", locale)}</h2></div><span class="status-badge status-muted">${escapeHtml(caseValue.metadata.subject)}</span></div>
    <div class="student-message"><p class="quote-label">${renderUiText("studentMessage", locale)}</p><p>${escapeHtml(input.studentMessage)}</p></div>
    ${input.problemContext === undefined ? "" : `<div class="context-copy"><p class="quote-label">${renderUiText("problemContext", locale)}</p><p>${escapeHtml(input.problemContext)}</p></div>`}
    <div class="context-copy"><p class="quote-label">${renderUiText("learningObjective", locale)}</p><p>${escapeHtml(input.learningObjective)}</p></div>
    <div class="context-copy"><p class="quote-label">${renderUiText("history", locale)}</p>${renderConversation(caseValue, locale)}</div>
  </section>`;
}

function rubricResultFor(
  caseResult: TutorEvalCaseRunResult,
  rubricId: string,
): TutorEvalCaseRunResult["rubricResults"][number] | undefined {
  return caseResult.rubricResults.find((result) => result.rubricId === rubricId);
}

function renderRubricDetails(
  rubric: TutorEvalRubric,
  caseResult: TutorEvalCaseRunResult,
  locale: SiteLocale,
): string {
  const result = rubricResultFor(caseResult, rubric.id);
  const criterionMeta = [
    categoryLabel(rubric.category, locale),
    escapeHtml(rubric.behavior ?? "required"),
    escapeHtml(rubric.evaluationType ?? (rubric.evaluatorId === undefined ? "judge" : "deterministic")),
    ...(rubric.critical === true ? ["critical"] : []),
  ].join(" · ");
  const failure = rubric.criticalFailure === undefined
    ? ""
    : `<p class="audit-evidence">${renderUiText("criticalFailure", locale)}: ${escapeHtml(
        `${rubric.criticalFailure.type} (${rubric.criticalFailure.severity})`,
      )}</p>`;
  const diagnostics = result?.diagnostics ?? [];
  return `<li>
    <div class="split-heading"><div><p class="eyebrow">${escapeHtml(rubric.id)}</p><p class="audit-criterion">${escapeHtml(rubric.criterion)}</p><p class="audit-evidence">${criterionMeta}</p>${failure}</div>${result === undefined ? `<span class="status-badge status-muted">${renderUiText("missing", locale)}</span>` : resultBadge(result.result, locale)}</div>
    ${result === undefined ? "" : `<p class="audit-evidence">${renderUiText("score", locale)}: ${escapeHtml(result.score === null ? "n/a" : result.score.toFixed(2))} · ${escapeHtml(String(result.weight))}</p>`}
    ${diagnostics.length === 0 ? "" : `<ul class="audit-list">${diagnostics.map((diagnostic) => `<li><strong>${renderUiText("evaluatorDiagnostic", locale)}</strong><p>${escapeHtml(diagnostic.message)}</p></li>`).join("")}</ul>`}
  </li>`;
}

function renderEvaluationCriteria(
  caseValue: TutorEvalCase,
  caseResult: TutorEvalCaseRunResult,
  locale: SiteLocale,
): string {
  const rubrics = caseValue.evaluatorOnly.rubrics;
  if (rubrics.length === 0) {
    return `<section class="panel detail-section audit-section" aria-labelledby="audit-criteria"><p class="eyebrow">${renderUiText("evaluationCriteria", locale)}</p><h2 id="audit-criteria">${renderUiText("evaluationCriteria", locale)}</h2>${renderEmptyState(siteText(locale, "missing"), siteText(locale, "noEvaluationCriteria"))}</section>`;
  }
  return `<section class="panel detail-section audit-section" aria-labelledby="audit-criteria">
    <p class="eyebrow">${renderUiText("evaluationCriteria", locale)}</p><h2 id="audit-criteria">${renderUiText("evaluationCriteria", locale)}</h2>
    <p class="section-copy">${escapeHtml(caseValue.evaluatorOnly.disclosurePolicy)} · ${escapeHtml(String(rubrics.length))} rubric${rubrics.length === 1 ? "" : "s"}</p>
    <ul class="audit-list">${rubrics.map((rubric) => renderRubricDetails(rubric, caseResult, locale)).join("")}</ul>
  </section>`;
}

function renderTutorResponse(
  caseResult: TutorEvalCaseRunResult,
  locale: SiteLocale,
): string {
  if (caseResult.rawTutorResponse === null) {
    return `<section class="panel detail-section audit-section" aria-labelledby="audit-tutor-response"><p class="eyebrow">${renderUiText("tutorResponse", locale)}</p><h2 id="audit-tutor-response">${renderUiText("originalTutorResponse", locale)}</h2>${renderEmptyState(siteText(locale, "missing"), siteText(locale, "noTutorResponse"))}</section>`;
  }
  return `<section class="panel detail-section audit-section" aria-labelledby="audit-tutor-response">
    <div class="panel-heading"><div><p class="eyebrow">${renderUiText("tutorResponse", locale)}</p><h2 id="audit-tutor-response">${renderUiText("originalTutorResponse", locale)}</h2></div><span class="status-badge status-muted">${renderUiText("actualGeneratedText", locale)}</span></div>
    <div class="markdown-content">${renderTutorMarkdown(caseResult.rawTutorResponse)}</div>
    <details class="audit-raw-details"><summary>${renderUiText("rawText", locale)}</summary><pre class="raw-text">${escapeHtml(caseResult.rawTutorResponse)}</pre></details>
  </section>`;
}

function renderJudgeEvidence(
  caseResult: TutorEvalCaseRunResult,
  locale: SiteLocale,
): string {
  const judge = caseResult.rawJudgeResult;
  if (judge === null) {
    return `<p class="muted">${renderUiText("noJudgeResult", locale)}</p>`;
  }
  const rubricEvidence = judge.rubricResults.length === 0
    ? `<p class="muted">${renderUiText("notAvailable", locale)}</p>`
    : `<ul class="audit-list">${judge.rubricResults.map((item) => `<li><div class="split-heading"><strong>${escapeHtml(item.rubricId)}</strong>${resultBadge(item.result, locale)}</div>${item.evidence === undefined ? `<p class="audit-evidence">${renderUiText("evidence", locale)}: ${renderUiText("notAvailable", locale)}</p>` : `<p class="audit-evidence">${renderUiText("evidence", locale)}: ${escapeHtml(item.evidence)}</p>`}</li>`).join("")}</ul>`;
  const criticalFailures = judge.criticalFailures.length === 0
    ? `<p class="muted">${renderUiText("noCriticalFailures", locale)}</p>`
    : `<ul class="audit-list">${judge.criticalFailures.map((failure) => `<li><strong>${escapeHtml(failure.type)} · ${escapeHtml(failure.severity)}</strong><p>${escapeHtml(failure.evidence)}</p></li>`).join("")}</ul>`;
  const factualErrors = judge.factualErrors.length === 0
    ? ""
    : `<div class="context-copy"><p class="quote-label">${renderUiText("reason", locale)}</p><ul class="audit-list">${judge.factualErrors.map((error) => `<li><strong>${escapeHtml(error.severity)}</strong><p>${escapeHtml(error.description)}</p></li>`).join("")}</ul></div>`;
  return `<p class="audit-evidence">${renderUiText("insufficientInformation", locale)}: ${escapeHtml(String(judge.insufficientInformation))}</p>
    <div class="context-copy"><p class="quote-label">${renderUiText("evidence", locale)}</p>${rubricEvidence}</div>
    <div class="context-copy"><p class="quote-label">${renderUiText("criticalFailure", locale)}</p>${criticalFailures}</div>
    ${factualErrors}
    <details class="audit-raw-details"><summary>${renderUiText("judgeRawResult", locale)}</summary>${renderCodeBlock(JSON.stringify(judge, null, 2), "json")}</details>`;
}

function renderConclusion(
  caseResult: TutorEvalCaseRunResult,
  locale: SiteLocale,
): string {
  const scores = Object.entries(caseResult.categoryScores).map(
    ([category, score]) => `<span class="dimension-pill">${categoryLabel(category, locale)}: ${escapeHtml(score === null ? "n/a" : score.toFixed(2))}</span>`,
  );
  const criticalFailures = caseResult.criticalFailures.length === 0
    ? `<p class="muted">${renderUiText("noCriticalFailures", locale)}</p>`
    : `<ul class="audit-list">${caseResult.criticalFailures.map((failure) => `<li><strong>${escapeHtml(failure.type)} · ${escapeHtml(failure.severity)}</strong><p>${escapeHtml(failure.evidence)}</p></li>`).join("")}</ul>`;
  return `<section class="panel detail-section audit-section" aria-labelledby="audit-judge-result">
    <div class="panel-heading"><div><p class="eyebrow">${renderUiText("judgeResult", locale)}</p><h2 id="audit-judge-result">${renderUiText("judgeResult", locale)}</h2></div>${resultBadge(caseResult.status, locale)}</div>
    <div class="audit-status"><span class="status-badge status-muted">${renderUiText("score", locale)}: ${escapeHtml(caseResult.overallScore === null ? "n/a" : caseResult.overallScore.toFixed(2))}</span><span class="status-badge status-muted">${renderUiText("qualityGate", locale)}: ${escapeHtml(caseResult.qualityGate)}</span><span class="status-badge status-muted">${renderUiText("answerLeakage", locale)}: ${escapeHtml(caseResult.answerLeakage ? "true" : "false")}</span></div>
    <div class="pill-row audit-status">${scores.join("")}</div>
    <div class="context-copy"><p class="quote-label">${renderUiText("criticalFailure", locale)}</p>${criticalFailures}</div>
    <div class="context-copy"><p class="quote-label">${renderUiText("judgeResult", locale)}</p>${renderJudgeEvidence(caseResult, locale)}</div>
    ${caseResult.diagnostics.length === 0 ? "" : `<div class="context-copy"><p class="quote-label">${renderUiText("reason", locale)}</p><ul class="audit-list">${caseResult.diagnostics.map((diagnostic) => `<li><strong>${escapeHtml(diagnostic.code)}</strong><p>${escapeHtml(diagnostic.message)}</p></li>`).join("")}</ul></div>`}
  </section>`;
}

function renderAuditAside(
  input: TutorEvaluationAuditPageInput,
  caseValue: TutorEvalCase,
  caseResult: TutorEvalCaseRunResult,
): string {
  const { artifact, dataset, locale } = input;
  const capabilityTags = caseValue.metadata.capabilityTags ?? [];
  const generationSpec = artifact.generationSpec;
  const tutorTokenUsage = caseResult.tokenUsage === null
    ? siteText(locale, "notAvailable")
    : JSON.stringify(caseResult.tokenUsage);
  const judgeMetrics = caseResult.judgeMetrics;
  return `<aside class="detail-side">
    <section class="panel detail-section audit-section" aria-labelledby="audit-case-meta">
      <p class="eyebrow">${renderUiText("case", locale)}</p><h2 id="audit-case-meta">${escapeHtml(caseValue.metadata.topic)}</h2>
      ${localizedKeyValueList([
        ["caseId", caseValue.id],
        ["caseVersion", caseValue.version],
        ["dataset", dataset.id],
        ["datasetVersion", dataset.version],
        ["targetLocale", caseValue.locale ?? "en"],
        ["runLabel", `${caseResult.runIndex} / ${artifact.evaluation.runsPerCase}`],
      ], locale)}
      <p class="eyebrow">${renderUiText("capability", locale)}</p>${renderDimensionPills(capabilityTags)}
    </section>
    <section class="panel detail-section audit-section" aria-labelledby="audit-run-meta">
      <p class="eyebrow">${renderUiText("auditRun", locale)}</p><h2 id="audit-run-meta">${escapeHtml(artifact.evaluation.runId)}</h2>
      ${localizedKeyValueList([
        ["status", caseResult.status],
        ["model", artifact.evaluation.tutor.model],
        ["provider", artifact.evaluation.tutor.provider],
        ["evaluatorVersion", artifact.evaluation.evaluatorVersion ?? "legacy"],
        ["coverage", artifact.artifactMetadata?.status ?? siteText(locale, "preliminary")],
        ...(artifact.artifactMetadata?.calibrationStatus === undefined ? [] : [["calibration", artifact.artifactMetadata.calibrationStatus] as const]),
      ], locale)}
      ${generationSpec === undefined ? `<p class="muted">${renderUiText("generationSpec", locale)}: ${renderUiText("notAvailable", locale)}</p>` : localizedKeyValueList([
        ["generationSpec", `${generationSpec.specId}@${generationSpec.specVersion}`],
        ["promptVersion", `${generationSpec.prompt.id}@${generationSpec.prompt.version}`],
      ], locale)}
      ${artifact.corpusId === undefined ? "" : `<p class="audit-evidence">${renderUiText("corpus", locale)}: ${escapeHtml(artifact.corpusId)}${artifact.corpusVersion === undefined ? "" : `@${escapeHtml(artifact.corpusVersion)}`}</p>`}
      ${artifact.evaluation.judge === null ? "" : `<p class="eyebrow">${renderUiText("judge", locale)}</p>${localizedKeyValueList([
        ["provider", artifact.evaluation.judge.provider],
        ["model", artifact.evaluation.judge.model],
        ["promptVersion", artifact.evaluation.judge.promptVersion],
      ], locale)}`}
    </section>
    <section class="panel detail-section audit-section" aria-labelledby="audit-metrics">
      <p class="eyebrow">${renderUiText("metrics", locale)}</p><h2 id="audit-metrics">${renderUiText("metrics", locale)}</h2>
      ${localizedKeyValueList([
        ["latency", caseResult.latencyMs === null ? siteText(locale, "notAvailable") : `${caseResult.latencyMs} ms`],
        ["tokenUsage", tutorTokenUsage],
        ["cost", caseResult.cost === null ? siteText(locale, "notAvailable") : String(caseResult.cost)],
        ...(judgeMetrics === undefined || judgeMetrics === null ? [] : [
          ["attempts", String(judgeMetrics.attempts)] as const,
          ["latency", `${judgeMetrics.latencyMs} ms`] as const,
        ]),
      ], locale)}
    </section>
  </aside>`;
}

function auditRoute(runId: string, caseId: string, runIndex: number): string {
  return `/audit/runs/${encodeURIComponent(runId)}/cases/${encodeURIComponent(caseId)}/${runIndex}/`;
}

export function renderTutorEvaluationAuditPage(
  input: TutorEvaluationAuditPageInput,
): SitePage {
  const caseValue = input.dataset.cases.find((item) => item.id === input.caseId);
  const caseResult = input.artifact.evaluation.caseResults.find(
    (item) => item.caseId === input.caseId && item.runIndex === input.runIndex,
  );
  const route = auditRoute(input.artifact.evaluation.runId, input.caseId, input.runIndex);
  if (caseValue === undefined || caseResult === undefined) {
    return page(
      `${siteText(input.locale, "case")} — Tutor Benchmark`,
      "Audit case unavailable.",
      route,
      `<section class="page-intro"><div class="shell narrow-shell"><a class="back-link" href="/audit/runs/${encodeURIComponent(input.artifact.evaluation.runId)}/">${renderUiText("backToAudit", input.locale)}</a><h1>${renderUiText("notAvailable", input.locale)}</h1>${renderEmptyState(siteText(input.locale, "missing"), siteText(input.locale, "notAvailable"))}</div></section>`,
    );
  }
  return page(
    `${caseValue.metadata.topic} — Tutor Benchmark`,
    `Audit detail for ${caseValue.id}, run ${caseResult.runIndex}.`,
    route,
    `<section class="page-intro"><div class="shell narrow-shell"><a class="back-link" href="/audit/runs/${encodeURIComponent(input.artifact.evaluation.runId)}/">${renderUiText("backToAudit", input.locale)}</a><div class="eyebrow-row">${renderStatusBadge(siteText(input.locale, "privateAudit"), "preview")}<span class="eyebrow">${escapeHtml(caseValue.id)}</span></div><h1>${escapeHtml(caseValue.metadata.topic)}</h1><p class="lede">${renderUiText("actualGeneratedText", input.locale)}</p></div></section>
    <section class="section"><div class="shell detail-grid"><div class="detail-main">${renderCaseContext(caseValue, input.locale)}${renderEvaluationCriteria(caseValue, caseResult, input.locale)}${renderTutorResponse(caseResult, input.locale)}${renderConclusion(caseResult, input.locale)}</div>${renderAuditAside(input, caseValue, caseResult)}</div></section>`,
  );
}

export function renderTutorEvaluationAuditIndexPage(
  input: TutorEvaluationAuditIndexInput,
): SitePage {
  const { artifact, dataset, locale } = input;
  const runId = artifact.evaluation.runId;
  const caseLinks = artifact.evaluation.caseResults.map((caseResult) => {
    const caseValue = dataset.cases.find((item) => item.id === caseResult.caseId);
    return `<li><a class="text-link" href="${auditRoute(runId, caseResult.caseId, caseResult.runIndex)}">${escapeHtml(caseResult.caseId)} · ${renderUiText("runLabel", locale)} ${caseResult.runIndex}</a><span>${caseValue === undefined ? "" : ` · ${escapeHtml(caseValue.metadata.topic)}`} · ${resultBadge(caseResult.status, locale)}</span></li>`;
  });
  return page(
    `${siteText(locale, "auditRun")} — Tutor Benchmark`,
    "Private, local audit view for a validated TutorEval evaluation artifact.",
    `/audit/runs/${encodeURIComponent(runId)}/`,
    `<section class="page-intro"><div class="shell narrow-shell"><div class="eyebrow-row">${renderStatusBadge(siteText(locale, "privateAudit"), "preview")}<span class="eyebrow">${escapeHtml(runId)}</span></div><h1>${renderUiText("auditRun", locale)}</h1><p class="lede">${renderUiText("originalTutorResponse", locale)} · ${escapeHtml(artifact.evaluation.datasetId)}@${escapeHtml(artifact.evaluation.datasetVersion)}</p></div></section><section class="section"><div class="shell detail-grid"><main class="detail-main"><section class="panel detail-section audit-section"><p class="eyebrow">${renderUiText("coverage", locale)}</p><h2>${renderUiText("auditCases", locale)}</h2>${localizedKeyValueList([["case", String(artifact.evaluation.caseCount)], ["runLabel", String(artifact.evaluation.caseRunCount)], ["pass", String(artifact.evaluation.passedCount)], ["fail", String(artifact.evaluation.failedCount)], ["error", String(artifact.evaluation.errorCount)]], locale)}<ul class="audit-list">${caseLinks.join("")}</ul></section></main><aside class="detail-side"><section class="panel detail-section audit-section"><p class="eyebrow">${renderUiText("model", locale)}</p><h2>${escapeHtml(artifact.evaluation.tutor.model)}</h2>${localizedKeyValueList([["provider", artifact.evaluation.tutor.provider], ["promptVersion", artifact.evaluation.tutor.promptVersion], ["evaluatorVersion", artifact.evaluation.evaluatorVersion ?? "legacy"], ["coverage", artifact.artifactMetadata?.status ?? siteText(locale, "preliminary")], ...(artifact.artifactMetadata?.calibrationStatus === undefined ? [] : [["calibration", artifact.artifactMetadata.calibrationStatus] as const])], locale)}</section></aside></div></section>`,
  );
}

export { auditRoute };
