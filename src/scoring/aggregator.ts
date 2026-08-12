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
    failureTypes: [
      "severe_factual_error",
      "misconception_reinforcement",
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
  rubrics: readonly {
    readonly id: string;
    readonly category: TutorEvalCategory;
    readonly weight: number;
  }[],
  results: readonly TutorEvalRubricResult[],
  criticalFailures: readonly TutorEvalCriticalFailure[],
  config: TutorEvalScoringConfig = DEFAULT_TUTOR_EVAL_SCORING_CONFIG,
): TutorEvalAggregate {
  const categoryScores: Record<TutorEvalCategory, number | null> = {
    correctness: null,
    diagnosis: null,
    guidance: null,
    adaptation: null,
    actionability: null,
  };
  for (const category of TUTOR_EVAL_CATEGORIES) {
    const applicable = rubrics
      .map((rubric) => ({
        rubric,
        result: results.find((result) => result.rubricId === rubric.id),
      }))
      .filter(
        (entry): entry is {
          rubric: (typeof rubrics)[number];
          result: TutorEvalRubricResult;
        } =>
          entry.rubric.category === category &&
          entry.result !== undefined &&
          scoreForRubricResult(entry.result, config) !== null,
      );
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
          (sum, entry) =>
            sum +
            (scoreForRubricResult(entry.result, config) ?? 0) *
              entry.rubric.weight,
          0,
        ) / totalWeight,
      );
    }
  }

  const weightedCategories = TUTOR_EVAL_CATEGORIES.filter(
    (category) => categoryScores[category] !== null,
  );
  const categoryWeight = weightedCategories.reduce(
    (sum, category) => sum + config.categoryWeights[category],
    0,
  );
  const overallScore =
    categoryWeight === 0
      ? null
      : round(
          weightedCategories.reduce(
            (sum, category) =>
              sum +
              (categoryScores[category] ?? 0) *
                config.categoryWeights[category],
            0,
          ) / categoryWeight,
        );
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
      overallScore >= config.casePassThreshold &&
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
