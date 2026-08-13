import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { buildWebsite } from "../src/cli/website-build.js";
import {
  buildPublicBenchmarkArtifacts,
  loadTutorEvalDataset,
  parsePublicBenchmarkArtifacts,
  toPublicTutorEvalCase,
  type PublicBenchmarkArtifacts,
} from "../src/datasets/index.js";
import { TUTOR_EVAL_DATASET_ID } from "../src/contracts/index.js";

async function loadDataset() {
  return loadTutorEvalDataset(TUTOR_EVAL_DATASET_ID);
}

test("public case serialization omits evaluator-only fields by default", async () => {
  const dataset = await loadDataset();
  const tutorEvalCase = dataset.cases[0];
  assert.ok(tutorEvalCase);

  const publicCase = toPublicTutorEvalCase(tutorEvalCase);
  const serialized = JSON.stringify(publicCase);

  assert.equal(publicCase.disclosurePolicy, undefined);
  assert.equal(publicCase.adaptationPairId, undefined);
  assert.equal("misconceptions" in (publicCase.tutorInput.studentProfile ?? {}), false);
  assert.doesNotMatch(serialized, /evaluatorOnly|groundTruth|knownMisconception|rubrics|misconceptions/);
  assert.equal(publicCase.id, tutorEvalCase.id);
  assert.equal(publicCase.tutorInput.studentMessage, tutorEvalCase.tutorInput.studentMessage);
});

test("development metadata is explicitly opt-in without exposing rubric annotations", async () => {
  const dataset = await loadDataset();
  const tutorEvalCase = dataset.cases[0];
  assert.ok(tutorEvalCase);

  const publicCase = toPublicTutorEvalCase(tutorEvalCase, {
    includeDevelopmentMetadata: true,
  });
  const serialized = JSON.stringify(publicCase);

  assert.equal(publicCase.disclosurePolicy, tutorEvalCase.evaluatorOnly.disclosurePolicy);
  assert.doesNotMatch(serialized, /evaluatorOnly|groundTruth|knownMisconception|rubrics|misconceptions/);
});

test("public artifacts contain the real dataset and no model or trial rankings", async () => {
  const artifacts = buildPublicBenchmarkArtifacts(await loadDataset());
  const serializedCases = JSON.stringify(artifacts.cases);

  assert.equal(artifacts.benchmark.status, "developer-preview");
  assert.equal(artifacts.benchmark.dataset.caseCount, 24);
  assert.equal(artifacts.cases.cases.length, 24);
  assert.equal(artifacts.models.available, false);
  assert.equal(artifacts.models.entries.length, 0);
  assert.equal(artifacts.trials.available, false);
  assert.equal(artifacts.trials.entries.length, 0);
  assert.doesNotMatch(serializedCases, /evaluatorOnly|groundTruth|knownMisconception|rubrics|misconceptions/);
  assert.deepEqual(
    artifacts.cases.cases.map((item) => item.id),
    [...artifacts.cases.cases].map((item) => item.id).sort(),
  );
});

test("generated public artifacts pass the runtime read-layer parser", async () => {
  const artifacts = buildPublicBenchmarkArtifacts(await loadDataset());
  const parsed = parsePublicBenchmarkArtifacts(artifacts);
  assert.equal(parsed.cases.datasetId, TUTOR_EVAL_DATASET_ID);
  assert.equal(parsed.benchmark.calibration.independentHumanCalibration, "not_completed");

  const tampered = JSON.parse(JSON.stringify(artifacts)) as PublicBenchmarkArtifacts & {
    cases: { cases: Array<Record<string, unknown>> };
  };
  const firstCase = tampered.cases.cases[0];
  assert.ok(firstCase);
  firstCase.groundTruth = { finalAnswer: "secret" };
  assert.throws(() => parsePublicBenchmarkArtifacts(tampered), {
    name: "PublicBenchmarkArtifactError",
  });
});

test("static website build emits the public artifact files and route shell", async () => {
  const outputDirectory = await mkdtemp(join(tmpdir(), "tutor-benchmark-website-"));
  try {
    const routeCount = await buildWebsite({ outputDirectory });
    const casesJson = await readFile(join(outputDirectory, "public-data", "cases.json"), "utf8");
    const homeHtml = await readFile(join(outputDirectory, "index.html"), "utf8");
    const runHtml = await readFile(join(outputDirectory, "run", "index.html"), "utf8");
    const methodologyHtml = await readFile(
      join(outputDirectory, "methodology", "index.html"),
      "utf8",
    );
    const leaderboardHtml = await readFile(
      join(outputDirectory, "leaderboard", "index.html"),
      "utf8",
    );

    assert.equal(routeCount, 37);
    assert.match(homeHtml, /Developer Preview/);
    assert.match(homeHtml, /No calibrated public model runs yet\./);
    assert.match(leaderboardHtml, /Leaderboard coming soon/);
    assert.match(runHtml, /tutor:export-execution/);
    assert.match(runHtml, /TutorExecutionPacket/);
    assert.match(methodologyHtml, /Case, spec, packet, corpus/);
    assert.doesNotMatch(casesJson, /evaluatorOnly|groundTruth|knownMisconception|rubrics|misconceptions/);
  } finally {
    await rm(outputDirectory, { recursive: true, force: true });
  }
});
