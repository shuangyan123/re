import assert from "node:assert/strict";
import { test } from "node:test";

import {
  CommunityReviewApplicationService,
  CommunityReviewApplicationIntakeService,
  CommunityReviewService,
  CommunityReviewServiceError,
  InMemoryCommunityReviewRepository,
  StaticOperatorAuthorizer,
  SyntheticAuthenticationAdapter,
} from "../src/index.js";
import type {
  AuthenticatedPrincipal,
  AuthenticationContext,
} from "../src/index.js";

const operatorPrincipal = { provider: "example-oidc", subject: "operator-subject" } as const;
const reviewerPrincipal = { provider: "example-oidc", subject: "reviewer-subject" } as const;
const secondReviewerPrincipal = { provider: "example-oidc", subject: "second-reviewer-subject" } as const;

function context(
  principal: AuthenticatedPrincipal,
  channel: AuthenticationContext["channel"],
): AuthenticationContext {
  return { principal, channel };
}

function serviceError(code: CommunityReviewServiceError["code"]): (error: unknown) => boolean {
  return (error: unknown): boolean => error instanceof CommunityReviewServiceError && error.code === code;
}

interface InvitationHarness {
  readonly repository: InMemoryCommunityReviewRepository;
  readonly service: CommunityReviewService;
  readonly application: CommunityReviewApplicationService;
  readonly setNow: (value: string) => void;
}

function makeHarness(options: { readonly enabled?: boolean; readonly ttlMs?: number } = {}): InvitationHarness {
  const repository = new InMemoryCommunityReviewRepository();
  let now = "2026-09-10T00:00:00.000Z";
  let invitationSequence = 0;
  let credentialSequence = 0;
  let auditSequence = 0;
  const credentials = ["A", "B", "C", "D", "E", "F"].map((prefix) => `${prefix.repeat(43)}`);
  const service = new CommunityReviewService(repository, {
    clock: () => now,
    reviewerInvitationEnabled: options.enabled ?? true,
    reviewerInvitationTtlMs: options.ttlMs ?? 60_000,
    invitationIdGenerator: () => `invitation-${++invitationSequence}`,
    invitationSecretGenerator: () => credentials[credentialSequence++] ?? "Z".repeat(43),
    invitationAuditEventIdGenerator: () => `invitation-audit-${++auditSequence}`,
  });
  const authentication = new SyntheticAuthenticationAdapter({
    operator: context(operatorPrincipal, "operator"),
    reviewer: context(reviewerPrincipal, "reviewer"),
    secondReviewer: context(secondReviewerPrincipal, "reviewer"),
    operatorSubjectOnReviewerChannel: context(operatorPrincipal, "reviewer"),
  });
  const application = new CommunityReviewApplicationService(
    service,
    authentication,
    new StaticOperatorAuthorizer([operatorPrincipal]),
  );
  return {
    repository,
    service,
    application,
    setNow: (value: string): void => { now = value; },
  };
}

function applicationInput(): Record<string, unknown> {
  return {
    schemaVersion: 1,
    applicationKind: "community-review-application",
    contractId: "community-review-application",
    contractVersion: "0.1.0",
    noticeVersion: "0.1.0",
    submittedLocale: "en",
    preferredReviewLocale: "zh-CN",
    contact: { type: "email", value: "linked.applicant@example.invalid" },
    motivation: "Synthetic linked application.",
    experienceSummary: "Synthetic experience.",
    availability: "occasional",
    acknowledgements: {
      applicationNoticeAcknowledged: true,
      applicationDoesNotGuaranteeAcceptance: true,
      invitationDoesNotImplyQualification: true,
      qualificationRequiredBeforeReviewAssignments: true,
      publicIntakeFollowsLaunchGate: true,
    },
  };
}

test("reviewer invitations are disabled by default and trusted account registration does not issue one", async () => {
  const disabled = makeHarness({ enabled: false });
  await assert.rejects(
    disabled.application.issueReviewerInvitation({ authenticationInput: "operator" }),
    serviceError("reviewer_invitation_disabled"),
  );
  assert.equal(disabled.repository.snapshot().reviewerInvitations.length, 0);

  const enabled = makeHarness();
  const application = await enabled.service.registerReviewerAccount({
    internalId: "existing-internal",
    reviewerId: "existing-reviewer",
    privateAuthSubjectReference: "existing-auth-reference",
  });
  assert.equal(application.status, "ACTIVE");
  assert.equal(enabled.repository.snapshot().reviewerInvitations.length, 0);
});

test("application provenance is optional and only an active INVITED application can be linked", async () => {
  const harness = makeHarness();
  let applicationAuditSequence = 0;
  const intake = new CommunityReviewApplicationIntakeService(harness.repository, {
    intakeState: "OPEN",
    clock: () => "2026-09-10T00:00:00.000Z",
    applicationIdGenerator: () => "application-linked",
    withdrawalCredentialGenerator: () => "w".repeat(48),
    auditEventIdGenerator: () => `application-audit-linked-${++applicationAuditSequence}`,
  });
  const submitted = await intake.submitApplication({
    application: applicationInput(),
    idempotencyKey: "linked-application-key",
  });
  await assert.rejects(
    harness.application.issueReviewerInvitation({
      authenticationInput: "operator",
      applicationId: submitted.receipt.applicationId,
    }),
    serviceError("reviewer_invitation_application_invalid"),
  );
  await intake.recordDecision({ applicationId: submitted.receipt.applicationId, decision: "INVITED" });
  const issuance = await harness.application.issueReviewerInvitation({
    authenticationInput: "operator",
    applicationId: submitted.receipt.applicationId,
  });
  assert.equal(issuance.invitation.applicationId, submitted.receipt.applicationId);
  assert.doesNotMatch(JSON.stringify(harness.repository.snapshot().reviewerInvitations), /linked\.applicant|Synthetic/iu);
});

test("issuance is operator-only, redemption is reviewer-channel-only, and stores only a digest", async () => {
  const harness = makeHarness();
  const issuance = await harness.application.issueReviewerInvitation({ authenticationInput: "operator" });
  assert.match(issuance.credential, /^[A-Za-z0-9_-]{43}$/u);
  assert.equal(issuance.invitation.state, "ISSUED");

  const serializedBeforeRedemption = JSON.stringify(harness.repository.snapshot());
  assert.doesNotMatch(serializedBeforeRedemption, new RegExp(issuance.credential, "u"));
  assert.equal(harness.repository.snapshot().reviewerInvitations[0]?.secretDigest.startsWith("sha256:"), true);

  await assert.rejects(
    harness.application.issueReviewerInvitation({ authenticationInput: "reviewer" }),
    serviceError("operator_not_authorized"),
  );
  await assert.rejects(
    harness.application.issueReviewerInvitation({ authenticationInput: "operatorSubjectOnReviewerChannel" }),
    serviceError("operator_not_authorized"),
  );
  await assert.rejects(
    harness.application.redeemReviewerInvitation({
      authenticationInput: "operator",
      credential: issuance.credential,
    }),
    serviceError("reviewer_not_authorized"),
  );

  const account = await harness.application.redeemReviewerInvitation({
    authenticationInput: "reviewer",
    credential: issuance.credential,
  });
  assert.equal(account.status, "ACTIVE");
  assert.equal(account.consentState, "NOT_CONSENTED");
  assert.equal(account.privateAuthSubjectReference.includes("reviewer-subject"), false);
  assert.equal(harness.repository.snapshot().reviewerInvitations[0]?.state, "CONSUMED");
  assert.deepEqual(
    harness.repository.snapshot().reviewerInvitationAuditEvents.map((event) => event.eventType),
    ["issued", "consumed"],
  );
  await assert.rejects(
    harness.application.redeemReviewerInvitation({
      authenticationInput: "reviewer",
      credential: issuance.credential,
    }),
    serviceError("reviewer_invitation_not_redeemable"),
  );
});

test("existing principal redemption is an explicit conflict and does not duplicate the mapping", async () => {
  const harness = makeHarness();
  const existing = await harness.application.provisionReviewerAccount({
    authenticationInput: "operator",
    principal: reviewerPrincipal,
  });
  const issuance = await harness.application.issueReviewerInvitation({ authenticationInput: "operator" });
  await assert.rejects(
    harness.application.redeemReviewerInvitation({
      authenticationInput: "reviewer",
      credential: issuance.credential,
    }),
    serviceError("reviewer_invitation_conflict"),
  );
  const snapshot = harness.repository.snapshot();
  assert.equal(snapshot.reviewerAccounts.length, 1);
  assert.equal(snapshot.reviewerAuthIdentities.length, 1);
  assert.equal(snapshot.reviewerAccounts[0]?.reviewerId, existing.reviewerId);
  assert.equal(snapshot.reviewerInvitations[0]?.state, "ISSUED");
  assert.deepEqual(snapshot.reviewerInvitationAuditEvents.map((event) => event.eventType), ["issued"]);
});

test("invitation redemption races are atomic for the in-memory repository", async () => {
  const samePrincipal = makeHarness();
  const sameInvitation = await samePrincipal.application.issueReviewerInvitation({ authenticationInput: "operator" });
  const samePrincipalResults = await Promise.allSettled([
    samePrincipal.application.redeemReviewerInvitation({ authenticationInput: "reviewer", credential: sameInvitation.credential }),
    samePrincipal.application.redeemReviewerInvitation({ authenticationInput: "reviewer", credential: sameInvitation.credential }),
  ]);
  assert.equal(samePrincipalResults.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(samePrincipalResults.filter((result) => result.status === "rejected").length, 1);
  assert.equal(samePrincipal.repository.snapshot().reviewerAccounts.length, 1);
  assert.equal(samePrincipal.repository.snapshot().reviewerAuthIdentities.length, 1);
  assert.equal(samePrincipal.repository.snapshot().reviewerInvitations[0]?.state, "CONSUMED");

  const sameInvitationDifferentPrincipals = makeHarness();
  const shared = await sameInvitationDifferentPrincipals.application.issueReviewerInvitation({ authenticationInput: "operator" });
  const differentPrincipalResults = await Promise.allSettled([
    sameInvitationDifferentPrincipals.application.redeemReviewerInvitation({ authenticationInput: "reviewer", credential: shared.credential }),
    sameInvitationDifferentPrincipals.application.redeemReviewerInvitation({ authenticationInput: "secondReviewer", credential: shared.credential }),
  ]);
  assert.equal(differentPrincipalResults.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(sameInvitationDifferentPrincipals.repository.snapshot().reviewerAccounts.length, 1);
  assert.equal(sameInvitationDifferentPrincipals.repository.snapshot().reviewerAuthIdentities.length, 1);

  const samePrincipalDifferentInvitations = makeHarness();
  const first = await samePrincipalDifferentInvitations.application.issueReviewerInvitation({ authenticationInput: "operator" });
  const second = await samePrincipalDifferentInvitations.application.issueReviewerInvitation({ authenticationInput: "operator" });
  const differentInvitationResults = await Promise.allSettled([
    samePrincipalDifferentInvitations.application.redeemReviewerInvitation({ authenticationInput: "reviewer", credential: first.credential }),
    samePrincipalDifferentInvitations.application.redeemReviewerInvitation({ authenticationInput: "reviewer", credential: second.credential }),
  ]);
  assert.equal(differentInvitationResults.filter((result) => result.status === "fulfilled").length, 1);
  const finalSnapshot = samePrincipalDifferentInvitations.repository.snapshot();
  assert.equal(finalSnapshot.reviewerAccounts.length, 1);
  assert.equal(finalSnapshot.reviewerAuthIdentities.length, 1);
  assert.equal(finalSnapshot.reviewerInvitations.filter((invitation) => invitation.state === "CONSUMED").length, 1);
  assert.equal(finalSnapshot.reviewerInvitations.filter((invitation) => invitation.state === "ISSUED").length, 1);
});

test("invitation lifecycle is terminal and expiry is recorded without exposing the secret", async () => {
  const revoked = makeHarness();
  const revokedIssuance = await revoked.application.issueReviewerInvitation({ authenticationInput: "operator" });
  const revokedProjection = await revoked.application.revokeReviewerInvitation({
    authenticationInput: "operator",
    invitationId: revokedIssuance.invitation.invitationId,
  });
  assert.equal(revokedProjection.state, "REVOKED");
  assert.deepEqual(
    await revoked.application.revokeReviewerInvitation({
      authenticationInput: "operator",
      invitationId: revokedIssuance.invitation.invitationId,
    }),
    revokedProjection,
  );
  await assert.rejects(
    revoked.application.redeemReviewerInvitation({ authenticationInput: "reviewer", credential: revokedIssuance.credential }),
    serviceError("reviewer_invitation_not_redeemable"),
  );

  const expired = makeHarness({ ttlMs: 1_000 });
  const expiredIssuance = await expired.application.issueReviewerInvitation({ authenticationInput: "operator" });
  expired.setNow("2026-09-10T00:00:01.001Z");
  await assert.rejects(
    expired.application.redeemReviewerInvitation({ authenticationInput: "reviewer", credential: expiredIssuance.credential }),
    serviceError("reviewer_invitation_not_redeemable"),
  );
  const expiredSnapshot = expired.repository.snapshot();
  assert.equal(expiredSnapshot.reviewerInvitations[0]?.state, "EXPIRED");
  assert.deepEqual(expiredSnapshot.reviewerInvitationAuditEvents.map((event) => event.eventType), ["issued", "expired"]);
});
