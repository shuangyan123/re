import type {
  AiTutorJudgeCriticalFailure,
  AiTutorJudgeQualityGate,
  AiTutorJudgeScores,
} from "../contracts/judge.js";

const pedagogyWeights = {
  diagnosis: 0.25,
  scaffolding: 0.25,
  student_agency: 0.2,
  adaptivity: 0.15,
  hint_calibration: 0.15,
} as const;

function roundToTwoDecimals(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function calculatePedagogyScore100(scores: AiTutorJudgeScores): number {
  const weightedScore =
    scores.diagnosis * pedagogyWeights.diagnosis +
    scores.scaffolding * pedagogyWeights.scaffolding +
    scores.student_agency * pedagogyWeights.student_agency +
    scores.adaptivity * pedagogyWeights.adaptivity +
    scores.hint_calibration * pedagogyWeights.hint_calibration;
  return roundToTwoDecimals((weightedScore / 5) * 100);
}

export function determineQualityGate(
  scores: AiTutorJudgeScores,
  criticalFailures: readonly AiTutorJudgeCriticalFailure[],
): AiTutorJudgeQualityGate {
  return scores.correctness <= 2 || criticalFailures.length > 0 ? "FAIL" : "PASS";
}
