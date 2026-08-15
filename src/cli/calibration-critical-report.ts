import {
  buildCalibrationCriticalFailureReport,
  formatCalibrationCriticalFailureReport,
} from "../calibration/index.js";
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
  const report = buildCalibrationCriticalFailureReport(input);
  const outputPath =
    options.outputPath ??
    defaultCalibrationOutputPath("calibration-critical-failure-report.json");
  await writeCalibrationJson(report, outputPath);
  console.log(formatCalibrationCriticalFailureReport(report));
  console.log(`JSON report: ${outputPath}`);
}

try {
  await main();
} catch (error) {
  reportCliError(error);
}
