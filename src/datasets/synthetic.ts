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
  TUTOR_EVAL_IMMEDIATE_PREVIOUS_DATASET_VERSION,
  TUTOR_EVAL_PREVIOUS_CURRENT_DATASET_VERSION,
  TUTOR_EVAL_PREVIOUS_CANONICAL_DATASET_VERSION,
  TUTOR_EVAL_PREVIOUS_BILINGUAL_DATASET_VERSION,
  TUTOR_EVAL_PREVIOUS_DATASET_VERSION,
  type TutorEvalDataset,
} from "../contracts/index.js";
import { assertValidTutorEvalDatasetIntegrity } from "./integrity.js";

interface DatasetSpec {
  readonly directory: string;
  readonly version: string;
  readonly files: readonly string[];
  readonly overrideFile?: string;
  readonly strict: boolean;
  readonly requireCrossLocaleGroups: boolean;
}

async function readDatasetArray(
  moduleDirectory: string,
  directory: string,
  filename: string,
): Promise<unknown[]> {
  const filePaths = [
    resolve(moduleDirectory, "../../../scenarios", directory, filename),
    resolve(moduleDirectory, "../../scenarios", directory, filename),
    resolve(process.cwd(), "scenarios", directory, filename),
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
  const values = JSON.parse(raw) as unknown;
  if (!Array.isArray(values)) {
    throw new Error("TutorEval dataset file is not an array.");
  }
  return values;
}

function caseId(value: unknown): string | undefined {
  return typeof value === "object" &&
    value !== null &&
    "id" in value &&
    typeof value.id === "string"
    ? value.id
    : undefined;
}

function applyCaseOverrides(
  baseCases: readonly unknown[],
  overrides: readonly unknown[],
): unknown[] {
  const replacements = new Map<string, unknown>();
  for (const override of overrides) {
    const id = caseId(override);
    if (id === undefined || replacements.has(id)) {
      throw new Error("TutorEval dataset override is invalid.");
    }
    replacements.set(id, override);
  }
  const replaced = new Set<string>();
  const merged = baseCases.map((baseCase) => {
    const id = caseId(baseCase);
    const replacement = id === undefined ? undefined : replacements.get(id);
    if (replacement === undefined) {
      return baseCase;
    }
    replaced.add(id);
    return replacement;
  });
  if (replaced.size !== replacements.size) {
    throw new Error("TutorEval dataset override target was not found.");
  }
  return merged;
}

export async function loadTutorEvalDataset(
  datasetId: string = TUTOR_EVAL_DATASET_ID,
  requestedVersion?: string,
): Promise<TutorEvalDataset> {
  const datasetSpec: DatasetSpec | null =
    datasetId === TUTOR_EVAL_DATASET_ID
      ? requestedVersion === undefined || requestedVersion === TUTOR_EVAL_DATASET_VERSION
        ? {
            directory: "tutor-eval-v0.2a",
            version: TUTOR_EVAL_DATASET_VERSION,
            files: ["cases.0.2a.5.json", "cases.zh-CN.0.2a.5.json"],
            overrideFile: "cases.0.2a.6.overrides.json",
            strict: true,
            requireCrossLocaleGroups: true,
          }
        : requestedVersion === TUTOR_EVAL_IMMEDIATE_PREVIOUS_DATASET_VERSION
          ? {
              directory: "tutor-eval-v0.2a",
              version: TUTOR_EVAL_IMMEDIATE_PREVIOUS_DATASET_VERSION,
              files: ["cases.0.2a.5.json", "cases.zh-CN.0.2a.5.json"],
              strict: true,
              requireCrossLocaleGroups: true,
            }
        : requestedVersion === TUTOR_EVAL_PREVIOUS_CURRENT_DATASET_VERSION
          ? {
              directory: "tutor-eval-v0.2a",
              version: TUTOR_EVAL_PREVIOUS_CURRENT_DATASET_VERSION,
              files: ["cases.0.2a.4.json", "cases.zh-CN.0.2a.4.json"],
              strict: true,
              requireCrossLocaleGroups: true,
            }
        : requestedVersion === TUTOR_EVAL_PREVIOUS_CANONICAL_DATASET_VERSION
          ? {
              directory: "tutor-eval-v0.2a",
              version: TUTOR_EVAL_PREVIOUS_CANONICAL_DATASET_VERSION,
              files: ["cases.0.2a.3.json", "cases.zh-CN.0.2a.3.json"],
              strict: true,
              requireCrossLocaleGroups: true,
            }
        : requestedVersion === TUTOR_EVAL_PREVIOUS_BILINGUAL_DATASET_VERSION
          ? {
              directory: "tutor-eval-v0.2a",
              version: TUTOR_EVAL_PREVIOUS_BILINGUAL_DATASET_VERSION,
              files: ["cases.0.2a.2.json", "cases.zh-CN.0.2a.2.json"],
              strict: true,
              requireCrossLocaleGroups: true,
            }
        : requestedVersion === TUTOR_EVAL_PREVIOUS_DATASET_VERSION
          ? {
              directory: "tutor-eval-v0.2a",
              version: TUTOR_EVAL_PREVIOUS_DATASET_VERSION,
              files: ["cases.0.2a.2.json"],
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
      rawCases.push(
        ...(await readDatasetArray(moduleDirectory, datasetSpec.directory, filename)),
      );
    }
    const mergedCases =
      datasetSpec.overrideFile === undefined
        ? rawCases
        : applyCaseOverrides(
            rawCases,
            await readDatasetArray(
              moduleDirectory,
              datasetSpec.directory,
              datasetSpec.overrideFile,
            ),
          );
    const dataset = parseTutorEvalDataset({
      id: datasetId,
      version: datasetSpec.version,
      cases: mergedCases,
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
