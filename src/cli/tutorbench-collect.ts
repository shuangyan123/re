import { resolve } from "node:path";

import {
  createHttpTutor,
  DEFAULT_HTTP_TUTOR_TIMEOUT_MS,
} from "../adapters/http-tutor.js";
import {
  TUTOR_EVAL_DATASET_ID,
  type TutorResponseProvenance,
} from "../contracts/index.js";
import {
  buildTutorBaselineGenerationSpec,
  loadTutorBaselinePrompt,
} from "../corpus/index.js";
import { loadTutorEvalDataset } from "../datasets/index.js";
import {
  collectTutorBaseline,
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

const provenances: readonly TutorResponseProvenance[] = [
  "synthetic",
  "recorded_model",
  "review_workspace",
  "external",
];

export type TutorbenchCollectCliOptions =
  | { readonly help: true }
  | {
      readonly help: false;
      readonly endpoint: string;
      readonly provider: string;
      readonly model: string;
      readonly modelVersion?: string;
      readonly provenance: TutorResponseProvenance;
      readonly datasetId: string;
      readonly caseIds: readonly string[];
      readonly limit: number | null;
      readonly runsPerCase: number;
      readonly timeoutMs: number;
      readonly corpusId?: string;
      readonly outputPath?: string;
      readonly reportPath?: string;
      readonly dryRun: boolean;
    };

function parseProvenance(value: string): TutorResponseProvenance {
  if (!provenances.includes(value as TutorResponseProvenance)) {
    throw new TutorbenchCliUsageError(
      `--provenance must be one of: ${provenances.join(", ")}.`,
    );
  }
  return value as TutorResponseProvenance;
}

function requiredIdentifier(value: string | undefined, option: string): string {
  if (value === undefined || value.trim().length === 0) {
    throw new TutorbenchCliUsageError(`${option} requires a value.`);
  }
  return value.trim();
}

export function parseTutorbenchCollectArgs(
  args: readonly string[],
): TutorbenchCollectCliOptions {
  if (args.length === 0 || args[0] === "--help" || args[0] === "-h") {
    return { help: true };
  }
  let endpoint: string | undefined;
  let provider: string | undefined;
  let model: string | undefined;
  let modelVersion: string | undefined;
  let provenance: TutorResponseProvenance | undefined;
  let datasetId: string = TUTOR_EVAL_DATASET_ID;
  let limit: number | null = null;
  let runsPerCase = 1;
  let timeoutMs: number = DEFAULT_HTTP_TUTOR_TIMEOUT_MS;
  let corpusId: string | undefined;
  let outputPath: string | undefined;
  let reportPath: string | undefined;
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
    if (argument === "--provenance") {
      provenance = parseProvenance(nextTutorbenchValue(args, index, "--provenance"));
      index += 1;
      continue;
    }
    const provenanceValue = tutorbenchOptionValue(argument, "--provenance");
    if (provenanceValue !== undefined) {
      provenance = parseProvenance(provenanceValue);
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
    provenance: provenance ?? (() => {
      throw new TutorbenchCliUsageError("--provenance requires a value.");
    })(),
    datasetId,
    caseIds,
    limit,
    runsPerCase,
    timeoutMs,
    ...(corpusId === undefined ? {} : { corpusId }),
    ...(outputPath === undefined ? {} : { outputPath }),
    ...(reportPath === undefined ? {} : { reportPath }),
    dryRun,
  };
}

export function printTutorbenchCollectHelp(): void {
  console.log(`Usage: tutorbench collect --http <url> --provider <id> --model <id> --provenance <value> [options]

Collects frozen Tutor responses sequentially. It never discovers provider credentials,
retries a Tutor call, invokes a Judge, or publishes artifacts.

Options:
  --http <url>          HTTP Tutor endpoint (http/https, no embedded credentials)
  --provider <id>       Provider identity supplied by the external Tutor host
  --model <id>          Model identity supplied by the external Tutor host
  --model-version <id>  Optional trustworthy model version/snapshot
  --provenance <value>  synthetic, recorded_model, external, or review_workspace
  --dataset <id>        Dataset id (default: ${TUTOR_EVAL_DATASET_ID})
  --case <id>           Select one case; repeat for a subset
  --limit <n>           Select the first n cases in stable ID order
  --runs <n>            Run each selected case n times (default: 1)
  --timeout-ms <n>      Request timeout in milliseconds (default: ${DEFAULT_HTTP_TUTOR_TIMEOUT_MS})
  --corpus-id <id>      Stable output identity (default: generated local id)
  --output <path>       Frozen TutorResponseCorpus JSON path
  --report <path>       Sanitized collection report path
  --dry-run             Print the plan without calling the Tutor
  --help                Show this help

Use provenance=recorded_model only when a direct model host produced the response;
use external or review_workspace for product Tutor integrations. The canonical
baseline-native-default generation identity is recorded in the corpus metadata.`);
}

function safePathPart(value: string): string {
  const safe = value.replace(/[^A-Za-z0-9._-]+/gu, "_").replace(/^\.+/u, "");
  return safe.length === 0 ? "unknown" : safe.slice(0, 100);
}

function defaultCorpusId(): string {
  return `preliminary-${new Date().toISOString().replace(/[^0-9]/gu, "").slice(0, 14)}`;
}

function resolveOutputPath(
  options: Exclude<TutorbenchCollectCliOptions, { readonly help: true }>,
  corpusId: string,
): string {
  return options.outputPath ?? resolve(
    process.cwd(),
    "artifacts",
    "real-model",
    `${safePathPart(options.datasetId)}-${safePathPart(options.provider)}-${safePathPart(options.model)}-baseline-native-default-${safePathPart(corpusId)}.json`,
  );
}

function resolveReportPath(
  options: Exclude<TutorbenchCollectCliOptions, { readonly help: true }>,
  outputPath: string,
): string {
  return options.reportPath ?? `${outputPath}.report.json`;
}

function printCollectionPlan(
  options: Exclude<TutorbenchCollectCliOptions, { readonly help: true }>,
  corpusId: string,
  outputPath: string,
  reportPath: string,
  selectedCaseCount: number,
  dryRun: boolean,
): void {
  console.log("Tutor Benchmark baseline collection");
  console.log(`Mode: ${dryRun ? "dry-run" : "collect"}`);
  console.log("Transport: http");
  console.log(`Tutor: ${options.provider}/${options.model}`);
  console.log(`Provenance: ${options.provenance}`);
  console.log(`Dataset: ${options.datasetId}`);
  console.log("Generation profile: baseline-native-default");
  console.log(`Corpus id: ${corpusId}`);
  console.log(`Selected cases: ${selectedCaseCount}`);
  console.log(`Runs per case: ${options.runsPerCase}`);
  console.log(`Planned Tutor calls: ${selectedCaseCount * options.runsPerCase}`);
  console.log(`Output corpus: ${outputPath}`);
  console.log(`Collection report: ${reportPath}`);
  if (dryRun) {
    console.log("Tutor calls made: 0");
  }
}

function printCollectionResult(
  result: TutorBaselineCollectionResult,
  outputPath: string,
  reportPath: string,
): void {
  console.log("Tutor Benchmark baseline collection");
  console.log(`Corpus: ${result.corpus === null ? "not written" : outputPath}`);
  console.log(`Coverage: ${result.report.coverage}`);
  console.log("Status: preliminary");
  console.log("Calibration: uncalibrated");
  console.log("Public leaderboard eligible: no");
  console.log(`Responses: ${result.report.completedResponseCount}/${result.report.plannedTutorCallCount}`);
  console.log(`Failures: ${result.report.failedTutorCallCount}`);
  console.log(`Collection report: ${reportPath}`);
  if (result.corpus === null) {
    console.log("No Tutor response completed; no corpus was created.");
  } else {
    console.log("Corpus validation: passed");
    console.log("Judge: not invoked");
  }
}

export async function runTutorbenchCollect(
  options: Exclude<TutorbenchCollectCliOptions, { readonly help: true }>,
): Promise<void> {
  const corpusId = options.corpusId ?? defaultCorpusId();
  const outputPath = resolveOutputPath(options, corpusId);
  const reportPath = resolveReportPath(options, outputPath);
  const [dataset, promptAsset] = await Promise.all([
    loadTutorEvalDataset(options.datasetId),
    loadTutorBaselinePrompt(),
  ]);
  const selectedCases = selectTutorEvalCases(dataset, {
    caseIds: options.caseIds,
    limit: options.limit,
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
  const httpTutor = createHttpTutor({
    id: "http-tutor",
    endpoint: options.endpoint,
    timeoutMs: options.timeoutMs,
  });
  if (options.dryRun) {
    printCollectionPlan(options, corpusId, outputPath, reportPath, selectedCases.length, true);
    return;
  }
  printCollectionPlan(options, corpusId, outputPath, reportPath, selectedCases.length, false);
  const result = await collectTutorBaseline({
    tutor: httpTutor,
    dataset,
    selectedCases,
    generationSpec,
    tutorDescriptor: descriptor,
    provenance: options.provenance,
    runsPerCase: options.runsPerCase,
    baselineId: corpusId,
    corpusId,
    corpusVersion: generationSpec.specVersion,
    transport: "http",
    outputPath,
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
  const options = parseTutorbenchCollectArgs(args);
  if (options.help) {
    printTutorbenchCollectHelp();
    return;
  }
  await runTutorbenchCollect(options);
}

if (process.argv[1]?.endsWith("tutorbench-collect.js")) {
  try {
    await main();
  } catch (error) {
    console.error(
      error instanceof TutorbenchCliUsageError ||
      (error instanceof Error && error.name === "HttpTutorConfigurationError")
        ? error.message
        : "Tutor Benchmark collection failed.",
    );
    process.exitCode = 1;
  }
}
