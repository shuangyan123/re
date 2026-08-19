import type {
  TutorEvalCaseRunResult,
  TutorEvalJudgeDescriptor,
  TutorEvalTokenUsage,
  TutorResponseCorpusEvaluationResult,
} from "../contracts/index.js";
import type { TutorEvalDataset } from "../contracts/tutor-eval.js";
import type { TutorResponseCorpus } from "../contracts/tutor-response-corpus.js";
import {
  runTutorResponseCorpus,
  type TutorEvalJudgeRunOptions,
} from "../runner/index.js";

export const JUDGE_CANDIDATE_COMPARISON_ID = "judge-candidate-comparison" as const;
export const JUDGE_CANDIDATE_COMPARISON_VERSION = "0.1.0" as const;

export type JudgeCandidateComparisonJsonValue = string | number | boolean | null;
export type JudgeCandidateComparisonGenerationProfile = Readonly<
  Record<string, JudgeCandidateComparisonJsonValue>
>;

export interface JudgeCandidateComparisonTransportProfile {
  readonly baseUrl: string;
  readonly endpointPath: string;
}

export interface JudgeCandidateComparisonExecutionProfile {
  readonly timeoutMs: number;
  readonly maxAttempts: number;
}

export interface JudgeCandidateComparisonFixtureObservation {
  readonly fixtureCaseId: string;
  readonly runIndex: number;
  readonly expectedLabel: string;
  readonly observedLabel: string | null;
  readonly status: TutorEvalCaseRunResult["status"];
  readonly answerLeakage: boolean | null;
  readonly insufficientInformation: boolean | null;
  readonly criticalFailures: readonly {
    readonly type: string;
    readonly severity: string;
  }[];
  readonly executionErrorCode: string | null;
  readonly latencyMs: number | null;
  readonly tokenUsage: TutorEvalTokenUsage | null;
}

export interface JudgeCandidateComparisonFixture {
  readonly fixtureId: string;
  readonly fixtureVersion: string;
  readonly fixtureProvenance: string;
  readonly expectedFixtureIds: readonly string[];
  readonly caseIdentity?: {
    readonly caseId: string;
    readonly caseVersion: string;
  };
  readonly buildCorpus: () => TutorResponseCorpus;
  readonly loadDataset: () => Promise<TutorEvalDataset>;
  readonly observeEvaluation: (
    result: TutorResponseCorpusEvaluationResult,
  ) => readonly JudgeCandidateComparisonFixtureObservation[];
}

export interface JudgeCandidateComparisonCandidate {
  readonly id: string;
  readonly provider: string;
  readonly model: string;
  readonly promptId: string;
  readonly promptVersion: string;
  readonly generationProfile: JudgeCandidateComparisonGenerationProfile;
  readonly executionProfile?: JudgeCandidateComparisonExecutionProfile;
  readonly transportProfile?: JudgeCandidateComparisonTransportProfile;
  readonly createJudge: () => TutorEvalJudgeRunOptions | Promise<TutorEvalJudgeRunOptions>;
}

export interface JudgeCandidateComparisonRepetition {
  readonly repetition: number;
  readonly judgeCallCount: number;
  readonly observations: readonly JudgeCandidateComparisonFixtureObservation[];
}

export interface JudgeCandidateComparisonLabelAgreement {
  readonly agreedCount: number;
  readonly totalCount: number;
  readonly share: number;
}

export interface JudgeCandidateComparisonLabelDistribution {
  readonly counts: Readonly<Record<string, number>>;
  readonly unavailableCount: number;
}

export interface JudgeCandidateComparisonAnswerLeakageDistribution {
  readonly trueCount: number;
  readonly falseCount: number;
  readonly unavailableCount: number;
}

export interface JudgeCandidateComparisonCriticalFailureDistribution {
  readonly counts: Readonly<Record<string, number>>;
  readonly unavailableCount: number;
}

export interface JudgeCandidateComparisonLabelStability {
  readonly modalLabel: string | null;
  readonly modalCount: number;
  readonly modalShare: number | null;
  readonly observedCount: number;
  readonly unavailableCount: number;
  readonly unanimous: boolean;
}

export interface JudgeCandidateComparisonAnswerLeakageStability {
  readonly modalLeakage: boolean | null;
  readonly modalCount: number;
  readonly modalShare: number | null;
  readonly observedCount: number;
  readonly unavailableCount: number;
}

export interface JudgeCandidateComparisonTokenUsage {
  readonly inputTokens: number | null;
  readonly outputTokens: number | null;
  readonly totalTokens: number | null;
  readonly inputUnavailableCount: number;
  readonly outputUnavailableCount: number;
  readonly totalUnavailableCount: number;
}

export interface JudgeCandidateComparisonMetrics {
  readonly expectedLabelAgreement: {
    readonly overall: JudgeCandidateComparisonLabelAgreement;
    readonly byFixture: Readonly<
      Record<string, JudgeCandidateComparisonLabelAgreement>
    >;
  };
  readonly exactExpectedRunAgreement: JudgeCandidateComparisonLabelAgreement;
  readonly labelDistribution: Readonly<
    Record<string, JudgeCandidateComparisonLabelDistribution>
  >;
  readonly answerLeakageDistribution: Readonly<
    Record<string, JudgeCandidateComparisonAnswerLeakageDistribution>
  >;
  readonly criticalFailureDistribution: Readonly<
    Record<string, JudgeCandidateComparisonCriticalFailureDistribution>
  >;
  readonly stability: {
    readonly labelByFixture: Readonly<
      Record<string, JudgeCandidateComparisonLabelStability>
    >;
    readonly answerLeakageByFixture: Readonly<
      Record<string, JudgeCandidateComparisonAnswerLeakageStability>
    >;
  };
  /** Count of known fixture observations outside the modal failure signature. */
  readonly criticalFailureDisagreementCount: number;
  readonly insufficientInformation: {
    readonly trueCount: number;
    readonly falseCount: number;
    readonly unavailableCount: number;
  };
  readonly executionErrors: {
    readonly count: number;
    readonly byCode: Readonly<Record<string, number>>;
  };
  readonly latency: {
    readonly perCallMs: readonly (number | null)[];
    readonly meanMs: number | null;
    readonly medianMs: number | null;
    readonly unavailableCount: number;
  };
  readonly tokenUsage: JudgeCandidateComparisonTokenUsage;
  readonly unanimousFixtureCount: number;
  readonly fixtureCount: number;
  readonly callCount: number;
}

export interface JudgeCandidateComparisonCandidateReport {
  readonly candidateId: string;
  readonly provider: string;
  readonly model: string;
  readonly promptId: string;
  readonly promptVersion: string;
  readonly generationProfile: JudgeCandidateComparisonGenerationProfile;
  readonly executionProfile?: JudgeCandidateComparisonExecutionProfile;
  readonly transportProfile?: JudgeCandidateComparisonTransportProfile;
  readonly repetitionCount: number;
  readonly repetitions: readonly JudgeCandidateComparisonRepetition[];
  readonly metrics: JudgeCandidateComparisonMetrics;
}

export interface JudgeCandidateComparisonPairwiseSummary {
  readonly candidateId: string;
  readonly diagnosticAgreement: JudgeCandidateComparisonLabelAgreement;
  readonly exactExpectedRuns: JudgeCandidateComparisonLabelAgreement;
  readonly unanimousFixtures: {
    readonly count: number;
    readonly total: number;
  };
  readonly criticalFailureDisagreementCount: number;
  readonly meanLatencyMs: number | null;
  readonly totalTokens: number | null;
}

export interface JudgeCandidateComparisonReport {
  readonly schemaVersion: 1;
  readonly comparisonId: typeof JUDGE_CANDIDATE_COMPARISON_ID;
  readonly comparisonVersion: typeof JUDGE_CANDIDATE_COMPARISON_VERSION;
  readonly calibrationStatus: "uncalibrated";
  readonly fixture: {
    readonly id: string;
    readonly version: string;
    readonly provenance: string;
    readonly expectedFixtureIds: readonly string[];
    readonly caseIdentity?: {
      readonly caseId: string;
      readonly caseVersion: string;
    };
  };
  readonly datasetId: string;
  readonly datasetVersion: string;
  readonly evaluatorVersion: string | null;
  readonly runsPerCandidate: number;
  readonly plannedJudgeCalls: number;
  readonly judgeCallCount: number;
  readonly candidates: readonly JudgeCandidateComparisonCandidateReport[];
  readonly pairwiseSummary: readonly JudgeCandidateComparisonPairwiseSummary[];
  readonly selectionStatement: "No winner is inferred automatically.";
  readonly limitations: readonly string[];
}

interface InternalCandidateRun {
  readonly repetition: number;
  readonly judgeCallCount: number;
  readonly observations: readonly JudgeCandidateComparisonFixtureObservation[];
  readonly evaluation: TutorResponseCorpusEvaluationResult;
}

interface InternalCandidateResult {
  readonly candidate: JudgeCandidateComparisonCandidate;
  readonly repetitions: readonly InternalCandidateRun[];
}

function ratio(agreedCount: number, totalCount: number): number {
  return totalCount === 0 ? 0 : agreedCount / totalCount;
}

function agreement(
  agreedCount: number,
  totalCount: number,
): JudgeCandidateComparisonLabelAgreement {
  return { agreedCount, totalCount, share: ratio(agreedCount, totalCount) };
}

function increment(counts: Record<string, number>, key: string): void {
  counts[key] = (counts[key] ?? 0) + 1;
}

function mean(values: readonly number[]): number | null {
  if (values.length === 0) {
    return null;
  }
  const total = values.reduce((sum, value) => sum + value, 0);
  return Math.round((total / values.length) * 1_000) / 1_000;
}

function median(values: readonly number[]): number | null {
  if (values.length === 0) {
    return null;
  }
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) {
    return sorted[middle] ?? null;
  }
  const lower = sorted[middle - 1];
  const upper = sorted[middle];
  return lower === undefined || upper === undefined
    ? null
    : Math.round(((lower + upper) / 2) * 1_000) / 1_000;
}

function allObservations(
  repetitions: readonly InternalCandidateRun[],
): readonly JudgeCandidateComparisonFixtureObservation[] {
  return repetitions.flatMap((repetition) => repetition.observations);
}

function observationsForFixture(
  observations: readonly JudgeCandidateComparisonFixtureObservation[],
  fixtureId: string,
): readonly JudgeCandidateComparisonFixtureObservation[] {
  return observations.filter((observation) => observation.fixtureCaseId === fixtureId);
}

function validateObservationSet(
  fixture: JudgeCandidateComparisonFixture,
  observations: readonly JudgeCandidateComparisonFixtureObservation[],
): void {
  if (observations.length !== fixture.expectedFixtureIds.length) {
    throw new Error("Judge candidate comparison fixture observation count is invalid.");
  }
  const expectedIds = new Set(fixture.expectedFixtureIds);
  const actualIds = observations.map((observation) => observation.fixtureCaseId);
  if (
    actualIds.some((fixtureId) => !expectedIds.has(fixtureId)) ||
    new Set(actualIds).size !== actualIds.length ||
    fixture.expectedFixtureIds.some((fixtureId) => !actualIds.includes(fixtureId))
  ) {
    throw new Error("Judge candidate comparison fixture identity is invalid.");
  }
  for (const observation of observations) {
    if (
      observation.expectedLabel.trim().length === 0 ||
      (observation.observedLabel !== null && observation.observedLabel.trim().length === 0) ||
      !Number.isInteger(observation.runIndex) ||
      observation.runIndex < 1
    ) {
      throw new Error("Judge candidate comparison fixture observation is invalid.");
    }
  }
}

function buildLabelAgreement(
  observations: readonly JudgeCandidateComparisonFixtureObservation[],
): JudgeCandidateComparisonLabelAgreement {
  return agreement(
    observations.filter(
      (observation) => observation.observedLabel === observation.expectedLabel,
    ).length,
    observations.length,
  );
}

function buildTokenAggregate(
  observations: readonly JudgeCandidateComparisonFixtureObservation[],
  field: "inputTokens" | "outputTokens" | "totalTokens",
): { readonly value: number | null; readonly unavailableCount: number } {
  const values = observations.map((observation) => observation.tokenUsage?.[field] ?? null);
  const unavailableCount = values.filter((value) => value === null).length;
  return {
    value: unavailableCount === 0
      ? values.reduce<number>((sum, value) => sum + (value ?? 0), 0)
      : null,
    unavailableCount,
  };
}

interface Mode<T> {
  readonly value: T | null;
  readonly count: number;
  readonly observedCount: number;
  readonly unavailableCount: number;
  readonly share: number | null;
}

function mode<T extends string | boolean>(
  values: readonly (T | null)[],
): Mode<T> {
  const counts = new Map<T, number>();
  let unavailableCount = 0;
  for (const value of values) {
    if (value === null) {
      unavailableCount += 1;
      continue;
    }
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }

  let modalValue: T | null = null;
  let modalCount = 0;
  for (const value of values) {
    if (value === null || modalValue === value) {
      continue;
    }
    const valueCount = counts.get(value) ?? 0;
    if (valueCount > modalCount) {
      modalValue = value;
      modalCount = valueCount;
    }
  }
  const observedCount = values.length - unavailableCount;
  return {
    value: modalValue,
    count: modalCount,
    observedCount,
    unavailableCount,
    share: observedCount === 0 ? null : ratio(modalCount, observedCount),
  };
}

function criticalFailureSignature(
  observation: JudgeCandidateComparisonFixtureObservation,
): string | null {
  if (observation.status === "error") {
    return null;
  }
  const failures = [...observation.criticalFailures]
    .sort((left, right) => {
      const leftValue = `${left.type}/${left.severity}`;
      const rightValue = `${right.type}/${right.severity}`;
      return leftValue < rightValue ? -1 : leftValue > rightValue ? 1 : 0;
    })
    .map((failure) => `${failure.type}/${failure.severity}`);
  return failures.length === 0 ? "none" : failures.join(",");
}

function buildCriticalFailureDistribution(
  observations: readonly JudgeCandidateComparisonFixtureObservation[],
): JudgeCandidateComparisonCriticalFailureDistribution {
  const counts: Record<string, number> = {};
  let unavailableCount = 0;
  for (const observation of observations) {
    const signature = criticalFailureSignature(observation);
    if (signature === null) {
      unavailableCount += 1;
    } else {
      increment(counts, signature);
    }
  }
  return { counts, unavailableCount };
}

function buildCriticalFailureDisagreementCount(
  fixtureIds: readonly string[],
  observations: readonly JudgeCandidateComparisonFixtureObservation[],
): number {
  let disagreements = 0;
  for (const fixtureId of fixtureIds) {
    const signatures = observationsForFixture(observations, fixtureId)
      .map(criticalFailureSignature)
      .filter((signature): signature is string => signature !== null);
    const counts: Record<string, number> = {};
    for (const signature of signatures) {
      increment(counts, signature);
    }
    const modalCount = Object.values(counts).reduce(
      (maximum, count) => Math.max(maximum, count),
      0,
    );
    disagreements += signatures.length - modalCount;
  }
  return disagreements;
}

function buildCandidateMetrics(
  fixture: JudgeCandidateComparisonFixture,
  repetitions: readonly InternalCandidateRun[],
): JudgeCandidateComparisonMetrics {
  const observations = allObservations(repetitions);
  const expectedLabelAgreementByFixture: Record<
    string,
    JudgeCandidateComparisonLabelAgreement
  > = {};
  const labelDistribution: Record<
    string,
    JudgeCandidateComparisonLabelDistribution
  > = {};
  const answerLeakageDistribution: Record<
    string,
    JudgeCandidateComparisonAnswerLeakageDistribution
  > = {};
  const criticalFailureDistribution: Record<
    string,
    JudgeCandidateComparisonCriticalFailureDistribution
  > = {};
  const labelStability: Record<string, JudgeCandidateComparisonLabelStability> = {};
  const answerLeakageStability: Record<
    string,
    JudgeCandidateComparisonAnswerLeakageStability
  > = {};
  let unanimousFixtureCount = 0;

  for (const fixtureId of fixture.expectedFixtureIds) {
    const fixtureObservations = observationsForFixture(observations, fixtureId);
    expectedLabelAgreementByFixture[fixtureId] = buildLabelAgreement(fixtureObservations);
    const labelMode = mode(
      fixtureObservations.map((observation) => observation.observedLabel),
    );
    labelStability[fixtureId] = {
      modalLabel: labelMode.value,
      modalCount: labelMode.count,
      modalShare: labelMode.share,
      observedCount: labelMode.observedCount,
      unavailableCount: labelMode.unavailableCount,
      unanimous:
        labelMode.unavailableCount === 0 &&
        labelMode.observedCount > 0 &&
        labelMode.count === labelMode.observedCount,
    };

    const labels: Record<string, number> = {};
    let unavailableLabels = 0;
    let trueLeakage = 0;
    let falseLeakage = 0;
    let unavailableLeakage = 0;
    for (const observation of fixtureObservations) {
      if (observation.observedLabel === null) {
        unavailableLabels += 1;
      } else {
        increment(labels, observation.observedLabel);
      }
      if (observation.answerLeakage === true) {
        trueLeakage += 1;
      } else if (observation.answerLeakage === false) {
        falseLeakage += 1;
      } else {
        unavailableLeakage += 1;
      }
    }
    labelDistribution[fixtureId] = {
      counts: labels,
      unavailableCount: unavailableLabels,
    };
    answerLeakageDistribution[fixtureId] = {
      trueCount: trueLeakage,
      falseCount: falseLeakage,
      unavailableCount: unavailableLeakage,
    };
    const leakageMode = mode(
      fixtureObservations.map((observation) => observation.answerLeakage),
    );
    answerLeakageStability[fixtureId] = {
      modalLeakage: leakageMode.value,
      modalCount: leakageMode.count,
      modalShare: leakageMode.share,
      observedCount: leakageMode.observedCount,
      unavailableCount: leakageMode.unavailableCount,
    };
    criticalFailureDistribution[fixtureId] =
      buildCriticalFailureDistribution(fixtureObservations);

    if (labelStability[fixtureId].unanimous) {
      unanimousFixtureCount += 1;
    }
  }

  const expectedLabelAgreementOverall = buildLabelAgreement(observations);
  const exactExpectedRunCount = repetitions.filter((repetition) =>
    repetition.observations.every(
      (observation) => observation.observedLabel === observation.expectedLabel,
    )
  ).length;
  const executionErrorsByCode: Record<string, number> = {};
  let executionErrorCount = 0;
  let trueInsufficientInformation = 0;
  let falseInsufficientInformation = 0;
  let unavailableInsufficientInformation = 0;
  for (const observation of observations) {
    if (observation.status === "error") {
      executionErrorCount += 1;
      increment(executionErrorsByCode, observation.executionErrorCode ?? "evaluation_error");
    }
    if (observation.insufficientInformation === true) {
      trueInsufficientInformation += 1;
    } else if (observation.insufficientInformation === false) {
      falseInsufficientInformation += 1;
    } else {
      unavailableInsufficientInformation += 1;
    }
  }
  const perCallMs = observations.map((observation) => observation.latencyMs);
  const knownLatency = perCallMs.filter((value): value is number => value !== null);
  const inputTokens = buildTokenAggregate(observations, "inputTokens");
  const outputTokens = buildTokenAggregate(observations, "outputTokens");
  const totalTokens = buildTokenAggregate(observations, "totalTokens");

  return {
    expectedLabelAgreement: {
      overall: expectedLabelAgreementOverall,
      byFixture: expectedLabelAgreementByFixture,
    },
    exactExpectedRunAgreement: agreement(exactExpectedRunCount, repetitions.length),
    labelDistribution,
    answerLeakageDistribution,
    criticalFailureDistribution,
    stability: {
      labelByFixture: labelStability,
      answerLeakageByFixture: answerLeakageStability,
    },
    criticalFailureDisagreementCount: buildCriticalFailureDisagreementCount(
      fixture.expectedFixtureIds,
      observations,
    ),
    insufficientInformation: {
      trueCount: trueInsufficientInformation,
      falseCount: falseInsufficientInformation,
      unavailableCount: unavailableInsufficientInformation,
    },
    executionErrors: {
      count: executionErrorCount,
      byCode: executionErrorsByCode,
    },
    latency: {
      perCallMs,
      meanMs: mean(knownLatency),
      medianMs: median(knownLatency),
      unavailableCount: perCallMs.length - knownLatency.length,
    },
    tokenUsage: {
      inputTokens: inputTokens.value,
      outputTokens: outputTokens.value,
      totalTokens: totalTokens.value,
      inputUnavailableCount: inputTokens.unavailableCount,
      outputUnavailableCount: outputTokens.unavailableCount,
      totalUnavailableCount: totalTokens.unavailableCount,
    },
    unanimousFixtureCount,
    fixtureCount: fixture.expectedFixtureIds.length,
    callCount: repetitions.reduce((sum, repetition) => sum + repetition.judgeCallCount, 0),
  };
}

function candidateReport(
  fixture: JudgeCandidateComparisonFixture,
  result: InternalCandidateResult,
): JudgeCandidateComparisonCandidateReport {
  const metrics = buildCandidateMetrics(fixture, result.repetitions);
  const repetitions = result.repetitions.map((repetition) => ({
    repetition: repetition.repetition,
    judgeCallCount: repetition.judgeCallCount,
    observations: repetition.observations,
  }));
  return {
    candidateId: result.candidate.id,
    provider: result.candidate.provider,
    model: result.candidate.model,
    promptId: result.candidate.promptId,
    promptVersion: result.candidate.promptVersion,
    generationProfile: result.candidate.generationProfile,
    ...(result.candidate.executionProfile === undefined
      ? {}
      : { executionProfile: result.candidate.executionProfile }),
    ...(result.candidate.transportProfile === undefined
      ? {}
      : { transportProfile: result.candidate.transportProfile }),
    repetitionCount: result.repetitions.length,
    repetitions,
    metrics,
  };
}

function pairwiseSummary(
  report: JudgeCandidateComparisonCandidateReport,
): JudgeCandidateComparisonPairwiseSummary {
  return {
    candidateId: report.candidateId,
    diagnosticAgreement: report.metrics.expectedLabelAgreement.overall,
    exactExpectedRuns: report.metrics.exactExpectedRunAgreement,
    unanimousFixtures: {
      count: report.metrics.unanimousFixtureCount,
      total: report.metrics.fixtureCount,
    },
    criticalFailureDisagreementCount: report.metrics.criticalFailureDisagreementCount,
    meanLatencyMs: report.metrics.latency.meanMs,
    totalTokens: report.metrics.tokenUsage.totalTokens,
  };
}

function assertCandidateIdentity(
  candidate: JudgeCandidateComparisonCandidate,
  judge: TutorEvalJudgeDescriptor,
): void {
  if (
    candidate.id.trim().length === 0 ||
    candidate.provider.trim().length === 0 ||
    candidate.model.trim().length === 0 ||
    candidate.promptId.trim().length === 0 ||
    candidate.promptVersion.trim().length === 0 ||
    judge.provider !== candidate.provider ||
    judge.model !== candidate.model ||
    judge.promptId !== candidate.promptId ||
    judge.promptVersion !== candidate.promptVersion
  ) {
    throw new Error(`Judge candidate identity is invalid: ${candidate.id}`);
  }
}

export async function runJudgeCandidateComparison(options: {
  readonly fixture: JudgeCandidateComparisonFixture;
  readonly candidates: readonly JudgeCandidateComparisonCandidate[];
  readonly runsPerCandidate?: number;
}): Promise<JudgeCandidateComparisonReport> {
  const runsPerCandidate = options.runsPerCandidate ?? 1;
  if (!Number.isInteger(runsPerCandidate) || runsPerCandidate < 1) {
    throw new Error("runsPerCandidate must be a positive integer.");
  }
  if (
    options.candidates.length === 0 ||
    new Set(options.candidates.map((candidate) => candidate.id)).size !== options.candidates.length
  ) {
    throw new Error("At least one unique Judge candidate is required.");
  }

  const fixture = options.fixture;
  const corpus = fixture.buildCorpus();
  const dataset = await fixture.loadDataset();
  const candidateResults: InternalCandidateResult[] = [];
  let datasetId = dataset.id;
  let datasetVersion = dataset.version;
  let evaluatorVersion: string | null = null;
  let judgeCallCount = 0;

  for (const candidate of options.candidates) {
    const judge = await candidate.createJudge();
    assertCandidateIdentity(candidate, judge);
    const repetitions: InternalCandidateRun[] = [];
    for (let repetition = 1; repetition <= runsPerCandidate; repetition += 1) {
      let calls = 0;
      const evaluation = await runTutorResponseCorpus({
        corpus,
        dataset,
        judge,
        onJudgeCall: () => {
          calls += 1;
        },
        runId: `${JUDGE_CANDIDATE_COMPARISON_ID}-${candidate.id}-${repetition}`,
      });
      const observations = fixture.observeEvaluation(evaluation);
      validateObservationSet(fixture, observations);
      repetitions.push({
        repetition,
        judgeCallCount: calls,
        observations,
        evaluation,
      });
      datasetId = evaluation.datasetId;
      datasetVersion = evaluation.datasetVersion;
      evaluatorVersion = evaluation.evaluation.evaluatorVersion ?? null;
      judgeCallCount += calls;
    }
    candidateResults.push({ candidate, repetitions });
  }

  const reports = candidateResults.map((result) => candidateReport(fixture, result));
  return {
    schemaVersion: 1,
    comparisonId: JUDGE_CANDIDATE_COMPARISON_ID,
    comparisonVersion: JUDGE_CANDIDATE_COMPARISON_VERSION,
    calibrationStatus: "uncalibrated",
    fixture: {
      id: fixture.fixtureId,
      version: fixture.fixtureVersion,
      provenance: fixture.fixtureProvenance,
      expectedFixtureIds: fixture.expectedFixtureIds,
      ...(fixture.caseIdentity === undefined ? {} : { caseIdentity: fixture.caseIdentity }),
    },
    datasetId,
    datasetVersion,
    evaluatorVersion,
    runsPerCandidate,
    plannedJudgeCalls:
      options.candidates.length * fixture.expectedFixtureIds.length * runsPerCandidate,
    judgeCallCount,
    candidates: reports,
    pairwiseSummary: reports.map(pairwiseSummary),
    selectionStatement: "No winner is inferred automatically.",
    limitations: [
      "Developer-authored diagnostic expectations are not human calibration gold.",
      "Expected-label agreement is descriptive agreement with this fixed probe, not Judge accuracy or calibration.",
      "Run-to-run stability and critical-failure distributions are measured only for the selected fixture and repetition count.",
      "A same-provider Tutor and Judge can share correlated bias; higher agreement does not establish independent reliability.",
      "Token and latency fields are provider-reported or observed measurements; unavailable fields are not estimated.",
    ],
  };
}

function label(value: string | null): string {
  return value ?? "n/a";
}

export function formatJudgeCandidateComparisonReport(
  report: JudgeCandidateComparisonReport,
): string {
  const lines = [
    "Judge candidate comparison report",
    `Fixture: ${report.fixture.id}@${report.fixture.version}`,
    `Dataset: ${report.datasetId}@${report.datasetVersion}`,
    `Evaluator: ${report.evaluatorVersion ?? "n/a"}`,
    `Calibration: ${report.calibrationStatus}`,
    `Runs per candidate: ${report.runsPerCandidate}`,
    `Judge calls: ${report.judgeCallCount}/${report.plannedJudgeCalls}`,
    "",
  ];
  for (const candidate of report.candidates) {
    lines.push(
      `${candidate.candidateId} (${candidate.provider}/${candidate.model})`,
      `  Prompt: ${candidate.promptId}@${candidate.promptVersion}`,
    );
    for (const repetition of candidate.repetitions) {
      lines.push(
        `  repetition ${repetition.repetition}: ${repetition.observations
          .map((observation) => `${observation.fixtureCaseId} ${label(observation.observedLabel)}`)
          .join(", ")}`,
      );
    }
    for (const fixtureId of report.fixture.expectedFixtureIds) {
      const labelStability = candidate.metrics.stability.labelByFixture[fixtureId];
      const leakageStability = candidate.metrics.stability.answerLeakageByFixture[fixtureId];
      lines.push(
        `  ${fixtureId} modal label: ${labelStability?.modalLabel ?? "n/a"} (${labelStability?.modalShare === null || labelStability === undefined ? "unavailable" : labelStability.modalShare.toFixed(3)}; ${labelStability?.unanimous ? "unanimous" : "not unanimous"})`,
        `  ${fixtureId} modal leakage: ${leakageStability?.modalLeakage ?? "n/a"} (${leakageStability?.modalShare === null || leakageStability === undefined ? "unavailable" : leakageStability.modalShare.toFixed(3)})`,
      );
    }
    lines.push(
      `  expected-label agreement: ${candidate.metrics.expectedLabelAgreement.overall.agreedCount}/${candidate.metrics.expectedLabelAgreement.overall.totalCount}`,
      `  exact expected runs: ${candidate.metrics.exactExpectedRunAgreement.agreedCount}/${candidate.metrics.exactExpectedRunAgreement.totalCount}`,
      `  unanimous fixtures: ${candidate.metrics.unanimousFixtureCount}/${candidate.metrics.fixtureCount}`,
      `  critical-failure disagreement count: ${candidate.metrics.criticalFailureDisagreementCount}`,
      `  mean/median latency: ${candidate.metrics.latency.meanMs ?? "unavailable"}/${candidate.metrics.latency.medianMs ?? "unavailable"} ms`,
      `  total tokens: ${candidate.metrics.tokenUsage.totalTokens ?? "unavailable"}`,
      `  execution errors: ${candidate.metrics.executionErrors.count}`,
      "",
    );
  }
  lines.push(
    "Pairwise summary:",
    ...report.pairwiseSummary.map((summary) =>
      `  ${summary.candidateId}: diagnostic agreement ${summary.diagnosticAgreement.agreedCount}/${summary.diagnosticAgreement.totalCount}; exact expected runs ${summary.exactExpectedRuns.agreedCount}/${summary.exactExpectedRuns.totalCount}; unanimous fixtures ${summary.unanimousFixtures.count}/${summary.unanimousFixtures.total}; critical-failure disagreements ${summary.criticalFailureDisagreementCount}; mean latency ${summary.meanLatencyMs ?? "unavailable"} ms; total tokens ${summary.totalTokens ?? "unavailable"}`,
    ),
    report.selectionStatement,
  );
  return lines.join("\n");
}
