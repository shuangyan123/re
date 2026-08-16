import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";

import { ScriptedTutor } from "../src/adapters/scripted-tutor.js";
import {
  buildTutorVisibleCasePacketFile,
  parseTutorEvalCase,
  toTutorTurnInput,
  type TutorEvalCase,
  type TutorEvalDataset,
} from "../src/contracts/index.js";
import { deriveTutorResponseId } from "../src/corpus/identity.js";
import { loadTutorEvalDataset } from "../src/datasets/index.js";
import { buildWebsite } from "../src/cli/website-build.js";
import {
  parseTutorEvaluationAuditArtifact,
  type TutorEvaluationAuditArtifact,
} from "../src/reporting/index.js";
import {
  buildReviewTranslationArtifact,
  buildReviewTranslationSources,
  createHttpReviewTranslator,
  createReviewTranslationLookup,
  hashReviewTranslationSource,
  parseReviewTranslationArtifact,
  ReviewTranslationProviderError,
} from "../src/review-translation/index.js";
import { runReviewTranslate, parseReviewTranslateArgs } from "../src/cli/review-translate.js";
import { runTutorEval } from "../src/runner/index.js";
import { renderTutorEvaluationAuditPage } from "../src/site/pages/audit.js";

function makeReviewCase(): TutorEvalCase {
  return parseTutorEvalCase({
    schemaVersion: 1,
    id: "review-case-001",
    version: "1.0.0",
    locale: "en",
    metadata: {
      subject: "history",
      topic: "source perspective",
    },
    tutorInput: {
      learningObjective: "Explain how perspective and context shape a source.",
      studentProfile: {
        knownConcepts: ["primary sources"],
        misconceptions: ["a source is always neutral"],
        level: "secondary",
        goal: "Compare two accounts independently.",
      },
      conversationHistory: [
        { role: "student", text: "I found two different accounts." },
        { role: "tutor", text: "What details does each author emphasize?" },
      ],
      studentMessage: "Why do these sources describe the event differently?",
      problemContext: "Compare two accounts of the same historical event.",
    },
    evaluatorOnly: {
      groundTruth: {
        finalAnswer: "The accounts reflect perspective and context.",
        requiredConcepts: ["perspective"],
      },
      disclosurePolicy: "hint_only",
      rubrics: [
        {
          id: "review-guidance",
          category: "guidance",
          criterion: "Offer one useful next step without giving the conclusion.",
          weight: 1,
          evaluationType: "deterministic",
          evaluatorId: "empty_response",
        },
        {
          id: "review-judge",
          category: "correctness",
          criterion: "Explain how perspective and context can affect a source.",
          weight: 1,
          critical: true,
          evaluationType: "judge",
          criticalFailure: {
            type: "misconception_reinforcement",
            severity: "major",
          },
        },
      ],
    },
  });
}

async function makeReviewFixture(): Promise<{
  readonly dataset: TutorEvalDataset;
  readonly artifact: TutorEvaluationAuditArtifact;
  readonly tutorEvalCase: TutorEvalCase;
}> {
  const tutorEvalCase = makeReviewCase();
  const dataset: TutorEvalDataset = {
    id: "review-dataset",
    version: "1.0.0",
    cases: [tutorEvalCase],
  };
  const evaluation = await runTutorEval({
    dataset,
    tutor: new ScriptedTutor({
      id: "review-tutor",
      responses: {
        [tutorEvalCase.id]: "**Tutor original response**\n\nAsk the learner to compare both authors.",
      },
    }),
    runId: "review-run-001",
    tutorDescriptor: {
      provider: "fixture",
      model: "fixture-tutor",
      promptVersion: "fixture-prompt",
    },
    judge: {
      provider: "fixture",
      model: "fixture-judge",
      promptVersion: "fixture-judge-prompt",
      evaluate: async () => ({
        schemaVersion: 1,
        caseId: tutorEvalCase.id,
        rubricResults: [{
          rubricId: "review-judge",
          result: "PASS",
          evidence: "The tutor identifies perspective but does not compare the writing context.",
        }],
        criticalFailures: [{
          type: "misconception_reinforcement",
          severity: "major",
          evidence: "The tutor could reinforce the idea that sources are neutral.",
        }],
        factualErrors: [{
          severity: "major",
          description: "The explanation omits the author's historical context.",
        }],
        insufficientInformation: false,
      }),
    },
  });
  const evaluationWithDiagnostic = {
    ...evaluation,
    caseResults: evaluation.caseResults.map((caseResult) => ({
      ...caseResult,
      rubricResults: caseResult.rubricResults.map((rubricResult) => ({
        ...rubricResult,
        diagnostics: rubricResult.rubricId === "review-judge"
          ? [{ code: "rubric_review_note", message: "Rubric diagnostic text that needs review translation." }]
          : rubricResult.diagnostics,
      })),
      diagnostics: [{
        code: "judge_review_note",
        message: "Judge diagnostic text that needs review translation.",
      }],
    })),
  };
  return {
    dataset,
    tutorEvalCase,
    artifact: parseTutorEvaluationAuditArtifact({
      evaluation: evaluationWithDiagnostic,
      artifactMetadata: { status: "preliminary" },
    }),
  };
}

function makeFixtureTranslator(
  requests: Array<{ readonly sourceText: string; readonly sourceType: string }>,
  translatedText = (sourceText: string) => `翻译：${sourceText}`,
) {
  return {
    provider: "scripted-review-translator",
    model: "fixture-model",
    translate: async (request: { readonly sourceText: string; readonly sourceType: string }) => {
      requests.push(request);
      return translatedText(request.sourceText);
    },
  };
}

test("review translation sidecars are traceable, incremental, and evaluation-isolated", async () => {
  const { artifact, dataset, tutorEvalCase } = await makeReviewFixture();
  const sources = buildReviewTranslationSources(artifact, dataset, "zh-CN");
  assert.ok(sources.some((source) => source.sourceType === "student_message"));
  assert.ok(sources.some((source) => source.sourceType === "student_profile"));
  assert.ok(sources.some((source) => source.sourceType === "rubric_criterion"));
  assert.ok(sources.some((source) => source.sourceType === "tutor_response" && source.runIndex === 1));
  assert.ok(sources.some((source) => source.sourceType === "judge_evidence" && source.runIndex === 1));
  assert.ok(sources.some((source) => source.sourceType === "judge_factual_error"));
  assert.ok(sources.some((source) => source.sourceType === "judge_critical_failure_evidence"));
  assert.ok(sources.some((source) => source.sourceType === "critical_failure_evidence"));
  assert.ok(sources.some((source) => source.sourceType === "judge_diagnostic"));
  assert.ok(sources.some((source) => source.sourceType === "evaluation_diagnostic" && source.fieldKey.includes("rubricResults")));

  const before = {
    artifact: JSON.stringify(artifact),
    dataset: JSON.stringify(dataset),
    tutorInput: JSON.stringify(toTutorTurnInput(tutorEvalCase)),
    packet: JSON.stringify(buildTutorVisibleCasePacketFile(dataset)),
    responseId: deriveTutorResponseId({
      corpusId: "review-corpus",
      corpusVersion: "1.0.0",
      datasetId: dataset.id,
      datasetVersion: dataset.version,
      caseId: tutorEvalCase.id,
      caseVersion: tutorEvalCase.version,
      tutor: artifact.evaluation.tutor,
      runIndex: 1,
    }),
  };
  const requests: Array<{ readonly sourceText: string; readonly sourceType: string }> = [];
  const translation = await buildReviewTranslationArtifact({
    artifact,
    dataset,
    targetLocale: "zh-CN",
    translator: makeFixtureTranslator(requests),
    now: () => "2026-08-16T00:00:00.000Z",
  });
  const parsed = parseReviewTranslationArtifact(translation);
  assert.equal(parsed.reviewOnly, true);
  assert.equal(parsed.sourceEvaluationRunId, artifact.evaluation.runId);
  assert.equal(parsed.entries.length, sources.length);
  assert.equal(requests.length, sources.length);
  assert.equal(parsed.entries[0]?.sourceTextHash, hashReviewTranslationSource(sources[0]?.sourceText ?? ""));
  assert.doesNotMatch(
    JSON.stringify(parsed),
    /"groundTruth"\s*:|"rawTutorResponse"\s*:|"rawJudgeResult"\s*:/,
  );

  const after = {
    artifact: JSON.stringify(artifact),
    dataset: JSON.stringify(dataset),
    tutorInput: JSON.stringify(toTutorTurnInput(tutorEvalCase)),
    packet: JSON.stringify(buildTutorVisibleCasePacketFile(dataset)),
    responseId: deriveTutorResponseId({
      corpusId: "review-corpus",
      corpusVersion: "1.0.0",
      datasetId: dataset.id,
      datasetVersion: dataset.version,
      caseId: tutorEvalCase.id,
      caseVersion: tutorEvalCase.version,
      tutor: artifact.evaluation.tutor,
      runIndex: 1,
    }),
  };
  assert.deepEqual(after, before);

  const cacheMisses: string[] = [];
  const cached = await buildReviewTranslationArtifact({
    artifact,
    dataset,
    targetLocale: "zh-CN",
    existing: parsed,
    translator: {
      provider: "should-not-be-called",
      translate: async (request) => {
        cacheMisses.push(request.fieldKey);
        throw new Error("cache miss");
      },
    },
    now: () => "2026-08-16T00:00:00.000Z",
  });
  assert.deepEqual(cached.entries, parsed.entries);
  assert.deepEqual(cacheMisses, []);

  const firstCaseResult = artifact.evaluation.caseResults[0];
  assert.ok(firstCaseResult);
  const secondRunArtifact: TutorEvaluationAuditArtifact = {
    ...artifact,
    evaluation: {
      ...artifact.evaluation,
      caseRunCount: 2,
      caseResults: [
        firstCaseResult,
        { ...firstCaseResult, runIndex: 2, rawTutorResponse: "Second run has different source text." },
      ],
    },
  };
  const secondRunSources = buildReviewTranslationSources(secondRunArtifact, dataset, "zh-CN");
  const secondRunRequests: string[] = [];
  const secondRunTranslation = await buildReviewTranslationArtifact({
    artifact: secondRunArtifact,
    dataset,
    targetLocale: "zh-CN",
    existing: parsed,
    translator: {
      provider: "second-run-translator",
      translate: async (request) => {
        secondRunRequests.push(`${request.runIndex ?? "static"}:${request.fieldKey}`);
        return "第二次运行翻译";
      },
    },
    now: () => "2026-08-16T00:00:00.000Z",
  });
  assert.equal(secondRunTranslation.entries.length, secondRunSources.length);
  assert.ok(secondRunRequests.some((request) => request.startsWith("2:rawTutorResponse")));
  assert.ok(!secondRunRequests.some((request) => request.startsWith("1:rawTutorResponse")));

  const changedSourceArtifact: TutorEvaluationAuditArtifact = {
    ...artifact,
    evaluation: {
      ...artifact.evaluation,
      caseResults: [{ ...firstCaseResult, rawTutorResponse: "Changed source text for the same run." }],
    },
  };
  const changedSourceRequests: string[] = [];
  await buildReviewTranslationArtifact({
    artifact: changedSourceArtifact,
    dataset,
    targetLocale: "zh-CN",
    existing: parsed,
    translator: {
      provider: "changed-source-translator",
      translate: async (request) => {
        changedSourceRequests.push(request.fieldKey);
        return "变更后的翻译";
      },
    },
    now: () => "2026-08-16T00:00:00.000Z",
  });
  assert.deepEqual(changedSourceRequests, ["rawTutorResponse"]);

  const lookup = createReviewTranslationLookup(artifact.evaluation, parsed);
  const firstSource = sources[0];
  assert.ok(firstSource);
  assert.equal(lookup.get(firstSource).status, "translated");
  assert.equal(
    lookup.get({ ...firstSource, sourceText: `${firstSource.sourceText} changed` }).status,
    "stale",
  );
  assert.equal(createReviewTranslationLookup(artifact.evaluation, undefined).get(firstSource).status, "missing");
  const mismatched = parseReviewTranslationArtifact({
    ...parsed,
    sourceEvaluationRunId: "different-run",
  });
  assert.equal(createReviewTranslationLookup(artifact.evaluation, mismatched).get(firstSource).status, "artifact_mismatch");

  let failedRequestCount = 0;
  const partial = await buildReviewTranslationArtifact({
    artifact,
    dataset,
    targetLocale: "zh-CN",
    translator: {
      provider: "partial-scripted",
      translate: async (request) => {
        if (request.sourceType === "judge_evidence") {
          failedRequestCount += 1;
          throw new ReviewTranslationProviderError("translator_transport_error");
        }
        return "可用翻译";
      },
    },
  });
  assert.equal(failedRequestCount, 1);
  assert.ok(partial.entries.some((entry) => entry.status === "failed" && entry.failureCode === "translator_transport_error"));
  assert.ok(partial.entries.some((entry) => entry.status === "translated"));
});

test("review translation rendering prefers Chinese assistance while preserving original audit evidence", async () => {
  const { artifact, dataset, tutorEvalCase } = await makeReviewFixture();
  const translation = await buildReviewTranslationArtifact({
    artifact,
    dataset,
    targetLocale: "zh-CN",
    translator: makeFixtureTranslator([], () => "**中文辅助内容**\n\n```text\nconst source = true;\n```"),
    now: () => "2026-08-16T00:00:00.000Z",
  });
  const lookup = createReviewTranslationLookup(artifact.evaluation, translation);
  const chinesePage = renderTutorEvaluationAuditPage({
    artifact,
    dataset,
    caseId: tutorEvalCase.id,
    runIndex: 1,
    locale: "zh-CN",
    reviewTranslation: lookup,
  });
  assert.match(chinesePage.content, /中文辅助翻译/);
  assert.match(chinesePage.content, /辅助翻译，仅供人工阅读，不参与评测/);
  assert.match(chinesePage.content, /查看原文/);
  assert.match(chinesePage.content, /中文辅助内容/);
  assert.match(chinesePage.content, /Tutor original response/);
  assert.match(chinesePage.content, /The tutor identifies perspective/);
  assert.match(chinesePage.content, /Judge diagnostic text that needs review translation/);
  assert.match(chinesePage.content, /Rubric diagnostic text that needs review translation/);
  assert.match(chinesePage.content, /review-judge/);
  assert.match(chinesePage.content, /misconception_reinforcement/);
  assert.match(chinesePage.content, /markdown-code-block/);
  assert.doesNotMatch(chinesePage.content, /<script>/i);

  const englishPage = renderTutorEvaluationAuditPage({
    artifact,
    dataset,
    caseId: tutorEvalCase.id,
    runIndex: 1,
    locale: "en",
    reviewTranslation: lookup,
  });
  assert.doesNotMatch(englishPage.content, /中文辅助内容/);
  assert.match(englishPage.content, /Tutor original response/);
  assert.match(englishPage.content, /The tutor identifies perspective/);

  const stalePage = renderTutorEvaluationAuditPage({
    artifact,
    dataset,
    caseId: tutorEvalCase.id,
    runIndex: 1,
    locale: "zh-CN",
    reviewTranslation: createReviewTranslationLookup(artifact.evaluation, {
      ...translation,
      entries: translation.entries.map((entry) => ({
        ...entry,
        sourceTextHash: entry.sourceType === "student_message"
          ? "0".repeat(64)
          : entry.sourceTextHash,
      })),
    }),
  });
  assert.match(stalePage.content, /辅助翻译已过期/);
  assert.match(stalePage.content, /Why do these sources describe the event differently\?/);
});

test("provider-neutral HTTP translation boundary sends only review translation input", async () => {
  let requestBody: Record<string, unknown> | undefined;
  const server = createServer(async (request, response) => {
    const chunks: Buffer[] = [];
    for await (const chunk of request) {
      chunks.push(Buffer.from(chunk));
    }
    requestBody = JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>;
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify({ translatedText: "本地 mock 翻译" }));
  });
  await new Promise<void>((resolveListen, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolveListen);
  });
  const address = server.address();
  assert.ok(address !== null && typeof address !== "string");
  const translator = createHttpReviewTranslator({
    endpoint: `http://127.0.0.1:${address.port}/translate`,
    provider: "generic-fixture-http",
    model: "fixture-model",
    timeoutMs: 2_000,
  });
  try {
    const translated = await translator.translate({
      targetLocale: "zh-CN",
      sourceType: "tutor_response",
      caseId: "review-case-001",
      runIndex: 1,
      fieldKey: "rawTutorResponse",
      sourceText: "The tutor response.",
    });
    assert.equal(translated, "本地 mock 翻译");
    assert.equal(requestBody?.sourceText, "The tutor response.");
    assert.equal(requestBody?.targetLocale, "zh-CN");
    assert.equal(requestBody?.reviewOnly, true);
    assert.match(String(requestBody?.instructions), /do not summarize/i);
    assert.equal("groundTruth" in requestBody!, false);
  } finally {
    await new Promise<void>((resolveClose, reject) => {
      server.close((error) => (error === undefined ? resolveClose() : reject(error)));
    });
  }
});

test("review-translate CLI builds a sidecar with a local fake HTTP translator", async () => {
  const canonical = await loadTutorEvalDataset();
  const tutorEvalCase = canonical.cases[0];
  assert.ok(tutorEvalCase);
  const evaluation = await runTutorEval({
    dataset: { ...canonical, cases: [tutorEvalCase] },
    tutor: new ScriptedTutor({
      id: "cli-review-tutor",
      responses: { [tutorEvalCase.id]: "CLI source Tutor response." },
    }),
    runId: "cli-review-run-001",
    tutorDescriptor: {
      provider: "fixture",
      model: "fixture-tutor",
      promptVersion: "fixture-prompt",
    },
  });
  let requestCount = 0;
  const server = createServer(async (_request, response) => {
    requestCount += 1;
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify({ translatedText: "CLI 中文翻译" }));
  });
  await new Promise<void>((resolveListen, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolveListen);
  });
  const address = server.address();
  assert.ok(address !== null && typeof address !== "string");
  const directory = await mkdtemp(join(tmpdir(), "review-translation-cli-"));
  const evaluationPath = join(directory, "evaluation.json");
  const outputPath = join(directory, "review.zh-CN.json");
  await writeFile(evaluationPath, `${JSON.stringify({ evaluation })}\n`, "utf8");
  try {
    const options = parseReviewTranslateArgs([
      "--evaluation",
      evaluationPath,
      "--output",
      outputPath,
      "--target-locale",
      "zh-CN",
      "--http",
      `http://127.0.0.1:${address.port}/translate`,
      "--provider",
      "fixture-http",
      "--model",
      "fixture-model",
    ]);
    assert.equal(options.help, false);
    await runReviewTranslate(options);
    const sidecar = parseReviewTranslationArtifact(
      JSON.parse(await readFile(outputPath, "utf8")) as unknown,
    );
    assert.ok(requestCount > 0);
    assert.ok(sidecar.entries.length > 0);
    assert.ok(sidecar.entries.every((entry) => entry.caseId === tutorEvalCase.id));
    assert.ok(sidecar.entries.every((entry) => entry.status === "translated"));
    assert.equal(sidecar.translator.provider, "fixture-http");
    assert.equal(sidecar.translator.model, "fixture-model");
  } finally {
    await new Promise<void>((resolveClose, reject) => {
      server.close((error) => (error === undefined ? resolveClose() : reject(error)));
    });
    await rm(directory, { recursive: true, force: true });
  }
});

test("review translation parser rejects non-review artifacts and malformed entries", () => {
  assert.throws(
    () => parseReviewTranslationArtifact({
      schemaVersion: 1,
      artifactType: "review-translation",
      reviewOnly: false,
      targetLocale: "zh-CN",
      sourceEvaluationRunId: "run",
      sourceEvaluationDatasetId: "dataset",
      sourceEvaluationDatasetVersion: "1.0.0",
      generatedAt: "now",
      translator: { provider: "fixture" },
      entries: [],
    }),
    /Review translation artifact is invalid/,
  );
});

test("private Audit build survives a missing or malformed review sidecar", async () => {
  const canonical = await loadTutorEvalDataset();
  const tutorEvalCase = canonical.cases[0];
  assert.ok(tutorEvalCase);
  const evaluation = await runTutorEval({
    dataset: { ...canonical, cases: [tutorEvalCase] },
    tutor: new ScriptedTutor({
      id: "private-audit-tutor",
      responses: { [tutorEvalCase.id]: "Private audit original response." },
    }),
    runId: "private-audit-run-001",
    tutorDescriptor: {
      provider: "fixture",
      model: "fixture-tutor",
      promptVersion: "fixture-prompt",
    },
  });
  const inputDirectory = await mkdtemp(join(tmpdir(), "review-translation-private-input-"));
  const evaluationPath = join(inputDirectory, "evaluation.json");
  const translationPath = join(inputDirectory, "malformed-review.json");
  const privateRoot = resolve(process.cwd(), "website", "private-dist");
  await mkdir(privateRoot, { recursive: true });
  const outputDirectory = await mkdtemp(join(privateRoot, "review-translation-audit-"));
  await writeFile(evaluationPath, `${JSON.stringify({ evaluation })}\n`, "utf8");
  await writeFile(translationPath, "{ malformed", "utf8");
  try {
    await buildWebsite({
      outputDirectory,
      evaluationPath,
      reviewTranslationPath: translationPath,
      locale: "zh-CN",
    });
    const auditPath = join(
      outputDirectory,
      "audit",
      "runs",
      evaluation.runId,
      "cases",
      tutorEvalCase.id,
      "1",
      "index.html",
    );
    const auditHtml = await readFile(auditPath, "utf8");
    assert.match(auditHtml, /Private audit original response/);
    assert.match(auditHtml, /暂无中文辅助翻译/);
  } finally {
    await rm(outputDirectory, { recursive: true, force: true });
    await rm(inputDirectory, { recursive: true, force: true });
  }
});
