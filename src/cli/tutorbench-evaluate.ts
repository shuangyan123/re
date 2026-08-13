import { resolve } from "node:path";

import {
  BenchmarkConfigurationError,
  type TutorResponseCorpusEvaluationResult,
} from "../contracts/index.js";
import { loadTutorResponseCorpus } from "../corpus/index.js";
import { loadTutorEvalDataset } from "../datasets/index.js";
import {
  loadTutorEvalPedagogyJudgePrompt,
  TUTOR_EVAL_PEDAGOGY_JUDGE_PROMPT_ID,
  TUTOR_EVAL_PEDAGOGY_JUDGE_PROMPT_VERSION,
} from "../judge/index.js";
import { runTutorResponseCorpus } from "../runner/index.js";
import { formatTutorEvalSummary } from "../reporting/index.js";
import { reportTutorCliError, writeTutorCliJson } from "./tutor-case-common.js";
import type { TutorBaselineArtifactMetadata } from "../collection/index.js";
import {
  nextTutorbenchValue,
  tutorbenchOptionValue,
} from "./tutorbench-common.js";

export interface BenchmarkCorpusCliOptions {
  readonly corpusPath: string;
  readonly requireFull: boolean;
  readonly liveJudge: boolean;
  readonly outputPath?: string;
  readonly help: boolean;
}

export type TutorBaselineEvaluationArtifact = TutorResponseCorpusEvaluationResult & {
  readonly artifactMetadata: TutorBaselineArtifactMetadata;
};

export function parseBenchmarkCorpusCliOptions(
  args: readonly string[],
): BenchmarkCorpusCliOptions {
  let corpusPath: string | undefined;
  let requireFull = false;
  let liveJudge = false;
  let outputPath: string | undefined;
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--help" || argument === "-h") {
      return { corpusPath: "", requireFull: false, liveJudge: false, help: true };
    }
    if (argument === "--full" || argument === "--require-full") {
      requireFull = true;
    } else if (argument === "--judge-openai" || argument === "--live-judge") {
      liveJudge = true;
    } else if (argument === "--corpus") {
      corpusPath = resolve(nextTutorbenchValue(args, index, "--corpus"));
      index += 1;
    } else {
      const corpusValue = tutorbenchOptionValue(argument ?? "", "--corpus");
      if (corpusValue !== undefined) {
        corpusPath = resolve(corpusValue);
      } else if (argument === "--output") {
        outputPath = resolve(nextTutorbenchValue(args, index, "--output"));
        index += 1;
      } else {
        const outputValue = tutorbenchOptionValue(argument ?? "", "--output");
        if (outputValue !== undefined) {
          outputPath = resolve(outputValue);
        } else {
          throw new BenchmarkConfigurationError("tutor_response_corpus_invalid");
        }
      }
    }
  }
  if (corpusPath === undefined || corpusPath.length === 0) {
    throw new BenchmarkConfigurationError("tutor_response_corpus_invalid");
  }
  return {
    corpusPath,
    requireFull,
    liveJudge,
    ...(outputPath === undefined ? {} : { outputPath }),
    help: false,
  };
}

export function printBenchmarkCorpusHelp(): void {
  console.log(`Usage: tutorbench evaluate --corpus <path> [options]

Frozen responses are replayed locally; no Tutor provider is called.

Options:
  --corpus <path>       Frozen TutorResponseCorpus JSON file
  --full                Require a complete corpus before evaluation
  --judge-openai        Opt in to the existing live OpenAI Judge provider
  --live-judge          Alias for --judge-openai
  --output <path>       Write the preliminary evaluation artifact to this path
  --help                Show this help
`);
}

async function createJudgeIfRequested(liveJudge: boolean) {
  if (!liveJudge) {
    return undefined;
  }
  const {
    createOpenAIJudge,
    OpenAIJudgeConfigurationError,
    readOpenAIJudgeEnvironment,
  } = await import("../providers/openai/index.js");
  const environment = readOpenAIJudgeEnvironment();
  if (environment.model === null) {
    throw new OpenAIJudgeConfigurationError("model_missing");
  }
  const model: string = environment.model;
  const prompt = await loadTutorEvalPedagogyJudgePrompt();
  const judge = createOpenAIJudge({
    model,
    prompt,
    promptId: TUTOR_EVAL_PEDAGOGY_JUDGE_PROMPT_ID,
    promptVersion: TUTOR_EVAL_PEDAGOGY_JUDGE_PROMPT_VERSION,
    ...(environment.temperature === undefined
      ? {}
      : { temperature: environment.temperature }),
    ...(environment.reasoningEffort === undefined
      ? {}
      : { reasoningEffort: environment.reasoningEffort }),
    timeoutMs: environment.timeoutMs,
    maxAttempts: environment.maxAttempts,
  });
  return {
    ...judge.descriptor,
    evaluate: judge.evaluate,
    evaluateWithMetrics: judge.evaluateWithMetrics,
  } as const;
}

export async function evaluateTutorResponseCorpus(
  options: BenchmarkCorpusCliOptions,
): Promise<TutorResponseCorpusEvaluationResult> {
  const corpus = await loadTutorResponseCorpus(options.corpusPath);
  const dataset = await loadTutorEvalDataset(corpus.datasetId);
  const judge = await createJudgeIfRequested(options.liveJudge);
  return runTutorResponseCorpus({
    corpus,
    dataset,
    requireFull: options.requireFull,
    ...(judge === undefined ? {} : { judge }),
    runId: `benchmark-corpus-${corpus.corpusId}`,
  });
}

export function buildTutorBaselineEvaluationArtifact(
  result: TutorResponseCorpusEvaluationResult,
): TutorBaselineEvaluationArtifact {
  return {
    ...result,
    artifactMetadata: {
      status: "preliminary",
      calibrationStatus: "uncalibrated",
      publicLeaderboardEligible: false,
    },
  };
}

export function printTutorResponseCorpusEvaluation(
  result: TutorResponseCorpusEvaluationResult,
  outputPath: string,
  preliminary: boolean,
): void {
  console.log(`Corpus: ${result.corpusId}@${result.corpusVersion}`);
  console.log(`Coverage: ${result.coverage}`);
  console.log(`Selected cases: ${result.selectedCaseCount}`);
  console.log(`Available responses: ${result.availableResponseCount}`);
  console.log(`Missing cases: ${result.missingCaseCount}`);
  if (preliminary) {
    console.log("Status: preliminary");
    console.log("Calibration: uncalibrated");
    console.log("Public leaderboard eligible: no");
  }
  console.log(formatTutorEvalSummary(result.evaluation));
  console.log(`JSON result: ${outputPath}`);
}

export async function main(args = process.argv.slice(2)): Promise<void> {
  const options = parseBenchmarkCorpusCliOptions(args);
  if (options.help) {
    printBenchmarkCorpusHelp();
    return;
  }
  const result = await evaluateTutorResponseCorpus(options);
  const outputPath = options.outputPath ?? resolve(process.cwd(), "artifacts", "tutor-eval-corpus-result.json");
  await writeTutorCliJson(buildTutorBaselineEvaluationArtifact(result), outputPath);
  printTutorResponseCorpusEvaluation(result, outputPath, true);
  if (result.evaluation.errorCount > 0) {
    process.exitCode = 1;
  }
}

if (process.argv[1]?.endsWith("tutorbench-evaluate.js")) {
  try {
    await main();
  } catch (error) {
    reportTutorCliError(error);
  }
}
