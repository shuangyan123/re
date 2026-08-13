import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

export const TUTOR_EVAL_PEDAGOGY_JUDGE_PROMPT_ID =
  "tutor-eval-pedagogy-judge-system" as const;
export const TUTOR_EVAL_PEDAGOGY_JUDGE_PROMPT_VERSION = "0.2" as const;
export const TUTOR_EVAL_PEDAGOGY_JUDGE_PROMPT_ASSET =
  "prompts/tutor-eval-pedagogy-judge-system-v0.2.md" as const;

/**
 * Loads the versioned prompt asset at the adapter boundary. The core result
 * contracts retain only prompt identity metadata, never the prompt contents.
 */
export async function loadTutorEvalPedagogyJudgePrompt(
  baseDirectory = process.cwd(),
): Promise<string> {
  return readFile(
    resolve(baseDirectory, TUTOR_EVAL_PEDAGOGY_JUDGE_PROMPT_ASSET),
    "utf8",
  );
}
