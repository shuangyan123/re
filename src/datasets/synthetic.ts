import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  BenchmarkConfigurationError,
  parseTutorEvalDataset,
  TUTOR_EVAL_LEGACY_DATASET_ID,
  TUTOR_EVAL_LEGACY_DATASET_VERSION,
  TUTOR_EVAL_DATASET_ID,
  TUTOR_EVAL_DATASET_VERSION,
  TUTOR_EVAL_PREVIOUS_BILINGUAL_DATASET_VERSION,
  TUTOR_EVAL_PREVIOUS_DATASET_VERSION,
  type TutorEvalDataset,
} from "../contracts/index.js";
import { assertValidTutorEvalDatasetIntegrity } from "./integrity.js";

export async function loadTutorEvalDataset(
  datasetId: string = TUTOR_EVAL_DATASET_ID,
  requestedVersion?: string,
): Promise<TutorEvalDataset> {
  const datasetSpec =
    datasetId === TUTOR_EVAL_DATASET_ID
      ? requestedVersion === undefined || requestedVersion === TUTOR_EVAL_DATASET_VERSION
        ? {
            directory: "tutor-eval-v0.2a",
            version: TUTOR_EVAL_DATASET_VERSION,
            files: ["cases.json", "cases.zh-CN.json"],
            strict: true,
            requireCrossLocaleGroups: true,
          }
        : requestedVersion === TUTOR_EVAL_PREVIOUS_BILINGUAL_DATASET_VERSION
          ? {
              directory: "tutor-eval-v0.2a",
              version: TUTOR_EVAL_PREVIOUS_BILINGUAL_DATASET_VERSION,
              files: ["cases.json", "cases.zh-CN.0.2a.2.json"],
              strict: true,
              requireCrossLocaleGroups: true,
            }
        : requestedVersion === TUTOR_EVAL_PREVIOUS_DATASET_VERSION
          ? {
              directory: "tutor-eval-v0.2a",
              version: TUTOR_EVAL_PREVIOUS_DATASET_VERSION,
              files: ["cases.json"],
              strict: true,
              requireCrossLocaleGroups: false,
            }
          : null
      : datasetId === TUTOR_EVAL_LEGACY_DATASET_ID &&
          (requestedVersion === undefined || requestedVersion === TUTOR_EVAL_LEGACY_DATASET_VERSION)
        ? {
            directory: "tutor-eval-v0.1",
            version: TUTOR_EVAL_LEGACY_DATASET_VERSION,
            files: ["cases.json"],
            strict: false,
            requireCrossLocaleGroups: false,
          }
        : null;
  if (datasetSpec === null) {
    throw new BenchmarkConfigurationError("tutor_eval_dataset_invalid");
  }
  try {
    const moduleDirectory = dirname(fileURLToPath(import.meta.url));
    const rawCases: unknown[] = [];
    for (const filename of datasetSpec.files) {
      const filePaths = [
        resolve(moduleDirectory, "../../../scenarios", datasetSpec.directory, filename),
        resolve(moduleDirectory, "../../scenarios", datasetSpec.directory, filename),
        resolve(process.cwd(), "scenarios", datasetSpec.directory, filename),
      ];
      let raw: string | undefined;
      for (const filePath of [...new Set(filePaths)]) {
        try {
          raw = await readFile(filePath, "utf8");
          break;
        } catch (error) {
          if (!isFileNotFound(error)) {
            throw error;
          }
        }
      }
      if (raw === undefined) {
        throw new Error("TutorEval dataset file was not found.");
      }
      const cases = JSON.parse(raw) as unknown;
      if (!Array.isArray(cases)) {
        throw new Error("TutorEval dataset file is not an array.");
      }
      rawCases.push(...cases);
    }
    const dataset = parseTutorEvalDataset({
      id: datasetId,
      version: datasetSpec.version,
      cases: rawCases,
    });
    if (datasetSpec.strict) {
      assertValidTutorEvalDatasetIntegrity(dataset, {
        requireTaxonomyMetadata: true,
        requireUniqueRubricIds: true,
        expectedDatasetVersion: datasetSpec.version,
        requireCrossLocaleGroups: datasetSpec.requireCrossLocaleGroups,
      });
    }
    return dataset;
  } catch (error) {
    if (error instanceof BenchmarkConfigurationError) {
      throw error;
    }
    throw new BenchmarkConfigurationError("tutor_eval_dataset_invalid");
  }
}

function isFileNotFound(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "ENOENT"
  );
}
