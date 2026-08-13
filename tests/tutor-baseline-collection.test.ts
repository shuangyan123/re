import assert from "node:assert/strict";
import { test } from "node:test";

import {
  collectTutorBaseline,
} from "../src/collection/index.js";
import {
  findTutorResponseCorpusValidationIssues,
  toTutorTurnInput,
  type TutorEvalDataset,
  type TutorUnderTest,
} from "../src/contracts/index.js";
import { deriveTutorResponseId } from "../src/corpus/index.js";
import { RecordedTutor } from "../src/adapters/index.js";
import { loadTutorEvalDataset } from "../src/datasets/index.js";
import { runTutorResponseCorpus } from "../src/runner/index.js";

async function collectionContext(caseCount = 2): Promise<{
  readonly dataset: TutorEvalDataset;
}> {
  const fullDataset = await loadTutorEvalDataset("tutor-eval-v0.2a");
  const dataset = {
    ...fullDataset,
    cases: fullDataset.cases.slice(0, caseCount),
  };
  return { dataset };
}

function descriptor() {
  return {
    provider: "fixture-provider",
    model: "fixture-model",
    promptId: "product-config",
    promptVersion: "product-config-v1",
  } as const;
}

function collectionOptions(
  dataset: TutorEvalDataset,
  tutor: TutorUnderTest,
  overrides: Partial<Parameters<typeof collectTutorBaseline>[0]> = {},
) {
  return {
    tutor,
    dataset,
    tutorDescriptor: descriptor(),
    provenance: "synthetic" as const,
    corpusId: "fixture-baseline",
    corpusVersion: "product-v1",
    ...overrides,
  };
}

test("collection freezes a full synthetic corpus and preserves only sanitized output fields", async () => {
  const { dataset } = await collectionContext();
  const inputs: string[] = [];
  const tutor: TutorUnderTest = {
    id: "fixture-tutor",
    async respond(input) {
      inputs.push(`${input.caseId}:${input.runIndex}`);
      return {
        text: `Fixture response for ${input.caseId}.`,
        metrics: {
          latencyMs: 12,
          tokenUsage: { inputTokens: 3, outputTokens: 4, totalTokens: 7 },
          cost: 0.001,
        },
        metadata: { apiKey: "must not enter frozen evidence" },
      };
    },
  };

  const result = await collectTutorBaseline(
    collectionOptions(dataset, tutor, {
      transport: "tutor",
    }),
  );

  assert.ok(result.corpus);
  assert.equal(result.report.coverage, "full");
  assert.equal(result.report.completedResponseCount, 2);
  assert.equal(result.report.failedTutorCallCount, 0);
  assert.deepEqual(inputs, dataset.cases.map((tutorEvalCase) => `${tutorEvalCase.id}:1`));
  assert.equal(result.corpus.generationSpec, undefined);
  assert.equal(result.report.collectionMode, "product_tutor");
  assert.deepEqual(result.corpus.tutor, descriptor());
  assert.deepEqual(result.corpus.responses[0]?.metrics, {
    latencyMs: 12,
    tokenUsage: { inputTokens: 3, outputTokens: 4, totalTokens: 7 },
    cost: 0.001,
  });
  assert.doesNotMatch(JSON.stringify(result.corpus), /apiKey|metadata|fixture-provider\/fixture-model/);
  assert.deepEqual(findTutorResponseCorpusValidationIssues({ corpus: result.corpus, dataset }), []);

  const recorded = new RecordedTutor(result.corpus);
  assert.equal(
    (await recorded.respond(toTutorTurnInput(dataset.cases[0]!))).text,
    `Fixture response for ${dataset.cases[0]!.id}.`,
  );
  const evaluation = await runTutorResponseCorpus({
    corpus: result.corpus,
    dataset,
    runId: "fixture-baseline-evaluation",
  });
  assert.equal(evaluation.availableResponseCount, 2);
  assert.equal(evaluation.evaluation.caseRunCount, 2);
});

test("partial collection preserves completed responses, records sanitized failures, and never retries", async () => {
  const { dataset } = await collectionContext(3);
  const failedCaseId = dataset.cases[1]!.id;
  let callCount = 0;
  const tutor: TutorUnderTest = {
    id: "partial-fixture-tutor",
    async respond(input) {
      callCount += 1;
      if (input.caseId === failedCaseId) {
        throw new Error("simulated provider secret should not be persisted");
      }
      return { text: `Completed ${input.caseId}.` };
    },
  };

  const result = await collectTutorBaseline(
    collectionOptions(dataset, tutor),
  );

  assert.ok(result.corpus);
  assert.equal(callCount, 3);
  assert.equal(result.report.coverage, "partial");
  assert.equal(result.report.completedResponseCount, 2);
  assert.deepEqual(result.report.failures, [{
    caseId: failedCaseId,
    caseVersion: dataset.cases[1]!.version,
    runIndex: 1,
    code: "tutor_call_failed",
  }]);
  assert.equal(result.corpus.responses.length, 2);
  assert.doesNotMatch(JSON.stringify(result.corpus), /simulated provider secret|HTTP 5/);
  assert.deepEqual(findTutorResponseCorpusValidationIssues({ corpus: result.corpus, dataset }), []);
});

test("partial repeated runs keep run identity and allow incomplete evidence without inventing a response", async () => {
  const { dataset } = await collectionContext(1);
  const tutor: TutorUnderTest = {
    id: "repeated-fixture-tutor",
    async respond(input) {
      if (input.runIndex === 2) {
        throw new Error("second run failed");
      }
      return { text: "Only the first run completed." };
    },
  };
  const result = await collectTutorBaseline(
    collectionOptions(dataset, tutor, {
      runsPerCase: 2,
      corpusId: "repeated-fixture",
    }),
  );

  assert.ok(result.corpus);
  assert.equal(result.corpus.coverage, "partial");
  assert.equal(result.corpus.responses.length, 1);
  assert.equal(result.corpus.responses[0]?.runIndex, 1);
  assert.equal(
    result.corpus.responses[0]?.responseId,
    deriveTutorResponseId({
      corpusId: "repeated-fixture",
      corpusVersion: "product-v1",
      datasetId: dataset.id,
      datasetVersion: dataset.version,
      caseId: dataset.cases[0]!.id,
      caseVersion: dataset.cases[0]!.version,
      tutor: descriptor(),
      runIndex: 1,
    }),
  );
  assert.deepEqual(findTutorResponseCorpusValidationIssues({ corpus: result.corpus, dataset }), []);
});

test("collection with no completed Tutor calls returns a report and no fake corpus", async () => {
  const { dataset } = await collectionContext(1);
  const tutor: TutorUnderTest = {
    id: "empty-fixture-tutor",
    async respond() {
      throw new Error("no response");
    },
  };
  const result = await collectTutorBaseline(
    collectionOptions(dataset, tutor),
  );

  assert.equal(result.corpus, null);
  assert.equal(result.report.completedResponseCount, 0);
  assert.equal(result.report.failedTutorCallCount, 1);
  assert.equal(result.report.coverage, "partial");
});

test("response identity changes with model identity but never includes endpoint material", async () => {
  const { dataset } = await collectionContext(1);
  const tutor: TutorUnderTest = {
    id: "identity-fixture-tutor",
    async respond() {
      return { text: "Identity fixture response." };
    },
  };
  const first = await collectTutorBaseline(
    collectionOptions(dataset, tutor),
  );
  const second = await collectTutorBaseline(
    collectionOptions(dataset, tutor, {
      corpusId: "fixture-baseline-model-b",
      tutorDescriptor: {
        ...descriptor(),
        model: "fixture-model-b",
      },
    }),
  );
  assert.ok(first.corpus && second.corpus);
  assert.notEqual(first.corpus.responses[0]?.responseId, second.corpus.responses[0]?.responseId);
  assert.doesNotMatch(JSON.stringify(first.corpus), /127\.0\.0\.1|authorization|password|apiKey|rawProviderPayload/i);
});
