#!/usr/bin/env node

import { realpathSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createHttpTutor, DEFAULT_HTTP_TUTOR_TIMEOUT_MS } from "../adapters/http-tutor.js";
import { BenchmarkConfigurationError, TUTOR_EVAL_DATASET_ID, type TutorEvalDataset } from "../contracts/index.js";
import { loadTutorEvalDataset } from "../datasets/index.js";
import {
  formatTutorEvalSummary,
  writeTutorEvalResult,
  type TutorEvalReportLocale,
} from "../reporting/index.js";
import { runTutorBenchmark } from "../runner/index.js";
import {
  buildTutorBaselineEvaluationArtifact,
  evaluateTutorResponseCorpus,
  parseBenchmarkCorpusCliOptions,
  printBenchmarkCorpusHelp,
  printTutorResponseCorpusEvaluation,
  type BenchmarkCorpusCliOptions,
} from "./tutorbench-evaluate.js";
import {
  parseTutorbenchCollectArgs,
  printTutorbenchCollectHelp,
  runTutorbenchCollect,
  type TutorbenchCollectCliOptions,
} from "./tutorbench-collect.js";
import {
  parseTutorbenchCollectModelArgs,
  printTutorbenchCollectModelHelp,
  runTutorbenchCollectModel,
  type TutorbenchCollectModelCliOptions,
} from "./tutorbench-collect-model.js";
import {
  parseReviewTranslateArgs,
  printReviewTranslateHelp,
  runReviewTranslate,
  type ReviewTranslateCliOptions,
} from "./review-translate.js";
import {
  parseJudgeWordContextDiscriminationArgs,
  printJudgeWordContextDiscriminationHelp,
  runJudgeWordContextDiscrimination,
  type JudgeWordContextDiscriminationCliOptions,
} from "./judge-word-context-discrimination.js";
import {
  parseJudgeCandidateComparisonArgs,
  printJudgeCandidateComparisonHelp,
  runJudgeCandidateComparisonCli,
  type JudgeCandidateComparisonCliOptions,
} from "./judge-candidate-comparison.js";
import {
  parseJudgeMaterialRequirementArgs,
  printJudgeMaterialRequirementHelp,
  runJudgeMaterialRequirementCli,
  type JudgeMaterialRequirementCliOptions,
} from "./judge-material-requirement-discrimination.js";
import {
  parseHumanReferenceCalibrationArgs,
  printHumanReferenceCalibrationHelp,
  runHumanReferenceCalibration,
  type HumanReferenceCalibrationCliOptions,
} from "./human-reference-calibration.js";
import {
  parseHumanReferencePilotExportArgs,
  parseHumanReferencePilotImportArgs,
  printHumanReferencePilotExportHelp,
  printHumanReferencePilotImportHelp,
  runHumanReferencePilotExport,
  runHumanReferencePilotImport,
  type HumanReferencePilotCliOptions,
} from "./human-reference-pilot.js";
import {
  parseHumanReferenceJudgeComparisonArgs,
  printHumanReferenceJudgeComparisonHelp,
  runHumanReferenceJudgeComparisonCli,
  type HumanReferenceJudgeComparisonCliOptions,
} from "./human-reference-judge-comparison.js";
import {
  parseHumanReferenceSemanticAuditArgs,
  parseHumanReferenceSemanticAuditExportArgs,
  parseHumanReferenceSemanticAuditImportArgs,
  printHumanReferenceSemanticAuditExportHelp,
  printHumanReferenceSemanticAuditHelp,
  printHumanReferenceSemanticAuditImportHelp,
  runHumanReferenceSemanticAudit,
  runHumanReferenceSemanticAuditExport,
  runHumanReferenceSemanticAuditImport,
  type HumanReferenceSemanticAuditCliOptions,
} from "./human-reference-semantic-audit.js";
import {
  nextTutorbenchValue,
  positiveTutorbenchInteger,
  tutorbenchOptionValue,
  TutorbenchCliUsageError,
} from "./tutorbench-common.js";
import {
  selectTutorEvalCases,
  type TutorCaseSelectionOptions,
  writeTutorCliJson,
} from "./tutor-case-common.js";

export interface TutorbenchRunOptions {
  readonly endpoint: string;
  readonly datasetId: string;
  readonly caseIds: readonly string[];
  readonly limit: number | null;
  readonly runsPerCase: number;
  readonly timeoutMs: number;
  readonly outputPath?: string;
  readonly reportLocale?: TutorEvalReportLocale;
}

export type TutorbenchCliOptions =
  | { readonly help: true; readonly helpCommand?: "collect" | "collect-model" | "evaluate" | "review-translate" | "judge-word-context-discrimination" | "judge-candidate-comparison" | "judge-material-requirement-discrimination" | "human-reference-calibration" | "human-reference-pilot-export" | "human-reference-pilot-import" | "human-reference-judge-comparison" | "human-reference-semantic-audit-export" | "human-reference-semantic-audit-import" | "human-reference-semantic-audit" }
  | { readonly help: false; readonly run: TutorbenchRunOptions }
  | { readonly help: false; readonly collect: TutorbenchCollectCliOptions }
  | { readonly help: false; readonly collectModel: TutorbenchCollectModelCliOptions }
  | { readonly help: false; readonly evaluate: BenchmarkCorpusCliOptions }
  | { readonly help: false; readonly reviewTranslate: ReviewTranslateCliOptions }
  | { readonly help: false; readonly judgeWordContextDiscrimination: JudgeWordContextDiscriminationCliOptions }
  | { readonly help: false; readonly judgeCandidateComparison: JudgeCandidateComparisonCliOptions }
  | { readonly help: false; readonly judgeMaterialRequirement: JudgeMaterialRequirementCliOptions }
  | { readonly help: false; readonly humanReferenceCalibration: HumanReferenceCalibrationCliOptions }
  | { readonly help: false; readonly humanReferencePilotExport: Extract<HumanReferencePilotCliOptions, { readonly mode: "export" }> }
  | { readonly help: false; readonly humanReferencePilotImport: Extract<HumanReferencePilotCliOptions, { readonly mode: "import" }> }
  | { readonly help: false; readonly humanReferenceJudgeComparison: HumanReferenceJudgeComparisonCliOptions }
  | { readonly help: false; readonly humanReferenceSemanticAudit: HumanReferenceSemanticAuditCliOptions };

export function parseTutorbenchArgs(
  args: readonly string[],
): TutorbenchCliOptions {
  if (args.length === 0 || args[0] === "--help" || args[0] === "-h") {
    return { help: true };
  }
  if (args[0] === "collect") {
    const collect = parseTutorbenchCollectArgs(args.slice(1));
    return collect.help
      ? { help: true, helpCommand: "collect" }
      : { help: false, collect };
  }
  if (args[0] === "collect-model") {
    const collectModel = parseTutorbenchCollectModelArgs(args.slice(1));
    return collectModel.help
      ? { help: true, helpCommand: "collect-model" }
      : { help: false, collectModel };
  }
  if (args[0] === "evaluate") {
    const evaluate = parseBenchmarkCorpusCliOptions(args.slice(1));
    return evaluate.help
      ? { help: true, helpCommand: "evaluate" }
      : { help: false, evaluate };
  }
  if (args[0] === "review-translate") {
    const reviewTranslate = parseReviewTranslateArgs(args.slice(1));
    return reviewTranslate.help
      ? { help: true, helpCommand: "review-translate" }
      : { help: false, reviewTranslate };
  }
  if (args[0] === "judge-word-context-discrimination") {
    const diagnostic = parseJudgeWordContextDiscriminationArgs(args.slice(1));
    return diagnostic.help
      ? { help: true, helpCommand: "judge-word-context-discrimination" }
      : { help: false, judgeWordContextDiscrimination: diagnostic };
  }
  if (args[0] === "judge-candidate-comparison") {
    const comparison = parseJudgeCandidateComparisonArgs(args.slice(1));
    return comparison.help
      ? { help: true, helpCommand: "judge-candidate-comparison" }
      : { help: false, judgeCandidateComparison: comparison };
  }
  if (args[0] === "judge-material-requirement-discrimination") {
    const diagnostic = parseJudgeMaterialRequirementArgs(args.slice(1));
    return diagnostic.help
      ? { help: true, helpCommand: "judge-material-requirement-discrimination" }
      : { help: false, judgeMaterialRequirement: diagnostic };
  }
  if (args[0] === "human-reference-calibration") {
    const calibration = parseHumanReferenceCalibrationArgs(args.slice(1));
    return calibration.help
      ? { help: true, helpCommand: "human-reference-calibration" }
      : { help: false, humanReferenceCalibration: calibration };
  }
  if (args[0] === "human-reference-pilot-export") {
    const pilotExport = parseHumanReferencePilotExportArgs(args.slice(1));
    return pilotExport.help
      ? { help: true, helpCommand: "human-reference-pilot-export" }
      : { help: false, humanReferencePilotExport: pilotExport };
  }
  if (args[0] === "human-reference-pilot-import") {
    const pilotImport = parseHumanReferencePilotImportArgs(args.slice(1));
    return pilotImport.help
      ? { help: true, helpCommand: "human-reference-pilot-import" }
      : { help: false, humanReferencePilotImport: pilotImport };
  }
  if (args[0] === "human-reference-judge-comparison") {
    const comparison = parseHumanReferenceJudgeComparisonArgs(args.slice(1));
    return comparison.help
      ? { help: true, helpCommand: "human-reference-judge-comparison" }
      : { help: false, humanReferenceJudgeComparison: comparison };
  }
  if (args[0] === "human-reference-semantic-audit-export") {
    const audit = parseHumanReferenceSemanticAuditExportArgs(args.slice(1));
    return audit.help
      ? { help: true, helpCommand: "human-reference-semantic-audit-export" }
      : { help: false, humanReferenceSemanticAudit: audit };
  }
  if (args[0] === "human-reference-semantic-audit-import") {
    const audit = parseHumanReferenceSemanticAuditImportArgs(args.slice(1));
    return audit.help
      ? { help: true, helpCommand: "human-reference-semantic-audit-import" }
      : { help: false, humanReferenceSemanticAudit: audit };
  }
  if (args[0] === "human-reference-semantic-audit") {
    const audit = parseHumanReferenceSemanticAuditArgs(args.slice(1));
    return audit.help
      ? { help: true, helpCommand: "human-reference-semantic-audit" }
      : { help: false, humanReferenceSemanticAudit: audit };
  }
  if (args[0] !== "run") {
    throw new TutorbenchCliUsageError(
      `Unknown command: ${args[0] ?? ""}. Use --help for usage.`,
    );
  }

  let endpoint: string | undefined;
  let datasetId: string = TUTOR_EVAL_DATASET_ID;
  let limit: number | null = null;
  let runsPerCase = 1;
  let timeoutMs: number = DEFAULT_HTTP_TUTOR_TIMEOUT_MS;
  let outputPath: string | undefined;
  let reportLocale: TutorEvalReportLocale | undefined;
  const caseIds: string[] = [];

  for (let index = 1; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === undefined) {
      throw new TutorbenchCliUsageError("A CLI option is missing.");
    }
    if (argument === "--help" || argument === "-h") {
      return { help: true };
    }
    if (argument === "--http") {
      endpoint = nextTutorbenchValue(args, index, "--http");
      index += 1;
      continue;
    }
    const httpValue = tutorbenchOptionValue(argument, "--http");
    if (httpValue !== undefined) {
      endpoint = httpValue;
      continue;
    }
    if (argument === "--dataset") {
      datasetId = nextTutorbenchValue(args, index, "--dataset");
      index += 1;
      continue;
    }
    const datasetValue = tutorbenchOptionValue(argument, "--dataset");
    if (datasetValue !== undefined) {
      datasetId = datasetValue;
      continue;
    }
    if (argument === "--case") {
      caseIds.push(nextTutorbenchValue(args, index, "--case"));
      index += 1;
      continue;
    }
    const caseValue = tutorbenchOptionValue(argument, "--case");
    if (caseValue !== undefined) {
      caseIds.push(caseValue);
      continue;
    }
    if (argument === "--limit") {
      limit = positiveTutorbenchInteger(nextTutorbenchValue(args, index, "--limit"), "--limit");
      index += 1;
      continue;
    }
    const limitValue = tutorbenchOptionValue(argument, "--limit");
    if (limitValue !== undefined) {
      limit = positiveTutorbenchInteger(limitValue, "--limit");
      continue;
    }
    if (argument === "--runs") {
      runsPerCase = positiveTutorbenchInteger(nextTutorbenchValue(args, index, "--runs"), "--runs");
      index += 1;
      continue;
    }
    const runsValue = tutorbenchOptionValue(argument, "--runs");
    if (runsValue !== undefined) {
      runsPerCase = positiveTutorbenchInteger(runsValue, "--runs");
      continue;
    }
    if (argument === "--timeout-ms") {
      timeoutMs = positiveTutorbenchInteger(
        nextTutorbenchValue(args, index, "--timeout-ms"),
        "--timeout-ms",
      );
      index += 1;
      continue;
    }
    const timeoutValue = tutorbenchOptionValue(argument, "--timeout-ms");
    if (timeoutValue !== undefined) {
      timeoutMs = positiveTutorbenchInteger(timeoutValue, "--timeout-ms");
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
    if (argument === "--report-locale") {
      reportLocale = parseReportLocale(nextTutorbenchValue(args, index, "--report-locale"));
      index += 1;
      continue;
    }
    const reportLocaleValue = tutorbenchOptionValue(argument, "--report-locale");
    if (reportLocaleValue !== undefined) {
      reportLocale = parseReportLocale(reportLocaleValue);
      continue;
    }
    throw new TutorbenchCliUsageError(`Unknown option: ${argument}`);
  }

  if (endpoint === undefined) {
    throw new TutorbenchCliUsageError("--http requires a value.");
  }
  if (caseIds.length > 0 && limit !== null) {
    throw new TutorbenchCliUsageError("--case cannot be combined with --limit.");
  }

  return {
    help: false,
    run: {
      endpoint,
      datasetId,
      caseIds,
      limit,
      runsPerCase,
      timeoutMs,
      ...(outputPath === undefined ? {} : { outputPath }),
      ...(reportLocale === undefined ? {} : { reportLocale }),
    },
  };
}

function parseReportLocale(value: string): TutorEvalReportLocale {
  if (value === "en" || value === "zh-CN") {
    return value;
  }
  throw new TutorbenchCliUsageError("--report-locale must be en or zh-CN.");
}

function printHelp(): void {
  console.log(`Tutor Benchmark external Tutor runner

Usage:
  tutorbench run --http <url> [options]
  tutorbench collect --http <url> --provider <id> --model <id> --prompt-version <id> --provenance <value> [options]
  tutorbench collect-model --http <url> --provider <id> --model <id> [options]
  tutorbench evaluate --corpus <path> [options]
  tutorbench review-translate --evaluation <path> --output <path> [options]
  tutorbench judge-word-context-discrimination --judge-deepseek [options]
  tutorbench judge-candidate-comparison [options]
  tutorbench judge-material-requirement-discrimination [options]
  tutorbench human-reference-calibration --annotations <path> [options]
  tutorbench human-reference-pilot-export [options]
  tutorbench human-reference-pilot-import [options]
  tutorbench human-reference-judge-comparison [options]
  tutorbench human-reference-semantic-audit-export [options]
  tutorbench human-reference-semantic-audit-import [options]
  tutorbench human-reference-semantic-audit [options]

Commands:
  run                   Quick local evaluation; responses are not frozen
  collect               Freeze Product Tutor responses from TutorTurnInput
  collect-model         Freeze canonical model responses from ExecutionPacket
  evaluate              Offline corpus replay and preliminary evaluation
  review-translate      Build an isolated, review-only translation sidecar
  judge-word-context-discrimination
                         Run the fixed A/B/C word-context Judge diagnostic
  judge-candidate-comparison
                         Compare explicitly selected Judge candidates on the fixed diagnostic
  judge-material-requirement-discrimination
                         Run structured requirement fixtures (provider-free by default)
  human-reference-calibration
                         Ingest strict human-reference JSON and report deterministic calibration evidence
  human-reference-pilot-export
                         Export two identical blind Material Requirement packets
  human-reference-pilot-import
                         Strictly merge two completed pilot submissions
  human-reference-judge-comparison
                         Run frozen Material Requirement Judge @0.4 against rebuilt Human Reference tasks
  human-reference-semantic-audit-export
                         Export one full-task blind packet for an independent reviewer
  human-reference-semantic-audit-import
                         Strictly import one completed semantic-audit submission
  human-reference-semantic-audit
                         Compare independent audit statuses with frozen Human Reference

Run options:
  --http <url>          POST TutorTurnInput JSON to this http(s) endpoint
  --dataset <id>        Dataset id (default: ${TUTOR_EVAL_DATASET_ID})
  --case <id>           Select one case; repeat for a subset
  --limit <n>           Select the first n cases in stable ID order
  --runs <n>            Run each selected case n times (default: 1)
  --timeout-ms <n>      Request timeout in milliseconds (default: ${DEFAULT_HTTP_TUTOR_TIMEOUT_MS})
  --output <path>       Write the TutorEvalRunResult JSON to this path
  --report-locale <id>  Report labels only: en (default) or zh-CN
  --help                Show this help

The external Tutor response must be JSON shaped as { "text": string, "metrics"?: object }.
No automatic retry is performed.

  Use \`tutorbench collect --help\`, \`tutorbench collect-model --help\`, and
  \`tutorbench evaluate --help\` for command-specific options.`);
}

function selectedDataset(
  dataset: TutorEvalDataset,
  options: TutorbenchRunOptions,
): TutorEvalDataset {
  const selectionOptions: TutorCaseSelectionOptions = {
    caseIds: options.caseIds,
    limit: options.limit,
    all: false,
    help: false,
  };
  return {
    ...dataset,
    cases: selectTutorEvalCases(dataset, selectionOptions),
  };
}

function formatExternalTutorSummary(
  result: Awaited<ReturnType<typeof runTutorBenchmark>>,
  endpoint: string,
  reportLocale: TutorEvalReportLocale | undefined,
): string {
  return [
    "Tutor Benchmark",
    "",
    "Tutor:",
    `  HTTP · ${endpoint}`,
    "",
    formatTutorEvalSummary(result, { reportLocale: reportLocale ?? "en" }),
  ].join("\n");
}

export async function runTutorbench(
  options: TutorbenchRunOptions,
): Promise<void> {
  const dataset = await loadTutorEvalDataset(options.datasetId);
  const tutor = createHttpTutor({
    id: "http-tutor",
    endpoint: options.endpoint,
    timeoutMs: options.timeoutMs,
  });
  const result = await runTutorBenchmark({
    tutor,
    dataset: selectedDataset(dataset, options),
    runsPerCase: options.runsPerCase,
  });

  console.log(formatExternalTutorSummary(result, tutor.endpoint, options.reportLocale));
  if (options.outputPath !== undefined) {
    await writeTutorEvalResult(result, options.outputPath);
    console.log(`\nWrote TutorEvalRunResult: ${options.outputPath}`);
  }
}

async function runTutorbenchEvaluate(
  options: BenchmarkCorpusCliOptions,
): Promise<void> {
  const result = await evaluateTutorResponseCorpus(options);
  const outputPath = options.outputPath ?? resolve(
    process.cwd(),
    "artifacts",
    "preliminary-tutor-eval-corpus-result.json",
  );
  const artifact = buildTutorBaselineEvaluationArtifact(result);
  await writeTutorCliJson(artifact, outputPath);
  printTutorResponseCorpusEvaluation(result, outputPath, true, options.reportLocale ?? "en");
  if (result.evaluation.errorCount > 0) {
    process.exitCode = 1;
  }
}

export async function main(args = process.argv.slice(2)): Promise<void> {
  const options = parseTutorbenchArgs(args);
  if (options.help) {
    if (options.helpCommand === "collect") {
      printTutorbenchCollectHelp();
    } else if (options.helpCommand === "collect-model") {
      printTutorbenchCollectModelHelp();
    } else if (options.helpCommand === "evaluate") {
      printBenchmarkCorpusHelp();
    } else if (options.helpCommand === "review-translate") {
      printReviewTranslateHelp();
    } else if (options.helpCommand === "judge-word-context-discrimination") {
      printJudgeWordContextDiscriminationHelp();
    } else if (options.helpCommand === "judge-candidate-comparison") {
      printJudgeCandidateComparisonHelp();
    } else if (options.helpCommand === "judge-material-requirement-discrimination") {
      printJudgeMaterialRequirementHelp();
    } else if (options.helpCommand === "human-reference-calibration") {
      printHumanReferenceCalibrationHelp();
    } else if (options.helpCommand === "human-reference-pilot-export") {
      printHumanReferencePilotExportHelp();
    } else if (options.helpCommand === "human-reference-pilot-import") {
      printHumanReferencePilotImportHelp();
    } else if (options.helpCommand === "human-reference-judge-comparison") {
      printHumanReferenceJudgeComparisonHelp();
    } else if (options.helpCommand === "human-reference-semantic-audit-export") {
      printHumanReferenceSemanticAuditExportHelp();
    } else if (options.helpCommand === "human-reference-semantic-audit-import") {
      printHumanReferenceSemanticAuditImportHelp();
    } else if (options.helpCommand === "human-reference-semantic-audit") {
      printHumanReferenceSemanticAuditHelp();
    } else {
      printHelp();
    }
    return;
  }
  if ("run" in options) {
    await runTutorbench(options.run);
  } else if ("collect" in options) {
    if (options.collect.help) {
      printTutorbenchCollectHelp();
      return;
    }
    await runTutorbenchCollect(options.collect);
  } else if ("collectModel" in options) {
    if (options.collectModel.help) {
      printTutorbenchCollectModelHelp();
      return;
    }
    await runTutorbenchCollectModel(options.collectModel);
  } else if ("reviewTranslate" in options) {
    if (options.reviewTranslate.help) {
      printReviewTranslateHelp();
      return;
    }
    await runReviewTranslate(options.reviewTranslate);
  } else if ("judgeWordContextDiscrimination" in options) {
    if (options.judgeWordContextDiscrimination.help) {
      printJudgeWordContextDiscriminationHelp();
      return;
    }
    await runJudgeWordContextDiscrimination(options.judgeWordContextDiscrimination);
  } else if ("judgeCandidateComparison" in options) {
    if (options.judgeCandidateComparison.help) {
      printJudgeCandidateComparisonHelp();
      return;
    }
    await runJudgeCandidateComparisonCli(options.judgeCandidateComparison);
  } else if ("judgeMaterialRequirement" in options) {
    if (options.judgeMaterialRequirement.help) {
      printJudgeMaterialRequirementHelp();
      return;
    }
    await runJudgeMaterialRequirementCli(options.judgeMaterialRequirement);
  } else if ("humanReferenceCalibration" in options) {
    if (options.humanReferenceCalibration.help) {
      printHumanReferenceCalibrationHelp();
      return;
    }
    await runHumanReferenceCalibration(options.humanReferenceCalibration);
  } else if ("humanReferencePilotExport" in options) {
    if (options.humanReferencePilotExport.help) {
      printHumanReferencePilotExportHelp();
      return;
    }
    await runHumanReferencePilotExport(options.humanReferencePilotExport);
  } else if ("humanReferencePilotImport" in options) {
    if (options.humanReferencePilotImport.help) {
      printHumanReferencePilotImportHelp();
      return;
    }
    await runHumanReferencePilotImport(options.humanReferencePilotImport);
  } else if ("humanReferenceJudgeComparison" in options) {
    if (options.humanReferenceJudgeComparison.help) {
      printHumanReferenceJudgeComparisonHelp();
      return;
    }
    await runHumanReferenceJudgeComparisonCli(options.humanReferenceJudgeComparison);
  } else if ("humanReferenceSemanticAudit" in options) {
    if (options.humanReferenceSemanticAudit.help) {
      return;
    }
    if (options.humanReferenceSemanticAudit.mode === "export") {
      await runHumanReferenceSemanticAuditExport(options.humanReferenceSemanticAudit);
    } else if (options.humanReferenceSemanticAudit.mode === "import") {
      await runHumanReferenceSemanticAuditImport(options.humanReferenceSemanticAudit);
    } else {
      await runHumanReferenceSemanticAudit(options.humanReferenceSemanticAudit);
    }
  } else {
    if (options.evaluate.help) {
      printBenchmarkCorpusHelp();
      return;
    }
    await runTutorbenchEvaluate(options.evaluate);
  }
}

async function runAsExecutable(): Promise<void> {
  try {
    await main();
  } catch (error) {
    console.error(
      error instanceof TutorbenchCliUsageError ||
      error instanceof BenchmarkConfigurationError ||
      (error instanceof Error && (
        error.name === "HttpTutorConfigurationError" ||
        error.name === "HttpTutorExecutionHostConfigurationError" ||
        error.name === "DeepSeekJudgeConfigurationError" ||
        error.name === "MaterialRequirementJudgeConfigurationError" ||
        error.name === "MiniMaxJudgeConfigurationError" ||
        error.name === "ChatCompletionsJudgeConfigurationError" ||
        error.name === "ReviewTranslationArtifactError" ||
        error.name === "ReviewTranslationConfigurationError"
      ))
        ? error.message
        : "Tutor Benchmark CLI failed.",
    );
    process.exitCode = 1;
  }
}

function isExecutableInvocation(): boolean {
  const argumentPath = process.argv[1];
  if (argumentPath === undefined) {
    return false;
  }
  const modulePath = fileURLToPath(import.meta.url);
  try {
    return realpathSync(argumentPath) === realpathSync(modulePath);
  } catch {
    return resolve(argumentPath) === modulePath;
  }
}

if (isExecutableInvocation()) {
  await runAsExecutable();
}
