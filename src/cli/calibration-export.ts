import {
  buildCalibrationPacket,
} from "../calibration/index.js";
import { loadTutorEvalDataset } from "../datasets/index.js";
import { TUTOR_EVAL_DATASET_ID } from "../contracts/index.js";
import { loadCalibrationCandidateResponseFile } from "../calibration/index.js";
import {
  defaultCalibrationOutputPath,
  parseCalibrationCliOptions,
  reportCliError,
  writeCalibrationJson,
} from "./calibration-common.js";

async function main(): Promise<void> {
  const options = parseCalibrationCliOptions(process.argv.slice(2));
  const dataset = await loadTutorEvalDataset(TUTOR_EVAL_DATASET_ID);
  const candidates = await loadCalibrationCandidateResponseFile(options.candidatePath);
  const packet = buildCalibrationPacket(dataset, candidates);
  const outputPath =
    options.outputPath ?? defaultCalibrationOutputPath("calibration-review-packet.json");
  await writeCalibrationJson(packet, outputPath);
  console.log(`Wrote blind calibration packet: ${outputPath}`);
  console.log(`Entries: ${packet.entries.length}`);
}

try {
  await main();
} catch (error) {
  reportCliError(error);
}
