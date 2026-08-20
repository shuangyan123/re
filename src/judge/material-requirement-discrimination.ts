import {
  buildTutorEvalJudgeInput,
  MATERIAL_REQUIREMENT_JUDGE_SCHEMA_VERSION,
  parseMaterialRequirementJudgeInput,
  parseMaterialRequirementJudgeResult,
  TUTOR_EVAL_DATASET_ID,
  TUTOR_EVAL_DATASET_VERSION,
  type MaterialRequirementAssessmentStatus,
  type MaterialRequirementDerivedLabel,
  type MaterialRequirementJudge,
  MaterialRequirementJudgeExecutionError,
  type MaterialRequirementJudgeContext,
  type MaterialRequirementJudgeInput,
  type MaterialRequirementJudgeResult,
  type TutorEvalCase,
  type TutorEvalJudgeMetrics,
  type TutorEvalTokenUsage,
} from "../contracts/index.js";
import { loadTutorEvalDataset } from "../datasets/index.js";
import {
  WORD_CONTEXT_DISCRIMINATION_CASE_ID,
  WORD_CONTEXT_DISCRIMINATION_CASE_VERSION,
  WORD_CONTEXT_DISCRIMINATION_CORRECTNESS_CRITERION,
  WORD_CONTEXT_DISCRIMINATION_FIXTURES,
} from "./word-context-discrimination.js";
import { aggregateMaterialRequirementAssessments } from "./material-requirement-aggregation.js";
import {
  MATERIAL_REQUIREMENT_JUDGE_PROMPT_ID,
  MATERIAL_REQUIREMENT_JUDGE_PROMPT_VERSION,
} from "./material-requirement-prompt.js";

export const MATERIAL_REQUIREMENT_DIAGNOSTIC_ID =
  "judge-material-requirement-discrimination" as const;
export const MATERIAL_REQUIREMENT_DIAGNOSTIC_VERSION = "0.2.0" as const;
export const MATERIAL_REQUIREMENT_FIXTURE_VERSION = "0.1.1" as const;
export const MATERIAL_REQUIREMENT_FIXTURE_PROVENANCE =
  "developer-authored-diagnostic-expectation" as const;

export type MaterialRequirementDiagnosticFixtureId =
  | "word-context"
  | "measurement-trend";

export interface MaterialRequirementDiagnosticCase {
  readonly id: string;
  readonly input: MaterialRequirementJudgeInput;
  readonly expected: MaterialRequirementJudgeResult;
}

export interface MaterialRequirementDiagnosticFixture {
  readonly id: MaterialRequirementDiagnosticFixtureId;
  readonly version: typeof MATERIAL_REQUIREMENT_FIXTURE_VERSION;
  readonly cases: readonly MaterialRequirementDiagnosticCase[];
}

function assessment(
  requirementId: string,
  status: MaterialRequirementAssessmentStatus,
  evidence: string,
) {
  return { requirementId, status, evidence } as const;
}

function diagnosticCase(
  id: string,
  rubricId: string,
  criterion: string,
  requirements: MaterialRequirementJudgeInput["rubrics"][number]["requirements"],
  context: MaterialRequirementJudgeContext,
  tutorResponse: string,
  assessments: MaterialRequirementJudgeResult["rubricAssessments"][number]["requirements"],
): MaterialRequirementDiagnosticCase {
  const input = parseMaterialRequirementJudgeInput({
    caseId: id,
    ...context,
    rubrics: [{ id: rubricId, criterion, requirements }],
    tutorResponse,
  });
  const expected = parseMaterialRequirementJudgeResult({
    schemaVersion: MATERIAL_REQUIREMENT_JUDGE_SCHEMA_VERSION,
    caseId: id,
    rubricAssessments: [{ rubricId, requirements: assessments }],
  }, input);
  return Object.freeze({ id, input, expected });
}

const wordRequirements = Object.freeze([
  Object.freeze({
    id: "R1",
    description: "Evaluate the student's proposed meaning against the surrounding context.",
  }),
  Object.freeze({
    id: "R2",
    description: "Explain what the pause-before-agreeing clue supports.",
  }),
  Object.freeze({
    id: "R3",
    description: "Explain what the pause-before-agreeing clue cannot establish on its own.",
  }),
  Object.freeze({
    id: "R4",
    description: "Do not treat the student's proposed meaning as automatically correct or incorrect.",
  }),
] as const);

const wordFixtureById = new Map(
  WORD_CONTEXT_DISCRIMINATION_FIXTURES.map((fixtureCase) => [fixtureCase.id, fixtureCase]),
);

function wordResponse(id: "A" | "B" | "C"): string {
  const fixtureCase = wordFixtureById.get(id);
  if (fixtureCase === undefined) {
    throw new Error(`Missing word-context fixture ${id}.`);
  }
  return fixtureCase.responseText;
}

function materialRequirementContext(
  input: ReturnType<typeof buildTutorEvalJudgeInput>,
): MaterialRequirementJudgeContext {
  return {
    learningObjective: input.learningObjective,
    studentProfile: input.studentProfile,
    conversationHistory: input.conversationHistory,
    studentMessage: input.studentMessage,
    problemContext: input.problemContext,
    groundTruth: input.groundTruth,
    knownMisconception: input.knownMisconception,
    disclosurePolicy: input.disclosurePolicy,
  };
}

function createWordContextFixture(
  tutorEvalCase: TutorEvalCase,
): MaterialRequirementDiagnosticFixture {
  if (
    tutorEvalCase.id !== WORD_CONTEXT_DISCRIMINATION_CASE_ID ||
    tutorEvalCase.version !== WORD_CONTEXT_DISCRIMINATION_CASE_VERSION
  ) {
    throw new Error("Material-requirement word-context fixture requires the canonical case version.");
  }
  const contextFor = (response: string): MaterialRequirementJudgeContext =>
    materialRequirementContext(buildTutorEvalJudgeInput(tutorEvalCase, response));
  return Object.freeze({
    id: "word-context",
    version: MATERIAL_REQUIREMENT_FIXTURE_VERSION,
    cases: Object.freeze([
      diagnosticCase(
        "material-word-context-A",
        "language-word-context-001",
        WORD_CONTEXT_DISCRIMINATION_CORRECTNESS_CRITERION,
        wordRequirements,
        contextFor(wordResponse("A")),
        wordResponse("A"),
        [
          assessment("R1", "SATISFIED", "The response evaluates the proposed meaning using the pause clue."),
          assessment("R2", "SATISFIED", "It says the pause supports hesitation or reluctance."),
          assessment("R3", "SATISFIED", "It says the clue alone cannot distinguish unwillingness, uncertainty, or thinking."),
          assessment("R4", "SATISFIED", "It asks for another clue before deciding the meaning."),
        ],
      ),
      diagnosticCase(
        "material-word-context-B",
        "language-word-context-001",
        WORD_CONTEXT_DISCRIMINATION_CORRECTNESS_CRITERION,
        wordRequirements,
        contextFor(wordResponse("B")),
        wordResponse("B"),
        [
          assessment("R1", "SATISFIED", "The response compares reluctant with unsure in the stated context."),
          assessment("R2", "SATISFIED", "It uses the pause as evidence of hesitation."),
          assessment("R3", "OMITTED_OR_INCOMPLETE", "It does not state the limit of what the pause alone establishes."),
          assessment("R4", "SATISFIED", "It evaluates the guess through a stated context clue."),
        ],
      ),
      diagnosticCase(
        "material-word-context-C",
        "language-word-context-001",
        WORD_CONTEXT_DISCRIMINATION_CORRECTNESS_CRITERION,
        wordRequirements,
        contextFor(wordResponse("C")),
        wordResponse("C"),
        [
          assessment("R1", "SATISFIED", "The response relates the proposed meaning to the pause clue."),
          assessment("R2", "SATISFIED", "It identifies unwillingness as one interpretation supported by the pause."),
          assessment("R3", "EXPLICIT_CONFLICT", "It says the pause proves unwillingness, contradicting the required limitation."),
          assessment("R4", "EXPLICIT_CONFLICT", "The response reaches a definitive lexical conclusion and conclusively displaces the student's proposed interpretation instead of keeping the underdetermined context boundary open."),
        ],
      ),
    ]),
  });
}

const measurementCriterion =
  "Compare two measurements, explain that two observations alone are insufficient to establish a trend, and ask for another observation.";
const measurementRequirements = Object.freeze([
  Object.freeze({ id: "M1", description: "Compare the two observations." }),
  Object.freeze({
    id: "M2",
    description: "State that two observations alone cannot establish a trend.",
  }),
  Object.freeze({ id: "M3", description: "Ask for another observation." }),
] as const);

const measurementContext: MaterialRequirementJudgeContext = Object.freeze({
  learningObjective: "Compare repeated measurements without inferring a trend from insufficient observations.",
  studentProfile: JSON.stringify({ level: "middle-school", goal: "interpret repeated measurements" }),
  conversationHistory: JSON.stringify([]),
  studentMessage: "The first measurement was 10 units and the second was 12 units. Does that prove the measurements are increasing?",
  problemContext: "Only two measurements have been collected: observation 1 is 10 units and observation 2 is 12 units. No third observation is available yet.",
  groundTruth: JSON.stringify({
    comparison: "The second measurement is 2 units higher than the first.",
    limitation: "Two observations alone are insufficient to establish a trend.",
  }),
  knownMisconception: "A higher second observation proves an increasing trend.",
  disclosurePolicy: "hint_only",
});

export const MATERIAL_REQUIREMENT_MEASUREMENT_TREND_FIXTURE: MaterialRequirementDiagnosticFixture =
  Object.freeze({
    id: "measurement-trend",
    version: MATERIAL_REQUIREMENT_FIXTURE_VERSION,
    cases: Object.freeze([
      diagnosticCase(
        "material-measurement-PASS",
        "measurement-trend-001",
        measurementCriterion,
        measurementRequirements,
        measurementContext,
        "The second measurement is higher than the first, but two observations alone cannot establish an increasing trend. What is a third measurement?",
        [
          assessment("M1", "SATISFIED", "The response says the second measurement is higher."),
          assessment("M2", "SATISFIED", "It explicitly says two observations cannot establish a trend."),
          assessment("M3", "SATISFIED", "It asks for a third measurement."),
        ],
      ),
      diagnosticCase(
        "material-measurement-PARTIAL",
        "measurement-trend-001",
        measurementCriterion,
        measurementRequirements,
        measurementContext,
        "The second measurement is higher than the first. What is a third measurement?",
        [
          assessment("M1", "SATISFIED", "The response compares the second measurement with the first."),
          assessment("M2", "OMITTED_OR_INCOMPLETE", "It does not explain the two-observation limitation."),
          assessment("M3", "SATISFIED", "It asks for a third measurement."),
        ],
      ),
      diagnosticCase(
        "material-measurement-FAIL",
        "measurement-trend-001",
        measurementCriterion,
        measurementRequirements,
        measurementContext,
        "The second measurement is higher than the first, so these two observations prove an increasing trend. What is a third measurement?",
        [
          assessment("M1", "SATISFIED", "The response compares the two observations."),
          assessment("M2", "EXPLICIT_CONFLICT", "It says the two observations prove an increasing trend."),
          assessment("M3", "SATISFIED", "It asks for a third measurement."),
        ],
      ),
    ]),
  });

export async function loadMaterialRequirementDiagnosticFixtures(): Promise<
  readonly MaterialRequirementDiagnosticFixture[]
> {
  const dataset = await loadTutorEvalDataset(
    TUTOR_EVAL_DATASET_ID,
    TUTOR_EVAL_DATASET_VERSION,
  );
  const wordContextCase = dataset.cases.find(
    (candidate) => candidate.id === WORD_CONTEXT_DISCRIMINATION_CASE_ID,
  );
  if (wordContextCase === undefined) {
    throw new Error("Canonical dataset is missing the material-requirement word-context case.");
  }
  return Object.freeze([
    createWordContextFixture(wordContextCase),
    MATERIAL_REQUIREMENT_MEASUREMENT_TREND_FIXTURE,
  ]);
}

export interface MaterialRequirementDiagnosticRequirementReport {
  readonly requirementId: string;
  readonly expectedStatus: MaterialRequirementAssessmentStatus;
  readonly observedStatus: MaterialRequirementAssessmentStatus;
  readonly agreement: boolean;
  readonly evidence?: string;
}

export interface MaterialRequirementDiagnosticRubricReport {
  readonly rubricId: string;
  readonly requirements: readonly MaterialRequirementDiagnosticRequirementReport[];
  readonly atomicAgreementCount: number;
  readonly atomicAssessmentCount: number;
  readonly expectedDerivedLabel: MaterialRequirementDerivedLabel;
  readonly observedDerivedLabel: MaterialRequirementDerivedLabel;
  readonly derivedAgreement: boolean;
}

export interface MaterialRequirementDiagnosticCaseReport {
  readonly fixtureCaseId: string;
  readonly status: "observed" | "error";
  readonly executionErrorCode?: string;
  readonly latencyMs?: number;
  readonly tokenUsage?: TutorEvalTokenUsage | null;
  readonly attempts?: number;
  readonly cost?: number | null;
  readonly rubrics: readonly MaterialRequirementDiagnosticRubricReport[];
}

export type MaterialRequirementDiagnosticMode = "provider-free" | "live";

export interface MaterialRequirementDiagnosticRunOptions {
  readonly mode?: MaterialRequirementDiagnosticMode;
  readonly provider?: string;
  readonly model?: string;
}

export interface MaterialRequirementTokenCoverage {
  readonly completeTotal: number | null;
  readonly knownTotal: number | null;
  readonly knownCount: number;
  readonly plannedCount: number;
  readonly unavailableCount: number;
  readonly coverageShare: number;
}

export interface MaterialRequirementDiagnosticFixtureReport {
  readonly fixtureId: MaterialRequirementDiagnosticFixtureId;
  readonly fixtureVersion: typeof MATERIAL_REQUIREMENT_FIXTURE_VERSION;
  readonly cases: readonly MaterialRequirementDiagnosticCaseReport[];
}

export interface MaterialRequirementDiagnosticReport {
  readonly schemaVersion: 1;
  readonly diagnosticId: typeof MATERIAL_REQUIREMENT_DIAGNOSTIC_ID;
  readonly diagnosticVersion: typeof MATERIAL_REQUIREMENT_DIAGNOSTIC_VERSION;
  readonly dataKind: "synthetic-fixture";
  readonly fixtureProvenance: typeof MATERIAL_REQUIREMENT_FIXTURE_PROVENANCE;
  readonly calibrationStatus: "uncalibrated";
  readonly mode: MaterialRequirementDiagnosticMode;
  readonly provider?: string;
  readonly model?: string;
  readonly materialRequirementSchemaVersion: 1;
  readonly promptId: typeof MATERIAL_REQUIREMENT_JUDGE_PROMPT_ID;
  readonly promptVersion: typeof MATERIAL_REQUIREMENT_JUDGE_PROMPT_VERSION;
  readonly fixtures: readonly MaterialRequirementDiagnosticFixtureReport[];
  readonly plannedCalls: number;
  /** Calls that reached a terminal observed or typed-error outcome. */
  readonly completedCalls: number;
  readonly semanticAvailability: {
    readonly observedCases: number;
    readonly plannedCases: number;
    readonly share: number;
  };
  readonly executionErrors: {
    readonly count: number;
    readonly byCode: Readonly<Record<string, number>>;
  };
  readonly tokenUsageCoverage: {
    readonly inputTokens: MaterialRequirementTokenCoverage;
    readonly outputTokens: MaterialRequirementTokenCoverage;
    readonly totalTokens: MaterialRequirementTokenCoverage;
  };
  readonly limitations: readonly string[];
}

function ratio(observed: number, planned: number): number {
  return planned === 0 ? 0 : observed / planned;
}

function tokenCoverage(
  metrics: readonly (TutorEvalJudgeMetrics | null | undefined)[],
  field: "inputTokens" | "outputTokens" | "totalTokens",
): MaterialRequirementTokenCoverage {
  const values = metrics.map((metric) => metric?.tokenUsage?.[field] ?? null);
  const unavailableCount = values.filter((value) => value === null).length;
  const knownValues = values.filter((value): value is number => value !== null);
  const knownTotal = knownValues.length === 0
    ? null
    : knownValues.reduce((sum, value) => sum + value, 0);
  return {
    completeTotal: unavailableCount === 0 && knownTotal !== null ? knownTotal : null,
    knownTotal,
    knownCount: knownValues.length,
    plannedCount: values.length,
    unavailableCount,
    coverageShare: ratio(knownValues.length, values.length),
  };
}

function increment(counts: Record<string, number>, code: string): void {
  counts[code] = (counts[code] ?? 0) + 1;
}

function readMaterialExecutionFailure(
  error: unknown,
): { readonly code: string; readonly metrics?: TutorEvalJudgeMetrics } {
  if (error instanceof MaterialRequirementJudgeExecutionError) {
    return {
      code: error.code,
      ...(error.metrics === undefined ? {} : { metrics: error.metrics }),
    };
  }
  return { code: "material_judge_transport_error" };
}

function buildRubricReport(
  input: MaterialRequirementJudgeInput,
  expected: MaterialRequirementJudgeResult,
  observed: MaterialRequirementJudgeResult,
): MaterialRequirementDiagnosticRubricReport[] {
  return input.rubrics.map((rubric) => {
    const expectedRubric = expected.rubricAssessments.find((value) => value.rubricId === rubric.id);
    const observedRubric = observed.rubricAssessments.find((value) => value.rubricId === rubric.id);
    if (expectedRubric === undefined || observedRubric === undefined) {
      throw new Error("Validated material-requirement result lost rubric ownership.");
    }
    const requirements = rubric.requirements.map((requirement) => {
      const expectedAssessment = expectedRubric.requirements.find(
        (value) => value.requirementId === requirement.id,
      );
      const observedAssessment = observedRubric.requirements.find(
        (value) => value.requirementId === requirement.id,
      );
      if (expectedAssessment === undefined || observedAssessment === undefined) {
        throw new Error("Validated material-requirement result lost requirement ownership.");
      }
      return {
        requirementId: requirement.id,
        expectedStatus: expectedAssessment.status,
        observedStatus: observedAssessment.status,
        agreement: expectedAssessment.status === observedAssessment.status,
        ...(observedAssessment.evidence === undefined
          ? {}
          : { evidence: observedAssessment.evidence }),
      };
    });
    const expectedDerivedLabel = aggregateMaterialRequirementAssessments(
      expectedRubric.requirements,
    );
    const observedDerivedLabel = aggregateMaterialRequirementAssessments(
      observedRubric.requirements,
    );
    return {
      rubricId: rubric.id,
      requirements,
      atomicAgreementCount: requirements.filter((value) => value.agreement).length,
      atomicAssessmentCount: requirements.length,
      expectedDerivedLabel,
      observedDerivedLabel,
      derivedAgreement: expectedDerivedLabel === observedDerivedLabel,
    };
  });
}

export async function runMaterialRequirementDiagnostic(
  judge: MaterialRequirementJudge,
  fixtures?: readonly MaterialRequirementDiagnosticFixture[],
  options: MaterialRequirementDiagnosticRunOptions = {},
): Promise<MaterialRequirementDiagnosticReport> {
  const selectedFixtures = fixtures ?? await loadMaterialRequirementDiagnosticFixtures();
  const fixtureReports: MaterialRequirementDiagnosticFixtureReport[] = [];
  const metricsByCase: (TutorEvalJudgeMetrics | null)[] = [];
  const executionErrorsByCode: Record<string, number> = {};
  let plannedCalls = 0;
  let completedCalls = 0;
  let observedCases = 0;
  for (const fixture of selectedFixtures) {
    const cases: MaterialRequirementDiagnosticCaseReport[] = [];
    for (const fixtureCase of fixture.cases) {
      plannedCalls += 1;
      try {
        const evaluation = judge.evaluateWithMetrics === undefined
          ? { result: await judge.evaluate(fixtureCase.input), metrics: null }
          : await judge.evaluateWithMetrics(fixtureCase.input);
        const metrics = evaluation.metrics ?? null;
        let observed: MaterialRequirementJudgeResult;
        try {
          observed = parseMaterialRequirementJudgeResult(
            evaluation.result,
            fixtureCase.input,
          );
        } catch {
          throw new MaterialRequirementJudgeExecutionError(
            "material_judge_result_invalid",
            metrics ?? undefined,
          );
        }
        metricsByCase.push(metrics);
        cases.push({
          fixtureCaseId: fixtureCase.id,
          status: "observed",
          ...(metrics === null ? {} : {
            latencyMs: metrics.latencyMs,
            tokenUsage: metrics.tokenUsage,
            attempts: metrics.attempts,
            cost: metrics.cost,
          }),
          rubrics: buildRubricReport(fixtureCase.input, fixtureCase.expected, observed),
        });
        completedCalls += 1;
        observedCases += 1;
      } catch (error) {
        const failure = readMaterialExecutionFailure(error);
        increment(executionErrorsByCode, failure.code);
        metricsByCase.push(failure.metrics ?? null);
        cases.push({
          fixtureCaseId: fixtureCase.id,
          status: "error",
          executionErrorCode: failure.code,
          ...(failure.metrics === undefined ? {} : {
            latencyMs: failure.metrics.latencyMs,
            tokenUsage: failure.metrics.tokenUsage,
            attempts: failure.metrics.attempts,
            cost: failure.metrics.cost,
          }),
          rubrics: [],
        });
        completedCalls += 1;
      }
    }
    fixtureReports.push({
      fixtureId: fixture.id,
      fixtureVersion: fixture.version,
      cases,
    });
  }
  const mode = options.mode ?? "provider-free";
  return {
    schemaVersion: 1,
    diagnosticId: MATERIAL_REQUIREMENT_DIAGNOSTIC_ID,
    diagnosticVersion: MATERIAL_REQUIREMENT_DIAGNOSTIC_VERSION,
    dataKind: "synthetic-fixture",
    fixtureProvenance: MATERIAL_REQUIREMENT_FIXTURE_PROVENANCE,
    calibrationStatus: "uncalibrated",
    mode,
    ...(options.provider === undefined ? {} : { provider: options.provider }),
    ...(options.model === undefined ? {} : { model: options.model }),
    materialRequirementSchemaVersion: MATERIAL_REQUIREMENT_JUDGE_SCHEMA_VERSION,
    promptId: MATERIAL_REQUIREMENT_JUDGE_PROMPT_ID,
    promptVersion: MATERIAL_REQUIREMENT_JUDGE_PROMPT_VERSION,
    fixtures: fixtureReports,
    plannedCalls,
    completedCalls,
    semanticAvailability: {
      observedCases,
      plannedCases: plannedCalls,
      share: ratio(observedCases, plannedCalls),
    },
    executionErrors: {
      count: Object.values(executionErrorsByCode).reduce(
        (sum, count) => sum + count,
        0,
      ),
      byCode: executionErrorsByCode,
    },
    tokenUsageCoverage: {
      inputTokens: tokenCoverage(metricsByCase, "inputTokens"),
      outputTokens: tokenCoverage(metricsByCase, "outputTokens"),
      totalTokens: tokenCoverage(metricsByCase, "totalTokens"),
    },
    limitations: [
      "Developer-authored diagnostic expectations are synthetic fixtures, not human-reference gold.",
      "Atomic and derived agreement are reported separately and are not accuracy claims.",
      "This opt-in experiment does not replace the production Judge, evaluator, scoring, or critical-failure semantics.",
      "Execution errors are availability observations, not atomic disagreements or derived semantic labels.",
    ],
  };
}

/** Provider-free structural harness; it returns atomic fixture expectations, never labels. */
export function createSyntheticMaterialRequirementFixtureJudge(
  fixtures: readonly MaterialRequirementDiagnosticFixture[],
): MaterialRequirementJudge {
  const cases = fixtures.flatMap((fixture) => fixture.cases);
  return {
    evaluate: async (input) => {
      const fixtureCase = cases.find((candidate) => candidate.id === input.caseId);
      if (
        fixtureCase === undefined ||
        JSON.stringify(fixtureCase.input) !== JSON.stringify(input)
      ) {
        throw new Error("Synthetic material-requirement Judge received an unknown input.");
      }
      return fixtureCase.expected;
    },
  };
}

export function formatMaterialRequirementDiagnosticReport(
  report: MaterialRequirementDiagnosticReport,
): string {
  const lines = [
    "Material Requirement Judge diagnostic",
    `Diagnostic: ${report.diagnosticId}@${report.diagnosticVersion}`,
    `Data: ${report.dataKind} (${report.fixtureProvenance})`,
    `Calibration: ${report.calibrationStatus}`,
    `Mode: ${report.mode}${report.provider === undefined ? "" : ` / Provider: ${report.provider}`}${report.model === undefined ? "" : ` / Model: ${report.model}`}`,
    `Planned Judge calls: ${report.plannedCalls}`,
    `Completed Judge calls: ${report.completedCalls}`,
    `Semantic availability: ${report.semanticAvailability.observedCases}/${report.semanticAvailability.plannedCases}`,
    `Execution errors: ${report.executionErrors.count}`,
    `Prompt: ${report.promptId}@${report.promptVersion}`,
    "",
  ];
  for (const fixture of report.fixtures) {
    lines.push(`Fixture: ${fixture.fixtureId}@${fixture.fixtureVersion}`);
    for (const fixtureCase of fixture.cases) {
      lines.push(`  Case: ${fixtureCase.fixtureCaseId}`);
      if (fixtureCase.status === "error") {
        lines.push(
          `    Status: error (${fixtureCase.executionErrorCode ?? "unknown"})`,
          ...(fixtureCase.latencyMs === undefined
            ? []
            : [`    Latency: ${fixtureCase.latencyMs}ms`]),
        );
        continue;
      }
      for (const rubric of fixtureCase.rubrics) {
        lines.push(`    Rubric: ${rubric.rubricId}`);
        for (const requirement of rubric.requirements) {
          lines.push(
            `      ${requirement.requirementId}: expected ${requirement.expectedStatus} / observed ${requirement.observedStatus} / ${requirement.agreement ? "agreement" : "disagreement"}`,
          );
        }
        lines.push(
          `      Atomic agreement: ${rubric.atomicAgreementCount}/${rubric.atomicAssessmentCount}`,
          `      Derived label: expected ${rubric.expectedDerivedLabel} / observed ${rubric.observedDerivedLabel} / ${rubric.derivedAgreement ? "agreement" : "disagreement"}`,
        );
      }
    }
  }
  lines.push(
    "",
    `Known total tokens: ${report.tokenUsageCoverage.totalTokens.knownTotal ?? "unavailable"}`,
    `Complete total tokens: ${report.tokenUsageCoverage.totalTokens.completeTotal ?? "unavailable"}`,
    `Token usage coverage: ${report.tokenUsageCoverage.totalTokens.knownCount}/${report.tokenUsageCoverage.totalTokens.plannedCount}`,
    "",
    "Limitations:",
    ...report.limitations.map((value) => `- ${value}`),
  );
  return lines.join("\n");
}
