import { BenchmarkConfigurationError } from "./errors.js";
import {
  isTutorCaseLocale,
} from "./locale.js";
import {
  HUMAN_ATOMIC_STATUSES,
  HUMAN_REFERENCE_EVIDENCE_MAX_LENGTH,
  type HumanAtomicIdentity,
  type HumanReferenceAnnotationTask,
} from "./human-reference-calibration.js";
import { parseHumanReferenceAnnotationTask } from "./human-reference-calibration-validation.js";
import {
  COMMUNITY_REVIEW_ASSIGNMENT_KIND,
  COMMUNITY_REVIEW_BATCH_MANIFEST_KIND,
  COMMUNITY_REVIEW_BLINDNESS_MODE,
  COMMUNITY_REVIEW_CLOSE_RECORD_KIND,
  COMMUNITY_REVIEW_GUIDE_ID,
  COMMUNITY_REVIEW_GUIDE_VERSION,
  COMMUNITY_REVIEW_INSTRUMENT_ID,
  COMMUNITY_REVIEW_INSTRUMENT_VERSION,
  COMMUNITY_REVIEW_PACKET_KIND,
  COMMUNITY_REVIEW_POOL_KIND,
  COMMUNITY_REVIEW_PROTOCOL_ID,
  COMMUNITY_REVIEW_PROTOCOL_VERSION,
  COMMUNITY_REVIEW_PUBLIC_ARTIFACT_KIND,
  COMMUNITY_REVIEW_QUALIFICATION_PROTOCOL_ID,
  COMMUNITY_REVIEW_QUALIFICATION_PROTOCOL_VERSION,
  COMMUNITY_REVIEW_QUALIFICATION_RECEIPT_KIND,
  COMMUNITY_REVIEW_SCHEMA_VERSION,
  COMMUNITY_REVIEW_SUBMISSION_KIND,
  type CommunityReviewAnnotation,
  type CommunityReviewAssignment,
  type CommunityReviewAssignmentState,
  type CommunityReviewBatchCloseRecord,
  type CommunityReviewBatchManifest,
  type CommunityReviewBatchPurpose,
  type CommunityReviewBatchState,
  type CommunityReviewCoverage,
  type CommunityReviewDataKind,
  type CommunityReviewDisagreement,
  type CommunityReviewDisclosurePolicy,
  type CommunityReviewInstrumentIdentity,
  type CommunityReviewLocalizationIdentity,
  type CommunityReviewPublicAgreement,
  type CommunityReviewPublicEvidenceArtifact,
  type CommunityReviewPublicSubmission,
  type CommunityReviewQualificationEligibility,
  type CommunityReviewQualificationInstrumentEligibility,
  type CommunityReviewQualificationReceipt,
  type CommunityReviewReviewerPacket,
  type CommunityReviewSubmission,
  type CommunityReviewSubmissionDisposition,
  type CommunityReviewSyntheticFixtureMarker,
  type CommunityReviewVisibleRequirement,
  type CommunityReviewVisibleRubric,
  type CommunityReviewVisibleTask,
  type CommunityReviewStatusDistribution,
  type FrozenCommunityReviewPool,
} from "./community-review.js";
import {
  communityReviewAssignmentFingerprint,
  communityReviewAtomicIdentityKey,
  communityReviewBatchFingerprint,
  canonicalCommunityReviewJson,
  communityReviewCloseFingerprint,
  communityReviewInstrumentFingerprint,
  communityReviewLocalizationFingerprint,
  communityReviewPacketFingerprint,
  communityReviewPoolFingerprint,
  communityReviewQualificationReceiptFingerprint,
  communityReviewSubmissionFingerprint,
  communityReviewSourceInstrumentFingerprint,
  communityReviewVisibleTaskSetFingerprint,
} from "../community-review/fingerprint.js";

type UnknownRecord = Record<string, unknown>;

const fingerprintPattern = /^sha256:[0-9a-f]{64}$/u;
const identifierPattern = /^[A-Za-z][A-Za-z0-9._:-]{0,199}$/u;
const opaqueIdPattern = /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/u;
const versionPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,79}$/u;
const publicDistributionKeyPattern = /^(?:[A-Za-z][A-Za-z0-9._:-]{0,199}|[A-Za-z][A-Za-z0-9._:-]{0,199}(?:\|[A-Za-z][A-Za-z0-9._:-]{0,199}){2})$/u;
const statuses = new Set<string>(HUMAN_ATOMIC_STATUSES);
const batchPurposes = new Set<CommunityReviewBatchPurpose>([
  "interpretable",
  "pilot",
  "non-reference",
  "incomplete",
]);
const batchStates = new Set<CommunityReviewBatchState>([
  "SEALED",
  "OPEN",
  "CLOSED",
  "FROZEN",
]);
const assignmentStates = new Set<CommunityReviewAssignmentState>([
  "assigned",
  "withdrawn",
]);
const submissionDispositions = new Set<CommunityReviewSubmissionDisposition>([
  "accepted-before-close",
  "not-part-of-closed-batch",
]);

function invalid(): never {
  throw new BenchmarkConfigurationError("community_review_invalid");
}

function record(value: unknown): UnknownRecord | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as UnknownRecord
    : null;
}

function only(value: UnknownRecord, keys: readonly string[]): boolean {
  const allowed = new Set(keys);
  return Object.keys(value).every((key) => allowed.has(key));
}

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function identifier(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && identifierPattern.test(value);
}

function version(value: unknown): value is string {
  return typeof value === "string" && versionPattern.test(value);
}

function opaque(value: unknown): value is string {
  return typeof value === "string" && opaqueIdPattern.test(value) && !value.includes("@");
}

function fingerprint(value: unknown): value is string {
  return typeof value === "string" && fingerprintPattern.test(value);
}

function evidence(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 &&
    value.length <= HUMAN_REFERENCE_EVIDENCE_MAX_LENGTH;
}

function optionalEvidence(value: UnknownRecord): string | undefined | null {
  if (!("evidence" in value)) return undefined;
  return evidence(value.evidence) ? value.evidence : null;
}

function optionalNamedEvidence(value: UnknownRecord, key: string): string | undefined | null {
  if (!(key in value)) return undefined;
  return evidence(value[key]) ? value[key] as string : null;
}

function fixture(value: unknown): CommunityReviewSyntheticFixtureMarker | undefined | null {
  if (value === undefined) return undefined;
  const parsed = record(value);
  return parsed !== null && only(parsed, [
    "synthetic",
    "notHumanCalibrationData",
    "notCommunityReviewEvidence",
  ]) && parsed.synthetic === true && parsed.notHumanCalibrationData === true &&
    parsed.notCommunityReviewEvidence === true
    ? {
        synthetic: true,
        notHumanCalibrationData: true,
        notCommunityReviewEvidence: true,
      }
    : null;
}

function provenance(value: UnknownRecord): {
  readonly dataKind: CommunityReviewDataKind;
  readonly fixture?: CommunityReviewSyntheticFixtureMarker;
} | null {
  const marker = fixture(value.fixture);
  if (marker === null || (value.dataKind !== "community-review" &&
      value.dataKind !== "synthetic-fixture")) return null;
  if (value.dataKind === "community-review" && marker !== undefined) return null;
  if (value.dataKind === "synthetic-fixture" && marker === undefined) return null;
  return value.dataKind === "synthetic-fixture"
    ? { dataKind: "synthetic-fixture", fixture: marker as CommunityReviewSyntheticFixtureMarker }
    : { dataKind: "community-review" };
}

function optionalFingerprint(
  value: UnknownRecord,
  key: string,
): string | undefined | null {
  if (!(key in value)) return undefined;
  return fingerprint(value[key]) ? value[key] as string : null;
}

function parseVisibleRequirement(value: unknown): CommunityReviewVisibleRequirement | null {
  const parsed = record(value);
  if (parsed === null || !only(parsed, ["id", "description"]) ||
    !identifier(parsed.id) || !nonEmpty(parsed.description)) return null;
  return { id: parsed.id, description: parsed.description };
}

function parseVisibleRubric(value: unknown): CommunityReviewVisibleRubric | null {
  const parsed = record(value);
  if (parsed === null || !only(parsed, ["id", "criterion", "requirements"]) ||
    !identifier(parsed.id) || !nonEmpty(parsed.criterion) ||
    !Array.isArray(parsed.requirements) || parsed.requirements.length === 0) return null;
  const requirements = parsed.requirements.map(parseVisibleRequirement);
  if (requirements.some((item) => item === null) ||
    new Set(requirements.map((item) => item?.id)).size !== requirements.length) return null;
  return {
    id: parsed.id,
    criterion: parsed.criterion,
    requirements: requirements as CommunityReviewVisibleRequirement[],
  };
}

export function parseCommunityReviewVisibleTask(value: unknown): CommunityReviewVisibleTask {
  const parsed = record(value);
  if (parsed === null || !only(parsed, [
    "caseId",
    "learningObjective",
    "studentProfile",
    "conversationHistory",
    "studentMessage",
    "problemContext",
    "rubrics",
    "tutorResponse",
  ]) || !identifier(parsed.caseId) || !nonEmpty(parsed.learningObjective) ||
    typeof parsed.studentProfile !== "string" || typeof parsed.conversationHistory !== "string" ||
    !nonEmpty(parsed.studentMessage) || typeof parsed.problemContext !== "string" ||
    !Array.isArray(parsed.rubrics) || parsed.rubrics.length === 0 ||
    !nonEmpty(parsed.tutorResponse)) return invalid();
  const rubrics = parsed.rubrics.map(parseVisibleRubric);
  if (rubrics.some((item) => item === null) ||
    new Set(rubrics.map((item) => item?.id)).size !== rubrics.length) return invalid();
  return {
    caseId: parsed.caseId,
    learningObjective: parsed.learningObjective,
    studentProfile: parsed.studentProfile,
    conversationHistory: parsed.conversationHistory,
    studentMessage: parsed.studentMessage,
    problemContext: parsed.problemContext,
    rubrics: rubrics as CommunityReviewVisibleRubric[],
    tutorResponse: parsed.tutorResponse,
  };
}

export function parseCommunityReviewVisibleTasks(value: unknown): CommunityReviewVisibleTask[] {
  if (!Array.isArray(value) || value.length === 0) return invalid();
  const tasks = value.map(parseCommunityReviewVisibleTask);
  if (new Set(tasks.map((task) => task.caseId)).size !== tasks.length) return invalid();
  return tasks;
}

/**
 * Builds the reviewer-facing allowlist projection from the existing internal
 * Human Reference task. Hidden evaluator fields are never copied.
 */
export function projectCommunityReviewVisibleTask(
  value: HumanReferenceAnnotationTask,
): CommunityReviewVisibleTask {
  const task = parseHumanReferenceAnnotationTask(value);
  return parseCommunityReviewVisibleTask({
    caseId: task.caseId,
    learningObjective: task.learningObjective,
    studentProfile: task.studentProfile,
    conversationHistory: task.conversationHistory,
    studentMessage: task.studentMessage,
    problemContext: task.problemContext,
    rubrics: task.rubrics.map((rubric) => ({
      id: rubric.id,
      criterion: rubric.criterion,
      requirements: rubric.requirements.map((requirement) => ({
        id: requirement.id,
        description: requirement.description,
      })),
    })),
    tutorResponse: task.tutorResponse,
  });
}

export function projectCommunityReviewVisibleTasks(
  values: readonly HumanReferenceAnnotationTask[],
): CommunityReviewVisibleTask[] {
  const tasks = values.map(projectCommunityReviewVisibleTask);
  if (tasks.length === 0 || new Set(tasks.map((task) => task.caseId)).size !== tasks.length) return invalid();
  return tasks;
}

function parseLocalization(value: unknown): CommunityReviewLocalizationIdentity | null {
  const parsed = record(value);
  if (parsed === null || !only(parsed, [
    "localizationId",
    "localizationVersion",
    "sourceLocale",
    "sourceInstrumentFingerprint",
    "localizedTaskSetFingerprint",
    "fingerprint",
  ]) || !identifier(parsed.localizationId) || !version(parsed.localizationVersion) ||
    !isTutorCaseLocale(parsed.sourceLocale) || !fingerprint(parsed.sourceInstrumentFingerprint) ||
    !fingerprint(parsed.localizedTaskSetFingerprint) || !fingerprint(parsed.fingerprint)) return null;
  const base = {
    localizationId: parsed.localizationId,
    localizationVersion: parsed.localizationVersion,
    sourceLocale: parsed.sourceLocale,
    sourceInstrumentFingerprint: parsed.sourceInstrumentFingerprint,
    localizedTaskSetFingerprint: parsed.localizedTaskSetFingerprint,
  } as const;
  if (communityReviewLocalizationFingerprint(base) !== parsed.fingerprint) return null;
  return { ...base, fingerprint: parsed.fingerprint };
}

export function parseCommunityReviewInstrumentIdentity(
  value: unknown,
): CommunityReviewInstrumentIdentity {
  const parsed = record(value);
  const localized = parsed?.localization === undefined
    ? undefined
    : parseLocalization(parsed.localization);
  if (parsed === null || !only(parsed, [
    "protocolId",
    "protocolVersion",
    "instrumentId",
    "instrumentVersion",
    "guideId",
    "guideVersion",
    "guideFingerprint",
    "canonicalLocale",
    "reviewLocale",
    "localization",
    "fingerprint",
  ]) || parsed.protocolId !== COMMUNITY_REVIEW_PROTOCOL_ID ||
    parsed.protocolVersion !== COMMUNITY_REVIEW_PROTOCOL_VERSION ||
    parsed.instrumentId !== COMMUNITY_REVIEW_INSTRUMENT_ID ||
    parsed.instrumentVersion !== COMMUNITY_REVIEW_INSTRUMENT_VERSION ||
    parsed.guideId !== COMMUNITY_REVIEW_GUIDE_ID ||
    parsed.guideVersion !== COMMUNITY_REVIEW_GUIDE_VERSION ||
    !fingerprint(parsed.guideFingerprint) || !isTutorCaseLocale(parsed.canonicalLocale) ||
    !isTutorCaseLocale(parsed.reviewLocale) || localized === null ||
    (parsed.reviewLocale === parsed.canonicalLocale && localized !== undefined) ||
    (parsed.reviewLocale !== parsed.canonicalLocale && localized === undefined) ||
    (localized !== undefined && (localized.sourceLocale !== parsed.canonicalLocale ||
      localized.sourceInstrumentFingerprint !== communityReviewSourceInstrumentFingerprint({
        protocolId: COMMUNITY_REVIEW_PROTOCOL_ID,
        protocolVersion: COMMUNITY_REVIEW_PROTOCOL_VERSION,
        instrumentId: COMMUNITY_REVIEW_INSTRUMENT_ID,
        instrumentVersion: COMMUNITY_REVIEW_INSTRUMENT_VERSION,
        guideId: COMMUNITY_REVIEW_GUIDE_ID,
        guideVersion: COMMUNITY_REVIEW_GUIDE_VERSION,
        guideFingerprint: parsed.guideFingerprint,
        canonicalLocale: parsed.canonicalLocale,
      }))) || !fingerprint(parsed.fingerprint)) return invalid();
  const base = {
    protocolId: COMMUNITY_REVIEW_PROTOCOL_ID,
    protocolVersion: COMMUNITY_REVIEW_PROTOCOL_VERSION,
    instrumentId: COMMUNITY_REVIEW_INSTRUMENT_ID,
    instrumentVersion: COMMUNITY_REVIEW_INSTRUMENT_VERSION,
    guideId: COMMUNITY_REVIEW_GUIDE_ID,
    guideVersion: COMMUNITY_REVIEW_GUIDE_VERSION,
    guideFingerprint: parsed.guideFingerprint,
    canonicalLocale: parsed.canonicalLocale,
    reviewLocale: parsed.reviewLocale,
    ...(localized === undefined ? {} : { localization: localized }),
  } as const;
  if (communityReviewInstrumentFingerprint(base) !== parsed.fingerprint) return invalid();
  return { ...base, fingerprint: parsed.fingerprint };
}

function parseQualificationInstrumentEligibility(
  value: unknown,
): CommunityReviewQualificationInstrumentEligibility | null {
  const parsed = record(value);
  if (parsed === null || !only(parsed, [
    "instrumentId",
    "instrumentVersion",
    "instrumentFingerprint",
    "reviewLocale",
  ]) || parsed.instrumentId !== COMMUNITY_REVIEW_INSTRUMENT_ID ||
    parsed.instrumentVersion !== COMMUNITY_REVIEW_INSTRUMENT_VERSION ||
    !fingerprint(parsed.instrumentFingerprint) || !isTutorCaseLocale(parsed.reviewLocale)) return null;
  return {
    instrumentId: COMMUNITY_REVIEW_INSTRUMENT_ID,
    instrumentVersion: COMMUNITY_REVIEW_INSTRUMENT_VERSION,
    instrumentFingerprint: parsed.instrumentFingerprint,
    reviewLocale: parsed.reviewLocale,
  };
}

export function parseCommunityReviewQualificationEligibility(
  value: unknown,
): CommunityReviewQualificationEligibility {
  const parsed = record(value);
  if (parsed === null || !only(parsed, [
    "qualificationProtocolId",
    "qualificationProtocolVersion",
    "qualificationId",
    "qualificationVersion",
    "qualificationPoolId",
    "qualificationPoolVersion",
    "qualificationDefinitionFingerprint",
  ]) || parsed.qualificationProtocolId !== COMMUNITY_REVIEW_QUALIFICATION_PROTOCOL_ID ||
    parsed.qualificationProtocolVersion !== COMMUNITY_REVIEW_QUALIFICATION_PROTOCOL_VERSION ||
    !identifier(parsed.qualificationId) || !version(parsed.qualificationVersion) ||
    !identifier(parsed.qualificationPoolId) || !version(parsed.qualificationPoolVersion) ||
    !fingerprint(parsed.qualificationDefinitionFingerprint)) return invalid();
  return {
    qualificationProtocolId: COMMUNITY_REVIEW_QUALIFICATION_PROTOCOL_ID,
    qualificationProtocolVersion: COMMUNITY_REVIEW_QUALIFICATION_PROTOCOL_VERSION,
    qualificationId: parsed.qualificationId,
    qualificationVersion: parsed.qualificationVersion,
    qualificationPoolId: parsed.qualificationPoolId,
    qualificationPoolVersion: parsed.qualificationPoolVersion,
    qualificationDefinitionFingerprint: parsed.qualificationDefinitionFingerprint,
  };
}

export function parseCommunityReviewQualificationReceipt(
  value: unknown,
): CommunityReviewQualificationReceipt {
  const parsed = record(value);
  const source = parsed === null ? null : provenance(parsed);
  const eligibility = parseQualificationInstrumentEligibility(parsed?.instrumentEligibility);
  const receiptBase = parsed === null ? null : {
    schemaVersion: COMMUNITY_REVIEW_SCHEMA_VERSION,
    receiptKind: COMMUNITY_REVIEW_QUALIFICATION_RECEIPT_KIND,
    dataKind: parsed.dataKind as CommunityReviewDataKind,
    ...(source?.fixture === undefined ? {} : { fixture: source.fixture }),
    protocolId: COMMUNITY_REVIEW_PROTOCOL_ID,
    protocolVersion: COMMUNITY_REVIEW_PROTOCOL_VERSION,
    qualificationProtocolId: COMMUNITY_REVIEW_QUALIFICATION_PROTOCOL_ID,
    qualificationProtocolVersion: COMMUNITY_REVIEW_QUALIFICATION_PROTOCOL_VERSION,
    qualificationId: parsed.qualificationId,
    qualificationVersion: parsed.qualificationVersion,
    qualificationPoolId: parsed.qualificationPoolId,
    qualificationPoolVersion: parsed.qualificationPoolVersion,
    qualificationDefinitionFingerprint: parsed.qualificationDefinitionFingerprint,
    reviewerId: parsed.reviewerId,
    reviewLocale: parsed.reviewLocale,
    qualificationStatus: "qualified" as const,
    instrumentEligibility: eligibility as CommunityReviewQualificationInstrumentEligibility,
  };
  if (parsed === null || source === null || eligibility === null || receiptBase === null ||
    !only(parsed, [
      "schemaVersion",
      "receiptKind",
      "dataKind",
      "fixture",
      "protocolId",
      "protocolVersion",
      "qualificationProtocolId",
      "qualificationProtocolVersion",
      "qualificationId",
      "qualificationVersion",
      "qualificationPoolId",
      "qualificationPoolVersion",
      "qualificationDefinitionFingerprint",
      "reviewerId",
      "reviewLocale",
      "qualificationStatus",
      "instrumentEligibility",
      "receiptFingerprint",
    ]) || parsed.schemaVersion !== COMMUNITY_REVIEW_SCHEMA_VERSION ||
    parsed.receiptKind !== COMMUNITY_REVIEW_QUALIFICATION_RECEIPT_KIND ||
    parsed.protocolId !== COMMUNITY_REVIEW_PROTOCOL_ID ||
    parsed.protocolVersion !== COMMUNITY_REVIEW_PROTOCOL_VERSION ||
    parsed.qualificationProtocolId !== COMMUNITY_REVIEW_QUALIFICATION_PROTOCOL_ID ||
    parsed.qualificationProtocolVersion !== COMMUNITY_REVIEW_QUALIFICATION_PROTOCOL_VERSION ||
    !identifier(parsed.qualificationId) || !version(parsed.qualificationVersion) ||
    !identifier(parsed.qualificationPoolId) || !version(parsed.qualificationPoolVersion) ||
    !fingerprint(parsed.qualificationDefinitionFingerprint) || !opaque(parsed.reviewerId) ||
    !isTutorCaseLocale(parsed.reviewLocale) || parsed.qualificationStatus !== "qualified" ||
    eligibility.reviewLocale !== parsed.reviewLocale || !fingerprint(parsed.receiptFingerprint) ||
    communityReviewQualificationReceiptFingerprint(
      receiptBase as Omit<CommunityReviewQualificationReceipt, "receiptFingerprint">,
    ) !== parsed.receiptFingerprint) return invalid();
  return {
    ...(receiptBase as Omit<CommunityReviewQualificationReceipt, "receiptFingerprint">),
    receiptFingerprint: parsed.receiptFingerprint as string,
  };
}

function parseAtomicIdentity(value: unknown): HumanAtomicIdentity | null {
  const parsed = record(value);
  if (parsed === null || !only(parsed, ["caseId", "rubricId", "requirementId"]) ||
    !identifier(parsed.caseId) || !identifier(parsed.rubricId) ||
    !identifier(parsed.requirementId)) return null;
  return {
    caseId: parsed.caseId,
    rubricId: parsed.rubricId,
    requirementId: parsed.requirementId,
  };
}

function parseAtomicIdentities(value: unknown): HumanAtomicIdentity[] {
  if (!Array.isArray(value) || value.length === 0) return invalid();
  const parsed = value.map(parseAtomicIdentity);
  if (parsed.some((item) => item === null)) return invalid();
  const identities = parsed as HumanAtomicIdentity[];
  if (new Set(identities.map(communityReviewAtomicIdentityKey)).size !== identities.length) return invalid();
  return [...identities].sort((left, right) =>
    communityReviewAtomicIdentityKey(left).localeCompare(communityReviewAtomicIdentityKey(right)));
}

function parseDataKindAndFixture(
  parsed: UnknownRecord,
): { readonly dataKind: CommunityReviewDataKind; readonly fixture?: CommunityReviewSyntheticFixtureMarker } | null {
  return provenance(parsed);
}

export function parseCommunityReviewBatchManifest(value: unknown): CommunityReviewBatchManifest {
  const parsed = record(value);
  const source = parsed === null ? null : parseDataKindAndFixture(parsed);
  const instrument = parseCommunityReviewInstrumentIdentity(parsed?.instrument);
  const qualificationEligibility = parseCommunityReviewQualificationEligibility(parsed?.qualificationEligibility);
  const closeRecordFingerprint = parsed === null ? null : optionalFingerprint(parsed, "closeRecordFingerprint");
  const freezeFingerprint = parsed === null ? null : optionalFingerprint(parsed, "freezeFingerprint");
  const base = parsed === null ? null : {
    dataKind: parsed.dataKind as CommunityReviewDataKind,
    ...(source?.fixture === undefined ? {} : { fixture: source.fixture }),
    protocolId: COMMUNITY_REVIEW_PROTOCOL_ID,
    protocolVersion: COMMUNITY_REVIEW_PROTOCOL_VERSION,
    batchId: parsed.batchId,
    instrument,
    qualificationEligibility,
    sealedSourceFingerprint: parsed.sealedSourceFingerprint,
    visibleTaskSetFingerprint: parsed.visibleTaskSetFingerprint,
    requiredIndependentReviewerCount: parsed.requiredIndependentReviewerCount,
    batchPurpose: parsed.batchPurpose as CommunityReviewBatchPurpose,
    blindnessMode: COMMUNITY_REVIEW_BLINDNESS_MODE,
  };
  if (parsed === null || source === null || instrument === null || qualificationEligibility === null || closeRecordFingerprint === null ||
    freezeFingerprint === null || base === null || !only(parsed, [
      "schemaVersion",
      "manifestKind",
      "dataKind",
      "fixture",
      "protocolId",
      "protocolVersion",
      "batchId",
      "instrument",
      "qualificationEligibility",
      "sealedSourceFingerprint",
      "visibleTaskSetFingerprint",
      "requiredIndependentReviewerCount",
      "batchPurpose",
      "blindnessMode",
      "state",
      "closeRecordFingerprint",
      "freezeFingerprint",
      "batchFingerprint",
    ]) || parsed.schemaVersion !== COMMUNITY_REVIEW_SCHEMA_VERSION ||
    parsed.manifestKind !== COMMUNITY_REVIEW_BATCH_MANIFEST_KIND ||
    parsed.protocolId !== COMMUNITY_REVIEW_PROTOCOL_ID ||
    parsed.protocolVersion !== COMMUNITY_REVIEW_PROTOCOL_VERSION || !opaque(parsed.batchId) ||
    !fingerprint(parsed.sealedSourceFingerprint) || !fingerprint(parsed.visibleTaskSetFingerprint) ||
    !Number.isInteger(parsed.requiredIndependentReviewerCount) ||
    (parsed.requiredIndependentReviewerCount as number) < 1 ||
    (parsed.requiredIndependentReviewerCount as number) > 100 ||
    typeof parsed.batchPurpose !== "string" || !batchPurposes.has(parsed.batchPurpose as CommunityReviewBatchPurpose) ||
    parsed.batchPurpose === "interpretable" && (parsed.requiredIndependentReviewerCount as number) < 2 ||
    parsed.blindnessMode !== COMMUNITY_REVIEW_BLINDNESS_MODE ||
    typeof parsed.state !== "string" || !batchStates.has(parsed.state as CommunityReviewBatchState) ||
    !fingerprint(parsed.batchFingerprint) || communityReviewBatchFingerprint(
      base as Pick<CommunityReviewBatchManifest,
        | "dataKind"
        | "fixture"
        | "protocolId"
        | "protocolVersion"
        | "batchId"
        | "instrument"
        | "qualificationEligibility"
        | "sealedSourceFingerprint"
        | "visibleTaskSetFingerprint"
        | "requiredIndependentReviewerCount"
        | "batchPurpose"
        | "blindnessMode">,
    ) !== parsed.batchFingerprint ||
    ((parsed.state === "SEALED" || parsed.state === "OPEN") &&
      (closeRecordFingerprint !== undefined || freezeFingerprint !== undefined)) ||
    (parsed.state === "CLOSED" && (closeRecordFingerprint === undefined || freezeFingerprint !== undefined)) ||
    (parsed.state === "FROZEN" && (closeRecordFingerprint === undefined || freezeFingerprint === undefined))) return invalid();
  return {
    schemaVersion: COMMUNITY_REVIEW_SCHEMA_VERSION,
    manifestKind: COMMUNITY_REVIEW_BATCH_MANIFEST_KIND,
    dataKind: source.dataKind,
    ...(source.fixture === undefined ? {} : { fixture: source.fixture }),
    protocolId: COMMUNITY_REVIEW_PROTOCOL_ID,
    protocolVersion: COMMUNITY_REVIEW_PROTOCOL_VERSION,
    batchId: parsed.batchId,
    instrument,
    qualificationEligibility,
    sealedSourceFingerprint: parsed.sealedSourceFingerprint,
    visibleTaskSetFingerprint: parsed.visibleTaskSetFingerprint,
    requiredIndependentReviewerCount: parsed.requiredIndependentReviewerCount as number,
    batchPurpose: parsed.batchPurpose as CommunityReviewBatchPurpose,
    blindnessMode: COMMUNITY_REVIEW_BLINDNESS_MODE,
    state: parsed.state as CommunityReviewBatchState,
    ...(closeRecordFingerprint === undefined ? {} : { closeRecordFingerprint }),
    ...(freezeFingerprint === undefined ? {} : { freezeFingerprint }),
    batchFingerprint: parsed.batchFingerprint,
  };
}

export function parseCommunityReviewAssignment(value: unknown): CommunityReviewAssignment {
  const parsed = record(value);
  const source = parsed === null ? null : parseDataKindAndFixture(parsed);
  const instrument = parseCommunityReviewInstrumentIdentity(parsed?.instrument);
  const visibleAtomicIds = parseAtomicIdentities(parsed?.visibleAtomicIds);
  const assignmentFingerprint = parsed === null ? null : optionalFingerprint(parsed, "assignmentFingerprint");
  const base = parsed === null ? null : {
    schemaVersion: COMMUNITY_REVIEW_SCHEMA_VERSION,
    assignmentKind: COMMUNITY_REVIEW_ASSIGNMENT_KIND,
    dataKind: parsed.dataKind as CommunityReviewDataKind,
    ...(source?.fixture === undefined ? {} : { fixture: source.fixture }),
    protocolId: COMMUNITY_REVIEW_PROTOCOL_ID,
    protocolVersion: COMMUNITY_REVIEW_PROTOCOL_VERSION,
    batchId: parsed.batchId,
    batchFingerprint: parsed.batchFingerprint,
    assignmentId: parsed.assignmentId,
    reviewerId: parsed.reviewerId,
    qualificationReceiptFingerprint: parsed.qualificationReceiptFingerprint,
    instrument,
    visibleTaskSetFingerprint: parsed.visibleTaskSetFingerprint,
    visibleAtomicIds,
    assignmentState: parsed.assignmentState as CommunityReviewAssignmentState,
  };
  if (parsed === null || source === null || instrument === null || visibleAtomicIds.length === 0 ||
    assignmentFingerprint === null || base === null || !only(parsed, [
      "schemaVersion",
      "assignmentKind",
      "dataKind",
      "fixture",
      "protocolId",
      "protocolVersion",
      "batchId",
      "batchFingerprint",
      "assignmentId",
      "reviewerId",
      "qualificationReceiptFingerprint",
      "instrument",
      "visibleTaskSetFingerprint",
      "visibleAtomicIds",
      "assignmentState",
      "assignmentFingerprint",
    ]) || parsed.schemaVersion !== COMMUNITY_REVIEW_SCHEMA_VERSION ||
    parsed.assignmentKind !== COMMUNITY_REVIEW_ASSIGNMENT_KIND ||
    parsed.protocolId !== COMMUNITY_REVIEW_PROTOCOL_ID ||
    parsed.protocolVersion !== COMMUNITY_REVIEW_PROTOCOL_VERSION || !opaque(parsed.batchId) ||
    !fingerprint(parsed.batchFingerprint) || !opaque(parsed.assignmentId) ||
    !opaque(parsed.reviewerId) || !fingerprint(parsed.qualificationReceiptFingerprint) ||
    !fingerprint(parsed.visibleTaskSetFingerprint) || typeof parsed.assignmentState !== "string" ||
    !assignmentStates.has(parsed.assignmentState as CommunityReviewAssignmentState) ||
    communityReviewAssignmentFingerprint(
      base as Omit<CommunityReviewAssignment, "assignmentFingerprint">,
    ) !== assignmentFingerprint) return invalid();
  return {
    schemaVersion: COMMUNITY_REVIEW_SCHEMA_VERSION,
    assignmentKind: COMMUNITY_REVIEW_ASSIGNMENT_KIND,
    dataKind: source.dataKind,
    ...(source.fixture === undefined ? {} : { fixture: source.fixture }),
    protocolId: COMMUNITY_REVIEW_PROTOCOL_ID,
    protocolVersion: COMMUNITY_REVIEW_PROTOCOL_VERSION,
    batchId: parsed.batchId,
    batchFingerprint: parsed.batchFingerprint,
    assignmentId: parsed.assignmentId,
    reviewerId: parsed.reviewerId,
    qualificationReceiptFingerprint: parsed.qualificationReceiptFingerprint,
    instrument,
    visibleTaskSetFingerprint: parsed.visibleTaskSetFingerprint,
    visibleAtomicIds: visibleAtomicIds,
    assignmentState: parsed.assignmentState as CommunityReviewAssignmentState,
    assignmentFingerprint,
  };
}

export function parseCommunityReviewAnnotation(value: unknown): CommunityReviewAnnotation {
  const parsed = record(value);
  const parsedEvidence = parsed === null ? null : optionalEvidence(parsed);
  if (parsed === null || parsedEvidence === null || !only(parsed, [
    "caseId",
    "rubricId",
    "requirementId",
    "status",
    "evidence",
  ]) || !identifier(parsed.caseId) || !identifier(parsed.rubricId) ||
    !identifier(parsed.requirementId) || typeof parsed.status !== "string" ||
    !statuses.has(parsed.status)) return invalid();
  return {
    caseId: parsed.caseId,
    rubricId: parsed.rubricId,
    requirementId: parsed.requirementId,
    status: parsed.status as CommunityReviewAnnotation["status"],
    ...(parsedEvidence === undefined ? {} : { evidence: parsedEvidence }),
  };
}

export function parseCommunityReviewReviewerPacket(value: unknown): CommunityReviewReviewerPacket {
  const parsed = record(value);
  const source = parsed === null ? null : parseDataKindAndFixture(parsed);
  const instrument = parseCommunityReviewInstrumentIdentity(parsed?.instrument);
  let tasks: CommunityReviewVisibleTask[] | null = null;
  try { tasks = parseCommunityReviewVisibleTasks(parsed?.tasks); } catch { tasks = null; }
  const packetFingerprint = parsed === null ? null : optionalFingerprint(parsed, "packetFingerprint");
  const base = parsed === null || tasks === null ? null : {
    schemaVersion: COMMUNITY_REVIEW_SCHEMA_VERSION,
    packetKind: COMMUNITY_REVIEW_PACKET_KIND,
    dataKind: parsed.dataKind as CommunityReviewDataKind,
    ...(source?.fixture === undefined ? {} : { fixture: source.fixture }),
    protocolId: COMMUNITY_REVIEW_PROTOCOL_ID,
    protocolVersion: COMMUNITY_REVIEW_PROTOCOL_VERSION,
    batchId: parsed.batchId,
    batchFingerprint: parsed.batchFingerprint,
    assignmentId: parsed.assignmentId,
    reviewerId: parsed.reviewerId,
    qualificationReceiptFingerprint: parsed.qualificationReceiptFingerprint,
    instrument,
    taskSetFingerprint: parsed.taskSetFingerprint,
    tasks,
  };
  if (parsed === null || source === null || instrument === null || tasks === null ||
    packetFingerprint === null || base === null || !only(parsed, [
      "schemaVersion",
      "packetKind",
      "dataKind",
      "fixture",
      "protocolId",
      "protocolVersion",
      "batchId",
      "batchFingerprint",
      "assignmentId",
      "reviewerId",
      "qualificationReceiptFingerprint",
      "instrument",
      "taskSetFingerprint",
      "tasks",
      "packetFingerprint",
    ]) || parsed.schemaVersion !== COMMUNITY_REVIEW_SCHEMA_VERSION ||
    parsed.packetKind !== COMMUNITY_REVIEW_PACKET_KIND ||
    parsed.protocolId !== COMMUNITY_REVIEW_PROTOCOL_ID || parsed.protocolVersion !== COMMUNITY_REVIEW_PROTOCOL_VERSION ||
    !opaque(parsed.batchId) || !fingerprint(parsed.batchFingerprint) || !opaque(parsed.assignmentId) ||
    !opaque(parsed.reviewerId) || !fingerprint(parsed.qualificationReceiptFingerprint) ||
    !fingerprint(parsed.taskSetFingerprint) || communityReviewVisibleTaskSetFingerprint(tasks) !== parsed.taskSetFingerprint ||
    !fingerprint(parsed.packetFingerprint) || communityReviewPacketFingerprint(
      base as Omit<CommunityReviewReviewerPacket, "packetFingerprint">,
    ) !== parsed.packetFingerprint) return invalid();
  return {
    schemaVersion: COMMUNITY_REVIEW_SCHEMA_VERSION,
    packetKind: COMMUNITY_REVIEW_PACKET_KIND,
    dataKind: source.dataKind,
    ...(source.fixture === undefined ? {} : { fixture: source.fixture }),
    protocolId: COMMUNITY_REVIEW_PROTOCOL_ID,
    protocolVersion: COMMUNITY_REVIEW_PROTOCOL_VERSION,
    batchId: parsed.batchId,
    batchFingerprint: parsed.batchFingerprint,
    assignmentId: parsed.assignmentId,
    reviewerId: parsed.reviewerId,
    qualificationReceiptFingerprint: parsed.qualificationReceiptFingerprint,
    instrument,
    taskSetFingerprint: parsed.taskSetFingerprint,
    tasks,
    packetFingerprint: packetFingerprint as string,
  };
}

function parseAnnotations(value: unknown): CommunityReviewAnnotation[] {
  if (!Array.isArray(value) || value.length === 0) return invalid();
  const annotations = value.map(parseCommunityReviewAnnotation);
  if (new Set(annotations.map(communityReviewAtomicIdentityKey)).size !== annotations.length) return invalid();
  return [...annotations].sort((left, right) =>
    communityReviewAtomicIdentityKey(left).localeCompare(communityReviewAtomicIdentityKey(right)));
}

export function parseCommunityReviewSubmission(value: unknown): CommunityReviewSubmission {
  const parsed = record(value);
  const source = parsed === null ? null : parseDataKindAndFixture(parsed);
  const instrument = parseCommunityReviewInstrumentIdentity(parsed?.instrument);
  let annotations: CommunityReviewAnnotation[] | null = null;
  try { annotations = parseAnnotations(parsed?.annotations); } catch { annotations = null; }
  const submissionFingerprint = parsed === null ? null : optionalFingerprint(parsed, "submissionFingerprint");
  const base = parsed === null || annotations === null ? null : {
    schemaVersion: COMMUNITY_REVIEW_SCHEMA_VERSION,
    submissionKind: COMMUNITY_REVIEW_SUBMISSION_KIND,
    dataKind: parsed.dataKind as CommunityReviewDataKind,
    ...(source?.fixture === undefined ? {} : { fixture: source.fixture }),
    protocolId: COMMUNITY_REVIEW_PROTOCOL_ID,
    protocolVersion: COMMUNITY_REVIEW_PROTOCOL_VERSION,
    batchId: parsed.batchId,
    batchFingerprint: parsed.batchFingerprint,
    assignmentId: parsed.assignmentId,
    reviewerId: parsed.reviewerId,
    qualificationReceiptFingerprint: parsed.qualificationReceiptFingerprint,
    instrument,
    taskSetFingerprint: parsed.taskSetFingerprint,
    packetFingerprint: parsed.packetFingerprint,
    submissionDisposition: parsed.submissionDisposition as CommunityReviewSubmissionDisposition,
    completed: true as const,
    annotations,
  };
  if (parsed === null || source === null || instrument === null || annotations === null ||
    submissionFingerprint === null || base === null || !only(parsed, [
      "schemaVersion",
      "submissionKind",
      "dataKind",
      "fixture",
      "protocolId",
      "protocolVersion",
      "batchId",
      "batchFingerprint",
      "assignmentId",
      "reviewerId",
      "qualificationReceiptFingerprint",
      "instrument",
      "taskSetFingerprint",
      "packetFingerprint",
      "submissionDisposition",
      "completed",
      "annotations",
      "submissionFingerprint",
    ]) || parsed.schemaVersion !== COMMUNITY_REVIEW_SCHEMA_VERSION ||
    parsed.submissionKind !== COMMUNITY_REVIEW_SUBMISSION_KIND ||
    parsed.protocolId !== COMMUNITY_REVIEW_PROTOCOL_ID || parsed.protocolVersion !== COMMUNITY_REVIEW_PROTOCOL_VERSION ||
    !opaque(parsed.batchId) || !fingerprint(parsed.batchFingerprint) || !opaque(parsed.assignmentId) ||
    !opaque(parsed.reviewerId) || !fingerprint(parsed.qualificationReceiptFingerprint) ||
    !fingerprint(parsed.taskSetFingerprint) || !fingerprint(parsed.packetFingerprint) ||
    typeof parsed.submissionDisposition !== "string" ||
    !submissionDispositions.has(parsed.submissionDisposition as CommunityReviewSubmissionDisposition) ||
    parsed.completed !== true || !fingerprint(parsed.submissionFingerprint) ||
    communityReviewSubmissionFingerprint(
      base as Omit<CommunityReviewSubmission, "submissionFingerprint">,
    ) !== parsed.submissionFingerprint) return invalid();
  return {
    schemaVersion: COMMUNITY_REVIEW_SCHEMA_VERSION,
    submissionKind: COMMUNITY_REVIEW_SUBMISSION_KIND,
    dataKind: source.dataKind,
    ...(source.fixture === undefined ? {} : { fixture: source.fixture }),
    protocolId: COMMUNITY_REVIEW_PROTOCOL_ID,
    protocolVersion: COMMUNITY_REVIEW_PROTOCOL_VERSION,
    batchId: parsed.batchId,
    batchFingerprint: parsed.batchFingerprint,
    assignmentId: parsed.assignmentId,
    reviewerId: parsed.reviewerId,
    qualificationReceiptFingerprint: parsed.qualificationReceiptFingerprint,
    instrument,
    taskSetFingerprint: parsed.taskSetFingerprint,
    packetFingerprint: parsed.packetFingerprint,
    submissionDisposition: parsed.submissionDisposition as CommunityReviewSubmissionDisposition,
    completed: true,
    annotations,
    submissionFingerprint: submissionFingerprint as string,
  };
}

function sameJson(left: unknown, right: unknown): boolean {
  return canonicalCommunityReviewJson(left) === canonicalCommunityReviewJson(right);
}

function assertCommonEnvelope(
  assignment: CommunityReviewAssignment,
  submission: CommunityReviewSubmission,
): void {
  if (submission.dataKind !== assignment.dataKind || !sameJson(submission.fixture, assignment.fixture) ||
    submission.protocolId !== assignment.protocolId || submission.protocolVersion !== assignment.protocolVersion ||
    submission.batchId !== assignment.batchId || submission.batchFingerprint !== assignment.batchFingerprint ||
    submission.assignmentId !== assignment.assignmentId || submission.reviewerId !== assignment.reviewerId ||
    submission.qualificationReceiptFingerprint !== assignment.qualificationReceiptFingerprint ||
    sameJson(submission.instrument, assignment.instrument) === false ||
    submission.taskSetFingerprint !== assignment.visibleTaskSetFingerprint) return invalid();
}

export function assertCommunityReviewSubmissionMatchesAssignment(
  assignmentValue: unknown,
  submissionValue: unknown,
  expectedPacketFingerprint?: string,
): { readonly assignment: CommunityReviewAssignment; readonly submission: CommunityReviewSubmission } {
  const assignment = parseCommunityReviewAssignment(assignmentValue);
  const submission = parseCommunityReviewSubmission(submissionValue);
  if (assignment.assignmentState !== "assigned" ||
    submission.submissionDisposition !== "accepted-before-close") return invalid();
  assertCommonEnvelope(assignment, submission);
  if (expectedPacketFingerprint !== undefined && submission.packetFingerprint !== expectedPacketFingerprint) return invalid();
  const expected = new Set(assignment.visibleAtomicIds.map(communityReviewAtomicIdentityKey));
  const observed = new Set(submission.annotations.map(communityReviewAtomicIdentityKey));
  if (observed.size !== expected.size || [...observed].some((key) => !expected.has(key))) return invalid();
  return { assignment, submission };
}

function uniqueSortedIds(value: unknown, allowEmpty = true): string[] {
  if (!Array.isArray(value) || (!allowEmpty && value.length === 0) ||
    value.some((item) => !opaque(item))) return invalid();
  const ids = value as string[];
  if (new Set(ids).size !== ids.length) return invalid();
  return [...ids].sort();
}

export function parseCommunityReviewCoverage(value: unknown): CommunityReviewCoverage {
  const parsed = record(value);
  const assignedReviewerIds = uniqueSortedIds(parsed?.assignedReviewerIds);
  const acceptedReviewerIds = uniqueSortedIds(parsed?.acceptedReviewerIds);
  const missingReviewerIds = uniqueSortedIds(parsed?.missingReviewerIds);
  const withdrawnReviewerIds = uniqueSortedIds(parsed?.withdrawnReviewerIds);
  if (parsed === null || !only(parsed, [
    "requiredIndependentReviewerCount",
    "assignedReviewerCount",
    "acceptedReviewerCount",
    "missingReviewerCount",
    "withdrawnAssignmentCount",
    "coverageStatus",
    "assignedReviewerIds",
    "acceptedReviewerIds",
    "missingReviewerIds",
    "withdrawnReviewerIds",
  ]) || !Number.isInteger(parsed.requiredIndependentReviewerCount) ||
    (parsed.requiredIndependentReviewerCount as number) < 1 ||
    !Number.isInteger(parsed.assignedReviewerCount) || (parsed.assignedReviewerCount as number) < 0 ||
    !Number.isInteger(parsed.acceptedReviewerCount) || (parsed.acceptedReviewerCount as number) < 0 ||
    !Number.isInteger(parsed.missingReviewerCount) || (parsed.missingReviewerCount as number) < 0 ||
    !Number.isInteger(parsed.withdrawnAssignmentCount) || (parsed.withdrawnAssignmentCount as number) < 0 ||
    (parsed.coverageStatus !== "complete" && parsed.coverageStatus !== "incomplete") ||
    assignedReviewerIds.length !== parsed.assignedReviewerCount ||
    acceptedReviewerIds.length !== parsed.acceptedReviewerCount ||
    missingReviewerIds.length !== parsed.missingReviewerCount ||
    withdrawnReviewerIds.length !== parsed.withdrawnAssignmentCount ||
    acceptedReviewerIds.some((id) => !assignedReviewerIds.includes(id)) ||
    missingReviewerIds.some((id) => !assignedReviewerIds.includes(id) || acceptedReviewerIds.includes(id)) ||
    withdrawnReviewerIds.some((id) => !assignedReviewerIds.includes(id) || acceptedReviewerIds.includes(id)) ||
    missingReviewerIds.some((id) => withdrawnReviewerIds.includes(id)) ||
    parsed.assignedReviewerCount !== parsed.acceptedReviewerCount + parsed.missingReviewerCount + parsed.withdrawnAssignmentCount ||
    ((parsed.coverageStatus === "complete") !==
      ((parsed.acceptedReviewerCount as number) >= (parsed.requiredIndependentReviewerCount as number)))) return invalid();
  return {
    requiredIndependentReviewerCount: parsed.requiredIndependentReviewerCount as number,
    assignedReviewerCount: parsed.assignedReviewerCount as number,
    acceptedReviewerCount: parsed.acceptedReviewerCount as number,
    missingReviewerCount: parsed.missingReviewerCount as number,
    withdrawnAssignmentCount: parsed.withdrawnAssignmentCount as number,
    coverageStatus: parsed.coverageStatus,
    assignedReviewerIds,
    acceptedReviewerIds,
    missingReviewerIds,
    withdrawnReviewerIds,
  };
}

function parseCloseRecordBase(value: unknown): {
  readonly parsed: UnknownRecord;
  readonly source: NonNullable<ReturnType<typeof parseDataKindAndFixture>>;
  readonly instrument: CommunityReviewInstrumentIdentity;
  readonly qualificationEligibility: CommunityReviewQualificationEligibility;
  readonly coverage: CommunityReviewCoverage;
  readonly acceptedAssignmentIds: string[];
  readonly acceptedReviewerIds: string[];
  readonly acceptedSubmissionFingerprints: string[];
} | null {
  const parsed = record(value);
  if (parsed === null) return null;
  const source = parseDataKindAndFixture(parsed);
  const instrument = parseCommunityReviewInstrumentIdentity(parsed.instrument);
  const qualificationEligibility = parseCommunityReviewQualificationEligibility(parsed.qualificationEligibility);
  const coverage = parseCommunityReviewCoverage(parsed.coverage);
  const acceptedAssignmentIds = uniqueSortedIds(parsed.acceptedAssignmentIds, false);
  const acceptedReviewerIds = uniqueSortedIds(parsed.acceptedReviewerIds, false);
  const acceptedSubmissionFingerprints = Array.isArray(parsed.acceptedSubmissionFingerprints)
    ? [...parsed.acceptedSubmissionFingerprints].map((item) => {
        if (!fingerprint(item)) return invalid();
        return item;
      }).sort()
    : invalid();
  if (source === null || instrument === null || qualificationEligibility === null || coverage === null || acceptedAssignmentIds.length !== acceptedReviewerIds.length ||
    acceptedSubmissionFingerprints.length !== acceptedReviewerIds.length ||
    new Set(acceptedSubmissionFingerprints).size !== acceptedSubmissionFingerprints.length ||
    coverage.acceptedReviewerCount !== acceptedReviewerIds.length ||
    !sameJson(coverage.acceptedReviewerIds, acceptedReviewerIds)) return null;
  return {
    parsed,
    source,
    instrument,
    qualificationEligibility,
    coverage,
    acceptedAssignmentIds,
    acceptedReviewerIds,
    acceptedSubmissionFingerprints,
  };
}

export function parseCommunityReviewBatchCloseRecord(value: unknown): CommunityReviewBatchCloseRecord {
  const base = parseCloseRecordBase(value);
  const closeFingerprint = record(value) === null ? null : optionalFingerprint(record(value) as UnknownRecord, "closeFingerprint");
  const parsed = base?.parsed;
  if (base === null || parsed === undefined || closeFingerprint === null || !only(parsed, [
    "schemaVersion",
    "recordKind",
    "dataKind",
    "fixture",
    "protocolId",
    "protocolVersion",
    "batchId",
    "batchFingerprint",
    "instrument",
    "qualificationEligibility",
    "visibleTaskSetFingerprint",
    "batchPurpose",
    "blindnessMode",
    "state",
    "acceptedAssignmentIds",
    "acceptedReviewerIds",
    "acceptedSubmissionFingerprints",
    "coverage",
    "closeFingerprint",
  ]) || parsed.schemaVersion !== COMMUNITY_REVIEW_SCHEMA_VERSION ||
    parsed.recordKind !== COMMUNITY_REVIEW_CLOSE_RECORD_KIND ||
    parsed.protocolId !== COMMUNITY_REVIEW_PROTOCOL_ID || parsed.protocolVersion !== COMMUNITY_REVIEW_PROTOCOL_VERSION ||
    !opaque(parsed.batchId) || !fingerprint(parsed.batchFingerprint) || !fingerprint(parsed.visibleTaskSetFingerprint) ||
    typeof parsed.batchPurpose !== "string" || !batchPurposes.has(parsed.batchPurpose as CommunityReviewBatchPurpose) ||
    parsed.batchPurpose === "interpretable" && base.coverage.coverageStatus !== "complete" ||
    parsed.blindnessMode !== COMMUNITY_REVIEW_BLINDNESS_MODE || parsed.state !== "CLOSED" ||
    !fingerprint(parsed.closeFingerprint) || communityReviewCloseFingerprint({
      schemaVersion: COMMUNITY_REVIEW_SCHEMA_VERSION,
      recordKind: COMMUNITY_REVIEW_CLOSE_RECORD_KIND,
      dataKind: base.source.dataKind,
      ...(base.source.fixture === undefined ? {} : { fixture: base.source.fixture }),
      protocolId: COMMUNITY_REVIEW_PROTOCOL_ID,
      protocolVersion: COMMUNITY_REVIEW_PROTOCOL_VERSION,
      batchId: parsed.batchId,
      batchFingerprint: parsed.batchFingerprint,
      instrument: base.instrument,
      qualificationEligibility: base.qualificationEligibility,
      visibleTaskSetFingerprint: parsed.visibleTaskSetFingerprint,
      batchPurpose: parsed.batchPurpose as CommunityReviewBatchPurpose,
      blindnessMode: COMMUNITY_REVIEW_BLINDNESS_MODE,
      state: "CLOSED",
      acceptedAssignmentIds: base.acceptedAssignmentIds,
      acceptedReviewerIds: base.acceptedReviewerIds,
      acceptedSubmissionFingerprints: base.acceptedSubmissionFingerprints,
      coverage: base.coverage,
    }) !== parsed.closeFingerprint) return invalid();
  return {
    schemaVersion: COMMUNITY_REVIEW_SCHEMA_VERSION,
    recordKind: COMMUNITY_REVIEW_CLOSE_RECORD_KIND,
    dataKind: base.source.dataKind,
    ...(base.source.fixture === undefined ? {} : { fixture: base.source.fixture }),
    protocolId: COMMUNITY_REVIEW_PROTOCOL_ID,
    protocolVersion: COMMUNITY_REVIEW_PROTOCOL_VERSION,
    batchId: parsed.batchId,
    batchFingerprint: parsed.batchFingerprint,
    instrument: base.instrument,
    qualificationEligibility: base.qualificationEligibility,
    visibleTaskSetFingerprint: parsed.visibleTaskSetFingerprint,
    batchPurpose: parsed.batchPurpose as CommunityReviewBatchPurpose,
    blindnessMode: COMMUNITY_REVIEW_BLINDNESS_MODE,
    state: "CLOSED",
    acceptedAssignmentIds: base.acceptedAssignmentIds,
    acceptedReviewerIds: base.acceptedReviewerIds,
    acceptedSubmissionFingerprints: base.acceptedSubmissionFingerprints,
    coverage: base.coverage,
    closeFingerprint: parsed.closeFingerprint,
  };
}

function assertPoolSubmission(
  submission: CommunityReviewSubmission,
  expected: {
    readonly dataKind: CommunityReviewDataKind;
    readonly fixture?: CommunityReviewSyntheticFixtureMarker;
    readonly batchId: string;
    readonly batchFingerprint: string;
    readonly instrument: CommunityReviewInstrumentIdentity;
    readonly taskSetFingerprint: string;
    readonly visibleAtomicIds: readonly HumanAtomicIdentity[];
  },
): void {
  if (submission.submissionDisposition !== "accepted-before-close" || submission.dataKind !== expected.dataKind ||
    !sameJson(submission.fixture, expected.fixture) || submission.batchId !== expected.batchId ||
    submission.batchFingerprint !== expected.batchFingerprint || !sameJson(submission.instrument, expected.instrument) ||
    submission.taskSetFingerprint !== expected.taskSetFingerprint ||
    new Set(submission.annotations.map(communityReviewAtomicIdentityKey)).size !== expected.visibleAtomicIds.length ||
    [...new Set(submission.annotations.map(communityReviewAtomicIdentityKey))]
      .some((key) => !new Set(expected.visibleAtomicIds.map(communityReviewAtomicIdentityKey)).has(key))) return invalid();
}

export function parseFrozenCommunityReviewPool(value: unknown): FrozenCommunityReviewPool {
  const parsed = record(value);
  const source = parsed === null ? null : parseDataKindAndFixture(parsed);
  const instrument = parseCommunityReviewInstrumentIdentity(parsed?.instrument);
  const qualificationEligibility = parseCommunityReviewQualificationEligibility(parsed?.qualificationEligibility);
  const visibleAtomicIds = parseAtomicIdentities(parsed?.visibleAtomicIds);
  const coverage = parseCommunityReviewCoverage(parsed?.coverage);
  let submissions: CommunityReviewSubmission[] | null = null;
  try {
    submissions = Array.isArray(parsed?.submissions)
      ? parsed.submissions.map((item) => parseCommunityReviewSubmission(item))
      : null;
  } catch { submissions = null; }
  const acceptedAssignmentIds = uniqueSortedIds(parsed?.acceptedAssignmentIds, false);
  const acceptedReviewerIds = uniqueSortedIds(parsed?.acceptedReviewerIds, false);
  const acceptedSubmissionFingerprints = Array.isArray(parsed?.acceptedSubmissionFingerprints)
    ? parsed.acceptedSubmissionFingerprints.map((item) => {
        if (!fingerprint(item)) return invalid();
        return item;
      }).sort()
    : invalid();
  const freezeFingerprint = parsed === null ? null : optionalFingerprint(parsed, "freezeFingerprint");
  const base = parsed === null || source === null || instrument === null || qualificationEligibility === null || coverage === null ||
    submissions === null ? null : {
      schemaVersion: COMMUNITY_REVIEW_SCHEMA_VERSION,
      poolKind: COMMUNITY_REVIEW_POOL_KIND,
      dataKind: source.dataKind,
      ...(source.fixture === undefined ? {} : { fixture: source.fixture }),
      protocolId: COMMUNITY_REVIEW_PROTOCOL_ID,
      protocolVersion: COMMUNITY_REVIEW_PROTOCOL_VERSION,
      batchId: parsed.batchId,
      batchFingerprint: parsed.batchFingerprint,
      closeRecordFingerprint: parsed.closeRecordFingerprint,
      instrument,
      qualificationEligibility,
      visibleTaskSetFingerprint: parsed.visibleTaskSetFingerprint,
      visibleAtomicIds,
      batchPurpose: parsed.batchPurpose as CommunityReviewBatchPurpose,
      blindnessMode: COMMUNITY_REVIEW_BLINDNESS_MODE,
      state: "FROZEN" as const,
      acceptedAssignmentIds,
      acceptedReviewerIds,
      acceptedSubmissionFingerprints,
      coverage,
      submissions,
    };
  if (parsed === null || source === null || instrument === null || qualificationEligibility === null || visibleAtomicIds.length === 0 ||
    coverage === null || submissions === null || freezeFingerprint === null || base === null ||
    !only(parsed, [
      "schemaVersion",
      "poolKind",
      "dataKind",
      "fixture",
      "protocolId",
      "protocolVersion",
      "batchId",
      "batchFingerprint",
      "closeRecordFingerprint",
      "instrument",
      "qualificationEligibility",
      "visibleTaskSetFingerprint",
      "visibleAtomicIds",
      "batchPurpose",
      "blindnessMode",
      "state",
      "acceptedAssignmentIds",
      "acceptedReviewerIds",
      "acceptedSubmissionFingerprints",
      "coverage",
      "submissions",
      "freezeFingerprint",
    ]) || parsed.schemaVersion !== COMMUNITY_REVIEW_SCHEMA_VERSION || parsed.poolKind !== COMMUNITY_REVIEW_POOL_KIND ||
    parsed.protocolId !== COMMUNITY_REVIEW_PROTOCOL_ID || parsed.protocolVersion !== COMMUNITY_REVIEW_PROTOCOL_VERSION ||
    !opaque(parsed.batchId) || !fingerprint(parsed.batchFingerprint) || !fingerprint(parsed.closeRecordFingerprint) ||
    !fingerprint(parsed.visibleTaskSetFingerprint) || typeof parsed.batchPurpose !== "string" ||
    !batchPurposes.has(parsed.batchPurpose as CommunityReviewBatchPurpose) ||
    parsed.batchPurpose === "interpretable" && coverage.coverageStatus !== "complete" ||
    parsed.blindnessMode !== COMMUNITY_REVIEW_BLINDNESS_MODE || parsed.state !== "FROZEN" ||
    !fingerprint(parsed.freezeFingerprint) || acceptedAssignmentIds.length !== acceptedReviewerIds.length ||
    acceptedReviewerIds.length !== acceptedSubmissionFingerprints.length ||
    submissions.length !== acceptedReviewerIds.length ||
    new Set(acceptedSubmissionFingerprints).size !== acceptedSubmissionFingerprints.length ||
    coverage.acceptedReviewerCount !== acceptedReviewerIds.length ||
    !sameJson(coverage.acceptedReviewerIds, acceptedReviewerIds) ||
    new Set(submissions.map((submission) => submission.reviewerId)).size !== submissions.length ||
    !sameJson(submissions.map((submission) => submission.reviewerId).sort(), acceptedReviewerIds) ||
    !sameJson(submissions.map((submission) => submission.assignmentId).sort(), acceptedAssignmentIds) ||
    !sameJson(submissions.map((submission) => submission.submissionFingerprint).sort(), acceptedSubmissionFingerprints) ||
    submissions.some((submission) => {
      try {
        assertPoolSubmission(submission, {
          dataKind: source.dataKind,
          ...(source.fixture === undefined ? {} : { fixture: source.fixture }),
          batchId: parsed.batchId as string,
          batchFingerprint: parsed.batchFingerprint as string,
          instrument,
          taskSetFingerprint: parsed.visibleTaskSetFingerprint as string,
          visibleAtomicIds,
        });
        return false;
      } catch { return true; }
    }) || communityReviewPoolFingerprint(
      base as Omit<FrozenCommunityReviewPool, "freezeFingerprint">,
    ) !== parsed.freezeFingerprint) return invalid();
  return {
    schemaVersion: COMMUNITY_REVIEW_SCHEMA_VERSION,
    poolKind: COMMUNITY_REVIEW_POOL_KIND,
    dataKind: source.dataKind,
    ...(source.fixture === undefined ? {} : { fixture: source.fixture }),
    protocolId: COMMUNITY_REVIEW_PROTOCOL_ID,
    protocolVersion: COMMUNITY_REVIEW_PROTOCOL_VERSION,
    batchId: parsed.batchId,
    batchFingerprint: parsed.batchFingerprint,
    closeRecordFingerprint: parsed.closeRecordFingerprint,
    instrument,
    qualificationEligibility,
    visibleTaskSetFingerprint: parsed.visibleTaskSetFingerprint,
    visibleAtomicIds,
    batchPurpose: parsed.batchPurpose as CommunityReviewBatchPurpose,
    blindnessMode: COMMUNITY_REVIEW_BLINDNESS_MODE,
    state: "FROZEN",
    acceptedAssignmentIds,
    acceptedReviewerIds,
    acceptedSubmissionFingerprints,
    coverage,
    submissions,
    freezeFingerprint: freezeFingerprint as string,
  };
}

function parseStatusDistribution(value: unknown): CommunityReviewStatusDistribution | null {
  const parsed = record(value);
  const counts = record(parsed?.counts);
  if (parsed === null || counts === null || !only(parsed, ["total", "counts"]) ||
    !only(counts, HUMAN_ATOMIC_STATUSES) || !Number.isInteger(parsed.total) ||
    (parsed.total as number) < 0 || HUMAN_ATOMIC_STATUSES.some((status) =>
      !Number.isInteger(counts[status]) || (counts[status] as number) < 0) ||
    HUMAN_ATOMIC_STATUSES.reduce((sum, status) => sum + (counts[status] as number), 0) !== parsed.total) return null;
  return {
    total: parsed.total as number,
    counts: {
      SATISFIED: counts.SATISFIED as number,
      OMITTED_OR_INCOMPLETE: counts.OMITTED_OR_INCOMPLETE as number,
      EXPLICIT_CONFLICT: counts.EXPLICIT_CONFLICT as number,
    },
  };
}

function parseDisagreement(value: unknown): CommunityReviewDisagreement | null {
  const parsed = record(value);
  const parsedA = parsed === null ? null : optionalNamedEvidence(parsed, "reviewerAEvidence");
  const parsedB = parsed === null ? null : optionalNamedEvidence(parsed, "reviewerBEvidence");
  if (parsed === null || parsedA === null || parsedB === null || !only(parsed, [
    "caseId",
    "rubricId",
    "requirementId",
    "reviewerA",
    "reviewerB",
    "reviewerAStatus",
    "reviewerBStatus",
    "reviewerAEvidence",
    "reviewerBEvidence",
  ]) || !identifier(parsed.caseId) || !identifier(parsed.rubricId) ||
    !identifier(parsed.requirementId) || !opaque(parsed.reviewerA) || !opaque(parsed.reviewerB) ||
    parsed.reviewerA === parsed.reviewerB || typeof parsed.reviewerAStatus !== "string" ||
    !statuses.has(parsed.reviewerAStatus) || typeof parsed.reviewerBStatus !== "string" ||
    !statuses.has(parsed.reviewerBStatus) || parsed.reviewerAStatus === parsed.reviewerBStatus) return null;
  return {
    caseId: parsed.caseId,
    rubricId: parsed.rubricId,
    requirementId: parsed.requirementId,
    reviewerA: parsed.reviewerA,
    reviewerB: parsed.reviewerB,
    reviewerAStatus: parsed.reviewerAStatus as CommunityReviewDisagreement["reviewerAStatus"],
    reviewerBStatus: parsed.reviewerBStatus as CommunityReviewDisagreement["reviewerBStatus"],
    ...(parsedA === undefined ? {} : { reviewerAEvidence: parsedA }),
    ...(parsedB === undefined ? {} : { reviewerBEvidence: parsedB }),
  };
}

function parsePublicSubmission(value: unknown): CommunityReviewPublicSubmission | null {
  const parsed = record(value);
  let annotations: CommunityReviewAnnotation[] | null = null;
  try { annotations = Array.isArray(parsed?.annotations) ? parseAnnotations(parsed.annotations) : null; } catch { annotations = null; }
  const reviewerId = parsed === null || !("reviewerId" in parsed)
    ? undefined
    : opaque(parsed.reviewerId) ? parsed.reviewerId : null;
  if (parsed === null || annotations === null || reviewerId === null || !only(parsed, [
    "reviewerId",
    "submissionFingerprint",
    "annotations",
  ]) || !fingerprint(parsed.submissionFingerprint)) return null;
  return {
    ...(reviewerId === undefined ? {} : { reviewerId }),
    submissionFingerprint: parsed.submissionFingerprint,
    annotations,
  };
}

function parsePublicAgreement(value: unknown): CommunityReviewPublicAgreement | null {
  const parsed = record(value);
  const matrix = record(parsed?.confusionMatrix);
  const perRequirement = record(parsed?.perRequirement);
  const perCase = record(parsed?.perCase);
  let disagreements: CommunityReviewDisagreement[] | null = null;
  try { disagreements = Array.isArray(parsed?.disagreements) ? parsed.disagreements.map(parseDisagreement) as CommunityReviewDisagreement[] : null; } catch { disagreements = null; }
  const distributions = (value: UnknownRecord | null): Record<string, CommunityReviewStatusDistribution> | null => {
    if (value === null || Object.keys(value).some((key) => !publicDistributionKeyPattern.test(key))) return null;
    const result: Record<string, CommunityReviewStatusDistribution> = {};
    for (const [key, item] of Object.entries(value)) {
      const parsedItem = parseStatusDistribution(item);
      if (parsedItem === null) return null;
      result[key] = parsedItem;
    }
    return result;
  };
  const matrixTotal = matrix === null ? null : HUMAN_ATOMIC_STATUSES.reduce((total, row) => {
    const cells = record(matrix[row]);
    return total + (cells === null ? 0 : HUMAN_ATOMIC_STATUSES.reduce(
      (rowTotal, column) => rowTotal + (typeof cells[column] === "number" ? cells[column] as number : 0),
      0,
    ));
  }, 0);
  if (parsed === null || matrix === null || perRequirement === null || perCase === null ||
    !only(parsed, [
      "comparableAtomicCount",
      "agreementCount",
      "disagreementCount",
      "agreementShare",
      "confusionMatrix",
      "perRequirement",
      "perCase",
      "disagreements",
      "pairwiseReviewerCount",
      "missingOrWithdrawnAssignmentCount",
    ]) || !only(matrix, HUMAN_ATOMIC_STATUSES) ||
    HUMAN_ATOMIC_STATUSES.some((row) => {
      const cells = record(matrix[row]);
      return cells === null || !only(cells, HUMAN_ATOMIC_STATUSES) ||
        HUMAN_ATOMIC_STATUSES.some((column) => !Number.isInteger(cells[column]) || (cells[column] as number) < 0);
    }) || distributions(perRequirement) === null || distributions(perCase) === null ||
    disagreements === null || disagreements.some((item) => item === null) ||
    !Number.isInteger(parsed.comparableAtomicCount) || (parsed.comparableAtomicCount as number) < 0 ||
    !Number.isInteger(parsed.agreementCount) || (parsed.agreementCount as number) < 0 ||
    !Number.isInteger(parsed.disagreementCount) || (parsed.disagreementCount as number) < 0 ||
    (parsed.agreementCount as number) + (parsed.disagreementCount as number) !== parsed.comparableAtomicCount ||
    matrixTotal !== parsed.comparableAtomicCount ||
    (parsed.agreementShare !== null && (typeof parsed.agreementShare !== "number" ||
      !Number.isFinite(parsed.agreementShare) || parsed.agreementShare < 0 || parsed.agreementShare > 1)) ||
    (parsed.comparableAtomicCount === 0 && parsed.agreementShare !== null) ||
    (parsed.comparableAtomicCount > 0 && parsed.agreementShare !==
      (parsed.agreementCount as number) / (parsed.comparableAtomicCount as number)) ||
    !Number.isInteger(parsed.pairwiseReviewerCount) || (parsed.pairwiseReviewerCount as number) < 0 ||
    !Number.isInteger(parsed.missingOrWithdrawnAssignmentCount) || (parsed.missingOrWithdrawnAssignmentCount as number) < 0) return null;
  return {
    comparableAtomicCount: parsed.comparableAtomicCount as number,
    agreementCount: parsed.agreementCount as number,
    disagreementCount: parsed.disagreementCount as number,
    agreementShare: parsed.agreementShare as number | null,
    confusionMatrix: matrix as CommunityReviewPublicAgreement["confusionMatrix"],
    perRequirement: distributions(perRequirement) as Record<string, CommunityReviewStatusDistribution>,
    perCase: distributions(perCase) as Record<string, CommunityReviewStatusDistribution>,
    disagreements: disagreements as CommunityReviewDisagreement[],
    pairwiseReviewerCount: parsed.pairwiseReviewerCount as number,
    missingOrWithdrawnAssignmentCount: parsed.missingOrWithdrawnAssignmentCount as number,
  };
}

export function parseCommunityReviewPublicEvidenceArtifact(
  value: unknown,
): CommunityReviewPublicEvidenceArtifact {
  const parsed = record(value);
  const source = parsed === null ? null : parseDataKindAndFixture(parsed);
  const instrument = parseCommunityReviewInstrumentIdentity(parsed?.instrument);
  const qualificationEligibility = parseCommunityReviewQualificationEligibility(parsed?.qualificationEligibility);
  const policy = record(parsed?.disclosurePolicy);
  const agreement = parsePublicAgreement(parsed?.agreement);
  const publishedReviewerIds = parsed === null || !("publishedReviewerIds" in parsed)
    ? undefined
    : uniqueSortedIds(parsed.publishedReviewerIds, false);
  let publishedSubmissions: CommunityReviewPublicSubmission[] | undefined;
  if (parsed !== null && "publishedSubmissions" in parsed) {
    if (!Array.isArray(parsed.publishedSubmissions)) return invalid();
    publishedSubmissions = parsed.publishedSubmissions.map((item) => {
      const parsedItem = parsePublicSubmission(item);
      return parsedItem === null ? invalid() : parsedItem;
    });
  }
  if (parsed === null || source === null || instrument === null || qualificationEligibility === null ||
    policy === null || agreement === null ||
    !only(parsed, [
      "schemaVersion",
      "artifactKind",
      "dataKind",
      "fixture",
      "protocolId",
      "protocolVersion",
      "batchId",
      "batchFingerprint",
      "instrument",
      "qualificationEligibility",
      "visibleTaskSetFingerprint",
      "state",
      "frozenPoolFingerprint",
      "acceptedSubmissionFingerprints",
      "disclosureDate",
      "disclosurePolicy",
      "publishedReviewerIds",
      "publishedSubmissions",
      "agreement",
      "limitations",
    ]) || parsed.schemaVersion !== COMMUNITY_REVIEW_SCHEMA_VERSION ||
    parsed.artifactKind !== COMMUNITY_REVIEW_PUBLIC_ARTIFACT_KIND ||
    parsed.protocolId !== COMMUNITY_REVIEW_PROTOCOL_ID || parsed.protocolVersion !== COMMUNITY_REVIEW_PROTOCOL_VERSION ||
    !opaque(parsed.batchId) || !fingerprint(parsed.batchFingerprint) || !fingerprint(parsed.visibleTaskSetFingerprint) ||
    parsed.state !== "FROZEN" || !fingerprint(parsed.frozenPoolFingerprint) ||
    !Array.isArray(parsed.acceptedSubmissionFingerprints) ||
    parsed.acceptedSubmissionFingerprints.some((item) => !fingerprint(item)) ||
    new Set(parsed.acceptedSubmissionFingerprints as string[]).size !== parsed.acceptedSubmissionFingerprints.length ||
    !/^\d{4}-\d{2}-\d{2}$/u.test(typeof parsed.disclosureDate === "string" ? parsed.disclosureDate : "") ||
    !only(policy, ["publishReviewerIds", "publishAtomicAnnotations", "publishReviewerEvidence"]) ||
    typeof policy.publishReviewerIds !== "boolean" || typeof policy.publishAtomicAnnotations !== "boolean" ||
    typeof policy.publishReviewerEvidence !== "boolean" ||
    (policy.publishReviewerEvidence === true && policy.publishAtomicAnnotations !== true) ||
    (policy.publishReviewerEvidence === true && policy.publishReviewerIds !== true) ||
    publishedReviewerIds === undefined && policy.publishReviewerIds === true ||
    publishedReviewerIds !== undefined && policy.publishReviewerIds !== true ||
    publishedSubmissions === undefined && policy.publishAtomicAnnotations === true ||
    publishedSubmissions !== undefined && policy.publishAtomicAnnotations !== true ||
    policy.publishReviewerIds === false && publishedSubmissions?.some((item) => item.reviewerId !== undefined) === true ||
    policy.publishReviewerIds === false && agreement.disagreements.length > 0 ||
    policy.publishReviewerIds === true && publishedSubmissions !== undefined &&
      publishedSubmissions.some((item) => item.reviewerId === undefined) ||
    policy.publishReviewerEvidence === false && publishedSubmissions?.some((submission) =>
      submission.annotations.some((annotation) => annotation.evidence !== undefined)) === true ||
    policy.publishReviewerEvidence === false && agreement.disagreements.some((item) =>
      item.reviewerAEvidence !== undefined || item.reviewerBEvidence !== undefined) ||
    publishedSubmissions !== undefined &&
      (publishedSubmissions.length !== parsed.acceptedSubmissionFingerprints.length ||
        new Set(publishedSubmissions.map((item) => item.submissionFingerprint)).size !== publishedSubmissions.length ||
        publishedSubmissions.some((item) => !(parsed.acceptedSubmissionFingerprints as string[]).includes(item.submissionFingerprint))) ||
    publishedReviewerIds !== undefined && publishedSubmissions !== undefined &&
      (new Set(publishedReviewerIds).size !== publishedReviewerIds.length ||
        new Set(publishedSubmissions.map((item) => item.reviewerId as string)).size !== publishedReviewerIds.length ||
        publishedSubmissions.some((item) => item.reviewerId === undefined || !publishedReviewerIds.includes(item.reviewerId))) ||
    !Array.isArray(parsed.limitations) || parsed.limitations.some((item) => !nonEmpty(item))) return invalid();
  return {
    schemaVersion: COMMUNITY_REVIEW_SCHEMA_VERSION,
    artifactKind: COMMUNITY_REVIEW_PUBLIC_ARTIFACT_KIND,
    dataKind: source.dataKind,
    ...(source.fixture === undefined ? {} : { fixture: source.fixture }),
    protocolId: COMMUNITY_REVIEW_PROTOCOL_ID,
    protocolVersion: COMMUNITY_REVIEW_PROTOCOL_VERSION,
    batchId: parsed.batchId,
    batchFingerprint: parsed.batchFingerprint,
    instrument,
    qualificationEligibility,
    visibleTaskSetFingerprint: parsed.visibleTaskSetFingerprint,
    state: "FROZEN",
    frozenPoolFingerprint: parsed.frozenPoolFingerprint,
    acceptedSubmissionFingerprints: [...parsed.acceptedSubmissionFingerprints as string[]].sort(),
    disclosureDate: parsed.disclosureDate as string,
    disclosurePolicy: {
      publishReviewerIds: policy.publishReviewerIds,
      publishAtomicAnnotations: policy.publishAtomicAnnotations,
      publishReviewerEvidence: policy.publishReviewerEvidence,
    },
    ...(publishedReviewerIds === undefined ? {} : { publishedReviewerIds }),
    ...(publishedSubmissions === undefined ? {} : { publishedSubmissions }),
    agreement,
    limitations: [...parsed.limitations as string[]],
  };
}

export type CommunityReviewParsedPublicPolicy = CommunityReviewDisclosurePolicy;
