import assert from "node:assert/strict";
import { test } from "node:test";

import {
  BenchmarkConfigurationError,
  COMMUNITY_REVIEW_APPLICATION_AVAILABILITIES,
  COMMUNITY_REVIEW_APPLICATION_CONTRACT_ID,
  COMMUNITY_REVIEW_APPLICATION_CONTRACT_VERSION,
  COMMUNITY_REVIEW_APPLICATION_DECISIONS,
  COMMUNITY_REVIEW_APPLICATION_DEFAULT_INTAKE_STATE,
  COMMUNITY_REVIEW_APPLICATION_EXPERIENCE_MAX_LENGTH,
  COMMUNITY_REVIEW_APPLICATION_INTAKE_STATES,
  COMMUNITY_REVIEW_APPLICATION_KIND,
  COMMUNITY_REVIEW_APPLICATION_MOTIVATION_MAX_LENGTH,
  COMMUNITY_REVIEW_APPLICATION_NOTICE_VERSION,
  COMMUNITY_REVIEW_APPLICATION_SCHEMA_VERSION,
  isCommunityReviewApplicationIntakeOpen,
  parseCommunityReviewApplication,
  parseCommunityReviewApplicationIntakeState,
  resolveCommunityReviewApplicationIntakeState,
} from "../src/contracts/index.js";

const acknowledgements = {
  applicationNoticeAcknowledged: true,
  applicationDoesNotGuaranteeAcceptance: true,
  invitationDoesNotImplyQualification: true,
  qualificationRequiredBeforeReviewAssignments: true,
  publicIntakeFollowsLaunchGate: true,
} as const;

function application(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schemaVersion: COMMUNITY_REVIEW_APPLICATION_SCHEMA_VERSION,
    applicationKind: COMMUNITY_REVIEW_APPLICATION_KIND,
    contractId: COMMUNITY_REVIEW_APPLICATION_CONTRACT_ID,
    contractVersion: COMMUNITY_REVIEW_APPLICATION_CONTRACT_VERSION,
    noticeVersion: COMMUNITY_REVIEW_APPLICATION_NOTICE_VERSION,
    submittedLocale: "en",
    preferredReviewLocale: "zh-CN",
    contact: {
      type: "email",
      value: "Future.Reviewer@example.org",
    },
    motivation: "I want to help inspect observable tutoring behavior.",
    availability: "occasional",
    acknowledgements,
    ...overrides,
  };
}

function assertInvalid(value: unknown): void {
  assert.throws(
    () => parseCommunityReviewApplication(value),
    (error: unknown) => error instanceof BenchmarkConfigurationError &&
      error.code === "community_review_application_invalid",
  );
}

test("parses a valid minimal application without inventing optional data", () => {
  const parsed = parseCommunityReviewApplication(application());

  assert.equal(parsed.contractId, "community-review-application");
  assert.equal(parsed.contractVersion, "0.1.0");
  assert.equal(parsed.noticeVersion, "0.1.0");
  assert.equal(parsed.submittedLocale, "en");
  assert.equal(parsed.preferredReviewLocale, "zh-CN");
  assert.equal(parsed.contact.type, "email");
  assert.equal(parsed.contact.value, "Future.Reviewer@example.org");
  assert.equal(parsed.experienceSummary, undefined);
  assert.deepEqual(parsed.acknowledgements, acknowledgements);
});

test("accepts an optional bounded relevant experience summary", () => {
  const parsed = parseCommunityReviewApplication(application({
    experienceSummary: "I have reviewed synthetic tutoring examples.",
  }));

  assert.equal(parsed.experienceSummary, "I have reviewed synthetic tutoring examples.");
});

test("rejects an unsupported review locale", () => {
  assertInvalid(application({ preferredReviewLocale: "fr" }));
});

test("rejects unknown fields at the application and contact boundaries", () => {
  assertInvalid(application({ unexpected: "value" }));
  assertInvalid(application({
    contact: {
      type: "email",
      value: "future@example.org",
      reviewerId: "reviewer-a",
    },
  }));
});

test("rejects oversized motivation and experience text", () => {
  assertInvalid(application({
    motivation: "m".repeat(COMMUNITY_REVIEW_APPLICATION_MOTIVATION_MAX_LENGTH + 1),
  }));
  assertInvalid(application({
    experienceSummary: "e".repeat(COMMUNITY_REVIEW_APPLICATION_EXPERIENCE_MAX_LENGTH + 1),
  }));
});

test("rejects malformed or non-email contact values without normalizing them", () => {
  assertInvalid(application({
    contact: { type: "email", value: "future@localhost" },
  }));
  assertInvalid(application({
    contact: { type: "email", value: " future@example.org" },
  }));
  assertInvalid(application({
    contact: { type: "discord", value: "future@example.org" },
  }));
});

test("requires every application acknowledgement", () => {
  const incomplete = { ...acknowledgements } as Record<string, unknown>;
  delete incomplete.invitationDoesNotImplyQualification;
  assertInvalid(application({ acknowledgements: incomplete }));
});

test("keeps intake state parsing strict while resolving missing configuration closed", () => {
  assert.equal(COMMUNITY_REVIEW_APPLICATION_DEFAULT_INTAKE_STATE, "CLOSED");
  assert.deepEqual(COMMUNITY_REVIEW_APPLICATION_INTAKE_STATES, ["CLOSED", "OPEN", "PAUSED"]);
  assert.deepEqual(COMMUNITY_REVIEW_APPLICATION_AVAILABILITIES, [
    "occasional",
    "regular",
    "flexible",
  ]);
  assert.equal(parseCommunityReviewApplicationIntakeState("CLOSED"), "CLOSED");
  assert.equal(parseCommunityReviewApplicationIntakeState("OPEN"), "OPEN");
  assert.equal(parseCommunityReviewApplicationIntakeState("PAUSED"), "PAUSED");
  assert.equal(resolveCommunityReviewApplicationIntakeState(), "CLOSED");
  assert.equal(resolveCommunityReviewApplicationIntakeState(null), "CLOSED");
  assert.equal(resolveCommunityReviewApplicationIntakeState(""), "CLOSED");
  assert.equal(resolveCommunityReviewApplicationIntakeState(42), "CLOSED");
  assert.equal(isCommunityReviewApplicationIntakeOpen(), false);
  assert.equal(isCommunityReviewApplicationIntakeOpen("OPEN"), true);
  assertInvalidIntakeState("UNKNOWN");
});

function assertInvalidIntakeState(value: unknown): void {
  assert.throws(
    () => parseCommunityReviewApplicationIntakeState(value),
    (error: unknown) => error instanceof BenchmarkConfigurationError &&
      error.code === "community_review_application_invalid",
  );
}

test("application data cannot masquerade as reviewer evidence or qualification authority", () => {
  const parsed = parseCommunityReviewApplication(application());
  const serialized = JSON.stringify(parsed);

  assert.equal("reviewerId" in parsed, false);
  assert.equal("qualificationStatus" in parsed, false);
  assert.equal("consent" in parsed, false);
  assert.equal("assignmentId" in parsed, false);
  assert.doesNotMatch(serialized, /reviewerId|qualificationStatus|consent|assignmentId/iu);
  assertInvalid(application({ reviewerId: "reviewer-a" }));
  assertInvalid(application({ decision: "INVITED" }));
  assert.deepEqual(COMMUNITY_REVIEW_APPLICATION_DECISIONS, ["PENDING", "INVITED", "DECLINED"]);
  assert.equal(
    (COMMUNITY_REVIEW_APPLICATION_DECISIONS as readonly string[]).includes("QUALIFIED"),
    false,
  );
});
