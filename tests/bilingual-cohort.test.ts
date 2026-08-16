import assert from "node:assert/strict";
import { test } from "node:test";

import {
  TUTOR_EVAL_DATASET_ID,
  TUTOR_EVAL_PREVIOUS_DATASET_VERSION,
  resolveTutorCaseLocale,
  toTutorTurnInput,
  type TutorEvalCase,
} from "../src/contracts/index.js";
import {
  buildTutorEvalCoverageReport,
  findTutorEvalDatasetIntegrityIssues,
  loadTutorEvalDataset,
} from "../src/datasets/index.js";

function baseCaseId(id: string): string {
  return id.endsWith("-zh-CN") ? id.slice(0, -"-zh-CN".length) : id;
}

function baseRubricId(id: string): string {
  return id.endsWith("-zh-CN") ? id.slice(0, -"-zh-CN".length) : id;
}

function stableGroundTruth(caseValue: TutorEvalCase): unknown {
  const groundTruth = caseValue.evaluatorOnly.groundTruth;
  return groundTruth === undefined
    ? undefined
    : {
        finalAnswer: groundTruth.finalAnswer,
        acceptedAnswers: [...(groundTruth.acceptedAnswers ?? [])].sort(),
      };
}

function stableRubric(rubric: TutorEvalCase["evaluatorOnly"]["rubrics"][number]): unknown {
  return {
    category: rubric.category,
    weight: rubric.weight,
    behavior: rubric.behavior,
    capabilityTag: rubric.capabilityTag,
    evaluationType: rubric.evaluationType,
    critical: rubric.critical,
    evaluatorId: rubric.evaluatorId,
    config: rubric.config,
    criticalFailure: rubric.criticalFailure,
  };
}

function visibleStrings(caseValue: TutorEvalCase): readonly string[] {
  const input = caseValue.tutorInput;
  const profile = input.studentProfile;
  return [
    input.learningObjective,
    input.studentMessage,
    ...(input.problemContext === undefined ? [] : [input.problemContext]),
    ...(input.conversationHistory?.map((message) => message.text) ?? []),
    ...(profile?.knownConcepts ?? []),
    ...(profile?.misconceptions ?? []),
    ...(profile?.level === undefined ? [] : [profile.level]),
    ...(profile?.goal === undefined ? [] : [profile.goal]),
  ];
}

test("the canonical dataset has a complete, symmetric English and zh-CN cohort", async () => {
  const dataset = await loadTutorEvalDataset(TUTOR_EVAL_DATASET_ID);
  const groups = new Map<string, TutorEvalCase[]>();
  for (const tutorEvalCase of dataset.cases) {
    assert.ok(tutorEvalCase.crossLocaleGroupId);
    const group = groups.get(tutorEvalCase.crossLocaleGroupId) ?? [];
    group.push(tutorEvalCase);
    groups.set(tutorEvalCase.crossLocaleGroupId, group);
  }

  assert.equal(dataset.cases.length, 48);
  assert.equal(groups.size, 24);
  assert.equal(
    dataset.cases.filter((caseValue) => resolveTutorCaseLocale(caseValue.locale) === "en").length,
    24,
  );
  assert.equal(
    dataset.cases.filter((caseValue) => resolveTutorCaseLocale(caseValue.locale) === "zh-CN").length,
    24,
  );

  for (const [groupId, members] of groups) {
    assert.equal(members.length, 2, groupId);
    const english = members.find((caseValue) => resolveTutorCaseLocale(caseValue.locale) === "en");
    const chinese = members.find((caseValue) => resolveTutorCaseLocale(caseValue.locale) === "zh-CN");
    assert.ok(english, groupId);
    assert.ok(chinese, groupId);
    assert.equal(english.id, groupId);
    assert.equal(baseCaseId(chinese.id), english.id);
    assert.deepEqual(chinese.metadata.capabilityTags, english.metadata.capabilityTags);
    assert.deepEqual(chinese.metadata.tags, english.metadata.tags);
    assert.equal(chinese.metadata.subject, english.metadata.subject);
    assert.equal(chinese.metadata.learningTask, english.metadata.learningTask);
    assert.equal(chinese.metadata.studentState, english.metadata.studentState);
    assert.deepEqual(chinese.metadata.difficulty, english.metadata.difficulty);
    assert.equal(
      chinese.evaluatorOnly.disclosurePolicy,
      english.evaluatorOnly.disclosurePolicy,
    );
    assert.deepEqual(stableGroundTruth(chinese), stableGroundTruth(english));
    assert.equal(chinese.adaptationVariant, english.adaptationVariant);
    assert.equal(
      chinese.adaptationPairId,
      english.adaptationPairId === undefined
        ? undefined
        : `${english.adaptationPairId}-zh-CN`,
    );
    assert.deepEqual(
      chinese.evaluatorOnly.rubrics.map((rubric) => baseRubricId(rubric.id)),
      english.evaluatorOnly.rubrics.map((rubric) => rubric.id),
    );
    assert.deepEqual(
      chinese.evaluatorOnly.rubrics.map(stableRubric),
      english.evaluatorOnly.rubrics.map(stableRubric),
    );
    for (const text of visibleStrings(chinese)) {
      assert.ok(text.trim().length > 0, `${chinese.id} has empty visible text`);
      assert.match(text, /[\u3400-\u9fff]/u, `${chinese.id} should use natural Chinese text`);
    }
    const tutorInput = toTutorTurnInput(chinese);
    assert.equal(tutorInput.locale, "zh-CN");
    assert.doesNotMatch(JSON.stringify(tutorInput), /evaluatorOnly|crossLocaleGroupId/);
  }

  const report = buildTutorEvalCoverageReport(dataset);
  assert.deepEqual(report.casesByLocale, { en: 24, "zh-CN": 24 });
  assert.equal(report.crossLocaleGroupCount, 24);
});

test("the language-specific verb case is an authored counterpart, not a literal translation claim", async () => {
  const dataset = await loadTutorEvalDataset(TUTOR_EVAL_DATASET_ID);
  const english = dataset.cases.find((caseValue) => caseValue.id === "language-verb-check-001");
  const chinese = dataset.cases.find((caseValue) => caseValue.id === "language-verb-check-001-zh-CN");
  assert.ok(english);
  assert.ok(chinese);
  assert.notEqual(chinese.tutorInput.studentMessage, english.tutorInput.studentMessage);
  assert.match(chinese.tutorInput.studentMessage, /The list of examples are/);
  assert.match(chinese.tutorInput.studentMessage, /这句话对吗/);
  assert.match(chinese.tutorInput.learningObjective, /主谓一致/);
});

test("the previous English-only dataset remains readable without widening replay semantics", async () => {
  const historical = await loadTutorEvalDataset(
    TUTOR_EVAL_DATASET_ID,
    TUTOR_EVAL_PREVIOUS_DATASET_VERSION,
  );
  assert.equal(historical.version, TUTOR_EVAL_PREVIOUS_DATASET_VERSION);
  assert.equal(historical.cases.length, 24);
  assert.ok(
    historical.cases.every((caseValue) => resolveTutorCaseLocale(caseValue.locale) === "en"),
  );
  assert.ok(historical.cases.every((caseValue) => caseValue.id.endsWith("-zh-CN") === false));
});

test("strict bilingual integrity rejects missing or malformed cohort identity", async () => {
  const dataset = await loadTutorEvalDataset(TUTOR_EVAL_DATASET_ID);
  const first = dataset.cases[0]!;
  const missingGroup = {
    ...dataset,
    cases: dataset.cases.map((caseValue) =>
      caseValue.id === first.id
        ? (() => {
            const { crossLocaleGroupId: _groupId, ...withoutGroup } = caseValue;
            return withoutGroup;
          })()
        : caseValue,
    ),
  };
  const missingIssues = findTutorEvalDatasetIntegrityIssues(missingGroup, {
    requireCrossLocaleGroups: true,
  });
  assert.ok(
    missingIssues.some(
      (issue) => issue.code === "cross_locale_group_missing" && issue.caseId === first.id,
    ),
  );

  const malformedGroup = {
    ...dataset,
    cases: dataset.cases.map((caseValue) =>
      caseValue.id === first.id
        ? { ...caseValue, crossLocaleGroupId: "unpaired-group" }
        : caseValue,
    ),
  };
  const malformedIssues = findTutorEvalDatasetIntegrityIssues(malformedGroup, {
    requireCrossLocaleGroups: true,
  });
  assert.ok(
    malformedIssues.some(
      (issue) => issue.code === "cross_locale_group_malformed" && issue.caseId === first.id,
    ),
  );
});
