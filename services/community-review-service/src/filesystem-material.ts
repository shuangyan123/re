import { readFile, realpath, stat } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";

import {
  communityReviewVisibleTaskSetFingerprint,
} from "../../../src/community-review/fingerprint.js";
import {
  parseCommunityReviewVisibleTasks,
} from "../../../src/contracts/community-review-validation.js";
import type {
  CommunityReviewVisibleTask,
} from "../../../src/contracts/community-review.js";
import { CommunityReviewServiceError } from "./errors.js";
import {
  qualificationAnswerKeyCommitment,
  qualificationDefinitionFingerprint,
  parseQualificationPrivateAnswerKey,
  parseQualificationVisibleMaterial,
  QualificationMaterialError,
} from "./qualification.js";
import type {
  QualificationMaterialIdentity,
  QualificationMaterialStore,
  QualificationPrivateAnswerKey,
  QualificationVisibleMaterial,
} from "./qualification.js";
import {
  ReviewBatchMaterialError,
} from "./material.js";
import type {
  ReviewBatchMaterialLookup,
  ReviewBatchMaterialStore,
} from "./material.js";

const DEFAULT_MAX_PRIVATE_MATERIAL_BYTES = 5 * 1024 * 1024;

class PrivateMaterialReadError extends Error {
  readonly code: "not_found" | "invalid";

  constructor(code: "not_found" | "invalid") {
    super(code);
    this.name = "PrivateMaterialReadError";
    this.code = code;
  }
}

function validReference(reference: string): string[] {
  if (typeof reference !== "string" || reference.length === 0 || reference.length > 512 ||
    reference.includes("\u0000") || isAbsolute(reference) || reference.includes("\\")) {
    throw new PrivateMaterialReadError("invalid");
  }
  const segments = reference.split("/");
  if (segments.some((segment) => segment.length === 0 || segment === "." || segment === ".." || segment.includes(":"))) {
    throw new PrivateMaterialReadError("invalid");
  }
  return segments;
}

async function readPrivateJson(
  root: string,
  reference: string,
  maxBytes: number,
): Promise<unknown> {
  const segments = validReference(reference);
  let rootPath: string;
  let filePath: string;
  try {
    rootPath = await realpath(root);
    filePath = await realpath(resolve(rootPath, ...segments));
    const relativePath = relative(rootPath, filePath);
    if (relativePath.length === 0 || relativePath === ".." || relativePath.startsWith(`..${sep}`) ||
      isAbsolute(relativePath)) throw new PrivateMaterialReadError("invalid");
    const info = await stat(filePath);
    if (!info.isFile() || info.size > maxBytes) throw new PrivateMaterialReadError("invalid");
  } catch (error) {
    if (error instanceof PrivateMaterialReadError) throw error;
    throw new PrivateMaterialReadError("not_found");
  }
  try {
    const raw = await readFile(filePath, "utf8");
    return JSON.parse(raw) as unknown;
  } catch {
    throw new PrivateMaterialReadError("invalid");
  }
}

export async function assertPrivateMaterialRootUsable(root: string): Promise<void> {
  try {
    const canonicalRoot = await realpath(root);
    const canonicalCwd = await realpath(process.cwd());
    const cwdRelativeToRoot = relative(canonicalRoot, canonicalCwd);
    if (cwdRelativeToRoot === "" ||
      (!isAbsolute(cwdRelativeToRoot) && cwdRelativeToRoot !== ".." &&
        !cwdRelativeToRoot.startsWith(`..${sep}`))) {
      throw new Error("private material root contains the workspace");
    }
    const workspaceRelative = relative(canonicalCwd, canonicalRoot);
    const firstSegment = workspaceRelative.split(sep)[0]?.toLowerCase();
    if (workspaceRelative.length === 0 || [
      ".git", ".github", "src", "services", "docs", "tests", "data", "assets", "scenarios",
      "prompts", "scripts", "dist", "node_modules",
    ].includes(firstSegment ?? "")) {
      throw new Error("private material root overlaps the workspace");
    }
    const info = await stat(canonicalRoot);
    if (!info.isDirectory()) throw new Error("not a directory");
  } catch {
    throw new CommunityReviewServiceError("invalid_service_record");
  }
}

function qualificationError(error: PrivateMaterialReadError): QualificationMaterialError {
  return new QualificationMaterialError(error.code);
}

function batchMaterialError(error: PrivateMaterialReadError): ReviewBatchMaterialError {
  return new ReviewBatchMaterialError(error.code);
}

/** Read-only private filesystem implementation for qualification material. */
export class FilesystemQualificationMaterialStore implements QualificationMaterialStore {
  private readonly root: string;
  private readonly maxBytes: number;

  constructor(root: string, maxBytes = DEFAULT_MAX_PRIVATE_MATERIAL_BYTES) {
    if (typeof root !== "string" || root.trim().length === 0 || !isAbsolute(root) ||
      !Number.isInteger(maxBytes) || maxBytes < 1024) {
      throw new CommunityReviewServiceError("invalid_service_record");
    }
    this.root = resolve(root);
    this.maxBytes = maxBytes;
  }

  getRoot(): string {
    return this.root;
  }

  async assertUsable(): Promise<void> {
    await assertPrivateMaterialRootUsable(this.root);
  }

  async loadVisiblePacket(identity: QualificationMaterialIdentity): Promise<QualificationVisibleMaterial> {
    let value: unknown;
    try {
      value = await readPrivateJson(this.root, identity.sealedDefinitionReference, this.maxBytes);
    } catch (error) {
      if (error instanceof PrivateMaterialReadError) throw qualificationError(error);
      throw new QualificationMaterialError("invalid");
    }
    let material: QualificationVisibleMaterial;
    try {
      material = parseQualificationVisibleMaterial(value);
    } catch {
      throw new QualificationMaterialError("invalid");
    }
    const expectedFingerprint = qualificationDefinitionFingerprint({
      qualificationId: identity.qualificationId,
      qualificationVersion: identity.qualificationVersion,
      qualificationPoolId: identity.qualificationPoolId,
      qualificationPoolVersion: identity.qualificationPoolVersion,
      instrumentId: identity.instrumentId,
      instrumentVersion: identity.instrumentVersion,
      instrumentFingerprint: identity.instrumentFingerprint,
      reviewLocale: identity.reviewLocale,
      passRuleId: material.passRuleId,
      items: material.items,
    });
    if (expectedFingerprint !== identity.qualificationDefinitionFingerprint) {
      throw new QualificationMaterialError("invalid");
    }
    return material;
  }

  async loadPrivateAnswerKey(identity: QualificationMaterialIdentity): Promise<QualificationPrivateAnswerKey> {
    let value: unknown;
    try {
      value = await readPrivateJson(this.root, identity.privateAnswerKeyReference, this.maxBytes);
    } catch (error) {
      if (error instanceof PrivateMaterialReadError) throw qualificationError(error);
      throw new QualificationMaterialError("invalid");
    }
    try {
      return parseQualificationPrivateAnswerKey(value);
    } catch {
      throw new QualificationMaterialError("invalid");
    }
  }

  /** Validates the answer-key commitment against the caller-provided identity. */
  async verifyAnswerKeyCommitment(
    identity: QualificationMaterialIdentity,
    answers: QualificationPrivateAnswerKey,
    expectedCommitment: string,
  ): Promise<void> {
    const commitment = qualificationAnswerKeyCommitment({
      identity,
      passRuleId: "all-required-items-correct@1",
      answers: answers.answers,
    });
    if (commitment !== expectedCommitment) throw new QualificationMaterialError("invalid");
  }
}

/** Read-only private filesystem implementation for sealed review tasks. */
export class FilesystemReviewBatchMaterialStore implements ReviewBatchMaterialStore {
  private readonly root: string;
  private readonly maxBytes: number;

  constructor(root: string, maxBytes = DEFAULT_MAX_PRIVATE_MATERIAL_BYTES) {
    if (typeof root !== "string" || root.trim().length === 0 || !isAbsolute(root) ||
      !Number.isInteger(maxBytes) || maxBytes < 1024) {
      throw new CommunityReviewServiceError("invalid_service_record");
    }
    this.root = resolve(root);
    this.maxBytes = maxBytes;
  }

  getRoot(): string {
    return this.root;
  }

  async assertUsable(): Promise<void> {
    await assertPrivateMaterialRootUsable(this.root);
  }

  async loadVisibleTasksForBatch(
    lookup: ReviewBatchMaterialLookup,
  ): Promise<readonly CommunityReviewVisibleTask[]> {
    let value: unknown;
    try {
      value = await readPrivateJson(this.root, lookup.sealedSourceReference, this.maxBytes);
    } catch (error) {
      if (error instanceof PrivateMaterialReadError) throw batchMaterialError(error);
      throw new ReviewBatchMaterialError("invalid");
    }
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      throw new ReviewBatchMaterialError("invalid");
    }
    const parsed = value as Record<string, unknown>;
    if (Object.keys(parsed).some((key) => !["sealedSourceFingerprint", "tasks"].includes(key)) ||
      typeof parsed.sealedSourceFingerprint !== "string" ||
      parsed.sealedSourceFingerprint !== lookup.sealedSourceFingerprint) {
      throw new ReviewBatchMaterialError("invalid");
    }
    let tasks: CommunityReviewVisibleTask[];
    try {
      tasks = parseCommunityReviewVisibleTasks(parsed.tasks);
    } catch {
      throw new ReviewBatchMaterialError("invalid");
    }
    if (communityReviewVisibleTaskSetFingerprint(tasks) !== lookup.visibleTaskSetFingerprint) {
      throw new ReviewBatchMaterialError("invalid");
    }
    return structuredClone(tasks);
  }
}
