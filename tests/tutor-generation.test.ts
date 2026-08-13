import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { test } from "node:test";

import {
  BenchmarkConfigurationError,
  buildTutorExecutionPacketFile,
  buildTutorGenerationMessages,
  buildTutorVisibleCasePacketFile,
  createTutorGenerationSpec,
  digestTutorPrompt,
  findTutorResponseCorpusValidationIssues,
  parseTutorExecutionPacketFile,
  parseTutorGenerationSpec,
  parseTutorResponseCorpus,
  serializeTutorStudentProfile,
  toTutorTurnInput,
  type TutorEvalCase,
  type TutorEvalDataset,
  type TutorResponseCorpus,
  type TutorVisibleCasePacket,
} from "../src/contracts/index.js";
import {
  buildTutorBaselineGenerationSpec,
  loadTutorBaselinePrompt,
} from "../src/corpus/index.js";
import { deriveTutorResponseId } from "../src/corpus/index.js";
import { runDryTutorExecutionPacket } from "../src/adapters/index.js";
import { loadTutorEvalDataset } from "../src/datasets/index.js";

async function loadContext(): Promise<{
  readonly dataset: TutorEvalDataset;
  readonly promptAsset: string;
}> {
  return {
    dataset: await loadTutorEvalDataset("tutor-eval-v0.2a"),
    promptAsset: await loadTutorBaselinePrompt(),
  };
}

function selectedCase(dataset: TutorEvalDataset): TutorEvalCase {
  const tutorEvalCase = dataset.cases.find(
    (caseValue) => caseValue.id === "fraction-misconception-001",
  );
  assert.ok(tutorEvalCase);
  return tutorEvalCase;
}

function visibleFixture(): TutorVisibleCasePacket {
  return {
    caseId: "canonical-case",
    caseVersion: "1.0.0",
    learningObjective: "Understand equivalent fractions.",
    studentProfile: {
      level: "elementary",
      knownConcepts: ["fractions"],
      misconceptions: ["different-sized units"],
      goal: "Solve the next problem independently.",
    },
    conversationHistory: [
      { role: "student", text: "I added the denominators." },
      { role: "tutor", text: "What do the denominators describe?" },
    ],
    studentMessage: "Can you give me a hint?",
    problemContext: "Add 1/3 and 1/6 without giving the final answer.",
  };
}

test("TutorGenerationSpec validates bounded parameters and optional values", async () => {
  const { promptAsset } = await loadContext();
  const spec = createTutorGenerationSpec({
    specId: "test-generation",
    specVersion: "1.0.0",
    prompt: {
      id: "test-prompt",
      version: "1.0.0",
      sha256: digestTutorPrompt(promptAsset),
    },
    maxOutputTokens: 256,
  });
  assert.deepEqual(parseTutorGenerationSpec(spec), spec);
  assert.equal("temperature" in spec, false);
  assert.throws(
    () => parseTutorGenerationSpec({ ...spec, maxOutputTokens: 0 }),
    (error: unknown) =>
      error instanceof BenchmarkConfigurationError &&
      error.code === "tutor_generation_spec_invalid",
  );
  assert.throws(
    () => parseTutorGenerationSpec({ ...spec, maxOutputTokens: 32_769 }),
    /Tutor generation specification is invalid\./,
  );
  assert.throws(
    () => parseTutorGenerationSpec({ ...spec, provider: "openai" }),
    /Tutor generation specification is invalid\./,
  );
});

test("prompt digest is deterministic and changes when prompt content changes", () => {
  const first = digestTutorPrompt("prompt bytes\n");
  assert.equal(first, digestTutorPrompt("prompt bytes\n"));
  assert.notEqual(first, digestTutorPrompt("prompt bytes changed\n"));
  assert.match(first, /^[a-f0-9]{64}$/);
});

test("canonical messages preserve roles and are deterministic", async () => {
  const { promptAsset } = await loadContext();
  const generationSpec = buildTutorBaselineGenerationSpec(promptAsset);
  const visibleCase = visibleFixture();
  const first = buildTutorGenerationMessages(visibleCase, generationSpec, promptAsset);
  const second = buildTutorGenerationMessages(
    { ...visibleCase, conversationHistory: [...visibleCase.conversationHistory] },
    generationSpec,
    promptAsset,
  );
  assert.deepEqual(first, second);
  assert.deepEqual(first.map((message) => message.role), [
    "system",
    "user",
    "user",
    "assistant",
    "user",
  ]);
  assert.equal(first[0]?.content, promptAsset);
  assert.match(first[1]?.content ?? "", /learningObjective=/);
  assert.match(first[1]?.content ?? "", /studentProfile=\{"level":"elementary"/);
  assert.equal(first[3]?.content, "What do the denominators describe?");
  assert.equal(first[4]?.content, visibleCase.studentMessage);
});

test("student profile serialization has fixed fields and missing input defaults stay stable", async () => {
  const { dataset, promptAsset } = await loadContext();
  const base = selectedCase(dataset);
  const withoutOptionalInput = {
    ...base,
    tutorInput: {
      learningObjective: base.tutorInput.learningObjective,
      studentMessage: base.tutorInput.studentMessage,
    },
  } satisfies TutorEvalCase;
  const input = toTutorTurnInput(withoutOptionalInput);
  assert.deepEqual(input.studentState, {
    knownConcepts: [],
    misconceptions: [],
    level: "unspecified",
    goal: "unspecified",
  });
  assert.equal(
    serializeTutorStudentProfile(input.studentState),
    '{"level":"unspecified","knownConcepts":[],"misconceptions":[],"goal":"unspecified"}',
  );
  const visiblePacket = buildTutorVisibleCasePacketFile(dataset, [withoutOptionalInput]);
  const spec = buildTutorBaselineGenerationSpec(promptAsset);
  assert.doesNotThrow(() =>
    buildTutorGenerationMessages(visiblePacket.cases[0]!, spec, promptAsset),
  );
});

test("execution packet is ordered, provider-independent, and blocks hidden data", async () => {
  const { dataset, promptAsset } = await loadContext();
  const generationSpec = buildTutorBaselineGenerationSpec(promptAsset);
  const cases = [dataset.cases[3]!, dataset.cases[0]!];
  const first = buildTutorExecutionPacketFile(dataset, cases, generationSpec, promptAsset);
  const second = buildTutorExecutionPacketFile(
    dataset,
    [...cases].reverse(),
    generationSpec,
    promptAsset,
  );
  assert.equal(JSON.stringify(first), JSON.stringify(second));
  assert.deepEqual(
    first.cases.map((caseValue) => caseValue.caseId),
    [...first.cases].map((caseValue) => caseValue.caseId).sort(),
  );
  const serialized = JSON.stringify(first);
  assert.doesNotMatch(
    serialized,
    /evaluatorOnly|groundTruth|knownMisconception|rubrics|rubricId|criticalFailure|Judge|humanAnnotations|referenceLabels/i,
  );
  assert.doesNotMatch(serialized, /7\/12|different-sized units|answer_non_disclosure/);
  assert.doesNotMatch(serialized, /provider|apiKey|credential|connectionId/);
  assert.equal(first.generationSpec.prompt.sha256, digestTutorPrompt(promptAsset));

  const tampered = JSON.parse(JSON.stringify(first)) as Record<string, unknown>;
  const firstCase = (tampered.cases as Array<Record<string, unknown>>)[0];
  assert.ok(firstCase);
  firstCase.rubrics = ["hidden"];
  assert.throws(
    () => parseTutorExecutionPacketFile(tampered),
    /Tutor execution packet is invalid\./,
  );
  const wrongPromptIdentity = JSON.parse(JSON.stringify(first)) as {
    generationSpec: { prompt: { sha256: string } };
  };
  wrongPromptIdentity.generationSpec.prompt.sha256 = digestTutorPrompt("different prompt");
  assert.throws(
    () => parseTutorExecutionPacketFile(wrongPromptIdentity),
    /Tutor execution packet is invalid\./,
  );
});

test("dry executor consumes only the execution packet and emits generation-bound corpus", async () => {
  const { dataset, promptAsset } = await loadContext();
  const generationSpec = buildTutorBaselineGenerationSpec(promptAsset);
  const packet = buildTutorExecutionPacketFile(
    dataset,
    [selectedCase(dataset)],
    generationSpec,
    promptAsset,
  );
  const seen: string[] = [];
  const corpus = await runDryTutorExecutionPacket(packet, {
    corpusId: "dry-corpus",
    corpusVersion: "0.4a.1",
    createdAt: "2026-08-13T00:00:00.000Z",
    respond: (input) => {
      seen.push(`${input.caseId}:${input.messages.length}`);
      return `Dry response for ${input.caseId}.`;
    },
  });
  assert.deepEqual(seen, ["fraction-misconception-001:3"]);
  assert.deepEqual(corpus.generationSpec, generationSpec);
  assert.equal(corpus.responses[0]?.provenance, "synthetic");
  assert.deepEqual(
    findTutorResponseCorpusValidationIssues({ corpus, dataset }),
    [],
  );
});

test("corpus generation identity rejects mismatched spec and response IDs", async () => {
  const { dataset, promptAsset } = await loadContext();
  const tutorEvalCase = selectedCase(dataset);
  const generationSpec = buildTutorBaselineGenerationSpec(promptAsset);
  const tutor = {
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
  } as const;
  const corpusIdentity = {
    corpusId: "identity-corpus",
    corpusVersion: "0.4a.1",
  } as const;
  const corpus = parseTutorResponseCorpus({
    schemaVersion: 1,
    ...corpusIdentity,
    datasetId: dataset.id,
    datasetVersion: dataset.version,
    createdAt: "2026-08-13T00:00:00.000Z",
    coverage: "partial",
    runsPerCase: 1,
    provenance: "synthetic",
    generationSpec,
    tutor,
    responses: [{
      schemaVersion: 1,
      responseId: deriveTutorResponseId({
        ...corpusIdentity,
        datasetId: dataset.id,
        datasetVersion: dataset.version,
        caseId: tutorEvalCase.id,
        caseVersion: tutorEvalCase.version,
        tutor,
        generationSpec,
        runIndex: 1,
      }),
      caseId: tutorEvalCase.id,
      caseVersion: tutorEvalCase.version,
      runIndex: 1,
      responseText: "Frozen dry response.",
      provenance: "synthetic",
    }],
  });
  assert.deepEqual(findTutorResponseCorpusValidationIssues({ corpus, dataset }), []);

  const changedSpec = { ...generationSpec, maxOutputTokens: generationSpec.maxOutputTokens + 1 };
  const changedPacket = buildTutorExecutionPacketFile(
    dataset,
    [tutorEvalCase],
    changedSpec,
    promptAsset,
  );
  const originalResponseId = deriveTutorResponseId({
    ...corpusIdentity,
    datasetId: dataset.id,
    datasetVersion: dataset.version,
    caseId: tutorEvalCase.id,
    caseVersion: tutorEvalCase.version,
    tutor,
    generationSpec,
    runIndex: 1,
  });
  const changedResponseId = deriveTutorResponseId({
    ...corpusIdentity,
    datasetId: dataset.id,
    datasetVersion: dataset.version,
    caseId: tutorEvalCase.id,
    caseVersion: tutorEvalCase.version,
    tutor,
    generationSpec: changedSpec,
    runIndex: 1,
  });
  assert.notEqual(originalResponseId, changedResponseId);
  const mismatched = { ...corpus, generationSpec: changedSpec } as TutorResponseCorpus;
  const issues = findTutorResponseCorpusValidationIssues({ corpus: mismatched, dataset });
  assert.ok(issues.some((issue) => issue.code === "response_identity_mismatch"));
  assert.ok(
    findTutorResponseCorpusValidationIssues({
      corpus,
      dataset,
      executionPacket: changedPacket,
    }).some((issue) => issue.code === "generation_spec_mismatch"),
  );
});

test("old corpus without generationSpec remains readable", async () => {
  const { dataset } = await loadContext();
  const tutorEvalCase = selectedCase(dataset);
  const tutor = {
    provider: "legacy",
    model: "legacy-model",
    promptVersion: "0.1",
  } as const;
  const corpus = parseTutorResponseCorpus({
    schemaVersion: 1,
    corpusId: "legacy-corpus",
    corpusVersion: "0.4a",
    datasetId: dataset.id,
    datasetVersion: dataset.version,
    createdAt: "2026-08-13T00:00:00.000Z",
    coverage: "partial",
    runsPerCase: 1,
    provenance: "recorded_model",
    tutor,
    responses: [{
      schemaVersion: 1,
      responseId: "legacy-response-1",
      caseId: tutorEvalCase.id,
      caseVersion: tutorEvalCase.version,
      runIndex: 1,
      responseText: "Legacy frozen response.",
      provenance: "recorded_model",
    }],
  });
  assert.equal(corpus.generationSpec, undefined);
  assert.deepEqual(findTutorResponseCorpusValidationIssues({ corpus, dataset }), []);
});

test("generation contract files remain provider and product independent", async () => {
  const sourcePaths = [
    "src/contracts/tutor-generation.ts",
    "src/contracts/tutor-execution.ts",
    "src/adapters/dry-tutor-executor.ts",
  ];
  const sources = await Promise.all(
    sourcePaths.map((path) => readFile(resolve(process.cwd(), path), "utf8")),
  );
  for (const source of sources) {
    assert.doesNotMatch(source, /shuangyan123[\\/]demo|app[\\/]server[\\/]ai|from ["']openai|from ["']dexie/i);
  }
});
