import { resolve } from "node:path";

import {
  buildTutorEvalJudgeInput,
  TUTOR_EVAL_DATASET_ID,
  toTutorTurnInput,
  type TutorEvalCase,
} from "../contracts/index.js";
import { loadTutorEvalDataset } from "../datasets/index.js";
import {
  loadTutorEvalPedagogyJudgePrompt,
  TUTOR_EVAL_PEDAGOGY_JUDGE_PROMPT_ID,
  TUTOR_EVAL_PEDAGOGY_JUDGE_PROMPT_VERSION,
} from "../judge/index.js";
import { formatTutorEvalSummary, writeTutorEvalResult } from "../reporting/index.js";
import { runTutorEval } from "../runner/index.js";
import {
  buildOpenAIJudgeRequest,
  createOpenAIJudge,
  OPENAI_JUDGE_PROVIDER,
  OpenAIJudgeConfigurationError,
  readOpenAIJudgeEnvironment,
  type OpenAIJudgeEnvironmentConfig,
  type OpenAIJudgeRequestOptions,
} from "../providers/openai/index.js";
import { createGuidedTutor } from "./synthetic-guided-tutor.js";

const DEFAULT_SMOKE_CASE_ID = "hint-only-linear-equation-001";

class JudgeCliUsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "JudgeCliUsageError";
  }
}

interface JudgeCliOptions {
  readonly dryRun: boolean;
  readonly live: boolean;
  readonly all: boolean;
  readonly caseIds: readonly string[];
  readonly limit: number | null;
  readonly help: boolean;
}

function nextArgument(args: readonly string[], index: number, option: string): string {
  const value = args[index + 1];
  if (value === undefined || value.trim().length === 0 || value.startsWith("--")) {
    throw new JudgeCliUsageError(`${option} requires a value.`);
  }
  return value.trim();
}

function parseLimit(value: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new JudgeCliUsageError("--limit must be a positive integer.");
  }
  return parsed;
}

function parseArgs(args: readonly string[]): JudgeCliOptions {
  let dryRun = false;
  let live = false;
  let all = false;
  let limit: number | null = null;
  const caseIds: string[] = [];

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === undefined) {
      throw new JudgeCliUsageError("A CLI option is missing.");
    }
    if (argument === "--") {
      continue;
    }
    if (argument === "--help" || argument === "-h") {
      return { dryRun: false, live: false, all: false, caseIds: [], limit: null, help: true };
    }
    if (argument === "--dry-run") {
      dryRun = true;
      continue;
    }
    if (argument === "--live") {
      live = true;
      continue;
    }
    if (argument === "--all") {
      all = true;
      continue;
    }
    if (argument === "--case") {
      caseIds.push(nextArgument(args, index, "--case"));
      index += 1;
      continue;
    }
    if (argument.startsWith("--case=")) {
      const value = argument.slice("--case=".length).trim();
      if (value.length === 0) {
        throw new JudgeCliUsageError("--case requires a value.");
      }
      caseIds.push(value);
      continue;
    }
    if (argument === "--limit") {
      limit = parseLimit(nextArgument(args, index, "--limit"));
      index += 1;
      continue;
    }
    if (argument.startsWith("--limit=")) {
      limit = parseLimit(argument.slice("--limit=".length));
      continue;
    }
    throw new JudgeCliUsageError(`Unknown option: ${argument}`);
  }

  if (dryRun && live) {
    throw new JudgeCliUsageError("Choose only one of --dry-run or --live.");
  }
  if (all && (caseIds.length > 0 || limit !== null)) {
    throw new JudgeCliUsageError("--all cannot be combined with --case or --limit.");
  }
  if (caseIds.length > 0 && limit !== null) {
    throw new JudgeCliUsageError("--case cannot be combined with --limit.");
  }
  return { dryRun: !live, live, all, caseIds, limit, help: false };
}

function selectCases(
  dataset: Awaited<ReturnType<typeof loadTutorEvalDataset>>,
  options: JudgeCliOptions,
): readonly TutorEvalCase[] {
  const orderedCases = [...dataset.cases].sort((left, right) =>
    left.id < right.id ? -1 : left.id > right.id ? 1 : 0,
  );
  const byId = new Map(orderedCases.map((tutorEvalCase) => [tutorEvalCase.id, tutorEvalCase]));
  if (options.caseIds.length > 0) {
    return options.caseIds.map((caseId) => {
      const tutorEvalCase = byId.get(caseId);
      if (tutorEvalCase === undefined) {
        throw new JudgeCliUsageError(`Unknown dataset case: ${caseId}`);
      }
      return tutorEvalCase;
    });
  }
  if (options.all) {
    return orderedCases;
  }
  if (options.limit !== null) {
    return orderedCases.slice(0, options.limit);
  }
  const defaultCase = byId.get(DEFAULT_SMOKE_CASE_ID);
  if (defaultCase === undefined) {
    throw new JudgeCliUsageError(`Default smoke case is missing: ${DEFAULT_SMOKE_CASE_ID}`);
  }
  return [defaultCase];
}

function requireModel(environment: OpenAIJudgeEnvironmentConfig): string {
  if (environment.model === null) {
    throw new OpenAIJudgeConfigurationError("model_missing");
  }
  return environment.model;
}

function requestOptions(
  model: string,
  prompt: string,
  environment: OpenAIJudgeEnvironmentConfig,
): OpenAIJudgeRequestOptions & {
  readonly promptId: string;
  readonly promptVersion: string;
} {
  return {
    model,
    prompt,
    promptId: TUTOR_EVAL_PEDAGOGY_JUDGE_PROMPT_ID,
    promptVersion: TUTOR_EVAL_PEDAGOGY_JUDGE_PROMPT_VERSION,
    ...(environment.temperature === undefined
      ? {}
      : { temperature: environment.temperature }),
    ...(environment.reasoningEffort === undefined
      ? {}
      : { reasoningEffort: environment.reasoningEffort }),
  };
}

function printHeader(
  dataset: Awaited<ReturnType<typeof loadTutorEvalDataset>>,
  selectedCases: readonly TutorEvalCase[],
  model: string,
  live: boolean,
): void {
  console.log(`Dataset: ${dataset.id}@${dataset.version}`);
  console.log(`Case count: ${selectedCases.length}`);
  console.log(`Judge provider: ${OPENAI_JUDGE_PROVIDER}`);
  console.log(`Judge model: ${model}`);
  console.log(
    `Judge prompt: ${TUTOR_EVAL_PEDAGOGY_JUDGE_PROMPT_ID}@${TUTOR_EVAL_PEDAGOGY_JUDGE_PROMPT_VERSION}`,
  );
  console.log(`Mode: ${live ? "live (explicit opt-in)" : "dry-run"}`);
}

async function runDryRun(
  selectedCases: readonly TutorEvalCase[],
  request: OpenAIJudgeRequestOptions & {
    readonly promptId: string;
    readonly promptVersion: string;
  },
): Promise<void> {
  const tutor = createGuidedTutor();
  let preparedRequests = 0;
  let judgeRubricCount = 0;
  for (const tutorEvalCase of selectedCases) {
    const output = await tutor.respond(toTutorTurnInput(tutorEvalCase));
    const input = buildTutorEvalJudgeInput(tutorEvalCase, output.text);
    if (input.rubrics.length === 0) {
      continue;
    }
    buildOpenAIJudgeRequest(input, request);
    preparedRequests += 1;
    judgeRubricCount += input.rubrics.length;
  }
  console.log(`Prepared Judge requests: ${preparedRequests}`);
  console.log(`Judge rubrics: ${judgeRubricCount}`);
  console.log("Network calls: 0");
  console.log("Judge execution status: available in live mode; calibration status: uncalibrated.");
}

async function runLive(
  dataset: Awaited<ReturnType<typeof loadTutorEvalDataset>>,
  selectedCases: readonly TutorEvalCase[],
  model: string,
  prompt: string,
  environment: OpenAIJudgeEnvironmentConfig,
): Promise<void> {
  if (!environment.apiKeyConfigured) {
    console.error(
      "judge_unavailable: OPENAI_API_KEY is not configured; no network request was made.",
    );
    process.exitCode = 1;
    return;
  }
  const request = requestOptions(model, prompt, environment);
  const judge = createOpenAIJudge({
    ...request,
    timeoutMs: environment.timeoutMs,
    maxAttempts: environment.maxAttempts,
  });
  const result = await runTutorEval({
    dataset: { ...dataset, cases: selectedCases },
    tutor: createGuidedTutor(),
    tutorDescriptor: {
      provider: "synthetic",
      model: "scripted-guided-tutor",
      modelVersion: "foundation",
      promptId: "synthetic-guided",
      promptVersion: "1.0.0",
      temperature: 0,
      seed: 0,
    },
    judge: {
      ...judge.descriptor,
      evaluate: judge.evaluate,
      evaluateWithMetrics: judge.evaluateWithMetrics,
    },
    runsPerCase: 1,
    runId: "tutor-eval-v0.3b-openai",
  });
  console.log(formatTutorEvalSummary(result));
  await writeTutorEvalResult(
    result,
    resolve(process.cwd(), "artifacts", "tutor-eval-v0.3b-openai-result.json"),
  );
  if (result.errorCount > 0) {
    process.exitCode = 1;
  }
}

function printHelp(): void {
  console.log(`Usage: npm run judge:openai -- [options]

Default mode is a dry-run for one synthetic Judge case. Real calls require --live.

Options:
  --dry-run             Validate and build requests without network calls (default)
  --live                Opt in to real OpenAI Responses API calls
  --case <id>           Select one case; repeat for a selected subset
  --limit <n>           Select the first n cases in stable ID order
  --all                 Select the full dataset
  --help                Show this help

Environment:
  OPENAI_API_KEY
  OPENAI_JUDGE_MODEL
  OPENAI_JUDGE_TIMEOUT_MS       default 30000
  OPENAI_JUDGE_MAX_ATTEMPTS     default 2, maximum 3
  OPENAI_JUDGE_TEMPERATURE      optional 0..2
  OPENAI_JUDGE_REASONING_EFFORT optional none|minimal|low|medium|high|xhigh|max
`);
}

export async function main(args = process.argv.slice(2)): Promise<void> {
  const options = parseArgs(args);
  if (options.help) {
    printHelp();
    return;
  }
  const environment = readOpenAIJudgeEnvironment();
  const model = requireModel(environment);
  const dataset = await loadTutorEvalDataset(TUTOR_EVAL_DATASET_ID);
  const selectedCases = selectCases(dataset, options);
  const prompt = await loadTutorEvalPedagogyJudgePrompt();
  printHeader(dataset, selectedCases, model, options.live);
  const request = requestOptions(model, prompt, environment);
  if (options.dryRun) {
    await runDryRun(selectedCases, request);
    return;
  }
  await runLive(dataset, selectedCases, model, prompt, environment);
}

try {
  await main();
} catch (error) {
  if (
    error instanceof JudgeCliUsageError ||
    error instanceof OpenAIJudgeConfigurationError
  ) {
    console.error(error.message);
  } else {
    console.error(
      error instanceof Error ? "OpenAI Judge CLI failed." : "OpenAI Judge CLI failed.",
    );
  }
  process.exitCode = 1;
}
