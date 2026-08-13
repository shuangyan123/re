import {
  canonicalizeTutorGenerationSpec,
  parseTutorExecutionPacketFile,
  parseTutorResponseCorpus,
  type TutorEvalTutorDescriptor,
  type TutorExecutionPacketCase,
  type TutorExecutionPacketFile,
  type TutorGenerationSpec,
  type TutorResponseCorpus,
} from "../contracts/index.js";
import { deriveTutorResponseId } from "../corpus/identity.js";

export interface DryTutorExecutionInput {
  readonly caseId: string;
  readonly caseVersion: string;
  readonly messages: TutorExecutionPacketCase["messages"];
  readonly generationSpec: TutorGenerationSpec;
}

export type DryTutorResponseFactory = (
  input: DryTutorExecutionInput,
) => string | Promise<string>;

export interface RunDryTutorExecutionOptions {
  readonly corpusId?: string;
  readonly corpusVersion?: string;
  readonly createdAt?: string;
  readonly now?: () => Date;
  readonly tutor?: TutorEvalTutorDescriptor;
  readonly respond?: DryTutorResponseFactory;
}

function defaultTutorDescriptor(
  generationSpec: TutorGenerationSpec,
): TutorEvalTutorDescriptor {
  return {
    provider: "dry",
    model: "canonical-dry-executor",
    promptId: generationSpec.prompt.id,
    promptVersion: generationSpec.prompt.version,
    ...(generationSpec.temperature === undefined
      ? {}
      : { temperature: generationSpec.temperature }),
    ...(generationSpec.reasoningEffort === undefined
      ? {}
      : { reasoningEffort: generationSpec.reasoningEffort }),
    ...(generationSpec.seed === undefined ? {} : { seed: generationSpec.seed }),
  };
}

function matchesGenerationSpec(
  tutor: TutorEvalTutorDescriptor,
  generationSpec: TutorGenerationSpec,
): boolean {
  return (
    tutor.promptId === generationSpec.prompt.id &&
    tutor.promptVersion === generationSpec.prompt.version &&
    (generationSpec.temperature === undefined ||
      tutor.temperature === generationSpec.temperature) &&
    (generationSpec.reasoningEffort === undefined ||
      tutor.reasoningEffort === generationSpec.reasoningEffort) &&
    (generationSpec.seed === undefined || tutor.seed === generationSpec.seed)
  );
}

/**
 * Executes only the public packet with a deterministic fake response factory.
 * It has no dataset, rubric, Judge, or TutorEvalCase dependency by design.
 */
export async function runDryTutorExecutionPacket(
  packet: TutorExecutionPacketFile,
  options: RunDryTutorExecutionOptions = {},
): Promise<TutorResponseCorpus> {
  const canonicalPacket = parseTutorExecutionPacketFile(packet);
  const generationSpec = canonicalizeTutorGenerationSpec(canonicalPacket.generationSpec);
  const tutor = options.tutor ?? defaultTutorDescriptor(generationSpec);
  if (!matchesGenerationSpec(tutor, generationSpec)) {
    throw new Error("Dry Tutor execution identity does not match generation spec.");
  }
  const corpusId = options.corpusId ?? "dry-tutor-execution";
  const corpusVersion = options.corpusVersion ?? generationSpec.specVersion;
  const createdAt = options.createdAt ??
    (options.now ?? (() => new Date()))().toISOString();
  const respond = options.respond ?? ((input: DryTutorExecutionInput) =>
    `Dry executor response for ${input.caseId}.`);
  const responses = [] as Array<{
    readonly schemaVersion: 1;
    readonly responseId: string;
    readonly caseId: string;
    readonly caseVersion: string;
    readonly runIndex: number;
    readonly responseText: string;
    readonly provenance: "synthetic";
  }>;
  for (const executionCase of canonicalPacket.cases) {
    const responseText = await respond({
      caseId: executionCase.caseId,
      caseVersion: executionCase.caseVersion,
      messages: executionCase.messages,
      generationSpec,
    });
    if (typeof responseText !== "string") {
      throw new Error("Dry Tutor response factory must return text.");
    }
    responses.push({
      schemaVersion: 1,
      responseId: deriveTutorResponseId({
        corpusId,
        corpusVersion,
        datasetId: canonicalPacket.datasetId,
        datasetVersion: canonicalPacket.datasetVersion,
        caseId: executionCase.caseId,
        caseVersion: executionCase.caseVersion,
        tutor,
        generationSpec,
        runIndex: 1,
      }),
      caseId: executionCase.caseId,
      caseVersion: executionCase.caseVersion,
      runIndex: 1,
      responseText,
      provenance: "synthetic",
    });
  }
  return parseTutorResponseCorpus({
    schemaVersion: 1,
    corpusId,
    corpusVersion,
    datasetId: canonicalPacket.datasetId,
    datasetVersion: canonicalPacket.datasetVersion,
    createdAt,
    coverage: "partial",
    runsPerCase: 1,
    provenance: "synthetic",
    generationSpec,
    tutor,
    responses,
  });
}
