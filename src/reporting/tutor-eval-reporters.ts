import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import {
  assertValidTutorEvalRunResult,
  type TutorEvalCategory,
  type TutorEvalRunResult,
} from "../contracts/index.js";

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
  return [
    `Dataset: ${result.datasetId}@${result.datasetVersion}`,
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
