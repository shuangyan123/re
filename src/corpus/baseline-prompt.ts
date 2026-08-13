import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

export const TUTOR_BASELINE_PROMPT_ID = "tutor-baseline-system" as const;
export const TUTOR_BASELINE_PROMPT_VERSION = "0.1" as const;

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
