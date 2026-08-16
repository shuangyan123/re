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
  PUBLIC_BENCHMARK_GENERATION_TRACEABILITY_FIELDS,
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
  assert.equal(publicCase.locale, "en");
  assert.equal(publicCase.crossLocaleGroupId, tutorEvalCase.crossLocaleGroupId);
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
  assert.equal(artifacts.benchmark.dataset.caseCount, 48);
  assert.equal(artifacts.benchmark.dataset.crossLocaleGroupCount, 24);
  assert.equal(artifacts.cases.cases.length, 48);
  assert.deepEqual(artifacts.benchmark.coverage.casesByLocale, { en: 24, "zh-CN": 24 });
  assert.equal(artifacts.models.available, false);
  assert.equal(artifacts.models.entries.length, 0);
  assert.equal(artifacts.trials.available, false);
  assert.equal(artifacts.trials.entries.length, 0);
  assert.equal(new Set(artifacts.models.fields).size, artifacts.models.fields.length);
  assert.equal(new Set(artifacts.trials.fields).size, artifacts.trials.fields.length);
  for (const field of PUBLIC_BENCHMARK_GENERATION_TRACEABILITY_FIELDS) {
    assert.ok(artifacts.models.fields.includes(field));
    assert.ok(artifacts.trials.fields.includes(field));
  }
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

  const legacyPublicArtifact = JSON.parse(JSON.stringify(artifacts)) as {
    cases: { cases: Array<Record<string, unknown>> };
  };
  delete legacyPublicArtifact.cases.cases[0]?.locale;
  delete legacyPublicArtifact.cases.cases[0]?.crossLocaleGroupId;
  assert.doesNotThrow(() => parsePublicBenchmarkArtifacts(legacyPublicArtifact));

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

    assert.equal(routeCount, 61);
    assert.match(homeHtml, /Developer Preview/);
    assert.match(homeHtml, /No calibrated public model runs yet\./);
    assert.match(homeHtml, /href="\/leaderboard\//);
    assert.match(homeHtml, /href="\/assets\/styles\.css"/);
    assert.match(homeHtml, /src="\/assets\/site\.js"/);
    assert.match(leaderboardHtml, /Leaderboard coming soon/);
    assert.match(runHtml, /tutor:export-execution/);
    assert.match(runHtml, /TutorExecutionPacket/);
    assert.match(runHtml, /baseline-native-default/);
    assert.match(runHtml, /Controlled optional generation parameters: none/);
    assert.match(runHtml, /Use any language/);
    assert.match(runHtml, /tutorbench run/);
    assert.match(runHtml, /Real-model evidence/);
    assert.match(runHtml, /preliminary, uncalibrated/);
    assert.match(methodologyHtml, /Case, spec, packet, corpus/);
    assert.match(methodologyHtml, /provider-native/);
    assert.match(leaderboardHtml, /GenerationSpecId/);
    assert.doesNotMatch(casesJson, /evaluatorOnly|groundTruth|knownMisconception|rubrics|misconceptions/);
  } finally {
    await rm(outputDirectory, { recursive: true, force: true });
  }
});

test("static website build prefixes project-site paths without changing local defaults", async () => {
  const outputDirectory = await mkdtemp(join(tmpdir(), "tutor-benchmark-pages-"));
  try {
    await buildWebsite({
      outputDirectory,
      basePath: "/re/",
      siteUrl: "https://shuangyan123.github.io/re",
    });
    const homeHtml = await readFile(join(outputDirectory, "index.html"), "utf8");
    const casesHtml = await readFile(
      join(outputDirectory, "data", "cases", "index.html"),
      "utf8",
    );

    assert.match(homeHtml, /href="\/re\/leaderboard\//);
    assert.match(homeHtml, /href="\/re\/assets\/styles\.css"/);
    assert.match(homeHtml, /src="\/re\/assets\/site\.js"/);
    assert.match(homeHtml, /<link rel="canonical" href="https:\/\/shuangyan123\.github\.io\/re\//);
    assert.match(casesHtml, /href="\/re\/data\/cases\/fraction-misconception-001\//);
    assert.match(casesHtml, /data-case-filter="locale"/);
    assert.match(casesHtml, /data-case-locale="zh-CN"/);
    assert.match(casesHtml, /English/);
    assert.match(casesHtml, /Chinese/);
    assert.doesNotMatch(homeHtml, /(?:href|src)="\/(?:leaderboard|assets)\//);
  } finally {
    await rm(outputDirectory, { recursive: true, force: true });
  }
});

test("evaluation artifacts cannot be routed into the public website output", async () => {
  const outputDirectory = await mkdtemp(join(tmpdir(), "tutor-benchmark-private-guard-"));
  try {
    await assert.rejects(
      () => buildWebsite({ outputDirectory, evaluationPath: "artifacts/evaluation.json" }),
      /private-dist/,
    );
  } finally {
    await rm(outputDirectory, { recursive: true, force: true });
  }
});
