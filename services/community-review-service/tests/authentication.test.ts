import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildCommunityReviewInstrumentIdentity,
  communityReviewAtomicIdentityKey,
  communityReviewFingerprint,
  createCommunityReviewBatch,
} from "../../../src/community-review/index.js";
import { parseCommunityReviewVisibleTask } from "../../../src/contracts/index.js";
import type {
  CommunityReviewAnnotation,
  CommunityReviewAssignment,
  CommunityReviewQualificationReceipt,
  CommunityReviewReviewerPacket,
  CommunityReviewVisibleTask,
} from "../../../src/contracts/community-review.js";
import {
  CommunityReviewApplicationService,
  CommunityReviewService,
  CommunityReviewServiceError,
  InMemoryCommunityReviewRepository,
  InMemoryQualificationMaterialStore,
  InMemoryReviewBatchMaterialStore,
  QUALIFICATION_PASS_RULE_ID,
  qualificationDefinitionFingerprint,
  StaticOperatorAuthorizer,
  SyntheticAuthenticationAdapter,
} from "../src/index.js";
import type {
  QualificationPrivateAnswer,
  QualificationVisibleItem,
} from "../src/index.js";

const syntheticFixture = {
  synthetic: true as const,
  notHumanCalibrationData: true as const,
  notCommunityReviewEvidence: true as const,
};

const policy = {
  policyId: "synthetic-reviewer-consent",
  policyVersion: "v1",
};

const tasks: CommunityReviewVisibleTask[] = [
  parseCommunityReviewVisibleTask({
    caseId: "auth-case",
    learningObjective: "Compare a tutor reply with visible learner needs.",
    studentProfile: "Synthetic learner at introductory level.",
    conversationHistory: "No earlier turns.",
    studentMessage: "Explain the next step.",
    problemContext: "A short synthetic practice problem.",
    rubrics: [{
      id: "reply-quality",
      criterion: "The reply should support the learner's next step.",
      requirements: [{ id: "req-action", description: "The reply gives a useful next action." }],
    }],
    tutorResponse: "The tutor explains one step and invites a quick check.",
  }),
];

const guideFingerprint = communityReviewFingerprint({ guideText: "Synthetic auth guide." });
const qualificationItems: QualificationVisibleItem[] = [{
  caseId: "auth-qualification-case",
  rubricId: "auth-qualification-rubric",
  requirementId: "auth-qualification-requirement",
  prompt: "Classify the synthetic qualification reply.",
}];
const qualificationAnswers: QualificationPrivateAnswer[] = qualificationItems.map((item) => ({
  caseId: item.caseId,
  rubricId: item.rubricId,
  requirementId: item.requirementId,
  status: "SATISFIED" as const,
}));
const rawBearerCredential = "Bearer eyJ.synthetic.jwt";

function clock(): () => string {
  let tick = 0;
  const start = Date.parse("2026-09-06T00:10:00.000Z");
  return () => new Date(start + tick++ * 1000).toISOString();
}

function serviceError(code: CommunityReviewServiceError["code"]): (error: unknown) => boolean {
  return (error: unknown): boolean => error instanceof CommunityReviewServiceError && error.code === code;
}

function annotations(packet: CommunityReviewReviewerPacket): CommunityReviewAnnotation[] {
  return packet.tasks.flatMap((task) => task.rubrics.flatMap((rubric) => rubric.requirements.map((requirement) => ({
    caseId: task.caseId,
    rubricId: rubric.id,
    requirementId: requirement.id,
    status: "SATISFIED" as const,
    evidence: "Synthetic reviewer observed the visible reply.",
  }))));
}

async function qualifyReviewer(
  service: CommunityReviewService,
  reviewerId: string,
  qualificationId: string,
  qualificationVersion: string,
  qualificationPoolId: string,
  qualificationPoolVersion: string,
  instrument: ReturnType<typeof buildCommunityReviewInstrumentIdentity>,
): Promise<CommunityReviewQualificationReceipt> {
  const issue = await service.createQualificationAttempt({
    reviewerId,
    qualificationId,
    qualificationVersion,
    poolId: qualificationPoolId,
    poolVersion: qualificationPoolVersion,
    instrumentFingerprint: instrument.fingerprint,
    reviewLocale: instrument.reviewLocale,
  });
  await service.submitQualificationAttempt({
    reviewerId,
    attemptId: issue.attemptId,
    attemptNonce: issue.attemptNonce,
    packetFingerprint: issue.packet.packetFingerprint,
    responses: issue.packet.items.map((item) => ({
      caseId: item.caseId,
      rubricId: item.rubricId,
      requirementId: item.requirementId,
      status: "SATISFIED" as const,
    })),
  });
  return (await service.issueQualificationReceipt({
    reviewerId,
    attemptId: issue.attemptId,
  })).receipt;
}

interface AuthenticatedSetup {
  readonly repository: InMemoryCommunityReviewRepository;
  readonly service: CommunityReviewService;
  readonly application: CommunityReviewApplicationService;
  readonly principals: {
    readonly operator: { readonly provider: string; readonly subject: string };
    readonly reviewerA: { readonly provider: string; readonly subject: string };
    readonly reviewerB: { readonly provider: string; readonly subject: string };
    readonly reviewerC: { readonly provider: string; readonly subject: string };
  };
  readonly accounts: {
    readonly reviewerA: Awaited<ReturnType<CommunityReviewService["getReviewerAccount"]>>;
    readonly reviewerB: Awaited<ReturnType<CommunityReviewService["getReviewerAccount"]>>;
    readonly reviewerC: Awaited<ReturnType<CommunityReviewService["getReviewerAccount"]>>;
  };
  readonly batchId: string;
  readonly assignments: readonly CommunityReviewAssignment[];
  readonly packets: readonly CommunityReviewReviewerPacket[];
  readonly receipts: readonly CommunityReviewQualificationReceipt[];
}

async function makeSetup(): Promise<AuthenticatedSetup> {
  const repository = new InMemoryCommunityReviewRepository();
  const materialStore = new InMemoryReviewBatchMaterialStore();
  const instrument = buildCommunityReviewInstrumentIdentity({
    guideFingerprint,
    canonicalLocale: "en",
    reviewLocale: "en",
  });
  const qualificationId = "synthetic-auth-qualification";
  const qualificationVersion = "v1";
  const qualificationPoolId = "synthetic-auth-pool";
  const qualificationPoolVersion = "v1";
  const definitionFingerprint = qualificationDefinitionFingerprint({
    qualificationId,
    qualificationVersion,
    qualificationPoolId,
    qualificationPoolVersion,
    instrumentId: instrument.instrumentId,
    instrumentVersion: instrument.instrumentVersion,
    instrumentFingerprint: instrument.fingerprint,
    reviewLocale: instrument.reviewLocale,
    passRuleId: QUALIFICATION_PASS_RULE_ID,
    items: qualificationItems,
  });
  const qualificationMaterialStore = new InMemoryQualificationMaterialStore();
  qualificationMaterialStore.register({
    identity: {
      qualificationId,
      qualificationVersion,
      qualificationPoolId,
      qualificationPoolVersion,
      qualificationDefinitionFingerprint: definitionFingerprint,
      instrumentId: instrument.instrumentId,
      instrumentVersion: instrument.instrumentVersion,
      instrumentFingerprint: instrument.fingerprint,
      reviewLocale: instrument.reviewLocale,
      sealedDefinitionReference: "synthetic://auth-definition",
      privateAnswerKeyReference: "synthetic://auth-answer-key",
    },
    visibleMaterial: {
      passRuleId: QUALIFICATION_PASS_RULE_ID,
      items: qualificationItems,
    },
    privateAnswerKey: { answers: qualificationAnswers },
  });
  const service = new CommunityReviewService(repository, {
    clock: clock(),
    consentPolicy: policy,
    qualificationMaterialStore,
    reviewBatchMaterialStore: materialStore,
  });
  const principals = {
    operator: { provider: "synthetic", subject: "operator-subject" },
    reviewerA: { provider: "synthetic", subject: "external-subject-a@example.test" },
    reviewerB: { provider: "synthetic", subject: "external-subject-b@example.test" },
    reviewerC: { provider: "synthetic", subject: "external-subject-c@example.test" },
  } as const;
  const authentication = new SyntheticAuthenticationAdapter({
    "operator-token": principals.operator,
    "reviewer-a-token": principals.reviewerA,
    "reviewer-b-token": principals.reviewerB,
    "reviewer-c-token": principals.reviewerC,
    "unprovisioned-token": { provider: "synthetic", subject: "unprovisioned-subject" },
    "mismatched-provider-token": { provider: "other-provider", subject: principals.reviewerA.subject },
    [rawBearerCredential]: principals.reviewerA,
    "Cookie session=synthetic-cookie": principals.reviewerA,
  });
  const operators = new StaticOperatorAuthorizer([principals.operator]);
  const application = new CommunityReviewApplicationService(service, authentication, operators);
  const accounts = {
    reviewerA: await application.provisionReviewerAccount({
      authenticationInput: "operator-token",
      principal: principals.reviewerA,
    }),
    reviewerB: await application.provisionReviewerAccount({
      authenticationInput: "operator-token",
      principal: principals.reviewerB,
    }),
    reviewerC: await application.provisionReviewerAccount({
      authenticationInput: "operator-token",
      principal: principals.reviewerC,
    }),
  };
  await application.recordConsent({ authenticationInput: "reviewer-a-token" });
  await application.recordConsent({ authenticationInput: "reviewer-b-token" });

  await service.registerQualificationPool({
    dataKind: "synthetic-fixture",
    fixture: syntheticFixture,
    qualificationId,
    qualificationVersion,
    poolId: qualificationPoolId,
    poolVersion: qualificationPoolVersion,
    definitionFingerprint,
    instrumentFingerprint: instrument.fingerprint,
    reviewLocale: instrument.reviewLocale,
    instrument,
    state: "DRAFT",
    sealedDefinitionReference: "synthetic://auth-definition",
    privateAnswerKeyReference: "synthetic://auth-answer-key",
  });
  await service.sealQualificationPool({
    poolId: qualificationPoolId,
    poolVersion: qualificationPoolVersion,
  });
  await service.activateQualificationPool({
    poolId: qualificationPoolId,
    poolVersion: qualificationPoolVersion,
  });
  const reviewerAccounts = [accounts.reviewerA, accounts.reviewerB, accounts.reviewerC];
  // Seed C's service-issued qualification through the legacy account
  // projection, then reset that projection so consent remains a separate
  // authority in the application assertions below.
  await repository.transaction((transaction) => {
    const account = transaction.getReviewerAccount(accounts.reviewerC.internalId);
    assert.ok(account);
    transaction.updateReviewerAccount({
      ...account,
      consentVersion: policy.policyVersion,
      consentState: "CONSENTED",
    });
  });
  const receipts: CommunityReviewQualificationReceipt[] = [];
  for (const account of reviewerAccounts) {
    receipts.push(await qualifyReviewer(
      service,
      account.reviewerId,
      qualificationId,
      qualificationVersion,
      qualificationPoolId,
      qualificationPoolVersion,
      instrument,
    ));
  }
  await repository.transaction((transaction) => {
    const account = transaction.getReviewerAccount(accounts.reviewerC.internalId);
    assert.ok(account);
    transaction.updateReviewerAccount({
      ...account,
      consentState: "NOT_CONSENTED",
    });
  });

  const batchId = "synthetic-auth-batch";
  const sealed = createCommunityReviewBatch({
    batchId,
    instrument,
    qualificationEligibility: {
      qualificationProtocolId: "community-review-qualification",
      qualificationProtocolVersion: "0.1.0",
      qualificationId,
      qualificationVersion,
      qualificationPoolId,
      qualificationPoolVersion,
      qualificationDefinitionFingerprint: definitionFingerprint,
    },
    sealedSourceFingerprint: communityReviewFingerprint({ source: "synthetic-auth-source" }),
    tasks,
    dataKind: "synthetic-fixture",
    fixture: syntheticFixture,
    batchPurpose: "pilot",
  });
  materialStore.register({
    manifest: sealed,
    sealedSourceReference: "synthetic://auth-source",
    tasks,
  });
  await application.createBatch({
    authenticationInput: "operator-token",
    manifest: sealed,
    sealedSourceReference: "synthetic://auth-source",
  });
  await application.openBatch({ authenticationInput: "operator-token", batchId });
  const assignedA = await application.assignReviewer({
    authenticationInput: "reviewer-a-token",
    batchId,
  });
  const assignedB = await application.assignReviewer({
    authenticationInput: "reviewer-b-token",
    batchId,
  });
  return {
    repository,
    service,
    application,
    principals,
    accounts: {
      reviewerA: await service.getReviewerAccount(accounts.reviewerA.reviewerId),
      reviewerB: await service.getReviewerAccount(accounts.reviewerB.reviewerId),
      reviewerC: await service.getReviewerAccount(accounts.reviewerC.reviewerId),
    },
    batchId,
    assignments: [assignedA.assignment, assignedB.assignment],
    packets: [assignedA.packet, assignedB.packet],
    receipts,
  };
}

test("same authenticated subject resolves to one stable service-issued opaque account", async () => {
  const setup = await makeSetup();
  const first = setup.accounts.reviewerA;
  const second = await setup.service.provisionReviewerAccount({ principal: setup.principals.reviewerA });
  const identity = await setup.service.getReviewerAuthIdentity({ principal: setup.principals.reviewerA });
  assert.equal(second.reviewerId, first.reviewerId);
  assert.equal(identity?.reviewerId, first.reviewerId);
  assert.notEqual(first.reviewerId, setup.principals.reviewerA.subject);
  assert.doesNotMatch(first.reviewerId, /@|synthetic|external|subject|provider/iu);
});

test("different authenticated subjects receive different mappings and auth-pair uniqueness is enforced", async () => {
  const setup = await makeSetup();
  assert.notEqual(setup.accounts.reviewerA.reviewerId, setup.accounts.reviewerB.reviewerId);
  const identityA = await setup.service.getReviewerAuthIdentity({ principal: setup.principals.reviewerA });
  const identityB = await setup.service.getReviewerAuthIdentity({ principal: setup.principals.reviewerB });
  assert.notEqual(identityA?.authIdentityId, identityB?.authIdentityId);
  assert.notEqual(identityA?.authSubject, identityB?.authSubject);
  const legacyAccount = await setup.service.registerReviewerAccount({
    internalId: "legacy-auth-collision-account",
    reviewerId: "legacy-auth-collision-reviewer",
    privateAuthSubjectReference: "legacy-auth-collision-identity",
  });
  await assert.rejects(
    setup.repository.transaction((transaction) => transaction.insertReviewerAuthIdentity({
      authIdentityId: legacyAccount.privateAuthSubjectReference,
      internalId: legacyAccount.internalId,
      reviewerId: legacyAccount.reviewerId,
      authProvider: setup.principals.reviewerA.provider,
      authSubject: setup.principals.reviewerA.subject,
      createdAt: "2026-09-06T00:20:00.000Z",
    })),
    serviceError("repository_conflict"),
  );
});

test("an operator can link a new private principal to an existing P4-A account without rotating its opaque ID", async () => {
  const repository = new InMemoryCommunityReviewRepository();
  const service = new CommunityReviewService(repository, { clock: clock(), consentPolicy: policy });
  const account = await service.registerReviewerAccount({
    internalId: "legacy-internal-account",
    reviewerId: "legacy-opaque-reviewer",
    privateAuthSubjectReference: "legacy-private-reference",
  });
  const identity = await service.linkReviewerAuthIdentity({
    reviewerId: account.reviewerId,
    principal: { provider: "synthetic", subject: "migrated-subject" },
  });
  assert.equal(identity.reviewerId, account.reviewerId);
  assert.equal((await service.resolveAuthenticatedReviewer({
    principal: { provider: "synthetic", subject: "migrated-subject" },
  })).reviewerId, account.reviewerId);
  assert.notEqual((await service.getReviewerAccount(account.reviewerId)).privateAuthSubjectReference, "legacy-private-reference");
});

test("authentication, consent, and qualification remain separate authorities", async () => {
  const setup = await makeSetup();
  const current = await setup.application.getCurrentConsent({ authenticationInput: "reviewer-c-token" });
  assert.equal(current.state, "NOT_CONSENTED");
  await assert.rejects(
    setup.application.assignReviewer({
      authenticationInput: "reviewer-c-token",
      batchId: setup.batchId,
    }),
    serviceError("consent_required"),
  );
  const storedReceipt = await setup.repository.transaction((transaction) =>
    transaction.getQualificationReceipt(setup.receipts[2]!.receiptFingerprint));
  assert.equal(storedReceipt?.authorityState, "authoritative");
});

test("consent for another policy cannot satisfy the active review policy", async () => {
  const setup = await makeSetup();
  await assert.rejects(
    setup.application.recordConsent({
      authenticationInput: "reviewer-c-token",
      policyId: "different-policy",
      policyVersion: policy.policyVersion,
    }),
    serviceError("consent_stale"),
  );
  assert.equal(
    (await setup.application.getCurrentConsent({ authenticationInput: "reviewer-c-token" })).state,
    "NOT_CONSENTED",
  );
  await assert.rejects(
    setup.application.assignReviewer({
      authenticationInput: "reviewer-c-token",
      batchId: setup.batchId,
    }),
    serviceError("consent_required"),
  );
});

test("consent operations are idempotent, append-only, and timestamped by the service", async () => {
  const setup = await makeSetup();
  const first = await setup.application.getCurrentConsent({ authenticationInput: "reviewer-a-token" });
  const repeated = await setup.application.recordConsent({
    authenticationInput: "reviewer-a-token",
    acceptedAt: "1900-01-01T00:00:00.000Z",
  } as never);
  assert.equal(repeated.consentEventId, first.consentEventId);
  const acceptedHistory = await setup.repository.transaction((transaction) =>
    transaction.listReviewerConsentHistory(
      setup.accounts.reviewerA.internalId,
      policy.policyId,
      policy.policyVersion,
    ));
  assert.equal(acceptedHistory.length, 1);
  assert.notEqual(acceptedHistory[0]?.acceptedAt, "1900-01-01T00:00:00.000Z");

  const revoked = await setup.application.revokeConsent({ authenticationInput: "reviewer-a-token" });
  const repeatedRevocation = await setup.application.revokeConsent({ authenticationInput: "reviewer-a-token" });
  assert.equal(repeatedRevocation.consentEventId, revoked.consentEventId);
  const history = await setup.repository.transaction((transaction) =>
    transaction.listReviewerConsentHistory(
      setup.accounts.reviewerA.internalId,
      policy.policyId,
      policy.policyVersion,
    ));
  assert.deepEqual(history.map((event) => event.state), ["ACCEPTED", "REVOKED"]);
  assert.equal(history[1]?.acceptedAt, undefined);
  assert.equal(typeof history[1]?.revokedAt, "string");
});

test("revoked consent, stale consent, withdrawn accounts, and disabled accounts fail closed", async () => {
  const setup = await makeSetup();
  await setup.application.revokeConsent({ authenticationInput: "reviewer-a-token" });
  await assert.rejects(
    setup.application.getReviewerPacket({
      authenticationInput: "reviewer-a-token",
      assignmentId: setup.assignments[0]!.assignmentId,
    }),
    serviceError("consent_revoked"),
  );

  await setup.service.recordConsent({
    reviewerId: setup.accounts.reviewerC.reviewerId,
    policyId: policy.policyId,
    policyVersion: "v0",
  });
  await assert.rejects(
    setup.application.assignReviewer({
      authenticationInput: "reviewer-c-token",
      batchId: setup.batchId,
    }),
    serviceError("consent_stale"),
  );

  await setup.application.withdrawReviewerAccount({ authenticationInput: "reviewer-b-token" });
  await assert.rejects(
    setup.application.getReviewerPacket({
      authenticationInput: "reviewer-b-token",
      assignmentId: setup.assignments[1]!.assignmentId,
    }),
    serviceError("reviewer_account_withdrawn"),
  );

  await setup.application.disableReviewerAccount({
    authenticationInput: "operator-token",
    reviewerId: setup.accounts.reviewerA.reviewerId,
  });
  await assert.rejects(
    setup.application.getReviewerPacket({
      authenticationInput: "reviewer-a-token",
      assignmentId: setup.assignments[0]!.assignmentId,
    }),
    serviceError("reviewer_account_disabled"),
  );
});

test("reviewer-owned reads and writes derive ownership from auth, ignoring forged reviewer IDs", async () => {
  const setup = await makeSetup();
  await assert.rejects(
    setup.application.getReviewerPacket({
      authenticationInput: "reviewer-a-token",
      assignmentId: setup.assignments[1]!.assignmentId,
      reviewerId: setup.accounts.reviewerB.reviewerId,
    } as never),
    serviceError("reviewer_not_authorized"),
  );
  await assert.rejects(
    setup.application.submitReview({
      authenticationInput: "reviewer-a-token",
      batchId: setup.batchId,
      assignmentId: setup.assignments[1]!.assignmentId,
      annotations: annotations(setup.packets[1]!),
      reviewerId: setup.accounts.reviewerB.reviewerId,
    } as never),
    serviceError("reviewer_not_authorized"),
  );
  const assignment = await setup.application.assignReviewer({
      authenticationInput: "reviewer-a-token",
      batchId: setup.batchId,
      reviewerId: setup.accounts.reviewerB.reviewerId,
    } as never);
  assert.equal(assignment.assignment.reviewerId, setup.accounts.reviewerA.reviewerId);
});

test("unauthenticated, unknown, and provider-mismatched principals are rejected before reviewer lookup", async () => {
  const setup = await makeSetup();
  await assert.rejects(
    setup.application.getReviewerPacket({
      authenticationInput: undefined,
      assignmentId: setup.assignments[0]!.assignmentId,
    }),
    serviceError("authentication_required"),
  );
  await assert.rejects(
    setup.application.getReviewerPacket({
      authenticationInput: "unprovisioned-token",
      assignmentId: setup.assignments[0]!.assignmentId,
    }),
    serviceError("authentication_subject_not_found"),
  );
  await assert.rejects(
    setup.application.getReviewerPacket({
      authenticationInput: "mismatched-provider-token",
      assignmentId: setup.assignments[0]!.assignmentId,
    }),
    serviceError("authentication_subject_not_found"),
  );
});

test("reviewers cannot invoke operator lifecycle actions", async () => {
  const setup = await makeSetup();
  const before = await setup.repository.transaction((transaction) => transaction.getBatch(setup.batchId));
  await assert.rejects(
    setup.application.closeBatch({ authenticationInput: "reviewer-a-token", batchId: setup.batchId }),
    serviceError("operator_not_authorized"),
  );
  const after = await setup.repository.transaction((transaction) => transaction.getBatch(setup.batchId));
  assert.deepEqual(after, before);
});

test("sensitive authentication input is reduced to private mapping metadata and never enters P3 responses", async () => {
  const setup = await makeSetup();
  const rawCookie = "session=synthetic-cookie";
  const rawClaims = { sub: "synthetic-private-claim", email: "synthetic@example.test" };
  const packet = await setup.application.getReviewerPacket({
    authenticationInput: rawBearerCredential,
    assignmentId: setup.assignments[0]!.assignmentId,
  });
  await setup.application.getCurrentConsent({ authenticationInput: "Cookie session=synthetic-cookie" });
  const identity = await setup.service.getReviewerAuthIdentity({ principal: setup.principals.reviewerA });
  const audit = await setup.repository.transaction((transaction) => transaction.listAuthAuditEvents());
  const persistedAndReturned = JSON.stringify({ identity, audit, packet });
  assert.doesNotMatch(persistedAndReturned, /Bearer|eyJ|session=|synthetic-cookie|private-claim|rawClaims/iu);
  assert.doesNotMatch(persistedAndReturned, /groundTruth|knownMisconception|answerKey|judgeResult/iu);
  assert.equal(rawBearerCredential.includes("Bearer"), true);
  assert.equal(rawCookie.includes("session="), true);
  assert.equal(typeof rawClaims.sub, "string");
});

test("failed authentication/authorization leaves accepted domain state unchanged", async () => {
  const setup = await makeSetup();
  const before = await setup.repository.transaction((transaction) => ({
    submissions: transaction.listAcceptedSubmissions(setup.batchId),
    assignment: transaction.getAssignment(setup.assignments[1]!.assignmentId),
  }));
  await assert.rejects(
    setup.application.submitReview({
      authenticationInput: "reviewer-a-token",
      batchId: setup.batchId,
      assignmentId: setup.assignments[1]!.assignmentId,
      annotations: annotations(setup.packets[1]!),
    }),
    serviceError("reviewer_not_authorized"),
  );
  await assert.rejects(
    setup.application.submitReview({
      authenticationInput: "unprovisioned-token",
      batchId: setup.batchId,
      assignmentId: setup.assignments[0]!.assignmentId,
      annotations: annotations(setup.packets[0]!),
    }),
    serviceError("authentication_subject_not_found"),
  );
  const after = await setup.repository.transaction((transaction) => ({
    submissions: transaction.listAcceptedSubmissions(setup.batchId),
    assignment: transaction.getAssignment(setup.assignments[1]!.assignmentId),
  }));
  assert.deepEqual(after, before);
});

test("auth mapping does not alter P3 fingerprints or positive-allowlist packet identity", async () => {
  const setup = await makeSetup();
  const before = {
    receiptFingerprint: setup.receipts[0]!.receiptFingerprint,
    assignmentFingerprint: setup.assignments[0]!.assignmentFingerprint,
    packetFingerprint: setup.packets[0]!.packetFingerprint,
  };
  await setup.service.provisionReviewerAccount({ principal: setup.principals.reviewerA });
  const packet = await setup.application.getReviewerPacket({
    authenticationInput: "reviewer-a-token",
    assignmentId: setup.assignments[0]!.assignmentId,
  });
  assert.deepEqual({
    receiptFingerprint: setup.receipts[0]!.receiptFingerprint,
    assignmentFingerprint: setup.assignments[0]!.assignmentFingerprint,
    packetFingerprint: packet.packetFingerprint,
  }, before);
  assert.equal(communityReviewAtomicIdentityKey({
    caseId: "auth-case",
    rubricId: "reply-quality",
    requirementId: "req-action",
  }), "[\"auth-case\",\"reply-quality\",\"req-action\"]");
});
