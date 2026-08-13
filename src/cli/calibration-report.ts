import { buildCalibrationReport, formatCalibrationReport } from "../calibration/index.js";
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
  const report = buildCalibrationReport(input);
  const outputPath =
    options.outputPath ?? defaultCalibrationOutputPath("calibration-report.json");
  await writeCalibrationJson(report, outputPath);
  console.log(formatCalibrationReport(report));
  console.log(`JSON report: ${outputPath}`);
}
try {
  await main();
} catch (error) {
  reportCliError(error);
}
