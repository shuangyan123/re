/**
 * A future participation application is intentionally separate from the
 * Community Review protocol. It contains applicant contact data, not a
 * reviewer identity, consent record, qualification result, or review evidence.
 */
export const COMMUNITY_REVIEW_APPLICATION_SCHEMA_VERSION = 1 as const;
export const COMMUNITY_REVIEW_APPLICATION_KIND = "community-review-application" as const;
export const COMMUNITY_REVIEW_APPLICATION_CONTRACT_ID = "community-review-application" as const;
export const COMMUNITY_REVIEW_APPLICATION_CONTRACT_VERSION = "0.1.0" as const;
export const COMMUNITY_REVIEW_APPLICATION_NOTICE_VERSION = "0.1.0" as const;

export const COMMUNITY_REVIEW_APPLICATION_LOCALES = ["en", "zh-CN"] as const;
export const COMMUNITY_REVIEW_APPLICATION_CONTACT_TYPES = ["email"] as const;
export const COMMUNITY_REVIEW_APPLICATION_AVAILABILITIES = [
  "occasional",
  "regular",
  "flexible",
] as const;
export const COMMUNITY_REVIEW_APPLICATION_DECISIONS = [
  "PENDING",
  "INVITED",
  "DECLINED",
] as const;
export const COMMUNITY_REVIEW_APPLICATION_INTAKE_STATES = [
  "CLOSED",
  "OPEN",
  "PAUSED",
] as const;
export const COMMUNITY_REVIEW_APPLICATION_DEFAULT_INTAKE_STATE = "CLOSED" as const;

export const COMMUNITY_REVIEW_APPLICATION_EMAIL_MAX_LENGTH = 254 as const;
export const COMMUNITY_REVIEW_APPLICATION_MOTIVATION_MAX_LENGTH = 1_000 as const;
export const COMMUNITY_REVIEW_APPLICATION_EXPERIENCE_MAX_LENGTH = 1_000 as const;

export type CommunityReviewApplicationLocale =
  (typeof COMMUNITY_REVIEW_APPLICATION_LOCALES)[number];
export type CommunityReviewApplicationContactType =
  (typeof COMMUNITY_REVIEW_APPLICATION_CONTACT_TYPES)[number];
export type CommunityReviewApplicationAvailability =
  (typeof COMMUNITY_REVIEW_APPLICATION_AVAILABILITIES)[number];
export type CommunityReviewApplicationDecision =
  (typeof COMMUNITY_REVIEW_APPLICATION_DECISIONS)[number];
export type CommunityReviewApplicationIntakeState =
  (typeof COMMUNITY_REVIEW_APPLICATION_INTAKE_STATES)[number];

export interface CommunityReviewApplicationEmailContact {
  readonly type: "email";
  readonly value: string;
}

export type CommunityReviewApplicationContact = CommunityReviewApplicationEmailContact;

/** These acknowledgements are not Community Review consent. */
export interface CommunityReviewApplicationAcknowledgements {
  readonly applicationNoticeAcknowledged: true;
  readonly applicationDoesNotGuaranteeAcceptance: true;
  readonly invitationDoesNotImplyQualification: true;
  readonly qualificationRequiredBeforeReviewAssignments: true;
  readonly publicIntakeFollowsLaunchGate: true;
}

/**
 * Applicant-facing contract only. Internal decisions are deliberately not
 * fields on this object and are never evidence or reviewer authority.
 */
export interface CommunityReviewApplication {
  readonly schemaVersion: typeof COMMUNITY_REVIEW_APPLICATION_SCHEMA_VERSION;
  readonly applicationKind: typeof COMMUNITY_REVIEW_APPLICATION_KIND;
  readonly contractId: typeof COMMUNITY_REVIEW_APPLICATION_CONTRACT_ID;
  readonly contractVersion: typeof COMMUNITY_REVIEW_APPLICATION_CONTRACT_VERSION;
  readonly noticeVersion: typeof COMMUNITY_REVIEW_APPLICATION_NOTICE_VERSION;
  /** Locale used to present the future application notice. */
  readonly submittedLocale: CommunityReviewApplicationLocale;
  /** Locale in which the applicant prefers to review future tasks. */
  readonly preferredReviewLocale: CommunityReviewApplicationLocale;
  readonly contact: CommunityReviewApplicationContact;
  readonly motivation: string;
  readonly experienceSummary?: string;
  readonly availability: CommunityReviewApplicationAvailability;
  readonly acknowledgements: CommunityReviewApplicationAcknowledgements;
}
