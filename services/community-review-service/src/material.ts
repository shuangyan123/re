import {
  canonicalCommunityReviewJson,
  communityReviewVisibleTaskSetFingerprint,
} from "../../../src/community-review/fingerprint.js";
import {
  parseCommunityReviewBatchManifest,
  parseCommunityReviewVisibleTasks,
} from "../../../src/contracts/community-review-validation.js";
import type {
  CommunityReviewBatchManifest,
  CommunityReviewDataKind,
  CommunityReviewFingerprint,
  CommunityReviewInstrumentIdentity,
  CommunityReviewQualificationEligibility,
  CommunityReviewSyntheticFixtureMarker,
  CommunityReviewVisibleTask,
} from "../../../src/contracts/community-review.js";
import { CommunityReviewServiceError } from "./errors.js";

/**
 * Trusted lookup metadata for a private sealed material store. The store gets
 * only opaque references and P3 identity commitments, never a reviewer packet
 * request containing hidden source material.
 */
export interface ReviewBatchMaterialLookup {
  readonly batchId: string;
  readonly batchFingerprint: CommunityReviewFingerprint;
  readonly dataKind: CommunityReviewDataKind;
  readonly fixture?: CommunityReviewSyntheticFixtureMarker;
  readonly sealedSourceReference: string;
  readonly sealedSourceFingerprint: CommunityReviewFingerprint;
  readonly visibleTaskSetFingerprint: CommunityReviewFingerprint;
  readonly instrument: CommunityReviewInstrumentIdentity;
  readonly qualificationEligibility: CommunityReviewQualificationEligibility;
}

export interface ReviewBatchMaterialStore {
  /** Return only the P3 reviewer-visible task projection for this exact lookup. */
  loadVisibleTasksForBatch(
    lookup: ReviewBatchMaterialLookup,
  ): Promise<readonly CommunityReviewVisibleTask[]>;
}

export type ReviewBatchMaterialErrorCode = "not_found" | "invalid";

export class ReviewBatchMaterialError extends Error {
  readonly code: ReviewBatchMaterialErrorCode;

  constructor(code: ReviewBatchMaterialErrorCode) {
    super(code === "not_found"
      ? "Sealed Community Review batch material was not found."
      : "Sealed Community Review batch material failed validation.");
    this.name = "ReviewBatchMaterialError";
    this.code = code;
  }
}

export interface InMemoryReviewBatchMaterialRegistration {
  readonly manifest: CommunityReviewBatchManifest;
  readonly sealedSourceReference: string;
  readonly tasks: readonly CommunityReviewVisibleTask[];
}

function sameJson(left: unknown, right: unknown): boolean {
  return canonicalCommunityReviewJson(left) === canonicalCommunityReviewJson(right);
}

function required(value: string): void {
  if (typeof value !== "string" || value.trim().length === 0 || value.includes("\u0000")) {
    throw new CommunityReviewServiceError("invalid_service_record");
  }
}

function lookupFromRegistration(
  registration: InMemoryReviewBatchMaterialRegistration,
): ReviewBatchMaterialLookup {
  const manifest = parseCommunityReviewBatchManifest(registration.manifest);
  required(registration.sealedSourceReference);
  const tasks = parseCommunityReviewVisibleTasks(registration.tasks);
  if (registration.sealedSourceReference.length > 512 ||
    communityReviewVisibleTaskSetFingerprint(tasks) !== manifest.visibleTaskSetFingerprint) {
    throw new CommunityReviewServiceError("invalid_service_record");
  }
  return {
    batchId: manifest.batchId,
    batchFingerprint: manifest.batchFingerprint,
    dataKind: manifest.dataKind,
    ...(manifest.fixture === undefined ? {} : { fixture: manifest.fixture }),
    sealedSourceReference: registration.sealedSourceReference,
    sealedSourceFingerprint: manifest.sealedSourceFingerprint,
    visibleTaskSetFingerprint: manifest.visibleTaskSetFingerprint,
    instrument: manifest.instrument,
    qualificationEligibility: manifest.qualificationEligibility,
  };
}

/** Deterministic synthetic material adapter; production material stays private. */
export class InMemoryReviewBatchMaterialStore implements ReviewBatchMaterialStore {
  private readonly records = new Map<string, {
    readonly lookup: ReviewBatchMaterialLookup;
    readonly tasks: readonly CommunityReviewVisibleTask[];
  }>();

  register(registration: InMemoryReviewBatchMaterialRegistration): void {
    const lookup = lookupFromRegistration(registration);
    if (this.records.has(lookup.sealedSourceReference)) {
      throw new CommunityReviewServiceError("repository_conflict");
    }
    this.records.set(lookup.sealedSourceReference, {
      lookup: structuredClone(lookup),
      tasks: structuredClone(parseCommunityReviewVisibleTasks(registration.tasks)),
    });
  }

  async loadVisibleTasksForBatch(
    lookup: ReviewBatchMaterialLookup,
  ): Promise<readonly CommunityReviewVisibleTask[]> {
    const stored = this.records.get(lookup.sealedSourceReference);
    if (stored === undefined) throw new ReviewBatchMaterialError("not_found");
    if (!sameJson(stored.lookup, lookup)) throw new ReviewBatchMaterialError("invalid");
    const tasks = parseCommunityReviewVisibleTasks(stored.tasks);
    if (communityReviewVisibleTaskSetFingerprint(tasks) !== lookup.visibleTaskSetFingerprint) {
      throw new ReviewBatchMaterialError("invalid");
    }
    return structuredClone(tasks);
  }
}
