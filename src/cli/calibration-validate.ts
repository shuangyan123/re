import {
  assertValidCalibrationData,
  findCalibrationReferenceReadinessIssues,
} from "../contracts/calibration-validation.js";
import {
  loadCalibrationInput,
  parseCalibrationCliOptions,
  reportCliError,
} from "./calibration-common.js";

async function main(): Promise<void> {
  const options = parseCalibrationCliOptions(process.argv.slice(2));
  const input = await loadCalibrationInput(options);
  assertValidCalibrationData(input);
  const readinessIssues = findCalibrationReferenceReadinessIssues(input);
  if (readinessIssues.length > 0) {
    console.error(
      `Calibration data is structurally valid but not reference-ready (${readinessIssues.length} issue(s)).`,
    );
    process.exitCode = 1;
    return;
  }
  const isSynthetic = input.annotationFiles.every(
    (file) => file.dataKind === "synthetic-fixture",
  );
  console.log("Calibration data is valid and reference-ready.");
  if (isSynthetic || input.annotationFiles.length === 0) {
    console.log("No human calibration data available.");
  }
}
try {
  await main();
} catch (error) {
  reportCliError(error);
}
