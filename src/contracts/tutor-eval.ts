import type {
  StudentState,
  TutorConversationMessage,
  TutorTurnInput,
} from "./tutor.js";
import type { TutorEvalRubric } from "./rubric.js";
import type {
  TutorEvalCapabilityTag,
  TutorEvalDifficulty,
  TutorEvalLearningTask,
  TutorEvalStudentState,
} from "./tutor-eval-taxonomy.js";
import {
  resolveTutorCaseLocale,
  type TutorCaseLocale,
} from "./locale.js";

export const TUTOR_EVAL_DATASET_ID = "tutor-eval-v0.2a" as const;
export const TUTOR_EVAL_DATASET_VERSION = "0.2a.3" as const;
/** The last English-only dataset snapshot remains readable for old artifacts. */
export const TUTOR_EVAL_PREVIOUS_DATASET_VERSION = "0.2a.1" as const;
/** The previous bilingual snapshot remains readable as an immutable data view. */
export const TUTOR_EVAL_PREVIOUS_BILINGUAL_DATASET_VERSION = "0.2a.2" as const;
/**
 * Evaluation semantics are versioned separately from dataset/case identity so
 * immutable Tutor response corpora can be replayed under an explicitly named
 * verifier revision.
 */
export const TUTOR_EVAL_EVALUATOR_VERSION = "0.3a.3" as const;
export const TUTOR_EVAL_LEGACY_DATASET_ID = "tutor-eval-v0.1" as const;
export const TUTOR_EVAL_LEGACY_DATASET_VERSION = "0.1" as const;
export const TUTOR_EVAL_CASE_SCHEMA_VERSION = 1 as const;

export type TutorEvalCategory =
  | "correctness"
  | "diagnosis"
  | "guidance"
  | "adaptation"
  | "actionability";

export const TUTOR_EVAL_CATEGORIES: readonly TutorEvalCategory[] = [
  "correctness",
  "diagnosis",
  "guidance",
  "adaptation",
  "actionability",
] as const;

export type DisclosurePolicy =
  | "no_answer"
  | "hint_only"
  | "partial_solution"
  | "full_solution_allowed"
  | "full_solution_required";

export type TutorCriticalFailure =
  | "severe_factual_error"
  | "misconception_reinforcement"
  | "incorrect_diagnosis"
  | "answer_leakage"
  | "student_task_takeover"
  | "critical_misconception_ignored"
  | "instruction_violation";

export type TutorCriticalFailureSeverity = "minor" | "major" | "critical";

export const TUTOR_EVAL_CRITICAL_FAILURE_TYPES: readonly TutorCriticalFailure[] = [
  "severe_factual_error",
  "misconception_reinforcement",
  "incorrect_diagnosis",
  "answer_leakage",
  "student_task_takeover",
  "critical_misconception_ignored",
  "instruction_violation",
] as const;

export const TUTOR_EVAL_CRITICAL_FAILURE_SEVERITIES: readonly TutorCriticalFailureSeverity[] = [
  "minor",
  "major",
  "critical",
] as const;

export interface TutorEvalStudentProfile {
  readonly knownConcepts?: readonly string[];
  readonly misconceptions?: readonly string[];
  readonly level?: string;
  readonly goal?: string;
}

export interface TutorEvalGroundTruth {
  readonly finalAnswer?: string;
  readonly acceptedAnswers?: readonly string[];
  readonly requiredConcepts?: readonly string[];
  readonly explanation?: string;
}

export interface TutorEvalCaseMetadata {
  readonly subject: string;
  readonly topic: string;
  /** Legacy string/number values remain readable for v0.1 cases. */
  readonly difficulty?: TutorEvalDifficulty | string | number;
  readonly tags?: readonly string[];
  readonly taxonomyVersion?: string;
  readonly learningTask?: TutorEvalLearningTask;
  readonly studentState?: TutorEvalStudentState;
  readonly capabilityTags?: readonly TutorEvalCapabilityTag[];
}

export interface TutorEvalTutorInput {
  readonly learningObjective: string;
  readonly studentProfile?: TutorEvalStudentProfile;
  readonly conversationHistory?: readonly TutorConversationMessage[];
  readonly studentMessage: string;
  readonly problemContext?: string;
}

export interface TutorEvalCase {
  readonly schemaVersion: typeof TUTOR_EVAL_CASE_SCHEMA_VERSION;
  readonly id: string;
  readonly version: string;
  /** Target language for Tutor output; omitted legacy cases resolve to English. */
  readonly locale?: TutorCaseLocale;
  readonly metadata: TutorEvalCaseMetadata;
  readonly tutorInput: TutorEvalTutorInput;
  readonly evaluatorOnly: {
    readonly groundTruth?: TutorEvalGroundTruth;
    readonly knownMisconception?: string | null;
    readonly disclosurePolicy: DisclosurePolicy;
    readonly rubrics: readonly TutorEvalRubric[];
  };
  /**
   * Authored grouping for a cross-locale cohort. This is useful for grouping,
   * audit, and reporting only; it is not evidence that two cases are
   * scientifically equivalent or human-validated.
   */
  readonly crossLocaleGroupId?: string;
  readonly adaptationPairId?: string;
  readonly adaptationVariant?: string;
}

export interface TutorEvalRubricPartition {
  readonly deterministicRubrics: readonly TutorEvalRubric[];
  readonly judgeRubrics: readonly TutorEvalRubric[];
}

/**
 * Routes each rubric to exactly one authoritative evaluator boundary.
 * Parsed cases always carry evaluationType; the fallback keeps callers that
 * construct a legacy-shaped case in memory compatible with the parser rules.
 */
export function partitionTutorEvalRubrics(
  tutorEvalCase: TutorEvalCase,
): TutorEvalRubricPartition {
  const deterministicRubrics: TutorEvalRubric[] = [];
  const judgeRubrics: TutorEvalRubric[] = [];
  for (const rubric of tutorEvalCase.evaluatorOnly.rubrics) {
    const evaluationType =
      rubric.evaluationType ??
      (rubric.evaluatorId === undefined ? "judge" : "deterministic");
    if (evaluationType === "deterministic") {
      deterministicRubrics.push(rubric);
    } else {
      judgeRubrics.push(rubric);
    }
  }
  return { deterministicRubrics, judgeRubrics };
}

export interface TutorEvalDataset {
  readonly id: string;
  readonly version: string;
  readonly cases: readonly TutorEvalCase[];
}

function profileToStudentState(
  profile: TutorEvalStudentProfile | undefined,
): StudentState {
  return {
    knownConcepts: profile?.knownConcepts ?? [],
    misconceptions: profile?.misconceptions ?? [],
    level: profile?.level ?? "unspecified",
    goal: profile?.goal ?? "unspecified",
  };
}

/**
 * Creates the only input shape sent to a TutorUnderTest. Hidden annotations
 * are deliberately not accepted by this function and therefore cannot cross
 * the adapter boundary accidentally.
 */
export function toTutorTurnInput(
  tutorEvalCase: TutorEvalCase,
  runIndex = 1,
): TutorTurnInput {
  const tutorInput = tutorEvalCase.tutorInput;
  return {
    scenarioId: tutorEvalCase.id,
    caseId: tutorEvalCase.id,
    caseVersion: tutorEvalCase.version,
    runIndex,
    locale: resolveTutorCaseLocale(tutorEvalCase.locale),
    learningObjective: tutorInput.learningObjective,
    initialContext: tutorInput.problemContext ?? "",
    conversation: tutorInput.conversationHistory ?? [],
    currentStudentMessage: tutorInput.studentMessage,
    studentState: profileToStudentState(tutorInput.studentProfile),
  };
}

export type TutorEvalVisibleMessage = TutorConversationMessage;
