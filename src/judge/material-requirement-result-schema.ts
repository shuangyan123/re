import {
  MATERIAL_REQUIREMENT_ASSESSMENT_STATUSES,
  MATERIAL_REQUIREMENT_JUDGE_SCHEMA_VERSION,
} from "../contracts/index.js";

export const MATERIAL_REQUIREMENT_JUDGE_RESULT_SCHEMA_NAME =
  "material_requirement_judge_result_v1" as const;

export function buildMaterialRequirementJudgeResultJsonSchema(): Record<string, unknown> {
  return {
    type: "object",
    additionalProperties: false,
    properties: {
      schemaVersion: {
        type: "integer",
        enum: [MATERIAL_REQUIREMENT_JUDGE_SCHEMA_VERSION],
      },
      caseId: { type: "string" },
      rubricAssessments: {
        type: "array",
        minItems: 1,
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            rubricId: { type: "string" },
            requirements: {
              type: "array",
              minItems: 1,
              items: {
                type: "object",
                additionalProperties: false,
                properties: {
                  requirementId: { type: "string" },
                  status: {
                    type: "string",
                    enum: [...MATERIAL_REQUIREMENT_ASSESSMENT_STATUSES],
                  },
                  evidence: { type: "string", maxLength: 500 },
                },
                required: ["requirementId", "status"],
              },
            },
          },
          required: ["rubricId", "requirements"],
        },
      },
    },
    required: ["schemaVersion", "caseId", "rubricAssessments"],
  };
}
