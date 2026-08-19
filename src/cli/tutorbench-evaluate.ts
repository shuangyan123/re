import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import {
  BenchmarkConfigurationError,
  assertValidTutorResponseCorpus,
  parseTutorResponseCorpusEvaluationResult,
  type TutorResponseCorpusEvaluationResult,
} from "../contracts/index.js";
import {
  loadTutorResponseCorpus,
  resolveTutorResponseCorpusReplay,
} from "../corpus/index.js";
import { loadTutorEvalDataset } from "../datasets/index.js";
import { resolveTutorResponseCorpusDatasetVersion } from "../datasets/corpus-version-resolution.js";
import {
  loadTutorEvalPedagogyJudgePrompt,
  TUTOR_EVAL_PEDAGOGY_JUDGE_PROMPT_ID,
  TUTOR_EVAL_PEDAGOGY_JUDGE_PROMPT_VERSION,
} from "../judge/index.js";
import {
  resolveTutorResponseCorpusSelection,
  runTutorResponseCorpus,
} from "../runner/index.js";
import {
  formatTutorEvalSummary,
  type TutorEvalReportLocale,
} from "../reporting/index.js";
import {
  reportTutorCliError,
  writeTutorCliJson,
} from "./tutor-case-common.js";
import type { TutorBaselineArtifactMetadata } from "../collection/index.js";
import {
  nextTutorbenchValue,
  positiveTutorbenchInteger,
  tutorbenchOptionValue,
  TutorbenchCliUsageError,
} from "./tutorbench-common.js";

export interface BenchmarkCorpusCliOptions {
  readonly corpusPath: string;
  readonly requireFull: boolean;
  readonly liveJudge: boolean;
  readonly deepSeekJudge: boolean;
  /** Optional generic Chat Completions Judge selected from environment. */
  readonly chatCompletionsJudge?: boolean;
  readonly allowCompatibleReplay: boolean;
  readonly caseIds: readonly string[];
  readonly limit: number | null;
  readonly outputPath?: string;
  readonly resumeEvaluationPath?: string;
  /** Report labels only; case locale and evaluation semantics are unchanged. */
  readonly reportLocale?: TutorEvalReportLocale;
  readonly help: boolean;
}

export type TutorBaselineEvaluationArtifact = TutorResponseCorpusEvaluationResult & {
  readonly artifactMetadata: TutorBaselineArtifactMetadata;
};

function parseReportLocale(value: string): TutorEvalReportLocale {
  if (value === "en" || value === "zh-CN") {
    return value;
  }
  throw new TutorbenchCliUsageError("--report-locale must be en or zh-CN.");
}

export function parseBenchmarkCorpusCliOptions(
  args: readonly string[],
): BenchmarkCorpusCliOptions {
  let corpusPath: string | undefined;
  let requireFull = false;
  let liveJudge = false;
  let deepSeekJudge = false;
  let chatCompletionsJudge = false;
  let allowCompatibleReplay = false;
  let reportLocale: TutorEvalReportLocale | undefined;
  let limit: number | null = null;
  const caseIds: string[] = [];
  let outputPath: string | undefined;
  let resumeEvaluationPath: string | undefined;
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--help" || argument === "-h") {
      return {
        corpusPath: "",
        requireFull: false,
        liveJudge: false,
        deepSeekJudge: false,
        allowCompatibleReplay: false,
        caseIds: [],
        limit: null,
        help: true,
      };
    }
    if (argument === "--full" || argument === "--require-full") {
      requireFull = true;
    } else if (argument === "--judge-openai" || argument === "--live-judge") {
      liveJudge = true;
    } else if (argument === "--judge-deepseek") {
      deepSeekJudge = true;
    } else if (argument === "--judge-chat-completions" || argument === "--judge-generic") {
      chatCompletionsJudge = true;
    } else if (argument === "--allow-compatible-replay") {
      allowCompatibleReplay = true;
    } else if (argument === "--resume-evaluation") {
      resumeEvaluationPath = resolve(
        nextTutorbenchValue(args, index, "--resume-evaluation"),
      );
      index += 1;
    } else if (argument === "--report-locale") {
      reportLocale = parseReportLocale(nextTutorbenchValue(args, index, "--report-locale"));
      index += 1;
    } else if (argument === "--case") {
      const caseId = nextTutorbenchValue(args, index, "--case");
      if (caseIds.includes(caseId)) {
        throw new TutorbenchCliUsageError(`--case must be unique: ${caseId}`);
      }
      caseIds.push(caseId);
      index += 1;
    } else if (argument === "--limit") {
      limit = positiveTutorbenchInteger(
        nextTutorbenchValue(args, index, "--limit"),
        "--limit",
      );
      index += 1;
    } else if (argument === "--corpus") {
      corpusPath = resolve(nextTutorbenchValue(args, index, "--corpus"));
      index += 1;
    } else {
      const corpusValue = tutorbenchOptionValue(argument ?? "", "--corpus");
      if (corpusValue !== undefined) {
        corpusPath = resolve(corpusValue);
      } else {
        const caseValue = tutorbenchOptionValue(argument ?? "", "--case");
        const limitValue = tutorbenchOptionValue(argument ?? "", "--limit");
        if (caseValue !== undefined) {
          if (caseIds.includes(caseValue)) {
            throw new TutorbenchCliUsageError(`--case must be unique: ${caseValue}`);
          }
          caseIds.push(caseValue);
        } else if (limitValue !== undefined) {
          limit = positiveTutorbenchInteger(limitValue, "--limit");
        } else if (argument === "--output") {
          outputPath = resolve(nextTutorbenchValue(args, index, "--output"));
          index += 1;
        } else {
          const outputValue = tutorbenchOptionValue(argument ?? "", "--output");
          if (outputValue !== undefined) {
            outputPath = resolve(outputValue);
          } else {
            const resumeEvaluationValue = tutorbenchOptionValue(
              argument ?? "",
              "--resume-evaluation",
            );
            if (resumeEvaluationValue !== undefined) {
              resumeEvaluationPath = resolve(resumeEvaluationValue);
            } else {
              const reportLocaleValue = tutorbenchOptionValue(argument ?? "", "--report-locale");
              if (reportLocaleValue !== undefined) {
                reportLocale = parseReportLocale(reportLocaleValue);
              } else {
                throw new BenchmarkConfigurationError("tutor_response_corpus_invalid");
              }
            }
          }
        }
      }
    }
  }
  if (corpusPath === undefined || corpusPath.length === 0) {
    throw new BenchmarkConfigurationError("tutor_response_corpus_invalid");
  }
  const judgeModes = [liveJudge, deepSeekJudge, chatCompletionsJudge].filter(Boolean).length;
  if (judgeModes > 1) {
    throw new TutorbenchCliUsageError(
      "Judge provider flags are mutually exclusive: choose one of --judge-openai, --judge-deepseek, or --judge-chat-completions.",
    );
  }
  return {
    corpusPath,
    requireFull,
    liveJudge,
    deepSeekJudge,
    ...(chatCompletionsJudge ? { chatCompletionsJudge: true } : {}),
    allowCompatibleReplay,
    caseIds,
    limit,
    ...(outputPath === undefined ? {} : { outputPath }),
    ...(resumeEvaluationPath === undefined ? {} : { resumeEvaluationPath }),
    ...(reportLocale === undefined ? {} : { reportLocale }),
    help: false,
  };
}

export function printBenchmarkCorpusHelp(): void {
  console.log(`Usage: tutorbench evaluate --corpus <path> [options]

Frozen responses are replayed locally; no Tutor provider is called.

Options:
  --corpus <path>       Frozen TutorResponseCorpus JSON file
  --case <case-id>       Evaluate one frozen case; repeat for a subset
  --limit <n>            Evaluate the first n available cases in stable ID order
  --full                Require a complete corpus before evaluation
  --judge-openai        Opt in to the existing live OpenAI Judge provider
  --judge-deepseek      Opt in to the DeepSeek Chat Completions Judge provider
  --judge-chat-completions
                        Opt in to a provider-neutral Chat Completions Judge configured by environment
  --allow-compatible-replay
                        Opt in only to repository-audited Tutor-visible-equivalent transitions
  --resume-evaluation <path>
                        Reuse only valid completed case-runs from a prior evaluation artifact
  --live-judge          Alias for --judge-openai
  --report-locale <id>  Report labels only: en (default) or zh-CN
  --output <path>       Write the preliminary evaluation artifact to this path
  --help                Show this help

Selection semantics:
  --case is resolved against the dataset and frozen corpus first; --limit then
  truncates that stable selection. Duplicate --case values are rejected.
  Coverage remains the source corpus coverage; subset metadata is recorded in
  evaluationSelection. No Tutor provider is called during evaluation.
`);
}

async function loadResumeEvaluation(
  path: string,
): Promise<TutorResponseCorpusEvaluationResult> {
  try {
    return parseTutorResponseCorpusEvaluationResult(
      JSON.parse(await readFile(path, "utf8")) as unknown,
    );
  } catch (error) {
    if (error instanceof BenchmarkConfigurationError) {
      throw error;
    }
    throw new BenchmarkConfigurationError("tutor_eval_result_invalid");
  }
}

export async function createJudgeIfRequested(
  liveJudge: boolean,
  deepSeekJudge: boolean,
  chatCompletionsJudge: boolean,
) {
  if (!liveJudge && !deepSeekJudge && !chatCompletionsJudge) {
    return undefined;
  }
  const prompt = await loadTutorEvalPedagogyJudgePrompt();
  if (deepSeekJudge) {
    const {
      createDeepSeekJudge,
      DeepSeekJudgeConfigurationError,
      readDeepSeekJudgeEnvironment,
    } = await import("../providers/deepseek/index.js");
    const environment = readDeepSeekJudgeEnvironment();
    if (environment.model === null) {
      throw new DeepSeekJudgeConfigurationError("model_missing");
    }
    const judge = createDeepSeekJudge({
      model: environment.model,
      prompt,
      promptId: TUTOR_EVAL_PEDAGOGY_JUDGE_PROMPT_ID,
      promptVersion: TUTOR_EVAL_PEDAGOGY_JUDGE_PROMPT_VERSION,
      ...(environment.temperature === undefined
        ? {}
        : { temperature: environment.temperature }),
      thinkingMode: environment.thinkingMode,
      ...(environment.reasoningEffort === undefined
        ? {}
        : { reasoningEffort: environment.reasoningEffort }),
      maxOutputTokens: environment.maxOutputTokens,
      timeoutMs: environment.timeoutMs,
      maxAttempts: environment.maxAttempts,
    });
    return {
      ...judge.descriptor,
      evaluate: judge.evaluate,
      evaluateWithMetrics: judge.evaluateWithMetrics,
    } as const;
  }
  if (chatCompletionsJudge) {
    const {
      ChatCompletionsJudgeConfigurationError,
      createChatCompletionsJudge,
      readChatCompletionsJudgeApiKey,
      readChatCompletionsJudgeEnvironment,
    } = await import("../providers/chat-completions/index.js");
    const environment = readChatCompletionsJudgeEnvironment();
    if (environment.provider === null) {
      throw new ChatCompletionsJudgeConfigurationError("provider_invalid");
    }
    if (environment.model === null) {
      throw new ChatCompletionsJudgeConfigurationError("model_missing");
    }
    if (environment.baseUrl === null) {
      throw new ChatCompletionsJudgeConfigurationError("base_url_invalid");
    }
    const judge = createChatCompletionsJudge({
      provider: environment.provider,
      model: environment.model,
      baseUrl: environment.baseUrl,
      endpointPath: environment.endpointPath,
      apiKey: readChatCompletionsJudgeApiKey(),
      prompt,
      promptId: TUTOR_EVAL_PEDAGOGY_JUDGE_PROMPT_ID,
      promptVersion: TUTOR_EVAL_PEDAGOGY_JUDGE_PROMPT_VERSION,
      ...(environment.temperature === undefined
        ? {}
        : { temperature: environment.temperature }),
      reasoningSplit: environment.reasoningSplit,
      ...(environment.maxOutputTokens === undefined
        ? {}
        : { maxOutputTokens: environment.maxOutputTokens }),
      jsonMode: environment.jsonMode,
      maxOutputTokensField: environment.maxOutputTokensField,
      timeoutMs: environment.timeoutMs,
      maxAttempts: environment.maxAttempts,
    });
    return {
      ...judge.descriptor,
      evaluate: judge.evaluate,
      evaluateWithMetrics: judge.evaluateWithMetrics,
    } as const;
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
  const dataset = await loadTutorEvalDataset(
    corpus.datasetId,
    resolveTutorResponseCorpusDatasetVersion(corpus.datasetId, corpus.datasetVersion),
  );
  const semanticReplay = options.allowCompatibleReplay
    ? resolveTutorResponseCorpusReplay(corpus, dataset)
    : undefined;
  assertValidTutorResponseCorpus({
    corpus,
    dataset: semanticReplay?.sourceDataset ?? dataset,
    requireFull: options.requireFull,
  });
  resolveTutorResponseCorpusSelection(corpus, dataset, {
    caseIds: options.caseIds,
    ...(options.limit === null ? {} : { limit: options.limit }),
  });
  const resumeEvaluation = options.resumeEvaluationPath === undefined
    ? undefined
    : await loadResumeEvaluation(options.resumeEvaluationPath);
  const judge = await createJudgeIfRequested(
    options.liveJudge,
    options.deepSeekJudge,
    options.chatCompletionsJudge === true,
  );
  let reusedCaseRunCount = 0;
  let judgeCallsMade = 0;
  const result = await runTutorResponseCorpus({
    corpus,
    dataset,
    requireFull: options.requireFull,
    caseIds: options.caseIds,
    ...(options.limit === null ? {} : { limit: options.limit }),
    ...(semanticReplay === undefined ? {} : { semanticReplay }),
    ...(judge === undefined ? {} : { judge }),
    ...(resumeEvaluation === undefined
      ? {}
      : {
          resumeEvaluation,
          onResume: (telemetry) => {
            reusedCaseRunCount = telemetry.reusedCaseRunCount;
          },
          onJudgeCall: () => {
            judgeCallsMade += 1;
          },
        }),
    runId: `benchmark-corpus-${corpus.corpusId}`,
  });
  if (options.resumeEvaluationPath !== undefined) {
    console.log(`Resume evaluation: ${options.resumeEvaluationPath}`);
    console.log(`Reused evaluation case-runs: ${reusedCaseRunCount}`);
    console.log(`Judge calls made: ${judgeCallsMade}`);
    console.log(`Final case-runs: ${result.evaluation.caseRunCount}`);
  }
  return result;
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
  reportLocale: TutorEvalReportLocale = "en",
): void {
  console.log(`Corpus: ${result.corpusId}@${result.corpusVersion}`);
  console.log(`Coverage: ${result.coverage} (source corpus)`);
  console.log(`Selected cases: ${result.selectedCaseCount}`);
  console.log(`Available responses: ${result.availableResponseCount} (source corpus)`);
  console.log(`Missing cases: ${result.missingCaseCount} (source corpus)`);
  if (result.evaluationSelection !== undefined) {
    console.log(`Selection: ${result.evaluationSelection.mode}`);
    console.log(`Selected responses: ${result.evaluationSelection.selectedResponseCount}`);
  }
  if (result.semanticReplay !== undefined) {
    console.log(`Semantic replay: ${result.semanticReplay.compatibilityId}`);
    console.log(
      `Source dataset: ${result.semanticReplay.sourceDatasetId}@${result.semanticReplay.sourceDatasetVersion}`,
    );
    console.log(
      `Target dataset: ${result.semanticReplay.targetDatasetId}@${result.semanticReplay.targetDatasetVersion}`,
    );
  }
  if (preliminary) {
    console.log("Status: preliminary");
    console.log("Calibration: uncalibrated");
    console.log("Public leaderboard eligible: no");
  }
  console.log(formatTutorEvalSummary(result.evaluation, { reportLocale }));
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
  printTutorResponseCorpusEvaluation(result, outputPath, true, options.reportLocale ?? "en");
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
