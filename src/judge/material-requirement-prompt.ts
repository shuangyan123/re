import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

export const MATERIAL_REQUIREMENT_JUDGE_PROMPT_ID =
  "tutor-eval-material-requirement-judge-system" as const;
export const MATERIAL_REQUIREMENT_JUDGE_PROMPT_VERSION = "0.1" as const;
export const MATERIAL_REQUIREMENT_JUDGE_PROMPT_ASSET =
  "prompts/tutor-eval-material-requirement-judge-system-v0.1.md" as const;

export async function loadMaterialRequirementJudgePrompt(
  baseDirectory = process.cwd(),
): Promise<string> {
  return readFile(resolve(baseDirectory, MATERIAL_REQUIREMENT_JUDGE_PROMPT_ASSET), "utf8");
}
