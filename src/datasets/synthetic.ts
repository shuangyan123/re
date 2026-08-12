import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import {
  BenchmarkConfigurationError,
  parseTutorEvalDataset,
  TUTOR_EVAL_DATASET_ID,
  TUTOR_EVAL_DATASET_VERSION,
  type TutorEvalDataset,
} from "../contracts/index.js";

export async function loadTutorEvalDataset(
  datasetId: string,
): Promise<TutorEvalDataset> {
  if (datasetId !== TUTOR_EVAL_DATASET_ID) {
    throw new BenchmarkConfigurationError("tutor_eval_dataset_invalid");
  }
  try {
    const filePath = resolve(
      process.cwd(),
      "scenarios",
      "tutor-eval-v0.1",
      "cases.json",
    );
    const value = JSON.parse(await readFile(filePath, "utf8")) as unknown;
    const dataset = parseTutorEvalDataset({
      id: TUTOR_EVAL_DATASET_ID,
      version: TUTOR_EVAL_DATASET_VERSION,
      cases: value,
    });
    return dataset;
  } catch (error) {
    if (error instanceof BenchmarkConfigurationError) {
      throw error;
    }
    throw new BenchmarkConfigurationError("tutor_eval_dataset_invalid");
  }
}
