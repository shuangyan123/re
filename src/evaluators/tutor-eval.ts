import {
  partitionTutorEvalRubrics,
  type TutorEvalCase,
  type TutorEvalRubric,
} from "../contracts/index.js";
import type {
  TutorEvalDiagnostic,
  TutorEvalRubricResult,
} from "../contracts/result.js";
import type { TutorTurnOutput } from "../contracts/tutor.js";
import { evaluateTutorEvalDeterministicCriterion } from "./deterministic.js";

function diagnostic(code: string, message: string): readonly TutorEvalDiagnostic[] {
  return [{ code, message }];
}

function errorResult(
  rubric: TutorEvalRubric,
  code: string,
  message: string,
): TutorEvalRubricResult {
  return {
    rubricId: rubric.id,
    category: rubric.category,
    result: "ERROR",
    score: null,
    weight: rubric.weight,
    critical: rubric.critical ?? false,
    diagnostics: diagnostic(code, message),
  };
}

export function evaluateTutorEvalRubric(
  tutorEvalCase: TutorEvalCase,
  rubric: TutorEvalRubric,
  output: TutorTurnOutput,
): TutorEvalRubricResult {
  const evaluationType =
    rubric.evaluationType ??
    (rubric.evaluatorId === undefined ? "judge" : "deterministic");
  if (evaluationType !== "deterministic" || rubric.evaluatorId === undefined) {
    return errorResult(
      rubric,
      "judge_evaluation_unavailable",
      "This rubric is reserved for a Judge adapter that is not enabled in Foundation.",
    );
  }

  try {
    const result = evaluateTutorEvalDeterministicCriterion(
      {
        id: rubric.id,
        evaluatorId: rubric.evaluatorId,
        ...(rubric.config === undefined ? {} : { config: rubric.config }),
      },
      output,
      {
        disclosurePolicy: tutorEvalCase.evaluatorOnly.disclosurePolicy,
        ...(tutorEvalCase.evaluatorOnly.groundTruth === undefined
          ? {}
          : { groundTruth: tutorEvalCase.evaluatorOnly.groundTruth }),
      },
    );
    const rubricStatus =
      result.status === "error"
        ? "ERROR"
        : result.score === 1
          ? "PASS"
          : result.score === 0
            ? "FAIL"
            : "PARTIAL";
    return {
      rubricId: rubric.id,
      category: rubric.category,
      result: rubricStatus,
      score: result.score,
      weight: rubric.weight,
      critical: rubric.critical ?? false,
      diagnostics: result.diagnostics,
    };
  } catch {
    return errorResult(
      rubric,
      "evaluation_failed",
      "Deterministic evaluator failed for this rubric.",
    );
  }
}

export function evaluateTutorEvalRubrics(
  tutorEvalCase: TutorEvalCase,
  output: TutorTurnOutput,
): readonly TutorEvalRubricResult[] {
  return partitionTutorEvalRubrics(tutorEvalCase).deterministicRubrics.map((rubric) =>
    evaluateTutorEvalRubric(tutorEvalCase, rubric, output),
  );
}

export function tutorEvalRubricResultHasAnswerLeak(
  result: TutorEvalRubricResult,
): boolean {
  return result.diagnostics.some(
    (diagnosticItem) => diagnosticItem.code === "direct_answer_detected",
  );
}
