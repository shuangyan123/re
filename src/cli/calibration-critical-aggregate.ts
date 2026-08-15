import { buildCalibrationCriticalFailureReferenceSet } from "../calibration/index.js";
import {
  defaultCalibrationOutputPath,
  loadCriticalFailureCalibrationInput,
  parseCriticalFailureCalibrationCliOptions,
  reportCliError,
  writeCalibrationJson,
} from "./calibration-critical-common.js";

async function main(): Promise<void> {
  const options = parseCriticalFailureCalibrationCliOptions(process.argv.slice(2));
  const input = await loadCriticalFailureCalibrationInput(options);
  const referenceSet = buildCalibrationCriticalFailureReferenceSet(input);
  const outputPath =
    options.outputPath ??
    defaultCalibrationOutputPath("calibration-critical-failure-reference-set.json");
  await writeCalibrationJson(referenceSet, outputPath);
  console.log(`Wrote critical-failure human reference labels: ${outputPath}`);
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
