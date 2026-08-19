import assert from "node:assert/strict";
import { resolve } from "node:path";
import { test } from "node:test";

import { parseJudgeCandidateComparisonArgs } from "../src/cli/judge-candidate-comparison.js";
import { parseTutorbenchArgs } from "../src/cli/tutorbench.js";

test("candidate comparison CLI parses explicit candidates and conservative repetition defaults", () => {
  const parsed = parseJudgeCandidateComparisonArgs([
    "--fixture",
    "word-context",
    "--judge-deepseek",
    "--judge-minimax",
    "--runs-per-candidate",
    "3",
    "--output",
    "artifacts/comparison.json",
  ]);
  assert.deepEqual(parsed, {
    fixture: "word-context",
    deepSeekJudge: true,
    miniMaxJudge: true,
    runsPerCandidate: 3,
    outputPath: resolve(process.cwd(), "artifacts/comparison.json"),
    help: false,
  });
  assert.throws(
    () => parseJudgeCandidateComparisonArgs(["--judge-deepseek", "--runs-per-candidate", "0"]),
    /positive integer/,
  );
  assert.throws(
    () => parseJudgeCandidateComparisonArgs(["--runs-per-candidate", "3"]),
    /At least one/,
  );
});

test("tutorbench dispatcher exposes candidate comparison help and command", () => {
  const help = parseTutorbenchArgs(["judge-candidate-comparison", "--help"]);
  assert.deepEqual(help, {
    help: true,
    helpCommand: "judge-candidate-comparison",
  });
  const parsed = parseTutorbenchArgs([
    "judge-candidate-comparison",
    "--judge-minimax",
    "--runs-per-candidate=3",
  ]);
  assert.equal(parsed.help, false);
  if (!parsed.help && "judgeCandidateComparison" in parsed) {
    assert.equal(parsed.judgeCandidateComparison.miniMaxJudge, true);
    assert.equal(parsed.judgeCandidateComparison.runsPerCandidate, 3);
  }
});
