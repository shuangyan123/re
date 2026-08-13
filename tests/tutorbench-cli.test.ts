import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";

import * as publicApi from "../src/index.js";
import { parseTutorbenchArgs } from "../src/cli/tutorbench.js";

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
  if (parsed.help) {
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
