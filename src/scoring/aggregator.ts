import type {
  TutorCriticalFailure,
  TutorCriticalFailureSeverity,
  TutorEvalCategory,
} from "../contracts/tutor-eval.js";
import type {
  TutorEvalCategoryScores,
  TutorEvalQualityGate,
  TutorEvalRubricResult,
  TutorEvalCriticalFailure,
} from "../contracts/result.js";
import type { TutorEvalRubricBehavior } from "../contracts/rubric.js";
import { TUTOR_EVAL_CATEGORIES } from "../contracts/tutor-eval.js";

export { TUTOR_EVAL_CATEGORIES } from "../contracts/tutor-eval.js";

export const DEFAULT_TUTOR_EVAL_SCORING_CONFIG = {
  criterionScores: {
    PASS: 1,
    PARTIAL: 0.5,
    FAIL: 0,
  },
  categoryWeights: {
    correctness: 1,
    diagnosis: 1,
    guidance: 1,
    adaptation: 1,
    actionability: 1,
  },
  casePassThreshold: 0.75,
  qualityGate: {
    // 默认 gate 审计见 docs/critical-failure-quality-gate-audit.md；minor
    // 仍保留为诊断信号，major/critical 才阻断 case 通过。
    failureTypes: [
      "severe_factual_error",
      "misconception_reinforcement",
      "incorrect_diagnosis",
      "answer_leakage",
      "student_task_takeover",
      "critical_misconception_ignored",
      "instruction_violation",
    ] as readonly TutorCriticalFailure[],
    minimumSeverity: "major" as TutorCriticalFailureSeverity,
  },
} as const;

export interface TutorEvalScoringConfig {
  readonly criterionScores: Readonly<
    Record<"PASS" | "PARTIAL" | "FAIL", number>
  >;
  readonly categoryWeights: Readonly<Record<TutorEvalCategory, number>>;
  readonly casePassThreshold: number;
  readonly qualityGate: {
    readonly failureTypes: readonly TutorCriticalFailure[];
    readonly minimumSeverity: TutorCriticalFailureSeverity;
  };
}

export interface TutorEvalAggregate {
  readonly categoryScores: TutorEvalCategoryScores;
  readonly overallScore: number | null;
  readonly qualityGate: TutorEvalQualityGate;
  readonly passed: boolean;
}

const severityRank: Readonly<Record<TutorCriticalFailureSeverity, number>> = {
  minor: 1,
  major: 2,
  critical: 3,
};

function round(value: number): number {
  return Math.round((value + Number.EPSILON) * 10000) / 10000;
}

function hasGatedFailure(
  failures: readonly TutorEvalCriticalFailure[],
  config: TutorEvalScoringConfig,
): boolean {
  return failures.some(
    (failure) =>
      config.qualityGate.failureTypes.includes(failure.type) &&
      severityRank[failure.severity] >=
        severityRank[config.qualityGate.minimumSeverity],
  );
}

function scoreForRubricResult(
  result: TutorEvalRubricResult,
  config: TutorEvalScoringConfig,
): number | null {
  return result.result === "ERROR"
    ? null
    : config.criterionScores[result.result];
}

type ScoringRubric = {
  readonly id: string;
  readonly category: TutorEvalCategory;
  readonly weight: number;
  readonly behavior?: TutorEvalRubricBehavior;
};

type ScoredRubric = {
  readonly rubric: ScoringRubric;
  readonly score: number;
};

function rubricBehavior(rubric: ScoringRubric): TutorEvalRubricBehavior {
  return rubric.behavior ?? "required";
}

function scoredRubrics(
  rubrics: readonly ScoringRubric[],
  results: readonly TutorEvalRubricResult[],
  config: TutorEvalScoringConfig,
): ScoredRubric[] {
  return rubrics.flatMap((rubric) => {
    const result = results.find((candidate) => candidate.rubricId === rubric.id);
    const score = result === undefined ? null : scoreForRubricResult(result, config);
    return result === undefined || score === null
      ? []
      : [{ rubric, score }];
  });
}

function categoryScoresForRubrics(
  rubrics: readonly ScoringRubric[],
  results: readonly TutorEvalRubricResult[],
  config: TutorEvalScoringConfig,
): TutorEvalCategoryScores {
  const categoryScores: Record<TutorEvalCategory, number | null> = {
    correctness: null,
    diagnosis: null,
    guidance: null,
    adaptation: null,
    actionability: null,
  };
  const scored = scoredRubrics(rubrics, results, config);
  for (const category of TUTOR_EVAL_CATEGORIES) {
    const applicable = scored.filter((entry) => entry.rubric.category === category);
    if (applicable.length === 0) {
      continue;
    }
    const totalWeight = applicable.reduce(
      (sum, entry) => sum + entry.rubric.weight,
      0,
    );
    if (totalWeight > 0) {
      categoryScores[category] = round(
        applicable.reduce(
          (sum, entry) => sum + entry.score * entry.rubric.weight,
          0,
        ) / totalWeight,
      );
    }
  }
  return categoryScores;
}

function weightedCategoryScore(
  categoryScores: TutorEvalCategoryScores,
  config: TutorEvalScoringConfig,
): number | null {
  const weightedCategories = TUTOR_EVAL_CATEGORIES.filter(
    (category) => categoryScores[category] !== null,
  );
  const categoryWeight = weightedCategories.reduce(
    (sum, category) => sum + config.categoryWeights[category],
    0,
  );
  return categoryWeight === 0
    ? null
    : round(
        weightedCategories.reduce(
          (sum, category) =>
            sum +
            (categoryScores[category] ?? 0) * config.categoryWeights[category],
          0,
        ) / categoryWeight,
      );
}

function hasCompleteRubricResults(
  rubrics: readonly ScoringRubric[],
  results: readonly TutorEvalRubricResult[],
  config: TutorEvalScoringConfig,
): boolean {
  return rubrics.every((rubric) => {
    const result = results.find((candidate) => candidate.rubricId === rubric.id);
    return result !== undefined && scoreForRubricResult(result, config) !== null;
  });
}

function hasNoProhibitedFailure(
  rubrics: readonly ScoringRubric[],
  results: readonly TutorEvalRubricResult[],
  config: TutorEvalScoringConfig,
): boolean {
  // A prohibited FAIL is an eligibility failure, but critical-failure mapping
  // stays an independent Judge/quality-gate decision.
  return rubrics
    .filter((rubric) => rubricBehavior(rubric) === "prohibited")
    .every((rubric) => {
      const result = results.find((candidate) => candidate.rubricId === rubric.id);
      return (
        result !== undefined &&
        scoreForRubricResult(result, config) !== null &&
        result.result !== "FAIL"
      );
    });
}

function essentialPassEligibility(
  rubrics: readonly ScoringRubric[],
  results: readonly TutorEvalRubricResult[],
  config: TutorEvalScoringConfig,
): boolean {
  // Required PARTIAL results remain score-bearing; the configured threshold,
  // rather than an all-PASS rule, decides the required-only eligibility score.
  const requiredRubrics = rubrics.filter(
    (rubric) => rubricBehavior(rubric) === "required",
  );
  const requiredScore = weightedCategoryScore(
    categoryScoresForRubrics(requiredRubrics, results, config),
    config,
  );
  const requiredPass =
    requiredRubrics.length === 0 ||
    (hasCompleteRubricResults(requiredRubrics, results, config) &&
      requiredScore !== null &&
      requiredScore >= config.casePassThreshold);
  return requiredPass && hasNoProhibitedFailure(rubrics, results, config);
}

export function createEmptyTutorEvalCategoryScores(): TutorEvalCategoryScores {
  return {
    correctness: null,
    diagnosis: null,
    guidance: null,
    adaptation: null,
    actionability: null,
  };
}

export function aggregateTutorEvalRubrics(
  rubrics: readonly ScoringRubric[],
  results: readonly TutorEvalRubricResult[],
  criticalFailures: readonly TutorEvalCriticalFailure[],
  config: TutorEvalScoringConfig = DEFAULT_TUTOR_EVAL_SCORING_CONFIG,
): TutorEvalAggregate {
  const categoryScores = categoryScoresForRubrics(rubrics, results, config);
  const overallScore = weightedCategoryScore(categoryScores, config);
  const qualityGate: TutorEvalQualityGate = hasGatedFailure(
    criticalFailures,
    config,
  )
    ? "FAIL"
    : "PASS";

  return {
    categoryScores,
    overallScore,
    qualityGate,
    passed:
      overallScore !== null &&
      essentialPassEligibility(rubrics, results, config) &&
      qualityGate === "PASS",
  };
}

export function aggregateTutorEvalCategoryScores(
  results: readonly TutorEvalAggregate[],
): TutorEvalCategoryScores {
  const aggregate: Record<TutorEvalCategory, number | null> = {
    correctness: null,
    diagnosis: null,
    guidance: null,
    adaptation: null,
    actionability: null,
  };
  for (const category of TUTOR_EVAL_CATEGORIES) {
    const scores = results
      .map((result) => result.categoryScores[category])
      .filter((score): score is number => score !== null);
    if (scores.length > 0) {
      aggregate[category] = round(
        scores.reduce((sum, score) => sum + score, 0) / scores.length,
      );
    }
  }
  return aggregate;
}

export function aggregateTutorEvalOverallScore(
  scores: readonly (number | null)[],
): number | null {
  const usable = scores.filter((score): score is number => score !== null);
  return usable.length === 0
    ? null
    : round(usable.reduce((sum, score) => sum + score, 0) / usable.length);
}
