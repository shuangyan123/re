import { buildCalibrationReferenceSet } from "../calibration/index.js";
import {
  defaultCalibrationOutputPath,
  loadCalibrationInput,
  parseCalibrationCliOptions,
  reportCliError,
  writeCalibrationJson,
} from "./calibration-common.js";

async function main(): Promise<void> {
  const options = parseCalibrationCliOptions(process.argv.slice(2));
  const input = await loadCalibrationInput(options);
  const referenceSet = buildCalibrationReferenceSet(input);
  const outputPath =
    options.outputPath ?? defaultCalibrationOutputPath("calibration-reference-set.json");
  await writeCalibrationJson(referenceSet, outputPath);
  console.log(`Wrote calibration reference labels: ${outputPath}`);
  if (!referenceSet.humanCalibrationAvailable) {
    console.log("Synthetic fixture only; no human calibration data available.");
  }
  console.log(`Labels: ${referenceSet.labels.length}`);
}
try {
  await main();
} catch (error) {
  reportCliError(error);
}
