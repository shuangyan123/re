import { resolve } from "node:path";

import {
  BenchmarkConfigurationError,
  type TutorResponseCorpusEvaluationResult,
} from "../contracts/index.js";
import { loadTutorResponseCorpus } from "../corpus/index.js";
import { loadTutorEvalDataset } from "../datasets/index.js";
import {
  TUTOR_EVAL_DATASET_ID,
} from "../contracts/index.js";
import {
  loadTutorEvalPedagogyJudgePrompt,
  TUTOR_EVAL_PEDAGOGY_JUDGE_PROMPT_ID,
  TUTOR_EVAL_PEDAGOGY_JUDGE_PROMPT_VERSION,
} from "../judge/index.js";
import { runTutorResponseCorpus } from "../runner/index.js";
import { formatTutorEvalSummary } from "../reporting/index.js";
import {
  createOpenAIJudge,
  OpenAIJudgeConfigurationError,
  readOpenAIJudgeEnvironment,
  type OpenAIJudgeEnvironmentConfig,
} from "../providers/openai/index.js";
import { reportTutorCliError, writeTutorCliJson } from "./tutor-case-common.js";

export interface BenchmarkCorpusCliOptions {
  readonly corpusPath: string;
  readonly requireFull: boolean;
  readonly liveJudge: boolean;
  readonly outputPath?: string;
  readonly help: boolean;
}

function nextValue(args: readonly string[], index: number): string {
  const value = args[index + 1];
  if (value === undefined || value.trim().length === 0 || value.startsWith("--")) {
    throw new BenchmarkConfigurationError("tutor_response_corpus_invalid");
  }
  return value.trim();
}

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
      corpusPath = resolve(nextValue(args, index));
      index += 1;
    } else if (argument?.startsWith("--corpus=")) {
      corpusPath = resolve(argument.slice("--corpus=".length));
    } else if (argument === "--output") {
      outputPath = resolve(nextValue(args, index));
      index += 1;
    } else if (argument?.startsWith("--output=")) {
      outputPath = resolve(argument.slice("--output=".length));
    } else {
      throw new BenchmarkConfigurationError("tutor_response_corpus_invalid");
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

function requireModel(environment: OpenAIJudgeEnvironmentConfig): string {
  if (environment.model === null) {
    throw new OpenAIJudgeConfigurationError("model_missing");
  }
  return environment.model;
}

function printHelp(): void {
  console.log(`Usage: npm run benchmark:corpus -- --corpus <path> [options]

Frozen responses are replayed locally; no Tutor provider is called.

Options:
  --corpus <path>       Frozen TutorResponseCorpus JSON file
  --full                Require a complete corpus before evaluation
  --judge-openai        Opt in to the existing live OpenAI Judge provider
  --live-judge          Alias for --judge-openai
  --output <path>       Write the corpus evaluation result to this path
  --help                Show this help
`);
}

async function createJudgeIfRequested(liveJudge: boolean) {
  if (!liveJudge) {
    return undefined;
  }
  const environment = readOpenAIJudgeEnvironment();
  const model = requireModel(environment);
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

export async function main(args = process.argv.slice(2)): Promise<void> {
  const options = parseBenchmarkCorpusCliOptions(args);
  if (options.help) {
    printHelp();
    return;
  }
  const [dataset, corpus] = await Promise.all([
    loadTutorEvalDataset(TUTOR_EVAL_DATASET_ID),
    loadTutorResponseCorpus(options.corpusPath),
  ]);
  const judge = await createJudgeIfRequested(options.liveJudge);
  const result: TutorResponseCorpusEvaluationResult = await runTutorResponseCorpus({
    corpus,
    dataset,
    requireFull: options.requireFull,
    ...(judge === undefined ? {} : { judge }),
    runId: `benchmark-corpus-${corpus.corpusId}`,
  });
  console.log(`Corpus: ${result.corpusId}@${result.corpusVersion}`);
  console.log(`Coverage: ${result.coverage}`);
  console.log(`Selected cases: ${result.selectedCaseCount}`);
  console.log(`Available responses: ${result.availableResponseCount}`);
  console.log(`Missing cases: ${result.missingCaseCount}`);
  console.log(formatTutorEvalSummary(result.evaluation));
  const outputPath = options.outputPath ?? resolve(process.cwd(), "artifacts", "tutor-eval-corpus-result.json");
  await writeTutorCliJson(result, outputPath);
  console.log(`JSON result: ${outputPath}`);
  if (result.evaluation.errorCount > 0) {
    process.exitCode = 1;
  }
}

try {
  await main();
} catch (error) {
  reportTutorCliError(error);
}
