import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { resolve } from "node:path";

import {
  MATERIAL_REQUIREMENT_ASSESSMENT_STATUSES,
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
  MATERIAL_REQUIREMENT_JUDGE_PROMPT_ASSET,
  MATERIAL_REQUIREMENT_JUDGE_PROMPT_VERSION,
} from "../src/judge/index.js";

const input: MaterialRequirementJudgeInput = parseMaterialRequirementJudgeInput({
  caseId: "structured-case-001",
  learningObjective: "Assess the response against the supplied case evidence.",
  studentProfile: JSON.stringify({ level: "synthetic" }),
  conversationHistory: JSON.stringify([]),
  studentMessage: "A synthetic student message.",
  problemContext: "A synthetic problem context.",
  groundTruth: JSON.stringify({ expected: "synthetic" }),
  knownMisconception: "A synthetic known misconception.",
  disclosurePolicy: "hint_only",
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

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Expected a JSON Schema object.");
  }
  return value as Record<string, unknown>;
}

test("MaterialRequirement input requires complete typed context and rejects extras", () => {
  assert.equal(input.studentMessage, "A synthetic student message.");
  for (const requiredField of [
    "learningObjective",
    "studentProfile",
    "conversationHistory",
    "studentMessage",
    "problemContext",
    "groundTruth",
    "knownMisconception",
    "disclosurePolicy",
  ] as const) {
    const missing = { ...input } as Record<string, unknown>;
    delete missing[requiredField];
    assert.throws(
      () => parseMaterialRequirementJudgeInput(missing),
      /Material Requirement Judge input or result is invalid/,
    );
  }
  assert.throws(
    () => parseMaterialRequirementJudgeInput({ ...input, providerMetadata: {} }),
    /Material Requirement Judge input or result is invalid/,
  );
  assert.throws(
    () => parseMaterialRequirementJudgeInput({ ...input, conversationHistory: [] }),
    /Material Requirement Judge input or result is invalid/,
  );
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

test("experimental v0.3 prompt and schema keep atomic output separate from production labels", async () => {
  assert.equal(MATERIAL_REQUIREMENT_JUDGE_PROMPT_ID, "tutor-eval-material-requirement-judge-system");
  assert.equal(MATERIAL_REQUIREMENT_JUDGE_PROMPT_VERSION, "0.3");
  assert.equal(
    MATERIAL_REQUIREMENT_JUDGE_PROMPT_ASSET,
    "prompts/tutor-eval-material-requirement-judge-system-v0.3.md",
  );
  const prompt = await loadMaterialRequirementJudgePrompt();
  assert.match(prompt, /Return exactly one JSON object with this shape/i);
  for (const field of [
    "schemaVersion",
    "caseId",
    "rubricAssessments",
    "rubricId",
    "requirements",
    "requirementId",
    "status",
  ]) {
    assert.match(prompt, new RegExp(`"${field}"`));
  }
  for (const status of MATERIAL_REQUIREMENT_ASSESSMENT_STATUSES) {
    assert.match(prompt, new RegExp(`\\b${status}\\b`));
  }
  assert.match(prompt, /Do not output `PASS`, `PARTIAL`, or `FAIL`/);
  assert.match(prompt, /explicit conflict takes precedence over omission/i);
  assert.match(prompt, /hidden\s+reasoning/i);
  assert.match(prompt, /copy\s+`caseId`\s+exactly/i);
  assert.match(prompt, /copy every\s+`rubricId`\s+exactly/i);
  assert.match(prompt, /copy(?:ing)? every\s+`requirementId`\s+exactly/i);
  assert.match(prompt, /every supplied rubric exactly\s+once/i);
  assert.match(prompt, /every supplied requirement exactly\s+once/i);
  assert.match(prompt, /additional\s+requirements/i);
  assert.match(prompt, /additional rubrics/i);
  assert.match(prompt, /additional fields/i);
  assert.match(prompt, /Do not rename keys/i);
  assert.match(prompt, /evidence` is optional/i);
  assert.match(prompt, /visible Tutor response only/i);
  assert.match(prompt, /Markdown code fence/i);
  assert.match(prompt, /explanatory\s+prose outside the single JSON object/i);
  assert.match(prompt, /does\s+not contain developer-expected atomic statuses/i);
  assert.match(prompt, /explicitly or express a clear semantic equivalent/i);
  assert.match(prompt, /Do not infer a missing\s+material limitation/i);
  assert.match(prompt, /entire visible Tutor response/i);
  assert.match(prompt, /any substantive affirmative claim anywhere\s+in the response/i);
  assert.match(prompt, /Conflict takes precedence over\s+omission/i);
  assert.doesNotMatch(prompt, /reluctant/i);
  assert.doesNotMatch(prompt, /pause-before-agreeing/i);
  assert.doesNotMatch(prompt, /unwilling/i);

  const schema = buildMaterialRequirementJudgeResultJsonSchema();
  const schemaProperties = asRecord(schema.properties);
  assert.equal(schema.additionalProperties, false);
  assert.deepEqual(Object.keys(schemaProperties).sort(), [
    "caseId",
    "rubricAssessments",
    "schemaVersion",
  ]);
  assert.deepEqual(schema.required, ["schemaVersion", "caseId", "rubricAssessments"]);
  assert.deepEqual(
    schemaProperties.schemaVersion,
    { type: "integer", enum: [1] },
  );
  const rubricAssessmentsSchema = asRecord(schemaProperties.rubricAssessments);
  const rubricSchema = asRecord(rubricAssessmentsSchema.items);
  const rubricProperties = asRecord(rubricSchema.properties);
  assert.equal(rubricSchema.additionalProperties, false);
  assert.deepEqual(Object.keys(rubricProperties).sort(), ["requirements", "rubricId"]);
  assert.deepEqual(rubricSchema.required, ["rubricId", "requirements"]);
  const requirementsSchema = asRecord(rubricProperties.requirements);
  const requirementSchema = asRecord(requirementsSchema.items);
  const requirementProperties = asRecord(requirementSchema.properties);
  assert.equal(requirementSchema.additionalProperties, false);
  assert.deepEqual(Object.keys(requirementProperties).sort(), [
    "evidence",
    "requirementId",
    "status",
  ]);
  assert.deepEqual(requirementSchema.required, ["requirementId", "status"]);
  assert.deepEqual(
    asRecord(requirementProperties.status).enum,
    [...MATERIAL_REQUIREMENT_ASSESSMENT_STATUSES],
  );
  assert.doesNotMatch(JSON.stringify(schema), /criticalFailures|factualErrors|insufficientInformation/);
});

test("historical v0.1 and v0.2 material prompts remain readable and content-immutable", async () => {
  const historicalPrompts = [
    {
      asset: "prompts/tutor-eval-material-requirement-judge-system-v0.1.md",
      sha256: "2f89fdf56f50c7dc16b7586b06f319f9ccf0151e463e8dadce4ed6bfda02fa8a",
    },
    {
      asset: "prompts/tutor-eval-material-requirement-judge-system-v0.2.md",
      sha256: "7c1576731e8de7b314ebeb8a930c68b0bad841c77a4cba5be1b63a949bc6c929",
    },
  ] as const;
  for (const historical of historicalPrompts) {
    const prompt = await readFile(resolve(process.cwd(), historical.asset), "utf8");
    assert.equal(
      createHash("sha256")
        .update(prompt.replace(/\r\n?/gu, "\n"), "utf8")
        .digest("hex"),
      historical.sha256,
    );
  }
});
