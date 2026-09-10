import type { IncomingMessage } from "node:http";

import type { CommunityReviewApplicationService } from "./application.js";
import type { CommunityReviewApplicationIntakeApplicationService } from "./application-intake.js";
import type { AuthenticatedPrincipal } from "./authentication.js";
import type { CommunityReviewLogLevel } from "./config.js";
import {
  CommunityReviewServiceError,
  type CommunityReviewServiceErrorCode,
} from "./errors.js";
import type { ReviewerAccountRecord } from "./persistence.js";
import type {
  ReviewerInvitationIssuance,
  ReviewerInvitationProjection,
} from "./service.js";
import {
  evaluateApplicationCors,
  resolveClientNetworkAddress,
  type CommunityReviewApplicationCorsPolicy,
  type CommunityReviewTrustedProxyNetwork,
} from "./public-exposure.js";

export interface CommunityReviewHttpRouteResult {
  readonly status: number;
  readonly body: Record<string, unknown>;
  readonly level?: CommunityReviewLogLevel;
  readonly headers?: Readonly<Record<string, string>>;
}

class CommunityReviewHttpRequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(code);
    this.name = "CommunityReviewHttpRequestError";
  }
}

type JsonObject = Record<string, unknown>;

type RouteHandler = (match: RegExpExecArray) => Promise<unknown>;

interface RouteDefinition {
  readonly method: string;
  readonly pattern: RegExp;
  readonly handler: RouteHandler;
}

export interface CommunityReviewHttpRequestOptions {
  readonly trustedProxyNetworks: readonly CommunityReviewTrustedProxyNetwork[];
  readonly applicationCors: CommunityReviewApplicationCorsPolicy;
}

const opaquePathId = "([A-Za-z0-9][A-Za-z0-9._-]{0,79})";

function record(value: unknown): JsonObject | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as JsonObject
    : undefined;
}

function requiredString(value: JsonObject, key: string): string {
  const raw = value[key];
  if (typeof raw !== "string" || raw.length === 0 || raw.includes("\u0000")) {
    throw new CommunityReviewHttpRequestError(400, "invalid_request");
  }
  return raw;
}

function optionalString(value: JsonObject, key: string): string | undefined {
  const raw = value[key];
  if (raw === undefined) return undefined;
  if (typeof raw !== "string" || raw.length === 0 || raw.includes("\u0000")) {
    throw new CommunityReviewHttpRequestError(400, "invalid_request");
  }
  return raw;
}

function requiredArray(value: JsonObject, key: string): readonly unknown[] {
  const raw = value[key];
  if (!Array.isArray(raw)) throw new CommunityReviewHttpRequestError(400, "invalid_request");
  return raw;
}

function assertAllowedKeys(value: JsonObject, allowed: readonly string[]): void {
  const keys = new Set(allowed);
  if (Object.keys(value).some((key) => !keys.has(key))) {
    throw new CommunityReviewHttpRequestError(400, "invalid_request");
  }
}

function requiredPrincipal(value: JsonObject, key: string): AuthenticatedPrincipal {
  const principal = record(value[key]);
  if (principal === undefined) throw new CommunityReviewHttpRequestError(400, "invalid_request");
  assertAllowedKeys(principal, ["provider", "subject"]);
  return {
    provider: requiredString(principal, "provider"),
    subject: requiredString(principal, "subject"),
  };
}

function contentTypeIsJson(request: IncomingMessage): boolean {
  const header = request.headers["content-type"];
  if (typeof header !== "string") return false;
  return /^application\/json(?:\s*;|$)/iu.test(header);
}

async function readJsonObject(request: IncomingMessage, limitBytes: number): Promise<JsonObject> {
  if (!contentTypeIsJson(request)) {
    request.resume();
    throw new CommunityReviewHttpRequestError(415, "unsupported_media_type");
  }
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array);
    total += buffer.byteLength;
    if (total > limitBytes) {
      request.resume();
      throw new CommunityReviewHttpRequestError(413, "request_too_large");
    }
    chunks.push(buffer);
  }
  if (total === 0) throw new CommunityReviewHttpRequestError(400, "invalid_request");
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.concat(chunks, total).toString("utf8"));
  } catch {
    throw new CommunityReviewHttpRequestError(400, "invalid_json");
  }
  const value = record(parsed);
  if (value === undefined) throw new CommunityReviewHttpRequestError(400, "invalid_request");
  return value;
}

function safeReviewerAccount(account: ReviewerAccountRecord): Record<string, unknown> {
  return {
    reviewerId: account.reviewerId,
    status: account.status,
    consentVersion: account.consentVersion,
    consentState: account.consentState,
    createdAt: account.createdAt,
    updatedAt: account.updatedAt,
  };
}

function safeReviewerInvitation(invitation: ReviewerInvitationProjection): Record<string, unknown> {
  return {
    invitationId: invitation.invitationId,
    ...(invitation.applicationId === undefined ? {} : { applicationId: invitation.applicationId }),
    state: invitation.state,
    issuedAt: invitation.issuedAt,
    expiresAt: invitation.expiresAt,
    ...(invitation.consumedAt === undefined ? {} : { consumedAt: invitation.consumedAt }),
    ...(invitation.revokedAt === undefined ? {} : { revokedAt: invitation.revokedAt }),
    ...(invitation.expiredAt === undefined ? {} : { expiredAt: invitation.expiredAt }),
  };
}

function safeReviewerInvitationIssuance(value: ReviewerInvitationIssuance): Record<string, unknown> {
  return {
    invitation: safeReviewerInvitation(value.invitation),
    // The raw capability is returned only by issuance and is never logged or persisted.
    credential: value.credential,
  };
}

function serviceStatus(code: CommunityReviewServiceErrorCode): number {
  switch (code) {
    case "authentication_required":
    case "authentication_failed":
      return 401;
    case "application_intake_closed":
    case "application_intake_paused":
    case "application_not_active":
    case "application_decision_conflict":
      return 409;
    case "reviewer_invitation_disabled":
      return 503;
    case "reviewer_invitation_application_invalid":
    case "reviewer_invitation_not_redeemable":
    case "reviewer_invitation_conflict":
      return 409;
    case "application_rate_limited":
      return 429;
    case "authentication_subject_not_found":
    case "operator_not_authorized":
    case "reviewer_not_authorized":
    case "reviewer_access_not_enabled":
    case "reviewer_account_withdrawn":
    case "reviewer_account_disabled":
    case "consent_required":
    case "consent_revoked":
    case "consent_stale":
    case "qualification_attempt_not_owner":
    case "qualification_not_qualified":
      return 403;
    case "reviewer_not_found":
    case "application_not_found":
    case "application_withdrawal_not_authorized":
    case "qualification_pool_not_found":
    case "qualification_material_not_found":
    case "qualification_attempt_not_found":
    case "review_batch_material_not_found":
    case "batch_not_found":
    case "frozen_pool_not_found":
    case "agreement_evidence_not_found":
    case "disclosure_not_found":
    case "assignment_not_found":
    case "reviewer_invitation_not_found":
      return 404;
    case "qualification_pool_not_active":
    case "qualification_pool_invalid_state":
    case "qualification_attempt_already_submitted":
    case "qualification_attempt_limit":
    case "qualification_receipt_not_issued":
    case "qualification_receipt_not_authoritative":
    case "no_eligible_review_batch":
    case "batch_not_open":
    case "batch_not_closed":
    case "batch_not_frozen":
    case "assignment_withdrawn":
    case "duplicate_assignment":
    case "submission_already_exists":
    case "replacement_submission":
    case "application_idempotency_conflict":
    case "repository_conflict":
      return 409;
    case "qualification_material_invalid":
    case "qualification_packet_invalid":
    case "qualification_response_invalid":
    case "qualification_receipt_invalid":
    case "review_batch_material_invalid":
    case "disclosure_policy_invalid":
    case "disclosure_not_public":
    case "application_contract_invalid":
    case "application_idempotency_required":
    case "application_idempotency_invalid":
    case "application_decision_invalid":
    case "application_retention_invalid":
      return 400;
    case "invalid_service_record":
      return 500;
  }
}

function failure(error: unknown): CommunityReviewHttpRouteResult {
  if (error instanceof CommunityReviewHttpRequestError) {
    return {
      status: error.status,
      level: error.status >= 500 ? "error" : "warn",
      body: { error: error.code, reasonCodes: [error.code] },
    };
  }
  if (error instanceof CommunityReviewServiceError) {
    const status = serviceStatus(error.code);
    if (status === 500) {
      return {
        status,
        level: "error",
        body: { error: "internal_error", reasonCodes: [error.code] },
      };
    }
    return {
      status,
      level: status >= 500 ? "error" : "warn",
      body: { error: error.code, reasonCodes: [error.code] },
    };
  }
  return {
    status: 500,
    level: "error",
    body: { error: "internal_error", reasonCodes: ["internal_error"] },
  };
}

function success(data: unknown, status = 200): CommunityReviewHttpRouteResult {
  return { status, body: { data } };
}

/**
 * Private HTTP transport. The future application route is independently
 * state-gated; reviewer/campaign routes remain authenticated and this layer
 * does not create public signup, bypass reviewer ownership, or expose
 * disclosure/publication operations.
 */
export async function handleCommunityReviewApiRequest(
  application: CommunityReviewApplicationService,
  applicationIntake: CommunityReviewApplicationIntakeApplicationService,
  request: IncomingMessage,
  route: string,
  bodyLimitBytes: number,
  options: CommunityReviewHttpRequestOptions = {
    trustedProxyNetworks: [],
    applicationCors: { allowedOrigins: [], maxAgeSeconds: 300 },
  },
): Promise<CommunityReviewHttpRouteResult | undefined> {
  if (!route.startsWith("/v1/")) return undefined;
  const cors = evaluateApplicationCors(request, route, options.applicationCors);
  if (cors.kind === "reject") {
    request.resume();
    return failure(new CommunityReviewHttpRequestError(403, cors.code));
  }
  if (cors.kind === "preflight") {
    request.resume();
    return { status: 204, level: "info", headers: cors.headers, body: {} };
  }
  const corsHeaders = cors.kind === "allow" ? cors.headers : undefined;
  const authenticationInput = request.headers.authorization;
  const body = (): Promise<JsonObject> => readJsonObject(request, bodyLimitBytes);
  const idempotencyKey = (): string => {
    const value = request.headers["idempotency-key"];
    if (value === undefined) {
      request.resume();
      throw new CommunityReviewHttpRequestError(400, "application_idempotency_required");
    }
    if (Array.isArray(value) || value.length === 0) {
      request.resume();
      throw new CommunityReviewHttpRequestError(400, "application_idempotency_invalid");
    }
    return value;
  };
  const sourceKey = resolveClientNetworkAddress(request, options.trustedProxyNetworks);

  const routes: readonly RouteDefinition[] = [
    {
      method: "POST",
      pattern: /^\/v1\/applications$/u,
      handler: async () => {
        if (applicationIntake.getApplicationIntakeState() === "CLOSED") {
          request.resume();
          throw new CommunityReviewServiceError("application_intake_closed");
        }
        if (applicationIntake.getApplicationIntakeState() === "PAUSED") {
          request.resume();
          throw new CommunityReviewServiceError("application_intake_paused");
        }
        const key = idempotencyKey();
        const submitted = await applicationIntake.submitApplication({
          application: await body(),
          idempotencyKey: key,
          sourceKey,
        });
        return submitted.receipt;
      },
    },
    {
      method: "POST",
      pattern: new RegExp(`^/v1/applications/${opaquePathId}/withdraw$`, "u"),
      handler: async (match) => {
        const input = await body();
        assertAllowedKeys(input, ["credential"]);
        return applicationIntake.withdrawApplication({
          applicationId: match[1]!,
          withdrawalCredential: requiredString(input, "credential"),
        });
      },
    },
    {
      method: "GET",
      pattern: /^\/v1\/operator\/applications$/u,
      handler: async () => applicationIntake.listPendingApplications({ authenticationInput }),
    },
    {
      method: "GET",
      pattern: new RegExp(`^/v1/operator/applications/${opaquePathId}$`, "u"),
      handler: async (match) => applicationIntake.getApplicationForOperator({
        authenticationInput,
        applicationId: match[1]!,
      }),
    },
    {
      method: "POST",
      pattern: new RegExp(`^/v1/operator/applications/${opaquePathId}/decision$`, "u"),
      handler: async (match) => {
        const input = await body();
        assertAllowedKeys(input, ["decision"]);
        const decision = requiredString(input, "decision");
        if (decision !== "INVITED" && decision !== "DECLINED") {
          throw new CommunityReviewHttpRequestError(400, "application_decision_invalid");
        }
        return applicationIntake.recordDecision({
          authenticationInput,
          applicationId: match[1]!,
          decision,
        });
      },
    },
    {
      method: "POST",
      pattern: /^\/v1\/operator\/applications\/purge$/u,
      handler: async () => applicationIntake.purgeExpired({ authenticationInput }),
    },
    {
      method: "GET",
      pattern: /^\/v1\/reviewer\/session$/u,
      handler: async () => application.getReviewerPortalSession({ authenticationInput }),
    },
    {
      method: "GET",
      pattern: /^\/v1\/reviewer\/consent$/u,
      handler: async () => application.getCurrentConsent({ authenticationInput }),
    },
    {
      method: "PUT",
      pattern: /^\/v1\/reviewer\/consent$/u,
      handler: async () => application.recordConsent({ authenticationInput }),
    },
    {
      method: "POST",
      pattern: /^\/v1\/reviewer\/invitations\/redeem$/u,
      handler: async () => {
        const input = await body();
        assertAllowedKeys(input, ["credential"]);
        return safeReviewerAccount(await application.redeemReviewerInvitation({
          authenticationInput,
          credential: requiredString(input, "credential"),
        }));
      },
    },
    {
      method: "DELETE",
      pattern: /^\/v1\/reviewer\/consent$/u,
      handler: async () => application.revokeConsent({ authenticationInput }),
    },
    {
      method: "POST",
      pattern: /^\/v1\/reviewer\/account\/withdraw$/u,
      handler: async () => safeReviewerAccount(await application.withdrawReviewerAccount({ authenticationInput })),
    },
    {
      method: "POST",
      pattern: /^\/v1\/reviewer\/qualification-attempts$/u,
      handler: async () => {
        const input = await body();
        assertAllowedKeys(input, [
          "qualificationId",
          "qualificationVersion",
          "poolId",
          "poolVersion",
          "instrumentFingerprint",
          "reviewLocale",
        ]);
        return application.createQualificationAttempt({
          authenticationInput,
          qualificationId: requiredString(input, "qualificationId"),
          qualificationVersion: requiredString(input, "qualificationVersion"),
          poolId: requiredString(input, "poolId"),
          poolVersion: requiredString(input, "poolVersion"),
          instrumentFingerprint: requiredString(input, "instrumentFingerprint"),
          reviewLocale: requiredString(input, "reviewLocale"),
        });
      },
    },
    {
      method: "GET",
      pattern: new RegExp(`^/v1/reviewer/qualification-attempts/${opaquePathId}$`, "u"),
      handler: async (match) => application.getQualificationAttempt({
        authenticationInput,
        attemptId: match[1]!,
      }),
    },
    {
      method: "GET",
      pattern: new RegExp(`^/v1/reviewer/qualification-attempts/${opaquePathId}/packet$`, "u"),
      handler: async (match) => application.getQualificationPacket({
        authenticationInput,
        attemptId: match[1]!,
      }),
    },
    {
      method: "POST",
      pattern: new RegExp(`^/v1/reviewer/qualification-attempts/${opaquePathId}/submission$`, "u"),
      handler: async (match) => {
        const input = await body();
        assertAllowedKeys(input, ["attemptNonce", "packetFingerprint", "responses"]);
        return application.submitQualificationAttempt({
          authenticationInput,
          attemptId: match[1]!,
          attemptNonce: requiredString(input, "attemptNonce"),
          packetFingerprint: requiredString(input, "packetFingerprint"),
          responses: requiredArray(input, "responses"),
        });
      },
    },
    {
      method: "POST",
      pattern: new RegExp(`^/v1/reviewer/qualification-attempts/${opaquePathId}/receipt$`, "u"),
      handler: async (match) => application.issueQualificationReceipt({
        authenticationInput,
        attemptId: match[1]!,
      }),
    },
    {
      method: "GET",
      pattern: new RegExp(`^/v1/reviewer/qualification-attempts/${opaquePathId}/receipt$`, "u"),
      handler: async (match) => application.getQualificationReceipt({
        authenticationInput,
        attemptId: match[1]!,
      }),
    },
    {
      method: "POST",
      pattern: /^\/v1\/reviewer\/assignments$/u,
      handler: async () => {
        const input = await body();
        assertAllowedKeys(input, ["batchId"]);
        const batchId = optionalString(input, "batchId");
        return application.getOrCreateOwnEligibleAssignment({
          authenticationInput,
          ...(batchId === undefined ? {} : { batchId }),
        });
      },
    },
    {
      method: "GET",
      pattern: new RegExp(`^/v1/reviewer/assignments/${opaquePathId}/packet$`, "u"),
      handler: async (match) => application.getReviewerPacket({
        authenticationInput,
        assignmentId: match[1]!,
      }),
    },
    {
      method: "PUT",
      pattern: new RegExp(`^/v1/reviewer/batches/${opaquePathId}/assignments/${opaquePathId}/submission$`, "u"),
      handler: async (match) => {
        const input = await body();
        assertAllowedKeys(input, ["packetFingerprint", "annotations"]);
        const packetFingerprint = optionalString(input, "packetFingerprint");
        return application.submitOwnAssignment({
          authenticationInput,
          batchId: match[1]!,
          assignmentId: match[2]!,
          ...(packetFingerprint === undefined ? {} : { packetFingerprint }),
          annotations: requiredArray(input, "annotations"),
        });
      },
    },
    {
      method: "GET",
      pattern: new RegExp(`^/v1/reviewer/batches/${opaquePathId}/assignments/${opaquePathId}/submission$`, "u"),
      handler: async (match) => {
        const submission = await application.getOwnSubmission({
          authenticationInput,
          batchId: match[1]!,
          assignmentId: match[2]!,
        });
        if (submission === undefined) throw new CommunityReviewHttpRequestError(404, "submission_not_found");
        return submission;
      },
    },
    {
      method: "DELETE",
      pattern: new RegExp(`^/v1/reviewer/batches/${opaquePathId}/assignments/${opaquePathId}$`, "u"),
      handler: async (match) => application.withdrawAssignment({
        authenticationInput,
        batchId: match[1]!,
        assignmentId: match[2]!,
      }),
    },
    {
      method: "POST",
      pattern: /^\/v1\/operator\/reviewers$/u,
      handler: async () => {
        const input = await body();
        assertAllowedKeys(input, ["principal"]);
        const account = await application.provisionReviewerAccount({
          authenticationInput,
          principal: requiredPrincipal(input, "principal"),
        });
        return safeReviewerAccount(account);
      },
    },
    {
      method: "POST",
      pattern: /^\/v1\/operator\/reviewer-invitations$/u,
      handler: async () => {
        const input = await body();
        assertAllowedKeys(input, ["applicationId"]);
        const applicationId = optionalString(input, "applicationId");
        return safeReviewerInvitationIssuance(await application.issueReviewerInvitation({
          authenticationInput,
          ...(applicationId === undefined ? {} : { applicationId }),
        }));
      },
    },
    {
      method: "POST",
      pattern: new RegExp(`^/v1/operator/reviewer-invitations/${opaquePathId}/revoke$`, "u"),
      handler: async (match) => safeReviewerInvitation(await application.revokeReviewerInvitation({
        authenticationInput,
        invitationId: match[1]!,
      })),
    },
    {
      method: "POST",
      pattern: new RegExp(`^/v1/operator/reviewers/${opaquePathId}/disable$`, "u"),
      handler: async (match) => safeReviewerAccount(await application.disableReviewerAccount({
        authenticationInput,
        reviewerId: match[1]!,
      })),
    },
    {
      method: "POST",
      pattern: new RegExp(`^/v1/operator/batches/${opaquePathId}/open$`, "u"),
      handler: async (match) => application.openBatch({ authenticationInput, batchId: match[1]! }),
    },
    {
      method: "POST",
      pattern: new RegExp(`^/v1/operator/batches/${opaquePathId}/close$`, "u"),
      handler: async (match) => application.closeBatch({ authenticationInput, batchId: match[1]! }),
    },
    {
      method: "GET",
      pattern: new RegExp(`^/v1/operator/batches/${opaquePathId}/close$`, "u"),
      handler: async (match) => application.getBatchCloseResult({ authenticationInput, batchId: match[1]! }),
    },
    {
      method: "POST",
      pattern: new RegExp(`^/v1/operator/batches/${opaquePathId}/freeze$`, "u"),
      handler: async (match) => application.freezeBatch({ authenticationInput, batchId: match[1]! }),
    },
    {
      method: "GET",
      pattern: new RegExp(`^/v1/operator/batches/${opaquePathId}/freeze$`, "u"),
      handler: async (match) => application.getFrozenPool({ authenticationInput, batchId: match[1]! }),
    },
    {
      method: "POST",
      pattern: new RegExp(`^/v1/operator/batches/${opaquePathId}/agreement$`, "u"),
      handler: async (match) => application.buildAgreementEvidence({ authenticationInput, batchId: match[1]! }),
    },
    {
      method: "GET",
      pattern: new RegExp(`^/v1/operator/batches/${opaquePathId}/agreement$`, "u"),
      handler: async (match) => application.getAgreementEvidence({ authenticationInput, batchId: match[1]! }),
    },
  ];

  const matchingPath = routes.filter((definition) => definition.pattern.test(route));
  if (matchingPath.length === 0) {
    request.resume();
    return { status: 404, level: "warn", body: { error: "not_found" } };
  }
  const matchingMethod = matchingPath.find((definition) => definition.method === request.method);
  if (matchingMethod === undefined) {
    request.resume();
    const allow = [...new Set(matchingPath.map((definition) => definition.method))].sort().join(", ");
    return {
      status: 405,
      level: "warn",
      headers: { ...(corsHeaders ?? {}), allow },
      body: { error: "method_not_allowed" },
    };
  }
  const match = matchingMethod.pattern.exec(route);
  if (match === null) {
    request.resume();
    return { status: 404, level: "warn", body: { error: "not_found" } };
  }
  try {
    const result = success(await matchingMethod.handler(match));
    return corsHeaders === undefined ? result : { ...result, headers: corsHeaders };
  } catch (error) {
    const result = failure(error);
    return corsHeaders === undefined ? result : { ...result, headers: corsHeaders };
  }
}
