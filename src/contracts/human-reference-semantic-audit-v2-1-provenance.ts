import { createHash } from "node:crypto";

import { BenchmarkConfigurationError } from "./errors.js";
import { HUMAN_ATOMIC_STATUSES } from "./human-reference-calibration.js";
import {
  HUMAN_REFERENCE_SEMANTIC_AUDIT_V2_QUALIFICATION_ID,
  type ReviewerQualificationItem,
} from "./human-reference-semantic-audit-v2.js";
import {
  HUMAN_REFERENCE_SEMANTIC_AUDIT_V21_QUALIFICATION_PASS_RULE,
  HUMAN_REFERENCE_SEMANTIC_AUDIT_V21_QUALIFICATION_VERSION,
  type ReviewerQualificationDefinition,
  type ReviewerQualificationDefinitionAssessment,
} from "./human-reference-semantic-audit-v2-1.js";
import {
  qualificationFingerprint,
} from "./human-reference-semantic-audit-v2-presentation.js";

function invalid(): never {
  throw new BenchmarkConfigurationError("human_reference_semantic_audit_invalid");
}

function identityKey(value: Pick<ReviewerQualificationDefinitionAssessment,
"caseId" | "rubricId" | "requirementId">): string {
  return JSON.stringify([value.caseId, value.rubricId, value.requirementId]);
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (typeof value === "object" && value !== null) {
    return `{${Object.entries(value).sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function hash(value: string): string {
  return `sha256:${createHash("sha256").update(value, "utf8").digest("hex")}`;
}

export function qualificationPresentationFingerprint(items: readonly ReviewerQualificationItem[]): string {
  return qualificationFingerprint(items);
}

export function canonicalReviewerQualificationDefinition(
  definition: ReviewerQualificationDefinition,
): ReviewerQualificationDefinition {
  const expectedAssessments = [...definition.expectedAssessments].sort((left, right) =>
    identityKey(left).localeCompare(identityKey(right)));
  const keys = expectedAssessments.map(identityKey);
  if (definition.qualificationId !== HUMAN_REFERENCE_SEMANTIC_AUDIT_V2_QUALIFICATION_ID ||
    definition.qualificationVersion !== HUMAN_REFERENCE_SEMANTIC_AUDIT_V21_QUALIFICATION_VERSION ||
    definition.passRule !== HUMAN_REFERENCE_SEMANTIC_AUDIT_V21_QUALIFICATION_PASS_RULE ||
    !/^sha256:[0-9a-f]{64}$/u.test(definition.qualificationPresentationFingerprint) ||
    expectedAssessments.length === 0 || new Set(keys).size !== keys.length ||
    expectedAssessments.some((assessment) => !HUMAN_ATOMIC_STATUSES.includes(assessment.status))) return invalid();
  return { ...definition, expectedAssessments };
}

export function qualificationDefinitionFingerprint(definition: ReviewerQualificationDefinition): string {
  return hash(`${canonicalJson(canonicalReviewerQualificationDefinition(definition))}\n`);
}

export function buildReviewerQualificationDefinition(
  items: readonly ReviewerQualificationItem[],
  expectedAssessments: readonly ReviewerQualificationDefinitionAssessment[],
): ReviewerQualificationDefinition {
  const visibleAtoms = items.flatMap((item) => item.requirements.map((requirement) => ({
    caseId: item.itemId,
    rubricId: item.itemId,
    requirementId: requirement.requirementId,
  }))).map(identityKey).sort();
  const expectedAtoms = expectedAssessments.map(identityKey).sort();
  if (new Set(visibleAtoms).size !== visibleAtoms.length || visibleAtoms.length !== expectedAtoms.length ||
    visibleAtoms.some((key, index) => key !== expectedAtoms[index])) return invalid();
  return canonicalReviewerQualificationDefinition({
    qualificationId: HUMAN_REFERENCE_SEMANTIC_AUDIT_V2_QUALIFICATION_ID,
    qualificationVersion: HUMAN_REFERENCE_SEMANTIC_AUDIT_V21_QUALIFICATION_VERSION,
    qualificationPresentationFingerprint: qualificationPresentationFingerprint(items),
    passRule: HUMAN_REFERENCE_SEMANTIC_AUDIT_V21_QUALIFICATION_PASS_RULE,
    expectedAssessments,
  });
}
