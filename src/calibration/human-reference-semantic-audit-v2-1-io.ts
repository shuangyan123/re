import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import { BenchmarkConfigurationError } from "../contracts/errors.js";
import type {
  HumanReferenceQualifiedSemanticAuditAnnotationsV21,
  HumanReferenceQualifiedSemanticAuditPacketV21,
  HumanReferenceQualifiedSemanticAuditReportV21,
  HumanReferenceQualifiedSemanticAuditSubmissionTemplateV21,
  ReviewerQualificationPacketV21,
  ReviewerQualificationResultV21,
  ReviewerQualificationSubmissionTemplateV21,
} from "../contracts/human-reference-semantic-audit-v2-1.js";
import {
  parseHumanReferenceQualifiedSemanticAuditAnnotationsV21,
  parseHumanReferenceQualifiedSemanticAuditPacketV21,
  parseHumanReferenceQualifiedSemanticAuditSubmissionV21,
  parseReviewerQualificationPacketV21,
  parseReviewerQualificationResultV21,
  parseReviewerQualificationSubmissionV21,
} from "../contracts/human-reference-semantic-audit-v2-1-validation.js";

async function readJson(path: string): Promise<unknown> {
  try { return JSON.parse(await readFile(path, "utf8")) as unknown; } catch {
    throw new BenchmarkConfigurationError("human_reference_semantic_audit_invalid");
  }
}

export async function loadReviewerQualificationPacketV21(path: string) {
  return parseReviewerQualificationPacketV21(await readJson(path));
}

export async function loadReviewerQualificationSubmissionV21(path: string) {
  return parseReviewerQualificationSubmissionV21(await readJson(path));
}

export async function loadReviewerQualificationResultV21(path: string) {
  return parseReviewerQualificationResultV21(await readJson(path));
}

export async function loadQualifiedSemanticAuditPacketV21(path: string) {
  return parseHumanReferenceQualifiedSemanticAuditPacketV21(await readJson(path));
}

export async function loadQualifiedSemanticAuditSubmissionV21(path: string) {
  return parseHumanReferenceQualifiedSemanticAuditSubmissionV21(await readJson(path));
}

export async function loadQualifiedSemanticAuditAnnotationsV21(path: string) {
  return parseHumanReferenceQualifiedSemanticAuditAnnotationsV21(await readJson(path));
}

export async function writeHumanReferenceSemanticAuditV21Json(
  value: ReviewerQualificationPacketV21 | ReviewerQualificationSubmissionTemplateV21 |
    ReviewerQualificationResultV21 | HumanReferenceQualifiedSemanticAuditPacketV21 |
    HumanReferenceQualifiedSemanticAuditSubmissionTemplateV21 |
    HumanReferenceQualifiedSemanticAuditAnnotationsV21 | HumanReferenceQualifiedSemanticAuditReportV21,
  outputPath: string,
): Promise<void> {
  try {
    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(outputPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  } catch {
    throw new BenchmarkConfigurationError("human_reference_semantic_audit_invalid");
  }
}

export async function writeHumanReferenceSemanticAuditV21Markdown(value: string, outputPath: string): Promise<void> {
  try {
    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(outputPath, value, "utf8");
  } catch {
    throw new BenchmarkConfigurationError("human_reference_semantic_audit_invalid");
  }
}
