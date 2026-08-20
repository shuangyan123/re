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
  createDeepSeekMaterialRequirementJudge,
  MaterialRequirementJudgeConfigurationError,
  readDeepSeekJudgeEnvironment,
} from "../providers/deepseek/index.js";
import {
  loadMaterialRequirementJudgePrompt,
  MATERIAL_REQUIREMENT_JUDGE_PROMPT_ID,
  MATERIAL_REQUIREMENT_JUDGE_PROMPT_VERSION,
} from "../judge/material-requirement-prompt.js";
import {
  nextTutorbenchValue,
  tutorbenchOptionValue,
  TutorbenchCliUsageError,
} from "./tutorbench-common.js";
import { writeTutorCliJson } from "./tutor-case-common.js";

export interface JudgeMaterialRequirementCliOptions {
  readonly fixture: MaterialRequirementDiagnosticFixtureId | "all";
  readonly judgeDeepSeek: boolean;
  readonly outputPath?: string;
  readonly help: boolean;
}

function parseFixture(value: string): JudgeMaterialRequirementCliOptions["fixture"] {
  if (
    value === "all" ||
    value === "word-context" ||
    value === "measurement-trend" ||
    value === "atomic-boundaries" ||
    value === "epistemic-strength"
  ) {
    return value;
  }
  throw new TutorbenchCliUsageError(
    "--fixture must be all, word-context, measurement-trend, atomic-boundaries, or epistemic-strength.",
  );
}

export function parseJudgeMaterialRequirementArgs(
  args: readonly string[],
): JudgeMaterialRequirementCliOptions {
  let fixture: JudgeMaterialRequirementCliOptions["fixture"] = "all";
  let judgeDeepSeek = false;
  let outputPath: string | undefined;
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index] ?? "";
    if (argument === "--help" || argument === "-h") {
      return { fixture: "all", judgeDeepSeek: false, help: true };
    }
    if (argument === "--judge-deepseek") {
      judgeDeepSeek = true;
      continue;
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
    judgeDeepSeek,
    ...(outputPath === undefined ? {} : { outputPath }),
    help: false,
  };
}

export function printJudgeMaterialRequirementHelp(): void {
  console.log(`Usage: tutorbench judge-material-requirement-discrimination [options]

  Runs the structured Material Requirement diagnostic. Provider-free synthetic
  behavior is the default; --judge-deepseek is an explicit live/paid opt-in.
  In both modes the Judge returns atomic requirement statuses only; benchmark
  code derives PASS/PARTIAL/FAIL deterministically.

Options:
  --fixture <id>        all (default), word-context, measurement-trend,
                        atomic-boundaries, or epistemic-strength
  --judge-deepseek      Use the explicitly configured live DeepSeek Judge
  --output <path>       Write the experimental report JSON
  --help                Show this help

Without --judge-deepseek this command makes no live provider calls. Its
agreement output is a structural diagnostic, not model accuracy, human
calibration, or production evaluation.
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
  const judgeDeepSeek = options.judgeDeepSeek;
  if (!judgeDeepSeek) {
    const report = await runMaterialRequirementDiagnostic(
      createSyntheticMaterialRequirementFixtureJudge(fixtures),
      fixtures,
      { mode: "provider-free" },
    );
    console.log(formatMaterialRequirementDiagnosticReport(report));
    if (options.outputPath !== undefined) {
      await writeTutorCliJson(report, options.outputPath);
      console.log(`\nWrote material-requirement diagnostic report: ${options.outputPath}`);
    }
    return report;
  }

  const environment = readDeepSeekJudgeEnvironment();
  if (!environment.apiKeyConfigured) {
    throw new MaterialRequirementJudgeConfigurationError("api_key_missing");
  }
  if (environment.model === null) {
    throw new MaterialRequirementJudgeConfigurationError("model_missing");
  }
  const prompt = await loadMaterialRequirementJudgePrompt();
  console.log([
    "Mode: live",
    "Provider: deepseek",
    `Model: ${environment.model}`,
    `Fixtures: ${fixtures.length}`,
    `Cases: ${fixtures.reduce((count, fixture) => count + fixture.cases.length, 0)}`,
    `Planned Judge calls: ${fixtures.reduce((count, fixture) => count + fixture.cases.length, 0)}`,
    "",
  ].join("\n"));
  const judge = createDeepSeekMaterialRequirementJudge({
    model: environment.model,
    prompt,
    promptId: MATERIAL_REQUIREMENT_JUDGE_PROMPT_ID,
    promptVersion: MATERIAL_REQUIREMENT_JUDGE_PROMPT_VERSION,
    thinkingMode: environment.thinkingMode,
    ...(environment.reasoningEffort === undefined
      ? {}
      : { reasoningEffort: environment.reasoningEffort }),
    maxOutputTokens: environment.maxOutputTokens,
    ...(environment.temperature === undefined
      ? {}
      : { temperature: environment.temperature }),
    timeoutMs: environment.timeoutMs,
    maxAttempts: environment.maxAttempts,
    requireReasoningSeparation: true,
  });
  const report = await runMaterialRequirementDiagnostic(
    judge,
    fixtures,
    {
      mode: "live",
      provider: judge.descriptor.provider,
      model: judge.descriptor.model,
    },
  );
  console.log(formatMaterialRequirementDiagnosticReport(report));
  if (options.outputPath !== undefined) {
    await writeTutorCliJson(report, options.outputPath);
    console.log(`\nWrote material-requirement diagnostic report: ${options.outputPath}`);
  }
  return report;
}
