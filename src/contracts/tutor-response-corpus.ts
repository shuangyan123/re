import type {
  TutorEvalCase,
  TutorEvalDataset,
} from "./tutor-eval.js";
import {
  toTutorTurnInput,
} from "./tutor-eval.js";
import type {
  TutorEvalTutorDescriptor,
  TutorEvalRunResult,
} from "./result.js";
import type {
  StudentState,
  TutorConversationMessage,
  TutorTurnMetrics,
} from "./tutor.js";

export const TUTOR_RESPONSE_CORPUS_SCHEMA_VERSION = 1 as const;
export const TUTOR_VISIBLE_CASE_PACKET_SCHEMA_VERSION = 1 as const;
export const TUTOR_RESPONSE_CORPUS_RESULT_SCHEMA_VERSION = 1 as const;

/** Where the candidate response was produced. This is not an evaluator label. */
export type TutorResponseProvenance =
  | "synthetic"
  | "recorded_model"
  | "review_workspace"
  | "external";

export type TutorResponseCorpusCoverage = "full" | "partial";

export interface TutorCandidateResponse {
  readonly schemaVersion: typeof TUTOR_RESPONSE_CORPUS_SCHEMA_VERSION;
  /** Stable explicit identity; it must not be derived from array position. */
  readonly responseId: string;
  readonly caseId: string;
  readonly caseVersion: string;
  /** One-based run identity. Runs for the same case are separate responses. */
  readonly runIndex: number;
  readonly responseText: string;
  readonly provenance: TutorResponseProvenance;
  readonly metrics?: TutorTurnMetrics;
}

export interface TutorResponseCorpus {
  readonly schemaVersion: typeof TUTOR_RESPONSE_CORPUS_SCHEMA_VERSION;
  readonly corpusId: string;
  readonly corpusVersion: string;
  readonly datasetId: string;
  readonly datasetVersion: string;
  readonly createdAt: string;
  readonly coverage: TutorResponseCorpusCoverage;
  /** All responses in one corpus use the same bounded run count. */
  readonly runsPerCase: number;
  readonly provenance: TutorResponseProvenance;
  readonly tutor: TutorEvalTutorDescriptor;
  readonly responses: readonly TutorCandidateResponse[];
}

/**
 * The only packet exported to a Tutor implementation. It is intentionally
 * rebuilt from toTutorTurnInput(), so evaluator-only annotations have no
 * second mapping path into the adapter boundary.
 */
export interface TutorVisibleCasePacket {
  readonly caseId: string;
  readonly caseVersion: string;
  readonly learningObjective: string;
  readonly studentProfile: StudentState;
  readonly conversationHistory: readonly TutorConversationMessage[];
  readonly studentMessage: string;
  readonly problemContext: string;
}

export interface TutorVisibleCasePacketFile {
  readonly schemaVersion: typeof TUTOR_VISIBLE_CASE_PACKET_SCHEMA_VERSION;
  readonly datasetId: string;
  readonly datasetVersion: string;
  readonly cases: readonly TutorVisibleCasePacket[];
}

/** Friendly aliases for adapter authors and future bridge documentation. */
export type TutorCasePacket = TutorVisibleCasePacketFile;
export type TutorCasePacketEntry = TutorVisibleCasePacket;

export interface TutorResponseCorpusEvaluationResult {
  readonly schemaVersion: typeof TUTOR_RESPONSE_CORPUS_RESULT_SCHEMA_VERSION;
  readonly corpusId: string;
  readonly corpusVersion: string;
  readonly datasetId: string;
  readonly datasetVersion: string;
  readonly coverage: TutorResponseCorpusCoverage;
  readonly selectedCaseCount: number;
  readonly availableResponseCount: number;
  readonly missingCaseCount: number;
  readonly tutor: TutorEvalTutorDescriptor;
  readonly evaluation: TutorEvalRunResult;
}

export function toTutorVisibleCasePacket(
  tutorEvalCase: TutorEvalCase,
): TutorVisibleCasePacket {
  const input = toTutorTurnInput(tutorEvalCase);
  return {
    caseId: tutorEvalCase.id,
    caseVersion: tutorEvalCase.version,
    learningObjective: input.learningObjective ?? "",
    studentProfile: input.studentState,
    conversationHistory: input.conversation,
    studentMessage: input.currentStudentMessage,
    problemContext: input.initialContext,
  };
}

export function buildTutorVisibleCasePacketFile(
  dataset: TutorEvalDataset,
  selectedCases: readonly TutorEvalCase[] = dataset.cases,
): TutorVisibleCasePacketFile {
  const orderedCases = [...selectedCases].sort((left, right) =>
    left.id.localeCompare(right.id),
  );
  return {
    schemaVersion: TUTOR_VISIBLE_CASE_PACKET_SCHEMA_VERSION,
    datasetId: dataset.id,
    datasetVersion: dataset.version,
    cases: orderedCases.map(toTutorVisibleCasePacket),
  };
}
