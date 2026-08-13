#!/usr/bin/env node

import { realpathSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createHttpTutor, DEFAULT_HTTP_TUTOR_TIMEOUT_MS } from "../adapters/http-tutor.js";
import { TUTOR_EVAL_DATASET_ID, type TutorEvalDataset } from "../contracts/index.js";
import { loadTutorEvalDataset } from "../datasets/index.js";
import { formatTutorEvalSummary, writeTutorEvalResult } from "../reporting/index.js";
import { runTutorBenchmark } from "../runner/index.js";
import {
  selectTutorEvalCases,
  type TutorCaseSelectionOptions,
} from "./tutor-case-common.js";

class TutorbenchCliUsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TutorbenchCliUsageError";
  }
}

export interface TutorbenchRunOptions {
  readonly endpoint: string;
  readonly datasetId: string;
  readonly caseIds: readonly string[];
  readonly limit: number | null;
  readonly runsPerCase: number;
  readonly timeoutMs: number;
  readonly outputPath?: string;
}

export type TutorbenchCliOptions =
  | { readonly help: true }
  | { readonly help: false; readonly run: TutorbenchRunOptions };

function nextValue(
  args: readonly string[],
  index: number,
  option: string,
): string {
  const value = args[index + 1];
  if (value === undefined || value.trim().length === 0 || value.startsWith("--")) {
    throw new TutorbenchCliUsageError(`${option} requires a value.`);
  }
  return value.trim();
}

function positiveInteger(value: string, option: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new TutorbenchCliUsageError(`${option} must be a positive integer.`);
  }
  return parsed;
}

function optionValue(
  argument: string,
  option: string,
): string | undefined {
  const prefix = `${option}=`;
  if (!argument.startsWith(prefix)) {
    return undefined;
  }
  const value = argument.slice(prefix.length).trim();
  if (value.length === 0) {
    throw new TutorbenchCliUsageError(`${option} requires a value.`);
  }
  return value;
}

export function parseTutorbenchArgs(
  args: readonly string[],
): TutorbenchCliOptions {
  if (args.length === 0 || args[0] === "--help" || args[0] === "-h") {
    return { help: true };
  }
  if (args[0] !== "run") {
    throw new TutorbenchCliUsageError(
      `Unknown command: ${args[0] ?? ""}. Use --help for usage.`,
    );
  }

  let endpoint: string | undefined;
  let datasetId: string = TUTOR_EVAL_DATASET_ID;
  let limit: number | null = null;
  let runsPerCase = 1;
  let timeoutMs: number = DEFAULT_HTTP_TUTOR_TIMEOUT_MS;
  let outputPath: string | undefined;
  const caseIds: string[] = [];

  for (let index = 1; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === undefined) {
      throw new TutorbenchCliUsageError("A CLI option is missing.");
    }
    if (argument === "--help" || argument === "-h") {
      return { help: true };
    }
    if (argument === "--http") {
      endpoint = nextValue(args, index, "--http");
      index += 1;
      continue;
    }
    const httpValue = optionValue(argument, "--http");
    if (httpValue !== undefined) {
      endpoint = httpValue;
      continue;
    }
    if (argument === "--dataset") {
      datasetId = nextValue(args, index, "--dataset");
      index += 1;
      continue;
    }
    const datasetValue = optionValue(argument, "--dataset");
    if (datasetValue !== undefined) {
      datasetId = datasetValue;
      continue;
    }
    if (argument === "--case") {
      caseIds.push(nextValue(args, index, "--case"));
      index += 1;
      continue;
    }
    const caseValue = optionValue(argument, "--case");
    if (caseValue !== undefined) {
      caseIds.push(caseValue);
      continue;
    }
    if (argument === "--limit") {
      limit = positiveInteger(nextValue(args, index, "--limit"), "--limit");
      index += 1;
      continue;
    }
    const limitValue = optionValue(argument, "--limit");
    if (limitValue !== undefined) {
      limit = positiveInteger(limitValue, "--limit");
      continue;
    }
    if (argument === "--runs") {
      runsPerCase = positiveInteger(nextValue(args, index, "--runs"), "--runs");
      index += 1;
      continue;
    }
    const runsValue = optionValue(argument, "--runs");
    if (runsValue !== undefined) {
      runsPerCase = positiveInteger(runsValue, "--runs");
      continue;
    }
    if (argument === "--timeout-ms") {
      timeoutMs = positiveInteger(
        nextValue(args, index, "--timeout-ms"),
        "--timeout-ms",
      );
      index += 1;
      continue;
    }
    const timeoutValue = optionValue(argument, "--timeout-ms");
    if (timeoutValue !== undefined) {
      timeoutMs = positiveInteger(timeoutValue, "--timeout-ms");
      continue;
    }
    if (argument === "--output") {
      outputPath = resolve(nextValue(args, index, "--output"));
      index += 1;
      continue;
    }
    const outputValue = optionValue(argument, "--output");
    if (outputValue !== undefined) {
      outputPath = resolve(outputValue);
      continue;
    }
    throw new TutorbenchCliUsageError(`Unknown option: ${argument}`);
  }

  if (endpoint === undefined) {
    throw new TutorbenchCliUsageError("--http requires a value.");
  }
  if (caseIds.length > 0 && limit !== null) {
    throw new TutorbenchCliUsageError("--case cannot be combined with --limit.");
  }

  return {
    help: false,
    run: {
      endpoint,
      datasetId,
      caseIds,
      limit,
      runsPerCase,
      timeoutMs,
      ...(outputPath === undefined ? {} : { outputPath }),
    },
  };
}

function printHelp(): void {
  console.log(`Tutor Benchmark external Tutor runner

Usage:
  tutorbench run --http <url> [options]

Options:
  --http <url>          POST TutorTurnInput JSON to this http(s) endpoint
  --dataset <id>        Dataset id (default: ${TUTOR_EVAL_DATASET_ID})
  --case <id>           Select one case; repeat for a subset
  --limit <n>           Select the first n cases in stable ID order
  --runs <n>            Run each selected case n times (default: 1)
  --timeout-ms <n>      Request timeout in milliseconds (default: ${DEFAULT_HTTP_TUTOR_TIMEOUT_MS})
  --output <path>       Write the TutorEvalRunResult JSON to this path
  --help                Show this help

The external Tutor response must be JSON shaped as { "text": string, "metrics"?: object }.
No automatic retry is performed.`);
}

function selectedDataset(
  dataset: TutorEvalDataset,
  options: TutorbenchRunOptions,
): TutorEvalDataset {
  const selectionOptions: TutorCaseSelectionOptions = {
    caseIds: options.caseIds,
    limit: options.limit,
    all: false,
    help: false,
  };
  return {
    ...dataset,
    cases: selectTutorEvalCases(dataset, selectionOptions),
  };
}

function formatExternalTutorSummary(
  result: Awaited<ReturnType<typeof runTutorBenchmark>>,
  endpoint: string,
): string {
  return [
    "Tutor Benchmark",
    "",
    "Tutor:",
    `  HTTP · ${endpoint}`,
    "",
    formatTutorEvalSummary(result),
  ].join("\n");
}

export async function runTutorbench(
  options: TutorbenchRunOptions,
): Promise<void> {
  const dataset = await loadTutorEvalDataset(options.datasetId);
  const tutor = createHttpTutor({
    id: "http-tutor",
    endpoint: options.endpoint,
    timeoutMs: options.timeoutMs,
  });
  const result = await runTutorBenchmark({
    tutor,
    dataset: selectedDataset(dataset, options),
    runsPerCase: options.runsPerCase,
  });

  console.log(formatExternalTutorSummary(result, tutor.endpoint));
  if (options.outputPath !== undefined) {
    await writeTutorEvalResult(result, options.outputPath);
    console.log(`\nWrote TutorEvalRunResult: ${options.outputPath}`);
  }
}

export async function main(args = process.argv.slice(2)): Promise<void> {
  const options = parseTutorbenchArgs(args);
  if (options.help) {
    printHelp();
    return;
  }
  await runTutorbench(options.run);
}

async function runAsExecutable(): Promise<void> {
  try {
    await main();
  } catch (error) {
    console.error(
      error instanceof TutorbenchCliUsageError ||
      (error instanceof Error && error.name === "HttpTutorConfigurationError")
        ? error.message
        : "Tutor Benchmark CLI failed.",
    );
    process.exitCode = 1;
  }
}

function isExecutableInvocation(): boolean {
  const argumentPath = process.argv[1];
  if (argumentPath === undefined) {
    return false;
  }
  const modulePath = fileURLToPath(import.meta.url);
  try {
    return realpathSync(argumentPath) === realpathSync(modulePath);
  } catch {
    return resolve(argumentPath) === modulePath;
  }
}

if (isExecutableInvocation()) {
  await runAsExecutable();
}
