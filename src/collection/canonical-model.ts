import {
  assertTutorGenerationSpecExecutionSupport,
  parseTutorGenerationSpec,
  type TutorEvalCase,
  type TutorEvalDataset,
  type TutorEvalTutorDescriptor,
  type TutorGenerationSpec,
  type TutorResponseCorpus,
} from "../contracts/index.js";
import { buildTutorExecutionPacketFile } from "../contracts/tutor-execution.js";
import type { HttpTutorExecutionHost } from "../adapters/http-tutor-execution-host.js";
import {
  collectTutorEvidence,
  type TutorBaselineCollectionResult,
  type TutorBaselineCollectionTransport,
} from "./baseline.js";

export interface CollectCanonicalTutorModelOptions {
  readonly host: Pick<HttpTutorExecutionHost, "execute">;
  readonly dataset: TutorEvalDataset;
  readonly selectedCases?: readonly TutorEvalCase[];
  readonly promptAsset: string;
  readonly generationSpec: TutorGenerationSpec;
  readonly tutorDescriptor: TutorEvalTutorDescriptor;
  readonly runsPerCase?: number;
  readonly baselineId?: string;
  readonly corpusId: string;
  readonly corpusVersion?: string;
  readonly transport?: TutorBaselineCollectionTransport;
  readonly outputPath?: string;
  readonly resumeCorpus?: TutorResponseCorpus;
  readonly now?: () => Date;
}

/**
 * Collects only responses produced from the canonical execution packet. The
 * host receives one packet case per request; no TutorUnderTest conversion is
 * involved on this path.
 */
export async function collectCanonicalTutorModel(
  options: CollectCanonicalTutorModelOptions,
): Promise<TutorBaselineCollectionResult> {
  const generationSpec = parseTutorGenerationSpec(options.generationSpec);
  return collectTutorEvidence({
    dataset: options.dataset,
    ...(options.selectedCases === undefined ? {} : { selectedCases: options.selectedCases }),
    generationSpec,
    tutorDescriptor: options.tutorDescriptor,
    provenance: "recorded_model",
    ...(options.runsPerCase === undefined ? {} : { runsPerCase: options.runsPerCase }),
    ...(options.baselineId === undefined ? {} : { baselineId: options.baselineId }),
    corpusId: options.corpusId,
    ...(options.corpusVersion === undefined ? {} : { corpusVersion: options.corpusVersion }),
    transport: options.transport ?? "http",
    ...(options.outputPath === undefined ? {} : { outputPath: options.outputPath }),
    ...(options.resumeCorpus === undefined ? {} : { resumeCorpus: options.resumeCorpus }),
    ...(options.now === undefined ? {} : { now: options.now }),
    collectionMode: "canonical_model",
    executeResponse: async (tutorEvalCase, _runIndex) => {
      const packet = buildTutorExecutionPacketFile(
        options.dataset,
        [tutorEvalCase],
        generationSpec,
        options.promptAsset,
      );
      const result = await options.host.execute(packet);
      assertTutorGenerationSpecExecutionSupport(
        generationSpec,
        result.executionSupport,
      );
      return result.output;
    },
  });
}
