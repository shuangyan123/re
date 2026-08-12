export const AI_TUTOR_JUDGE_VERSION = "0.1" as const;
export const AI_TUTOR_JUDGE_RESULT_SCHEMA_VERSION = 1 as const;

export type JudgeScore = 0 | 1 | 2 | 3 | 4 | 5;
export type AiTutorJudgeQualityGate = "PASS" | "FAIL";
export type AiTutorJudgeOverhelping = "none" | "mild" | "moderate" | "severe";
export type AiTutorJudgeRubricResultStatus = "PASS" | "PARTIAL" | "FAIL";

export type CriticalFailureCode =
  | "CF-01"
  | "CF-02"
  | "CF-03"
  | "CF-04"
  | "CF-05"
  | "CF-06"
  | "CF-07";

export interface AiTutorJudgeCaseRubric {
  readonly must: readonly string[];
  readonly should: readonly string[];
  readonly must_not: readonly string[];
}

export interface AiTutorJudgeInput {
  readonly learning_objective: string;
  readonly student_profile: string;
  readonly conversation_history: string;
  readonly student_message: string;
  readonly ground_truth: string;
  readonly known_misconception: string;
  readonly pedagogical_objective: string;
  readonly case_rubric: AiTutorJudgeCaseRubric | null;
  readonly tutor_response: string;
}

export interface AiTutorJudgeScores {
  readonly correctness: JudgeScore;
  readonly diagnosis: JudgeScore;
  readonly scaffolding: JudgeScore;
  readonly student_agency: JudgeScore;
  readonly adaptivity: JudgeScore;
  readonly hint_calibration: JudgeScore;
  readonly communication: JudgeScore;
}

export interface AiTutorJudgeCriticalFailure {
  readonly code: CriticalFailureCode;
  readonly evidence: string;
}

export interface AiTutorJudgeRubricResult {
  readonly criterion: string;
  readonly result: AiTutorJudgeRubricResultStatus;
  readonly evidence: string;
}

export interface AiTutorJudgeResult {
  readonly quality_gate: AiTutorJudgeQualityGate;
  readonly critical_failures: readonly AiTutorJudgeCriticalFailure[];
  readonly scores: AiTutorJudgeScores;
  readonly pedagogy_score_100: number;
  readonly answer_leakage: boolean;
  readonly overhelping: AiTutorJudgeOverhelping;
  readonly rubric_results: readonly AiTutorJudgeRubricResult[];
  readonly primary_strength: string;
  readonly primary_weakness: string;
  readonly recommended_improvement: string;
  readonly confidence: number;
}
