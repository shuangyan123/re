import type { StudentState } from "./tutor.js";

export const SCENARIO_SCHEMA_VERSION = 1 as const;

export interface TutorScenarioTurn {
  readonly studentMessage: string;
}

export interface TutorScenario {
  readonly schemaVersion: typeof SCENARIO_SCHEMA_VERSION;
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly studentProfile: StudentState;
  readonly learningObjective: string;
  readonly initialContext: string;
  readonly turns: readonly TutorScenarioTurn[];
  readonly tags: readonly string[];
  readonly rubricId: string;
}
