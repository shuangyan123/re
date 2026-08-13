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
  type TutorEvalDataset,
} from "../contracts/index.js";
import { assertValidTutorEvalDatasetIntegrity } from "./integrity.js";

export async function loadTutorEvalDataset(
  datasetId: string = TUTOR_EVAL_DATASET_ID,
): Promise<TutorEvalDataset> {
  const datasetSpec =
    datasetId === TUTOR_EVAL_DATASET_ID
      ? {
          directory: "tutor-eval-v0.2a",
          version: TUTOR_EVAL_DATASET_VERSION,
          strict: true,
        }
      : datasetId === TUTOR_EVAL_LEGACY_DATASET_ID
        ? {
            directory: "tutor-eval-v0.1",
            version: TUTOR_EVAL_LEGACY_DATASET_VERSION,
            strict: false,
          }
        : null;
  if (datasetSpec === null) {
    throw new BenchmarkConfigurationError("tutor_eval_dataset_invalid");
  }
  try {
    const moduleDirectory = dirname(fileURLToPath(import.meta.url));
    const filePaths = [
      resolve(moduleDirectory, "../../../scenarios", datasetSpec.directory, "cases.json"),
      resolve(moduleDirectory, "../../scenarios", datasetSpec.directory, "cases.json"),
      resolve(process.cwd(), "scenarios", datasetSpec.directory, "cases.json"),
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
    const value = JSON.parse(raw) as unknown;
    const dataset = parseTutorEvalDataset({
      id: datasetId,
      version: datasetSpec.version,
      cases: value,
    });
    if (datasetSpec.strict) {
      assertValidTutorEvalDatasetIntegrity(dataset, {
        requireTaxonomyMetadata: true,
        requireUniqueRubricIds: true,
        expectedDatasetVersion: TUTOR_EVAL_DATASET_VERSION,
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
