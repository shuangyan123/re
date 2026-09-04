import { resolve } from "node:path";

import {
  formatQuickstartSummary,
  runQuickstart,
  writeQuickstartSummary,
  QuickstartInvariantError,
  type QuickstartSummary,
} from "../quickstart.js";
import {
  nextTutorbenchValue,
  tutorbenchOptionValue,
  TutorbenchCliUsageError,
} from "./tutorbench-common.js";

export interface TutorbenchQuickstartCliOptions {
  readonly help: boolean;
  readonly outputPath?: string;
}

export function parseTutorbenchQuickstartArgs(
  args: readonly string[],
): TutorbenchQuickstartCliOptions {
  let outputPath: string | undefined;
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === undefined) {
      throw new TutorbenchCliUsageError("A CLI option is missing.");
    }
    if (argument === "--help" || argument === "-h") {
      return { help: true };
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
  return {
    help: false,
    ...(outputPath === undefined ? {} : { outputPath }),
  };
}

export function printTutorbenchQuickstartHelp(): void {
  console.log(`TutorBench Quickstart

Usage:
  tutorbench quickstart [options]

Run a local provider-free deterministic demonstration. It needs no API key,
Judge, network connection, or external Tutor. The result is a development
smoke demonstration, not an official benchmark score and not leaderboard
eligible.

Options:
  --output <path>  Write the independent QuickstartSummary JSON artifact
  --help           Show this help`);
}

export async function runTutorbenchQuickstart(
  options: TutorbenchQuickstartCliOptions,
): Promise<void> {
  let summary: QuickstartSummary;
  try {
    summary = await runQuickstart();
    if (options.outputPath !== undefined) {
      await writeQuickstartSummary(summary, options.outputPath);
    }
  } catch (error) {
    if (error instanceof QuickstartInvariantError) {
      throw error;
    }
    throw new QuickstartInvariantError(
      "the Quickstart could not complete. Check the installed package and retry.",
    );
  }

  console.log(formatQuickstartSummary(summary));
  if (options.outputPath !== undefined) {
    console.log(`\nWrote QuickstartSummary: ${options.outputPath}`);
  }
}
