import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

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
  datasetId: string,
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
    const filePath = resolve(
      process.cwd(),
      "scenarios",
      datasetSpec.directory,
      "cases.json",
    );
    const value = JSON.parse(await readFile(filePath, "utf8")) as unknown;
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
