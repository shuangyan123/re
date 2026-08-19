import assert from "node:assert/strict";
import { test } from "node:test";

import {
  MATERIAL_REQUIREMENT_JUDGE_SCHEMA_VERSION,
  parseMaterialRequirementJudgeInput,
  parseMaterialRequirementJudgeResult,
  type MaterialRequirementJudgeInput,
} from "../src/contracts/index.js";
import {
  aggregateMaterialRequirementAssessments,
  buildMaterialRequirementJudgeResultJsonSchema,
  loadMaterialRequirementJudgePrompt,
  MATERIAL_REQUIREMENT_JUDGE_PROMPT_ID,
  MATERIAL_REQUIREMENT_JUDGE_PROMPT_VERSION,
} from "../src/judge/index.js";

const input: MaterialRequirementJudgeInput = parseMaterialRequirementJudgeInput({
  caseId: "structured-case-001",
  rubrics: [
    {
      id: "rubric-a",
      criterion: "Assess both material requirements.",
      requirements: [
        { id: "A1", description: "First material requirement." },
        { id: "A2", description: "Second material requirement." },
      ],
    },
    {
      id: "rubric-b",
      criterion: "Assess the separate owner.",
      requirements: [{ id: "B1", description: "Owned by rubric B." }],
    },
  ],
  tutorResponse: "A visible synthetic Tutor response.",
});

function validResult(): unknown {
  return {
    schemaVersion: MATERIAL_REQUIREMENT_JUDGE_SCHEMA_VERSION,
    caseId: input.caseId,
    rubricAssessments: [
      {
        rubricId: "rubric-a",
        requirements: [
          { requirementId: "A1", status: "SATISFIED", evidence: "Visible evidence." },
          { requirementId: "A2", status: "OMITTED_OR_INCOMPLETE" },
        ],
      },
      {
        rubricId: "rubric-b",
        requirements: [
          { requirementId: "B1", status: "EXPLICIT_CONFLICT", evidence: "Conflicting claim." },
        ],
      },
    ],
  };
}

test("MaterialRequirement input requires stable unique IDs and non-empty descriptions", () => {
  assert.equal(input.rubrics[0]?.requirements[0]?.id, "A1");
  assert.throws(
    () => parseMaterialRequirementJudgeInput({
      ...input,
      rubrics: [{
        id: "rubric-a",
        criterion: "criterion",
        requirements: [
          { id: "A1", description: "first" },
          { id: "A1", description: "duplicate" },
        ],
      }],
    }),
    /Material Requirement Judge input or result is invalid/,
  );
  for (const invalidId of ["", " ", "1starts-with-number"]) {
    assert.throws(
      () => parseMaterialRequirementJudgeInput({
        ...input,
        rubrics: [{
          id: "rubric-a",
          criterion: "criterion",
          requirements: [{ id: invalidId, description: "description" }],
        }],
      }),
      /Material Requirement Judge input or result is invalid/,
    );
  }
});

test("result parser enforces exact requirement and rubric ownership", () => {
  const parsed = parseMaterialRequirementJudgeResult(validResult(), input);
  assert.equal(parsed.rubricAssessments.length, 2);

  const mutations: unknown[] = [
    {
      ...validResult() as object,
      rubricAssessments: [{
        rubricId: "rubric-a",
        requirements: [{ requirementId: "A1", status: "SATISFIED" }],
      }],
    },
    {
      ...validResult() as object,
      rubricAssessments: [
        {
          rubricId: "rubric-a",
          requirements: [
            { requirementId: "A1", status: "SATISFIED" },
            { requirementId: "A1", status: "SATISFIED" },
          ],
        },
        { rubricId: "rubric-b", requirements: [{ requirementId: "B1", status: "SATISFIED" }] },
      ],
    },
    {
      ...validResult() as object,
      rubricAssessments: [
        {
          rubricId: "rubric-a",
          requirements: [
            { requirementId: "A1", status: "SATISFIED" },
            { requirementId: "UNKNOWN", status: "SATISFIED" },
          ],
        },
        { rubricId: "rubric-b", requirements: [{ requirementId: "B1", status: "SATISFIED" }] },
      ],
    },
    {
      ...validResult() as object,
      rubricAssessments: [
        {
          rubricId: "rubric-a",
          requirements: [
            { requirementId: "A1", status: "SATISFIED" },
            { requirementId: "B1", status: "SATISFIED" },
          ],
        },
        { rubricId: "rubric-b", requirements: [{ requirementId: "A2", status: "SATISFIED" }] },
      ],
    },
    {
      ...validResult() as object,
      rubricAssessments: [
        {
          rubricId: "rubric-a",
          requirements: [
            { requirementId: "A1", status: "PASS" },
            { requirementId: "A2", status: "SATISFIED" },
          ],
        },
        { rubricId: "rubric-b", requirements: [{ requirementId: "B1", status: "SATISFIED" }] },
      ],
    },
  ];
  for (const mutation of mutations) {
    assert.throws(
      () => parseMaterialRequirementJudgeResult(mutation, input),
      /Material Requirement Judge input or result is invalid/,
    );
  }
});

test("result parser rejects empty IDs and provider reasoning or payload fields", () => {
  const emptyId = validResult() as {
    rubricAssessments: { requirements: { requirementId: string }[] }[];
  };
  emptyId.rubricAssessments[0]!.requirements[0]!.requirementId = "";
  assert.throws(() => parseMaterialRequirementJudgeResult(emptyId, input));

  for (const forbiddenField of ["reasoning", "reasoning_content", "rawProviderPayload"]) {
    const result = validResult() as Record<string, unknown>;
    result[forbiddenField] = "must not persist";
    assert.throws(
      () => parseMaterialRequirementJudgeResult(result, input),
      /Material Requirement Judge input or result is invalid/,
    );
  }
  const nestedReasoning = validResult() as {
    rubricAssessments: { requirements: Record<string, unknown>[] }[];
  };
  nestedReasoning.rubricAssessments[0]!.requirements[0]!.reasoning =
    "must not persist";
  assert.throws(
    () => parseMaterialRequirementJudgeResult(nestedReasoning, input),
    /Material Requirement Judge input or result is invalid/,
  );
});

test("deterministic aggregation implements the public severity rules independent of order", () => {
  const cases = [
    { statuses: ["SATISFIED", "SATISFIED"] as const, expected: "PASS" },
    { statuses: ["SATISFIED", "OMITTED_OR_INCOMPLETE"] as const, expected: "PARTIAL" },
    { statuses: ["SATISFIED", "EXPLICIT_CONFLICT"] as const, expected: "FAIL" },
    { statuses: ["OMITTED_OR_INCOMPLETE", "OMITTED_OR_INCOMPLETE"] as const, expected: "FAIL" },
    { statuses: ["EXPLICIT_CONFLICT", "SATISFIED", "SATISFIED"] as const, expected: "FAIL" },
  ];
  for (const item of cases) {
    const assessments = item.statuses.map((status) => ({ status }));
    assert.equal(aggregateMaterialRequirementAssessments(assessments), item.expected);
    assert.equal(aggregateMaterialRequirementAssessments([...assessments].reverse()), item.expected);
  }
  assert.throws(() => aggregateMaterialRequirementAssessments([]), /At least one/);
});

test("experimental prompt and schema keep atomic output separate from production labels", async () => {
  assert.equal(MATERIAL_REQUIREMENT_JUDGE_PROMPT_ID, "tutor-eval-material-requirement-judge-system");
  assert.equal(MATERIAL_REQUIREMENT_JUDGE_PROMPT_VERSION, "0.1");
  const prompt = await loadMaterialRequirementJudgePrompt();
  assert.match(prompt, /Do not output `PASS`, `PARTIAL`, or `FAIL`/);
  assert.match(prompt, /explicit conflict takes precedence over omission/i);
  assert.match(prompt, /hidden\s+reasoning/i);
  const schema = buildMaterialRequirementJudgeResultJsonSchema();
  assert.deepEqual(
    (schema.properties as Record<string, unknown>).schemaVersion,
    { type: "integer", enum: [1] },
  );
  assert.doesNotMatch(JSON.stringify(schema), /criticalFailures|factualErrors|insufficientInformation/);
});
