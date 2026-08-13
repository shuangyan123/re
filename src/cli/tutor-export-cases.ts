import {
  buildTutorVisibleCasePacketFile,
} from "../contracts/index.js";
import {
  loadCanonicalTutorEvalDataset,
  parseTutorCaseSelectionOptions,
  reportTutorCliError,
  selectTutorEvalCases,
  writeTutorCliJson,
} from "./tutor-case-common.js";

async function main(args = process.argv.slice(2)): Promise<void> {
  const options = parseTutorCaseSelectionOptions(args);
  if (options.help) {
    console.log(`Usage: npm run tutor:export-cases -- [options]

Default selection is the full checked-in dataset.

Options:
  --case <id>           Select one case; repeat for a subset
  --limit <n>           Select the first n cases in stable ID order
  --all                 Select the full dataset explicitly
  --output <path>       Write the Tutor-visible JSON packet to this path
  --help                Show this help
`);
    return;
  }
  const dataset = await loadCanonicalTutorEvalDataset();
  const selectedCases = selectTutorEvalCases(dataset, options);
  const packet = buildTutorVisibleCasePacketFile(dataset, selectedCases);
  const outputPath = options.outputPath ?? "artifacts/tutor-visible-case-packet.json";
  await writeTutorCliJson(packet, outputPath);
  console.log(`Wrote Tutor-visible case packet: ${outputPath}`);
  console.log(`Cases: ${packet.cases.length}`);
  console.log("Evaluator-only annotations exported: 0");
}

try {
  await main();
} catch (error) {
  reportTutorCliError(error);
}
