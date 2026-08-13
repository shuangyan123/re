import {
  BenchmarkConfigurationError,
  assertValidTutorResponseCorpus,
  isTutorTurnOutput,
  parseTutorEvalDataset,
  parseTutorGenerationSpec,
  parseTutorResponseCorpus,
  type TutorCandidateResponse,
  type TutorEvalCase,
  type TutorEvalDataset,
  type TutorEvalTutorDescriptor,
  type TutorGenerationSpec,
  type TutorResponseCorpus,
  type TutorResponseCorpusCoverage,
  type TutorResponseProvenance,
  type TutorTurnMetrics,
  type TutorUnderTest,
} from "../contracts/index.js";
import { deriveTutorResponseId } from "../corpus/identity.js";
import { toTutorTurnInput } from "../contracts/tutor-eval.js";

export const TUTOR_BASELINE_COLLECTION_MANIFEST_SCHEMA_VERSION = 1 as const;
export const TUTOR_BASELINE_COLLECTION_REPORT_SCHEMA_VERSION = 1 as const;

export type TutorBaselineCollectionTransport = "http" | "tutor";
export type TutorBaselineCollectionFailureCode =
  | "tutor_call_failed"
  | "tutor_output_invalid";

export interface TutorBaselineCollectionManifest {
  readonly schemaVersion: typeof TUTOR_BASELINE_COLLECTION_MANIFEST_SCHEMA_VERSION;
  readonly baselineId: string;
  readonly datasetId: string;
  readonly datasetVersion: string;
  readonly transport: TutorBaselineCollectionTransport;
  readonly tutor: TutorEvalTutorDescriptor;
  readonly generationSpec: TutorGenerationSpec;
  readonly runsPerCase: number;
  readonly corpusId: string;
  readonly corpusVersion: string;
}

export interface TutorBaselineCollectionFailure {
  readonly caseId: string;
  readonly caseVersion: string;
  readonly runIndex: number;
  readonly code: TutorBaselineCollectionFailureCode;
}

export interface TutorBaselineArtifactMetadata {
  readonly status: "preliminary";
  readonly calibrationStatus: "uncalibrated";
  readonly publicLeaderboardEligible: false;
}

export interface TutorBaselineCollectionReport {
  readonly schemaVersion: typeof TUTOR_BASELINE_COLLECTION_REPORT_SCHEMA_VERSION;
  readonly artifactMetadata: TutorBaselineArtifactMetadata;
  readonly manifest: TutorBaselineCollectionManifest;
  readonly requestedCaseCount: number;
  readonly runsPerCase: number;
  readonly plannedTutorCallCount: number;
  readonly completedResponseCount: number;
  readonly failedTutorCallCount: number;
  readonly failures: readonly TutorBaselineCollectionFailure[];
  readonly startedAt: string;
  readonly finishedAt: string;
  readonly durationMs: number;
  readonly coverage: TutorResponseCorpusCoverage;
  readonly outputPath?: string;
}

export interface CollectTutorBaselineOptions {
  readonly tutor: TutorUnderTest;
  readonly dataset: TutorEvalDataset;
  readonly selectedCases?: readonly TutorEvalCase[];
  readonly generationSpec: TutorGenerationSpec;
  readonly tutorDescriptor: TutorEvalTutorDescriptor;
  readonly provenance: TutorResponseProvenance;
  readonly runsPerCase?: number;
  readonly baselineId?: string;
  readonly corpusId: string;
  readonly corpusVersion?: string;
  readonly transport?: TutorBaselineCollectionTransport;
  readonly outputPath?: string;
  readonly now?: () => Date;
}

export interface TutorBaselineCollectionResult {
  readonly corpus: TutorResponseCorpus | null;
  readonly report: TutorBaselineCollectionReport;
}

function orderedCases(
  dataset: TutorEvalDataset,
  selectedCases: readonly TutorEvalCase[] | undefined,
): readonly TutorEvalCase[] {
  const canonicalDataset = parseTutorEvalDataset(dataset);
  const cases = selectedCases ?? canonicalDataset.cases;
  const datasetCases = new Map(
    canonicalDataset.cases.map((tutorEvalCase) => [tutorEvalCase.id, tutorEvalCase]),
  );
  const selectedIds = new Set<string>();
  const resolvedCases = cases.map((tutorEvalCase) => {
    const canonicalCase = datasetCases.get(tutorEvalCase.id);
    if (
      canonicalCase === undefined ||
      canonicalCase.version !== tutorEvalCase.version ||
      selectedIds.has(tutorEvalCase.id)
    ) {
      throw new BenchmarkConfigurationError("tutor_eval_dataset_invalid");
    }
    selectedIds.add(tutorEvalCase.id);
    return canonicalCase;
  });
  if (resolvedCases.length === 0) {
    throw new BenchmarkConfigurationError("tutor_eval_dataset_invalid");
  }
  return [...resolvedCases].sort((left, right) => left.id.localeCompare(right.id));
}

function assertCollectionDescriptor(
  descriptor: TutorEvalTutorDescriptor,
): void {
  if (
    typeof descriptor.provider !== "string" ||
    descriptor.provider.trim().length === 0 ||
    typeof descriptor.model !== "string" ||
    descriptor.model.trim().length === 0 ||
    typeof descriptor.promptVersion !== "string" ||
    descriptor.promptVersion.trim().length === 0 ||
    (descriptor.modelVersion !== undefined &&
      (typeof descriptor.modelVersion !== "string" || descriptor.modelVersion.trim().length === 0)) ||
    (descriptor.promptId !== undefined &&
      (typeof descriptor.promptId !== "string" || descriptor.promptId.trim().length === 0)) ||
    (descriptor.reasoningEffort !== undefined &&
      (typeof descriptor.reasoningEffort !== "string" || descriptor.reasoningEffort.trim().length === 0)) ||
    (descriptor.temperature !== undefined &&
      (!Number.isFinite(descriptor.temperature) || descriptor.temperature < 0)) ||
    (descriptor.seed !== undefined && !Number.isInteger(descriptor.seed))
  ) {
    throw new BenchmarkConfigurationError("tutor_eval_dataset_invalid");
  }
}

function assertCollectionConfiguration(
  options: CollectTutorBaselineOptions,
  runsPerCase: number,
): void {
  if (
    typeof options.tutor !== "object" ||
    options.tutor === null ||
    typeof options.tutor.respond !== "function" ||
    typeof options.corpusId !== "string" ||
    options.corpusId.trim().length === 0 ||
    (options.corpusVersion !== undefined &&
      (typeof options.corpusVersion !== "string" || options.corpusVersion.trim().length === 0)) ||
    (options.baselineId !== undefined &&
      (typeof options.baselineId !== "string" || options.baselineId.trim().length === 0)) ||
    !["synthetic", "recorded_model", "review_workspace", "external"].includes(options.provenance) ||
    !["http", "tutor"].includes(options.transport ?? "tutor") ||
    typeof options.tutorDescriptor !== "object" ||
    options.tutorDescriptor === null ||
    !Number.isInteger(runsPerCase) ||
    runsPerCase < 1
  ) {
    throw new BenchmarkConfigurationError("tutor_response_corpus_invalid");
  }
  assertCollectionDescriptor(options.tutorDescriptor);
}

function sanitizeMetrics(
  metrics: TutorTurnMetrics | undefined,
): TutorTurnMetrics | undefined {
  if (metrics === undefined) {
    return undefined;
  }
  const tokenUsage = metrics.tokenUsage;
  const inputTokens = tokenUsage?.inputTokens;
  const outputTokens = tokenUsage?.outputTokens;
  const totalTokens = tokenUsage?.totalTokens;
  const validTokenCount = (value: number | undefined): value is number =>
    value !== undefined && Number.isInteger(value) && value >= 0;
  const sanitizedTokenUsage = tokenUsage === undefined
    ? undefined
    : {
        ...(validTokenCount(inputTokens)
          ? { inputTokens }
          : {}),
        ...(validTokenCount(outputTokens)
          ? { outputTokens }
          : {}),
        ...(validTokenCount(totalTokens)
          ? { totalTokens }
          : {}),
      };
  const hasTokenUsage = sanitizedTokenUsage !== undefined &&
    Object.keys(sanitizedTokenUsage).length > 0;
  const sanitized = {
    ...(typeof metrics.latencyMs === "number" && Number.isFinite(metrics.latencyMs) && metrics.latencyMs >= 0
      ? { latencyMs: metrics.latencyMs }
      : {}),
    ...(hasTokenUsage ? { tokenUsage: sanitizedTokenUsage } : {}),
    ...(typeof metrics.cost === "number" && Number.isFinite(metrics.cost) && metrics.cost >= 0
      ? { cost: metrics.cost }
      : {}),
  } satisfies TutorTurnMetrics;
  return Object.keys(sanitized).length === 0 ? undefined : sanitized;
}

function manifestFor(
  options: CollectTutorBaselineOptions,
  dataset: TutorEvalDataset,
  generationSpec: TutorGenerationSpec,
  runsPerCase: number,
): TutorBaselineCollectionManifest {
  const corpusVersion = options.corpusVersion ?? generationSpec.specVersion;
  return {
    schemaVersion: TUTOR_BASELINE_COLLECTION_MANIFEST_SCHEMA_VERSION,
    baselineId: options.baselineId ?? options.corpusId,
    datasetId: dataset.id,
    datasetVersion: dataset.version,
    transport: options.transport ?? "tutor",
    tutor: options.tutorDescriptor,
    generationSpec,
    runsPerCase,
    corpusId: options.corpusId,
    corpusVersion,
  };
}

function isFullSelection(
  dataset: TutorEvalDataset,
  selectedCases: readonly TutorEvalCase[],
): boolean {
  if (dataset.cases.length !== selectedCases.length) {
    return false;
  }
  const selectedIds = new Set(selectedCases.map((tutorEvalCase) => tutorEvalCase.id));
  return dataset.cases.every((tutorEvalCase) => selectedIds.has(tutorEvalCase.id));
}

/**
 * Collects frozen Tutor responses without evaluating rubrics or invoking a
 * Judge. Execution is sequential and failures never become fake responses.
 */
export async function collectTutorBaseline(
  options: CollectTutorBaselineOptions,
): Promise<TutorBaselineCollectionResult> {
  const dataset = parseTutorEvalDataset(options.dataset);
  const selectedCases = orderedCases(dataset, options.selectedCases);
  const generationSpec = parseTutorGenerationSpec(options.generationSpec);
  const runsPerCase = options.runsPerCase ?? 1;
  assertCollectionConfiguration(options, runsPerCase);
  const manifest = manifestFor(options, dataset, generationSpec, runsPerCase);
  const plannedTutorCallCount = selectedCases.length * runsPerCase;
  const now = options.now ?? (() => new Date());
  const startedAt = now().toISOString();
  const responses: TutorCandidateResponse[] = [];
  const failures: TutorBaselineCollectionFailure[] = [];

  for (const tutorEvalCase of selectedCases) {
    for (let runIndex = 1; runIndex <= runsPerCase; runIndex += 1) {
      let output: Awaited<ReturnType<TutorUnderTest["respond"]>>;
      try {
        output = await options.tutor.respond(toTutorTurnInput(tutorEvalCase, runIndex));
      } catch {
        failures.push({
          caseId: tutorEvalCase.id,
          caseVersion: tutorEvalCase.version,
          runIndex,
          code: "tutor_call_failed",
        });
        continue;
      }
      if (!isTutorTurnOutput(output)) {
        failures.push({
          caseId: tutorEvalCase.id,
          caseVersion: tutorEvalCase.version,
          runIndex,
          code: "tutor_output_invalid",
        });
        continue;
      }
      const metrics = sanitizeMetrics(output.metrics);
      responses.push({
        schemaVersion: 1,
        responseId: deriveTutorResponseId({
          corpusId: manifest.corpusId,
          corpusVersion: manifest.corpusVersion,
          datasetId: dataset.id,
          datasetVersion: dataset.version,
          caseId: tutorEvalCase.id,
          caseVersion: tutorEvalCase.version,
          tutor: manifest.tutor,
          generationSpec,
          runIndex,
        }),
        caseId: tutorEvalCase.id,
        caseVersion: tutorEvalCase.version,
        runIndex,
        responseText: output.text,
        provenance: options.provenance,
        ...(metrics === undefined ? {} : { metrics }),
      });
    }
  }

  const finishedAt = now().toISOString();
  const coverage: TutorResponseCorpusCoverage =
    failures.length === 0 &&
    responses.length === plannedTutorCallCount &&
    isFullSelection(dataset, selectedCases)
      ? "full"
      : "partial";
  const report: TutorBaselineCollectionReport = {
    schemaVersion: TUTOR_BASELINE_COLLECTION_REPORT_SCHEMA_VERSION,
    artifactMetadata: {
      status: "preliminary",
      calibrationStatus: "uncalibrated",
      publicLeaderboardEligible: false,
    },
    manifest,
    requestedCaseCount: selectedCases.length,
    runsPerCase,
    plannedTutorCallCount,
    completedResponseCount: responses.length,
    failedTutorCallCount: failures.length,
    failures: [...failures].sort((left, right) =>
      `${left.caseId}|${left.runIndex}`.localeCompare(`${right.caseId}|${right.runIndex}`),
    ),
    startedAt,
    finishedAt,
    durationMs: Math.max(0, new Date(finishedAt).getTime() - new Date(startedAt).getTime()),
    coverage,
    ...(options.outputPath === undefined ? {} : { outputPath: options.outputPath }),
  };

  if (responses.length === 0) {
    return { corpus: null, report };
  }

  const corpus = parseTutorResponseCorpus({
    schemaVersion: 1,
    corpusId: manifest.corpusId,
    corpusVersion: manifest.corpusVersion,
    datasetId: dataset.id,
    datasetVersion: dataset.version,
    createdAt: startedAt,
    coverage,
    runsPerCase,
    provenance: options.provenance,
    generationSpec,
    tutor: manifest.tutor,
    responses,
  });
  assertValidTutorResponseCorpus({ corpus, dataset });
  return { corpus, report };
}
