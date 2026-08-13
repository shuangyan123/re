import { resolve } from "node:path";

import {
  findTutorResponseCorpusValidationIssues,
  type TutorResponseCorpusValidationIssue,
} from "../contracts/index.js";
import { loadCanonicalTutorEvalDataset, reportTutorCliError, writeTutorCliJson } from "./tutor-case-common.js";
import { loadTutorResponseCorpus } from "../corpus/index.js";

export interface TutorCorpusValidateOptions {
  readonly corpusPath: string;
  readonly requireFull: boolean;
  readonly outputPath?: string;
  readonly help: boolean;
}

function nextValue(args: readonly string[], index: number): string {
  const value = args[index + 1];
  if (value === undefined || value.trim().length === 0 || value.startsWith("--")) {
    throw new Error("--corpus requires a value.");
  }
  return value.trim();
}

export function parseTutorCorpusValidateOptions(
  args: readonly string[],
): TutorCorpusValidateOptions {
  let corpusPath: string | undefined;
  let requireFull = false;
  let outputPath: string | undefined;
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--help" || argument === "-h") {
      return { corpusPath: "", requireFull: false, help: true };
    }
    if (argument === "--full" || argument === "--require-full") {
      requireFull = true;
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
      throw new Error(`Unknown corpus validation option: ${argument}`);
    }
  }
  if (corpusPath === undefined || corpusPath.length === 0) {
    throw new Error("--corpus requires a value.");
  }
  return {
    corpusPath,
    requireFull,
    ...(outputPath === undefined ? {} : { outputPath }),
    help: false,
  };
}

function printHelp(): void {
  console.log(`Usage: npm run tutor:corpus:validate -- --corpus <path> [options]

Options:
  --corpus <path>       Frozen TutorResponseCorpus JSON file
  --full                Require a complete response for every dataset case
  --require-full        Alias for --full
  --output <path>       Write the validation report to this path
  --help                Show this help
`);
}

function buildCoverageReport(
  corpus: Awaited<ReturnType<typeof loadTutorResponseCorpus>>,
  dataset: Awaited<ReturnType<typeof loadCanonicalTutorEvalDataset>>,
) {
  const selectedCaseCount = new Set(corpus.responses.map((response) => response.caseId)).size;
  return {
    mode: corpus.coverage,
    selectedCaseCount,
    availableResponseCount: corpus.responses.length,
    missingCaseCount: Math.max(0, dataset.cases.length - selectedCaseCount),
  } as const;
}

export async function main(args = process.argv.slice(2)): Promise<void> {
  const options = parseTutorCorpusValidateOptions(args);
  if (options.help) {
    printHelp();
    return;
  }
  const [dataset, corpus] = await Promise.all([
    loadCanonicalTutorEvalDataset(),
    loadTutorResponseCorpus(options.corpusPath),
  ]);
  const issues: TutorResponseCorpusValidationIssue[] = findTutorResponseCorpusValidationIssues({
    corpus,
    dataset,
    requireFull: options.requireFull,
  });
  const report = {
    valid: issues.length === 0,
    corpusId: corpus.corpusId,
    corpusVersion: corpus.corpusVersion,
    datasetId: corpus.datasetId,
    datasetVersion: corpus.datasetVersion,
    coverage: buildCoverageReport(corpus, dataset),
    issues,
  } as const;
  console.log(JSON.stringify(report, null, 2));
  if (options.outputPath !== undefined) {
    await writeTutorCliJson(report, options.outputPath);
  }
  if (issues.length > 0) {
    throw new Error("Tutor response corpus validation failed.");
  }
  console.log("Tutor response corpus is valid.");
}

try {
  await main();
} catch (error) {
  reportTutorCliError(error);
}
