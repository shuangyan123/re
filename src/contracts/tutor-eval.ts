import type {
  StudentState,
  TutorConversationMessage,
  TutorTurnInput,
} from "./tutor.js";
import type { TutorEvalRubric } from "./rubric.js";

export const TUTOR_EVAL_DATASET_ID = "tutor-eval-v0.1" as const;
export const TUTOR_EVAL_DATASET_VERSION = "0.1" as const;
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
  readonly difficulty?: string | number;
  readonly tags?: readonly string[];
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
  readonly metadata: TutorEvalCaseMetadata;
  readonly tutorInput: TutorEvalTutorInput;
  readonly evaluatorOnly: {
    readonly groundTruth?: TutorEvalGroundTruth;
    readonly knownMisconception?: string | null;
    readonly disclosurePolicy: DisclosurePolicy;
    readonly rubrics: readonly TutorEvalRubric[];
  };
  readonly adaptationPairId?: string;
  readonly adaptationVariant?: string;
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
): TutorTurnInput {
  const tutorInput = tutorEvalCase.tutorInput;
  return {
    scenarioId: tutorEvalCase.id,
    caseId: tutorEvalCase.id,
    learningObjective: tutorInput.learningObjective,
    initialContext: tutorInput.problemContext ?? "",
    conversation: tutorInput.conversationHistory ?? [],
    currentStudentMessage: tutorInput.studentMessage,
    studentState: profileToStudentState(tutorInput.studentProfile),
  };
}

export type TutorEvalVisibleMessage = TutorConversationMessage;
