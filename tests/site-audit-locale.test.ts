import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { test } from "node:test";

import { ScriptedTutor } from "../src/adapters/scripted-tutor.js";
import {
  buildTutorVisibleCasePacketFile,
  parseTutorEvalCase,
  parseTutorVisibleCasePacketFile,
  toTutorTurnInput,
  type TutorEvalCase,
  type TutorEvalDataset,
} from "../src/contracts/index.js";
import { parseTutorEvaluationAuditArtifact } from "../src/reporting/index.js";
import { runTutorEval } from "../src/runner/index.js";
import { renderPage } from "../src/site/html.js";
import { renderTutorMarkdown } from "../src/site/markdown.js";
import {
  renderTutorEvaluationAuditIndexPage,
  renderTutorEvaluationAuditPage,
} from "../src/site/pages/audit.js";

function makeAuditCase(): TutorEvalCase {
  return parseTutorEvalCase({
    schemaVersion: 1,
    id: "audit-case-001",
    version: "1.0.0",
    locale: "zh-CN",
    metadata: {
      subject: "数学",
      topic: "分数",
      tags: ["audit"],
    },
    tutorInput: {
      learningObjective: "Explain the next step without taking over the task.",
      studentProfile: {
        knownConcepts: ["fractions"],
        misconceptions: ["different-sized units"],
        level: "elementary",
        goal: "Solve the problem independently.",
      },
      conversationHistory: [
        { role: "student", text: "I am not sure what to compare." },
        { role: "tutor", text: "What do the denominators describe?" },
      ],
      studentMessage: "Can you give me a hint?",
      problemContext: "Add 1/3 and 1/6 without giving the final answer.",
    },
    evaluatorOnly: {
      disclosurePolicy: "hint_only",
      rubrics: [
        {
          id: "next-step",
          category: "guidance",
          criterion: "Offers one actionable next step without giving the answer.",
          weight: 1,
          behavior: "required",
          evaluationType: "deterministic",
          evaluatorId: "empty_response",
        },
        {
          id: "critical-rule",
          category: "correctness",
          criterion: "Does not reinforce the denominator misconception.",
          weight: 1,
          critical: true,
          criticalFailure: {
            type: "misconception_reinforcement",
            severity: "major",
          },
          evaluationType: "judge",
        },
      ],
    },
  });
}

async function makeAuditArtifact() {
  const tutorEvalCase = makeAuditCase();
  const dataset: TutorEvalDataset = {
    id: "audit-dataset",
    version: "1.0.0",
    cases: [tutorEvalCase],
  };
  const evaluation = await runTutorEval({
    dataset,
    tutor: new ScriptedTutor({
      id: "audit-tutor",
      responses: {
        "audit-case-001": "**保留原文**\n\n- 先比较分母\n- 再选择一个小步骤\n\n`1/3`\n\n```text\n不要直接给出答案。\n```\n\n[参考](https://example.com)",
      },
    }),
    runId: "audit-run-001",
    tutorDescriptor: {
      provider: "synthetic",
      model: "audit-model",
      promptVersion: "test",
    },
    judge: {
      provider: "synthetic",
      model: "audit-judge",
      promptVersion: "test",
      evaluate: async () => ({
        schemaVersion: 1,
        caseId: "audit-case-001",
        rubricResults: [{
          rubricId: "critical-rule",
          result: "PASS",
          evidence: "stored evidence from the Judge",
        }],
        criticalFailures: [],
        factualErrors: [],
        insufficientInformation: false,
      }),
    },
  });
  return {
    dataset,
    artifact: parseTutorEvaluationAuditArtifact({
      evaluation,
      corpusId: "audit-corpus-001",
      corpusVersion: "0.4a.3",
      artifactMetadata: { status: "preliminary" },
      generationSpec: {
        schemaVersion: 1,
        specId: "audit-generation",
        specVersion: "1.0.0",
        prompt: {
          id: "audit-prompt",
          version: "1.0.0",
          sha256: "a".repeat(64),
        },
        maxOutputTokens: 128,
      },
    }),
  };
}

test("case locale is independent from UI locale and legacy case packets default to English", async () => {
  const tutorEvalCase = makeAuditCase();
  const dataset: TutorEvalDataset = {
    id: "audit-dataset",
    version: "1.0.0",
    cases: [tutorEvalCase],
  };
  assert.equal(toTutorTurnInput(tutorEvalCase).locale, "zh-CN");

  const packet = buildTutorVisibleCasePacketFile(dataset, [tutorEvalCase]);
  const legacyPacket = JSON.parse(JSON.stringify(packet)) as {
    cases: Array<Record<string, unknown>>;
  };
  delete legacyPacket.cases[0]?.locale;
  assert.equal(parseTutorVisibleCasePacketFile(legacyPacket).cases[0]?.locale, "en");

  const legacyCase = JSON.parse(JSON.stringify(tutorEvalCase)) as Record<string, unknown>;
  delete legacyCase.locale;
  const parsedLegacyCase = parseTutorEvalCase(legacyCase);
  assert.equal(parsedLegacyCase.locale, undefined);
  assert.equal(toTutorTurnInput(parsedLegacyCase).locale, "en");
});

test("Markdown audit rendering is safe, readable, and preserves raw response text", () => {
  const rendered = renderTutorMarkdown(
    "# Heading\n\n**bold** and *italic* and `inline`\n\n- one\n- two\n\n1. first\n2. second\n\n```ts\nconst value = 1;\n```\n\n[safe](https://example.com) [unsafe](javascript:alert(1)) <script>alert(1)</script>",
  );
  assert.match(rendered, /<h1>Heading<\/h1>/);
  assert.match(rendered, /<strong>bold<\/strong>/);
  assert.match(rendered, /<em>italic<\/em>/);
  assert.match(rendered, /<ul><li>one<\/li><li>two<\/li><\/ul>/);
  assert.match(rendered, /<ol><li>first<\/li><li>second<\/li><\/ol>/);
  assert.match(rendered, /markdown-code-block/);
  assert.match(rendered, /href="https:\/\/example\.com"/);
  assert.doesNotMatch(rendered, /href="javascript:/i);
  assert.doesNotMatch(rendered, /<script>/i);
});

test("audit page exposes actual context, criteria, evaluator fields, Judge evidence, and UI translations", async () => {
  const { dataset, artifact } = await makeAuditArtifact();
  const page = renderTutorEvaluationAuditPage({
    artifact,
    dataset,
    caseId: "audit-case-001",
    runIndex: 1,
    locale: "zh-CN",
  });
  assert.match(page.content, /学生输入/);
  assert.match(page.content, /会话上下文|对话上下文/);
  assert.match(page.content, /Does not reinforce the denominator misconception/);
  assert.match(page.content, /misconception_reinforcement/);
  assert.match(page.content, /保留原文/);
  assert.match(page.content, /markdown-code-block/);
  assert.match(page.content, /stored evidence from the Judge/);
  assert.match(page.content, /Judge 原始结果/);
  assert.match(page.content, /audit-case-001/);
  assert.match(page.content, /zh-CN/);

  const indexPage = renderTutorEvaluationAuditIndexPage({
    artifact,
    dataset,
    locale: "zh-CN",
  });
  assert.match(indexPage.content, /按目标语言分组/);
  assert.match(indexPage.content, /data-audit-locale="zh-CN"/);
  assert.doesNotMatch(page.content, /undefined|nullnull/);

  const englishPage = renderTutorEvaluationAuditPage({
    artifact,
    dataset,
    caseId: "audit-case-001",
    runIndex: 1,
    locale: "en",
  });
  assert.match(englishPage.content, /Evaluation criteria/);
  assert.match(englishPage.content, /Original Tutor response/);
  assert.match(englishPage.content, /\*\*保留原文\*\*/);

  const wrappedEnglish = renderPage(englishPage, { locale: "en" });
  const wrappedChinese = renderPage(page, { locale: "zh-CN" });
  assert.match(wrappedEnglish, /<html lang="en" data-ui-locale="en">/);
  assert.match(wrappedChinese, /<html lang="zh-CN" data-ui-locale="zh-CN">/);
  assert.match(wrappedEnglish, /\*\*保留原文\*\*/);
  assert.match(wrappedChinese, /\*\*保留原文\*\*/);
});

test("raw evaluation artifacts without the new wrapper remain readable", async () => {
  const { artifact, dataset } = await makeAuditArtifact();
  const legacy = parseTutorEvaluationAuditArtifact(artifact.evaluation);
  assert.equal(legacy.evaluation.runId, artifact.evaluation.runId);
  assert.equal(legacy.generationSpec, undefined);

  const missingJudge = {
    ...artifact.evaluation,
    caseResults: artifact.evaluation.caseResults.map((caseResult) => ({
      ...caseResult,
      rawJudgeResult: null,
    })),
  };
  const fallback = parseTutorEvaluationAuditArtifact(missingJudge);
  assert.equal(fallback.evaluation.caseResults[0]?.rawJudgeResult, null);

  const firstCase = dataset.cases[0];
  assert.ok(firstCase);
  const caseWithoutRubrics = {
    ...firstCase,
    evaluatorOnly: {
      ...firstCase.evaluatorOnly,
      rubrics: [],
    },
  } as TutorEvalCase;
  const noCriteriaPage = renderTutorEvaluationAuditPage({
    artifact,
    dataset: { ...dataset, cases: [caseWithoutRubrics] },
    caseId: "audit-case-001",
    runIndex: 1,
    locale: "en",
  });
  assert.match(noCriteriaPage.content, /No rubric or evaluation criteria were stored/);

  const noResponse = parseTutorEvaluationAuditArtifact({
    ...artifact.evaluation,
    caseResults: artifact.evaluation.caseResults.map((caseResult) => ({
      ...caseResult,
      rawTutorResponse: null,
    })),
  });
  const noResponsePage = renderTutorEvaluationAuditPage({
    artifact: noResponse,
    dataset,
    caseId: "audit-case-001",
    runIndex: 1,
    locale: "en",
  });
  assert.match(noResponsePage.content, /No Tutor response was stored/);
});

test("site localization and overflow safeguards are shipped with the static site", async () => {
  const [script, styles] = await Promise.all([
    readFile(resolve("website/src/site.js"), "utf8"),
    readFile(resolve("website/src/styles.css"), "utf8"),
  ]);
  assert.match(script, /localStorage/);
  assert.match(script, /tutor-benchmark-ui-locale/);
  assert.match(script, /data-ui-text-en/);
  assert.match(script, /data-ui-text-zh-cn/);
  assert.match(script, /setAttribute\("aria-label"/);
  assert.match(styles, /\.markdown-content/);
  assert.match(styles, /overflow-wrap:\s*anywhere/);
  assert.match(styles, /\.raw-text/);
  assert.match(styles, /overflow-x:\s*auto/);
});
