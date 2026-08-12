import { randomUUID } from "node:crypto";

import {
  BenchmarkConfigurationError,
  BenchmarkRunnerError,
  isTutorTurnOutput,
  parseTutorRubrics,
  parseTutorScenarios,
  type BenchmarkDiagnostic,
  type BenchmarkRunResult,
  type CriterionResult,
  type DeterministicEvaluatorId,
  type ScenarioResult,
  type TutorRubric,
  type TutorScenario,
  type TutorTurnOutput,
  type TutorUnderTest,
} from "../contracts/index.js";
import {
  evaluateDeterministicCriterion,
  type DeterministicEvaluator,
} from "../evaluators/index.js";

export interface BenchmarkRunOptions {
  readonly runId?: string;
  readonly now?: () => Date;
  readonly evaluators?: Readonly<
    Partial<Record<DeterministicEvaluatorId, DeterministicEvaluator>>
  >;
}

function stableDiagnostic(code: string, message: string): BenchmarkDiagnostic {
  return { code, message };
}

function scenarioError(
  scenario: TutorScenario,
  code: "adapter_failed" | "evaluation_failed",
  message: string,
  turnCount: number,
  criterionResults: readonly CriterionResult[] = [],
): ScenarioResult {
  return {
    scenarioId: scenario.id,
    rubricId: scenario.rubricId,
    status: "error",
    score: null,
    passed: false,
    turnCount,
    criterionResults,
    diagnostics: [stableDiagnostic(code, message)],
  };
}

function runScenario(
  tutor: TutorUnderTest,
  scenario: TutorScenario,
  rubric: TutorRubric,
  evaluators: Readonly<
    Partial<Record<DeterministicEvaluatorId, DeterministicEvaluator>>
  >,
): Promise<ScenarioResult> {
  return (async () => {
    const conversation = [] as {
      role: "student" | "tutor";
      text: string;
    }[];
    let lastOutput: TutorTurnOutput | undefined;

    for (const turn of scenario.turns) {
      try {
        const output = await tutor.respond({
          scenarioId: scenario.id,
          initialContext: scenario.initialContext,
          conversation,
          currentStudentMessage: turn.studentMessage,
          studentState: scenario.studentProfile,
        });
        if (!isTutorTurnOutput(output)) {
          return scenarioError(
            scenario,
            "adapter_failed",
            "Tutor adapter returned an invalid response.",
            conversation.length / 2,
          );
        }
        conversation.push({ role: "student", text: turn.studentMessage });
        conversation.push({ role: "tutor", text: output.text });
        lastOutput = output;
      } catch {
        return scenarioError(
          scenario,
          "adapter_failed",
          "Tutor adapter failed for this scenario.",
          conversation.length / 2,
        );
      }
    }

    if (lastOutput === undefined) {
      return scenarioError(
        scenario,
        "adapter_failed",
        "Tutor adapter produced no response.",
        0,
      );
    }

    const criterionResults: CriterionResult[] = [];
    for (const criterion of rubric.criteria) {
      const evaluator =
        evaluators[criterion.evaluatorId] ?? evaluateDeterministicCriterion;
      try {
        criterionResults.push(evaluator(scenario, criterion, lastOutput));
      } catch {
        criterionResults.push({
          criterionId: criterion.id,
          evaluatorId: criterion.evaluatorId,
          status: "error",
          score: null,
          passed: false,
          diagnostics: [
            stableDiagnostic(
              "evaluation_failed",
              "Evaluator failed for this criterion.",
            ),
          ],
        });
      }
    }

    if (criterionResults.some((criterion) => criterion.status === "error")) {
      return scenarioError(
        scenario,
        "evaluation_failed",
        "One or more evaluators failed for this scenario.",
        scenario.turns.length,
        criterionResults,
      );
    }

    const totalWeight = rubric.criteria.reduce(
      (sum, criterion) => sum + criterion.weight,
      0,
    );
    const score =
      totalWeight === 0
        ? null
        : criterionResults.reduce(
            (sum, criterion, index) =>
              sum +
              (criterion.score ?? 0) *
                (rubric.criteria[index]?.weight ?? 0),
            0,
          ) / totalWeight;
    if (score === null) {
      return scenarioError(
        scenario,
        "evaluation_failed",
        "Rubric has no usable evaluation weight.",
        scenario.turns.length,
        criterionResults,
      );
    }

    const passed = score >= rubric.passThreshold;
    return {
      scenarioId: scenario.id,
      rubricId: rubric.id,
      status: passed ? "passed" : "failed",
      score,
      passed,
      turnCount: scenario.turns.length,
      criterionResults,
      diagnostics: [],
    };
  })();
}

function assertTutorAvailable(tutor: TutorUnderTest): void {
  if (
    typeof tutor !== "object" ||
    tutor === null ||
    typeof tutor.id !== "string" ||
    tutor.id.trim().length === 0 ||
    typeof tutor.respond !== "function"
  ) {
    throw new BenchmarkRunnerError();
  }
}

export async function runBenchmark(
  tutor: TutorUnderTest,
  scenarios: readonly TutorScenario[],
  rubrics: readonly TutorRubric[],
  options: BenchmarkRunOptions = {},
): Promise<BenchmarkRunResult> {
  assertTutorAvailable(tutor);
  const validatedScenarios = parseTutorScenarios(scenarios);
  const validatedRubrics = parseTutorRubrics(rubrics);
  const rubricById = new Map(validatedRubrics.map((rubric) => [rubric.id, rubric]));
  for (const scenario of validatedScenarios) {
    if (!rubricById.has(scenario.rubricId)) {
      throw new BenchmarkConfigurationError("rubric_invalid");
    }
  }

  const now = options.now ?? (() => new Date());
  const startedAtDate = now();
  const startedAt = startedAtDate.toISOString();
  const orderedScenarios = [...validatedScenarios].sort((left, right) =>
    left.id < right.id ? -1 : left.id > right.id ? 1 : 0,
  );
  const evaluators = options.evaluators ?? {};
  const scenarioResults: ScenarioResult[] = [];

  for (const scenario of orderedScenarios) {
    const rubric = rubricById.get(scenario.rubricId);
    if (rubric === undefined) {
      throw new BenchmarkConfigurationError("rubric_invalid");
    }
    scenarioResults.push(await runScenario(tutor, scenario, rubric, evaluators));
  }

  const finishedAtDate = now();
  const finishedAt = finishedAtDate.toISOString();
  const scoreBearingResults = scenarioResults.filter(
    (scenario) => scenario.score !== null,
  );
  const totalScore =
    scoreBearingResults.length === 0
      ? 0
      : scoreBearingResults.reduce(
          (sum, scenario) => sum + (scenario.score ?? 0),
          0,
        ) / scoreBearingResults.length;

  return {
    schemaVersion: 1,
    runId: options.runId ?? randomUUID(),
    timestamp: startedAt,
    startedAt,
    finishedAt,
    durationMs: Math.max(0, finishedAtDate.getTime() - startedAtDate.getTime()),
    tutorId: tutor.id,
    scenarioCount: scenarioResults.length,
    passedCount: scenarioResults.filter((scenario) => scenario.status === "passed")
      .length,
    failedCount: scenarioResults.filter((scenario) => scenario.status === "failed")
      .length,
    errorCount: scenarioResults.filter((scenario) => scenario.status === "error")
      .length,
    totalScore,
    scenarioResults,
  };
}
