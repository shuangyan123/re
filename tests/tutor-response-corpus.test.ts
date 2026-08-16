import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { test } from "node:test";

import {
  buildTutorVisibleCasePacketFile,
  findTutorResponseCorpusValidationIssues,
  parseTutorResponseCorpus,
  parseTutorVisibleCasePacketFile,
  toTutorTurnInput,
  type TutorEvalCase,
  type TutorEvalDataset,
  type TutorResponseCorpus,
} from "../src/contracts/index.js";
import {
  deriveTutorResponseId,
  loadTutorBaselinePrompt,
} from "../src/corpus/index.js";
import {
  CorpusTutor,
  RecordedTutor,
  RecordedTutorResponseMissingError,
} from "../src/adapters/index.js";
import { loadTutorEvalDataset } from "../src/datasets/index.js";
import { toCalibrationCandidateResponseFile } from "../src/calibration/index.js";
import { buildCalibrationPacket } from "../src/calibration/index.js";
import {
  resolveTutorResponseCorpusSelection,
  runTutorResponseCorpus,
} from "../src/runner/index.js";
import { createDeepSeekJudge } from "../src/providers/deepseek/index.js";

async function loadDataset(): Promise<TutorEvalDataset> {
  return loadTutorEvalDataset("tutor-eval-v0.2a");
}

function makeCorpus(dataset: TutorEvalDataset): TutorResponseCorpus {
  const selectedCases = dataset.cases.filter((tutorEvalCase) =>
    ["fraction-misconception-001", "weak-foundation-fractions-001"].includes(
      tutorEvalCase.id,
    ),
  );
  const tutor = {
    provider: "review_workspace",
    model: "tutor-model",
    modelVersion: "snapshot-1",
    promptId: "tutor-baseline-system",
    promptVersion: "0.1",
    temperature: 0.2,
    reasoningEffort: "low",
    seed: 7,
  } as const;
  const corpusIdentity = {
    corpusId: "rw-corpus-test",
    corpusVersion: "0.4a.1",
  } as const;
  const responses = selectedCases.flatMap((tutorEvalCase) =>
    [1, 2].map((runIndex) => ({
      schemaVersion: 1 as const,
      responseId: deriveTutorResponseId({
        ...corpusIdentity,
        datasetId: dataset.id,
        datasetVersion: dataset.version,
        caseId: tutorEvalCase.id,
        caseVersion: tutorEvalCase.version,
        tutor,
        runIndex,
      }),
      caseId: tutorEvalCase.id,
      caseVersion: tutorEvalCase.version,
      runIndex,
      responseText: `Frozen response for ${tutorEvalCase.id} run ${runIndex}.`,
      provenance: "review_workspace" as const,
      metrics: {
        latencyMs: 18 + runIndex,
        tokenUsage: { inputTokens: 10, outputTokens: 8, totalTokens: 18 },
      },
    })),
  );
  return parseTutorResponseCorpus({
    schemaVersion: 1,
    ...corpusIdentity,
    datasetId: dataset.id,
    datasetVersion: dataset.version,
    createdAt: "2026-08-13T00:00:00.000Z",
    coverage: "partial",
    runsPerCase: 2,
    provenance: "review_workspace",
    tutor,
    responses,
  });
}

function selectedCase(dataset: TutorEvalDataset, id: string): TutorEvalCase {
  const tutorEvalCase = dataset.cases.find((caseValue) => caseValue.id === id);
  assert.ok(tutorEvalCase);
  return tutorEvalCase;
}

test("Tutor-visible case export is built from the single visible-input conversion", async () => {
  const dataset = await loadDataset();
  const tutorEvalCase = selectedCase(dataset, "fraction-misconception-001");
  const packet = buildTutorVisibleCasePacketFile(dataset, [tutorEvalCase]);
  const serialized = JSON.stringify(packet);
  assert.equal(packet.cases.length, 1);
  assert.equal(packet.cases[0]?.caseVersion, tutorEvalCase.version);
  assert.doesNotMatch(serialized, /evaluatorOnly|groundTruth|knownMisconception|rubrics|disclosurePolicy/);
  assert.doesNotMatch(serialized, /7\/12|answer_leakage|answer_non_disclosure/);
  assert.deepEqual(parseTutorVisibleCasePacketFile(packet), packet);
});

test("response identity is stable, explicit, and independent of array order", () => {
  const input = {
    corpusId: "corpus-a",
    corpusVersion: "1.0.0",
    datasetId: "dataset-a",
    datasetVersion: "1.0.0",
    caseId: "case-a",
    caseVersion: "1.0.0",
    tutor: {
      provider: "review_workspace",
      model: "model-a",
      promptVersion: "0.1",
    },
    runIndex: 1,
  } as const;
  const first = deriveTutorResponseId(input);
  const second = deriveTutorResponseId({ ...input });
  const secondRun = deriveTutorResponseId({ ...input, runIndex: 2 });
  assert.equal(first, second);
  assert.notEqual(first, secondRun);
  assert.match(first, /^tutor-response-[a-f0-9]{32}$/);
  assert.doesNotMatch(first, /api|key|prompt text/i);
});

test("valid corpus validates with repeated runs and records real provenance", async () => {
  const dataset = await loadDataset();
  const corpus = makeCorpus(dataset);
  assert.deepEqual(
    findTutorResponseCorpusValidationIssues({ corpus, dataset }),
    [],
  );
  assert.equal(corpus.provenance, "review_workspace");
  assert.equal(corpus.responses.length, 4);
  assert.notEqual(corpus.responses[0]?.responseId, corpus.responses[1]?.responseId);
});

test("corpus validation rejects unknown cases and wrong case versions", async () => {
  const dataset = await loadDataset();
  const corpus = makeCorpus(dataset);
  const unknownCase = {
    ...corpus,
    responses: [
      {
        ...corpus.responses[0]!,
        caseId: "unknown-case",
      },
    ],
  } as TutorResponseCorpus;
  const wrongVersion = {
    ...corpus,
    responses: [
      {
        ...corpus.responses[0]!,
        caseVersion: "stale-version",
      },
    ],
  } as TutorResponseCorpus;
  assert.ok(
    findTutorResponseCorpusValidationIssues({ corpus: unknownCase, dataset }).some(
      (issue) => issue.code === "unknown_case",
    ),
  );
  assert.ok(
    findTutorResponseCorpusValidationIssues({ corpus: wrongVersion, dataset }).some(
      (issue) => issue.code === "case_version_mismatch",
    ),
  );
});

test("duplicate response IDs and duplicate case/run identities are rejected", async () => {
  const dataset = await loadDataset();
  const corpus = makeCorpus(dataset);
  const duplicateResponseId = {
    ...corpus,
    responses: [corpus.responses[0]!, { ...corpus.responses[1]!, responseId: corpus.responses[0]!.responseId }],
  };
  const duplicateCaseRun = {
    ...corpus,
    responses: [corpus.responses[0]!, { ...corpus.responses[1]!, runIndex: corpus.responses[0]!.runIndex }],
  };
  assert.throws(() => parseTutorResponseCorpus(duplicateResponseId), /Tutor response corpus is invalid\./);
  assert.throws(() => parseTutorResponseCorpus(duplicateCaseRun), /Tutor response corpus is invalid\./);
});

test("RecordedTutor replays the exact frozen text for each case/run and never calls a model", async () => {
  const dataset = await loadDataset();
  const corpus = makeCorpus(dataset);
  const tutor = new RecordedTutor(corpus);
  const tutorEvalCase = selectedCase(dataset, "fraction-misconception-001");
  const output = await tutor.respond(toTutorTurnInput(tutorEvalCase, 2));
  assert.equal(output.text, "Frozen response for fraction-misconception-001 run 2.");
  assert.equal(output.metrics?.latencyMs, 20);
  await assert.rejects(
    () => tutor.respond({
      ...toTutorTurnInput(tutorEvalCase, 3),
      runIndex: 3,
    }),
    (error: unknown) => error instanceof RecordedTutorResponseMissingError,
  );
  const corpusTutor = new CorpusTutor(corpus);
  assert.equal((await corpusTutor.respond(toTutorTurnInput(tutorEvalCase))).text, "Frozen response for fraction-misconception-001 run 1.");
});

test("partial corpus evaluation reports selected, available, and missing coverage without changing corpus", async () => {
  const dataset = await loadDataset();
  const corpus = makeCorpus(dataset);
  const before = JSON.stringify(corpus);
  const result = await runTutorResponseCorpus({ corpus, dataset, runId: "corpus-test-run" });
  assert.equal(result.selectedCaseCount, 2);
  assert.equal(result.availableResponseCount, 4);
  assert.equal(result.missingCaseCount, dataset.cases.length - 2);
  assert.equal(result.evaluation.caseRunCount, 4);
  assert.equal(JSON.stringify(corpus), before);
});

test("corpus evaluation applies stable case selection before limit and records subset metadata", async () => {
  const dataset = await loadDataset();
  const corpus = makeCorpus(dataset);
  const before = JSON.stringify(corpus);
  const result = await runTutorResponseCorpus({
    corpus,
    dataset,
    caseIds: ["weak-foundation-fractions-001", "fraction-misconception-001"],
    limit: 1,
    runId: "corpus-selection-test",
  });
  assert.equal(result.coverage, "partial");
  assert.equal(result.selectedCaseCount, 1);
  assert.equal(result.availableResponseCount, 4);
  assert.equal(result.missingCaseCount, dataset.cases.length - 2);
  assert.deepEqual(result.evaluationSelection, {
    mode: "explicit_cases_limit",
    requestedCaseIds: ["weak-foundation-fractions-001", "fraction-misconception-001"],
    selectedCaseIds: ["fraction-misconception-001"],
    limit: 1,
    selectedResponseCount: 2,
  });
  assert.deepEqual(
    result.evaluation.caseResults.map((caseResult) => caseResult.caseId),
    ["fraction-misconception-001", "fraction-misconception-001"],
  );
  assert.equal(JSON.stringify(corpus), before);
});

test("corpus selection fails closed for unknown, missing, duplicate, and invalid requests", async () => {
  const dataset = await loadDataset();
  const corpus = makeCorpus(dataset);
  for (const options of [
    { caseIds: ["not-a-dataset-case"] },
    { caseIds: ["hint-only-linear-equation-001"] },
    { caseIds: ["fraction-misconception-001", "fraction-misconception-001"] },
    { limit: 0 },
    { limit: -1 },
    { limit: 1.5 },
  ]) {
    assert.throws(
      () => resolveTutorResponseCorpusSelection(corpus, dataset, options),
      /TutorEval corpus selection is invalid\./,
    );
  }
  const limited = resolveTutorResponseCorpusSelection(corpus, dataset, { limit: 99 });
  assert.deepEqual(limited.selection.selectedCaseIds, [
    "fraction-misconception-001",
    "weak-foundation-fractions-001",
  ]);
});

test("a selected frozen case can use the DeepSeek Judge without re-calling Tutor", async () => {
  const dataset = await loadDataset();
  const corpus = makeCorpus(dataset);
  const before = JSON.stringify(corpus);
  let judgeCalls = 0;
  const judge = createDeepSeekJudge({
    model: "deepseek-chat",
    prompt: "Synthetic provider test prompt.",
    promptId: "synthetic-judge",
    promptVersion: "test",
    apiKey: "synthetic-key",
    fetch: async (_url, init) => {
      judgeCalls += 1;
      const request = JSON.parse(init.body) as {
        readonly messages: readonly { readonly content: string }[];
      };
      const serialized = JSON.parse(request.messages[1]!.content) as {
        readonly payload: {
          readonly caseId: string;
          readonly rubrics: readonly { readonly id: string }[];
        };
      };
      return {
        status: 200,
        json: async () => ({
          choices: [{
            message: {
              content: JSON.stringify({
                schemaVersion: 1,
                caseId: serialized.payload.caseId,
                rubricResults: serialized.payload.rubrics.map((rubric) => ({
                  rubricId: rubric.id,
                  result: "PASS",
                  evidence: "Synthetic Judge evidence.",
                })),
                criticalFailures: [],
                factualErrors: [],
                insufficientInformation: false,
              }),
            },
          }],
          usage: { prompt_tokens: 20, completion_tokens: 10, total_tokens: 30 },
        }),
      };
    },
  });
  const result = await runTutorResponseCorpus({
    corpus,
    dataset,
    caseIds: ["fraction-misconception-001"],
    judge: {
      ...judge.descriptor,
      evaluateWithMetrics: judge.evaluateWithMetrics,
    },
  });
  assert.equal(result.evaluation.judge?.provider, "deepseek");
  assert.equal(result.selectedCaseCount, 1);
  assert.equal(result.evaluation.caseRunCount, 2);
  assert.equal(result.evaluation.errorCount, 0);
  assert.equal(result.evaluation.overallScore !== null, true);
  assert.equal(
    result.evaluation.caseResults.every((caseResult) => caseResult.rawJudgeResult !== null),
    true,
  );
  assert.equal(judgeCalls, 2);
  assert.equal(JSON.stringify(corpus), before);
});

test("a corpus declared full fails clearly when a dataset case is missing", async () => {
  const dataset = await loadDataset();
  const partial = makeCorpus(dataset);
  const full = { ...partial, coverage: "full" as const };
  const issues = findTutorResponseCorpusValidationIssues({ corpus: full, dataset });
  assert.ok(issues.some((issue) => issue.code === "missing_response"));
  await assert.rejects(
    () => runTutorResponseCorpus({ corpus: full, dataset }),
    /Tutor response corpus is invalid\./,
  );
  assert.ok(
    findTutorResponseCorpusValidationIssues({
      corpus: partial,
      dataset,
      requireFull: true,
    }).some((issue) => issue.code === "coverage_mismatch"),
  );
});

test("real corpus responses convert directly into the existing calibration packet", async () => {
  const dataset = await loadDataset();
  const corpus = makeCorpus(dataset);
  const candidates = toCalibrationCandidateResponseFile(corpus);
  assert.equal(candidates.dataKind, "candidate-corpus");
  assert.equal(candidates.responses[0]?.sourceCorpus?.corpusVersion, corpus.corpusVersion);
  const packet = buildCalibrationPacket(dataset, candidates);
  const rubricCount = corpus.responses.reduce((count, response) => {
    const tutorEvalCase = selectedCase(dataset, response.caseId);
    return count + tutorEvalCase.evaluatorOnly.rubrics.length;
  }, 0);
  assert.equal(packet.entries.length, rubricCount);
  assert.equal(packet.entries[0]?.responseId, candidates.responses[0]?.responseId);
  assert.doesNotMatch(JSON.stringify(packet.entries[0]), /provider|model|promptVersion|apiKey/);
});

test("corpus parser rejects credentials and raw provider payload fields", () => {
  assert.throws(
    () =>
      parseTutorResponseCorpus({
        schemaVersion: 1,
        corpusId: "corpus",
        corpusVersion: "1.0.0",
        datasetId: "dataset",
        datasetVersion: "1.0.0",
        createdAt: "2026-08-13T00:00:00.000Z",
        coverage: "partial",
        runsPerCase: 1,
        provenance: "review_workspace",
        tutor: {
          provider: "provider",
          model: "model",
          promptVersion: "0.1",
          apiKey: "should-not-be-here",
        },
        responses: [],
      }),
    /Tutor response corpus is invalid\./,
  );
});

test("baseline prompt is versioned behavior guidance and contains no evaluator annotations", async () => {
  const prompt = await loadTutorBaselinePrompt();
  assert.match(prompt, /Tutor baseline system prompt v0\.2/);
  assert.match(prompt, /targetLocale/);
  assert.doesNotMatch(prompt, /rubric|groundTruth|knownMisconception|Judge|evaluatorOnly/i);
});

test("corpus core remains independent from Review Workspace and provider SDK internals", async () => {
  const sourcePaths = [
    "src/contracts/tutor-response-corpus.ts",
    "src/contracts/tutor-response-corpus-validation.ts",
    "src/corpus/identity.ts",
    "src/corpus/io.ts",
  ];
  const sources = await Promise.all(
    sourcePaths.map((path) => readFile(resolve(process.cwd(), path), "utf8")),
  );
  for (const source of sources) {
    assert.doesNotMatch(source, /shuangyan123[\\/]demo|app[\\/]server[\\/]ai|from ["']openai|from ["']dexie/i);
  }
});
