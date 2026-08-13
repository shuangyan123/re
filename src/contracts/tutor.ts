export type TutorMessageRole = "student" | "tutor";

export interface TutorConversationMessage {
  readonly role: TutorMessageRole;
  readonly text: string;
}

export interface StudentState {
  readonly knownConcepts: readonly string[];
  readonly misconceptions: readonly string[];
  readonly level: string;
  readonly goal: string;
}

export interface TutorTurnInput {
  readonly scenarioId: string;
  /** Canonical TutorEval identity; scenarioId remains for Foundation compatibility. */
  readonly caseId?: string;
  /** Canonical case version used by recorded/replay adapters. */
  readonly caseVersion?: string;
  /** One-based generation run identity used by recorded/replay adapters. */
  readonly runIndex?: number;
  readonly learningObjective?: string;
  readonly initialContext: string;
  readonly conversation: readonly TutorConversationMessage[];
  readonly currentStudentMessage: string;
  readonly studentState: StudentState;
}

export interface TutorTokenUsage {
  readonly inputTokens?: number;
  readonly outputTokens?: number;
  readonly totalTokens?: number;
}

/** Sanitized adapter metrics only; raw provider payloads remain outside core. */
export interface TutorTurnMetrics {
  readonly tokenUsage?: TutorTokenUsage;
  readonly latencyMs?: number;
  readonly cost?: number;
}

export interface TutorTurnOutput {
  readonly text: string;
  readonly metrics?: TutorTurnMetrics;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface TutorUnderTest {
  readonly id: string;
  respond(input: TutorTurnInput): Promise<TutorTurnOutput>;
}
