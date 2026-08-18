import {
  TUTOR_EVAL_DATASET_ID,
  TUTOR_EVAL_PREVIOUS_DATASET_VERSION,
} from "../contracts/index.js";

/** Resolve the loader version without changing the corpus' recorded identity. */
export function resolveTutorResponseCorpusDatasetVersion(
  datasetId: string,
  datasetVersion: string,
): string {
  return datasetId === TUTOR_EVAL_DATASET_ID && datasetVersion === "0.2a"
    ? TUTOR_EVAL_PREVIOUS_DATASET_VERSION
    : datasetVersion;
}
