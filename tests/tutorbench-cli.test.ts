import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";

import * as publicApi from "../src/index.js";
import { parseTutorbenchArgs } from "../src/cli/tutorbench.js";
import { parseTutorbenchCollectArgs } from "../src/cli/tutorbench-collect.js";
import { parseBenchmarkCorpusCliOptions } from "../src/cli/tutorbench-evaluate.js";

interface CliResult {
  readonly exitCode: number | null;
  readonly stdout: string;
  readonly stderr: string;
}

function runCli(args: readonly string[]): Promise<CliResult> {
  const cliPath = resolve(process.cwd(), "dist", "src", "cli", "tutorbench.js");
  return new Promise((resolveResult, reject) => {
    const child = spawn(process.execPath, [cliPath, ...args], {
      cwd: process.cwd(),
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer | string) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk: Buffer | string) => {
      stderr += chunk.toString();
    });
    child.once("error", reject);
    child.once("close", (exitCode) => {
      resolveResult({ exitCode, stdout, stderr });
    });
  });
}

test("package root exposes createHttpTutor without replacing the direct runner", () => {
  assert.equal(typeof publicApi.createHttpTutor, "function");
  assert.equal(typeof publicApi.runTutorBenchmark, "function");
  assert.equal(typeof publicApi.runTutorEval, "function");
});

test("tutorbench parser supports the small run option set", () => {
  const parsed = parseTutorbenchArgs([
    "run",
    "--http",
    "http://localhost:8000/respond",
    "--dataset",
    "tutor-eval-v0.1",
    "--case",
    "case-a",
    "--case=case-b",
    "--runs=2",
    "--timeout-ms",
    "5000",
    "--output",
    "artifacts/result.json",
  ]);
  assert.equal(parsed.help, false);
  if (parsed.help || !("run" in parsed)) {
    return;
  }
  assert.deepEqual(parsed.run, {
    endpoint: "http://localhost:8000/respond",
    datasetId: "tutor-eval-v0.1",
    caseIds: ["case-a", "case-b"],
    limit: null,
    runsPerCase: 2,
    timeoutMs: 5000,
    outputPath: resolve(process.cwd(), "artifacts/result.json"),
  });
  assert.deepEqual(parseTutorbenchArgs(["--help"]), { help: true });
  assert.throws(
    () => parseTutorbenchArgs(["unknown"]),
    /Unknown command/,
  );
  assert.throws(
    () =>
      parseTutorbenchArgs([
        "run",
        "--http",
        "http://localhost/respond",
        "--case",
        "case-a",
        "--limit",
        "1",
      ]),
    /cannot be combined/,
  );
});

test("tutorbench exposes collect and evaluate command parsers with explicit identity", () => {
  const collect = parseTutorbenchArgs([
    "collect",
    "--http",
    "http://localhost:8000/respond",
    "--provider",
    "openai",
    "--model",
    "gpt-example",
    "--provenance",
    "recorded_model",
    "--model-version=2026-08-13",
    "--limit=2",
    "--runs",
    "2",
    "--dry-run",
  ]);
  assert.equal(collect.help, false);
  if (collect.help || !("collect" in collect) || collect.collect.help) {
    return;
  }
  assert.equal(collect.collect.provider, "openai");
  assert.equal(collect.collect.model, "gpt-example");
  assert.equal(collect.collect.provenance, "recorded_model");
  assert.equal(collect.collect.limit, 2);
  assert.equal(collect.collect.runsPerCase, 2);
  assert.equal(collect.collect.dryRun, true);

  const evaluate = parseTutorbenchArgs([
    "evaluate",
    "--corpus",
    "artifacts/corpus.json",
    "--output",
    "artifacts/result.json",
  ]);
  assert.equal(evaluate.help, false);
  if (evaluate.help || !("evaluate" in evaluate) || evaluate.evaluate.help) {
    return;
  }
  assert.equal(evaluate.evaluate.corpusPath, resolve(process.cwd(), "artifacts/corpus.json"));
  assert.equal(evaluate.evaluate.outputPath, resolve(process.cwd(), "artifacts/result.json"));
  assert.deepEqual(parseTutorbenchCollectArgs(["--help"]), { help: true });
  assert.deepEqual(parseBenchmarkCorpusCliOptions(["--help"]), {
    corpusPath: "",
    requireFull: false,
    liveJudge: false,
    help: true,
  });
});

test("tutorbench executable supports help and rejects invalid commands", async () => {
  const help = await runCli(["--help"]);
  assert.equal(help.exitCode, 0);
  assert.match(help.stdout, /tutorbench run --http <url>/);

  const invalid = await runCli(["unknown"]);
  assert.equal(invalid.exitCode, 1);
  assert.match(invalid.stderr, /Unknown command/);
});

test("tutorbench run maps HTTP Tutor output to TutorEvalRunResult and --output", async () => {
  const requestBodies: Record<string, unknown>[] = [];
  const server = createServer(async (_request, response) => {
    requestBodies.push({});
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify({ text: "Try the next small step." }));
  });
  await new Promise<void>((resolveListen, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolveListen);
  });
  const address = server.address();
  assert.ok(address !== null && typeof address !== "string");
  const endpoint = `http://127.0.0.1:${address.port}/respond`;
  const outputDirectory = await mkdtemp(join(tmpdir(), "tutorbench-cli-"));
  const outputPath = join(outputDirectory, "result.json");

  try {
    const result = await runCli([
      "run",
      "--http",
      endpoint,
      "--limit",
      "1",
      "--runs",
      "2",
      "--output",
      outputPath,
    ]);
    assert.equal(result.exitCode, 0);
    assert.match(result.stdout, /Tutor Benchmark/);
    assert.match(result.stdout, /HTTP ·/);
    assert.match(result.stdout, /Cases: 1 \(2 runs\)/);

    const output = JSON.parse(await readFile(outputPath, "utf8")) as {
      readonly datasetId: string;
      readonly caseCount: number;
      readonly caseRunCount: number;
      readonly tutor: { readonly model: string };
    };
    assert.equal(output.datasetId, "tutor-eval-v0.2a");
    assert.equal(output.caseCount, 1);
    assert.equal(output.caseRunCount, 2);
    assert.equal(output.tutor.model, "http-tutor");
    assert.equal(requestBodies.length, 2);
  } finally {
    await new Promise<void>((resolveClose, reject) => {
      server.close((error) => (error === undefined ? resolveClose() : reject(error)));
    });
    await rm(outputDirectory, { recursive: true, force: true });
  }
});

test("tutorbench collect performs fake HTTP evidence collection and keeps failures out of the corpus", async () => {
  let requestCount = 0;
  const server = createServer(async (_request, response) => {
    requestCount += 1;
    response.setHeader("content-type", "application/json");
    if (requestCount === 2) {
      response.statusCode = 503;
      response.end(JSON.stringify({ error: "synthetic failure" }));
      return;
    }
    response.end(JSON.stringify({
      text: "A frozen synthetic Tutor response.",
      metrics: { latencyMs: 5, tokenUsage: { inputTokens: 2, outputTokens: 3, totalTokens: 5 } },
      metadata: { rawProviderPayload: "must not be persisted" },
    }));
  });
  await new Promise<void>((resolveListen, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolveListen);
  });
  const address = server.address();
  assert.ok(address !== null && typeof address !== "string");
  const endpoint = `http://127.0.0.1:${address.port}/respond`;
  const outputDirectory = await mkdtemp(join(tmpdir(), "tutorbench-collect-"));
  const corpusPath = join(outputDirectory, "corpus.json");
  const reportPath = join(outputDirectory, "report.json");
  const evaluationPath = join(outputDirectory, "evaluation.json");

  try {
    const result = await runCli([
      "collect",
      "--http",
      endpoint,
      "--provider",
      "fixture-provider",
      "--model",
      "fixture-model",
      "--provenance",
      "synthetic",
      "--limit",
      "2",
      "--output",
      corpusPath,
      "--report",
      reportPath,
    ]);
    assert.equal(result.exitCode, 0);
    assert.match(result.stdout, /Coverage: partial/);
    assert.match(result.stdout, /Corpus validation: passed/);
    assert.equal(requestCount, 2);

    const corpus = JSON.parse(await readFile(corpusPath, "utf8")) as {
      readonly coverage: string;
      readonly responses: readonly { readonly caseId: string; readonly metrics?: unknown }[];
      readonly tutor: { readonly provider: string; readonly model: string };
    };
    const report = JSON.parse(await readFile(reportPath, "utf8")) as {
      readonly requestedCaseCount: number;
      readonly completedResponseCount: number;
      readonly failedTutorCallCount: number;
      readonly failures: readonly { readonly code: string }[];
    };
    assert.equal(corpus.coverage, "partial");
    assert.equal(corpus.responses.length, 1);
    assert.deepEqual(corpus.responses[0]?.metrics, {
      latencyMs: 5,
      tokenUsage: { inputTokens: 2, outputTokens: 3, totalTokens: 5 },
    });
    assert.deepEqual(corpus.tutor, {
      provider: "fixture-provider",
      model: "fixture-model",
      promptId: "tutor-baseline-system",
      promptVersion: "0.1",
    });
    assert.doesNotMatch(JSON.stringify(corpus), /127\.0\.0\.1|rawProviderPayload|synthetic failure/);
    assert.equal(report.requestedCaseCount, 2);
    assert.equal(report.completedResponseCount, 1);
    assert.equal(report.failedTutorCallCount, 1);
    assert.equal(report.failures[0]?.code, "tutor_call_failed");

    const evaluation = await runCli([
      "evaluate",
      "--corpus",
      corpusPath,
      "--output",
      evaluationPath,
    ]);
    assert.equal(evaluation.exitCode, 0);
    assert.match(evaluation.stdout, /Status: preliminary/);
    assert.match(evaluation.stdout, /Calibration: uncalibrated/);
    const evaluationArtifact = JSON.parse(await readFile(evaluationPath, "utf8")) as {
      readonly artifactMetadata: {
        readonly status: string;
        readonly calibrationStatus: string;
        readonly publicLeaderboardEligible: boolean;
      };
      readonly coverage: string;
      readonly evaluation: { readonly errorCount: number };
    };
    assert.deepEqual(evaluationArtifact.artifactMetadata, {
      status: "preliminary",
      calibrationStatus: "uncalibrated",
      publicLeaderboardEligible: false,
    });
    assert.equal(evaluationArtifact.coverage, "partial");
    assert.equal(evaluationArtifact.evaluation.errorCount, 0);
  } finally {
    await new Promise<void>((resolveClose, reject) => {
      server.close((error) => (error === undefined ? resolveClose() : reject(error)));
    });
    await rm(outputDirectory, { recursive: true, force: true });
  }
});

test("tutorbench collect dry-run makes zero HTTP calls and prints the planned call count", async () => {
  const output = await runCli([
    "collect",
    "--http",
    "http://127.0.0.1:1/respond",
    "--provider",
    "fixture-provider",
    "--model",
    "fixture-model",
    "--provenance",
    "synthetic",
    "--limit",
    "2",
    "--runs",
    "2",
    "--dry-run",
  ]);
  assert.equal(output.exitCode, 0);
  assert.match(output.stdout, /Planned Tutor calls: 4/);
  assert.match(output.stdout, /Tutor calls made: 0/);
});

test("package bin points to the built shebang executable", async () => {
  const packageValue = JSON.parse(
    await readFile(resolve(process.cwd(), "package.json"), "utf8"),
  ) as { readonly bin?: { readonly tutorbench?: string } };
  assert.equal(packageValue.bin?.tutorbench, "./dist/src/cli/tutorbench.js");
  const executable = await readFile(
    resolve(process.cwd(), "dist", "src", "cli", "tutorbench.js"),
    "utf8",
  );
  assert.match(executable, /^#!\/usr\/bin\/env node/);
});
