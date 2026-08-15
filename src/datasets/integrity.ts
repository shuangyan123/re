import { BenchmarkConfigurationError } from "../contracts/errors.js";
import {
  TUTOR_EVAL_CATEGORIES,
  type TutorEvalCase,
  type TutorEvalDataset,
} from "../contracts/index.js";
import {
  TUTOR_EVAL_CAPABILITY_TAGS,
  TUTOR_EVAL_LEARNER_LEVELS,
  TUTOR_EVAL_SUBJECTS,
  TUTOR_EVAL_TAXONOMY_VERSION,
  type TutorEvalDifficulty,
} from "../contracts/tutor-eval-taxonomy.js";

export type TutorEvalDatasetIntegrityIssueCode =
  | "version_invalid"
  | "case_id_duplicate"
  | "rubric_id_duplicate"
  | "rubric_capability_duplicate"
  | "rubric_empty"
  | "disclosure_policy_missing"
  | "taxonomy_metadata_missing"
  | "taxonomy_value_invalid"
  | "difficulty_metadata_invalid"
  | "adaptation_pair_malformed"
  | "adaptation_pair_problem_mismatch"
  | "adaptation_pair_state_not_counterfactual";

export interface TutorEvalDatasetIntegrityIssue {
  readonly code: TutorEvalDatasetIntegrityIssueCode;
  readonly caseId?: string;
}

export interface TutorEvalDatasetIntegrityOptions {
  /** Require the formal 0.2A metadata on every case. */
  readonly requireTaxonomyMetadata?: boolean;
  /** Rubric IDs are unique within a case by default; this opts into dataset-wide uniqueness. */
  readonly requireUniqueRubricIds?: boolean;
  readonly expectedTaxonomyVersion?: string;
  readonly expectedDatasetVersion?: string;
}

function isStructuredDifficulty(
  value: TutorEvalCase["metadata"]["difficulty"],
): value is TutorEvalDifficulty {
  return (
    typeof value === "object" &&
    value !== null &&
    TUTOR_EVAL_LEARNER_LEVELS.includes(
      value.learnerLevel as (typeof TUTOR_EVAL_LEARNER_LEVELS)[number],
    ) &&
    Number.isInteger(value.taskDifficulty) &&
    value.taskDifficulty >= 1 &&
    value.taskDifficulty <= 5 &&
    Number.isInteger(value.pedagogicalDifficulty) &&
    value.pedagogicalDifficulty >= 1 &&
    value.pedagogicalDifficulty <= 5
  );
}

function normalizedGroundTruth(caseValue: TutorEvalCase): string {
  const groundTruth = caseValue.evaluatorOnly.groundTruth;
  return JSON.stringify({
    finalAnswer: groundTruth?.finalAnswer ?? null,
    acceptedAnswers: [...(groundTruth?.acceptedAnswers ?? [])].sort(),
  });
}

function addIssue(
  issues: TutorEvalDatasetIntegrityIssue[],
  code: TutorEvalDatasetIntegrityIssueCode,
  caseId?: string,
): void {
  issues.push(caseId === undefined ? { code } : { code, caseId });
}

function validateAdaptationPairs(
  cases: readonly TutorEvalCase[],
  issues: TutorEvalDatasetIntegrityIssue[],
): void {
  const pairs = new Map<string, TutorEvalCase[]>();
  for (const caseValue of cases) {
    if (caseValue.adaptationPairId === undefined) {
      if (caseValue.adaptationVariant !== undefined) {
        addIssue(issues, "adaptation_pair_malformed", caseValue.id);
      }
      continue;
    }
    const group = pairs.get(caseValue.adaptationPairId) ?? [];
    group.push(caseValue);
    pairs.set(caseValue.adaptationPairId, group);
    if (caseValue.adaptationVariant === undefined) {
      addIssue(issues, "adaptation_pair_malformed", caseValue.id);
    }
  }

  for (const group of pairs.values()) {
    if (group.length !== 2) {
      for (const caseValue of group) {
        addIssue(issues, "adaptation_pair_malformed", caseValue.id);
      }
      continue;
    }
    const [first, second] = group;
    if (
      first === undefined ||
      second === undefined ||
      first.adaptationVariant === undefined ||
      second.adaptationVariant === undefined ||
      first.adaptationVariant === second.adaptationVariant
    ) {
      for (const caseValue of group) {
        addIssue(issues, "adaptation_pair_malformed", caseValue.id);
      }
      continue;
    }
    const firstDifficulty = first.metadata.difficulty;
    const secondDifficulty = second.metadata.difficulty;
    const sameUnderlyingProblem =
      first.metadata.subject === second.metadata.subject &&
      first.metadata.topic === second.metadata.topic &&
      normalizedGroundTruth(first) === normalizedGroundTruth(second) &&
      (first.metadata.learningTask === undefined ||
        first.metadata.learningTask === second.metadata.learningTask) &&
      (!isStructuredDifficulty(firstDifficulty) ||
        !isStructuredDifficulty(secondDifficulty) ||
        (firstDifficulty.learnerLevel === secondDifficulty.learnerLevel &&
          firstDifficulty.taskDifficulty === secondDifficulty.taskDifficulty));
    if (!sameUnderlyingProblem) {
      for (const caseValue of group) {
        addIssue(issues, "adaptation_pair_problem_mismatch", caseValue.id);
      }
    }
    if (
      first.metadata.studentState !== undefined &&
      second.metadata.studentState !== undefined &&
      first.metadata.studentState === second.metadata.studentState
    ) {
      for (const caseValue of group) {
        addIssue(issues, "adaptation_pair_state_not_counterfactual", caseValue.id);
      }
    }
  }
}

export function findTutorEvalDatasetIntegrityIssues(
  dataset: TutorEvalDataset,
  options: TutorEvalDatasetIntegrityOptions = {},
): TutorEvalDatasetIntegrityIssue[] {
  const issues: TutorEvalDatasetIntegrityIssue[] = [];
  const caseIds = new Set<string>();
  const rubricIds = new Set<string>();
  const requireTaxonomy = options.requireTaxonomyMetadata ?? false;
  const expectedTaxonomyVersion =
    options.expectedTaxonomyVersion ?? TUTOR_EVAL_TAXONOMY_VERSION;
  const validDatasetVersion = /^\d+\.\d+(?:[a-z]+)?(?:\.\d+)?$/i.test(dataset.version);
  if (
    !validDatasetVersion ||
    (options.expectedDatasetVersion !== undefined &&
      dataset.version !== options.expectedDatasetVersion)
  ) {
    addIssue(issues, "version_invalid");
  }

  for (const caseValue of dataset.cases) {
    if (!/^\d+\.\d+\.\d+$/.test(caseValue.version)) {
      addIssue(issues, "version_invalid", caseValue.id);
    }
    if (caseIds.has(caseValue.id)) {
      addIssue(issues, "case_id_duplicate", caseValue.id);
    }
    caseIds.add(caseValue.id);

    if (caseValue.evaluatorOnly.disclosurePolicy.trim().length === 0) {
      addIssue(issues, "disclosure_policy_missing", caseValue.id);
    }
    if (caseValue.evaluatorOnly.rubrics.length === 0) {
      addIssue(issues, "rubric_empty", caseValue.id);
    }

    const metadata = caseValue.metadata;
    const difficulty = metadata.difficulty;
    if (requireTaxonomy) {
      const taxonomyComplete =
        metadata.taxonomyVersion === expectedTaxonomyVersion &&
        typeof metadata.learningTask === "string" &&
        typeof metadata.studentState === "string" &&
        metadata.capabilityTags !== undefined &&
        metadata.capabilityTags.length > 0 &&
        isStructuredDifficulty(difficulty);
      if (!taxonomyComplete) {
        addIssue(issues, "taxonomy_metadata_missing", caseValue.id);
      }
      if (!TUTOR_EVAL_SUBJECTS.includes(metadata.subject as (typeof TUTOR_EVAL_SUBJECTS)[number])) {
        addIssue(issues, "taxonomy_value_invalid", caseValue.id);
      }
      if (
        metadata.capabilityTags === undefined ||
        metadata.capabilityTags.some(
          (tag) =>
            !TUTOR_EVAL_CAPABILITY_TAGS.includes(
              tag as (typeof TUTOR_EVAL_CAPABILITY_TAGS)[number],
            ),
        )
      ) {
        addIssue(issues, "taxonomy_value_invalid", caseValue.id);
      }
      if (!isStructuredDifficulty(difficulty)) {
        addIssue(issues, "difficulty_metadata_invalid", caseValue.id);
      }
    }

    const seenCategoryCapabilities = new Set<string>();
    const metadataCapabilities = new Set(metadata.capabilityTags ?? []);
    for (const rubric of caseValue.evaluatorOnly.rubrics) {
      if (options.requireUniqueRubricIds) {
        if (rubricIds.has(rubric.id)) {
          addIssue(issues, "rubric_id_duplicate", caseValue.id);
        }
        rubricIds.add(rubric.id);
      }
      if (requireTaxonomy && rubric.capabilityTag === undefined) {
        addIssue(issues, "taxonomy_metadata_missing", caseValue.id);
      }
      if (
        requireTaxonomy &&
        rubric.capabilityTag !== undefined &&
        !metadataCapabilities.has(rubric.capabilityTag)
      ) {
        addIssue(issues, "taxonomy_value_invalid", caseValue.id);
      }
      if (rubric.capabilityTag !== undefined) {
        const key = `${rubric.category}:${rubric.capabilityTag}`;
        if (seenCategoryCapabilities.has(key)) {
          addIssue(issues, "rubric_capability_duplicate", caseValue.id);
        }
        seenCategoryCapabilities.add(key);
      }
      if (!TUTOR_EVAL_CATEGORIES.includes(rubric.category)) {
        addIssue(issues, "taxonomy_value_invalid", caseValue.id);
      }
    }
  }

  validateAdaptationPairs(dataset.cases, issues);
  return issues;
}

export function assertValidTutorEvalDatasetIntegrity(
  dataset: TutorEvalDataset,
  options: TutorEvalDatasetIntegrityOptions = {},
): void {
  if (findTutorEvalDatasetIntegrityIssues(dataset, options).length > 0) {
    throw new BenchmarkConfigurationError("tutor_eval_dataset_invalid");
  }
}
