import { BenchmarkConfigurationError } from "./errors.js";
import {
  COMMUNITY_REVIEW_APPLICATION_AVAILABILITIES,
  COMMUNITY_REVIEW_APPLICATION_CONTACT_TYPES,
  COMMUNITY_REVIEW_APPLICATION_CONTRACT_ID,
  COMMUNITY_REVIEW_APPLICATION_CONTRACT_VERSION,
  COMMUNITY_REVIEW_APPLICATION_EMAIL_MAX_LENGTH,
  COMMUNITY_REVIEW_APPLICATION_EXPERIENCE_MAX_LENGTH,
  COMMUNITY_REVIEW_APPLICATION_INTAKE_STATES,
  COMMUNITY_REVIEW_APPLICATION_KIND,
  COMMUNITY_REVIEW_APPLICATION_LOCALES,
  COMMUNITY_REVIEW_APPLICATION_MOTIVATION_MAX_LENGTH,
  COMMUNITY_REVIEW_APPLICATION_NOTICE_VERSION,
  COMMUNITY_REVIEW_APPLICATION_SCHEMA_VERSION,
  type CommunityReviewApplication,
  type CommunityReviewApplicationAcknowledgements,
  type CommunityReviewApplicationAvailability,
  type CommunityReviewApplicationContact,
  type CommunityReviewApplicationIntakeState,
  type CommunityReviewApplicationLocale,
} from "./community-review-application.js";

type UnknownRecord = Record<string, unknown>;

const emailLocalPartPattern = /^[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+)*$/u;
const emailDomainLabelPattern = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/u;
const intakeStates = new Set<string>(COMMUNITY_REVIEW_APPLICATION_INTAKE_STATES);

function invalid(): never {
  throw new BenchmarkConfigurationError("community_review_application_invalid");
}

function asRecord(value: unknown): UnknownRecord | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as UnknownRecord
    : null;
}

function hasOnlyKeys(value: UnknownRecord, keys: readonly string[]): boolean {
  const allowed = new Set(keys);
  return Object.keys(value).every((key) => allowed.has(key));
}

function boundedText(value: unknown, maximumLength: number): value is string {
  return typeof value === "string" && value.trim().length > 0 &&
    value.length <= maximumLength;
}

function optionalBoundedText(
  value: UnknownRecord,
  key: string,
  maximumLength: number,
): string | undefined | null {
  if (!(key in value)) return undefined;
  return boundedText(value[key], maximumLength) ? value[key] as string : null;
}

function knownLocale(value: unknown): value is CommunityReviewApplicationLocale {
  return typeof value === "string" &&
    COMMUNITY_REVIEW_APPLICATION_LOCALES.includes(value as CommunityReviewApplicationLocale);
}

function knownAvailability(value: unknown): value is CommunityReviewApplicationAvailability {
  return typeof value === "string" &&
    COMMUNITY_REVIEW_APPLICATION_AVAILABILITIES.includes(value as CommunityReviewApplicationAvailability);
}

function validEmail(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0 ||
    value.length > COMMUNITY_REVIEW_APPLICATION_EMAIL_MAX_LENGTH ||
    value.trim() !== value) return false;

  const atIndex = value.indexOf("@");
  if (atIndex <= 0 || atIndex !== value.lastIndexOf("@")) return false;
  const localPart = value.slice(0, atIndex);
  const domain = value.slice(atIndex + 1);
  if (localPart.length > 64 || domain.length > 253 ||
    !emailLocalPartPattern.test(localPart)) return false;

  const labels = domain.split(".");
  return labels.length >= 2 && labels.every((label) => emailDomainLabelPattern.test(label));
}

function parseContact(value: unknown): CommunityReviewApplicationContact | null {
  const record = asRecord(value);
  if (record === null || !hasOnlyKeys(record, ["type", "value"]) ||
    record.type !== COMMUNITY_REVIEW_APPLICATION_CONTACT_TYPES[0] ||
    !validEmail(record.value)) return null;
  return { type: "email", value: record.value };
}

function parseAcknowledgements(
  value: unknown,
): CommunityReviewApplicationAcknowledgements | null {
  const record = asRecord(value);
  if (
    record === null ||
    !hasOnlyKeys(record, [
      "applicationNoticeAcknowledged",
      "applicationDoesNotGuaranteeAcceptance",
      "invitationDoesNotImplyQualification",
      "qualificationRequiredBeforeReviewAssignments",
      "publicIntakeFollowsLaunchGate",
    ]) ||
    record.applicationNoticeAcknowledged !== true ||
    record.applicationDoesNotGuaranteeAcceptance !== true ||
    record.invitationDoesNotImplyQualification !== true ||
    record.qualificationRequiredBeforeReviewAssignments !== true ||
    record.publicIntakeFollowsLaunchGate !== true
  ) return null;

  return {
    applicationNoticeAcknowledged: true,
    applicationDoesNotGuaranteeAcceptance: true,
    invitationDoesNotImplyQualification: true,
    qualificationRequiredBeforeReviewAssignments: true,
    publicIntakeFollowsLaunchGate: true,
  };
}

export function parseCommunityReviewApplication(
  value: unknown,
): CommunityReviewApplication {
  const record = asRecord(value);
  const contact = record === null ? null : parseContact(record.contact);
  const experienceSummary = record === null
    ? null
    : optionalBoundedText(
        record,
        "experienceSummary",
        COMMUNITY_REVIEW_APPLICATION_EXPERIENCE_MAX_LENGTH,
      );
  const acknowledgements = record === null ? null : parseAcknowledgements(record.acknowledgements);

  if (
    record === null ||
    !hasOnlyKeys(record, [
      "schemaVersion",
      "applicationKind",
      "contractId",
      "contractVersion",
      "noticeVersion",
      "submittedLocale",
      "preferredReviewLocale",
      "contact",
      "motivation",
      "experienceSummary",
      "availability",
      "acknowledgements",
    ]) ||
    record.schemaVersion !== COMMUNITY_REVIEW_APPLICATION_SCHEMA_VERSION ||
    record.applicationKind !== COMMUNITY_REVIEW_APPLICATION_KIND ||
    record.contractId !== COMMUNITY_REVIEW_APPLICATION_CONTRACT_ID ||
    record.contractVersion !== COMMUNITY_REVIEW_APPLICATION_CONTRACT_VERSION ||
    record.noticeVersion !== COMMUNITY_REVIEW_APPLICATION_NOTICE_VERSION ||
    !knownLocale(record.submittedLocale) ||
    !knownLocale(record.preferredReviewLocale) ||
    contact === null ||
    !boundedText(record.motivation, COMMUNITY_REVIEW_APPLICATION_MOTIVATION_MAX_LENGTH) ||
    experienceSummary === null ||
    !knownAvailability(record.availability) ||
    acknowledgements === null
  ) return invalid();

  return {
    schemaVersion: COMMUNITY_REVIEW_APPLICATION_SCHEMA_VERSION,
    applicationKind: COMMUNITY_REVIEW_APPLICATION_KIND,
    contractId: COMMUNITY_REVIEW_APPLICATION_CONTRACT_ID,
    contractVersion: COMMUNITY_REVIEW_APPLICATION_CONTRACT_VERSION,
    noticeVersion: COMMUNITY_REVIEW_APPLICATION_NOTICE_VERSION,
    submittedLocale: record.submittedLocale,
    preferredReviewLocale: record.preferredReviewLocale,
    contact,
    motivation: record.motivation,
    ...(experienceSummary === undefined ? {} : { experienceSummary }),
    availability: record.availability,
    acknowledgements,
  };
}

export function parseCommunityReviewApplicationIntakeState(
  value: unknown,
): CommunityReviewApplicationIntakeState {
  if (typeof value !== "string" || !intakeStates.has(value)) return invalid();
  return value as CommunityReviewApplicationIntakeState;
}

/**
 * Resolves an untrusted configuration value without ever treating omission or
 * malformed primitive input as permission to open intake. Unknown non-empty
 * state names are rejected by the strict parser instead of being guessed.
 */
export function resolveCommunityReviewApplicationIntakeState(
  value?: unknown,
): CommunityReviewApplicationIntakeState {
  if (value === undefined || value === null || typeof value !== "string" ||
    value.length === 0 || value.trim() !== value) {
    return "CLOSED";
  }
  return parseCommunityReviewApplicationIntakeState(value);
}

export function isCommunityReviewApplicationIntakeOpen(value?: unknown): boolean {
  return resolveCommunityReviewApplicationIntakeState(value) === "OPEN";
}
