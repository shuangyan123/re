import { BenchmarkConfigurationError } from "../contracts/errors.js";
import {
  resolveTutorResponseCorpusReplay,
  toTutorResponseCorpusSemanticReplay,
} from "../corpus/replay.js";
import type {
  CalibrationCandidateResponse,
  CalibrationCandidateResponseFile,
  CalibrationResponseProvenance,
  TutorEvalDataset,
  TutorResponseCorpus,
  TutorResponseCorpusSemanticReplay,
  TutorResponseProvenance,
} from "../contracts/index.js";

export interface CalibrationCandidateConversionOptions {
  /** Optional target dataset identity for an explicitly audited replay. */
  readonly dataset?: TutorEvalDataset;
  readonly semanticReplay?: TutorResponseCorpusSemanticReplay;
}

function sameSemanticReplay(
  left: TutorResponseCorpusSemanticReplay,
  right: TutorResponseCorpusSemanticReplay,
): boolean {
  return (
    left.compatibilityId === right.compatibilityId &&
    left.sourceDatasetId === right.sourceDatasetId &&
    left.sourceDatasetVersion === right.sourceDatasetVersion &&
    left.targetDatasetId === right.targetDatasetId &&
    left.targetDatasetVersion === right.targetDatasetVersion &&
    left.caseVersionMappings.length === right.caseVersionMappings.length &&
    left.caseVersionMappings.every((mapping, index) => {
      const candidate = right.caseVersionMappings[index];
      return (
        candidate !== undefined &&
        mapping.caseId === candidate.caseId &&
        mapping.sourceVersion === candidate.sourceVersion &&
        mapping.targetVersion === candidate.targetVersion
      );
    })
  );
}

function calibrationProvenance(
  provenance: TutorResponseProvenance,
): CalibrationResponseProvenance {
  return provenance;
}

/** Converts one frozen corpus into the existing 0.2B candidate contract. */
export function toCalibrationCandidateResponseFile(
  corpus: TutorResponseCorpus,
  options: CalibrationCandidateConversionOptions = {},
): CalibrationCandidateResponseFile {
  const targetDataset = options.dataset;
  if (
    options.semanticReplay !== undefined &&
    (targetDataset === undefined ||
      targetDataset.id !== options.semanticReplay.targetDatasetId ||
      targetDataset.version !== options.semanticReplay.targetDatasetVersion)
  ) {
    throw new BenchmarkConfigurationError("calibration_candidate_invalid");
  }
  if (targetDataset !== undefined && options.semanticReplay !== undefined) {
    try {
      const replayPlan = resolveTutorResponseCorpusReplay(corpus, targetDataset);
      if (
        replayPlan === undefined ||
        !sameSemanticReplay(
          toTutorResponseCorpusSemanticReplay(replayPlan),
          options.semanticReplay,
        )
      ) {
        throw new Error("semantic replay does not match the approved transition");
      }
    } catch {
      throw new BenchmarkConfigurationError("calibration_candidate_invalid");
    }
  }
  if (
    targetDataset !== undefined &&
    options.semanticReplay === undefined &&
    (targetDataset.id !== corpus.datasetId || targetDataset.version !== corpus.datasetVersion)
  ) {
    throw new BenchmarkConfigurationError("calibration_candidate_invalid");
  }
  const caseVersions = new Map(
    options.semanticReplay?.caseVersionMappings.map((mapping) => [
      mapping.caseId,
      mapping.targetVersion,
    ]) ?? [],
  );
  const responses: CalibrationCandidateResponse[] = [...corpus.responses]
    .sort((left, right) => left.responseId.localeCompare(right.responseId))
    .map((response) => {
      const targetCase = targetDataset?.cases.find((candidate) => candidate.id === response.caseId);
      if (targetDataset !== undefined && targetCase === undefined) {
        throw new BenchmarkConfigurationError("calibration_candidate_invalid");
      }
      const replayMapping = options.semanticReplay?.caseVersionMappings.find(
        (mapping) => mapping.caseId === response.caseId,
      );
      if (
        targetDataset !== undefined &&
        options.semanticReplay !== undefined &&
        response.caseVersion !== (replayMapping?.sourceVersion ?? targetCase?.version)
      ) {
        throw new BenchmarkConfigurationError("calibration_candidate_invalid");
      }
      const mappedTargetVersion = caseVersions.get(response.caseId);
      if (
        targetCase !== undefined &&
        mappedTargetVersion !== undefined &&
        mappedTargetVersion !== targetCase.version
      ) {
        throw new BenchmarkConfigurationError("calibration_candidate_invalid");
      }
      const caseVersion =
        targetCase === undefined
          ? response.caseVersion
          : mappedTargetVersion ?? targetCase.version;
      return {
        schemaVersion: 1,
        responseId: response.responseId,
        datasetId: targetDataset?.id ?? corpus.datasetId,
        datasetVersion: targetDataset?.version ?? corpus.datasetVersion,
        caseId: response.caseId,
        caseVersion,
        tutorDescriptor: corpus.tutor,
        sourceRun: {
          runId: corpus.corpusId,
          runIndex: response.runIndex,
        },
        sourceCorpus: {
          corpusId: corpus.corpusId,
          corpusVersion: corpus.corpusVersion,
        },
        responseText: response.responseText,
        provenance: calibrationProvenance(response.provenance),
        ...(options.semanticReplay === undefined
          ? {}
          : { semanticReplay: options.semanticReplay }),
      };
    });
  const synthetic = corpus.provenance === "synthetic";
  return {
    schemaVersion: 1,
    dataKind: synthetic ? "synthetic-fixture" : "candidate-corpus",
    ...(synthetic
      ? {
          fixture: {
            synthetic: true as const,
            notHumanCalibrationData: true as const,
          },
        }
      : {}),
    datasetId: targetDataset?.id ?? corpus.datasetId,
    datasetVersion: targetDataset?.version ?? corpus.datasetVersion,
    responses,
  };
}
