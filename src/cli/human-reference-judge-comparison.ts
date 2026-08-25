import { resolve } from "node:path";

import {
  buildHumanReferenceSetFromFiles,
  loadHumanReferenceAdjudicationFile,
  loadHumanReferenceAnnotationFile,
  runHumanReferenceJudgeComparison,
  writeHumanReferenceJudgeComparisonJson,
} from "../calibration/index.js";
import type {
  HumanReferenceJudgeComparisonReport,
} from "../contracts/human-reference-judge-comparison.js";
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

const defaultOutputPath = resolve(
  process.cwd(),
  "artifacts",
  "human-reference-judge-comparison.json",
);

export type HumanReferenceJudgeComparisonCliOptions =
  | { readonly help: true }
  | {
      readonly help: false;
      readonly annotationPath: string;
      readonly adjudicationPath?: string;
      readonly judgeDeepSeek: true;
      readonly outputPath: string;
    };

export function parseHumanReferenceJudgeComparisonArgs(
  args: readonly string[],
): HumanReferenceJudgeComparisonCliOptions {
  let annotationPath: string | undefined;
  let adjudicationPath: string | undefined;
  let judgeDeepSeek = false;
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
    if (argument === "--judge-deepseek") {
      judgeDeepSeek = true;
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
  if (!judgeDeepSeek) {
    throw new TutorbenchCliUsageError(
      "--judge-deepseek is required; no live Judge provider is selected by default.",
    );
  }
  return {
    help: false,
    annotationPath,
    ...(adjudicationPath === undefined ? {} : { adjudicationPath }),
    judgeDeepSeek: true,
    outputPath,
  };
}

export function printHumanReferenceJudgeComparisonHelp(): void {
  console.log(`Usage: tutorbench human-reference-judge-comparison [options]

Runs the frozen Material Requirement Judge @0.4 on strict Human Reference
tasks rebuilt from annotations and optional adjudications, then reports
referenceAgreement. A live provider must be selected explicitly.

Options:
  --annotations <path>    Strict Human Reference annotation file (required)
  --adjudications <path>  Optional strict adjudication file
  --judge-deepseek        Use DEEPSEEK_JUDGE_* configuration (required)
  --output <path>         Comparison report path (default: artifacts/human-reference-judge-comparison.json)
  --help                  Show this help

The command makes exactly one Judge call per Human Reference task. Provider
execution errors are availability observations and are excluded from semantic
referenceAgreement denominators. No hidden reasoning or raw provider payload
is persisted, and no calibration or accuracy claim is made.
`);
}

export async function runHumanReferenceJudgeComparisonCli(
  options: Extract<HumanReferenceJudgeComparisonCliOptions, { readonly help: false }>,
  environment: NodeJS.ProcessEnv = process.env,
): Promise<HumanReferenceJudgeComparisonReport> {
  const annotationFile = await loadHumanReferenceAnnotationFile(options.annotationPath);
  const adjudicationFile = options.adjudicationPath === undefined
    ? undefined
    : await loadHumanReferenceAdjudicationFile(options.adjudicationPath);
  const referenceSet = buildHumanReferenceSetFromFiles(annotationFile, adjudicationFile);

  if (!options.judgeDeepSeek) {
    throw new TutorbenchCliUsageError(
      "--judge-deepseek is required; no live Judge provider is selected by default.",
    );
  }
  const judgeEnvironment = readDeepSeekJudgeEnvironment(environment);
  if (!judgeEnvironment.apiKeyConfigured) {
    throw new MaterialRequirementJudgeConfigurationError("api_key_missing");
  }
  if (judgeEnvironment.model === null) {
    throw new MaterialRequirementJudgeConfigurationError("model_missing");
  }
  const prompt = await loadMaterialRequirementJudgePrompt();
  const judge = createDeepSeekMaterialRequirementJudge({
    model: judgeEnvironment.model,
    prompt,
    promptId: MATERIAL_REQUIREMENT_JUDGE_PROMPT_ID,
    promptVersion: MATERIAL_REQUIREMENT_JUDGE_PROMPT_VERSION,
    thinkingMode: judgeEnvironment.thinkingMode,
    ...(judgeEnvironment.reasoningEffort === undefined
      ? {}
      : { reasoningEffort: judgeEnvironment.reasoningEffort }),
    maxOutputTokens: judgeEnvironment.maxOutputTokens,
    ...(judgeEnvironment.temperature === undefined
      ? {}
      : { temperature: judgeEnvironment.temperature }),
    timeoutMs: judgeEnvironment.timeoutMs,
    maxAttempts: judgeEnvironment.maxAttempts,
    requireReasoningSeparation: true,
  });
  const report = await runHumanReferenceJudgeComparison(referenceSet, {
    judge,
    judgeIdentity: {
      provider: judge.descriptor.provider,
      model: judge.descriptor.model,
      promptId: judge.descriptor.promptId ?? MATERIAL_REQUIREMENT_JUDGE_PROMPT_ID,
      promptVersion: judge.descriptor.promptVersion,
    },
  });
  console.log([
    "Human-reference Judge comparison",
    `  Data kind: ${report.dataKind}`,
    `  Provider: ${report.judge.provider}`,
    `  Model: ${report.judge.model}`,
    `  Prompt: ${report.judge.promptId}@${report.judge.promptVersion}`,
    `  Cases: ${report.plannedJudgeCalls}`,
    `  Planned Judge calls: ${report.plannedJudgeCalls}`,
    `  Completed Judge calls: ${report.completedJudgeCalls}`,
    `  Execution errors: ${report.executionErrors.count}`,
    `  Reference coverage: ${report.referenceCoverage.resolvedAtomicAssessments}/${report.referenceCoverage.plannedAtomicAssessments}`,
    `  Atomic referenceAgreement: ${report.referenceAgreement.agreementCount}/${report.referenceAgreement.comparableAtomicCount}`,
    `  Derived label agreement: ${report.derivedLabelAgreement.agreementCount}/${report.derivedLabelAgreement.comparableRubricCount}`,
  ].join("\n"));
  await writeHumanReferenceJudgeComparisonJson(report, options.outputPath);
  console.log(`  Wrote report: ${options.outputPath}`);
  if (report.executionErrors.count > 0) {
    process.exitCode = 1;
  }
  return report;
}
