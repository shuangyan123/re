import { createHash } from "node:crypto";

import type {
  TutorEvalTutorDescriptor,
  TutorGenerationSpec,
} from "../contracts/index.js";

export interface TutorResponseIdentityInput {
  readonly corpusId: string;
  readonly corpusVersion: string;
  readonly datasetId: string;
  readonly datasetVersion: string;
  readonly caseId: string;
  readonly caseVersion: string;
  readonly tutor: TutorEvalTutorDescriptor;
  readonly generationSpec?: TutorGenerationSpec;
  readonly runIndex: number;
}

/**
 * Derives an explicit response identity from stable, non-secret metadata.
 * The allow-list is intentional: credentials, full prompts, raw provider
 * payloads, and URLs can never become hash material by accident.
 */
export function deriveTutorResponseId(
  input: TutorResponseIdentityInput,
): string {
  const identity = {
    corpusId: input.corpusId,
    corpusVersion: input.corpusVersion,
    datasetId: input.datasetId,
    datasetVersion: input.datasetVersion,
    caseId: input.caseId,
    caseVersion: input.caseVersion,
    tutor: {
      provider: input.tutor.provider,
      model: input.tutor.model,
      ...(input.tutor.modelVersion === undefined
        ? {}
        : { modelVersion: input.tutor.modelVersion }),
      ...(input.tutor.promptId === undefined
        ? {}
        : { promptId: input.tutor.promptId }),
      promptVersion: input.tutor.promptVersion,
      ...(input.tutor.temperature === undefined
        ? {}
        : { temperature: input.tutor.temperature }),
      ...(input.tutor.reasoningEffort === undefined
        ? {}
        : { reasoningEffort: input.tutor.reasoningEffort }),
      ...(input.tutor.seed === undefined ? {} : { seed: input.tutor.seed }),
    },
    ...(input.generationSpec === undefined
      ? {}
      : {
          generationSpec: {
            specId: input.generationSpec.specId,
            specVersion: input.generationSpec.specVersion,
            prompt: {
              id: input.generationSpec.prompt.id,
              version: input.generationSpec.prompt.version,
              sha256: input.generationSpec.prompt.sha256,
            },
            maxOutputTokens: input.generationSpec.maxOutputTokens,
            ...(input.generationSpec.temperature === undefined
              ? {}
              : { temperature: input.generationSpec.temperature }),
            ...(input.generationSpec.reasoningEffort === undefined
              ? {}
              : { reasoningEffort: input.generationSpec.reasoningEffort }),
            ...(input.generationSpec.seed === undefined
              ? {}
              : { seed: input.generationSpec.seed }),
          },
        }),
    runIndex: input.runIndex,
  };
  const digest = createHash("sha256")
    .update(JSON.stringify(identity), "utf8")
    .digest("hex")
    .slice(0, 32);
  return `tutor-response-${digest}`;
}
