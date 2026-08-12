import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import {
  formatBenchmarkSummary,
  writeBenchmarkResult,
} from "../src/reporting/index.js";
import { runBenchmark } from "../src/runner/index.js";
import { ScriptedTutor } from "../src/adapters/scripted-tutor.js";
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
