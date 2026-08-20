import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import { BenchmarkConfigurationError } from "../contracts/errors.js";
import {
  parseHumanReferenceAdjudicationFile,
  parseHumanReferenceAnnotationFile,
  parseHumanReferenceSet,
} from "../contracts/human-reference-calibration-validation.js";
import type {
  HumanReferenceAdjudicationFile,
  HumanReferenceAnnotationFile,
  HumanReferenceCalibrationReport,
  HumanReferenceSet,
} from "../contracts/human-reference-calibration.js";

async function readJson(path: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as unknown;
  } catch {
    throw new BenchmarkConfigurationError("human_reference_calibration_invalid");
  }
}

export async function loadHumanReferenceAnnotationFile(
  path: string,
): Promise<HumanReferenceAnnotationFile> {
  return parseHumanReferenceAnnotationFile(await readJson(path));
}

export async function loadHumanReferenceAdjudicationFile(
  path: string,
): Promise<HumanReferenceAdjudicationFile> {
  return parseHumanReferenceAdjudicationFile(await readJson(path));
}

export async function loadHumanReferenceSet(
  path: string,
): Promise<HumanReferenceSet> {
  return parseHumanReferenceSet(await readJson(path));
}

export async function writeHumanReferenceJson(
  value: HumanReferenceSet | HumanReferenceCalibrationReport,
  outputPath: string,
): Promise<void> {
  try {
    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(outputPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  } catch {
    throw new BenchmarkConfigurationError("human_reference_calibration_invalid");
  }
}
