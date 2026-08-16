import assert from "node:assert/strict";
import { test } from "node:test";

import * as publicApi from "../src/index.js";
import type { TutorEvalDataset, TutorUnderTest } from "../src/index.js";

function makeDeterministicDataset(): TutorEvalDataset {
  return {
    id: "synthetic-public-dataset",
    version: "1.0.0",
    cases: [
      {
        schemaVersion: 1,
        id: "public-case-001",
        version: "1.0.0",
        metadata: {
          subject: "mathematics",
          topic: "reasoning",
        },
        tutorInput: {
          learningObjective: "Offer one useful learning step.",
          studentMessage: "Can you give me a hint?",
        },
        evaluatorOnly: {
          disclosurePolicy: "hint_only",
          rubrics: [
            {
              id: "response-present",
              category: "guidance",
              criterion: "The Tutor returns a non-empty response.",
              weight: 1,
              evaluationType: "deterministic",
              evaluatorId: "empty_response",
            },
          ],
        },
      },
    ],
  };
}

test("package root exposes the small public runner surface", () => {
  assert.equal(typeof publicApi.runTutorBenchmark, "function");
  assert.equal(typeof publicApi.runTutorEval, "function");
  assert.equal(typeof publicApi.loadTutorEvalDataset, "function");
  assert.equal("runBenchmark" in publicApi, false);
  assert.equal("runTutorResponseCorpus" in publicApi, false);
  assert.equal("ScriptedTutor" in publicApi, false);
});

test("a custom Tutor can run an inline deterministic dataset through the public API", async () => {
  const receivedInputs: string[] = [];
  const tutor: TutorUnderTest = {
    id: "custom-public-tutor",
    async respond(input) {
      receivedInputs.push(input.currentStudentMessage);
      assert.equal("evaluatorOnly" in input, false);
      assert.equal(input.caseId, "public-case-001");
      return { text: "Try identifying the first step." };
    },
  };

  const result = await publicApi.runTutorBenchmark({
    tutor,
    dataset: makeDeterministicDataset(),
    runId: "public-run",
  });

  assert.deepEqual(receivedInputs, ["Can you give me a hint?"]);
  assert.equal(result.runId, "public-run");
  assert.equal(result.tutor.provider, "custom");
  assert.equal(result.tutor.model, "custom-public-tutor");
  assert.equal(result.caseCount, 1);
  assert.equal(result.passedCount, 1);
  assert.equal(result.errorCount, 0);
  assert.equal(result.overallScore, 1);
});

test("the default dataset loader resolves the canonical TutorEval dataset", async () => {
  const dataset = await publicApi.loadTutorEvalDataset();

  assert.equal(dataset.id, publicApi.TUTOR_EVAL_DATASET_ID);
  assert.equal(dataset.version, publicApi.TUTOR_EVAL_DATASET_VERSION);
  assert.equal(dataset.cases.length, 48);
  assert.deepEqual(
    Object.fromEntries(
      dataset.cases.reduce((counts, tutorEvalCase) => {
        const locale = tutorEvalCase.locale ?? "en";
        counts.set(locale, (counts.get(locale) ?? 0) + 1);
        return counts;
      }, new Map<string, number>()),
    ),
    { en: 24, "zh-CN": 24 },
  );
});
