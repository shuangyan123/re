import assert from "node:assert/strict";
import { test } from "node:test";

import {
  TUTOR_EVAL_DATASET_ID,
  TUTOR_EVAL_DATASET_VERSION,
  TUTOR_EVAL_IMMEDIATE_PREVIOUS_DATASET_VERSION,
} from "../src/contracts/index.js";
import { loadTutorEvalDataset } from "../src/datasets/index.js";

const EN_ID = "fraction-misconception-001";
const ZH_ID = "fraction-misconception-001-zh-CN";

function byId<T extends { readonly id: string }>(values: readonly T[], id: string): T {
  const value = values.find((candidate) => candidate.id === id);
  assert.ok(value, id);
  return value;
}

test("0.2a.6 narrows diagnosis and separates conceptual fraction-unit guidance", async () => {
  const dataset = await loadTutorEvalDataset(TUTOR_EVAL_DATASET_ID);
  assert.equal(dataset.version, "0.2a.6");
  assert.equal(TUTOR_EVAL_DATASET_VERSION, "0.2a.6");

  const english = byId(dataset.cases, EN_ID);
  const chinese = byId(dataset.cases, ZH_ID);
  assert.equal(english.version, "1.2.0");
  assert.equal(chinese.version, "1.2.0");

  assert.deepEqual(english.metadata.capabilityTags, chinese.metadata.capabilityTags);
  assert.ok(english.metadata.capabilityTags?.includes("conceptual_prompting"));

  const enDiagnosis = byId(english.evaluatorOnly.rubrics, "fraction-diagnosis-001");
  const zhDiagnosis = byId(chinese.evaluatorOnly.rubrics, "fraction-diagnosis-001-zh-CN");
  assert.equal(enDiagnosis.category, "diagnosis");
  assert.equal(zhDiagnosis.category, "diagnosis");
  assert.equal(enDiagnosis.capabilityTag, "misconception_identification");
  assert.equal(zhDiagnosis.capabilityTag, "misconception_identification");
  assert.doesNotMatch(enDiagnosis.criterion, /different-sized units|compatible units/u);
  assert.doesNotMatch(zhDiagnosis.criterion, /分数单位/u);

  const enConcept = byId(
    english.evaluatorOnly.rubrics,
    "fraction-conceptual-guidance-001",
  );
  const zhConcept = byId(
    chinese.evaluatorOnly.rubrics,
    "fraction-conceptual-guidance-001-zh-CN",
  );
  assert.equal(enConcept.category, "guidance");
  assert.equal(zhConcept.category, "guidance");
  assert.equal(enConcept.capabilityTag, "conceptual_prompting");
  assert.equal(zhConcept.capabilityTag, "conceptual_prompting");
  assert.equal(enConcept.behavior, "required");
  assert.equal(zhConcept.behavior, "required");
  assert.equal(enConcept.weight, 1);
  assert.equal(zhConcept.weight, 1);
  assert.match(enConcept.criterion, /different-sized units|compatible units/u);
  assert.match(zhConcept.criterion, /分数单位.*大小不同|相同单位/u);

  const enScaffold = byId(english.evaluatorOnly.rubrics, "fraction-guidance-001");
  const zhScaffold = byId(chinese.evaluatorOnly.rubrics, "fraction-guidance-001-zh-CN");
  assert.equal(enScaffold.capabilityTag, "scaffolding");
  assert.equal(zhScaffold.capabilityTag, "scaffolding");
  assert.equal(enScaffold.weight, 1);
  assert.equal(zhScaffold.weight, 1);

  assert.match(english.tutorInput.learningObjective, /fraction-unit idea/u);
  assert.match(chinese.tutorInput.learningObjective, /分数单位概念/u);
});

test("0.2a.5 remains loadable and preserves the historical rubric structure", async () => {
  const historical = await loadTutorEvalDataset(
    TUTOR_EVAL_DATASET_ID,
    TUTOR_EVAL_IMMEDIATE_PREVIOUS_DATASET_VERSION,
  );
  assert.equal(historical.version, "0.2a.5");
  const english = byId(historical.cases, EN_ID);
  const chinese = byId(historical.cases, ZH_ID);
  assert.equal(english.version, "1.1.0");
  assert.equal(chinese.version, "1.1.0");
  assert.equal(english.evaluatorOnly.rubrics.length, 4);
  assert.equal(chinese.evaluatorOnly.rubrics.length, 4);
  assert.equal(
    byId(english.evaluatorOnly.rubrics, "fraction-guidance-001").weight,
    2,
  );
  assert.equal(
    byId(chinese.evaluatorOnly.rubrics, "fraction-guidance-001-zh-CN").weight,
    2,
  );
  assert.match(
    byId(chinese.evaluatorOnly.rubrics, "fraction-diagnosis-001-zh-CN").criterion,
    /分数单位不同/u,
  );
});
