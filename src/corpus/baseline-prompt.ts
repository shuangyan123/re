import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import {
  digestTutorPrompt,
  TUTOR_GENERATION_SPEC_SCHEMA_VERSION,
  type TutorGenerationSpec,
} from "../contracts/index.js";

export const TUTOR_BASELINE_PROMPT_ID = "tutor-baseline-system" as const;
export const TUTOR_BASELINE_PROMPT_VERSION = "0.1" as const;
export const TUTOR_BASELINE_GENERATION_SPEC_ID = "tutor-baseline-generation" as const;
export const TUTOR_BASELINE_GENERATION_SPEC_VERSION = "0.4a.1" as const;
export const TUTOR_BASELINE_MAX_OUTPUT_TOKENS = 1024 as const;

export async function loadTutorBaselinePrompt(): Promise<string> {
  return readFile(
    resolve(
      process.cwd(),
      "prompts",
      "tutor-baseline-system-v0.1.md",
    ),
    "utf8",
  );
}

export function buildTutorBaselineGenerationSpec(
  promptAsset: string,
): TutorGenerationSpec {
  return {
    schemaVersion: TUTOR_GENERATION_SPEC_SCHEMA_VERSION,
    specId: TUTOR_BASELINE_GENERATION_SPEC_ID,
    specVersion: TUTOR_BASELINE_GENERATION_SPEC_VERSION,
    prompt: {
      id: TUTOR_BASELINE_PROMPT_ID,
      version: TUTOR_BASELINE_PROMPT_VERSION,
      sha256: digestTutorPrompt(promptAsset),
    },
    maxOutputTokens: TUTOR_BASELINE_MAX_OUTPUT_TOKENS,
    temperature: 0.2,
    reasoningEffort: "low",
    seed: 7,
  };
}
