import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { test } from "node:test";

interface ProcessResult {
  readonly exitCode: number | null;
  readonly stdout: string;
  readonly stderr: string;
}

function runVersionCheck(tag: string): Promise<ProcessResult> {
  const scriptPath = resolve(process.cwd(), "scripts", "validate-release-version.mjs");
  return new Promise((resolveResult, reject) => {
    const child = spawn(process.execPath, [scriptPath, tag], {
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

test("release version check accepts the package version tag", async () => {
  const result = await runVersionCheck("v0.1.0");
  assert.equal(result.exitCode, 0);
  assert.match(result.stdout, /matches package 0\.1\.0/);
});

test("release version check rejects mismatched and malformed tags", async () => {
  const mismatch = await runVersionCheck("v0.1.1");
  assert.equal(mismatch.exitCode, 1);
  assert.match(mismatch.stderr, /does not match package version 0\.1\.0/);

  const malformed = await runVersionCheck("release-0.1.0");
  assert.equal(malformed.exitCode, 1);
  assert.match(malformed.stderr, /must match vX\.Y\.Z/);
});
