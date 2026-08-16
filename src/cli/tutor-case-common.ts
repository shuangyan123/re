import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import { BenchmarkConfigurationError } from "../contracts/index.js";
import { loadTutorEvalDataset } from "../datasets/index.js";
import {
  TUTOR_EVAL_DATASET_ID,
  resolveTutorCaseLocale,
  type TutorCaseLocale,
  type TutorEvalCase,
  type TutorEvalDataset,
} from "../contracts/index.js";

export interface TutorCaseSelectionOptions {
  readonly caseIds: readonly string[];
  readonly limit: number | null;
  readonly locale?: TutorCaseLocale;
  readonly all: boolean;
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

function positiveInteger(value: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new BenchmarkConfigurationError("tutor_response_corpus_invalid");
  }
  return parsed;
}

export function parseTutorCaseSelectionOptions(
  args: readonly string[],
): TutorCaseSelectionOptions {
  let all = false;
  let limit: number | null = null;
  let outputPath: string | undefined;
  const caseIds: string[] = [];
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--help" || argument === "-h") {
      return { caseIds: [], limit: null, all: false, help: true };
    }
    if (argument === "--all") {
      all = true;
    } else if (argument === "--case") {
      caseIds.push(nextValue(args, index));
      index += 1;
    } else if (argument?.startsWith("--case=")) {
      const value = argument.slice("--case=".length).trim();
      if (value.length === 0) {
        throw new BenchmarkConfigurationError("tutor_response_corpus_invalid");
      }
      caseIds.push(value);
    } else if (argument === "--limit") {
      limit = positiveInteger(nextValue(args, index));
      index += 1;
    } else if (argument?.startsWith("--limit=")) {
      limit = positiveInteger(argument.slice("--limit=".length));
    } else if (argument === "--output") {
      outputPath = resolve(nextValue(args, index));
      index += 1;
    } else if (argument?.startsWith("--output=")) {
      outputPath = resolve(argument.slice("--output=".length));
    } else {
      throw new BenchmarkConfigurationError("tutor_response_corpus_invalid");
    }
  }
  if (all && (caseIds.length > 0 || limit !== null)) {
    throw new BenchmarkConfigurationError("tutor_response_corpus_invalid");
  }
  if (caseIds.length > 0 && limit !== null) {
    throw new BenchmarkConfigurationError("tutor_response_corpus_invalid");
  }
  return {
    caseIds,
    limit,
    all,
    ...(outputPath === undefined ? {} : { outputPath }),
    help: false,
  };
}

export function selectTutorEvalCases(
  dataset: TutorEvalDataset,
  options: TutorCaseSelectionOptions,
): readonly TutorEvalCase[] {
  const orderedCases = [...dataset.cases]
    .filter((tutorEvalCase) => options.locale === undefined ||
      resolveTutorCaseLocale(tutorEvalCase.locale) === options.locale)
    .sort((left, right) =>
      left.id.localeCompare(right.id),
    );
  const byId = new Map(orderedCases.map((tutorEvalCase) => [tutorEvalCase.id, tutorEvalCase]));
  if (options.caseIds.length > 0) {
    return options.caseIds.map((caseId) => {
      const tutorEvalCase = byId.get(caseId);
      if (tutorEvalCase === undefined) {
        throw new BenchmarkConfigurationError("tutor_response_corpus_invalid");
      }
      return tutorEvalCase;
    });
  }
  if (options.limit !== null) {
    return orderedCases.slice(0, options.limit);
  }
  return orderedCases;
}

export async function loadCanonicalTutorEvalDataset(): Promise<TutorEvalDataset> {
  return loadTutorEvalDataset(TUTOR_EVAL_DATASET_ID);
}

export async function writeTutorCliJson(value: unknown, outputPath: string): Promise<void> {
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export function reportTutorCliError(error: unknown): void {
  console.error(
    error instanceof BenchmarkConfigurationError
      ? error.message
      : "Tutor corpus command failed.",
  );
  process.exitCode = 1;
}
