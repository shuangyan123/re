import assert from "node:assert/strict";
import { test } from "node:test";

import { parseTutorbenchArgs } from "../src/cli/tutorbench.js";
import {
  TUTOR_EVAL_DATASET_VERSION,
  TUTOR_EVAL_EVALUATOR_VERSION,
  TUTOR_EVAL_JUDGE_SCHEMA_VERSION,
} from "../src/contracts/index.js";
import {
  createSyntheticMaterialRequirementFixtureJudge,
  formatMaterialRequirementDiagnosticReport,
  MATERIAL_REQUIREMENT_DIAGNOSTIC_FIXTURES,
  MATERIAL_REQUIREMENT_DIAGNOSTIC_VERSION,
  MATERIAL_REQUIREMENT_JUDGE_PROMPT_VERSION,
  JUDGE_CANDIDATE_COMPARISON_VERSION,
  runMaterialRequirementDiagnostic,
  TUTOR_EVAL_PEDAGOGY_JUDGE_PROMPT_VERSION,
  type MaterialRequirementDiagnosticReport,
  WORD_CONTEXT_DISCRIMINATION_CASE_VERSION,
} from "../src/judge/index.js";

function derivedLabels(
  report: MaterialRequirementDiagnosticReport,
  fixtureId: string,
): string[] {
  const fixture = report.fixtures.find((value) => value.fixtureId === fixtureId);
  assert.ok(fixture);
  return fixture.cases.map((fixtureCase) => fixtureCase.rubrics[0]!.observedDerivedLabel);
}

test("provider-free atomic fixture results derive word-context A/B/C labels", async () => {
  const seenOutputs: unknown[] = [];
  const baseJudge = createSyntheticMaterialRequirementFixtureJudge();
  const report = await runMaterialRequirementDiagnostic({
    evaluate: async (input) => {
      const output = await baseJudge.evaluate(input);
      seenOutputs.push(output);
      return output;
    },
  }, [MATERIAL_REQUIREMENT_DIAGNOSTIC_FIXTURES[0]!]);

  assert.deepEqual(derivedLabels(report, "word-context"), ["PASS", "PARTIAL", "FAIL"]);
  assert.deepEqual(
    report.fixtures[0]?.cases.map((fixtureCase) =>
      fixtureCase.rubrics[0]?.requirements.map((value) => value.observedStatus)),
    [
      ["SATISFIED", "SATISFIED", "SATISFIED", "SATISFIED"],
      ["SATISFIED", "SATISFIED", "OMITTED_OR_INCOMPLETE", "SATISFIED"],
      ["SATISFIED", "SATISFIED", "EXPLICIT_CONFLICT", "SATISFIED"],
    ],
  );
  assert.equal(seenOutputs.length, 3);
  assert.doesNotMatch(JSON.stringify(seenOutputs), /"(PASS|PARTIAL|FAIL)"/);
});

test("the same architecture derives PASS/PARTIAL/FAIL for measurement trend", async () => {
  const report = await runMaterialRequirementDiagnostic(
    createSyntheticMaterialRequirementFixtureJudge(),
    [MATERIAL_REQUIREMENT_DIAGNOSTIC_FIXTURES[1]!],
  );
  assert.deepEqual(derivedLabels(report, "measurement-trend"), ["PASS", "PARTIAL", "FAIL"]);
  assert.equal(report.dataKind, "synthetic-fixture");
  assert.equal(report.calibrationStatus, "uncalibrated");
  assert.equal(report.diagnosticVersion, MATERIAL_REQUIREMENT_DIAGNOSTIC_VERSION);
  assert.equal(report.promptVersion, MATERIAL_REQUIREMENT_JUDGE_PROMPT_VERSION);
});

test("report distinguishes atomic agreement from derived agreement without accuracy claims", async () => {
  const report = await runMaterialRequirementDiagnostic(
    createSyntheticMaterialRequirementFixtureJudge(),
  );
  const formatted = formatMaterialRequirementDiagnosticReport(report);
  assert.match(formatted, /Atomic agreement: 4\/4/);
  assert.match(formatted, /Derived label: expected PARTIAL \/ observed PARTIAL/);
  assert.match(formatted, /synthetic-fixture/);
  assert.match(formatted, /not accuracy claims/);
  assert.doesNotMatch(
    JSON.stringify(report),
    /tutorResponse|rawProviderPayload|reasoning_content|hiddenReasoning|criticalFailures/,
  );
});

test("tutorbench exposes the opt-in provider-free structured diagnostic", () => {
  assert.deepEqual(
    parseTutorbenchArgs(["judge-material-requirement-discrimination", "--help"]),
    { help: true, helpCommand: "judge-material-requirement-discrimination" },
  );
  const parsed = parseTutorbenchArgs([
    "judge-material-requirement-discrimination",
    "--fixture=measurement-trend",
    "--output",
    "artifacts/material-requirement.json",
  ]);
  assert.equal(parsed.help, false);
  if (!parsed.help && "judgeMaterialRequirement" in parsed) {
    assert.equal(parsed.judgeMaterialRequirement.fixture, "measurement-trend");
    assert.match(
      parsed.judgeMaterialRequirement.outputPath ?? "",
      /artifacts[\\/]material-requirement\.json$/,
    );
  }
  assert.throws(
    () => parseTutorbenchArgs([
      "judge-material-requirement-discrimination",
      "--fixture=unknown",
    ]),
    /--fixture must be/,
  );
});

test("experimental identities do not bump production or comparison versions", () => {
  assert.equal(TUTOR_EVAL_JUDGE_SCHEMA_VERSION, 1);
  assert.equal(TUTOR_EVAL_PEDAGOGY_JUDGE_PROMPT_VERSION, "0.9");
  assert.equal(TUTOR_EVAL_DATASET_VERSION, "0.2a.5");
  assert.equal(TUTOR_EVAL_EVALUATOR_VERSION, "0.3a.4");
  assert.equal(WORD_CONTEXT_DISCRIMINATION_CASE_VERSION, "1.1.1");
  assert.equal(JUDGE_CANDIDATE_COMPARISON_VERSION, "0.1.1");
  assert.equal(MATERIAL_REQUIREMENT_JUDGE_PROMPT_VERSION, "0.1");
  assert.equal(MATERIAL_REQUIREMENT_DIAGNOSTIC_VERSION, "0.1.0");
});
