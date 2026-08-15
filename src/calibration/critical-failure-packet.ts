import { BenchmarkConfigurationError } from "../contracts/errors.js";
import {
  CALIBRATION_CRITICAL_FAILURE_PACKET_SCHEMA_VERSION,
  CALIBRATION_CRITICAL_FAILURE_SEVERITY_GUIDANCE,
  type CalibrationCandidateResponseFile,
  type CalibrationCriticalFailurePacket,
  type CalibrationCriticalFailurePacketEntry,
  type CalibrationCriticalFailureReviewerContext,
  type CalibrationCriticalFailureTargetFile,
  type CriticalFailureCalibrationValidationInput,
  type TutorCriticalFailure,
  type TutorEvalDataset,
} from "../contracts/index.js";
import {
  assertValidCriticalFailureCalibrationData,
} from "../contracts/critical-failure-calibration-validation.js";

/** Definitions copied from the authoritative critical-failure audit. */
export const CALIBRATION_CRITICAL_FAILURE_DEFINITIONS: Readonly<
  Record<TutorCriticalFailure, string>
> = {
  severe_factual_error:
    "A materially false claim, answer, or explanation in a correctness-relevant case.",
  misconception_reinforcement:
    "The Tutor confirms, strengthens, or teaches the learner's known misconception.",
  incorrect_diagnosis:
    "The Tutor positively misidentifies the learner's error, reasoning, or knowledge state in a diagnosis task; incomplete or withheld diagnosis is not automatically wrong diagnosis.",
  answer_leakage:
    "The Tutor discloses a final answer, complete solution, or task-completing central operation beyond the case disclosurePolicy.",
  student_task_takeover:
    "The Tutor performs substantive learner work that the case intentionally assigns to the student, removing required student agency.",
  critical_misconception_ignored:
    "The Tutor fails to address a central known misconception when the case explicitly requires diagnosis or correction.",
  instruction_violation:
    "The Tutor violates an explicit case instruction that is not better represented by a more specific failure type.",
};

const contextFailureTypes = new Set<TutorCriticalFailure>([
  "answer_leakage",
  "student_task_takeover",
  "instruction_violation",
]);
const misconceptionFailureTypes = new Set<TutorCriticalFailure>([
  "misconception_reinforcement",
  "incorrect_diagnosis",
  "critical_misconception_ignored",
]);

function buildReviewerContext(
  tutorEvalCase: TutorEvalDataset["cases"][number],
  failureType: TutorCriticalFailure,
): CalibrationCriticalFailureReviewerContext {
  const knownMisconception = tutorEvalCase.evaluatorOnly.knownMisconception;
  const includeMisconception = misconceptionFailureTypes.has(failureType);
  const includeDisclosure = contextFailureTypes.has(failureType);
  return {
    caseObjective: tutorEvalCase.tutorInput.learningObjective,
    failureDefinition: CALIBRATION_CRITICAL_FAILURE_DEFINITIONS[failureType],
    severityGuidance: CALIBRATION_CRITICAL_FAILURE_SEVERITY_GUIDANCE,
    ...(includeDisclosure
      ? { disclosurePolicy: tutorEvalCase.evaluatorOnly.disclosurePolicy }
      : {}),
    ...(includeMisconception && knownMisconception !== undefined && knownMisconception !== null
      ? { knownMisconception }
      : {}),
    ...(failureType === "incorrect_diagnosis"
      ? {
          diagnosisContext: {
            caseObjective: tutorEvalCase.tutorInput.learningObjective,
            ...(knownMisconception === undefined || knownMisconception === null
              ? {}
              : { knownMisconception }),
          },
        }
      : {}),
  };
}

export function buildCalibrationCriticalFailurePacket(
  dataset: TutorEvalDataset,
  candidates: CalibrationCandidateResponseFile,
  targetFile: CalibrationCriticalFailureTargetFile,
): CalibrationCriticalFailurePacket {
  const validationInput: CriticalFailureCalibrationValidationInput = {
    dataset,
    candidates,
    targetFile,
    annotationFiles: [],
  };
  assertValidCriticalFailureCalibrationData(validationInput);
  const casesById = new Map(dataset.cases.map((caseValue) => [caseValue.id, caseValue]));
  const responsesById = new Map(
    candidates.responses.map((response) => [response.responseId, response]),
  );
  const entries: CalibrationCriticalFailurePacketEntry[] = [...targetFile.targets]
    .sort((left, right) => left.targetId.localeCompare(right.targetId))
    .map((target) => {
      const tutorEvalCase = casesById.get(target.caseId);
      const candidate = responsesById.get(target.responseId);
      if (tutorEvalCase === undefined || candidate === undefined) {
        throw new BenchmarkConfigurationError("calibration_critical_failure_data_invalid");
      }
      return {
        entryId: target.targetId,
        caseId: tutorEvalCase.id,
        caseVersion: tutorEvalCase.version,
        responseId: candidate.responseId,
        failureType: target.failureType,
        studentVisibleContext: tutorEvalCase.tutorInput,
        candidateResponse: candidate.responseText,
        reviewerContext: buildReviewerContext(tutorEvalCase, target.failureType),
      };
    });
  return {
    schemaVersion: CALIBRATION_CRITICAL_FAILURE_PACKET_SCHEMA_VERSION,
    datasetId: dataset.id,
    datasetVersion: dataset.version,
    blind: true,
    entries,
  };
}
