import { BenchmarkConfigurationError } from "../contracts/errors.js";
import {
  type CalibrationCandidateResponseFile,
  type CalibrationGroundTruthContext,
  type CalibrationPacket,
  type CalibrationPacketEntry,
  type TutorEvalDataset,
} from "../contracts/index.js";
import {
  assertValidCalibrationData,
  type CalibrationValidationInput,
} from "../contracts/calibration-validation.js";

const disclosureCapabilities = new Set([
  "answer_non_disclosure",
  "overhelping_avoidance",
  "hint_calibration",
]);
const diagnosisCapabilities = new Set([
  "error_detection",
  "error_localization",
  "misconception_identification",
  "knowledge_gap_identification",
  "misconception_specific_adaptation",
]);
const correctnessCapabilities = new Set([
  "factual_correctness",
  "conceptual_correctness",
  "procedural_correctness",
  "reasoning_consistency",
  "misleading_simplification",
]);

function buildGroundTruthContext(
  tutorEvalCase: TutorEvalDataset["cases"][number],
  rubric: TutorEvalDataset["cases"][number]["evaluatorOnly"]["rubrics"][number],
): CalibrationGroundTruthContext | undefined {
  const source = tutorEvalCase.evaluatorOnly.groundTruth;
  if (source === undefined) {
    return undefined;
  }
  const capabilityTag = rubric.capabilityTag;
  const includeFullGroundTruth =
    rubric.category === "correctness" ||
    (capabilityTag !== undefined && correctnessCapabilities.has(capabilityTag));
  const includeAnswerIdentity =
    includeFullGroundTruth ||
    (capabilityTag !== undefined && disclosureCapabilities.has(capabilityTag));
  if (!includeFullGroundTruth && !includeAnswerIdentity) {
    return undefined;
  }
  const context: {
    finalAnswer?: string;
    acceptedAnswers?: readonly string[];
    requiredConcepts?: readonly string[];
    explanation?: string;
  } = {};
  if (includeAnswerIdentity) {
    if (source.finalAnswer !== undefined) {
      context.finalAnswer = source.finalAnswer;
    }
    if (source.acceptedAnswers !== undefined) {
      context.acceptedAnswers = source.acceptedAnswers;
    }
  }
  if (includeFullGroundTruth) {
    if (source.requiredConcepts !== undefined) {
      context.requiredConcepts = source.requiredConcepts;
    }
    if (source.explanation !== undefined) {
      context.explanation = source.explanation;
    }
  }
  return Object.keys(context).length === 0
    ? undefined
    : context as CalibrationGroundTruthContext;
}

function buildReviewerContext(
  tutorEvalCase: TutorEvalDataset["cases"][number],
  rubric: TutorEvalDataset["cases"][number]["evaluatorOnly"]["rubrics"][number],
): CalibrationPacketEntry["reviewerContext"] {
  const capabilityTag = rubric.capabilityTag;
  const disclosurePolicy =
    rubric.behavior === "prohibited" ||
    (capabilityTag !== undefined && disclosureCapabilities.has(capabilityTag))
      ? tutorEvalCase.evaluatorOnly.disclosurePolicy
      : undefined;
  const knownMisconception =
    tutorEvalCase.evaluatorOnly.knownMisconception !== undefined &&
    tutorEvalCase.evaluatorOnly.knownMisconception !== null &&
    (rubric.category === "diagnosis" ||
      (capabilityTag !== undefined && diagnosisCapabilities.has(capabilityTag)))
      ? tutorEvalCase.evaluatorOnly.knownMisconception
      : undefined;
  const groundTruth = buildGroundTruthContext(tutorEvalCase, rubric);
  if (
    disclosurePolicy === undefined &&
    knownMisconception === undefined &&
    groundTruth === undefined
  ) {
    return undefined;
  }
  return {
    ...(disclosurePolicy === undefined ? {} : { disclosurePolicy }),
    ...(groundTruth === undefined ? {} : { groundTruth }),
    ...(knownMisconception === undefined ? {} : { knownMisconception }),
  };
}

export function buildCalibrationPacket(
  dataset: TutorEvalDataset,
  candidates: CalibrationCandidateResponseFile,
): CalibrationPacket {
  const validationInput: CalibrationValidationInput = {
    dataset,
    candidates,
    annotationFiles: [],
  };
  assertValidCalibrationData(validationInput);
  const casesById = new Map(dataset.cases.map((caseValue) => [caseValue.id, caseValue]));
  const entries: CalibrationPacketEntry[] = [];
  const orderedResponses = [...candidates.responses].sort((left, right) =>
    left.responseId.localeCompare(right.responseId),
  );
  for (const response of orderedResponses) {
    const tutorEvalCase = casesById.get(response.caseId);
    if (tutorEvalCase === undefined || tutorEvalCase.version !== response.caseVersion) {
      throw new BenchmarkConfigurationError("calibration_data_invalid");
    }
    const orderedRubrics = [...tutorEvalCase.evaluatorOnly.rubrics].sort((left, right) =>
      left.id.localeCompare(right.id),
    );
    for (const rubric of orderedRubrics) {
      const reviewerContext = buildReviewerContext(tutorEvalCase, rubric);
      entries.push({
        entryId: `${tutorEvalCase.id}@${tutorEvalCase.version}/${response.responseId}/${rubric.id}`,
        caseId: tutorEvalCase.id,
        caseVersion: tutorEvalCase.version,
        responseId: response.responseId,
        studentVisibleContext: tutorEvalCase.tutorInput,
        candidateResponse: response.responseText,
        rubric: {
          rubricId: rubric.id,
          category: rubric.category,
          criterion: rubric.criterion,
          behavior: rubric.behavior ?? "required",
          ...(rubric.capabilityTag === undefined
            ? {}
            : { capabilityTag: rubric.capabilityTag }),
        },
        ...(reviewerContext === undefined
          ? {}
          : { reviewerContext }),
      });
    }
  }
  return {
    schemaVersion: 1,
    datasetId: dataset.id,
    datasetVersion: dataset.version,
    blind: true,
    entries,
  };
}
