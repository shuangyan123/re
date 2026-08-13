import type {
  CalibrationCandidateResponse,
  CalibrationCandidateResponseFile,
  CalibrationResponseProvenance,
} from "../contracts/index.js";
import type {
  TutorResponseCorpus,
  TutorResponseProvenance,
} from "../contracts/index.js";

function calibrationProvenance(
  provenance: TutorResponseProvenance,
): CalibrationResponseProvenance {
  return provenance;
}

/** Converts one frozen corpus into the existing 0.2B candidate contract. */
export function toCalibrationCandidateResponseFile(
  corpus: TutorResponseCorpus,
): CalibrationCandidateResponseFile {
  const responses: CalibrationCandidateResponse[] = [...corpus.responses]
    .sort((left, right) => left.responseId.localeCompare(right.responseId))
    .map((response) => ({
      schemaVersion: 1,
      responseId: response.responseId,
      datasetId: corpus.datasetId,
      datasetVersion: corpus.datasetVersion,
      caseId: response.caseId,
      caseVersion: response.caseVersion,
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
    }));
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
    datasetId: corpus.datasetId,
    datasetVersion: corpus.datasetVersion,
    responses,
  };
}
