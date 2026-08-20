import { BenchmarkConfigurationError } from "../contracts/errors.js";
import {
  HUMAN_REFERENCE_CALIBRATION_REPORT_SCHEMA_VERSION,
  HUMAN_REFERENCE_PROTOCOL_ID,
  HUMAN_REFERENCE_PROTOCOL_VERSION,
  type HumanReferenceAdjudicationFile,
  type HumanReferenceAnnotationFile,
  type HumanReferenceCalibrationReport,
  type HumanReferenceSet,
} from "../contracts/human-reference-calibration.js";
import {
  parseHumanReferenceAdjudicationFile,
  parseHumanReferenceAnnotationFile,
  parseHumanReferenceSet,
} from "../contracts/human-reference-calibration-validation.js";
import {
  calculateHumanPairwiseAgreement,
} from "./human-reference-agreement.js";
import {
  buildHumanReferenceSet,
  deriveHumanReferenceRubricLabels,
} from "./human-reference-reference.js";

function invalid(): never {
  throw new BenchmarkConfigurationError("human_reference_calibration_invalid");
}

function sameMarker(
  left: HumanReferenceAnnotationFile,
  right: HumanReferenceAdjudicationFile,
): boolean {
  return left.dataKind === "synthetic-fixture" && right.dataKind === "synthetic-fixture";
}

function assertFileIdentity(
  annotationFile: HumanReferenceAnnotationFile,
  adjudicationFile: HumanReferenceAdjudicationFile | undefined,
): void {
  if (
    annotationFile.calibrationProtocolId !== HUMAN_REFERENCE_PROTOCOL_ID ||
    annotationFile.calibrationProtocolVersion !== HUMAN_REFERENCE_PROTOCOL_VERSION ||
    annotationFile.requiredAnnotatorIds.length !== 2
  ) {
    return invalid();
  }
  if (adjudicationFile === undefined) {
    return;
  }
  if (
    adjudicationFile.calibrationProtocolId !== annotationFile.calibrationProtocolId ||
    adjudicationFile.calibrationProtocolVersion !== annotationFile.calibrationProtocolVersion ||
    adjudicationFile.dataKind !== (
      annotationFile.dataKind === "synthetic-fixture" ? "synthetic-fixture" : "human-adjudication"
    ) ||
    (annotationFile.dataKind === "synthetic-fixture" && !sameMarker(annotationFile, adjudicationFile)) ||
    (annotationFile.dataKind === "human-annotation" && adjudicationFile.fixture !== undefined)
  ) {
    return invalid();
  }
}

function parsedAnnotationFile(value: HumanReferenceAnnotationFile): HumanReferenceAnnotationFile {
  return parseHumanReferenceAnnotationFile(value);
}

function parsedAdjudicationFile(
  value: HumanReferenceAdjudicationFile,
): HumanReferenceAdjudicationFile {
  return parseHumanReferenceAdjudicationFile(value);
}

export function buildHumanReferenceCalibrationReport(
  annotationValue: HumanReferenceAnnotationFile,
  adjudicationValue?: HumanReferenceAdjudicationFile,
): HumanReferenceCalibrationReport {
  const annotationFile = parsedAnnotationFile(annotationValue);
  const adjudicationFile = adjudicationValue === undefined
    ? undefined
    : parsedAdjudicationFile(adjudicationValue);
  assertFileIdentity(annotationFile, adjudicationFile);

  const referenceSet: HumanReferenceSet = parseHumanReferenceSet(buildHumanReferenceSet({
    tasks: annotationFile.tasks,
    annotations: annotationFile.annotations,
    requiredAnnotatorIds: annotationFile.requiredAnnotatorIds,
    ...(adjudicationFile === undefined ? {} : { adjudications: adjudicationFile.adjudications }),
    dataKind: annotationFile.dataKind === "synthetic-fixture" ? "synthetic-fixture" : "human-reference",
    ...(annotationFile.fixture === undefined ? {} : { fixture: annotationFile.fixture }),
  }));
  const [annotatorA, annotatorB] = annotationFile.requiredAnnotatorIds;
  if (annotatorA === undefined || annotatorB === undefined) {
    return invalid();
  }
  const report: HumanReferenceCalibrationReport = {
    schemaVersion: HUMAN_REFERENCE_CALIBRATION_REPORT_SCHEMA_VERSION,
    calibrationProtocolId: HUMAN_REFERENCE_PROTOCOL_ID,
    calibrationProtocolVersion: HUMAN_REFERENCE_PROTOCOL_VERSION,
    dataKind: referenceSet.dataKind,
    humanReferenceDataPresent: annotationFile.dataKind === "human-annotation",
    ...(referenceSet.fixture === undefined ? {} : { fixture: referenceSet.fixture }),
    humanHumanAgreement: calculateHumanPairwiseAgreement(
      annotatorA,
      annotatorB,
      annotationFile.annotations.filter((annotation) => annotation.annotatorId === annotatorA),
      annotationFile.annotations.filter((annotation) => annotation.annotatorId === annotatorB),
    ),
    referenceCoverage: referenceSet.coverage,
    resolvedReferences: referenceSet.references,
    unresolvedDisagreements: referenceSet.unresolvedDisagreements,
    missingAnnotations: referenceSet.missingAnnotations,
    derivedReferenceLabels: deriveHumanReferenceRubricLabels(referenceSet),
  };
  return report;
}
