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
import {
  tutorGenerationSpecsEqual,
} from "../contracts/tutor-generation.js";
import { deriveTutorResponseId } from "../corpus/identity.js";
import { toTutorTurnInput } from "../contracts/tutor-eval.js";

export const TUTOR_BASELINE_COLLECTION_MANIFEST_SCHEMA_VERSION = 1 as const;
export const TUTOR_BASELINE_COLLECTION_REPORT_SCHEMA_VERSION = 1 as const;
export const PRODUCT_TUTOR_COLLECTION_CORPUS_VERSION = "product-v1" as const;

export type TutorCollectionMode = "product_tutor" | "canonical_model";
export type TutorBaselineCollectionTransport = "http" | "tutor";
export type TutorBaselineCollectionFailureCode =
  | "tutor_call_failed"
  | "tutor_output_invalid"
  | "execution_failed"
  | "execution_timeout"
  | "execution_transport_error"
  | "execution_unauthorized"
  | "execution_forbidden"
  | "execution_rate_limited"
  | "execution_server_error"
  | "execution_http_error"
  | "execution_unsupported_generation_control"
  | "execution_invalid_json"
  | "execution_invalid_response"
  | "execution_output_truncated";
export type ProductTutorProvenance = Exclude<
  TutorResponseProvenance,
  "recorded_model"
>;

export interface TutorBaselineCollectionManifest {
  readonly schemaVersion: typeof TUTOR_BASELINE_COLLECTION_MANIFEST_SCHEMA_VERSION;
  readonly collectionMode: TutorCollectionMode;
  readonly baselineId: string;
  readonly datasetId: string;
  readonly datasetVersion: string;
  readonly transport: TutorBaselineCollectionTransport;
  readonly tutor: TutorEvalTutorDescriptor;
  readonly generationSpec?: TutorGenerationSpec;
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
  readonly collectionMode: TutorCollectionMode;
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
  /** Number of successful responses carried forward by an explicit resume. */
  readonly reusedResponseCount?: number;
  /** Number of Tutor/host calls made during this invocation. */
  readonly executedTutorCallCount?: number;
  readonly outputPath?: string;
}

export interface CollectTutorEvidenceOptions {
  readonly dataset: TutorEvalDataset;
  readonly selectedCases?: readonly TutorEvalCase[];
  readonly generationSpec?: TutorGenerationSpec;
  readonly tutorDescriptor: TutorEvalTutorDescriptor;
  readonly provenance: TutorResponseProvenance;
  readonly runsPerCase?: number;
  readonly baselineId?: string;
  readonly corpusId: string;
  readonly corpusVersion?: string;
  readonly transport?: TutorBaselineCollectionTransport;
  readonly outputPath?: string;
  readonly resumeCorpus?: TutorResponseCorpus;
  readonly now?: () => Date;
  readonly collectionMode: TutorCollectionMode;
  readonly executeResponse: (
    tutorEvalCase: TutorEvalCase,
    runIndex: number,
  ) => Promise<unknown>;
}

export interface CollectTutorBaselineOptions {
  readonly tutor: TutorUnderTest;
  readonly dataset: TutorEvalDataset;
  readonly selectedCases?: readonly TutorEvalCase[];
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
  options: CollectTutorEvidenceOptions,
  runsPerCase: number,
): void {
  if (
    typeof options.corpusId !== "string" ||
    options.corpusId.trim().length === 0 ||
    (options.corpusVersion !== undefined &&
      (typeof options.corpusVersion !== "string" || options.corpusVersion.trim().length === 0)) ||
    (options.baselineId !== undefined &&
      (typeof options.baselineId !== "string" || options.baselineId.trim().length === 0)) ||
    !["synthetic", "recorded_model", "review_workspace", "external"].includes(options.provenance) ||
    !["http", "tutor"].includes(options.transport ?? "tutor") ||
    !["product_tutor", "canonical_model"].includes(options.collectionMode) ||
    typeof options.tutorDescriptor !== "object" ||
    options.tutorDescriptor === null ||
    typeof options.executeResponse !== "function" ||
    !Number.isInteger(runsPerCase) ||
    runsPerCase < 1
  ) {
    throw new BenchmarkConfigurationError("tutor_response_corpus_invalid");
  }
  if (
    options.collectionMode === "product_tutor" &&
    (options.generationSpec !== undefined || options.provenance === "recorded_model")
  ) {
    throw new BenchmarkConfigurationError("tutor_response_corpus_invalid");
  }
  if (
    options.collectionMode === "canonical_model" &&
    (options.generationSpec === undefined || options.provenance !== "recorded_model")
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
        ...(validTokenCount(inputTokens) ? { inputTokens } : {}),
        ...(validTokenCount(outputTokens) ? { outputTokens } : {}),
        ...(validTokenCount(totalTokens) ? { totalTokens } : {}),
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
  options: CollectTutorEvidenceOptions,
  dataset: TutorEvalDataset,
  generationSpec: TutorGenerationSpec | undefined,
  runsPerCase: number,
): TutorBaselineCollectionManifest {
  const corpusVersion = options.corpusVersion ??
    generationSpec?.specVersion ??
    PRODUCT_TUTOR_COLLECTION_CORPUS_VERSION;
  return {
    schemaVersion: TUTOR_BASELINE_COLLECTION_MANIFEST_SCHEMA_VERSION,
    collectionMode: options.collectionMode,
    baselineId: options.baselineId ?? options.corpusId,
    datasetId: dataset.id,
    datasetVersion: dataset.version,
    transport: options.transport ?? "tutor",
    tutor: options.tutorDescriptor,
    ...(generationSpec === undefined ? {} : { generationSpec }),
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

function sameTutorDescriptor(
  left: TutorEvalTutorDescriptor,
  right: TutorEvalTutorDescriptor,
): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function assertResumeCorpusMatchesCollection(
  resumeCorpus: TutorResponseCorpus,
  dataset: TutorEvalDataset,
  manifest: TutorBaselineCollectionManifest,
  generationSpec: TutorGenerationSpec | undefined,
): void {
  assertValidTutorResponseCorpus({ corpus: resumeCorpus, dataset });
  if (
    resumeCorpus.corpusId !== manifest.corpusId ||
    resumeCorpus.corpusVersion !== manifest.corpusVersion ||
    resumeCorpus.datasetId !== dataset.id ||
    resumeCorpus.datasetVersion !== dataset.version ||
    resumeCorpus.runsPerCase !== manifest.runsPerCase ||
    resumeCorpus.provenance !== "recorded_model" ||
    !sameTutorDescriptor(resumeCorpus.tutor, manifest.tutor) ||
    !tutorGenerationSpecsEqual(resumeCorpus.generationSpec, generationSpec)
  ) {
    throw new BenchmarkConfigurationError("tutor_response_corpus_invalid");
  }
}

function canonicalExecutionFailureCode(
  error: unknown,
): TutorBaselineCollectionFailureCode {
  const code = typeof error === "object" && error !== null &&
    "code" in error && typeof error.code === "string"
    ? error.code
    : undefined;
  switch (code) {
    case "timeout":
    case "transport_error":
    case "unauthorized":
    case "forbidden":
    case "rate_limited":
    case "server_error":
    case "http_error":
    case "unsupported_generation_control":
    case "invalid_json":
    case "invalid_response":
    case "output_truncated":
      return `execution_${code}`;
    default:
      return "execution_failed";
  }
}

/**
 * Shared evidence assembly for the two explicit collection modes. The
 * execution callback is the only mode-specific boundary; all corpus identity,
 * sanitization, coverage, and failure behavior stays in one implementation.
 */
export async function collectTutorEvidence(
  options: CollectTutorEvidenceOptions,
): Promise<TutorBaselineCollectionResult> {
  const dataset = parseTutorEvalDataset(options.dataset);
  const selectedCases = orderedCases(dataset, options.selectedCases);
  const generationSpec = options.generationSpec === undefined
    ? undefined
    : parseTutorGenerationSpec(options.generationSpec);
  const runsPerCase = options.runsPerCase ?? 1;
  const configuredOptions = generationSpec === undefined
    ? options
    : { ...options, generationSpec };
  assertCollectionConfiguration(configuredOptions, runsPerCase);
  const manifest = manifestFor(configuredOptions, dataset, generationSpec, runsPerCase);
  if (options.resumeCorpus !== undefined) {
    assertResumeCorpusMatchesCollection(
      options.resumeCorpus,
      dataset,
      manifest,
      generationSpec,
    );
  }
  const plannedTutorCallCount = selectedCases.length * runsPerCase;
  const now = options.now ?? (() => new Date());
  const startedAt = now().toISOString();
  const responses: TutorCandidateResponse[] = options.resumeCorpus === undefined
    ? []
    : [...options.resumeCorpus.responses];
  const existingResponseKeys = new Set(
    responses.map((response) => `${response.caseId}\u0000${response.runIndex}`),
  );
  const failures: TutorBaselineCollectionFailure[] = [];
  let executedTutorCallCount = 0;
  let reusedResponseCount = 0;

  for (const tutorEvalCase of selectedCases) {
    for (let runIndex = 1; runIndex <= runsPerCase; runIndex += 1) {
      const responseKey = `${tutorEvalCase.id}\u0000${runIndex}`;
      if (existingResponseKeys.has(responseKey)) {
        reusedResponseCount += 1;
        continue;
      }
      executedTutorCallCount += 1;
      let output: unknown;
      try {
        output = await options.executeResponse(tutorEvalCase, runIndex);
      } catch (error) {
        failures.push({
          caseId: tutorEvalCase.id,
          caseVersion: tutorEvalCase.version,
          runIndex,
          code: options.collectionMode === "canonical_model"
            ? canonicalExecutionFailureCode(error)
            : "tutor_call_failed",
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
          ...(generationSpec === undefined ? {} : { generationSpec }),
          runIndex,
        }),
        caseId: tutorEvalCase.id,
        caseVersion: tutorEvalCase.version,
        runIndex,
        responseText: output.text,
        provenance: options.provenance,
        ...(metrics === undefined ? {} : { metrics }),
      });
      existingResponseKeys.add(responseKey);
    }
  }

  responses.sort((left, right) =>
    `${left.caseId}\u0000${left.runIndex}`.localeCompare(
      `${right.caseId}\u0000${right.runIndex}`,
    ),
  );

  const finishedAt = now().toISOString();
  const coverage: TutorResponseCorpusCoverage =
    failures.length === 0 &&
    responses.length === plannedTutorCallCount &&
    isFullSelection(dataset, selectedCases)
      ? "full"
      : "partial";
  const report: TutorBaselineCollectionReport = {
    schemaVersion: TUTOR_BASELINE_COLLECTION_REPORT_SCHEMA_VERSION,
    collectionMode: options.collectionMode,
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
    ...(options.resumeCorpus === undefined ? {} : { reusedResponseCount }),
    executedTutorCallCount,
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
    ...(generationSpec === undefined ? {} : { generationSpec }),
    tutor: manifest.tutor,
    responses,
  });
  assertValidTutorResponseCorpus({ corpus, dataset });
  return { corpus, report };
}

/**
 * Product / external Tutor collection. It deliberately has no generation
 * specification because the transport only executes TutorTurnInput.
 */
export async function collectTutorBaseline(
  options: CollectTutorBaselineOptions,
): Promise<TutorBaselineCollectionResult> {
  const legacyGenerationSpec = (options as CollectTutorBaselineOptions & {
    readonly generationSpec?: TutorGenerationSpec;
  }).generationSpec;
  if (legacyGenerationSpec !== undefined) {
    throw new BenchmarkConfigurationError("tutor_response_corpus_invalid");
  }
  return collectTutorEvidence({
    dataset: options.dataset,
    ...(options.selectedCases === undefined ? {} : { selectedCases: options.selectedCases }),
    tutorDescriptor: options.tutorDescriptor,
    provenance: options.provenance,
    ...(options.runsPerCase === undefined ? {} : { runsPerCase: options.runsPerCase }),
    ...(options.baselineId === undefined ? {} : { baselineId: options.baselineId }),
    corpusId: options.corpusId,
    ...(options.corpusVersion === undefined ? {} : { corpusVersion: options.corpusVersion }),
    ...(options.transport === undefined ? {} : { transport: options.transport }),
    ...(options.outputPath === undefined ? {} : { outputPath: options.outputPath }),
    ...(options.now === undefined ? {} : { now: options.now }),
    collectionMode: "product_tutor",
    executeResponse: (tutorEvalCase, runIndex) =>
      options.tutor.respond(toTutorTurnInput(tutorEvalCase, runIndex)),
  });
}
