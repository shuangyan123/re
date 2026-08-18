import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { resolve } from "node:path";

import {
  parseTutorEvalCase,
  parseTutorEvalJudgeResult,
  type DisclosurePolicy,
} from "../src/contracts/index.js";
import {
  loadTutorEvalPedagogyJudgePrompt,
  TUTOR_EVAL_PEDAGOGY_JUDGE_PROMPT_VERSION,
} from "../src/judge/index.js";
import { runTutorEval } from "../src/runner/index.js";

interface SemanticRegressionEntry {
  readonly id: string;
  readonly policy: DisclosurePolicy;
  readonly tutorResponse: string;
  readonly expected: {
    readonly answerLeakage: boolean;
    readonly criticalFailures: readonly {
      readonly type: "answer_leakage";
      readonly severity: "major";
    }[];
  };
  readonly judgeResult: unknown;
}

interface SemanticRegressionFixture {
  readonly schemaVersion: 1;
  readonly fixtureId: string;
  readonly dataKind: "semantic-regression-fixture";
  readonly notHumanCalibrationData: true;
  readonly judgePromptVersion: string;
  readonly entries: readonly SemanticRegressionEntry[];
}

async function loadFixture(): Promise<SemanticRegressionFixture> {
  return JSON.parse(
    await readFile(
      resolve(process.cwd(), "fixtures/judge/tutor-eval-disclosure-semantic-regressions.json"),
      "utf8",
    ),
  ) as SemanticRegressionFixture;
}

function makeDisclosureCase(entry: SemanticRegressionEntry) {
  return parseTutorEvalCase({
    schemaVersion: 1,
    id: entry.id,
    version: "1.0.0",
    metadata: {
      subject: "synthetic",
      topic: "disclosure semantics",
      tags: ["semantic-regression-fixture"],
    },
    tutorInput: {
      learningObjective: "Preserve the learner's material task.",
      studentMessage: "Please help me take the next step.",
      problemContext: "The fixture supplies a visible case boundary.",
    },
    evaluatorOnly: {
      disclosurePolicy: entry.policy,
      rubrics: [{
        id: "disclosure-boundary",
        category: "guidance",
        criterion: "Respect the disclosure policy while helping the learner.",
        weight: 1,
        evaluationType: "judge",
      }],
    },
  });
}

test("v0.6 Judge prompt states the no_answer and hint_only semantic boundaries", async () => {
  const prompt = await loadTutorEvalPedagogyJudgePrompt();
  assert.equal(TUTOR_EVAL_PEDAGOGY_JUDGE_PROMPT_VERSION, "0.6");
  assert.match(prompt, /two separate evaluation layers/);
  assert.match(prompt, /mandatory policy-level critical-failure pass/);
  assert.match(prompt, /does not require a dedicated atomic disclosure rubric/);
  assert.match(prompt, /Operation ownership pass/);
  assert.match(prompt, /If no concrete learner-reserved operation distinct from the Tutor's/);
  assert.match(prompt, /Do not use a blanket rule that anything satisfying a required rubric is safe/);
  assert.match(prompt, /correct knowledge is not itself a prohibited answer/);
  assert.match(prompt, /student proposes meaning A and the context supports meaning B/);
  assert.match(prompt, /The vertical axis is amount, not rate/);
  assert.match(prompt, /2\/3 \+ 1\/3 = 3\/3 = 1/);
  assert.match(prompt, /4 \+ 4 \+ 4/);
  assert.match(prompt, /complete corrected loop/);
  assert.match(prompt, /function extraction/);
  assert.match(prompt, /opposing forces/);
});

test("historical v0.4 semantic regression fixture remains structured and provider-free", async () => {
  const fixture = await loadFixture();
  assert.equal(fixture.schemaVersion, 1);
  assert.equal(fixture.dataKind, "semantic-regression-fixture");
  assert.equal(fixture.notHumanCalibrationData, true);
  assert.equal(fixture.judgePromptVersion, "0.4");
  assert.equal(fixture.entries.length, 7);

  for (const entry of fixture.entries) {
    const tutorEvalCase = makeDisclosureCase(entry);
    const judgeResult = parseTutorEvalJudgeResult(entry.judgeResult);
    assert.equal(judgeResult.caseId, entry.id);
    const run = await runTutorEval({
      dataset: { id: "semantic-regression-fixture", version: "1.0.0", cases: [tutorEvalCase] },
      tutor: {
        id: "fixture-tutor",
        respond: async () => ({ text: entry.tutorResponse }),
      },
      tutorDescriptor: {
        provider: "synthetic",
        model: "fixture-tutor",
        promptVersion: "test",
      },
      judge: {
        provider: "synthetic",
        model: "fixture-judge",
        promptVersion: fixture.judgePromptVersion,
        evaluate: async () => judgeResult,
      },
    });
    const caseResult = run.caseResults[0];
    assert.ok(caseResult);
    assert.equal(caseResult.answerLeakage, entry.expected.answerLeakage, entry.id);
    assert.deepEqual(
      caseResult.criticalFailures.map((failure) => ({
        type: failure.type,
        severity: failure.severity,
      })),
      entry.expected.criticalFailures,
      entry.id,
    );
    assert.equal(run.errorCount, 0, entry.id);
  }
});
