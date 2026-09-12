import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import { importCanonicalCalibrationPilotSubmission } from "../calibration/canonical-pilot.js";
import { BenchmarkConfigurationError } from "../contracts/errors.js";

interface Options {
  readonly templatePath: string;
  readonly submissionPath: string;
  readonly outputPath?: string;
}

function invalid(): never {
  throw new BenchmarkConfigurationError("calibration_annotation_invalid");
}

function parseArgs(args: readonly string[]): Options {
  let templatePath: string | undefined;
  let submissionPath: string | undefined;
  let outputPath: string | undefined;
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--template") {
      const value = args[index + 1];
      if (value === undefined) {
        return invalid();
      }
      templatePath = resolve(value);
      index += 1;
      continue;
    }
    if (argument === "--submission") {
      const value = args[index + 1];
      if (value === undefined) {
        return invalid();
      }
      submissionPath = resolve(value);
      index += 1;
      continue;
    }
    if (argument === "--output") {
      const value = args[index + 1];
      if (value === undefined) {
        return invalid();
      }
      outputPath = resolve(value);
      index += 1;
      continue;
    }
    return invalid();
  }
  if (templatePath === undefined || submissionPath === undefined) {
    return invalid();
  }
  return {
    templatePath,
    submissionPath,
    ...(outputPath === undefined ? {} : { outputPath }),
  };
}

async function readJson(path: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as unknown;
  } catch {
    return invalid();
  }
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const annotationFile = await importCanonicalCalibrationPilotSubmission(
    await readJson(options.templatePath),
    await readJson(options.submissionPath),
  );
  const outputPath = options.outputPath ?? resolve(
    dirname(options.submissionPath),
    `${annotationFile.reviewerId}.annotations.json`,
  );
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(annotationFile, null, 2)}\n`, "utf8");
  console.log(`Wrote calibration annotations: ${outputPath}`);
  console.log(`Reviewer: ${annotationFile.reviewerId}`);
  console.log(`Annotations: ${annotationFile.annotations.length}`);
}

try {
  await main();
} catch (error) {
  console.error(
    error instanceof BenchmarkConfigurationError
      ? error.message
      : "Canonical calibration pilot import failed.",
  );
  process.exitCode = 1;
}
