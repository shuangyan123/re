import { resolve } from "node:path";

import { ScriptedTutor } from "../adapters/scripted-tutor.js";
import { TUTOR_EVAL_DATASET_ID } from "../contracts/index.js";
import { loadTutorEvalDataset } from "../datasets/index.js";
import { formatTutorEvalSummary, writeTutorEvalResult } from "../reporting/index.js";
import { runTutorEval } from "../runner/index.js";

const guidedResponses: Readonly<Record<string, string>> = {
  "fraction-misconception-001":
    "You noticed the denominators are different. First, find a common denominator. What could you find first?",
  "hint-only-linear-equation-001":
    "First, subtract 3 from both sides. What does that leave before you divide?",
  "correct-answer-wrong-reasoning-001":
    "Your answer 12 is correct, but the reasoning needs fixing: multiplication means equal groups, or repeated addition. Can you describe three groups of four?",
  "paired-fraction-procedural-001":
    "Since you already found the common denominator, focus on this next step: add the numerators and keep the denominator. What happens?",
  "paired-fraction-conceptual-001":
    "Think of one whole split into same-sized units. What question could you ask about the size of each unit? Try drawing one example.",
  "weak-foundation-fractions-001":
    "Start with one whole. Split it into equal parts in a drawing. This is the first step; can you draw the parts and check which two are shaded?",
  "full-solution-check-001":
    "Yes, x=4. Check it by substituting: subtract 3, then divide by 2. The check confirms the solution.",
};

export async function main(): Promise<void> {
  const tutor = new ScriptedTutor({
    id: "scripted-guided-tutor",
    responses: guidedResponses,
  });
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
    runId: "tutor-eval-v0.1-synthetic-guided",
  });
  console.log(formatTutorEvalSummary(result));
  await writeTutorEvalResult(
    result,
    resolve(process.cwd(), "artifacts", "tutor-eval-v0.1-result.json"),
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
