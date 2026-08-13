import {
  TUTOR_EVAL_CRITICAL_FAILURE_SEVERITIES,
  TUTOR_EVAL_CRITICAL_FAILURE_TYPES,
} from "../contracts/tutor-eval.js";
import {
  TUTOR_EVAL_JUDGE_RUBRIC_STATUSES,
  TUTOR_EVAL_JUDGE_SCHEMA_VERSION,
} from "../contracts/tutor-eval-judge.js";

export const TUTOR_EVAL_JUDGE_RESULT_SCHEMA_NAME =
  "tutor_eval_judge_result_v1" as const;

/**
 * Builds the provider-neutral JSON Schema used by Structured Outputs. The
 * adapter owns the provider request, while this shape stays next to the core
 * Judge contract so schema drift is visible to contract tests.
 */
export function buildTutorEvalJudgeResultJsonSchema(): Record<string, unknown> {
  return {
    type: "object",
    additionalProperties: false,
    properties: {
      schemaVersion: {
        type: "integer",
        enum: [TUTOR_EVAL_JUDGE_SCHEMA_VERSION],
      },
      caseId: { type: "string" },
      rubricResults: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            rubricId: { type: "string" },
            result: {
              type: "string",
              enum: [...TUTOR_EVAL_JUDGE_RUBRIC_STATUSES],
            },
            evidence: { type: "string" },
          },
          required: ["rubricId", "result", "evidence"],
        },
      },
      criticalFailures: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            type: {
              type: "string",
              enum: [...TUTOR_EVAL_CRITICAL_FAILURE_TYPES],
            },
            severity: {
              type: "string",
              enum: [...TUTOR_EVAL_CRITICAL_FAILURE_SEVERITIES],
            },
            evidence: { type: "string" },
          },
          required: ["type", "severity", "evidence"],
        },
      },
      factualErrors: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            description: { type: "string" },
            severity: {
              type: "string",
              enum: [...TUTOR_EVAL_CRITICAL_FAILURE_SEVERITIES],
            },
          },
          required: ["description", "severity"],
        },
      },
      insufficientInformation: { type: "boolean" },
    },
    required: [
      "schemaVersion",
      "caseId",
      "rubricResults",
      "criticalFailures",
      "factualErrors",
      "insufficientInformation",
    ],
  };
}
