import { resolve } from "node:path";

import { TUTOR_EVAL_DATASET_ID } from "../contracts/index.js";
import { loadTutorEvalDataset } from "../datasets/index.js";
import { formatTutorEvalSummary, writeTutorEvalResult } from "../reporting/index.js";
import { runTutorEval } from "../runner/index.js";
import { createGuidedTutor } from "./synthetic-guided-tutor.js";

export async function main(): Promise<void> {
  const tutor = createGuidedTutor();
  const result = await runTutorEval({
    dataset: TUTOR_EVAL_DATASET_ID,
    datasetLoader: loadTutorEvalDataset,
    tutor,
    tutorDescriptor: {
      provider: "synthetic",
      model: "scripted-guided-tutor",
      modelVersion: "foundation",
      promptId: "synthetic-guided",
      promptVersion: "1.0.0",
      temperature: 0,
      seed: 0,
    },
    runsPerCase: 1,
    runId: "tutor-eval-v0.2a-synthetic-guided",
  });
  console.log(formatTutorEvalSummary(result));
  await writeTutorEvalResult(
    result,
    resolve(process.cwd(), "artifacts", "tutor-eval-v0.2a-result.json"),
  );
}

try {
  await main();
} catch (error) {
  console.error(
    error instanceof Error ? error.message : "TutorEval runner failed.",
  );
  process.exitCode = 1;
}
