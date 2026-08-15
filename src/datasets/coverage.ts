import {
  TUTOR_EVAL_CATEGORIES,
  TUTOR_EVAL_DISCLOSURE_POLICIES,
  type DisclosurePolicy,
  type TutorEvalCategory,
  type TutorEvalDataset,
} from "../contracts/index.js";
import { assertValidTutorEvalDatasetIntegrity } from "./integrity.js";

export interface TutorEvalCoverageReport {
  readonly datasetId: string;
  readonly datasetVersion: string;
  readonly caseCount: number;
  readonly rubricCount: number;
  readonly casesBySubject: Readonly<Record<string, number>>;
  readonly casesByLearningTask: Readonly<Record<string, number>>;
  readonly casesByStudentState: Readonly<Record<string, number>>;
  readonly casesByCategory: Readonly<Record<TutorEvalCategory, number>>;
  readonly casesByCapabilityTag: Readonly<Record<string, number>>;
  readonly casesByDisclosurePolicy: Readonly<Record<DisclosurePolicy, number>>;
  readonly casesByLearnerLevel: Readonly<Record<string, number>>;
  readonly casesByTaskDifficulty: Readonly<Record<string, number>>;
  readonly casesByPedagogicalDifficulty: Readonly<Record<string, number>>;
  readonly counterfactualPairCount: number;
  readonly criticalRubricCount: number;
  readonly judgeRequiredRubricCount: number;
}

const disclosurePolicies: readonly DisclosurePolicy[] = TUTOR_EVAL_DISCLOSURE_POLICIES;

function sortedCounts(counts: ReadonlyMap<string, number>): Readonly<Record<string, number>> {
  return Object.fromEntries(
    [...counts.entries()]
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
      .map(([key, value]) => [key, value]),
  );
}

function increment(counts: Map<string, number>, key: string): void {
  counts.set(key, (counts.get(key) ?? 0) + 1);
}

function countCategories(
  dataset: TutorEvalDataset,
): Readonly<Record<TutorEvalCategory, number>> {
  const counts = Object.fromEntries(
    TUTOR_EVAL_CATEGORIES.map((category) => [category, 0]),
  ) as Record<TutorEvalCategory, number>;
  for (const caseValue of dataset.cases) {
    const categories = new Set(
      caseValue.evaluatorOnly.rubrics.map((rubric) => rubric.category),
    );
    for (const category of categories) {
      counts[category] += 1;
    }
  }
  return counts;
}

export function buildTutorEvalCoverageReport(
  dataset: TutorEvalDataset,
): TutorEvalCoverageReport {
  assertValidTutorEvalDatasetIntegrity(dataset, {
    requireTaxonomyMetadata: true,
    requireUniqueRubricIds: true,
    expectedDatasetVersion: dataset.version,
  });
  const subjects = new Map<string, number>();
  const learningTasks = new Map<string, number>();
  const studentStates = new Map<string, number>();
  const capabilities = new Map<string, number>();
  const learnerLevels = new Map<string, number>();
  const taskDifficulties = new Map<string, number>();
  const pedagogicalDifficulties = new Map<string, number>();
  const disclosureCounts = new Map<string, number>(
    disclosurePolicies.map((policy) => [policy, 0]),
  );
  const pairIds = new Set<string>();
  let rubricCount = 0;
  let criticalRubricCount = 0;
  let judgeRequiredRubricCount = 0;

  for (const caseValue of dataset.cases) {
    increment(subjects, caseValue.metadata.subject);
    if (caseValue.metadata.learningTask !== undefined) {
      increment(learningTasks, caseValue.metadata.learningTask);
    }
    if (caseValue.metadata.studentState !== undefined) {
      increment(studentStates, caseValue.metadata.studentState);
    }
    increment(disclosureCounts, caseValue.evaluatorOnly.disclosurePolicy);
    for (const capabilityTag of caseValue.metadata.capabilityTags ?? []) {
      increment(capabilities, capabilityTag);
    }
    const difficulty = caseValue.metadata.difficulty;
    if (typeof difficulty === "object" && difficulty !== null) {
      increment(learnerLevels, difficulty.learnerLevel);
      increment(taskDifficulties, String(difficulty.taskDifficulty));
      increment(
        pedagogicalDifficulties,
        String(difficulty.pedagogicalDifficulty),
      );
    }
    if (caseValue.adaptationPairId !== undefined) {
      pairIds.add(caseValue.adaptationPairId);
    }
    rubricCount += caseValue.evaluatorOnly.rubrics.length;
    criticalRubricCount += caseValue.evaluatorOnly.rubrics.filter(
      (rubric) => rubric.critical === true,
    ).length;
    judgeRequiredRubricCount += caseValue.evaluatorOnly.rubrics.filter(
      (rubric) => rubric.evaluationType === "judge",
    ).length;
  }

  return {
    datasetId: dataset.id,
    datasetVersion: dataset.version,
    caseCount: dataset.cases.length,
    rubricCount,
    casesBySubject: sortedCounts(subjects),
    casesByLearningTask: sortedCounts(learningTasks),
    casesByStudentState: sortedCounts(studentStates),
    casesByCategory: countCategories(dataset),
    casesByCapabilityTag: sortedCounts(capabilities),
    casesByDisclosurePolicy: sortedCounts(disclosureCounts) as Readonly<
      Record<DisclosurePolicy, number>
    >,
    casesByLearnerLevel: sortedCounts(learnerLevels),
    casesByTaskDifficulty: sortedCounts(taskDifficulties),
    casesByPedagogicalDifficulty: sortedCounts(pedagogicalDifficulties),
    counterfactualPairCount: pairIds.size,
    criticalRubricCount,
    judgeRequiredRubricCount,
  };
}
