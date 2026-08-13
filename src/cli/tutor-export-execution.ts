import {
  buildTutorExecutionPacketFile,
} from "../contracts/index.js";
import {
  buildTutorBaselineGenerationSpec,
  loadTutorBaselinePrompt,
} from "../corpus/index.js";
import {
  loadCanonicalTutorEvalDataset,
  parseTutorCaseSelectionOptions,
  reportTutorCliError,
  selectTutorEvalCases,
  writeTutorCliJson,
} from "./tutor-case-common.js";

export async function main(args = process.argv.slice(2)): Promise<void> {
  const options = parseTutorCaseSelectionOptions(args);
  if (options.help) {
    console.log(`Usage: npm run tutor:export-execution -- [options]

Default selection is the full checked-in dataset.

Options:
  --case <id>           Select one case; repeat for a subset
  --limit <n>           Select the first n cases in stable ID order
  --all                 Select the full dataset explicitly
  --output <path>       Write the canonical execution packet to this path
  --help                Show this help
`);
    return;
  }
  const [dataset, promptAsset] = await Promise.all([
    loadCanonicalTutorEvalDataset(),
    loadTutorBaselinePrompt(),
  ]);
  const selectedCases = selectTutorEvalCases(dataset, options);
  const generationSpec = buildTutorBaselineGenerationSpec(promptAsset);
  const packet = buildTutorExecutionPacketFile(
    dataset,
    selectedCases,
    generationSpec,
    promptAsset,
  );
  const outputPath = options.outputPath ?? "artifacts/tutor-execution-packet.json";
  await writeTutorCliJson(packet, outputPath);
  console.log(`Wrote Tutor execution packet: ${outputPath}`);
  console.log(`Dataset: ${packet.datasetId}@${packet.datasetVersion}`);
  console.log(`Generation spec: ${packet.generationSpec.specId}@${packet.generationSpec.specVersion}`);
  console.log(`Prompt: ${packet.generationSpec.prompt.id}@${packet.generationSpec.prompt.version}`);
  console.log(`Cases: ${packet.cases.length}`);
  console.log("Evaluator-only annotations exported: 0");
}

if (process.argv[1]?.endsWith("tutor-export-execution.js")) {
  try {
    await main();
  } catch (error) {
    reportTutorCliError(error);
  }
}
