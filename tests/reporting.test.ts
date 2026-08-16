import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import {
  formatTutorEvalSummary,
  buildTutorEvalLocaleBreakdowns,
  formatBenchmarkSummary,
  writeBenchmarkResult,
} from "../src/reporting/index.js";
import { runBenchmark, runTutorEval } from "../src/runner/index.js";
import { ScriptedTutor } from "../src/adapters/scripted-tutor.js";
import { parseTutorEvalCase, type TutorEvalCase, type TutorEvalDataset, type TutorEvalRunResult } from "../src/contracts/index.js";
import { makeRubric, makeScenario } from "./helpers.js";

test("console and JSON reporters preserve criterion-level result data", async () => {
  const result = await runBenchmark(
    new ScriptedTutor({
      id: "scripted-report-tutor",
      responses: { "scenario-1": "Ready." },
    }),
    [makeScenario("scenario-1", "rubric-1")],
    [makeRubric()],
    { runId: "report-run", now: () => new Date("2026-08-12T00:00:00.000Z") },
  );
  const summary = formatBenchmarkSummary(result);
  assert.match(summary, /Tutor: scripted-report-tutor/);
  assert.match(summary, /Score: 1\.00/);

  const directory = await mkdtemp(join(tmpdir(), "tutor-benchmark-"));
  try {
    const outputPath = join(directory, "result.json");
    await writeBenchmarkResult(result, outputPath);
    const saved = JSON.parse(await readFile(outputPath, "utf8")) as typeof result;
    assert.equal(saved.schemaVersion, 1);
    assert.equal(saved.runId, "report-run");
    assert.equal(saved.scenarioResults[0]?.criterionResults[0]?.score, 1);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

function makeLocaleCase(
  id: string,
  locale: "en" | "zh-CN",
  concept: string,
): TutorEvalCase {
  return parseTutorEvalCase({
    schemaVersion: 1,
    id,
    version: "1.0.0",
    locale,
    metadata: { subject: "synthetic", topic: "locale reporting" },
    tutorInput: {
      learningObjective: locale === "en" ? "Offer a next step." : "给出下一步提示。",
      studentMessage: locale === "en" ? "Can you help?" : "可以帮帮我吗？",
    },
    evaluatorOnly: {
      disclosurePolicy: "hint_only",
      rubrics: [{
        id: `${id}-rubric`,
        category: "guidance",
        criterion: "Offer one useful next step.",
        weight: 1,
        evaluationType: "deterministic",
        evaluatorId: "contains_required_concept",
        config: { requiredConcepts: [concept] },
      }],
    },
  });
}

test("TutorEval reporting adds locale breakdowns without changing overall aggregation", async () => {
  const dataset: TutorEvalDataset = {
    id: "locale-reporting-dataset",
    version: "1.0.0",
    cases: [
      makeLocaleCase("locale-en", "en", "next step"),
      makeLocaleCase("locale-zh", "zh-CN", "下一步"),
    ],
  };
  const result = await runTutorEval({
    dataset,
    tutor: {
      id: "locale-reporting-tutor",
      respond: async (input) => ({
        text: input.locale === "en" ? "Try the next step." : "我还没有想到办法。",
      }),
    },
    runId: "locale-reporting-run",
  });

  assert.equal(result.overallScore, 0.5);
  const breakdowns = buildTutorEvalLocaleBreakdowns(result, dataset);
  assert.deepEqual(
    breakdowns.map((breakdown) => [breakdown.locale, breakdown.caseCount, breakdown.overallScore]),
    [["en", 1, 1], ["zh-CN", 1, 0]],
  );
  assert.equal(
    breakdowns.reduce((total, breakdown) => total + breakdown.caseCount, 0),
    result.caseCount,
  );
  const summary = formatTutorEvalSummary(result);
  assert.match(summary, /Language-context breakdown:/);
  assert.match(summary, /English-language context \(en\):/);
  assert.match(summary, /Chinese-language context \(zh-CN\):/);
  assert.match(summary, /correctness:/);
  assert.match(summary, /Critical failure rate:/);
  assert.doesNotMatch(summary, /正确性:/);

  const chineseSummary = formatTutorEvalSummary(result, { reportLocale: "zh-CN" });
  assert.match(chineseSummary, /语言语境分组:/);
  assert.match(chineseSummary, /英语语境 \(en\):/);
  assert.match(chineseSummary, /中文语境 \(zh-CN\):/);
  assert.match(chineseSummary, /正确性:/);
  assert.match(chineseSummary, /严重失败率:/);

  const legacyResult = JSON.parse(JSON.stringify(result)) as TutorEvalRunResult;
  for (const caseResult of legacyResult.caseResults) {
    delete (caseResult as { locale?: unknown }).locale;
  }
  const fallbackBreakdowns = buildTutorEvalLocaleBreakdowns(legacyResult, dataset);
  assert.deepEqual(
    fallbackBreakdowns.map((breakdown) => breakdown.locale),
    ["en", "zh-CN"],
  );
});
