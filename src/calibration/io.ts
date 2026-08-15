import { readFile } from "node:fs/promises";

import { BenchmarkConfigurationError } from "../contracts/errors.js";
import {
  parseCalibrationAdjudicationFile,
  parseCalibrationAnnotationFile,
  parseCalibrationCandidateResponseFile,
} from "../contracts/calibration-validation.js";
import {
  parseCalibrationCriticalFailureAdjudicationFile,
  parseCalibrationCriticalFailureAnnotationFile,
  parseCalibrationCriticalFailureTargetFile,
} from "../contracts/critical-failure-calibration-validation.js";
import {
  type CalibrationCriticalFailureAdjudicationFile,
  type CalibrationCriticalFailureAnnotationFile,
  type CalibrationCriticalFailureTargetFile,
} from "../contracts/critical-failure-calibration.js";
import type {
  CalibrationAdjudicationFile,
  CalibrationAnnotationFile,
  CalibrationCandidateResponseFile,
} from "../contracts/calibration.js";

async function readJson(path: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as unknown;
  } catch {
    throw new BenchmarkConfigurationError("calibration_data_invalid");
  }
}
export async function loadCalibrationCandidateResponseFile(
  path: string,
): Promise<CalibrationCandidateResponseFile> {
  return parseCalibrationCandidateResponseFile(await readJson(path));
}

export async function loadCalibrationAnnotationFile(
  path: string,
): Promise<CalibrationAnnotationFile> {
  return parseCalibrationAnnotationFile(await readJson(path));
}

export async function loadCalibrationAdjudicationFile(
  path: string,
): Promise<CalibrationAdjudicationFile> {
  return parseCalibrationAdjudicationFile(await readJson(path));
}

export async function loadCalibrationCriticalFailureTargetFile(
  path: string,
): Promise<CalibrationCriticalFailureTargetFile> {
  return parseCalibrationCriticalFailureTargetFile(await readJson(path));
}

export async function loadCalibrationCriticalFailureAnnotationFile(
  path: string,
): Promise<CalibrationCriticalFailureAnnotationFile> {
  return parseCalibrationCriticalFailureAnnotationFile(await readJson(path));
}

export async function loadCalibrationCriticalFailureAdjudicationFile(
  path: string,
): Promise<CalibrationCriticalFailureAdjudicationFile> {
  return parseCalibrationCriticalFailureAdjudicationFile(await readJson(path));
}
