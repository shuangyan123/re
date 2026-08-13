import { resolve } from "node:path";

import { reportTutorCliError, writeTutorCliJson } from "./tutor-case-common.js";
import {
  evaluateTutorResponseCorpus,
  parseBenchmarkCorpusCliOptions,
  printBenchmarkCorpusHelp,
  printTutorResponseCorpusEvaluation,
} from "./tutorbench-evaluate.js";

export {
  evaluateTutorResponseCorpus,
  parseBenchmarkCorpusCliOptions,
} from "./tutorbench-evaluate.js";

export async function main(args = process.argv.slice(2)): Promise<void> {
  const options = parseBenchmarkCorpusCliOptions(args);
  if (options.help) {
    printBenchmarkCorpusHelp();
    return;
  }
  const result = await evaluateTutorResponseCorpus(options);
  const outputPath = options.outputPath ?? resolve(
    process.cwd(),
    "artifacts",
    "tutor-eval-corpus-result.json",
  );
  await writeTutorCliJson(result, outputPath);
  printTutorResponseCorpusEvaluation(result, outputPath, false);
  if (result.evaluation.errorCount > 0) {
    process.exitCode = 1;
  }
}

if (process.argv[1]?.endsWith("benchmark-corpus.js")) {
  try {
    await main();
  } catch (error) {
    reportTutorCliError(error);
  }
}
