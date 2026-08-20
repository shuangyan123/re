import { resolve } from "node:path";

import {
  buildHumanReferenceCalibrationReport,
  loadHumanReferenceAdjudicationFile,
  loadHumanReferenceAnnotationFile,
  writeHumanReferenceJson,
} from "../calibration/index.js";
import { BenchmarkConfigurationError } from "../contracts/errors.js";
import {
  nextTutorbenchValue,
  tutorbenchOptionValue,
  TutorbenchCliUsageError,
} from "./tutorbench-common.js";

const defaultOutputPath = resolve(
  process.cwd(),
  "artifacts",
  "human-reference-calibration-report.json",
);

export type HumanReferenceCalibrationCliOptions =
  | { readonly help: true }
  | {
      readonly help: false;
      readonly annotationPath: string;
      readonly adjudicationPath?: string;
      readonly outputPath: string;
    };

export function parseHumanReferenceCalibrationArgs(
  args: readonly string[],
): HumanReferenceCalibrationCliOptions {
  let annotationPath: string | undefined;
  let adjudicationPath: string | undefined;
  let outputPath = defaultOutputPath;
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === undefined) {
      throw new TutorbenchCliUsageError("A CLI option is missing.");
    }
    if (argument === "--help" || argument === "-h") {
      return { help: true };
    }
    if (argument === "--annotations") {
      annotationPath = resolve(nextTutorbenchValue(args, index, "--annotations"));
      index += 1;
      continue;
    }
    const annotationsValue = tutorbenchOptionValue(argument, "--annotations");
    if (annotationsValue !== undefined) {
      annotationPath = resolve(annotationsValue);
      continue;
    }
    if (argument === "--adjudications") {
      adjudicationPath = resolve(nextTutorbenchValue(args, index, "--adjudications"));
      index += 1;
      continue;
    }
    const adjudicationsValue = tutorbenchOptionValue(argument, "--adjudications");
    if (adjudicationsValue !== undefined) {
      adjudicationPath = resolve(adjudicationsValue);
      continue;
    }
    if (argument === "--output") {
      outputPath = resolve(nextTutorbenchValue(args, index, "--output"));
      index += 1;
      continue;
    }
    const outputValue = tutorbenchOptionValue(argument, "--output");
    if (outputValue !== undefined) {
      outputPath = resolve(outputValue);
      continue;
    }
    throw new TutorbenchCliUsageError(`Unknown option: ${argument}`);
  }
  if (annotationPath === undefined) {
    throw new TutorbenchCliUsageError("--annotations requires a value.");
  }
  return {
    help: false,
    annotationPath,
    ...(adjudicationPath === undefined ? {} : { adjudicationPath }),
    outputPath,
  };
}

export function printHumanReferenceCalibrationHelp(): void {
  console.log(`Tutor Benchmark human-reference calibration

Usage:
  tutorbench human-reference-calibration --annotations <path> [options]

Options:
  --annotations <path>    Strict JSON annotation batch (required)
  --adjudications <path>  Optional strict JSON adjudication file
  --output <path>         Report path (default: artifacts/human-reference-calibration-report.json)
  --help                  Show this help

This command is provider-free. It never calls a Tutor or Judge; external JSON
is parsed and validated before deterministic agreement, coverage, and labels
are reported.`);
}

export async function runHumanReferenceCalibration(
  options: Extract<HumanReferenceCalibrationCliOptions, { readonly help: false }>,
): Promise<void> {
  try {
    const annotationFile = await loadHumanReferenceAnnotationFile(options.annotationPath);
    const adjudicationFile = options.adjudicationPath === undefined
      ? undefined
      : await loadHumanReferenceAdjudicationFile(options.adjudicationPath);
    const report = buildHumanReferenceCalibrationReport(annotationFile, adjudicationFile);
    await writeHumanReferenceJson(report, options.outputPath);
    console.log([
      "Human-reference calibration report",
      `  Data kind: ${report.dataKind}`,
      `  Human reference data present: ${report.humanReferenceDataPresent}`,
      `  Human-human agreement: ${report.humanHumanAgreement.agreementCount}/${report.humanHumanAgreement.comparableAtomicCount}`,
      `  Reference coverage: ${report.referenceCoverage.resolvedAtomicAssessments}/${report.referenceCoverage.plannedAtomicAssessments}`,
      `  Unresolved disagreements: ${report.unresolvedDisagreements.length}`,
      `  Missing annotations: ${report.missingAnnotations.length}`,
      `  Derived reference labels: ${report.derivedReferenceLabels.length}`,
      `  Wrote report: ${options.outputPath}`,
    ].join("\n"));
  } catch (error) {
    if (error instanceof BenchmarkConfigurationError || error instanceof TutorbenchCliUsageError) {
      throw error;
    }
    throw new BenchmarkConfigurationError("human_reference_calibration_invalid");
  }
}
