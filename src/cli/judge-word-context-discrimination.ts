import { resolve } from "node:path";

import { TUTOR_EVAL_DATASET_ID, TUTOR_EVAL_DATASET_VERSION } from "../contracts/index.js";
import { loadTutorEvalDataset } from "../datasets/index.js";
import {
  buildWordContextDiscriminationCorpus,
  buildWordContextDiscriminationReport,
  formatWordContextDiscriminationReport,
  WORD_CONTEXT_DISCRIMINATION_CASE_ID,
  type WordContextDiscriminationReport,
} from "../judge/index.js";
import { runTutorResponseCorpus } from "../runner/index.js";
import { createJudgeIfRequested } from "./tutorbench-evaluate.js";
import {
  nextTutorbenchValue,
  tutorbenchOptionValue,
  TutorbenchCliUsageError,
} from "./tutorbench-common.js";
import { writeTutorCliJson } from "./tutor-case-common.js";

export interface JudgeWordContextDiscriminationCliOptions {
  readonly deepSeekJudge: boolean;
  readonly outputPath?: string;
  readonly help: boolean;
}

export function parseJudgeWordContextDiscriminationArgs(
  args: readonly string[],
): JudgeWordContextDiscriminationCliOptions {
  let deepSeekJudge = false;
  let outputPath: string | undefined;
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--help" || argument === "-h") {
      return { deepSeekJudge: false, help: true };
    }
    if (argument === "--judge-deepseek") {
      deepSeekJudge = true;
      continue;
    }
    if (argument === "--output") {
      outputPath = resolve(nextTutorbenchValue(args, index, "--output"));
      index += 1;
      continue;
    }
    const outputValue = tutorbenchOptionValue(argument ?? "", "--output");
    if (outputValue !== undefined) {
      outputPath = resolve(outputValue);
      continue;
    }
    throw new TutorbenchCliUsageError(`Unknown option: ${argument ?? ""}`);
  }
  if (!deepSeekJudge) {
    throw new TutorbenchCliUsageError(
      "--judge-deepseek is required; this command is the explicit three-call DeepSeek diagnostic.",
    );
  }
  return {
    deepSeekJudge: true,
    ...(outputPath === undefined ? {} : { outputPath }),
    help: false,
  };
}

export function printJudgeWordContextDiscriminationHelp(): void {
  console.log(`Usage: tutorbench judge-word-context-discrimination --judge-deepseek [options]

Builds the fixed A/B/C word-context diagnostic corpus in memory and evaluates
its three runs with the current Judge. The command makes exactly three Judge
calls and does not call a Tutor provider.

Options:
  --judge-deepseek       Opt in to the live DeepSeek Judge (required)
  --output <path>        Write the derived diagnostic report JSON
  --help                 Show this help

The report is diagnostic evidence only. It does not establish human
calibration, general Judge accuracy, or a benchmark pass/fail result.
`);
}

export async function runJudgeWordContextDiscrimination(
  options: JudgeWordContextDiscriminationCliOptions,
): Promise<WordContextDiscriminationReport> {
  if (options.help || !options.deepSeekJudge) {
    throw new TutorbenchCliUsageError(
      "--judge-deepseek is required; use --help for command usage.",
    );
  }
  const dataset = await loadTutorEvalDataset(
    TUTOR_EVAL_DATASET_ID,
    TUTOR_EVAL_DATASET_VERSION,
  );
  const corpus = buildWordContextDiscriminationCorpus();
  const judge = await createJudgeIfRequested(false, true, false);
  if (judge === undefined) {
    throw new TutorbenchCliUsageError("DeepSeek Judge could not be created.");
  }
  let judgeCallCount = 0;
  const result = await runTutorResponseCorpus({
    corpus,
    dataset,
    caseIds: [WORD_CONTEXT_DISCRIMINATION_CASE_ID],
    judge,
    onJudgeCall: () => {
      judgeCallCount += 1;
    },
    runId: "judge-word-context-discrimination",
  });
  const report = buildWordContextDiscriminationReport(result, { judgeCallCount });
  const outputPath = options.outputPath ?? resolve(
    process.cwd(),
    "artifacts",
    "judge-word-context-discrimination.json",
  );
  await writeTutorCliJson(report, outputPath);
  console.log(formatWordContextDiscriminationReport(report));
  console.log(`JSON report: ${outputPath}`);
  if (result.evaluation.errorCount > 0) {
    process.exitCode = 1;
  }
  return report;
}
