import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import { loadTutorEvalDataset } from "../datasets/index.js";
import { TUTOR_EVAL_DATASET_ID } from "../contracts/index.js";
import { BenchmarkConfigurationError } from "../contracts/errors.js";
import {
  loadCalibrationAdjudicationFile,
  loadCalibrationAnnotationFile,
  loadCalibrationCandidateResponseFile,
} from "../calibration/index.js";
import type {
  CalibrationAdjudicationFile,
  CalibrationAnnotationFile,
  CalibrationCandidateResponseFile,
} from "../contracts/calibration.js";
import type { TutorEvalDataset } from "../contracts/tutor-eval.js";

const defaultCandidatePath = resolve(
  process.cwd(),
  "fixtures",
  "calibration",
  "candidate-responses.json",
);
const defaultReviewerPaths = [
  resolve(process.cwd(), "fixtures", "calibration", "reviewer-a.json"),
  resolve(process.cwd(), "fixtures", "calibration", "reviewer-b.json"),
];
const defaultAdjudicationPath = resolve(
  process.cwd(),
  "fixtures",
  "calibration",
  "adjudication.json",
);

export interface CalibrationCliOptions {
  readonly candidatePath: string;
  readonly reviewerPaths: readonly string[];
  readonly adjudicationPath?: string;
  readonly outputPath?: string;
}

export interface CalibrationCliInput {
  readonly dataset: TutorEvalDataset;
  readonly candidates: CalibrationCandidateResponseFile;
  readonly annotationFiles: readonly CalibrationAnnotationFile[];
  readonly adjudicationFile?: CalibrationAdjudicationFile;
}

export function parseCalibrationCliOptions(
  args: readonly string[],
): CalibrationCliOptions {
  let candidatePath = defaultCandidatePath;
  let reviewerPaths: string[] | undefined;
  let adjudicationPath: string | undefined = defaultAdjudicationPath;
  let outputPath: string | undefined;
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--candidate" || argument === "--candidates") {
      const value = args[index + 1];
      if (value === undefined) {
        throw new BenchmarkConfigurationError("calibration_data_invalid");
      }
      candidatePath = resolve(value);
      index += 1;
    } else if (argument === "--reviewer") {
      const value = args[index + 1];
      if (value === undefined) {
        throw new BenchmarkConfigurationError("calibration_data_invalid");
      }
      reviewerPaths = [...(reviewerPaths ?? []), resolve(value)];
      index += 1;
    } else if (argument === "--no-reviewers") {
      reviewerPaths = [];
      adjudicationPath = undefined;
    } else if (argument === "--empty-calibration") {
      reviewerPaths = [];
      adjudicationPath = undefined;
    } else if (argument === "--adjudication") {
      const value = args[index + 1];
      if (value === undefined) {
        throw new BenchmarkConfigurationError("calibration_data_invalid");
      }
      adjudicationPath = resolve(value);
      index += 1;
    } else if (argument === "--no-adjudication") {
      adjudicationPath = undefined;
    } else if (argument === "--output") {
      const value = args[index + 1];
      if (value === undefined) {
        throw new BenchmarkConfigurationError("calibration_data_invalid");
      }
      outputPath = resolve(value);
      index += 1;
    } else {
      throw new BenchmarkConfigurationError("calibration_data_invalid");
    }
  }
  return {
    candidatePath,
    reviewerPaths: reviewerPaths ?? defaultReviewerPaths,
    ...(adjudicationPath === undefined ? {} : { adjudicationPath }),
    ...(outputPath === undefined ? {} : { outputPath }),
  };
}

export async function loadCalibrationInput(
  options: CalibrationCliOptions,
): Promise<CalibrationCliInput> {
  const dataset = await loadTutorEvalDataset(TUTOR_EVAL_DATASET_ID);
  const candidates = await loadCalibrationCandidateResponseFile(options.candidatePath);
  const annotationFiles = await Promise.all(
    options.reviewerPaths.map((path) => loadCalibrationAnnotationFile(path)),
  );
  const adjudicationFile =
    options.adjudicationPath === undefined
      ? undefined
      : await loadCalibrationAdjudicationFile(options.adjudicationPath);
  return {
    dataset,
    candidates,
    annotationFiles,
    ...(adjudicationFile === undefined ? {} : { adjudicationFile }),
  };
}

export async function writeCalibrationJson(
  value: unknown,
  outputPath: string,
): Promise<void> {
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export function defaultCalibrationOutputPath(fileName: string): string {
  return resolve(process.cwd(), "artifacts", fileName);
}

export function reportCliError(error: unknown): void {
  console.error(
    error instanceof BenchmarkConfigurationError
      ? error.message
      : "Calibration command failed.",
  );
  process.exitCode = 1;
}
