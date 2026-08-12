import type { TutorTurnInput, TutorTurnOutput, TutorUnderTest } from "../contracts/index.js";

export interface ScriptedTutorOptions {
  readonly id: string;
  readonly responses: Readonly<Record<string, string>>;
  readonly failingScenarioIds?: ReadonlySet<string>;
}

export class ScriptedTutor implements TutorUnderTest {
  readonly id: string;
  private readonly responses: Readonly<Record<string, string>>;
  private readonly failingScenarioIds: ReadonlySet<string>;

  constructor(options: ScriptedTutorOptions) {
    this.id = options.id;
    this.responses = options.responses;
    this.failingScenarioIds = options.failingScenarioIds ?? new Set<string>();
  }

  async respond(input: TutorTurnInput): Promise<TutorTurnOutput> {
    if (this.failingScenarioIds.has(input.scenarioId)) {
      throw new Error("scripted adapter failure");
    }
    const text = this.responses[input.scenarioId];
    if (text === undefined) {
      throw new Error("scripted response missing");
    }
    return { text };
  }
}
