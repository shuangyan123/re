import assert from "node:assert/strict";
import { test } from "node:test";

import { parseTutorbenchArgs } from "../src/cli/tutorbench.js";
import {
  buildTutorEvalJudgeInput,
  TUTOR_EVAL_DATASET_VERSION,
  TUTOR_EVAL_EVALUATOR_VERSION,
  TUTOR_EVAL_JUDGE_SCHEMA_VERSION,
} from "../src/contracts/index.js";
import { loadTutorEvalDataset } from "../src/datasets/index.js";
import {
  createSyntheticMaterialRequirementFixtureJudge,
  formatMaterialRequirementDiagnosticReport,
  loadMaterialRequirementDiagnosticFixtures,
  MATERIAL_REQUIREMENT_ATOMIC_BOUNDARIES_FIXTURE_VERSION,
  MATERIAL_REQUIREMENT_DIAGNOSTIC_VERSION,
  MATERIAL_REQUIREMENT_EPISTEMIC_STRENGTH_FIXTURE_VERSION,
  MATERIAL_REQUIREMENT_FIXTURE_VERSION,
  MATERIAL_REQUIREMENT_WORD_CONTEXT_FIXTURE_VERSION,
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

test("word-context fixture reuses the canonical production Judge evidence boundary", async () => {
  const fixtures = await loadMaterialRequirementDiagnosticFixtures();
  const wordFixture = fixtures.find((fixture) => fixture.id === "word-context");
  assert.ok(wordFixture);
  const dataset = await loadTutorEvalDataset("tutor-eval-v0.2a", "0.2a.5");
  const canonicalCase = dataset.cases.find(
    (candidate) => candidate.id === "language-word-context-001",
  );
  assert.ok(canonicalCase);
  for (const fixtureCase of wordFixture.cases) {
    const productionInput = buildTutorEvalJudgeInput(
      canonicalCase,
      fixtureCase.input.tutorResponse,
    );
    assert.equal(fixtureCase.input.studentMessage, productionInput.studentMessage);
    assert.equal(fixtureCase.input.problemContext, productionInput.problemContext);
    assert.equal(fixtureCase.input.disclosurePolicy, productionInput.disclosurePolicy);
    assert.equal(fixtureCase.input.learningObjective, productionInput.learningObjective);
    assert.equal(fixtureCase.input.studentProfile, productionInput.studentProfile);
    assert.equal(fixtureCase.input.conversationHistory, productionInput.conversationHistory);
    assert.equal(fixtureCase.input.groundTruth, productionInput.groundTruth);
    assert.equal(fixtureCase.input.knownMisconception, productionInput.knownMisconception);
    assert.deepEqual(Object.keys(fixtureCase.input.rubrics[0]!).sort(), [
      "criterion",
      "id",
      "requirements",
    ]);
  }
});

test("provider-free atomic fixture results derive word-context A/B/C labels", async () => {
  const fixtures = await loadMaterialRequirementDiagnosticFixtures();
  const wordFixture = fixtures.find((fixture) => fixture.id === "word-context");
  assert.ok(wordFixture);
  assert.equal(wordFixture.version, "0.2.0");
  assert.deepEqual(
    wordFixture.cases[0]?.input.rubrics[0]?.requirements.map((requirement) => requirement.description),
    [
      "Evaluate the student's proposed meaning against the surrounding context.",
      "Explain what the pause-before-agreeing clue supports.",
      "State that the pause-before-agreeing clue alone is insufficient to determine whether the character is unwilling, uncertain, or simply thinking before agreeing.",
      "Do not treat the student's proposed meaning as automatically correct or incorrect.",
    ],
  );
  const seenOutputs: unknown[] = [];
  const baseJudge = createSyntheticMaterialRequirementFixtureJudge(fixtures);
  const report = await runMaterialRequirementDiagnostic({
    evaluate: async (input) => {
      const output = await baseJudge.evaluate(input);
      seenOutputs.push(output);
      return output;
    },
  }, [fixtures[0]!]);

  assert.deepEqual(derivedLabels(report, "word-context"), ["PASS", "PARTIAL", "FAIL"]);
  assert.deepEqual(
    report.fixtures[0]?.cases.map((fixtureCase) =>
      fixtureCase.rubrics[0]?.requirements.map((value) => value.observedStatus)),
    [
      ["SATISFIED", "SATISFIED", "SATISFIED", "SATISFIED"],
      ["SATISFIED", "SATISFIED", "OMITTED_OR_INCOMPLETE", "SATISFIED"],
      ["SATISFIED", "SATISFIED", "EXPLICIT_CONFLICT", "EXPLICIT_CONFLICT"],
    ],
  );
  assert.equal(seenOutputs.length, 3);
  assert.doesNotMatch(JSON.stringify(seenOutputs), /"(PASS|PARTIAL|FAIL)"/);
  const conflictEvidence = fixtures[0]?.cases[2]?.expected.rubricAssessments[0]
    ?.requirements.find((requirement) => requirement.requirementId === "R4")?.evidence;
  assert.match(conflictEvidence ?? "", /definitive lexical conclusion/);
});

test("the same architecture derives PASS/PARTIAL/FAIL for measurement trend", async () => {
  const fixtures = await loadMaterialRequirementDiagnosticFixtures();
  const report = await runMaterialRequirementDiagnostic(
    createSyntheticMaterialRequirementFixtureJudge(fixtures),
    [fixtures[1]!],
  );
  assert.deepEqual(derivedLabels(report, "measurement-trend"), ["PASS", "PARTIAL", "FAIL"]);
  assert.equal(report.dataKind, "synthetic-fixture");
  assert.equal(report.calibrationStatus, "uncalibrated");
  assert.equal(report.mode, "provider-free");
  assert.equal(report.plannedCalls, 3);
  assert.equal(report.completedCalls, 3);
  assert.deepEqual(report.semanticAvailability, {
    observedCases: 3,
    plannedCases: 3,
    share: 1,
  });
  assert.equal(report.executionErrors.count, 0);
  assert.equal(report.diagnosticVersion, MATERIAL_REQUIREMENT_DIAGNOSTIC_VERSION);
  assert.equal(report.promptVersion, MATERIAL_REQUIREMENT_JUDGE_PROMPT_VERSION);
  const measurementInput = fixtures[1]?.cases[0]?.input;
  assert.ok(measurementInput);
  assert.match(measurementInput.studentMessage, /first measurement.*second/i);
  assert.match(measurementInput.problemContext, /10 units.*12 units/i);
  assert.match(measurementInput.groundTruth, /insufficient to establish a trend/i);
  assert.match(measurementInput.knownMisconception, /proves an increasing trend/i);
});

test("generic atomic-boundary fixture separates omission, conflict, and satisfaction", async () => {
  const fixtures = await loadMaterialRequirementDiagnosticFixtures();
  const fixture = fixtures.find((candidate) => candidate.id === "atomic-boundaries");
  assert.ok(fixture);
  const report = await runMaterialRequirementDiagnostic(
    createSyntheticMaterialRequirementFixtureJudge([fixture]),
    [fixture],
  );

  assert.equal(fixture.version, "0.1.0");
  assert.deepEqual(
    report.fixtures[0]?.cases.map(
      (fixtureCase) => fixtureCase.rubrics[0]?.requirements[0]?.observedStatus,
    ),
    ["OMITTED_OR_INCOMPLETE", "EXPLICIT_CONFLICT", "SATISFIED"],
  );
  assert.deepEqual(derivedLabels(report, "atomic-boundaries"), ["FAIL", "FAIL", "PASS"]);
  assert.equal(report.plannedCalls, 3);
  for (const fixtureCase of fixture.cases) {
    assert.deepEqual(fixtureCase.input.rubrics[0]?.requirements, [
      {
        id: "M-LIMIT",
        description: "State that two observations alone are insufficient to establish a trend.",
      },
    ]);
    assert.deepEqual(Object.keys(fixtureCase.input.rubrics[0]!).sort(), [
      "criterion",
      "id",
      "requirements",
    ]);
    assert.doesNotMatch(
      JSON.stringify(fixtureCase.input),
      /expectedStatus|expectedDerivedLabel|fixture expectation/i,
    );
  }
});

test("epistemic-strength fixture separates support, certainty, and explicit limitation", async () => {
  const fixtures = await loadMaterialRequirementDiagnosticFixtures();
  const fixture = fixtures.find((candidate) => candidate.id === "epistemic-strength");
  assert.ok(fixture);
  const report = await runMaterialRequirementDiagnostic(
    createSyntheticMaterialRequirementFixtureJudge([fixture]),
    [fixture],
  );

  assert.equal(fixture.version, MATERIAL_REQUIREMENT_EPISTEMIC_STRENGTH_FIXTURE_VERSION);
  assert.deepEqual(
    fixture.cases.map((fixtureCase) => fixtureCase.input.rubrics[0]?.requirements[0]),
    [
      {
        id: "E-STRENGTH",
        description: "State that the available observations alone are insufficient to establish the increasing-trend hypothesis.",
      },
      {
        id: "E-STRENGTH",
        description: "State that the available observations alone are insufficient to establish the increasing-trend hypothesis.",
      },
      {
        id: "E-STRENGTH",
        description: "State that the available observations alone are insufficient to establish the increasing-trend hypothesis.",
      },
    ],
  );
  assert.deepEqual(
    report.fixtures[0]?.cases.map(
      (fixtureCase) => fixtureCase.rubrics[0]?.requirements[0]?.observedStatus,
    ),
    ["OMITTED_OR_INCOMPLETE", "EXPLICIT_CONFLICT", "SATISFIED"],
  );
  assert.deepEqual(derivedLabels(report, "epistemic-strength"), ["FAIL", "FAIL", "PASS"]);
  for (const fixtureCase of fixture.cases) {
    assert.doesNotMatch(
      JSON.stringify(fixtureCase.input),
      /expectedStatus|expectedDerivedLabel|fixture expectation/i,
    );
  }
});

test("report distinguishes atomic agreement from derived agreement without accuracy claims", async () => {
  const fixtures = await loadMaterialRequirementDiagnosticFixtures();
  const report = await runMaterialRequirementDiagnostic(
    createSyntheticMaterialRequirementFixtureJudge(fixtures),
    fixtures,
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
    assert.equal(parsed.judgeMaterialRequirement.judgeDeepSeek, false);
    assert.match(
      parsed.judgeMaterialRequirement.outputPath ?? "",
      /artifacts[\\/]material-requirement\.json$/,
    );
  }
  const liveParsed = parseTutorbenchArgs([
    "judge-material-requirement-discrimination",
    "--fixture=all",
    "--judge-deepseek",
  ]);
  assert.equal(liveParsed.help, false);
  if (!liveParsed.help && "judgeMaterialRequirement" in liveParsed) {
    assert.equal(liveParsed.judgeMaterialRequirement.judgeDeepSeek, true);
  }
  const atomicParsed = parseTutorbenchArgs([
    "judge-material-requirement-discrimination",
    "--fixture",
    "atomic-boundaries",
  ]);
  assert.equal(atomicParsed.help, false);
  if (!atomicParsed.help && "judgeMaterialRequirement" in atomicParsed) {
    assert.equal(atomicParsed.judgeMaterialRequirement.fixture, "atomic-boundaries");
    assert.equal(atomicParsed.judgeMaterialRequirement.judgeDeepSeek, false);
  }
  const epistemicParsed = parseTutorbenchArgs([
    "judge-material-requirement-discrimination",
    "--fixture=epistemic-strength",
  ]);
  assert.equal(epistemicParsed.help, false);
  if (!epistemicParsed.help && "judgeMaterialRequirement" in epistemicParsed) {
    assert.equal(epistemicParsed.judgeMaterialRequirement.fixture, "epistemic-strength");
    assert.equal(epistemicParsed.judgeMaterialRequirement.judgeDeepSeek, false);
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
  assert.equal(MATERIAL_REQUIREMENT_JUDGE_PROMPT_VERSION, "0.4");
  assert.equal(MATERIAL_REQUIREMENT_DIAGNOSTIC_VERSION, "0.2.0");
  assert.equal(MATERIAL_REQUIREMENT_FIXTURE_VERSION, "0.1.1");
  assert.equal(MATERIAL_REQUIREMENT_WORD_CONTEXT_FIXTURE_VERSION, "0.2.0");
  assert.equal(MATERIAL_REQUIREMENT_ATOMIC_BOUNDARIES_FIXTURE_VERSION, "0.1.0");
  assert.equal(MATERIAL_REQUIREMENT_EPISTEMIC_STRENGTH_FIXTURE_VERSION, "0.1.0");
});
