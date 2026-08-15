import { resolve } from "node:path";

import { loadTutorEvalDataset } from "../datasets/index.js";
import {
  BenchmarkConfigurationError,
  TUTOR_EVAL_DATASET_ID,
  type CalibrationCandidateResponseFile,
} from "../contracts/index.js";
import {
  loadCalibrationCandidateResponseFile,
  loadCalibrationCriticalFailureAdjudicationFile,
  loadCalibrationCriticalFailureAnnotationFile,
  loadCalibrationCriticalFailureTargetFile,
} from "../calibration/index.js";
import type {
  CalibrationCriticalFailureAdjudicationFile,
  CalibrationCriticalFailureAnnotationFile,
  CalibrationCriticalFailureTargetFile,
} from "../contracts/critical-failure-calibration.js";
import type { TutorEvalDataset } from "../contracts/tutor-eval.js";
import {
  defaultCalibrationOutputPath,
  reportCliError,
  writeCalibrationJson,
} from "./calibration-common.js";

const defaultCandidatePath = resolve(
  process.cwd(),
  "fixtures",
  "calibration",
  "critical-failure-candidate-responses.json",
);
const defaultTargetPath = resolve(
  process.cwd(),
  "fixtures",
  "calibration",
  "critical-failure-targets.json",
);
const defaultReviewerPaths = [
  resolve(process.cwd(), "fixtures", "calibration", "critical-reviewer-a.json"),
  resolve(process.cwd(), "fixtures", "calibration", "critical-reviewer-b.json"),
];
const defaultAdjudicationPath = resolve(
  process.cwd(),
  "fixtures",
  "calibration",
  "critical-adjudication.json",
);

export interface CriticalFailureCalibrationCliOptions {
  readonly candidatePath: string;
  readonly targetPath: string;
  readonly reviewerPaths: readonly string[];
  readonly adjudicationPath?: string;
  readonly outputPath?: string;
}

export interface CriticalFailureCalibrationCliInput {
  readonly dataset: TutorEvalDataset;
  readonly candidates: CalibrationCandidateResponseFile;
  readonly targetFile: CalibrationCriticalFailureTargetFile;
  readonly annotationFiles: readonly CalibrationCriticalFailureAnnotationFile[];
  readonly adjudicationFile?: CalibrationCriticalFailureAdjudicationFile;
}

export function parseCriticalFailureCalibrationCliOptions(
  args: readonly string[],
): CriticalFailureCalibrationCliOptions {
  let candidatePath = defaultCandidatePath;
  let targetPath = defaultTargetPath;
  let reviewerPaths: string[] | undefined;
  let adjudicationPath: string | undefined = defaultAdjudicationPath;
  let outputPath: string | undefined;
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--candidate" || argument === "--candidates") {
      const value = args[index + 1];
      if (value === undefined) {
        throw new BenchmarkConfigurationError("calibration_critical_failure_data_invalid");
      }
      candidatePath = resolve(value);
      index += 1;
    } else if (argument === "--targets" || argument === "--target-registry") {
      const value = args[index + 1];
      if (value === undefined) {
        throw new BenchmarkConfigurationError("calibration_critical_failure_data_invalid");
      }
      targetPath = resolve(value);
      index += 1;
    } else if (argument === "--reviewer") {
      const value = args[index + 1];
      if (value === undefined) {
        throw new BenchmarkConfigurationError("calibration_critical_failure_data_invalid");
      }
      reviewerPaths = [...(reviewerPaths ?? []), resolve(value)];
      index += 1;
    } else if (argument === "--no-reviewers" || argument === "--empty-calibration") {
      reviewerPaths = [];
      adjudicationPath = undefined;
    } else if (argument === "--adjudication") {
      const value = args[index + 1];
      if (value === undefined) {
        throw new BenchmarkConfigurationError("calibration_critical_failure_data_invalid");
      }
      adjudicationPath = resolve(value);
      index += 1;
    } else if (argument === "--no-adjudication") {
      adjudicationPath = undefined;
    } else if (argument === "--output") {
      const value = args[index + 1];
      if (value === undefined) {
        throw new BenchmarkConfigurationError("calibration_critical_failure_data_invalid");
      }
      outputPath = resolve(value);
      index += 1;
    } else {
      throw new BenchmarkConfigurationError("calibration_critical_failure_data_invalid");
    }
  }
  return {
    candidatePath,
    targetPath,
    reviewerPaths: reviewerPaths ?? defaultReviewerPaths,
    ...(adjudicationPath === undefined ? {} : { adjudicationPath }),
    ...(outputPath === undefined ? {} : { outputPath }),
  };
}

export async function loadCriticalFailureCalibrationInput(
  options: CriticalFailureCalibrationCliOptions,
): Promise<CriticalFailureCalibrationCliInput> {
  const dataset = await loadTutorEvalDataset(TUTOR_EVAL_DATASET_ID);
  const candidates = await loadCalibrationCandidateResponseFile(options.candidatePath);
  const targetFile = await loadCalibrationCriticalFailureTargetFile(options.targetPath);
  const annotationFiles = await Promise.all(
    options.reviewerPaths.map((path) => loadCalibrationCriticalFailureAnnotationFile(path)),
  );
  const adjudicationFile =
    options.adjudicationPath === undefined
      ? undefined
      : await loadCalibrationCriticalFailureAdjudicationFile(options.adjudicationPath);
  return {
    dataset,
    candidates,
    targetFile,
    annotationFiles,
    ...(adjudicationFile === undefined ? {} : { adjudicationFile }),
  };
}

export {
  defaultCalibrationOutputPath,
  reportCliError,
  writeCalibrationJson,
};
