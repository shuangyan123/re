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
  "paired-multiplication-procedural-001":
    "Your drawing shows equal groups. Write the repeated addition from one group at a time, then check your expression.",
  "paired-multiplication-conceptual-001":
    "Multiplication can describe equal groups. Draw three groups of four and ask what repeated addition represents them.",
  "science-density-knowledge-001":
    "Density relates mass to volume. What does each word describe in this relationship?",
  "science-force-transfer-001":
    "Use the balanced-forces idea from the earlier example. Identify the two opposing forces on the book and compare them.",
  "science-photosynthesis-concept-001":
    "Plants use light as energy in a process that also uses carbon dioxide. Can you name one input?",
  "science-graph-error-001":
    "Before interpreting the highest point, check the vertical axis. Does it show amount or rate?",
  "language-evidence-argument-001":
    "Find one sentence in the text that supports the character being brave. Which evidence can you point to?",
  "language-verb-check-001":
    "The subject is list, so check whether the verb agrees with that singular subject. Reread the corrected sentence.",
  "language-word-context-001":
    "Use the context clues around reluctant. Which word or action in the sentence supports your meaning?",
  "history-source-context-001":
    "A source reflects the author's perspective and context. Who created it, and when?",
  "history-cause-check-001":
    "Treat that event as one possible cause. What additional cause and evidence could you examine?",
  "history-source-bias-001":
    "Listing dates does not remove perspective or purpose. Check who wrote the source and what they wanted to achieve.",
  "programming-loop-diagnosis-001":
    "Trace the counter and condition for one iteration. Does the condition ever become false?",
  "programming-function-recall-001":
    "An input is a value passed into a function, while return describes the value it sends back. Label each in a small example.",
  "programming-test-failure-001":
    "Start with the failing test name and compare the expected result with the actual result. What is the first difference?",
  "programming-off-by-one-001":
    "A zero-based array of a given length has a last index one less than its length. Check the index against the length.",
  "programming-abstraction-transfer-001":
    "Look for the one input that changes in the repeated lines. How could a small function make that input explicit?",
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
