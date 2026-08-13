import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  digestTutorPrompt,
  TUTOR_GENERATION_SPEC_SCHEMA_VERSION,
  type TutorGenerationSpec,
} from "../contracts/index.js";

export const TUTOR_BASELINE_PROMPT_ID = "tutor-baseline-system" as const;
export const TUTOR_BASELINE_PROMPT_VERSION = "0.1" as const;
export const TUTOR_BASELINE_GENERATION_SPEC_ID = "tutor-baseline-generation" as const;
export const TUTOR_BASELINE_GENERATION_SPEC_VERSION_V1 = "0.4a.1" as const;
export const TUTOR_BASELINE_GENERATION_SPEC_VERSION = "0.4a.2" as const;
export const TUTOR_BASELINE_MAX_OUTPUT_TOKENS = 1024 as const;

export async function loadTutorBaselinePrompt(): Promise<string> {
  const promptName = "tutor-baseline-system-v0.1.md";
  const moduleDirectory = dirname(fileURLToPath(import.meta.url));
  const filePaths = [
    resolve(process.cwd(), "prompts", promptName),
    resolve(moduleDirectory, "../../../prompts", promptName),
  ];
  for (const filePath of [...new Set(filePaths)]) {
    try {
      return await readFile(filePath, "utf8");
    } catch (error) {
      if (
        typeof error !== "object" ||
        error === null ||
        !("code" in error) ||
        error.code !== "ENOENT"
      ) {
        throw error;
      }
    }
  }
  throw new Error("Tutor baseline prompt asset was not found.");
}

function buildTutorBaselineGenerationSpecBase(
  promptAsset: string,
  specVersion: string,
): Pick<TutorGenerationSpec, "schemaVersion" | "specId" | "specVersion" | "prompt" | "maxOutputTokens"> {
  return {
    schemaVersion: TUTOR_GENERATION_SPEC_SCHEMA_VERSION,
    specId: TUTOR_BASELINE_GENERATION_SPEC_ID,
    specVersion,
    prompt: {
      id: TUTOR_BASELINE_PROMPT_ID,
      version: TUTOR_BASELINE_PROMPT_VERSION,
      sha256: digestTutorPrompt(promptAsset),
    },
    maxOutputTokens: TUTOR_BASELINE_MAX_OUTPUT_TOKENS,
  };
}

/** Historical 0.4A.1 identity; do not reinterpret this profile. */
export function buildTutorBaselineGenerationSpecV1(
  promptAsset: string,
): TutorGenerationSpec {
  return {
    ...buildTutorBaselineGenerationSpecBase(
      promptAsset,
      TUTOR_BASELINE_GENERATION_SPEC_VERSION_V1,
    ),
    temperature: 0.2,
    reasoningEffort: "low",
    seed: 7,
  };
}

/** Public baseline-native-default profile for 0.4A.2 and later exports. */
export function buildTutorBaselineGenerationSpec(
  promptAsset: string,
): TutorGenerationSpec {
  return buildTutorBaselineGenerationSpecBase(
    promptAsset,
    TUTOR_BASELINE_GENERATION_SPEC_VERSION,
  );
}

export const buildTutorBaselineGenerationSpecV2 =
  buildTutorBaselineGenerationSpec;
