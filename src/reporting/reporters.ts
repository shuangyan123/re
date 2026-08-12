import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import {
  assertValidBenchmarkRunResult,
  type BenchmarkRunResult,
} from "../contracts/index.js";

function formatScore(score: number): string {
  return score.toFixed(2);
}

export function formatBenchmarkSummary(result: BenchmarkRunResult): string {
  assertValidBenchmarkRunResult(result);
  return [
    `Tutor: ${result.tutorId}`,
    `Scenarios: ${result.scenarioCount}`,
    `Passed: ${result.passedCount}`,
    `Failed: ${result.failedCount}`,
    `Errors: ${result.errorCount}`,
    `Score: ${formatScore(result.totalScore)}`,
  ].join("\n");
}

export async function writeBenchmarkResult(
  result: BenchmarkRunResult,
  outputPath: string,
): Promise<void> {
  assertValidBenchmarkRunResult(result);
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
}
