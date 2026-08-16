import { access } from "node:fs/promises";
import { resolve } from "node:path";

import {
  createHttpTutorExecutionHost,
  DEFAULT_HTTP_TUTOR_EXECUTION_HOST_TIMEOUT_MS,
  HttpTutorExecutionHostConfigurationError,
} from "../adapters/http-tutor-execution-host.js";
import {
  TUTOR_EVAL_DATASET_ID,
  type TutorCaseLocale,
} from "../contracts/index.js";
import { buildTutorExecutionPacketFile } from "../contracts/tutor-execution.js";
import {
  buildTutorBaselineGenerationSpec,
  loadTutorResponseCorpus,
  loadTutorBaselinePrompt,
} from "../corpus/index.js";
import { loadTutorEvalDataset } from "../datasets/index.js";
import {
  collectCanonicalTutorModel,
  type TutorBaselineCollectionResult,
} from "../collection/index.js";
import {
  selectTutorEvalCases,
  type TutorCaseSelectionOptions,
  writeTutorCliJson,
} from "./tutor-case-common.js";
import {
  nextTutorbenchValue,
  positiveTutorbenchInteger,
  tutorbenchOptionValue,
  TutorbenchCliUsageError,
} from "./tutorbench-common.js";

export type TutorbenchCollectModelCliOptions =
  | { readonly help: true }
  | {
      readonly help: false;
      readonly endpoint: string;
      readonly provider: string;
      readonly model: string;
      readonly modelVersion?: string;
      readonly datasetId: string;
      readonly caseIds: readonly string[];
      readonly limit: number | null;
      readonly locale?: TutorCaseLocale;
      readonly runsPerCase: number;
      readonly timeoutMs: number;
      readonly corpusId?: string;
      readonly outputPath?: string;
      readonly reportPath?: string;
      readonly resumePath?: string;
      readonly dryRun: boolean;
    };

function requiredIdentifier(value: string | undefined, option: string): string {
  if (value === undefined || value.trim().length === 0) {
    throw new TutorbenchCliUsageError(`${option} requires a value.`);
  }
  return value.trim();
}

function parseLocale(value: string, option: string): TutorCaseLocale {
  if (value === "en" || value === "zh-CN") {
    return value;
  }
  throw new TutorbenchCliUsageError(`${option} must be en or zh-CN.`);
}

export function parseTutorbenchCollectModelArgs(
  args: readonly string[],
): TutorbenchCollectModelCliOptions {
  if (args.length === 0 || args[0] === "--help" || args[0] === "-h") {
    return { help: true };
  }
  let endpoint: string | undefined;
  let provider: string | undefined;
  let model: string | undefined;
  let modelVersion: string | undefined;
  let datasetId: string = TUTOR_EVAL_DATASET_ID;
  let locale: TutorCaseLocale | undefined;
  let limit: number | null = null;
  let runsPerCase = 1;
  let timeoutMs: number = DEFAULT_HTTP_TUTOR_EXECUTION_HOST_TIMEOUT_MS;
  let corpusId: string | undefined;
  let outputPath: string | undefined;
  let reportPath: string | undefined;
  let resumePath: string | undefined;
  let dryRun = false;
  const caseIds: string[] = [];

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === undefined) {
      throw new TutorbenchCliUsageError("A CLI option is missing.");
    }
    if (argument === "--help" || argument === "-h") {
      return { help: true };
    }
    if (argument === "--dry-run") {
      dryRun = true;
      continue;
    }
    if (argument === "--http") {
      endpoint = nextTutorbenchValue(args, index, "--http");
      index += 1;
      continue;
    }
    const httpValue = tutorbenchOptionValue(argument, "--http");
    if (httpValue !== undefined) {
      endpoint = httpValue;
      continue;
    }
    if (argument === "--provider") {
      provider = nextTutorbenchValue(args, index, "--provider");
      index += 1;
      continue;
    }
    const providerValue = tutorbenchOptionValue(argument, "--provider");
    if (providerValue !== undefined) {
      provider = providerValue;
      continue;
    }
    if (argument === "--model") {
      model = nextTutorbenchValue(args, index, "--model");
      index += 1;
      continue;
    }
    const modelValue = tutorbenchOptionValue(argument, "--model");
    if (modelValue !== undefined) {
      model = modelValue;
      continue;
    }
    if (argument === "--model-version") {
      modelVersion = nextTutorbenchValue(args, index, "--model-version");
      index += 1;
      continue;
    }
    const modelVersionValue = tutorbenchOptionValue(argument, "--model-version");
    if (modelVersionValue !== undefined) {
      modelVersion = modelVersionValue;
      continue;
    }
    if (argument === "--dataset") {
      datasetId = nextTutorbenchValue(args, index, "--dataset");
      index += 1;
      continue;
    }
    const datasetValue = tutorbenchOptionValue(argument, "--dataset");
    if (datasetValue !== undefined) {
      datasetId = datasetValue;
      continue;
    }
    if (argument === "--locale") {
      locale = parseLocale(nextTutorbenchValue(args, index, "--locale"), "--locale");
      index += 1;
      continue;
    }
    const localeValue = tutorbenchOptionValue(argument, "--locale");
    if (localeValue !== undefined) {
      locale = parseLocale(localeValue, "--locale");
      continue;
    }
    if (argument === "--case") {
      caseIds.push(nextTutorbenchValue(args, index, "--case"));
      index += 1;
      continue;
    }
    const caseValue = tutorbenchOptionValue(argument, "--case");
    if (caseValue !== undefined) {
      caseIds.push(caseValue);
      continue;
    }
    if (argument === "--limit") {
      limit = positiveTutorbenchInteger(nextTutorbenchValue(args, index, "--limit"), "--limit");
      index += 1;
      continue;
    }
    const limitValue = tutorbenchOptionValue(argument, "--limit");
    if (limitValue !== undefined) {
      limit = positiveTutorbenchInteger(limitValue, "--limit");
      continue;
    }
    if (argument === "--runs") {
      runsPerCase = positiveTutorbenchInteger(nextTutorbenchValue(args, index, "--runs"), "--runs");
      index += 1;
      continue;
    }
    const runsValue = tutorbenchOptionValue(argument, "--runs");
    if (runsValue !== undefined) {
      runsPerCase = positiveTutorbenchInteger(runsValue, "--runs");
      continue;
    }
    if (argument === "--timeout-ms") {
      timeoutMs = positiveTutorbenchInteger(
        nextTutorbenchValue(args, index, "--timeout-ms"),
        "--timeout-ms",
      );
      index += 1;
      continue;
    }
    const timeoutValue = tutorbenchOptionValue(argument, "--timeout-ms");
    if (timeoutValue !== undefined) {
      timeoutMs = positiveTutorbenchInteger(timeoutValue, "--timeout-ms");
      continue;
    }
    if (argument === "--corpus-id") {
      corpusId = nextTutorbenchValue(args, index, "--corpus-id");
      index += 1;
      continue;
    }
    const corpusIdValue = tutorbenchOptionValue(argument, "--corpus-id");
    if (corpusIdValue !== undefined) {
      corpusId = corpusIdValue;
      continue;
    }
    if (argument === "--output") {
      outputPath = resolve(nextTutorbenchValue(args, index, "--output"));
      index += 1;
      continue;
    }
    const outputValue = tutorbenchOptionValue(argument, "--output");
    if (outputValue !== undefined) {
      outputPath = resolve(outputValue);
      continue;
    }
    if (argument === "--report") {
      reportPath = resolve(nextTutorbenchValue(args, index, "--report"));
      index += 1;
      continue;
    }
    const reportValue = tutorbenchOptionValue(argument, "--report");
    if (reportValue !== undefined) {
      reportPath = resolve(reportValue);
      continue;
    }
    if (argument === "--resume") {
      resumePath = resolve(nextTutorbenchValue(args, index, "--resume"));
      index += 1;
      continue;
    }
    const resumeValue = tutorbenchOptionValue(argument, "--resume");
    if (resumeValue !== undefined) {
      resumePath = resolve(resumeValue);
      continue;
    }
    throw new TutorbenchCliUsageError(`Unknown option: ${argument}`);
  }

  if (caseIds.length > 0 && limit !== null) {
    throw new TutorbenchCliUsageError("--case cannot be combined with --limit.");
  }
  return {
    help: false,
    endpoint: requiredIdentifier(endpoint, "--http"),
    provider: requiredIdentifier(provider, "--provider"),
    model: requiredIdentifier(model, "--model"),
    ...(modelVersion === undefined ? {} : { modelVersion }),
    datasetId,
    caseIds,
    limit,
    ...(locale === undefined ? {} : { locale }),
    runsPerCase,
    timeoutMs,
    ...(corpusId === undefined ? {} : { corpusId }),
    ...(outputPath === undefined ? {} : { outputPath }),
    ...(reportPath === undefined ? {} : { reportPath }),
    ...(resumePath === undefined ? {} : { resumePath }),
    dryRun,
  };
}

export function printTutorbenchCollectModelHelp(): void {
  console.log(`Usage: tutorbench collect-model --http <url> --provider <id> --model <id> [options]

Collects canonical foundation-model evidence from a host that executes the
exact TutorExecutionPacket and TutorGenerationSpec. It fixes provenance to
recorded_model, never invokes a Judge, never retries, and never publishes artifacts.

Options:
  --http <url>          Canonical model host endpoint (http/https, no credentials)
  --provider <id>       Provider identity for the model host
  --model <id>          Actual model identity
  --model-version <id>  Optional trustworthy model version/snapshot
  --dataset <id>        Dataset id (default: ${TUTOR_EVAL_DATASET_ID})
  --locale <locale>     Filter selected cases by locale (en or zh-CN)
  --case <id>           Select one case; repeat for a subset
  --limit <n>           Select the first n cases in stable ID order
  --runs <n>            Run each selected case n times (default: 1)
  --timeout-ms <n>      Request timeout in milliseconds (default: ${DEFAULT_HTTP_TUTOR_EXECUTION_HOST_TIMEOUT_MS})
  --corpus-id <id>      Stable output identity (default: generated local id)
  --output <path>       Frozen TutorResponseCorpus JSON path
  --report <path>       Sanitized collection report path
  --resume <path>       Reuse successful responses from an existing corpus; must match identity
  --dry-run             Prepare canonical packets without calling the host
  --help                Show this help

The prompt identity and generation controls come from baseline-native-default;
use tutorbench collect for Product Tutor evidence.`);
}

function safePathPart(value: string): string {
  const safe = value.replace(/[^A-Za-z0-9._-]+/gu, "_").replace(/^\.+/u, "");
  return safe.length === 0 ? "unknown" : safe.slice(0, 100);
}

function defaultCorpusId(): string {
  return `preliminary-${new Date().toISOString().replace(/[^0-9]/gu, "").slice(0, 14)}`;
}

function resolveOutputPath(
  options: Exclude<TutorbenchCollectModelCliOptions, { readonly help: true }>,
  corpusId: string,
): string {
  return options.outputPath ?? options.resumePath ?? resolve(
    process.cwd(),
    "artifacts",
    "real-model",
    `preliminary-${safePathPart(options.provider)}-${safePathPart(options.model)}-tutor-bilingual-${safePathPart(corpusId)}.corpus.json`,
  );
}

function resolveReportPath(
  options: Exclude<TutorbenchCollectModelCliOptions, { readonly help: true }>,
  outputPath: string,
): string {
  return options.reportPath ?? `${outputPath}.report.json`;
}

function printCollectionPlan(
  options: Exclude<TutorbenchCollectModelCliOptions, { readonly help: true }>,
  corpusId: string,
  outputPath: string,
  reportPath: string,
  selectedCaseCount: number,
  dryRun: boolean,
): void {
  console.log("Tutor Benchmark model collection");
  console.log("Collection mode: canonical_model");
  console.log(`Mode: ${dryRun ? "dry-run" : "collect"}`);
  console.log("Transport: http");
  console.log(`Model host: ${options.provider}/${options.model}`);
  console.log("Provenance: recorded_model");
  console.log(`Dataset: ${options.datasetId}`);
  console.log(`Locale filter: ${options.locale ?? "all"}`);
  console.log("Generation profile: baseline-native-default");
  console.log(`Corpus id: ${corpusId}`);
  console.log(`Selected cases: ${selectedCaseCount}`);
  console.log(`Runs per case: ${options.runsPerCase}`);
  console.log(`Planned model calls: ${selectedCaseCount * options.runsPerCase}`);
  console.log(`Output corpus: ${outputPath}`);
  console.log(`Collection report: ${reportPath}`);
  if (options.resumePath !== undefined) {
    console.log(`Resume corpus: ${options.resumePath}`);
  }
  if (dryRun) {
    console.log("Canonical cases/messages prepared");
    console.log("Model calls made: 0");
  }
}

function printCollectionResult(
  result: TutorBaselineCollectionResult,
  outputPath: string,
  reportPath: string,
): void {
  console.log("Tutor Benchmark model collection");
  console.log(`Corpus: ${result.corpus === null ? "not written" : outputPath}`);
  console.log(`Coverage: ${result.report.coverage}`);
  console.log("Status: preliminary");
  console.log("Calibration: uncalibrated");
  console.log("Public leaderboard eligible: no");
  console.log(`Responses: ${result.report.completedResponseCount}/${result.report.plannedTutorCallCount}`);
  if (result.report.reusedResponseCount !== undefined) {
    console.log(`Reused responses: ${result.report.reusedResponseCount}`);
  }
  if (result.report.executedTutorCallCount !== undefined) {
    console.log(`Model calls made: ${result.report.executedTutorCallCount}`);
  }
  console.log(`Failures: ${result.report.failedTutorCallCount}`);
  console.log(`Collection report: ${reportPath}`);
  if (result.corpus === null) {
    console.log("No canonical model response completed; no corpus was created.");
  } else {
    console.log("Corpus validation: passed");
    console.log("Judge: not invoked");
  }
}

export async function runTutorbenchCollectModel(
  options: Exclude<TutorbenchCollectModelCliOptions, { readonly help: true }>,
): Promise<void> {
  const resumeCorpus = options.resumePath === undefined
    ? undefined
    : await loadTutorResponseCorpus(options.resumePath);
  const corpusId = options.corpusId ?? resumeCorpus?.corpusId ?? defaultCorpusId();
  const outputPath = resolveOutputPath(options, corpusId);
  const reportPath = resolveReportPath(options, outputPath);
  if (options.resumePath !== undefined && outputPath !== options.resumePath) {
    throw new TutorbenchCliUsageError(
      "--resume must match --output when both are supplied; a resumed corpus is updated in place.",
    );
  }
  if (resolve(reportPath) === resolve(outputPath)) {
    throw new TutorbenchCliUsageError("--report must not overwrite the corpus path.");
  }
  if (!options.dryRun && options.resumePath === undefined) {
    try {
      await access(outputPath);
      throw new TutorbenchCliUsageError(
        `Output corpus already exists: ${outputPath}. Use --resume <path> to continue it.`,
      );
    } catch (error) {
      if (error instanceof TutorbenchCliUsageError) {
        throw error;
      }
      // ENOENT is the expected state for a new collection; other filesystem
      // failures are surfaced by the later write operation.
    }
  }
  const [dataset, promptAsset] = await Promise.all([
    loadTutorEvalDataset(options.datasetId),
    loadTutorBaselinePrompt(),
  ]);
  const selectedCases = selectTutorEvalCases(dataset, {
    caseIds: options.caseIds,
    limit: options.limit,
    ...(options.locale === undefined ? {} : { locale: options.locale }),
    all: false,
    help: false,
  } satisfies TutorCaseSelectionOptions);
  const generationSpec = buildTutorBaselineGenerationSpec(promptAsset);
  const descriptor = {
    provider: options.provider,
    model: options.model,
    ...(options.modelVersion === undefined ? {} : { modelVersion: options.modelVersion }),
    promptId: generationSpec.prompt.id,
    promptVersion: generationSpec.prompt.version,
  } as const;
  const host = createHttpTutorExecutionHost({
    endpoint: options.endpoint,
    timeoutMs: options.timeoutMs,
  });
  if (options.dryRun) {
    for (const tutorEvalCase of selectedCases) {
      buildTutorExecutionPacketFile(
        dataset,
        [tutorEvalCase],
        generationSpec,
        promptAsset,
      );
    }
    printCollectionPlan(options, corpusId, outputPath, reportPath, selectedCases.length, true);
    return;
  }
  printCollectionPlan(options, corpusId, outputPath, reportPath, selectedCases.length, false);
  const result = await collectCanonicalTutorModel({
    host,
    dataset,
    selectedCases,
    promptAsset,
    generationSpec,
    tutorDescriptor: descriptor,
    runsPerCase: options.runsPerCase,
    baselineId: corpusId,
    corpusId,
    corpusVersion: generationSpec.specVersion,
    transport: "http",
    outputPath,
    ...(resumeCorpus === undefined ? {} : { resumeCorpus }),
  });
  await writeTutorCliJson(result.report, reportPath);
  if (result.corpus !== null) {
    await writeTutorCliJson(result.corpus, outputPath);
  }
  printCollectionResult(result, outputPath, reportPath);
  if (result.corpus === null) {
    process.exitCode = 1;
  }
}

export async function main(args = process.argv.slice(2)): Promise<void> {
  const options = parseTutorbenchCollectModelArgs(args);
  if (options.help) {
    printTutorbenchCollectModelHelp();
    return;
  }
  await runTutorbenchCollectModel(options);
}

if (process.argv[1]?.endsWith("tutorbench-collect-model.js")) {
  try {
    await main();
  } catch (error) {
    console.error(
      error instanceof TutorbenchCliUsageError ||
      error instanceof HttpTutorExecutionHostConfigurationError
        ? error.message
        : "Tutor Benchmark model collection failed.",
    );
    process.exitCode = 1;
  }
}
