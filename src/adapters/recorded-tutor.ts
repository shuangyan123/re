import type {
  TutorCandidateResponse,
  TutorResponseCorpus,
  TutorTurnInput,
  TutorTurnOutput,
  TutorUnderTest,
} from "../contracts/index.js";

export class RecordedTutorResponseMissingError extends Error {
  readonly code = "tutor_response_missing" as const;

  constructor() {
    super("Recorded Tutor response is missing for this case and run.");
    this.name = "RecordedTutorResponseMissingError";
  }
}

function responseKey(
  caseId: string,
  caseVersion: string,
  runIndex: number,
): string {
  return JSON.stringify([caseId, caseVersion, runIndex]);
}

/**
 * Replays frozen corpus text without invoking a model or provider. The map is
 * built once and the corpus is never mutated while benchmark runs execute.
 */
export class RecordedTutor implements TutorUnderTest {
  readonly id: string;
  readonly descriptor: TutorResponseCorpus["tutor"];
  private readonly responses: ReadonlyMap<string, TutorCandidateResponse>;
  private readonly responsesByCaseAndRun: ReadonlyMap<string, readonly TutorCandidateResponse[]>;

  constructor(readonly corpus: TutorResponseCorpus) {
    this.id = `recorded-tutor:${corpus.corpusId}@${corpus.corpusVersion}`;
    this.descriptor = corpus.tutor;
    const byIdentity = new Map<string, TutorCandidateResponse>();
    const byCaseAndRun = new Map<string, TutorCandidateResponse[]>();
    for (const response of corpus.responses) {
      byIdentity.set(
        responseKey(response.caseId, response.caseVersion, response.runIndex),
        response,
      );
      const key = responseKey(response.caseId, "*", response.runIndex);
      byCaseAndRun.set(key, [...(byCaseAndRun.get(key) ?? []), response]);
    }
    this.responses = byIdentity;
    this.responsesByCaseAndRun = new Map(
      [...byCaseAndRun.entries()].map(([key, values]) => [key, Object.freeze([...values])]),
    );
  }

  async respond(input: TutorTurnInput): Promise<TutorTurnOutput> {
    const caseId = input.caseId ?? input.scenarioId;
    const runIndex = input.runIndex ?? 1;
    const caseVersion = input.caseVersion;
    let response: TutorCandidateResponse | undefined;
    if (caseVersion !== undefined) {
      response = this.responses.get(responseKey(caseId, caseVersion, runIndex));
    } else {
      const candidates = this.responsesByCaseAndRun.get(
        responseKey(caseId, "*", runIndex),
      );
      if (candidates?.length === 1) {
        response = candidates[0];
      }
    }
    if (response === undefined) {
      throw new RecordedTutorResponseMissingError();
    }
    return {
      text: response.responseText,
      ...(response.metrics === undefined ? {} : { metrics: response.metrics }),
    };
  }
}

/** Names used by integration code while retaining one implementation. */
export class ReplayTutor extends RecordedTutor {}
export class CorpusTutor extends RecordedTutor {}
