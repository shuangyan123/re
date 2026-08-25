import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import { BenchmarkConfigurationError } from "../contracts/errors.js";
import {
  type HumanReferenceSemanticAuditAnnotations,
  type HumanReferenceSemanticAuditPacket,
  type HumanReferenceSemanticAuditReport,
  type HumanReferenceSemanticAuditSubmission,
  type HumanReferenceSemanticAuditSubmissionTemplate,
} from "../contracts/human-reference-semantic-audit.js";
import {
  parseHumanReferenceSemanticAuditAnnotations,
  parseHumanReferenceSemanticAuditPacket,
  parseHumanReferenceSemanticAuditSubmission,
} from "../contracts/human-reference-semantic-audit-validation.js";

async function readJson(path: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as unknown;
  } catch {
    throw new BenchmarkConfigurationError("human_reference_semantic_audit_invalid");
  }
}

export async function loadHumanReferenceSemanticAuditGuide(path: string): Promise<string> {
  try {
    return await readFile(path, "utf8");
  } catch {
    throw new BenchmarkConfigurationError("human_reference_semantic_audit_invalid");
  }
}

export async function loadHumanReferenceSemanticAuditPacket(
  path: string,
): Promise<HumanReferenceSemanticAuditPacket> {
  return parseHumanReferenceSemanticAuditPacket(await readJson(path));
}

export async function loadHumanReferenceSemanticAuditSubmission(
  path: string,
): Promise<HumanReferenceSemanticAuditSubmission> {
  return parseHumanReferenceSemanticAuditSubmission(await readJson(path));
}

export async function loadHumanReferenceSemanticAuditAnnotations(
  path: string,
): Promise<HumanReferenceSemanticAuditAnnotations> {
  return parseHumanReferenceSemanticAuditAnnotations(await readJson(path));
}

export async function writeHumanReferenceSemanticAuditJson(
  value: HumanReferenceSemanticAuditPacket |
    HumanReferenceSemanticAuditSubmissionTemplate |
    HumanReferenceSemanticAuditAnnotations |
    HumanReferenceSemanticAuditReport,
  outputPath: string,
): Promise<void> {
  try {
    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(outputPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  } catch {
    throw new BenchmarkConfigurationError("human_reference_semantic_audit_invalid");
  }
}

export async function writeHumanReferenceSemanticAuditInstructions(
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
