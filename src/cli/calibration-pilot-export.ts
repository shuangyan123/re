import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

import {
  buildCanonicalCalibrationPilotBundle,
  CANONICAL_CALIBRATION_PILOT_ID,
} from "../calibration/canonical-pilot.js";
import { BenchmarkConfigurationError } from "../contracts/errors.js";

interface Options {
  readonly reviewerIds: readonly string[];
  readonly outputDir: string;
}

function invalid(): never {
  throw new BenchmarkConfigurationError("calibration_data_invalid");
}

function parseArgs(args: readonly string[]): Options {
  const reviewerIds: string[] = [];
  let outputDir = resolve(
    process.cwd(),
    "artifacts",
    CANONICAL_CALIBRATION_PILOT_ID,
  );
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--reviewer") {
      const value = args[index + 1];
      if (value === undefined) {
        return invalid();
      }
      reviewerIds.push(value);
      index += 1;
      continue;
    }
    if (argument === "--output-dir") {
      const value = args[index + 1];
      if (value === undefined) {
        return invalid();
      }
      outputDir = resolve(value);
      index += 1;
      continue;
    }
    return invalid();
  }
  if (reviewerIds.length !== 2 || new Set(reviewerIds).size !== 2) {
    return invalid();
  }
  return { reviewerIds, outputDir };
}

async function writeText(path: string, value: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, value, "utf8");
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await writeText(path, `${JSON.stringify(value, null, 2)}\n`);
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const bundle = await buildCanonicalCalibrationPilotBundle(options.reviewerIds);
  const operatorDir = join(options.outputDir, "operator");
  await writeJson(join(operatorDir, "candidate-responses.json"), bundle.candidates);
  await writeJson(join(operatorDir, "pilot-manifest.json"), bundle.manifest);

  for (const template of bundle.templates) {
    const reviewerDir = join(options.outputDir, template.reviewerId);
    await writeJson(join(reviewerDir, "review-packet.json"), bundle.packet);
    await writeJson(join(reviewerDir, "submission-template.json"), template);
    await writeText(join(reviewerDir, "ANNOTATION_GUIDE.md"), bundle.annotationGuide);
    await writeText(
      join(reviewerDir, "REVIEWER_INSTRUCTIONS.md"),
      bundle.reviewerInstructions,
    );
  }

  console.log(`Wrote canonical calibration pilot: ${options.outputDir}`);
  console.log(`Cases: ${bundle.manifest.caseCount}`);
  console.log(`Responses: ${bundle.manifest.responseCount}`);
  console.log(
    `Rubric judgments per reviewer: ${bundle.manifest.rubricJudgmentCountPerReviewer}`,
  );
  console.log("Human calibration data present: false");
}

try {
  await main();
} catch (error) {
  console.error(
    error instanceof BenchmarkConfigurationError
      ? error.message
      : "Canonical calibration pilot export failed.",
  );
  process.exitCode = 1;
}
