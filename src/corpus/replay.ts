import {
  BenchmarkConfigurationError,
  TUTOR_RESPONSE_REPLAY_COMPATIBILITIES,
  toTutorVisibleCasePacket,
  tutorVisibleCaseFingerprint,
  type TutorEvalDataset,
  type TutorResponseCorpus,
  type TutorResponseCorpusSemanticReplay,
  type TutorResponseReplayCaseVersionMapping,
  type TutorResponseReplayCompatibility,
} from "../contracts/index.js";

export interface TutorResponseCorpusReplayPlan {
  readonly sourceDataset: TutorEvalDataset;
  readonly targetDataset: TutorEvalDataset;
  readonly compatibility: TutorResponseReplayCompatibility;
  readonly caseVersionMappings: readonly TutorResponseReplayCaseVersionMapping[];
}

function incompatible(): never {
  throw new BenchmarkConfigurationError("tutor_response_replay_incompatible");
}

function mappingForCase(
  compatibility: TutorResponseReplayCompatibility,
  caseId: string,
): TutorResponseReplayCaseVersionMapping | undefined {
  return compatibility.caseVersionMappings.find((mapping) => mapping.caseId === caseId);
}

function targetCaseMap(dataset: TutorEvalDataset): ReadonlyMap<string, TutorEvalDataset["cases"][number]> {
  return new Map(dataset.cases.map((tutorEvalCase) => [tutorEvalCase.id, tutorEvalCase]));
}

function sourceDatasetView(
  targetDataset: TutorEvalDataset,
  compatibility: TutorResponseReplayCompatibility,
): TutorEvalDataset {
  return {
    ...targetDataset,
    version: compatibility.sourceDatasetVersion,
    cases: targetDataset.cases.map((tutorEvalCase) => {
      const mapping = mappingForCase(compatibility, tutorEvalCase.id);
      return mapping === undefined
        ? tutorEvalCase
        : { ...tutorEvalCase, version: mapping.sourceVersion };
    }),
  };
}

function validateCompatibilityAgainstTarget(
  compatibility: TutorResponseReplayCompatibility,
  targetDataset: TutorEvalDataset,
): void {
  if (
    compatibility.targetDatasetId !== targetDataset.id ||
    compatibility.targetDatasetVersion !== targetDataset.version ||
    compatibility.sourceDatasetId !== targetDataset.id ||
    compatibility.caseVersionMappings.length === 0
  ) {
    incompatible();
  }
  const casesById = targetCaseMap(targetDataset);
  const mappedCaseIds = new Set<string>();
  for (const mapping of compatibility.caseVersionMappings) {
    if (mappedCaseIds.has(mapping.caseId)) {
      incompatible();
    }
    mappedCaseIds.add(mapping.caseId);
    const targetCase = casesById.get(mapping.caseId);
    if (
      targetCase === undefined ||
      targetCase.version !== mapping.targetVersion ||
      mapping.sourceVersion === mapping.targetVersion ||
      mapping.sourceTutorVisibleFingerprint !== mapping.targetTutorVisibleFingerprint
    ) {
      incompatible();
    }
    const actualFingerprint = tutorVisibleCaseFingerprint(
      toTutorVisibleCasePacket(targetCase),
    );
    if (actualFingerprint !== mapping.targetTutorVisibleFingerprint) {
      incompatible();
    }
  }
}

function validateResponseVersions(
  corpus: TutorResponseCorpus,
  targetDataset: TutorEvalDataset,
  compatibility: TutorResponseReplayCompatibility,
): void {
  const casesById = targetCaseMap(targetDataset);
  for (const response of corpus.responses) {
    const targetCase = casesById.get(response.caseId);
    if (targetCase === undefined) {
      incompatible();
    }
    const mapping = mappingForCase(compatibility, response.caseId);
    const expectedSourceVersion = mapping?.sourceVersion ?? targetCase.version;
    if (response.caseVersion !== expectedSourceVersion) {
      incompatible();
    }
  }
}

/**
 * Resolves only explicitly registered source-to-target transitions. A corpus
 * already at the target identity does not need replay and returns undefined.
 */
export function resolveTutorResponseCorpusReplay(
  corpus: TutorResponseCorpus,
  targetDataset: TutorEvalDataset,
): TutorResponseCorpusReplayPlan | undefined {
  if (
    corpus.datasetId === targetDataset.id &&
    corpus.datasetVersion === targetDataset.version
  ) {
    return undefined;
  }
  const compatibility = TUTOR_RESPONSE_REPLAY_COMPATIBILITIES.find(
    (candidate) =>
      candidate.sourceDatasetId === corpus.datasetId &&
      candidate.sourceDatasetVersion === corpus.datasetVersion &&
      candidate.targetDatasetId === targetDataset.id &&
      candidate.targetDatasetVersion === targetDataset.version,
  );
  if (compatibility === undefined) {
    incompatible();
  }
  validateCompatibilityAgainstTarget(compatibility, targetDataset);
  validateResponseVersions(corpus, targetDataset, compatibility);
  return {
    sourceDataset: sourceDatasetView(targetDataset, compatibility),
    targetDataset,
    compatibility,
    caseVersionMappings: compatibility.caseVersionMappings,
  };
}

export function toTutorResponseCorpusSemanticReplay(
  plan: TutorResponseCorpusReplayPlan,
): TutorResponseCorpusSemanticReplay {
  return {
    compatibilityId: plan.compatibility.compatibilityId,
    sourceDatasetId: plan.compatibility.sourceDatasetId,
    sourceDatasetVersion: plan.compatibility.sourceDatasetVersion,
    targetDatasetId: plan.compatibility.targetDatasetId,
    targetDatasetVersion: plan.compatibility.targetDatasetVersion,
    caseVersionMappings: plan.caseVersionMappings.map((mapping) => ({
      caseId: mapping.caseId,
      sourceVersion: mapping.sourceVersion,
      targetVersion: mapping.targetVersion,
    })),
  };
}
