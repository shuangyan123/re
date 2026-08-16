import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import {
  TUTOR_EVAL_DATASET_ID,
  TUTOR_EVAL_PREVIOUS_DATASET_VERSION,
} from "../contracts/index.js";
import { loadTutorEvalDataset } from "../datasets/index.js";
import {
  parseTutorEvaluationAuditArtifact,
} from "../reporting/index.js";
import {
  buildReviewTranslationArtifact,
  createHttpReviewTranslator,
  parseReviewTranslationArtifact,
  REVIEW_TRANSLATION_DEFAULT_LOCALE,
  type ReviewTranslationLocale,
} from "../review-translation/index.js";
import {
  nextTutorbenchValue,
  positiveTutorbenchInteger,
  tutorbenchOptionValue,
  TutorbenchCliUsageError,
} from "./tutorbench-common.js";

export interface ReviewTranslateCliOptions {
  readonly help: boolean;
  readonly evaluationPath: string;
  readonly outputPath: string;
  readonly targetLocale: ReviewTranslationLocale;
  readonly existingTranslationPath?: string;
  readonly endpoint?: string;
  readonly provider?: string;
  readonly model?: string;
  readonly timeoutMs: number;
}

function targetLocale(value: string): ReviewTranslationLocale {
  if (value.toLowerCase() === "zh-cn") {
    return "zh-CN";
  }
  throw new TutorbenchCliUsageError(
    `--target-locale supports only zh-CN in the review translation layer.`,
  );
}

export function parseReviewTranslateArgs(
  args: readonly string[],
): ReviewTranslateCliOptions {
  if (args.length === 0 || args[0] === "--help" || args[0] === "-h") {
    return {
      help: true,
      evaluationPath: "",
      outputPath: "",
      targetLocale: REVIEW_TRANSLATION_DEFAULT_LOCALE,
      timeoutMs: 30_000,
    };
  }

  let evaluationPath: string | undefined;
  let outputPath: string | undefined;
  let reviewTargetLocale: ReviewTranslationLocale = REVIEW_TRANSLATION_DEFAULT_LOCALE;
  let existingTranslationPath: string | undefined;
  let endpoint: string | undefined;
  let provider: string | undefined;
  let model: string | undefined;
  let timeoutMs = 30_000;

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === undefined) {
      throw new TutorbenchCliUsageError("A CLI option is missing.");
    }
    if (argument === "--help" || argument === "-h") {
      return {
        help: true,
        evaluationPath: "",
        outputPath: "",
        targetLocale: REVIEW_TRANSLATION_DEFAULT_LOCALE,
        timeoutMs,
      };
    }
    if (argument === "--evaluation") {
      evaluationPath = resolve(nextTutorbenchValue(args, index, "--evaluation"));
      index += 1;
      continue;
    }
    const evaluationValue = tutorbenchOptionValue(argument, "--evaluation");
    if (evaluationValue !== undefined) {
      evaluationPath = resolve(evaluationValue);
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
    if (argument === "--target-locale") {
      reviewTargetLocale = targetLocale(nextTutorbenchValue(args, index, "--target-locale"));
      index += 1;
      continue;
    }
    const targetLocaleValue = tutorbenchOptionValue(argument, "--target-locale");
    if (targetLocaleValue !== undefined) {
      reviewTargetLocale = targetLocale(targetLocaleValue);
      continue;
    }
    if (argument === "--translation") {
      existingTranslationPath = resolve(nextTutorbenchValue(args, index, "--translation"));
      index += 1;
      continue;
    }
    const translationValue = tutorbenchOptionValue(argument, "--translation");
    if (translationValue !== undefined) {
      existingTranslationPath = resolve(translationValue);
      continue;
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
    if (argument === "--provider") {
      provider = nextTutorbenchValue(args, index, "--provider");
      index += 1;
      continue;
    }
    const providerValue = tutorbenchOptionValue(argument, "--provider");
    if (providerValue !== undefined) {
      provider = providerValue;
      continue;
    }
    if (argument === "--model") {
      model = nextTutorbenchValue(args, index, "--model");
      index += 1;
      continue;
    }
    const modelValue = tutorbenchOptionValue(argument, "--model");
    if (modelValue !== undefined) {
      model = modelValue;
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
    throw new TutorbenchCliUsageError(`Unknown option: ${argument}`);
  }

  if (evaluationPath === undefined) {
    throw new TutorbenchCliUsageError("--evaluation requires a value.");
  }
  if (outputPath === undefined) {
    throw new TutorbenchCliUsageError("--output requires a value.");
  }
  return {
    help: false,
    evaluationPath,
    outputPath,
    targetLocale: reviewTargetLocale,
    ...(existingTranslationPath === undefined ? {} : { existingTranslationPath }),
    ...(endpoint === undefined ? {} : { endpoint }),
    ...(provider === undefined ? {} : { provider }),
    ...(model === undefined ? {} : { model }),
    timeoutMs,
  };
}

export function printReviewTranslateHelp(): void {
  console.log(`Tutor Benchmark review-only translation sidecar

Usage:
  tutorbench review-translate --evaluation <path> --output <path> [options]

Options:
  --evaluation <path>       Validated TutorEval evaluation artifact
  --output <path>           Review-only translation sidecar output
  --target-locale <locale>  Translation locale (default: zh-CN)
  --translation <path>      Existing sidecar for incremental reuse
  --http <url>              Provider-neutral JSON translation endpoint
  --provider <id>           Provider label stored in the sidecar
  --model <id>              Optional model label stored in the sidecar
  --timeout-ms <n>          HTTP request timeout (default: 30000)
  --help                    Show this help

The command never changes the evaluation artifact, corpus, dataset, Judge input,
or scoring. Without --http, missing entries are recorded as unavailable so a
review sidecar can still be inspected without affecting the official result.`);
}

function requestedDatasetVersion(
  datasetId: string,
  datasetVersion: string,
): string | undefined {
  if (
    datasetId === TUTOR_EVAL_DATASET_ID &&
    datasetVersion === "0.2a"
  ) {
    return TUTOR_EVAL_PREVIOUS_DATASET_VERSION;
  }
  return datasetVersion;
}

async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, "utf8")) as unknown;
}

export async function runReviewTranslate(
  options: ReviewTranslateCliOptions,
): Promise<void> {
  const evaluation = parseTutorEvaluationAuditArtifact(
    await readJson(options.evaluationPath),
  );
  const dataset = await loadTutorEvalDataset(
    evaluation.evaluation.datasetId,
    requestedDatasetVersion(
      evaluation.evaluation.datasetId,
      evaluation.evaluation.datasetVersion,
    ),
  );
  const existing = options.existingTranslationPath === undefined
    ? undefined
    : parseReviewTranslationArtifact(await readJson(options.existingTranslationPath));
  const translator = options.endpoint === undefined
    ? undefined
    : createHttpReviewTranslator({
        endpoint: options.endpoint,
        ...(options.provider === undefined ? {} : { provider: options.provider }),
        ...(options.model === undefined ? {} : { model: options.model }),
        timeoutMs: options.timeoutMs,
      });
  const translation = await buildReviewTranslationArtifact({
    artifact: evaluation,
    dataset,
    targetLocale: options.targetLocale,
    ...(existing === undefined ? {} : { existing }),
    ...(translator === undefined ? {} : { translator }),
  });
  await mkdir(dirname(options.outputPath), { recursive: true });
  await writeFile(options.outputPath, `${JSON.stringify(translation, null, 2)}\n`, "utf8");
  const translatedCount = translation.entries.filter((entry) => entry.status === "translated").length;
  const failedCount = translation.entries.length - translatedCount;
  console.log(`Review translation sidecar: ${options.outputPath}`);
  console.log(`Source run: ${evaluation.evaluation.runId}`);
  console.log(`Target locale: ${translation.targetLocale}`);
  console.log(`Translated entries: ${translatedCount}`);
  console.log(`Unavailable or failed entries: ${failedCount}`);
}
