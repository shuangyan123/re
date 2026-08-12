import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import {
  BenchmarkConfigurationError,
  parseTutorRubrics,
  parseTutorScenarios,
  type TutorRubric,
  type TutorScenario,
} from "../contracts/index.js";
import { ScriptedTutor } from "../adapters/scripted-tutor.js";
import { runBenchmark } from "../runner/index.js";
import {
  formatBenchmarkSummary,
  writeBenchmarkResult,
} from "../reporting/index.js";

async function readJson(path: string): Promise<unknown> {
  const contents = await readFile(path, "utf8");
  return JSON.parse(contents) as unknown;
}

const guidedResponses: Readonly<Record<string, string>> = {
  "math-fraction-guidance-001":
    "Let's find a common denominator first. What number can both 2 and 4 divide into?",
  "concept-contrast-001":
    "Evaporation happens at the surface and can happen below the boiling point, while boiling happens throughout the liquid at its boiling point.",
  "answer-request-guidance-001":
    "Try thinking of 7 groups of 6. How many items would you count if you added six seven times?",
  "non-empty-response-001":
    "Photosynthesis is the process plants use to make food from light, water, and carbon dioxide.",
  "fraction-vocabulary-001":
    "The numerator is the top number and the denominator is the bottom number; together they describe parts of a whole.",
};

export async function loadSyntheticBenchmarkInputs(): Promise<{
  readonly scenarios: TutorScenario[];
  readonly rubrics: TutorRubric[];
}> {
  const scenariosPath = resolve(
    process.cwd(),
    "scenarios",
    "synthetic",
    "scenarios.json",
  );
  const rubricsPath = resolve(process.cwd(), "rubrics", "synthetic-rubrics.json");
  const [scenarioValue, rubricValue] = await Promise.all([
    readJson(scenariosPath),
    readJson(rubricsPath),
  ]);
  return {
    scenarios: parseTutorScenarios(scenarioValue),
    rubrics: parseTutorRubrics(rubricValue),
  };
}

export async function main(): Promise<void> {
  const { scenarios, rubrics } = await loadSyntheticBenchmarkInputs();
  const tutor = new ScriptedTutor({
    id: "scripted-guided-tutor",
    responses: guidedResponses,
  });
  const result = await runBenchmark(tutor, scenarios, rubrics, {
    runId: "synthetic-foundation-run",
  });
  console.log(formatBenchmarkSummary(result));
  await writeBenchmarkResult(
    result,
    resolve(process.cwd(), "artifacts", "benchmark-result.json"),
  );
}

try {
  await main();
} catch (error) {
  if (error instanceof BenchmarkConfigurationError) {
    console.error(`${error.code}: ${error.message}`);
  } else {
    console.error("runner_failed: Benchmark runner failed.");
  }
  process.exitCode = 1;
}
