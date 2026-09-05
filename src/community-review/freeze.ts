import { BenchmarkConfigurationError } from "../contracts/errors.js";
import {
  COMMUNITY_REVIEW_AGREEMENT_KIND,
  COMMUNITY_REVIEW_POOL_KIND,
  COMMUNITY_REVIEW_PUBLIC_ARTIFACT_KIND,
  COMMUNITY_REVIEW_SCHEMA_VERSION,
  type CommunityReviewAgreementEvidence,
  type CommunityReviewAnnotation,
  type CommunityReviewBatchCloseResult,
  type CommunityReviewDisagreement,
  type CommunityReviewDisclosurePolicy,
  type CommunityReviewPublicEvidenceArtifact,
  type CommunityReviewPublicSubmission,
  type CommunityReviewStatusDistribution,
  type FrozenCommunityReviewPool,
  type CommunityReviewSubmission,
} from "../contracts/community-review.js";
import {
  parseCommunityReviewBatchCloseRecord,
  parseCommunityReviewBatchManifest,
  parseCommunityReviewPublicEvidenceArtifact,
  parseCommunityReviewSubmission,
  parseFrozenCommunityReviewPool,
} from "../contracts/community-review-validation.js";
import {
  communityReviewAtomicDistributionKey,
  communityReviewAtomicIdentityKey,
  communityReviewFingerprint,
  communityReviewPoolFingerprint,
  canonicalCommunityReviewJson,
} from "./fingerprint.js";
import { calculateHumanPairwiseAgreement } from "../calibration/human-reference-agreement.js";
import type {
  HumanAtomicAnnotation,
  HumanAtomicConfusionMatrix,
  HumanAtomicStatus,
} from "../contracts/human-reference-calibration.js";

function invalid(): never {
  throw new BenchmarkConfigurationError("community_review_invalid");
}

function sameJson(left: unknown, right: unknown): boolean {
  return canonicalCommunityReviewJson(left) === canonicalCommunityReviewJson(right);
}

function emptyMatrix(): {
  -readonly [status in HumanAtomicStatus]: Record<HumanAtomicStatus, number>;
} {
  const row = (): Record<HumanAtomicStatus, number> => ({
    SATISFIED: 0,
    OMITTED_OR_INCOMPLETE: 0,
    EXPLICIT_CONFLICT: 0,
  });
  return {
    SATISFIED: row(),
    OMITTED_OR_INCOMPLETE: row(),
    EXPLICIT_CONFLICT: row(),
  };
}

function emptyDistribution(): Record<HumanAtomicStatus, number> {
  return {
    SATISFIED: 0,
    OMITTED_OR_INCOMPLETE: 0,
    EXPLICIT_CONFLICT: 0,
  };
}

function distribution(counts: Record<HumanAtomicStatus, number>): CommunityReviewStatusDistribution {
  return {
    total: counts.SATISFIED + counts.OMITTED_OR_INCOMPLETE + counts.EXPLICIT_CONFLICT,
    counts: {
      SATISFIED: counts.SATISFIED,
      OMITTED_OR_INCOMPLETE: counts.OMITTED_OR_INCOMPLETE,
      EXPLICIT_CONFLICT: counts.EXPLICIT_CONFLICT,
    },
  };
}

function humanAnnotations(submission: CommunityReviewSubmission): HumanAtomicAnnotation[] {
  return submission.annotations.map((annotation) => ({
    schemaVersion: 1,
    caseId: annotation.caseId,
    rubricId: annotation.rubricId,
    requirementId: annotation.requirementId,
    annotatorId: submission.reviewerId,
    status: annotation.status,
    ...(annotation.evidence === undefined ? {} : { evidence: annotation.evidence }),
  }));
}

function sortedSubmissions(values: readonly CommunityReviewSubmission[]): CommunityReviewSubmission[] {
  return [...values].sort((left, right) => left.reviewerId.localeCompare(right.reviewerId));
}

function assertAcceptedSubmissionSet(
  pool: FrozenCommunityReviewPool,
  submissions: readonly CommunityReviewSubmission[],
): void {
  if (submissions.length !== pool.acceptedSubmissionFingerprints.length ||
    submissions.some((submission) => submission.submissionDisposition !== "accepted-before-close" ||
      !pool.acceptedSubmissionFingerprints.includes(submission.submissionFingerprint) ||
      submission.batchId !== pool.batchId || submission.batchFingerprint !== pool.batchFingerprint ||
      !sameJson(submission.instrument, pool.instrument) ||
      submission.taskSetFingerprint !== pool.visibleTaskSetFingerprint)) return invalid();
  const reviewers = submissions.map((submission) => submission.reviewerId).sort();
  const assignments = submissions.map((submission) => submission.assignmentId).sort();
  const fingerprints = submissions.map((submission) => submission.submissionFingerprint).sort();
  if (!sameJson(reviewers, [...pool.acceptedReviewerIds].sort()) ||
    !sameJson(assignments, [...pool.acceptedAssignmentIds].sort()) ||
    !sameJson(fingerprints, [...pool.acceptedSubmissionFingerprints].sort())) return invalid();
  const expectedIds = new Set(pool.visibleAtomicIds.map(communityReviewAtomicIdentityKey));
  for (const submission of submissions) {
    const observed = submission.annotations.map(communityReviewAtomicIdentityKey);
    if (observed.length !== expectedIds.size || new Set(observed).size !== observed.length ||
      observed.some((key) => !expectedIds.has(key))) return invalid();
  }
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value;
  for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  return Object.freeze(value);
}

/**
 * Turns a validated CLOSED batch into the immutable FROZEN review pool. The
 * freeze fingerprint commits to the accepted set and coverage, not to any
 * later disclosure date or publication choice.
 */
export function freezeCommunityReviewPool(
  closeResult: CommunityReviewBatchCloseResult,
): FrozenCommunityReviewPool {
  if (typeof closeResult !== "object" || closeResult === null) return invalid();
  const manifest = parseCommunityReviewBatchManifest(closeResult.manifest);
  const closeRecord = parseCommunityReviewBatchCloseRecord(closeResult.closeRecord);
  const submissions = sortedSubmissions(closeResult.acceptedSubmissions.map(parseCommunityReviewSubmission));
  if (manifest.state !== "CLOSED" || manifest.closeRecordFingerprint !== closeRecord.closeFingerprint ||
    closeRecord.state !== "CLOSED" || closeRecord.batchId !== manifest.batchId ||
    closeRecord.batchFingerprint !== manifest.batchFingerprint ||
    !sameJson(closeRecord.instrument, manifest.instrument) ||
    !sameJson(closeRecord.qualificationEligibility, manifest.qualificationEligibility) ||
    closeRecord.visibleTaskSetFingerprint !== manifest.visibleTaskSetFingerprint ||
    closeRecord.dataKind !== manifest.dataKind || !sameJson(closeRecord.fixture, manifest.fixture) ||
    submissions.length === 0) return invalid();
  const first = submissions[0];
  if (first === undefined) return invalid();
  const visibleAtomicIds = [
    ...new Map(
      first.annotations.map((annotation) => [
        communityReviewAtomicIdentityKey(annotation), {
          caseId: annotation.caseId,
          rubricId: annotation.rubricId,
          requirementId: annotation.requirementId,
        },
      ] as const),
    ).values(),
  ].sort((left, right) =>
    communityReviewAtomicIdentityKey(left).localeCompare(communityReviewAtomicIdentityKey(right)));
  const provisionalPool = {
    schemaVersion: COMMUNITY_REVIEW_SCHEMA_VERSION,
    poolKind: COMMUNITY_REVIEW_POOL_KIND,
    dataKind: manifest.dataKind,
    ...(manifest.fixture === undefined ? {} : { fixture: manifest.fixture }),
    protocolId: manifest.protocolId,
    protocolVersion: manifest.protocolVersion,
    batchId: manifest.batchId,
    batchFingerprint: manifest.batchFingerprint,
    closeRecordFingerprint: closeRecord.closeFingerprint,
    instrument: manifest.instrument,
    qualificationEligibility: manifest.qualificationEligibility,
    visibleTaskSetFingerprint: manifest.visibleTaskSetFingerprint,
    visibleAtomicIds,
    batchPurpose: manifest.batchPurpose,
    blindnessMode: manifest.blindnessMode,
    state: "FROZEN" as const,
    acceptedAssignmentIds: [...closeRecord.acceptedAssignmentIds].sort(),
    acceptedReviewerIds: [...closeRecord.acceptedReviewerIds].sort(),
    acceptedSubmissionFingerprints: [...closeRecord.acceptedSubmissionFingerprints].sort(),
    coverage: closeRecord.coverage,
    submissions,
  };
  const parsedProvisional = parseFrozenCommunityReviewPool({
    ...provisionalPool,
    freezeFingerprint: communityReviewPoolFingerprint(provisionalPool),
  });
  assertAcceptedSubmissionSet(parsedProvisional, submissions);
  const pool = parseFrozenCommunityReviewPool({
    ...parsedProvisional,
    freezeFingerprint: communityReviewPoolFingerprint(parsedProvisional),
  });
  return deepFreeze(pool);
}

/**
 * Computes diagnostic human-human evidence from the frozen pool. This is a
 * thin adapter over the existing 3x3 agreement machinery; it never creates a
 * reference, resolves disagreement, or calls a Judge.
 */
export function buildCommunityReviewAgreementEvidence(
  poolValue: unknown,
): CommunityReviewAgreementEvidence {
  const pool = parseFrozenCommunityReviewPool(poolValue);
  const submissions = sortedSubmissions(pool.submissions);
  const pairwise = [] as ReturnType<typeof calculateHumanPairwiseAgreement>[];
  const matrix = emptyMatrix();
  const disagreements: CommunityReviewDisagreement[] = [];
  let comparableAtomicCount = 0;
  let agreementCount = 0;
  for (let left = 0; left < submissions.length; left += 1) {
    const submissionA = submissions[left];
    if (submissionA === undefined) continue;
    for (let right = left + 1; right < submissions.length; right += 1) {
      const submissionB = submissions[right];
      if (submissionB === undefined) continue;
      const report = calculateHumanPairwiseAgreement(
        submissionA.reviewerId,
        submissionB.reviewerId,
        humanAnnotations(submissionA),
        humanAnnotations(submissionB),
      );
      pairwise.push(report);
      comparableAtomicCount += report.comparableAtomicCount;
      agreementCount += report.agreementCount;
      for (const row of ["SATISFIED", "OMITTED_OR_INCOMPLETE", "EXPLICIT_CONFLICT"] as const) {
        for (const column of ["SATISFIED", "OMITTED_OR_INCOMPLETE", "EXPLICIT_CONFLICT"] as const) {
          matrix[row][column] += report.confusionMatrix[row][column];
        }
      }
      disagreements.push(...report.disagreements.map((item) => ({
        caseId: item.caseId,
        rubricId: item.rubricId,
        requirementId: item.requirementId,
        reviewerA: report.annotatorA,
        reviewerB: report.annotatorB,
        reviewerAStatus: item.annotatorAStatus,
        reviewerBStatus: item.annotatorBStatus,
        ...(item.annotatorAEvidence === undefined ? {} : { reviewerAEvidence: item.annotatorAEvidence }),
        ...(item.annotatorBEvidence === undefined ? {} : { reviewerBEvidence: item.annotatorBEvidence }),
      })));
    }
  }
  const perRequirementCounts = new Map<string, Record<HumanAtomicStatus, number>>();
  const perCaseCounts = new Map<string, Record<HumanAtomicStatus, number>>();
  for (const submission of submissions) {
    for (const annotation of submission.annotations) {
      const requirementKey = communityReviewAtomicDistributionKey(annotation);
      const requirementCounts = perRequirementCounts.get(requirementKey) ?? emptyDistribution();
      requirementCounts[annotation.status] += 1;
      perRequirementCounts.set(requirementKey, requirementCounts);
      const caseCounts = perCaseCounts.get(annotation.caseId) ?? emptyDistribution();
      caseCounts[annotation.status] += 1;
      perCaseCounts.set(annotation.caseId, caseCounts);
    }
  }
  const perRequirement: Record<string, CommunityReviewStatusDistribution> = {};
  for (const key of [...perRequirementCounts.keys()].sort()) {
    perRequirement[key] = distribution(perRequirementCounts.get(key)!);
  }
  const perCase: Record<string, CommunityReviewStatusDistribution> = {};
  for (const key of [...perCaseCounts.keys()].sort()) {
    perCase[key] = distribution(perCaseCounts.get(key)!);
  }
  const disagreementCount = comparableAtomicCount - agreementCount;
  const limitations = [
    "Agreement is a consistency observation, not correctness, gold, or calibration.",
    "Disagreements are retained; no majority vote, adjudication, or Judge result is applied.",
  ];
  if (pool.batchPurpose !== "interpretable" || pool.coverage.coverageStatus !== "complete") {
    limitations.push("This pool is explicitly pilot/non-reference/incomplete or under-covered and is not complete interpretable evidence.");
  }
  if (pairwise.length === 0) {
    limitations.push("A single accepted reviewer cannot provide human-human agreement.");
  }
  return {
    schemaVersion: COMMUNITY_REVIEW_SCHEMA_VERSION,
    agreementKind: COMMUNITY_REVIEW_AGREEMENT_KIND,
    poolFingerprint: pool.freezeFingerprint,
    reviewerIds: pool.acceptedReviewerIds,
    pairwise,
    comparableAtomicCount,
    agreementCount,
    disagreementCount,
    agreementShare: comparableAtomicCount === 0 ? null : agreementCount / comparableAtomicCount,
    confusionMatrix: matrix as HumanAtomicConfusionMatrix,
    perRequirement,
    perCase,
    disagreements: disagreements.sort((left, right) =>
      `${left.reviewerA}|${left.reviewerB}|${communityReviewAtomicIdentityKey(left)}`
        .localeCompare(`${right.reviewerA}|${right.reviewerB}|${communityReviewAtomicIdentityKey(right)}`)),
    missingOrWithdrawnAssignmentCount: pool.coverage.missingReviewerCount + pool.coverage.withdrawnAssignmentCount,
    limitations,
  };
}

export interface CommunityReviewPublicEvidenceBuildInput {
  readonly disclosureDate: string;
  readonly disclosurePolicy: CommunityReviewDisclosurePolicy;
}

function parseDisclosurePolicyInput(value: unknown): CommunityReviewDisclosurePolicy {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return invalid();
  const policy = value as Record<string, unknown>;
  if (Object.keys(policy).some((key) => ![
    "publishReviewerIds",
    "publishAtomicAnnotations",
    "publishReviewerEvidence",
  ].includes(key)) || typeof policy.publishReviewerIds !== "boolean" ||
    typeof policy.publishAtomicAnnotations !== "boolean" ||
    typeof policy.publishReviewerEvidence !== "boolean") return invalid();
  return {
    publishReviewerIds: policy.publishReviewerIds,
    publishAtomicAnnotations: policy.publishAtomicAnnotations,
    publishReviewerEvidence: policy.publishReviewerEvidence,
  };
}

function publicAnnotation(
  annotation: CommunityReviewAnnotation,
  publishEvidence: boolean,
): CommunityReviewAnnotation {
  return {
    caseId: annotation.caseId,
    rubricId: annotation.rubricId,
    requirementId: annotation.requirementId,
    status: annotation.status,
    ...(publishEvidence && annotation.evidence !== undefined ? { evidence: annotation.evidence } : {}),
  };
}

function publicDisagreement(
  value: CommunityReviewDisagreement,
  publishEvidence: boolean,
): CommunityReviewDisagreement {
  return {
    caseId: value.caseId,
    rubricId: value.rubricId,
    requirementId: value.requirementId,
    reviewerA: value.reviewerA,
    reviewerB: value.reviewerB,
    reviewerAStatus: value.reviewerAStatus,
    reviewerBStatus: value.reviewerBStatus,
    ...(publishEvidence && value.reviewerAEvidence !== undefined ? { reviewerAEvidence: value.reviewerAEvidence } : {}),
    ...(publishEvidence && value.reviewerBEvidence !== undefined ? { reviewerBEvidence: value.reviewerBEvidence } : {}),
  };
}

export function buildCommunityReviewPublicEvidenceArtifact(
  poolValue: unknown,
  input: CommunityReviewPublicEvidenceBuildInput,
): CommunityReviewPublicEvidenceArtifact {
  const pool = parseFrozenCommunityReviewPool(poolValue);
  if (typeof input !== "object" || input === null) return invalid();
  const agreement = buildCommunityReviewAgreementEvidence(pool);
  const policy = parseDisclosurePolicyInput(input.disclosurePolicy);
  const publishedSubmissions: CommunityReviewPublicSubmission[] | undefined = policy.publishAtomicAnnotations
    ? pool.submissions.map((submission) => ({
        ...(policy.publishReviewerIds ? { reviewerId: submission.reviewerId } : {}),
        submissionFingerprint: submission.submissionFingerprint,
        annotations: submission.annotations.map((annotation) => publicAnnotation(
          annotation,
          policy.publishReviewerEvidence,
        )),
      }))
    : undefined;
  const publicAgreement = {
    comparableAtomicCount: agreement.comparableAtomicCount,
    agreementCount: agreement.agreementCount,
    disagreementCount: agreement.disagreementCount,
    agreementShare: agreement.agreementShare,
    confusionMatrix: agreement.confusionMatrix,
    perRequirement: agreement.perRequirement,
    perCase: agreement.perCase,
    disagreements: policy.publishReviewerIds
      ? agreement.disagreements.map((item) => publicDisagreement(item, policy.publishReviewerEvidence))
      : [],
    pairwiseReviewerCount: agreement.pairwise.length,
    missingOrWithdrawnAssignmentCount: agreement.missingOrWithdrawnAssignmentCount,
  };
  const limitations = [
    ...agreement.limitations,
    "A frozen review pool is future evidence input, not a gold set, adjudicated reference, or official benchmark truth.",
    "Qualification establishes eligibility for the instrument; it is not calibration.",
    "Public disclosure never includes active qualification answers, credentials, or service secrets.",
    ...(pool.dataKind === "synthetic-fixture"
      ? ["This artifact is synthetic and carries notCommunityReviewEvidence; it is not community review evidence."]
      : []),
  ];
  return parseCommunityReviewPublicEvidenceArtifact({
    schemaVersion: COMMUNITY_REVIEW_SCHEMA_VERSION,
    artifactKind: COMMUNITY_REVIEW_PUBLIC_ARTIFACT_KIND,
    dataKind: pool.dataKind,
    ...(pool.fixture === undefined ? {} : { fixture: pool.fixture }),
    protocolId: pool.protocolId,
    protocolVersion: pool.protocolVersion,
    batchId: pool.batchId,
    batchFingerprint: pool.batchFingerprint,
    instrument: pool.instrument,
    qualificationEligibility: pool.qualificationEligibility,
    visibleTaskSetFingerprint: pool.visibleTaskSetFingerprint,
    state: "FROZEN",
    frozenPoolFingerprint: pool.freezeFingerprint,
    acceptedSubmissionFingerprints: pool.acceptedSubmissionFingerprints,
    disclosureDate: input.disclosureDate,
    disclosurePolicy: policy,
    ...(policy.publishReviewerIds ? { publishedReviewerIds: pool.acceptedReviewerIds } : {}),
    ...(publishedSubmissions === undefined ? {} : { publishedSubmissions }),
    agreement: publicAgreement,
    limitations,
  });
}

/** Public convenience for callers that need a stable artifact identity. */
export function communityReviewPublicArtifactFingerprint(
  artifact: Omit<CommunityReviewPublicEvidenceArtifact, "disclosureDate">,
): string {
  return communityReviewFingerprint(artifact);
}
