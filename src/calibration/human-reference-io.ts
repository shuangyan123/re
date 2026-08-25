import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import { BenchmarkConfigurationError } from "../contracts/errors.js";
import {
  parseHumanReferenceAdjudicationFile,
  parseHumanReferenceAnnotationFile,
  parseHumanReferenceSet,
} from "../contracts/human-reference-calibration-validation.js";
import type {
  HumanReferenceAdjudicationFile,
  HumanReferenceAnnotationFile,
  HumanReferenceCalibrationReport,
  HumanReferenceSet,
} from "../contracts/human-reference-calibration.js";
import type {
  HumanReferenceJudgeComparisonReport,
} from "../contracts/human-reference-judge-comparison.js";
import type {
  HumanReferenceAtomicAgreement,
  HumanReferenceCoverage,
  HumanReferenceDerivedAgreement,
  HumanReferenceJudgeAtomicDisagreement,
  HumanReferenceJudgeComparisonCaseReport,
  HumanReferenceJudgeComparisonRequirementAgreement,
  HumanReferenceJudgeComparisonTokenCoverage,
} from "../contracts/index.js";
import type {
  MaterialRequirementJudgeResult,
} from "../contracts/material-requirement-judge.js";
import type { TutorEvalJudgeMetrics, TutorEvalTokenUsage } from "../contracts/result.js";

async function readJson(path: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as unknown;
  } catch {
    throw new BenchmarkConfigurationError("human_reference_calibration_invalid");
  }
}

export async function loadHumanReferenceAnnotationFile(
  path: string,
): Promise<HumanReferenceAnnotationFile> {
  return parseHumanReferenceAnnotationFile(await readJson(path));
}

export async function loadHumanReferenceAdjudicationFile(
  path: string,
): Promise<HumanReferenceAdjudicationFile> {
  return parseHumanReferenceAdjudicationFile(await readJson(path));
}

export async function loadHumanReferenceSet(
  path: string,
): Promise<HumanReferenceSet> {
  return parseHumanReferenceSet(await readJson(path));
}

export async function writeHumanReferenceJson(
  value: HumanReferenceSet | HumanReferenceCalibrationReport,
  outputPath: string,
): Promise<void> {
  try {
    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(outputPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  } catch {
    throw new BenchmarkConfigurationError("human_reference_calibration_invalid");
  }
}

/**
 * Writes only the allowlisted comparison report contract. The report is built
 * from parsed atomic results and sanitized metrics before it reaches this
 * persistence boundary; raw provider payloads and hidden reasoning have no
 * representable field here.
 */
export async function writeHumanReferenceJudgeComparisonJson(
  value: HumanReferenceJudgeComparisonReport,
  outputPath: string,
): Promise<void> {
  try {
    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(outputPath, `${JSON.stringify(safeComparisonReport(value), null, 2)}\n`, "utf8");
  } catch {
    throw new BenchmarkConfigurationError("human_reference_calibration_invalid");
  }
}

function safeMetrics(value: TutorEvalJudgeMetrics): TutorEvalJudgeMetrics {
  const tokenUsage = value.tokenUsage === null
    ? null
    : safeTokenUsage(value.tokenUsage);
  return {
    latencyMs: value.latencyMs,
    tokenUsage,
    cost: value.cost,
    attempts: value.attempts,
  };
}

function safeTokenUsage(value: TutorEvalTokenUsage): TutorEvalTokenUsage | null {
  return {
    ...(value.inputTokens === undefined ? {} : { inputTokens: value.inputTokens }),
    ...(value.outputTokens === undefined ? {} : { outputTokens: value.outputTokens }),
    ...(value.totalTokens === undefined ? {} : { totalTokens: value.totalTokens }),
  };
}

function safeCoverage(value: HumanReferenceCoverage): HumanReferenceCoverage {
  return {
    plannedAtomicAssessments: value.plannedAtomicAssessments,
    resolvedAtomicAssessments: value.resolvedAtomicAssessments,
    unresolvedAtomicAssessments: value.unresolvedAtomicAssessments,
    missingAtomicAssessments: value.missingAtomicAssessments,
    referenceCoverageShare: value.referenceCoverageShare,
  };
}

function safeAtomicDisagreement(
  value: HumanReferenceJudgeAtomicDisagreement,
): HumanReferenceJudgeAtomicDisagreement {
  return {
    caseId: value.caseId,
    rubricId: value.rubricId,
    requirementId: value.requirementId,
    referenceStatus: value.referenceStatus,
    judgeStatus: value.judgeStatus,
    referenceProvenance: value.referenceProvenance,
    referenceSourceAnnotatorIds: [...value.referenceSourceAnnotatorIds],
    ...(value.judgeEvidence === undefined ? {} : { judgeEvidence: value.judgeEvidence }),
  };
}

function safeAtomicAgreement(value: HumanReferenceAtomicAgreement): HumanReferenceAtomicAgreement {
  return {
    comparableAtomicCount: value.comparableAtomicCount,
    agreementCount: value.agreementCount,
    disagreementCount: value.disagreementCount,
    agreementShare: value.agreementShare,
    confusionMatrix: {
      SATISFIED: {
        SATISFIED: value.confusionMatrix.SATISFIED.SATISFIED,
        OMITTED_OR_INCOMPLETE: value.confusionMatrix.SATISFIED.OMITTED_OR_INCOMPLETE,
        EXPLICIT_CONFLICT: value.confusionMatrix.SATISFIED.EXPLICIT_CONFLICT,
      },
      OMITTED_OR_INCOMPLETE: {
        SATISFIED: value.confusionMatrix.OMITTED_OR_INCOMPLETE.SATISFIED,
        OMITTED_OR_INCOMPLETE: value.confusionMatrix.OMITTED_OR_INCOMPLETE.OMITTED_OR_INCOMPLETE,
        EXPLICIT_CONFLICT: value.confusionMatrix.OMITTED_OR_INCOMPLETE.EXPLICIT_CONFLICT,
      },
      EXPLICIT_CONFLICT: {
        SATISFIED: value.confusionMatrix.EXPLICIT_CONFLICT.SATISFIED,
        OMITTED_OR_INCOMPLETE: value.confusionMatrix.EXPLICIT_CONFLICT.OMITTED_OR_INCOMPLETE,
        EXPLICIT_CONFLICT: value.confusionMatrix.EXPLICIT_CONFLICT.EXPLICIT_CONFLICT,
      },
    },
    disagreements: value.disagreements.map(safeAtomicDisagreement),
  };
}

function safeDerivedAgreement(value: HumanReferenceDerivedAgreement): HumanReferenceDerivedAgreement {
  return {
    comparableRubricCount: value.comparableRubricCount,
    agreementCount: value.agreementCount,
    disagreementCount: value.disagreementCount,
    agreementShare: value.agreementShare,
    disagreements: value.disagreements.map((disagreement) => ({
      caseId: disagreement.caseId,
      rubricId: disagreement.rubricId,
      referenceLabel: disagreement.referenceLabel,
      judgeLabel: disagreement.judgeLabel,
    })),
  };
}

function safeJudgeResult(value: MaterialRequirementJudgeResult): MaterialRequirementJudgeResult {
  return {
    schemaVersion: value.schemaVersion,
    caseId: value.caseId,
    rubricAssessments: value.rubricAssessments.map((rubric) => ({
      rubricId: rubric.rubricId,
      requirements: rubric.requirements.map((requirement) => ({
        requirementId: requirement.requirementId,
        status: requirement.status,
        ...(requirement.evidence === undefined ? {} : { evidence: requirement.evidence }),
      })),
    })),
  };
}

function safeGroup(
  value: HumanReferenceJudgeComparisonRequirementAgreement,
): HumanReferenceJudgeComparisonRequirementAgreement {
  return {
    comparableAtomicCount: value.comparableAtomicCount,
    agreementCount: value.agreementCount,
    disagreementCount: value.disagreementCount,
    agreementShare: value.agreementShare,
  };
}

function safeTokenCoverage(
  value: HumanReferenceJudgeComparisonTokenCoverage,
): HumanReferenceJudgeComparisonTokenCoverage {
  return {
    completeTotal: value.completeTotal,
    knownTotal: value.knownTotal,
    knownCount: value.knownCount,
    plannedCount: value.plannedCount,
    unavailableCount: value.unavailableCount,
    coverageShare: value.coverageShare,
  };
}

function safeCase(value: HumanReferenceJudgeComparisonCaseReport): HumanReferenceJudgeComparisonCaseReport {
  return {
    caseId: value.caseId,
    status: value.status,
    ...(value.judgeResult === undefined ? {} : { judgeResult: safeJudgeResult(value.judgeResult) }),
    ...(value.referenceAgreement === undefined
      ? {}
      : { referenceAgreement: safeAtomicAgreement(value.referenceAgreement) }),
    ...(value.derivedLabelAgreement === undefined
      ? {}
      : { derivedLabelAgreement: safeDerivedAgreement(value.derivedLabelAgreement) }),
    ...(value.executionErrorCode === undefined ? {} : { executionErrorCode: value.executionErrorCode }),
    ...(value.metrics === undefined ? {} : { metrics: safeMetrics(value.metrics) }),
  };
}

function safeComparisonReport(
  value: HumanReferenceJudgeComparisonReport,
): HumanReferenceJudgeComparisonReport {
  const safeByCode = Object.fromEntries(
    Object.entries(value.executionErrors.byCode).map(([code, count]) => [code, count]),
  );
  const safePerRequirement = Object.fromEntries(
    Object.entries(value.perRequirementAgreement).map(([requirementId, agreement]) => [
      requirementId,
      safeGroup(agreement),
    ]),
  );
  return {
    schemaVersion: value.schemaVersion,
    reportKind: value.reportKind,
    calibrationProtocolId: value.calibrationProtocolId,
    calibrationProtocolVersion: value.calibrationProtocolVersion,
    dataKind: value.dataKind,
    humanReferenceDataPresent: value.humanReferenceDataPresent,
    referenceCoverage: safeCoverage(value.referenceCoverage),
    judge: {
      provider: value.judge.provider,
      model: value.judge.model,
      promptId: value.judge.promptId,
      promptVersion: value.judge.promptVersion,
    },
    plannedJudgeCalls: value.plannedJudgeCalls,
    completedJudgeCalls: value.completedJudgeCalls,
    executionErrors: {
      count: value.executionErrors.count,
      byCode: safeByCode,
    },
    referenceAgreement: safeAtomicAgreement(value.referenceAgreement),
    derivedLabelAgreement: safeDerivedAgreement(value.derivedLabelAgreement),
    perRequirementAgreement: safePerRequirement,
    referenceProvenanceAgreement: {
      human_consensus: safeGroup(value.referenceProvenanceAgreement.human_consensus),
      human_adjudicated: safeGroup(value.referenceProvenanceAgreement.human_adjudicated),
    },
    perCase: value.perCase.map(safeCase),
    tokenUsageCoverage: {
      inputTokens: safeTokenCoverage(value.tokenUsageCoverage.inputTokens),
      outputTokens: safeTokenCoverage(value.tokenUsageCoverage.outputTokens),
      totalTokens: safeTokenCoverage(value.tokenUsageCoverage.totalTokens),
    },
    limitations: value.limitations.filter((limitation): limitation is string => typeof limitation === "string"),
  };
}
