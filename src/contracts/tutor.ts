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
  readonly initialContext: string;
  readonly conversation: readonly TutorConversationMessage[];
  readonly currentStudentMessage: string;
  readonly studentState: StudentState;
}

export interface TutorTurnOutput {
  readonly text: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface TutorUnderTest {
  readonly id: string;
  respond(input: TutorTurnInput): Promise<TutorTurnOutput>;
}
