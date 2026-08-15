import {
  assertCriticalFailureCalibrationReferenceReady,
  assertValidCriticalFailureCalibrationData,
  findCriticalFailureCalibrationReferenceReadinessIssues,
} from "../contracts/critical-failure-calibration-validation.js";
import {
  loadCriticalFailureCalibrationInput,
  parseCriticalFailureCalibrationCliOptions,
  reportCliError,
} from "./calibration-critical-common.js";

async function main(): Promise<void> {
  const options = parseCriticalFailureCalibrationCliOptions(process.argv.slice(2));
  const input = await loadCriticalFailureCalibrationInput(options);
  assertValidCriticalFailureCalibrationData(input);
  const readinessIssues = findCriticalFailureCalibrationReferenceReadinessIssues(input);
  if (readinessIssues.length > 0) {
    console.error(
      `Critical-failure calibration data is structurally valid but not reference-ready (${readinessIssues.length} issue(s)).`,
    );
    process.exitCode = 1;
    return;
  }
  assertCriticalFailureCalibrationReferenceReady(input);
  console.log("Critical-failure calibration data is valid and reference-ready.");
  if (
    input.annotationFiles.length === 0 ||
    input.annotationFiles.every((file) => file.dataKind === "synthetic-fixture")
  ) {
    console.log("No human critical-failure calibration data available.");
  }
}

try {
  await main();
} catch (error) {
  reportCliError(error);
}
