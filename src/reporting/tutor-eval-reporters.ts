import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import {
  assertValidTutorEvalRunResult,
  resolveTutorCaseLocale,
  type TutorEvalCategory,
  type TutorEvalCaseRunResult,
  type TutorEvalDataset,
  type TutorCaseLocale,
  type TutorEvalRunResult,
} from "../contracts/index.js";
import {
  aggregateTutorEvalCategoryScores,
  aggregateTutorEvalOverallScore,
} from "../scoring/index.js";

const categories: readonly TutorEvalCategory[] = [
  "correctness",
  "diagnosis",
  "guidance",
  "adaptation",
  "actionability",
];

function formatScore(score: number | null): string {
  return score === null ? "n/a" : score.toFixed(2);
}

export interface TutorEvalLocaleBreakdown {
  readonly locale: TutorCaseLocale;
  /** Unique cases represented in this locale group. */
  readonly caseCount: number;
  /** Case runs represented in this locale group. */
  readonly caseRunCount: number;
  readonly passedCount: number;
  readonly failedCount: number;
  readonly errorCount: number;
  readonly categoryScores: TutorEvalRunResult["categoryScores"];
  readonly overallScore: number | null;
  readonly criticalFailureRate: number;
  readonly answerLeakageRate: number;
}

function aggregateLocaleCaseResults(
  caseResults: readonly TutorEvalCaseRunResult[],
): Omit<TutorEvalLocaleBreakdown, "locale" | "caseCount" | "caseRunCount"> {
  const aggregates = caseResults
    .filter((result) => result.overallScore !== null)
    .map((result) => ({
      categoryScores: result.categoryScores,
      overallScore: result.overallScore,
      qualityGate: result.qualityGate,
      passed: result.passed,
    }));
  const hasEvaluationErrors = caseResults.some((result) => result.status === "error");
  const categoryScores = hasEvaluationErrors
    ? aggregateTutorEvalCategoryScores([])
    : aggregateTutorEvalCategoryScores(aggregates);
  const failureCount = caseResults.filter((result) => result.criticalFailures.length > 0).length;
  const leakageCount = caseResults.filter((result) => result.answerLeakage).length;
  return {
    passedCount: caseResults.filter((result) => result.status === "passed").length,
    failedCount: caseResults.filter((result) => result.status === "failed").length,
    errorCount: caseResults.filter((result) => result.status === "error").length,
    categoryScores,
    overallScore: hasEvaluationErrors
      ? null
      : aggregateTutorEvalOverallScore(caseResults.map((result) => result.overallScore)),
    criticalFailureRate: caseResults.length === 0 ? 0 : failureCount / caseResults.length,
    answerLeakageRate: caseResults.length === 0 ? 0 : leakageCount / caseResults.length,
  };
}

/**
 * Groups an existing run result by resolved case locale. This is a breakdown
 * over the same case-level scores; it does not introduce cross-locale
 * weighting or a second scoring formula.
 */
export function buildTutorEvalLocaleBreakdowns(
  result: TutorEvalRunResult,
  dataset?: TutorEvalDataset,
): readonly TutorEvalLocaleBreakdown[] {
  assertValidTutorEvalRunResult(result);
  const datasetLocales = new Map(
    dataset?.cases.map((tutorEvalCase) => [
      tutorEvalCase.id,
      resolveTutorCaseLocale(tutorEvalCase.locale),
    ]) ?? [],
  );
  const grouped = new Map<TutorCaseLocale, TutorEvalCaseRunResult[]>();
  for (const caseResult of result.caseResults) {
    const locale = resolveTutorCaseLocale(
      caseResult.locale ?? datasetLocales.get(caseResult.caseId),
    );
    const cases = grouped.get(locale) ?? [];
    cases.push(caseResult);
    grouped.set(locale, cases);
  }
  return [...grouped.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([locale, caseResults]) => ({
      locale,
      caseCount: new Set(caseResults.map((caseResult) => caseResult.caseId)).size,
      caseRunCount: caseResults.length,
      ...aggregateLocaleCaseResults(caseResults),
    }));
}

function localeLabel(locale: TutorCaseLocale): string {
  return locale === "en" ? "English" : locale === "zh-CN" ? "中文" : locale;
}

const chineseCategoryLabels: Readonly<Record<TutorEvalCategory, string>> = {
  correctness: "正确性",
  diagnosis: "诊断能力",
  guidance: "引导能力",
  adaptation: "适应能力",
  actionability: "可执行性",
};

function categoryLabel(category: TutorEvalCategory, locale: TutorCaseLocale): string {
  return locale === "zh-CN" ? chineseCategoryLabels[category] : category;
}

function localeMetricLabels(locale: TutorCaseLocale): Readonly<{
  readonly cases: string;
  readonly runs: string;
  readonly passed: string;
  readonly failed: string;
  readonly errors: string;
  readonly criticalFailureRate: string;
  readonly answerLeakageRate: string;
  readonly overall: string;
}> {
  return locale === "zh-CN"
    ? {
        cases: "案例",
        runs: "次运行",
        passed: "通过",
        failed: "失败",
        errors: "错误",
        criticalFailureRate: "严重失败率",
        answerLeakageRate: "答案泄露率",
        overall: "总体",
      }
    : {
        cases: "Cases",
        runs: "runs",
        passed: "Passed",
        failed: "Failed",
        errors: "Errors",
        criticalFailureRate: "Critical failure rate",
        answerLeakageRate: "Answer leakage rate",
        overall: "Overall",
      };
}

function formatLocaleBreakdown(breakdown: TutorEvalLocaleBreakdown): readonly string[] {
  const labels = localeMetricLabels(breakdown.locale);
  return [
    `${localeLabel(breakdown.locale)} (${breakdown.locale}):`,
    `  ${labels.cases}: ${breakdown.caseCount} (${breakdown.caseRunCount} ${labels.runs})`,
    `  ${labels.passed}: ${breakdown.passedCount}`,
    `  ${labels.failed}: ${breakdown.failedCount}`,
    `  ${labels.errors}: ${breakdown.errorCount}`,
    ...categories.map(
      (category) => `  ${categoryLabel(category, breakdown.locale)}: ${formatScore(breakdown.categoryScores[category])}`,
    ),
    `  ${labels.criticalFailureRate}: ${(breakdown.criticalFailureRate * 100).toFixed(2)}%`,
    `  ${labels.answerLeakageRate}: ${(breakdown.answerLeakageRate * 100).toFixed(2)}%`,
    `  ${labels.overall}: ${formatScore(breakdown.overallScore)}`,
  ];
}

export function formatTutorEvalSummary(result: TutorEvalRunResult): string {
  assertValidTutorEvalRunResult(result);
  const categoryLines = categories.map(
    (category) => `${category}: ${formatScore(result.categoryScores[category])}`,
  );
  const judgeMetrics = result.caseResults.flatMap((caseResult) =>
    caseResult.judgeMetrics === undefined || caseResult.judgeMetrics === null
      ? []
      : [caseResult.judgeMetrics],
  );
  const judgeLines =
    result.judge === null
      ? []
      : [
          `Judge: ${result.judge.provider}/${result.judge.model}`,
          `Judge prompt: ${result.judge.promptId ?? "unspecified"}@${result.judge.promptVersion}`,
          ...(judgeMetrics.length === 0
            ? []
            : [
                `Judge calls: ${judgeMetrics.length}`,
                `Judge latency: ${judgeMetrics.reduce(
                  (total, metrics) => total + metrics.latencyMs,
                  0,
                )}ms`,
                `Judge tokens: ${judgeMetrics.every(
                  (metrics) => metrics.tokenUsage === null,
                )
                  ? "n/a"
                  : judgeMetrics.reduce(
                      (total, metrics) =>
                        total + (metrics.tokenUsage?.totalTokens ?? 0),
                      0,
                    )}`,
              ]),
        ];
  const localeBreakdownLines = buildTutorEvalLocaleBreakdowns(result).flatMap(
    (breakdown) => ["", ...formatLocaleBreakdown(breakdown)],
  );
  return [
    `Dataset: ${result.datasetId}@${result.datasetVersion}`,
    `Evaluator: ${result.evaluatorVersion ?? "legacy"}`,
    `Tutor: ${result.tutor.provider}/${result.tutor.model}`,
    `Prompt: ${result.tutor.promptVersion}`,
    ...judgeLines,
    `Cases: ${result.caseCount} (${result.caseRunCount} runs)`,
    `Passed: ${result.passedCount}`,
    `Failed: ${result.failedCount}`,
    `Errors: ${result.errorCount}`,
    ...categoryLines,
    `Overall: ${formatScore(result.overallScore)}`,
    `Critical failure rate: ${(result.criticalFailureRate * 100).toFixed(2)}%`,
    `Answer leakage rate: ${(result.answerLeakageRate * 100).toFixed(2)}%`,
    "",
    "Locale breakdown:",
    ...localeBreakdownLines,
  ].join("\n");
}

export async function writeTutorEvalResult(
  result: TutorEvalRunResult,
  outputPath: string,
): Promise<void> {
  assertValidTutorEvalRunResult(result);
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
}
