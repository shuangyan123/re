import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import { BenchmarkConfigurationError } from "../contracts/errors.js";
import type {
  HumanReferenceQualifiedSemanticAuditAnnotations,
  HumanReferenceQualifiedSemanticAuditPacket,
  HumanReferenceQualifiedSemanticAuditReport,
  HumanReferenceQualifiedSemanticAuditSubmission,
  HumanReferenceQualifiedSemanticAuditSubmissionTemplate,
  ReviewerQualificationPacket,
  ReviewerQualificationResult,
  ReviewerQualificationSubmission,
  ReviewerQualificationSubmissionTemplate,
} from "../contracts/human-reference-semantic-audit-v2.js";
import {
  parseHumanReferenceQualifiedSemanticAuditAnnotations,
  parseHumanReferenceQualifiedSemanticAuditPacket,
  parseHumanReferenceQualifiedSemanticAuditSubmission,
  parseReviewerQualificationPacket,
  parseReviewerQualificationResult,
  parseReviewerQualificationSubmission,
} from "../contracts/human-reference-semantic-audit-v2-validation.js";

async function readJson(path: string): Promise<unknown> {
  try { return JSON.parse(await readFile(path, "utf8")) as unknown; } catch {
    throw new BenchmarkConfigurationError("human_reference_semantic_audit_invalid");
  }
}

export async function loadReviewerQualificationPacket(path: string): Promise<ReviewerQualificationPacket> {
  return parseReviewerQualificationPacket(await readJson(path));
}

export async function loadReviewerQualificationSubmission(path: string): Promise<ReviewerQualificationSubmission> {
  return parseReviewerQualificationSubmission(await readJson(path));
}

export async function loadReviewerQualificationResult(path: string): Promise<ReviewerQualificationResult> {
  return parseReviewerQualificationResult(await readJson(path));
}

export async function loadQualifiedSemanticAuditPacket(
  path: string,
): Promise<HumanReferenceQualifiedSemanticAuditPacket> {
  return parseHumanReferenceQualifiedSemanticAuditPacket(await readJson(path));
}

export async function loadQualifiedSemanticAuditSubmission(
  path: string,
): Promise<HumanReferenceQualifiedSemanticAuditSubmission> {
  return parseHumanReferenceQualifiedSemanticAuditSubmission(await readJson(path));
}

export async function loadQualifiedSemanticAuditAnnotations(
  path: string,
): Promise<HumanReferenceQualifiedSemanticAuditAnnotations> {
  return parseHumanReferenceQualifiedSemanticAuditAnnotations(await readJson(path));
}

export async function writeHumanReferenceSemanticAuditV2Json(
  value: ReviewerQualificationPacket | ReviewerQualificationSubmissionTemplate | ReviewerQualificationResult |
    HumanReferenceQualifiedSemanticAuditPacket | HumanReferenceQualifiedSemanticAuditSubmissionTemplate |
    HumanReferenceQualifiedSemanticAuditAnnotations | HumanReferenceQualifiedSemanticAuditReport,
  outputPath: string,
): Promise<void> {
  try {
    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(outputPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  } catch {
    throw new BenchmarkConfigurationError("human_reference_semantic_audit_invalid");
  }
}

export async function writeHumanReferenceSemanticAuditV2Markdown(
  value: string,
  outputPath: string,
): Promise<void> {
  try {
    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(outputPath, value, "utf8");
  } catch {
    throw new BenchmarkConfigurationError("human_reference_semantic_audit_invalid");
  }
}
