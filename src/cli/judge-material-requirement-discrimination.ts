import { resolve } from "node:path";

import {
  createSyntheticMaterialRequirementFixtureJudge,
  formatMaterialRequirementDiagnosticReport,
  loadMaterialRequirementDiagnosticFixtures,
  runMaterialRequirementDiagnostic,
  type MaterialRequirementDiagnosticFixtureId,
  type MaterialRequirementDiagnosticReport,
} from "../judge/index.js";
import {
  nextTutorbenchValue,
  tutorbenchOptionValue,
  TutorbenchCliUsageError,
} from "./tutorbench-common.js";
import { writeTutorCliJson } from "./tutor-case-common.js";

export interface JudgeMaterialRequirementCliOptions {
  readonly fixture: MaterialRequirementDiagnosticFixtureId | "all";
  readonly outputPath?: string;
  readonly help: boolean;
}

function parseFixture(value: string): JudgeMaterialRequirementCliOptions["fixture"] {
  if (value === "all" || value === "word-context" || value === "measurement-trend") {
    return value;
  }
  throw new TutorbenchCliUsageError(
    "--fixture must be all, word-context, or measurement-trend.",
  );
}

export function parseJudgeMaterialRequirementArgs(
  args: readonly string[],
): JudgeMaterialRequirementCliOptions {
  let fixture: JudgeMaterialRequirementCliOptions["fixture"] = "all";
  let outputPath: string | undefined;
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index] ?? "";
    if (argument === "--help" || argument === "-h") {
      return { fixture: "all", help: true };
    }
    if (argument === "--fixture") {
      fixture = parseFixture(nextTutorbenchValue(args, index, "--fixture"));
      index += 1;
      continue;
    }
    const fixtureValue = tutorbenchOptionValue(argument, "--fixture");
    if (fixtureValue !== undefined) {
      fixture = parseFixture(fixtureValue);
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
  return {
    fixture,
    ...(outputPath === undefined ? {} : { outputPath }),
    help: false,
  };
}

export function printJudgeMaterialRequirementHelp(): void {
  console.log(`Usage: tutorbench judge-material-requirement-discrimination [options]

Runs the provider-free structural harness over developer-authored synthetic
fixtures. The injected fixture Judge returns atomic requirement statuses only;
benchmark code derives PASS/PARTIAL/FAIL deterministically.

Options:
  --fixture <id>        all (default), word-context, or measurement-trend
  --output <path>       Write the experimental report JSON
  --help                Show this help

This command makes no live provider calls. Its agreement output is a contract
regression, not model accuracy, human calibration, or production evaluation.
`);
}

export async function runJudgeMaterialRequirementCli(
  options: JudgeMaterialRequirementCliOptions,
): Promise<MaterialRequirementDiagnosticReport> {
  if (options.help) {
    throw new TutorbenchCliUsageError("Use --help through the tutorbench dispatcher.");
  }
  const allFixtures = await loadMaterialRequirementDiagnosticFixtures();
  const fixtures = options.fixture === "all"
    ? allFixtures
    : allFixtures.filter(
      (fixture) => fixture.id === options.fixture,
    );
  const report = await runMaterialRequirementDiagnostic(
    createSyntheticMaterialRequirementFixtureJudge(fixtures),
    fixtures,
  );
  console.log(formatMaterialRequirementDiagnosticReport(report));
  if (options.outputPath !== undefined) {
    await writeTutorCliJson(report, options.outputPath);
    console.log(`\nWrote material-requirement diagnostic report: ${options.outputPath}`);
  }
  return report;
}
