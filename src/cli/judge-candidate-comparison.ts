import { resolve } from "node:path";

import {
  createDeepSeekJudge,
  DEEPSEEK_JUDGE_BASE_URL,
  DeepSeekJudgeConfigurationError,
  readDeepSeekJudgeEnvironment,
} from "../providers/deepseek/index.js";
import {
  createMiniMaxJudge,
  MiniMaxJudgeConfigurationError,
  readMiniMaxJudgeEnvironment,
  MINIMAX_JUDGE_PATH,
} from "../providers/minimax/index.js";
import {
  formatJudgeCandidateComparisonReport,
  loadTutorEvalPedagogyJudgePrompt,
  runJudgeCandidateComparison,
  type JudgeCandidateComparisonCandidate,
  type JudgeCandidateComparisonReport,
} from "../judge/index.js";
import { loadTutorEvalDataset } from "../datasets/index.js";
import { writeTutorCliJson } from "./tutor-case-common.js";
import {
  nextTutorbenchValue,
  positiveTutorbenchInteger,
  tutorbenchOptionValue,
  TutorbenchCliUsageError,
} from "./tutorbench-common.js";
import { createWordContextDiscriminationComparisonFixture } from "../judge/word-context-discrimination.js";

export type JudgeCandidateComparisonFixtureId = "word-context";

export interface JudgeCandidateComparisonCliOptions {
  readonly fixture: JudgeCandidateComparisonFixtureId;
  readonly deepSeekJudge: boolean;
  readonly miniMaxJudge: boolean;
  readonly runsPerCandidate: number;
  readonly outputPath?: string;
  readonly help: boolean;
}

export function parseJudgeCandidateComparisonArgs(
  args: readonly string[],
): JudgeCandidateComparisonCliOptions {
  let fixture: JudgeCandidateComparisonFixtureId = "word-context";
  let deepSeekJudge = false;
  let miniMaxJudge = false;
  let runsPerCandidate = 1;
  let outputPath: string | undefined;

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--help" || argument === "-h") {
      return {
        fixture,
        deepSeekJudge: false,
        miniMaxJudge: false,
        runsPerCandidate,
        help: true,
      };
    }
    if (argument === "--fixture") {
      const value = nextTutorbenchValue(args, index, "--fixture");
      if (value !== "word-context") {
        throw new TutorbenchCliUsageError("--fixture currently supports only word-context.");
      }
      fixture = value;
      index += 1;
      continue;
    }
    const fixtureValue = tutorbenchOptionValue(argument ?? "", "--fixture");
    if (fixtureValue !== undefined) {
      if (fixtureValue !== "word-context") {
        throw new TutorbenchCliUsageError("--fixture currently supports only word-context.");
      }
      fixture = fixtureValue;
      continue;
    }
    if (argument === "--judge-deepseek") {
      deepSeekJudge = true;
      continue;
    }
    if (argument === "--judge-minimax") {
      miniMaxJudge = true;
      continue;
    }
    if (argument === "--runs-per-candidate") {
      runsPerCandidate = positiveTutorbenchInteger(
        nextTutorbenchValue(args, index, "--runs-per-candidate"),
        "--runs-per-candidate",
      );
      index += 1;
      continue;
    }
    const runsValue = tutorbenchOptionValue(argument ?? "", "--runs-per-candidate");
    if (runsValue !== undefined) {
      runsPerCandidate = positiveTutorbenchInteger(runsValue, "--runs-per-candidate");
      continue;
    }
    if (argument === "--output") {
      outputPath = resolve(nextTutorbenchValue(args, index, "--output"));
      index += 1;
      continue;
    }
    const outputValue = tutorbenchOptionValue(argument ?? "", "--output");
    if (outputValue !== undefined) {
      outputPath = resolve(outputValue);
      continue;
    }
    throw new TutorbenchCliUsageError(`Unknown option: ${argument ?? ""}`);
  }

  if (!deepSeekJudge && !miniMaxJudge) {
    throw new TutorbenchCliUsageError(
      "At least one of --judge-deepseek or --judge-minimax is required.",
    );
  }
  return {
    fixture,
    deepSeekJudge,
    miniMaxJudge,
    runsPerCandidate,
    ...(outputPath === undefined ? {} : { outputPath }),
    help: false,
  };
}

export function printJudgeCandidateComparisonHelp(): void {
  console.log(`Usage: tutorbench judge-candidate-comparison [options]

Runs the fixed diagnostic fixture through one or more explicitly configured
Judge candidates. No Tutor provider is called.

Options:
  --fixture <id>             word-context (default)
  --judge-deepseek           Use DEEPSEEK_JUDGE_* configuration
  --judge-minimax            Use MINIMAX_JUDGE_* configuration
  --runs-per-candidate <n>   Repetitions per candidate (default: 1)
  --output <path>            Write the comparison report JSON
  --help                     Show this help

The command prints the planned Judge call count before any live Judge call.
Expected-label agreement is diagnostic agreement with developer-authored
expectations, not accuracy or calibration. No winner is inferred automatically.
`);
}

function deepSeekCandidate(
  prompt: string,
  environment: NodeJS.ProcessEnv,
): JudgeCandidateComparisonCandidate {
  const configuration = readDeepSeekJudgeEnvironment(environment);
  if (configuration.model === null) {
    throw new DeepSeekJudgeConfigurationError("model_missing");
  }
  const model = configuration.model;
  return {
    id: `deepseek/${model}`,
    provider: "deepseek",
    model,
    promptId: "tutor-eval-pedagogy-judge-system",
    promptVersion: "0.9",
    generationProfile: {
      thinkingMode: configuration.thinkingMode,
      reasoningEffort: configuration.reasoningEffort ?? null,
      temperature: configuration.temperature ?? null,
      maxOutputTokens: configuration.maxOutputTokens,
      seedControl: "unsupported",
    },
    executionProfile: {
      timeoutMs: configuration.timeoutMs,
      maxAttempts: configuration.maxAttempts,
    },
    transportProfile: {
      baseUrl: DEEPSEEK_JUDGE_BASE_URL,
      endpointPath: "/chat/completions",
    },
    createJudge: () => {
      const judge = createDeepSeekJudge({
        model,
        prompt,
        promptId: "tutor-eval-pedagogy-judge-system",
        promptVersion: "0.9",
        environment,
      });
      return { ...judge.descriptor, evaluateWithMetrics: judge.evaluateWithMetrics };
    },
  };
}

function miniMaxCandidate(
  prompt: string,
  environment: NodeJS.ProcessEnv,
): JudgeCandidateComparisonCandidate {
  const configuration = readMiniMaxJudgeEnvironment(environment);
  if (configuration.model === null) {
    throw new MiniMaxJudgeConfigurationError("model_missing");
  }
  const model = configuration.model;
  return {
    id: `minimax/${model}`,
    provider: "minimax",
    model,
    promptId: "tutor-eval-pedagogy-judge-system",
    promptVersion: "0.9",
    generationProfile: {
      thinkingMode: "provider-default",
      temperature: configuration.temperature ?? null,
      maxOutputTokens: configuration.maxOutputTokens,
      maxOutputTokensField: configuration.maxOutputTokensField,
      reasoningSeparationMode: configuration.reasoningSplit,
      jsonMode: configuration.jsonMode,
      seedControl: "unsupported",
    },
    executionProfile: {
      timeoutMs: configuration.timeoutMs,
      maxAttempts: configuration.maxAttempts,
    },
    transportProfile: {
      baseUrl: configuration.baseUrl,
      endpointPath: MINIMAX_JUDGE_PATH,
    },
    createJudge: () => {
      const judge = createMiniMaxJudge({
        model,
        prompt,
        promptId: "tutor-eval-pedagogy-judge-system",
        promptVersion: "0.9",
        environment,
      });
      return { ...judge.descriptor, evaluateWithMetrics: judge.evaluateWithMetrics };
    },
  };
}

function printPlan(
  candidateCount: number,
  fixtureCount: number,
  runsPerCandidate: number,
): void {
  console.log(`Candidates: ${candidateCount}`);
  console.log(`Fixtures: ${fixtureCount}`);
  console.log(`Runs per candidate: ${runsPerCandidate}`);
  console.log(
    `Planned Judge calls: ${candidateCount * fixtureCount * runsPerCandidate}`,
  );
}

export async function runJudgeCandidateComparisonCli(
  options: JudgeCandidateComparisonCliOptions,
): Promise<JudgeCandidateComparisonReport> {
  if (options.help) {
    throw new TutorbenchCliUsageError(
      "Use --help through the tutorbench command dispatcher for usage.",
    );
  }
  const environment = { ...process.env };
  const prompt = await loadTutorEvalPedagogyJudgePrompt();
  const fixture = createWordContextDiscriminationComparisonFixture(
    () => loadTutorEvalDataset("tutor-eval-v0.2a", "0.2a.5"),
  );
  const candidates = [
    ...(options.deepSeekJudge ? [deepSeekCandidate(prompt, environment)] : []),
    ...(options.miniMaxJudge ? [miniMaxCandidate(prompt, environment)] : []),
  ];
  printPlan(candidates.length, fixture.expectedFixtureIds.length, options.runsPerCandidate);
  const report = await runJudgeCandidateComparison({
    fixture,
    candidates,
    runsPerCandidate: options.runsPerCandidate,
  });
  const outputPath = options.outputPath ?? resolve(
    process.cwd(),
    "artifacts",
    "judge-candidate-comparison.json",
  );
  await writeTutorCliJson(report, outputPath);
  console.log(formatJudgeCandidateComparisonReport(report));
  console.log(`JSON report: ${outputPath}`);
  if (report.candidates.some((candidate) => candidate.metrics.executionErrors.count > 0)) {
    process.exitCode = 1;
  }
  return report;
}
