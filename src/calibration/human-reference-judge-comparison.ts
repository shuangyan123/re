import {
  BenchmarkConfigurationError,
  MaterialRequirementJudgeExecutionError,
  parseMaterialRequirementJudgeInput,
  parseMaterialRequirementJudgeResult,
  type HumanAtomicStatus,
  type HumanReferenceJudgeComparisonCaseReport,
  type HumanReferenceJudgeComparisonExecutionStatus,
  type HumanReferenceJudgeComparisonJudgeIdentity,
  type HumanReferenceJudgeComparisonReport,
  type HumanReferenceJudgeComparisonRequirementAgreement,
  type HumanReferenceJudgeComparisonTokenCoverage,
  type HumanReferenceProvenance,
  type HumanReferenceSet,
  type MaterialRequirementAssessment,
  type MaterialRequirementJudge,
  type MaterialRequirementJudgeInput,
  type MaterialRequirementJudgeResult,
  type TutorEvalJudgeMetrics,
  type TutorEvalTokenUsage,
} from "../contracts/index.js";
import {
  HUMAN_REFERENCE_JUDGE_COMPARISON_REPORT_KIND,
  HUMAN_REFERENCE_JUDGE_COMPARISON_REPORT_SCHEMA_VERSION,
} from "../contracts/human-reference-judge-comparison.js";
import {
  MATERIAL_REQUIREMENT_JUDGE_PROMPT_ID,
  MATERIAL_REQUIREMENT_JUDGE_PROMPT_VERSION,
} from "../judge/material-requirement-prompt.js";
import { humanAtomicIdentityKey } from "./human-reference-agreement.js";
import { compareJudgeToHumanReference } from "./human-reference-comparison.js";
import { assertHumanReferenceSetReady } from "./human-reference-reference.js";

export interface HumanReferenceJudgeExecution {
  readonly caseId: string;
  /** Raw provider result is accepted only at this in-memory boundary. */
  readonly result?: unknown;
  readonly metrics?: TutorEvalJudgeMetrics | null;
  /** A typed availability/transport failure; never a semantic label. */
  readonly executionErrorCode?: string;
}

export interface HumanReferenceJudgeComparisonOptions {
  readonly judge?: HumanReferenceJudgeComparisonJudgeIdentity;
}

export interface HumanReferenceJudgeRunOptions {
  readonly judge: MaterialRequirementJudge;
  readonly judgeIdentity: HumanReferenceJudgeComparisonJudgeIdentity;
}

const defaultJudgeIdentity: HumanReferenceJudgeComparisonJudgeIdentity = {
  provider: "provider-free",
  model: "synthetic",
  promptId: MATERIAL_REQUIREMENT_JUDGE_PROMPT_ID,
  promptVersion: MATERIAL_REQUIREMENT_JUDGE_PROMPT_VERSION,
};

type MutableConfusionMatrix = {
  -readonly [status in HumanAtomicStatus]: Record<HumanAtomicStatus, number>;
};

type MutableAtomicAgreement = {
  comparableAtomicCount: number;
  agreementCount: number;
  disagreementCount: number;
  agreementShare: number | null;
  confusionMatrix: MutableConfusionMatrix;
  disagreements: HumanReferenceJudgeComparisonReport["referenceAgreement"]["disagreements"][number][];
};

type MutableDerivedAgreement = {
  comparableRubricCount: number;
  agreementCount: number;
  disagreementCount: number;
  agreementShare: number | null;
  disagreements: HumanReferenceJudgeComparisonReport["derivedLabelAgreement"]["disagreements"][number][];
};

function emptyConfusionMatrix(): MutableConfusionMatrix {
  const row = (): Record<HumanAtomicStatus, number> => ({
    SATISFIED: 0,
    OMITTED_OR_INCOMPLETE: 0,
    EXPLICIT_CONFLICT: 0,
  });
  return {
    SATISFIED: row(),
    OMITTED_OR_INCOMPLETE: row(),
    EXPLICIT_CONFLICT: row(),
  };
}

function emptyAtomicAgreement(): MutableAtomicAgreement {
  return {
    comparableAtomicCount: 0,
    agreementCount: 0,
    disagreementCount: 0,
    agreementShare: null,
    confusionMatrix: emptyConfusionMatrix(),
    disagreements: [],
  };
}

function emptyDerivedAgreement(): MutableDerivedAgreement {
  return {
    comparableRubricCount: 0,
    agreementCount: 0,
    disagreementCount: 0,
    agreementShare: null,
    disagreements: [],
  };
}

function ratio(numerator: number, denominator: number): number | null {
  return denominator === 0 ? null : numerator / denominator;
}

function mergeAtomicAgreement(
  comparisons: readonly HumanReferenceJudgeComparisonReport["perCase"][number][],
): HumanReferenceJudgeComparisonReport["referenceAgreement"] {
  const merged = emptyAtomicAgreement();
  const disagreements: HumanReferenceJudgeComparisonReport["referenceAgreement"]["disagreements"][number][] = [];
  for (const comparison of comparisons) {
    const agreement = comparison.referenceAgreement;
    if (agreement === undefined) {
      continue;
    }
    merged.comparableAtomicCount += agreement.comparableAtomicCount;
    merged.agreementCount += agreement.agreementCount;
    for (const referenceStatus of ["SATISFIED", "OMITTED_OR_INCOMPLETE", "EXPLICIT_CONFLICT"] as const) {
      for (const judgeStatus of ["SATISFIED", "OMITTED_OR_INCOMPLETE", "EXPLICIT_CONFLICT"] as const) {
        merged.confusionMatrix[referenceStatus][judgeStatus] +=
          agreement.confusionMatrix[referenceStatus][judgeStatus];
      }
    }
    disagreements.push(...agreement.disagreements);
  }
  merged.disagreementCount = merged.comparableAtomicCount - merged.agreementCount;
  merged.agreementShare = ratio(merged.agreementCount, merged.comparableAtomicCount);
  merged.disagreements = disagreements.sort((left, right) =>
    humanAtomicIdentityKey(left).localeCompare(humanAtomicIdentityKey(right)),
  );
  return merged;
}

function mergeDerivedAgreement(
  comparisons: readonly HumanReferenceJudgeComparisonReport["perCase"][number][],
): HumanReferenceJudgeComparisonReport["derivedLabelAgreement"] {
  const merged = emptyDerivedAgreement();
  const disagreements: HumanReferenceJudgeComparisonReport["derivedLabelAgreement"]["disagreements"][number][] = [];
  for (const comparison of comparisons) {
    const agreement = comparison.derivedLabelAgreement;
    if (agreement === undefined) {
      continue;
    }
    merged.comparableRubricCount += agreement.comparableRubricCount;
    merged.agreementCount += agreement.agreementCount;
    disagreements.push(...agreement.disagreements);
  }
  merged.disagreementCount = merged.comparableRubricCount - merged.agreementCount;
  merged.agreementShare = ratio(merged.agreementCount, merged.comparableRubricCount);
  merged.disagreements = disagreements.sort((left, right) =>
    `${left.caseId}/${left.rubricId}`.localeCompare(`${right.caseId}/${right.rubricId}`),
  );
  return merged;
}

function incrementGroup(
  groups: Map<string, { comparableAtomicCount: number; agreementCount: number }>,
  key: string,
  agreement: boolean,
): void {
  const current = groups.get(key) ?? { comparableAtomicCount: 0, agreementCount: 0 };
  current.comparableAtomicCount += 1;
  if (agreement) {
    current.agreementCount += 1;
  }
  groups.set(key, current);
}

function groupedAgreement(
  groups: ReadonlyMap<string, { comparableAtomicCount: number; agreementCount: number }>,
): Readonly<Record<string, HumanReferenceJudgeComparisonRequirementAgreement>> {
  return Object.fromEntries(
    [...groups.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, value]) => [key, {
        comparableAtomicCount: value.comparableAtomicCount,
        agreementCount: value.agreementCount,
        disagreementCount: value.comparableAtomicCount - value.agreementCount,
        agreementShare: ratio(value.agreementCount, value.comparableAtomicCount),
      }]),
  );
}

function judgeAssessmentsByIdentity(
  result: MaterialRequirementJudgeResult,
): Map<string, MaterialRequirementAssessment> {
  return new Map(
    result.rubricAssessments.flatMap((rubric) => rubric.requirements.map((assessment) => [
      humanAtomicIdentityKey({
        caseId: result.caseId,
        rubricId: rubric.rubricId,
        requirementId: assessment.requirementId,
      }),
      assessment,
    ] as const)),
  );
}

function groupedDimensions(
  referenceSet: HumanReferenceSet,
  successfulCases: readonly HumanReferenceJudgeComparisonReport["perCase"][number][],
): {
  readonly perRequirementAgreement: Readonly<Record<string, HumanReferenceJudgeComparisonRequirementAgreement>>;
  readonly referenceProvenanceAgreement: Readonly<
    Record<HumanReferenceProvenance, HumanReferenceJudgeComparisonRequirementAgreement>
  >;
} {
  const referencesByCase = new Map<string, typeof referenceSet.references>();
  for (const reference of referenceSet.references) {
    referencesByCase.set(reference.caseId, [
      ...(referencesByCase.get(reference.caseId) ?? []),
      reference,
    ]);
  }
  const perRequirement = new Map<string, { comparableAtomicCount: number; agreementCount: number }>();
  const byProvenance = new Map<HumanReferenceProvenance, { comparableAtomicCount: number; agreementCount: number }>([
    ["human_consensus", { comparableAtomicCount: 0, agreementCount: 0 }],
    ["human_adjudicated", { comparableAtomicCount: 0, agreementCount: 0 }],
  ]);
  for (const caseReport of successfulCases) {
    if (caseReport.judgeResult === undefined) {
      continue;
    }
    const judgeByIdentity = judgeAssessmentsByIdentity(caseReport.judgeResult);
    for (const reference of referencesByCase.get(caseReport.caseId) ?? []) {
      const judge = judgeByIdentity.get(humanAtomicIdentityKey(reference));
      if (judge === undefined) {
        continue;
      }
      const agreement = reference.status === judge.status;
      incrementGroup(perRequirement, reference.requirementId, agreement);
      incrementGroup(byProvenance, reference.provenance, agreement);
    }
  }
  return {
    perRequirementAgreement: groupedAgreement(perRequirement),
    referenceProvenanceAgreement: {
      human_consensus: groupedAgreement(new Map([
        ["human_consensus", byProvenance.get("human_consensus") ?? { comparableAtomicCount: 0, agreementCount: 0 }],
      ]))["human_consensus"] ?? {
        comparableAtomicCount: 0,
        agreementCount: 0,
        disagreementCount: 0,
        agreementShare: null,
      },
      human_adjudicated: groupedAgreement(new Map([
        ["human_adjudicated", byProvenance.get("human_adjudicated") ?? { comparableAtomicCount: 0, agreementCount: 0 }],
      ]))["human_adjudicated"] ?? {
        comparableAtomicCount: 0,
        agreementCount: 0,
        disagreementCount: 0,
        agreementShare: null,
      },
    },
  };
}

function safeTokenUsage(value: TutorEvalTokenUsage | null | undefined): TutorEvalTokenUsage | null {
  if (value === null || value === undefined || typeof value !== "object") {
    return null;
  }
  const isCount = (candidate: unknown): candidate is number =>
    typeof candidate === "number" && Number.isInteger(candidate) && candidate >= 0;
  const sanitized: TutorEvalTokenUsage = {
    ...(isCount(value.inputTokens) ? { inputTokens: value.inputTokens } : {}),
    ...(isCount(value.outputTokens) ? { outputTokens: value.outputTokens } : {}),
    ...(isCount(value.totalTokens) ? { totalTokens: value.totalTokens } : {}),
  };
  return Object.keys(sanitized).length === 0 ? null : sanitized;
}

function safeMetrics(
  value: TutorEvalJudgeMetrics | null | undefined,
): TutorEvalJudgeMetrics | undefined {
  if (value === null || value === undefined || typeof value !== "object") {
    return undefined;
  }
  if (
    typeof value.latencyMs !== "number" ||
    !Number.isFinite(value.latencyMs) ||
    value.latencyMs < 0 ||
    !Number.isInteger(value.attempts) ||
    value.attempts < 1 ||
    (value.cost !== null && (
      typeof value.cost !== "number" ||
      !Number.isFinite(value.cost) ||
      value.cost < 0
    ))
  ) {
    return undefined;
  }
  return {
    latencyMs: Math.round(value.latencyMs),
    tokenUsage: safeTokenUsage(value.tokenUsage),
    cost: value.cost,
    attempts: value.attempts,
  };
}

function tokenCoverage(
  metrics: readonly (TutorEvalJudgeMetrics | undefined)[],
  field: keyof TutorEvalTokenUsage,
): HumanReferenceJudgeComparisonTokenCoverage {
  const values = metrics.map((metric) => metric?.tokenUsage?.[field] ?? null);
  const knownValues = values.filter((value): value is number => value !== null);
  const knownTotal = knownValues.length === 0
    ? null
    : knownValues.reduce((sum, value) => sum + value, 0);
  const unavailableCount = values.length - knownValues.length;
  return {
    completeTotal: unavailableCount === 0 && knownTotal !== null ? knownTotal : null,
    knownTotal,
    knownCount: knownValues.length,
    plannedCount: values.length,
    unavailableCount,
    coverageShare: values.length === 0 ? 0 : knownValues.length / values.length,
  };
}

function executionFailureCode(error: unknown): {
  readonly code: string;
  readonly metrics?: TutorEvalJudgeMetrics;
} {
  if (error instanceof MaterialRequirementJudgeExecutionError) {
    return {
      code: error.code,
      ...(error.metrics === undefined ? {} : { metrics: error.metrics }),
    };
  }
  return { code: "material_judge_transport_error" };
}

function executionStatusForError(
  execution: HumanReferenceJudgeExecution,
): HumanReferenceJudgeComparisonExecutionStatus {
  return execution.executionErrorCode === undefined
    ? "execution_invalid"
    : "execution_error";
}

function sortedTasks(referenceSet: HumanReferenceSet): HumanReferenceSet["tasks"] {
  return [...referenceSet.tasks].sort((left, right) => left.caseId.localeCompare(right.caseId));
}

/**
 * Removes the human-only wrapper and reparses the exact Judge visible input.
 * This is the only input boundary used by the live comparison runner.
 */
export function materialRequirementJudgeInputFromHumanReferenceTask(
  task: HumanReferenceSet["tasks"][number],
): MaterialRequirementJudgeInput {
  const input = { ...task };
  delete (input as { schemaVersion?: unknown }).schemaVersion;
  return parseMaterialRequirementJudgeInput(input);
}

function validateExecutionOwnership(
  referenceSet: HumanReferenceSet,
  executions: readonly HumanReferenceJudgeExecution[],
): Map<string, HumanReferenceJudgeExecution> {
  const taskIds = new Set(referenceSet.tasks.map((task) => task.caseId));
  const byCaseId = new Map<string, HumanReferenceJudgeExecution>();
  for (const execution of executions) {
    if (!taskIds.has(execution.caseId) || byCaseId.has(execution.caseId)) {
      throw new BenchmarkConfigurationError("human_reference_calibration_invalid");
    }
    byCaseId.set(execution.caseId, execution);
  }
  return byCaseId;
}

/**
 * Aggregates already executed Judge results through the existing one-case
 * comparison primitive. Provider failures and invalid results remain outside
 * every semantic denominator.
 */
export function compareJudgeBatchToHumanReference(
  executions: readonly HumanReferenceJudgeExecution[],
  humanReference: HumanReferenceSet,
  options: HumanReferenceJudgeComparisonOptions = {},
): HumanReferenceJudgeComparisonReport {
  assertHumanReferenceSetReady(humanReference);
  const executionByCaseId = validateExecutionOwnership(humanReference, executions);
  const perCase: HumanReferenceJudgeComparisonCaseReport[] = [];
  let completedJudgeCalls = 0;
  const executionErrorsByCode: Record<string, number> = {};
  const safeMetricsByCase: (TutorEvalJudgeMetrics | undefined)[] = [];

  for (const task of sortedTasks(humanReference)) {
    const execution = executionByCaseId.get(task.caseId);
    if (execution === undefined) {
      const code = "material_judge_not_executed";
      executionErrorsByCode[code] = (executionErrorsByCode[code] ?? 0) + 1;
      perCase.push({ caseId: task.caseId, status: "execution_error", executionErrorCode: code });
      safeMetricsByCase.push(undefined);
      continue;
    }
    completedJudgeCalls += 1;
    const metrics = safeMetrics(execution.metrics);
    safeMetricsByCase.push(metrics);
    if (execution.executionErrorCode !== undefined) {
      executionErrorsByCode[execution.executionErrorCode] =
        (executionErrorsByCode[execution.executionErrorCode] ?? 0) + 1;
      perCase.push({
        caseId: task.caseId,
        status: "execution_error",
        executionErrorCode: execution.executionErrorCode,
        ...(metrics === undefined ? {} : { metrics }),
      });
      continue;
    }
    try {
      const input = materialRequirementJudgeInputFromHumanReferenceTask(task);
      const judgeResult = parseMaterialRequirementJudgeResult(execution.result, input);
      const comparison = compareJudgeToHumanReference(judgeResult, humanReference);
      perCase.push({
        caseId: task.caseId,
        status: "completed",
        judgeResult,
        referenceAgreement: comparison.referenceAgreement,
        derivedLabelAgreement: comparison.derivedLabelAgreement,
        ...(metrics === undefined ? {} : { metrics }),
      });
    } catch {
      const code = "material_judge_result_invalid";
      executionErrorsByCode[code] = (executionErrorsByCode[code] ?? 0) + 1;
      perCase.push({
        caseId: task.caseId,
        status: executionStatusForError(execution),
        executionErrorCode: code,
        ...(metrics === undefined ? {} : { metrics }),
      });
    }
  }

  const successfulCases = perCase.filter((value) => value.status === "completed");
  const grouped = groupedDimensions(humanReference, successfulCases);
  const executionErrors = {
    count: Object.values(executionErrorsByCode).reduce((sum, value) => sum + value, 0),
    byCode: Object.fromEntries(
      Object.entries(executionErrorsByCode).sort(([left], [right]) => left.localeCompare(right)),
    ),
  };
  return {
    schemaVersion: HUMAN_REFERENCE_JUDGE_COMPARISON_REPORT_SCHEMA_VERSION,
    reportKind: HUMAN_REFERENCE_JUDGE_COMPARISON_REPORT_KIND,
    calibrationProtocolId: humanReference.calibrationProtocolId,
    calibrationProtocolVersion: humanReference.calibrationProtocolVersion,
    dataKind: humanReference.dataKind,
    humanReferenceDataPresent: humanReference.dataKind === "human-reference",
    referenceCoverage: humanReference.coverage,
    judge: options.judge ?? defaultJudgeIdentity,
    plannedJudgeCalls: humanReference.tasks.length,
    completedJudgeCalls,
    executionErrors,
    referenceAgreement: mergeAtomicAgreement(perCase),
    derivedLabelAgreement: mergeDerivedAgreement(perCase),
    perRequirementAgreement: grouped.perRequirementAgreement,
    referenceProvenanceAgreement: grouped.referenceProvenanceAgreement,
    perCase,
    tokenUsageCoverage: {
      inputTokens: tokenCoverage(safeMetricsByCase, "inputTokens"),
      outputTokens: tokenCoverage(safeMetricsByCase, "outputTokens"),
      totalTokens: tokenCoverage(safeMetricsByCase, "totalTokens"),
    },
    limitations: [
      "referenceAgreement compares only resolved human consensus or adjudicated atoms.",
      "Execution errors are availability observations, not semantic disagreements or labels.",
      "Complete human-reference coverage does not establish Judge calibration.",
      "This report does not establish a reference-standard status or replace production evaluation and scoring.",
    ],
  };
}

/**
 * Executes exactly one Judge call per Human Reference task, retaining only
 * parsed atomic output and sanitized metrics for the persisted report.
 */
export async function runHumanReferenceJudgeComparison(
  humanReference: HumanReferenceSet,
  options: HumanReferenceJudgeRunOptions,
): Promise<HumanReferenceJudgeComparisonReport> {
  assertHumanReferenceSetReady(humanReference);
  const executions: HumanReferenceJudgeExecution[] = [];
  for (const task of sortedTasks(humanReference)) {
    const input = materialRequirementJudgeInputFromHumanReferenceTask(task);
    try {
      const evaluation = options.judge.evaluateWithMetrics === undefined
        ? { result: await options.judge.evaluate(input), metrics: null }
        : await options.judge.evaluateWithMetrics(input);
      executions.push({
        caseId: task.caseId,
        result: evaluation.result,
        ...(evaluation.metrics === undefined ? {} : { metrics: evaluation.metrics }),
      });
    } catch (error) {
      const failure = executionFailureCode(error);
      executions.push({
        caseId: task.caseId,
        executionErrorCode: failure.code,
        ...(failure.metrics === undefined ? {} : { metrics: failure.metrics }),
      });
    }
  }
  return compareJudgeBatchToHumanReference(executions, humanReference, {
    judge: options.judgeIdentity,
  });
}
