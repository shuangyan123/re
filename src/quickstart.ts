import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import { ScriptedTutor } from "./adapters/scripted-tutor.js";
import { guidedResponses } from "./cli/synthetic-guided-tutor.js";
import {
  partitionTutorEvalRubrics,
  TUTOR_EVAL_EVALUATOR_VERSION,
  TUTOR_EVAL_LEGACY_DATASET_ID,
  TUTOR_EVAL_LEGACY_DATASET_VERSION,
  type TutorEvalCase,
  type TutorEvalCaseRunResult,
  type TutorEvalCategory,
  type TutorEvalDataset,
  type TutorEvalRubricResult,
} from "./contracts/index.js";
import { loadTutorEvalDataset } from "./datasets/synthetic.js";
import {
  runTutorEval,
  type TutorEvalTutorOptions,
} from "./runner/tutor-eval-runner.js";

export const QUICKSTART_ID = "tutorbench-quickstart" as const;
export const QUICKSTART_VERSION = "0.1.0" as const;
export const QUICKSTART_SELECTION_ID = "quickstart-v1" as const;
export const QUICKSTART_SUMMARY_SCHEMA_VERSION = 1 as const;

/**
 * The current 0.2A cases all retain at least one Judge-owned rubric. This
 * explicit, historical smoke dataset is the existing deterministic-only
 * development path; it does not redefine the canonical scoring cohort.
 */
export const QUICKSTART_DATASET_ID = TUTOR_EVAL_LEGACY_DATASET_ID;
export const QUICKSTART_DATASET_VERSION = TUTOR_EVAL_LEGACY_DATASET_VERSION;

export const QUICKSTART_EXAMPLE_TUTOR_ID = "scripted-quickstart-tutor" as const;
export const QUICKSTART_EXAMPLE_TUTOR_VERSION = "1.0.0" as const;
export const QUICKSTART_EXAMPLE_TUTOR_PROMPT_ID = "quickstart-example" as const;
export const QUICKSTART_EXAMPLE_TUTOR_PROMPT_VERSION = "1.0.0" as const;

export interface QuickstartCaseSelection {
  readonly id: string;
  readonly version: string;
  readonly fingerprint: string;
}

/** Fixed order and fingerprints make a changed smoke cohort fail closed. */
export const QUICKSTART_CASE_SELECTION = [
  {
    id: "fraction-misconception-001",
    version: "1.0.0",
    fingerprint:
      "sha256:b95c793937af73625936b5d3f0325636729588d807290840d4616008723fb1b3",
  },
  {
    id: "correct-answer-wrong-reasoning-001",
    version: "1.0.0",
    fingerprint:
      "sha256:1cb0c85ef6473ea24fd9bc90ba53952ccc1da5a03f1c654d56ba1b7ceaf049f6",
  },
  {
    id: "full-solution-check-001",
    version: "1.0.0",
    fingerprint:
      "sha256:67def02d94d36dc88d4323c859e72874e59444e86a5408881440a3dbbccebb1b",
  },
  {
    id: "paired-fraction-procedural-001",
    version: "1.0.0",
    fingerprint:
      "sha256:e1e48a8f73c4d09ce0b127cbed6625ab0bbc4fe4194f1600b5bb67ceb5f37b06",
  },
] as const satisfies readonly QuickstartCaseSelection[];

export interface QuickstartInvariantFailure {
  readonly code: "quickstart_invariant_failed";
}

export class QuickstartInvariantError extends Error implements QuickstartInvariantFailure {
  readonly code = "quickstart_invariant_failed" as const;

  constructor(message: string) {
    super(`Quickstart invariant failed: ${message}`);
    this.name = "QuickstartInvariantError";
  }
}

export interface QuickstartDiagnostic {
  readonly code: string;
  readonly message: string;
}

export interface QuickstartCheckSummary {
  readonly rubricId: string;
  readonly category: TutorEvalCategory;
  readonly result: TutorEvalRubricResult["result"];
  readonly diagnostics: readonly QuickstartDiagnostic[];
}

export interface QuickstartCheckCounts {
  readonly total: number;
  readonly passed: number;
  readonly partial: number;
  readonly failed: number;
  readonly errors: number;
}

export interface QuickstartCaseSummary {
  readonly id: string;
  readonly version: string;
  readonly status: "passed" | "failed";
  readonly deterministicChecks: QuickstartCheckCounts;
  readonly checks: readonly QuickstartCheckSummary[];
}

export interface QuickstartSummary {
  readonly schemaVersion: typeof QUICKSTART_SUMMARY_SCHEMA_VERSION;
  readonly mode: "quickstart-demo";
  readonly quickstart: {
    readonly id: typeof QUICKSTART_ID;
    readonly version: typeof QUICKSTART_VERSION;
    readonly selectionId: typeof QUICKSTART_SELECTION_ID;
    readonly reportSchemaVersion: typeof QUICKSTART_SUMMARY_SCHEMA_VERSION;
  };
  readonly dataset: {
    readonly id: typeof QUICKSTART_DATASET_ID;
    readonly version: typeof QUICKSTART_DATASET_VERSION;
    readonly kind: "development-smoke";
    readonly selection: readonly QuickstartCaseSelection[];
  };
  readonly exampleTutor: {
    readonly id: typeof QUICKSTART_EXAMPLE_TUTOR_ID;
    readonly version: typeof QUICKSTART_EXAMPLE_TUTOR_VERSION;
    readonly promptId: typeof QUICKSTART_EXAMPLE_TUTOR_PROMPT_ID;
    readonly promptVersion: typeof QUICKSTART_EXAMPLE_TUTOR_PROMPT_VERSION;
  };
  readonly evaluatorVersion: typeof TUTOR_EVAL_EVALUATOR_VERSION;
  readonly deterministicOnly: true;
  readonly judgeRequired: false;
  readonly judgeUsed: false;
  readonly networkRequired: false;
  readonly networkUsed: false;
  readonly officialBenchmarkScore: false;
  readonly publicLeaderboardEligible: false;
  readonly caseCount: number;
  readonly completedCaseCount: number;
  readonly passedCount: number;
  readonly failedCount: number;
  readonly errorCount: number;
  readonly caseResults: readonly QuickstartCaseSummary[];
}

const quickstartTutorDescriptor = {
  provider: "synthetic",
  model: QUICKSTART_EXAMPLE_TUTOR_ID,
  modelVersion: QUICKSTART_EXAMPLE_TUTOR_VERSION,
  promptId: QUICKSTART_EXAMPLE_TUTOR_PROMPT_ID,
  promptVersion: QUICKSTART_EXAMPLE_TUTOR_PROMPT_VERSION,
  temperature: 0,
  seed: 0,
} as const satisfies TutorEvalTutorOptions;

function failInvariant(message: string): never {
  throw new QuickstartInvariantError(message);
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) =>
          left < right ? -1 : left > right ? 1 : 0,
        )
        .map(([key, nested]) => [key, canonicalize(nested)]),
    );
  }
  return value;
}

export function fingerprintTutorEvalCase(tutorEvalCase: TutorEvalCase): string {
  return `sha256:${createHash("sha256")
    .update(JSON.stringify(canonicalize(tutorEvalCase)), "utf8")
    .digest("hex")}`;
}

/**
 * Selects the checked-in smoke cases and verifies that their ownership and
 * bytes still match the Quickstart contract before any Tutor executes.
 */
export function selectQuickstartCases(
  dataset: TutorEvalDataset,
): readonly TutorEvalCase[] {
  if (
    dataset.id !== QUICKSTART_DATASET_ID ||
    dataset.version !== QUICKSTART_DATASET_VERSION
  ) {
    failInvariant(
      `expected ${QUICKSTART_DATASET_ID}@${QUICKSTART_DATASET_VERSION}, received ${dataset.id}@${dataset.version}.`,
    );
  }
  if (new Set(dataset.cases.map((tutorEvalCase) => tutorEvalCase.id)).size !== dataset.cases.length) {
    failInvariant("the bundled dataset contains duplicate case IDs.");
  }

  const casesById = new Map(
    dataset.cases.map((tutorEvalCase) => [tutorEvalCase.id, tutorEvalCase]),
  );
  return QUICKSTART_CASE_SELECTION.map((selection) => {
    const tutorEvalCase = casesById.get(selection.id);
    if (tutorEvalCase === undefined) {
      failInvariant(
        `selected case ${selection.id} is missing. Review the Quickstart selection before release.`,
      );
    }
    if (tutorEvalCase.version !== selection.version) {
      failInvariant(
        `selected case ${selection.id} is version ${tutorEvalCase.version}; expected ${selection.version}.`,
      );
    }
    if (fingerprintTutorEvalCase(tutorEvalCase) !== selection.fingerprint) {
      failInvariant(
        `selected case ${selection.id} changed fingerprint. Review the Quickstart selection before release.`,
      );
    }

    const { deterministicRubrics, judgeRubrics } =
      partitionTutorEvalRubrics(tutorEvalCase);
    if (judgeRubrics.length > 0) {
      failInvariant(
        `selected case ${selection.id} now requires semantic Judge evaluation; the Quickstart selection must be reviewed before release.`,
      );
    }
    if (
      deterministicRubrics.length !== tutorEvalCase.evaluatorOnly.rubrics.length ||
      deterministicRubrics.some(
        (rubric) =>
          rubric.evaluationType !== "deterministic" ||
          typeof rubric.evaluatorId !== "string" ||
          rubric.evaluatorId.trim().length === 0,
      )
    ) {
      failInvariant(
        `selected case ${selection.id} is not an explicit deterministic-only case.`,
      );
    }
    return tutorEvalCase;
  });
}

export async function loadQuickstartDataset(): Promise<TutorEvalDataset> {
  try {
    return await loadTutorEvalDataset(
      QUICKSTART_DATASET_ID,
      QUICKSTART_DATASET_VERSION,
    );
  } catch {
    failInvariant(
      `the bundled ${QUICKSTART_DATASET_ID}@${QUICKSTART_DATASET_VERSION} smoke dataset could not be loaded. Run npm ci and npm run build, then retry.`,
    );
  }
}

function requiredGuidedResponse(caseId: string): string {
  const response = guidedResponses[caseId];
  if (response === undefined) {
    failInvariant(`the bundled example Tutor is missing response ${caseId}.`);
  }
  return response;
}

/**
 * Reuses the existing synthetic guided responses for three cases and keeps
 * one deliberately weak response so the first run visibly demonstrates a
 * pedagogical diagnostic rather than looking like an official score.
 */
export function createQuickstartTutor(): ScriptedTutor {
  return new ScriptedTutor({
    id: QUICKSTART_EXAMPLE_TUTOR_ID,
    responses: {
      "fraction-misconception-001": requiredGuidedResponse(
        "fraction-misconception-001",
      ),
      "correct-answer-wrong-reasoning-001": requiredGuidedResponse(
        "correct-answer-wrong-reasoning-001",
      ),
      "full-solution-check-001": requiredGuidedResponse(
        "full-solution-check-001",
      ),
      // Intentional demo defect: it answers but gives no next-step guidance.
      "paired-fraction-procedural-001": "The answer is 1.",
    },
  });
}

function summarizeChecks(
  result: TutorEvalCaseRunResult,
): {
  readonly checks: readonly QuickstartCheckSummary[];
  readonly counts: QuickstartCheckCounts;
} {
  const checks = result.rubricResults.map((rubric) => ({
    rubricId: rubric.rubricId,
    category: rubric.category,
    result: rubric.result,
    diagnostics: rubric.diagnostics.map(({ code, message }) => ({ code, message })),
  }));
  return {
    checks,
    counts: {
      total: checks.length,
      passed: checks.filter((check) => check.result === "PASS").length,
      partial: checks.filter((check) => check.result === "PARTIAL").length,
      failed: checks.filter((check) => check.result === "FAIL").length,
      errors: checks.filter((check) => check.result === "ERROR").length,
    },
  };
}

export async function runQuickstart(): Promise<QuickstartSummary> {
  const dataset = await loadQuickstartDataset();
  const selectedCases = selectQuickstartCases(dataset);
  let judgeCallCount = 0;
  let result: Awaited<ReturnType<typeof runTutorEval>>;
  try {
    result = await runTutorEval({
      dataset: { ...dataset, cases: selectedCases },
      tutor: createQuickstartTutor(),
      tutorDescriptor: quickstartTutorDescriptor,
      runId: `${QUICKSTART_ID}@${QUICKSTART_VERSION}`,
      onJudgeCall: () => {
        judgeCallCount += 1;
      },
    });
  } catch {
    failInvariant(
      "the bundled deterministic example could not be evaluated. Check the installed package and retry.",
    );
  }

  if (
    result.datasetId !== QUICKSTART_DATASET_ID ||
    result.datasetVersion !== QUICKSTART_DATASET_VERSION ||
    result.evaluatorVersion !== TUTOR_EVAL_EVALUATOR_VERSION
  ) {
    failInvariant("the evaluation returned an unexpected identity.");
  }
  if (result.judge !== null || judgeCallCount !== 0) {
    failInvariant(
      "a Judge execution was requested. Quickstart must remain Judge-free.",
    );
  }
  if (
    result.caseCount !== QUICKSTART_CASE_SELECTION.length ||
    result.caseRunCount !== QUICKSTART_CASE_SELECTION.length ||
    result.caseResults.length !== QUICKSTART_CASE_SELECTION.length
  ) {
    failInvariant("the evaluation returned an unexpected case count.");
  }

  const resultById = new Map(
    result.caseResults.map((caseResult) => [caseResult.caseId, caseResult]),
  );
  const caseResults = QUICKSTART_CASE_SELECTION.map((selection) => {
    const caseResult = resultById.get(selection.id);
    if (caseResult === undefined) {
      failInvariant(`the evaluation returned no result for ${selection.id}.`);
    }
    if (caseResult.caseVersion !== selection.version) {
      failInvariant(`the evaluation returned an unexpected version for ${selection.id}.`);
    }
    if (caseResult.status === "error") {
      const code = caseResult.diagnostics[0]?.code ?? "unknown";
      failInvariant(
        `case ${selection.id} returned ${code}. Quickstart promises complete deterministic evaluation.`,
      );
    }
    const expectedCase = selectedCases.find((tutorEvalCase) => tutorEvalCase.id === selection.id);
    if (expectedCase === undefined || caseResult.rubricResults.length !== expectedCase.evaluatorOnly.rubrics.length) {
      failInvariant(`case ${selection.id} returned incomplete deterministic checks.`);
    }
    const { checks, counts } = summarizeChecks(caseResult);
    if (counts.errors > 0) {
      failInvariant(`case ${selection.id} returned an evaluator error.`);
    }
    return {
      id: caseResult.caseId,
      version: caseResult.caseVersion,
      status: caseResult.status,
      deterministicChecks: counts,
      checks,
    };
  });

  return {
    schemaVersion: QUICKSTART_SUMMARY_SCHEMA_VERSION,
    mode: "quickstart-demo",
    quickstart: {
      id: QUICKSTART_ID,
      version: QUICKSTART_VERSION,
      selectionId: QUICKSTART_SELECTION_ID,
      reportSchemaVersion: QUICKSTART_SUMMARY_SCHEMA_VERSION,
    },
    dataset: {
      id: QUICKSTART_DATASET_ID,
      version: QUICKSTART_DATASET_VERSION,
      kind: "development-smoke",
      selection: QUICKSTART_CASE_SELECTION,
    },
    exampleTutor: {
      id: QUICKSTART_EXAMPLE_TUTOR_ID,
      version: QUICKSTART_EXAMPLE_TUTOR_VERSION,
      promptId: QUICKSTART_EXAMPLE_TUTOR_PROMPT_ID,
      promptVersion: QUICKSTART_EXAMPLE_TUTOR_PROMPT_VERSION,
    },
    evaluatorVersion: TUTOR_EVAL_EVALUATOR_VERSION,
    deterministicOnly: true,
    judgeRequired: false,
    judgeUsed: false,
    networkRequired: false,
    networkUsed: false,
    officialBenchmarkScore: false,
    publicLeaderboardEligible: false,
    caseCount: caseResults.length,
    completedCaseCount: caseResults.length,
    passedCount: caseResults.filter((caseResult) => caseResult.status === "passed").length,
    failedCount: caseResults.filter((caseResult) => caseResult.status === "failed").length,
    errorCount: 0,
    caseResults,
  };
}

function formatCheckResult(result: TutorEvalRubricResult["result"]): string {
  return result;
}

function formatCheckCounts(counts: QuickstartCheckCounts): string {
  return `${counts.passed} pass, ${counts.partial} partial, ${counts.failed} fail, ${counts.errors} errors`;
}

export function formatQuickstartSummary(summary: QuickstartSummary): string {
  const resultLines = summary.caseResults.flatMap((caseResult) => {
    const lines = [
      `${caseResult.status === "passed" ? "PASS" : "FAIL"}  ${caseResult.id} — ${formatCheckCounts(caseResult.deterministicChecks)}`,
      `  Checks: ${caseResult.checks
        .map((check) => `${check.rubricId}=${formatCheckResult(check.result)}`)
        .join(" · ")}`,
    ];
    const firstNonPass = caseResult.checks.find((check) => check.result !== "PASS");
    if (firstNonPass !== undefined) {
      const diagnostic = firstNonPass.diagnostics[0];
      lines.push(
        `  Detail: ${firstNonPass.rubricId} (${firstNonPass.category}) — ${diagnostic?.message ?? "No diagnostic message was returned."}`,
      );
    }
    return lines;
  });
  return [
    "TutorBench Quickstart",
    "",
    "Quickstart completed",
    `Quickstart: ${summary.quickstart.id}@${summary.quickstart.version}`,
    `Dataset: ${summary.dataset.id}@${summary.dataset.version} (development/smoke subset)`,
    `Selection: ${summary.quickstart.selectionId} · ${summary.caseCount} fixed cases`,
    `Example Tutor: ${summary.exampleTutor.id}@${summary.exampleTutor.version}`,
    `Evaluator: ${summary.evaluatorVersion} (deterministic checks only)`,
    "Judge: not required",
    "Network: disabled",
    "Official benchmark score: no",
    "Leaderboard eligible: no",
    "",
    "Results",
    "-------",
    ...resultLines,
    "",
    "Summary",
    "-------",
    `Completed: ${summary.completedCaseCount}`,
    `Passed demo cases: ${summary.passedCount}`,
    `Failed demo cases: ${summary.failedCount}`,
    `Errors: ${summary.errorCount}`,
    "",
    "This is a local deterministic demonstration only.",
    "One bundled synthetic response is intentionally weak so a diagnostic FAIL is visible.",
    "It is not an official TutorBench score and is not leaderboard eligible.",
    "It does not evaluate Judge-owned semantic criteria or full tutoring quality.",
    "Next step for the canonical path: npm run benchmark",
  ].join("\n");
}

export async function writeQuickstartSummary(
  summary: QuickstartSummary,
  outputPath: string,
): Promise<void> {
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
}
