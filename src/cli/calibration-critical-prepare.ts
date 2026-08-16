import { resolve } from "node:path";

import {
  assertValidTutorResponseCorpus,
  BenchmarkConfigurationError,
  parseCalibrationCandidateResponseFile,
  type CalibrationCandidateResponseFile,
  type TutorResponseCorpusSemanticReplay,
} from "../contracts/index.js";
import {
  loadTutorResponseCorpus,
  resolveTutorResponseCorpusReplay,
  toTutorResponseCorpusSemanticReplay,
} from "../corpus/index.js";
import { loadTutorEvalDataset } from "../datasets/index.js";
import { toCalibrationCandidateResponseFile } from "../calibration/index.js";
import {
  defaultCalibrationOutputPath,
  reportCliError,
  writeCalibrationJson,
} from "./calibration-common.js";

export interface CriticalCalibrationPrepareCliOptions {
  readonly corpusPath: string;
  readonly outputPath: string;
  readonly allowCompatibleReplay: boolean;
  readonly help: boolean;
}

export interface CriticalCalibrationPreparationResult {
  readonly candidates: CalibrationCandidateResponseFile;
  readonly sourceCorpusId: string;
  readonly sourceCorpusVersion: string;
  readonly sourceDatasetId: string;
  readonly sourceDatasetVersion: string;
  readonly targetDatasetId: string;
  readonly targetDatasetVersion: string;
  readonly semanticReplay?: TutorResponseCorpusSemanticReplay;
  readonly outputPath: string;
}

function defaultOutputPath(): string {
  return defaultCalibrationOutputPath(
    "calibration/private/critical-candidate-responses.json",
  );
}

function requiredPath(
  args: readonly string[],
  index: number,
): string {
  const value = args[index + 1];
  if (value === undefined || value.startsWith("--")) {
    throw new BenchmarkConfigurationError("tutor_response_corpus_invalid");
  }
  return resolve(value);
}

export function parseCriticalCalibrationPrepareCliOptions(
  args: readonly string[],
): CriticalCalibrationPrepareCliOptions {
  let corpusPath: string | undefined;
  let outputPath = defaultOutputPath();
  let allowCompatibleReplay = false;
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--help" || argument === "-h") {
      return {
        corpusPath: "",
        outputPath,
        allowCompatibleReplay: false,
        help: true,
      };
    }
    if (argument === "--allow-compatible-replay") {
      allowCompatibleReplay = true;
    } else if (argument === "--corpus") {
      corpusPath = requiredPath(args, index);
      index += 1;
    } else if (argument === "--output") {
      outputPath = requiredPath(args, index);
      index += 1;
    } else if (argument?.startsWith("--corpus=")) {
      const value = argument.slice("--corpus=".length);
      if (value.length === 0) {
        throw new BenchmarkConfigurationError("tutor_response_corpus_invalid");
      }
      corpusPath = resolve(value);
    } else if (argument?.startsWith("--output=")) {
      const value = argument.slice("--output=".length);
      if (value.length === 0) {
        throw new BenchmarkConfigurationError("tutor_response_corpus_invalid");
      }
      outputPath = resolve(value);
    } else {
      throw new BenchmarkConfigurationError("tutor_response_corpus_invalid");
    }
  }
  if (corpusPath === undefined) {
    throw new BenchmarkConfigurationError("tutor_response_corpus_invalid");
  }
  return {
    corpusPath,
    outputPath,
    allowCompatibleReplay,
    help: false,
  };
}

export function printCriticalCalibrationPrepareHelp(): void {
  console.log(`Usage: calibration:critical:prepare --corpus <path> [options]

Convert a frozen TutorResponseCorpus into the existing critical-calibration
candidate-response contract. This command is offline and never calls a Tutor,
Judge, or provider.

Options:
  --corpus <path>       Frozen TutorResponseCorpus JSON file (required)
  --output <path>       Candidate JSON output path
                        (default: artifacts/calibration/private/critical-candidate-responses.json)
  --allow-compatible-replay
                        Explicitly opt in to an approved source-to-target replay
  --help                Show this help

Historical corpus versions fail closed unless --allow-compatible-replay is set.
`);
}

export async function prepareCriticalCalibrationCandidates(
  options: Omit<CriticalCalibrationPrepareCliOptions, "help">,
): Promise<CriticalCalibrationPreparationResult> {
  const corpus = await loadTutorResponseCorpus(options.corpusPath);
  const dataset = await loadTutorEvalDataset(corpus.datasetId);
  const replayPlan = options.allowCompatibleReplay
    ? resolveTutorResponseCorpusReplay(corpus, dataset)
    : undefined;
  const sourceDataset = replayPlan?.sourceDataset ?? dataset;
  assertValidTutorResponseCorpus({ corpus, dataset: sourceDataset });
  const semanticReplay =
    replayPlan === undefined
      ? undefined
      : toTutorResponseCorpusSemanticReplay(replayPlan);
  const candidates = parseCalibrationCandidateResponseFile(
    toCalibrationCandidateResponseFile(corpus, {
      dataset,
      ...(semanticReplay === undefined ? {} : { semanticReplay }),
    }),
  );
  await writeCalibrationJson(candidates, options.outputPath);
  return {
    candidates,
    sourceCorpusId: corpus.corpusId,
    sourceCorpusVersion: corpus.corpusVersion,
    sourceDatasetId: corpus.datasetId,
    sourceDatasetVersion: corpus.datasetVersion,
    targetDatasetId: dataset.id,
    targetDatasetVersion: dataset.version,
    ...(semanticReplay === undefined ? {} : { semanticReplay }),
    outputPath: options.outputPath,
  };
}

function printPreparationSummary(
  result: CriticalCalibrationPreparationResult,
): void {
  console.log("Prepared critical calibration candidate responses.");
  console.log(`Candidates: ${result.candidates.responses.length}`);
  console.log(`Source corpus: ${result.sourceCorpusId}@${result.sourceCorpusVersion}`);
  console.log(`Source dataset: ${result.sourceDatasetId}@${result.sourceDatasetVersion}`);
  console.log(`Target dataset: ${result.targetDatasetId}@${result.targetDatasetVersion}`);
  console.log(`Semantic replay: ${result.semanticReplay?.compatibilityId ?? "none"}`);
  console.log(`Output: ${result.outputPath}`);
}

export async function main(args = process.argv.slice(2)): Promise<void> {
  const options = parseCriticalCalibrationPrepareCliOptions(args);
  if (options.help) {
    printCriticalCalibrationPrepareHelp();
    return;
  }
  const result = await prepareCriticalCalibrationCandidates(options);
  printPreparationSummary(result);
}

if (process.argv[1]?.endsWith("calibration-critical-prepare.js")) {
  try {
    await main();
  } catch (error) {
    reportCliError(error);
  }
}
