import {
  TUTOR_EVAL_CATEGORIES,
  type DisclosurePolicy,
  type TutorConversationMessage,
  type TutorEvalCase,
  type TutorEvalCategory,
  type TutorEvalDataset,
  type TutorEvalDifficulty,
  type TutorEvalStudentProfile,
} from "../contracts/index.js";
import {
  isTutorCaseLocale,
  resolveTutorCaseLocale,
  type TutorCaseLocale,
} from "../contracts/index.js";
import { buildTutorEvalCoverageReport, type TutorEvalCoverageReport } from "./coverage.js";

export const TUTOR_EVAL_PUBLIC_CASE_SCHEMA_VERSION = 1 as const;
export const PUBLIC_BENCHMARK_ARTIFACT_SCHEMA_VERSION = 1 as const;
export const PUBLIC_BENCHMARK_VERSION = "0.1" as const;
export const PUBLIC_BENCHMARK_STATUS = "developer-preview" as const;

export const PUBLIC_BENCHMARK_SCORE_DIMENSIONS: readonly TutorEvalCategory[] = [
  ...TUTOR_EVAL_CATEGORIES,
] as const;

export const PUBLIC_BENCHMARK_OPERATIONAL_DIMENSIONS = [
  "criticalFailureRate",
  "answerLeakageRate",
  "latencyMs",
  "tokens",
  "cost",
] as const;

export const PUBLIC_BENCHMARK_GENERATION_TRACEABILITY_FIELDS = [
  "datasetVersion",
  "generationSpecId",
  "generationSpecVersion",
  "promptVersion",
] as const;

export interface TutorEvalPublicStudentProfile {
  readonly knownConcepts?: readonly string[];
  readonly level?: string;
  readonly goal?: string;
}

export interface TutorEvalPublicCase {
  readonly schemaVersion: typeof TUTOR_EVAL_PUBLIC_CASE_SCHEMA_VERSION;
  readonly id: string;
  readonly version: string;
  /** Optional for old public artifacts; new serialization always includes it. */
  readonly locale?: TutorCaseLocale;
  readonly metadata: {
    readonly subject: string;
    readonly topic: string;
    readonly difficulty?: TutorEvalDifficulty | string | number;
    readonly tags?: readonly string[];
    readonly taxonomyVersion?: string;
    readonly learningTask?: string;
    readonly studentState?: string;
    readonly capabilityTags?: readonly string[];
  };
  readonly tutorInput: {
    readonly learningObjective: string;
    readonly studentProfile?: TutorEvalPublicStudentProfile;
    readonly conversationHistory?: readonly TutorConversationMessage[];
    readonly studentMessage: string;
    readonly problemContext?: string;
  };
  /**
   * Development-only metadata is explicitly opt-in. Hidden challenge cases
   * must be serialized with the default options so evaluator annotations stay
   * outside the public artifact.
   */
  readonly disclosurePolicy?: DisclosurePolicy;
  /** Authored grouping for audit/reporting; not a scientific equivalence claim. */
  readonly crossLocaleGroupId?: string;
  readonly adaptationPairId?: string;
  readonly adaptationVariant?: string;
}

export interface TutorEvalPublicCaseOptions {
  /**
   * The checked-in 0.2A dataset is a synthetic public development set. This
   * option exposes only its documented public metadata, never its rubric or
   * answer annotations. It defaults to false for fail-closed serialization.
   */
  readonly includeDevelopmentMetadata?: boolean;
}

export interface PublicBenchmarkDatasetSummary {
  readonly id: string;
  readonly version: string;
  readonly caseCount: number;
  readonly rubricCount: number;
  readonly subjectCount: number;
  readonly capabilityCount: number;
  readonly disclosurePolicyCount: number;
  readonly counterfactualPairCount: number;
  readonly crossLocaleGroupCount: number;
}

export interface PublicBenchmarkArtifact {
  readonly schemaVersion: typeof PUBLIC_BENCHMARK_ARTIFACT_SCHEMA_VERSION;
  readonly benchmarkId: "tutor-benchmark";
  readonly benchmarkVersion: typeof PUBLIC_BENCHMARK_VERSION;
  readonly status: typeof PUBLIC_BENCHMARK_STATUS;
  readonly statusLabel: "Developer Preview";
  readonly notice: string;
  readonly dataset: PublicBenchmarkDatasetSummary;
  readonly dimensions: {
    readonly score: readonly TutorEvalCategory[];
    readonly operational: readonly string[];
  };
  readonly calibration: {
    readonly infrastructure: "available";
    readonly independentHumanCalibration: "not_completed";
    readonly judgeVsHumanValidation: "not_completed";
    readonly statisticalValidation: "not_completed";
  };
  readonly coverage: TutorEvalCoverageReport;
}

export interface PublicCaseArtifact {
  readonly schemaVersion: typeof PUBLIC_BENCHMARK_ARTIFACT_SCHEMA_VERSION;
  readonly datasetId: string;
  readonly datasetVersion: string;
  readonly cases: readonly TutorEvalPublicCase[];
}

export interface PublicModelSummary {
  readonly id: string;
  readonly model: string;
  readonly provider: string;
  readonly modelVersion: string;
}

export interface PublicModelArtifact {
  readonly schemaVersion: typeof PUBLIC_BENCHMARK_ARTIFACT_SCHEMA_VERSION;
  readonly available: false;
  readonly notice: "No calibrated public model runs yet.";
  readonly fields: readonly string[];
  readonly entries: readonly PublicModelSummary[];
}

export interface PublicTrialSummary {
  readonly id: string;
  readonly modelId: string;
  readonly caseId: string;
  readonly runIndex: number;
}

export interface PublicTrialArtifact {
  readonly schemaVersion: typeof PUBLIC_BENCHMARK_ARTIFACT_SCHEMA_VERSION;
  readonly available: false;
  readonly notice: "No public model trials available yet.";
  readonly fields: readonly string[];
  readonly entries: readonly PublicTrialSummary[];
}

export interface PublicBenchmarkArtifacts {
  readonly benchmark: PublicBenchmarkArtifact;
  readonly cases: PublicCaseArtifact;
  readonly models: PublicModelArtifact;
  readonly trials: PublicTrialArtifact;
}

export class PublicBenchmarkArtifactError extends Error {
  readonly code = "public_artifact_invalid" as const;

  constructor() {
    super("Public benchmark artifact is invalid.");
    this.name = "PublicBenchmarkArtifactError";
  }
}

function copyStudentProfile(
  profile: TutorEvalStudentProfile | undefined,
): TutorEvalPublicStudentProfile | undefined {
  if (profile === undefined) {
    return undefined;
  }
  return {
    ...(profile.knownConcepts === undefined
      ? {}
      : { knownConcepts: [...profile.knownConcepts] }),
    ...(profile.level === undefined ? {} : { level: profile.level }),
    ...(profile.goal === undefined ? {} : { goal: profile.goal }),
  };
}

function copyConversation(
  messages: readonly TutorConversationMessage[] | undefined,
): readonly TutorConversationMessage[] | undefined {
  return messages === undefined
    ? undefined
    : messages.map((message) => ({ role: message.role, text: message.text }));
}

/**
 * Converts an internal case into the smallest public case contract. The
 * evaluatorOnly object is never spread or copied, which makes adding a UI
 * field unable to expose rubrics or answer annotations accidentally.
 */
export function toPublicTutorEvalCase(
  tutorEvalCase: TutorEvalCase,
  options: TutorEvalPublicCaseOptions = {},
): TutorEvalPublicCase {
  const metadata = tutorEvalCase.metadata;
  const tutorInput = tutorEvalCase.tutorInput;
  const includeDevelopmentMetadata = options.includeDevelopmentMetadata === true;
  const studentProfile = copyStudentProfile(tutorInput.studentProfile);
  const conversationHistory = copyConversation(tutorInput.conversationHistory);
  return {
    schemaVersion: TUTOR_EVAL_PUBLIC_CASE_SCHEMA_VERSION,
    id: tutorEvalCase.id,
    version: tutorEvalCase.version,
    locale: resolveTutorCaseLocale(tutorEvalCase.locale),
    metadata: {
      subject: metadata.subject,
      topic: metadata.topic,
      ...(metadata.difficulty === undefined ? {} : { difficulty: metadata.difficulty }),
      ...(metadata.tags === undefined ? {} : { tags: [...metadata.tags] }),
      ...(metadata.taxonomyVersion === undefined
        ? {}
        : { taxonomyVersion: metadata.taxonomyVersion }),
      ...(metadata.learningTask === undefined
        ? {}
        : { learningTask: metadata.learningTask }),
      ...(metadata.studentState === undefined
        ? {}
        : { studentState: metadata.studentState }),
      ...(metadata.capabilityTags === undefined
        ? {}
        : { capabilityTags: [...metadata.capabilityTags] }),
    },
    tutorInput: {
      learningObjective: tutorInput.learningObjective,
      ...(studentProfile === undefined ? {} : { studentProfile }),
      ...(conversationHistory === undefined ? {} : { conversationHistory }),
      studentMessage: tutorInput.studentMessage,
      ...(tutorInput.problemContext === undefined
        ? {}
        : { problemContext: tutorInput.problemContext }),
    },
    ...(includeDevelopmentMetadata
      ? {
          disclosurePolicy: tutorEvalCase.evaluatorOnly.disclosurePolicy,
          ...(tutorEvalCase.adaptationPairId === undefined
            ? {}
            : { adaptationPairId: tutorEvalCase.adaptationPairId }),
          ...(tutorEvalCase.adaptationVariant === undefined
            ? {}
            : { adaptationVariant: tutorEvalCase.adaptationVariant }),
        }
      : {}),
    ...(tutorEvalCase.crossLocaleGroupId === undefined
      ? {}
      : { crossLocaleGroupId: tutorEvalCase.crossLocaleGroupId }),
  };
}

function buildDatasetSummary(
  dataset: TutorEvalDataset,
  coverage: TutorEvalCoverageReport,
): PublicBenchmarkDatasetSummary {
  return {
    id: dataset.id,
    version: dataset.version,
    caseCount: coverage.caseCount,
    rubricCount: coverage.rubricCount,
    subjectCount: Object.keys(coverage.casesBySubject).length,
    capabilityCount: Object.keys(coverage.casesByCapabilityTag).length,
    disclosurePolicyCount: Object.keys(coverage.casesByDisclosurePolicy).filter(
      (policy) => coverage.casesByDisclosurePolicy[policy as DisclosurePolicy] > 0,
    ).length,
    counterfactualPairCount: coverage.counterfactualPairCount,
    crossLocaleGroupCount: coverage.crossLocaleGroupCount,
  };
}

/** Builds the four stable, secret-free files consumed by the static website. */
export function buildPublicBenchmarkArtifacts(
  dataset: TutorEvalDataset,
): PublicBenchmarkArtifacts {
  const coverage = buildTutorEvalCoverageReport(dataset);
  const cases = [...dataset.cases]
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((tutorEvalCase) =>
      toPublicTutorEvalCase(tutorEvalCase, { includeDevelopmentMetadata: true }),
    );
  const datasetSummary = buildDatasetSummary(dataset, coverage);
  return {
    benchmark: {
      schemaVersion: PUBLIC_BENCHMARK_ARTIFACT_SCHEMA_VERSION,
      benchmarkId: "tutor-benchmark",
      benchmarkVersion: PUBLIC_BENCHMARK_VERSION,
      status: PUBLIC_BENCHMARK_STATUS,
      statusLabel: "Developer Preview",
      notice:
        "Leaderboard results are preliminary. Human calibration and statistical validation are still in progress.",
      dataset: datasetSummary,
      dimensions: {
        score: [...PUBLIC_BENCHMARK_SCORE_DIMENSIONS],
        operational: [...PUBLIC_BENCHMARK_OPERATIONAL_DIMENSIONS],
      },
      calibration: {
        infrastructure: "available",
        independentHumanCalibration: "not_completed",
        judgeVsHumanValidation: "not_completed",
        statisticalValidation: "not_completed",
      },
      coverage,
    },
    cases: {
      schemaVersion: PUBLIC_BENCHMARK_ARTIFACT_SCHEMA_VERSION,
      datasetId: dataset.id,
      datasetVersion: dataset.version,
      cases,
    },
    models: {
      schemaVersion: PUBLIC_BENCHMARK_ARTIFACT_SCHEMA_VERSION,
      available: false,
      notice: "No calibrated public model runs yet.",
      fields: [
        "rank",
        "model",
        "provider",
        "modelVersion",
        "overallTutorCapabilityScore",
        ...PUBLIC_BENCHMARK_SCORE_DIMENSIONS,
        ...PUBLIC_BENCHMARK_OPERATIONAL_DIMENSIONS,
        ...PUBLIC_BENCHMARK_GENERATION_TRACEABILITY_FIELDS,
        "promptId",
        "promptSha256",
        "maxOutputTokens",
        "runs",
      ],
      entries: [],
    },
    trials: {
      schemaVersion: PUBLIC_BENCHMARK_ARTIFACT_SCHEMA_VERSION,
      available: false,
      notice: "No public model trials available yet.",
      fields: [
        "model",
        "modelVersion",
        ...PUBLIC_BENCHMARK_GENERATION_TRACEABILITY_FIELDS,
        "promptSha256",
        "caseVersion",
        "runIndex",
        "tutorResponse",
        ...PUBLIC_BENCHMARK_SCORE_DIMENSIONS,
        "rubricResults",
        "criticalFailures",
        "answerLeakage",
        "judge",
        "judgePromptVersion",
        "tokens",
        "latency",
        "cost",
      ],
      entries: [],
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOnlyStringArray(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function hasForbiddenPublicKey(value: unknown): boolean {
  const forbiddenKeys = new Set([
    "evaluatorOnly",
    "groundTruth",
    "knownMisconception",
    "misconceptions",
    "rubrics",
    "referenceAnswer",
    "hiddenReasoning",
    "rawProviderPayload",
    "credentials",
    "apiKey",
  ]);
  if (Array.isArray(value)) {
    return value.some(hasForbiddenPublicKey);
  }
  if (!isRecord(value)) {
    return false;
  }
  return Object.entries(value).some(
    ([key, nested]) => forbiddenKeys.has(key) || hasForbiddenPublicKey(nested),
  );
}

function isPublicCase(value: unknown): value is TutorEvalPublicCase {
  if (!isRecord(value) || hasForbiddenPublicKey(value)) {
    return false;
  }
  const metadata = value.metadata;
  const tutorInput = value.tutorInput;
  if (
    value.schemaVersion !== TUTOR_EVAL_PUBLIC_CASE_SCHEMA_VERSION ||
    typeof value.id !== "string" ||
    typeof value.version !== "string" ||
    !isRecord(metadata) ||
    typeof metadata.subject !== "string" ||
    typeof metadata.topic !== "string" ||
    !isRecord(tutorInput) ||
    typeof tutorInput.learningObjective !== "string" ||
    typeof tutorInput.studentMessage !== "string"
  ) {
    return false;
  }
  if (
    (metadata.tags !== undefined && !hasOnlyStringArray(metadata.tags)) ||
    (metadata.capabilityTags !== undefined && !hasOnlyStringArray(metadata.capabilityTags)) ||
    (metadata.taxonomyVersion !== undefined && typeof metadata.taxonomyVersion !== "string") ||
    (metadata.learningTask !== undefined && typeof metadata.learningTask !== "string") ||
    (metadata.studentState !== undefined && typeof metadata.studentState !== "string") ||
    (value.locale !== undefined && !isTutorCaseLocale(value.locale)) ||
    (tutorInput.problemContext !== undefined && typeof tutorInput.problemContext !== "string") ||
    (value.disclosurePolicy !== undefined && typeof value.disclosurePolicy !== "string") ||
    (value.crossLocaleGroupId !== undefined && typeof value.crossLocaleGroupId !== "string") ||
    (value.adaptationPairId !== undefined && typeof value.adaptationPairId !== "string") ||
    (value.adaptationVariant !== undefined && typeof value.adaptationVariant !== "string")
  ) {
    return false;
  }
  return true;
}

function isArtifactHeader(
  value: unknown,
): value is Record<string, unknown> & { readonly schemaVersion: 1 } {
  return isRecord(value) && value.schemaVersion === PUBLIC_BENCHMARK_ARTIFACT_SCHEMA_VERSION;
}

/** Runtime guard used by the browser-facing read layer and artifact tests. */
export function parsePublicBenchmarkArtifacts(value: unknown): PublicBenchmarkArtifacts {
  if (!isRecord(value) || hasForbiddenPublicKey(value)) {
    throw new PublicBenchmarkArtifactError();
  }
  const benchmark = value.benchmark;
  const cases = value.cases;
  const models = value.models;
  const trials = value.trials;
  if (
    !isArtifactHeader(benchmark) ||
    !isRecord(benchmark.dataset) ||
    !isRecord(benchmark.calibration) ||
    !isArtifactHeader(cases) ||
    !isArtifactHeader(models) ||
    !isArtifactHeader(trials) ||
    !Array.isArray(cases.cases) ||
    !cases.cases.every(isPublicCase) ||
    !Array.isArray(models.entries) ||
    models.entries.length !== 0 ||
    !Array.isArray(trials.entries) ||
    trials.entries.length !== 0
  ) {
    throw new PublicBenchmarkArtifactError();
  }
  return value as unknown as PublicBenchmarkArtifacts;
}
