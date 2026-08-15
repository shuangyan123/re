import { buildCalibrationCriticalFailurePacket } from "../calibration/index.js";
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
  const packet = buildCalibrationCriticalFailurePacket(
    input.dataset,
    input.candidates,
    input.targetFile,
  );
  const outputPath =
    options.outputPath ??
    defaultCalibrationOutputPath("calibration-critical-failure-review-packet.json");
  await writeCalibrationJson(packet, outputPath);
  console.log(`Wrote blind critical-failure calibration packet: ${outputPath}`);
  console.log(`Entries: ${packet.entries.length}`);
}

try {
  await main();
} catch (error) {
  reportCliError(error);
}
