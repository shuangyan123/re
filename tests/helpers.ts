import type {
  TutorRubric,
  TutorRubricCriterion,
  TutorScenario,
  TutorTurnOutput,
} from "../src/contracts/index.js";

export function makeScenario(
  id: string,
  rubricId: string,
  studentMessage = "Please help me.",
): TutorScenario {
  return {
    schemaVersion: 1,
    id,
    title: id,
    description: "Synthetic test scenario.",
    studentProfile: {
      knownConcepts: [],
      misconceptions: [],
      level: "test",
      goal: "test goal",
    },
    learningObjective: "Test a stable benchmark contract.",
    initialContext: "Synthetic test context.",
    turns: [{ studentMessage }],
    tags: ["synthetic"],
    rubricId,
  };
}

export function makeCriterion(
  overrides: Partial<TutorRubricCriterion> = {},
): TutorRubricCriterion {
  return {
    id: "criterion-1",
    description: "Response should be non-empty.",
    weight: 1,
    evaluationType: "deterministic",
    evaluatorId: "empty_response",
    ...overrides,
  };
}

export function makeRubric(
  criteria: readonly TutorRubricCriterion[] = [makeCriterion()],
  passThreshold = 1,
): TutorRubric {
  return {
    schemaVersion: 1,
    id: "rubric-1",
    title: "Synthetic test rubric",
    passThreshold,
    criteria,
  };
}

export function output(text: string): TutorTurnOutput {
  return { text };
}
