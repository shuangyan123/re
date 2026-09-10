import path from "node:path";

import type { CommunityReviewApplicationIntakeState } from "../../../src/contracts/community-review-application.js";
import {
  parseAuthenticatedPrincipal,
  parseAuthenticationContext,
} from "./authentication.js";
import type {
  AuthenticatedPrincipal,
  AuthenticationContext,
} from "./authentication.js";
import type { OidcAccessTokenProfile } from "./oidc.js";
import {
  parseApplicationCorsOrigins,
  parseTrustedProxyNetworks,
  type CommunityReviewApplicationCorsPolicy,
  type CommunityReviewTrustedProxyNetwork,
} from "./public-exposure.js";

export type CommunityReviewEnvironment = "test" | "development" | "production";
export type CommunityReviewStorage = "postgres" | "in-memory";
export type CommunityReviewAuthMode = "oidc" | "synthetic";
export type CommunityReviewLogLevel = "info" | "warn" | "error";
export type CommunityReviewRuntimeCommand = "migrate" | "readiness" | "serve";
export type CommunityReviewReviewerInvitationState = "DISABLED" | "INVITE_ONLY";

export interface CommunityReviewOidcPolicyConfig {
  readonly audience: string;
  readonly tokenProfile: OidcAccessTokenProfile;
  readonly clientId: string;
  readonly requiredScope: string;
}

export interface CommunityReviewOidcConfig {
  readonly provider: string;
  readonly issuer: string;
  readonly jwksUri: string;
  readonly clockToleranceSeconds: number;
  readonly timeoutDurationMs: number;
  readonly allowInsecureHttp: boolean;
  /** Absent means the operator channel is not activated and fails closed. */
  readonly operator?: CommunityReviewOidcPolicyConfig;
  /** Absent until the separate reviewer provider/client channel is activated. */
  readonly reviewer?: CommunityReviewOidcPolicyConfig;
}

export interface CommunityReviewServiceConfig {
  readonly environment: CommunityReviewEnvironment;
  readonly storage: CommunityReviewStorage;
  /** The URL is retained for the pool factory and is never included in logs. */
  readonly databaseUrl?: string;
  readonly databaseSsl: boolean;
  readonly databaseSslRejectUnauthorized: boolean;
  readonly migrationsDirectory: string;
  readonly host: string;
  readonly port: number;
  readonly requestBodyLimitBytes: number;
  readonly shutdownTimeoutMs: number;
  readonly logLevel: CommunityReviewLogLevel;
  readonly authMode: CommunityReviewAuthMode;
  readonly oidc?: CommunityReviewOidcConfig;
  /** Test/development-only channel-bound credential mapping; production uses OIDC. */
  readonly syntheticIdentities: ReadonlyMap<string, AuthenticationContext>;
  readonly operatorPrincipals: readonly AuthenticatedPrincipal[];
  readonly privateMaterialRoot?: string;
  /** Kept closed until a separately authorized campaign gate exists. */
  readonly publicIntakeEnabled: false;
  /** Separate participation-application switch; reviewer intake stays independent. */
  readonly applicationIntakeState: CommunityReviewApplicationIntakeState;
  /** Empty means direct mode; forwarded headers are ignored without an explicit network. */
  readonly trustedProxyNetworks: readonly CommunityReviewTrustedProxyNetwork[];
  /** Empty allowlist disables browser CORS for application endpoints. */
  readonly applicationCors: CommunityReviewApplicationCorsPolicy;
  readonly applicationRateLimitMaximumRequests: number;
  readonly applicationRateLimitWindowMs: number;
  readonly reviewerInvitationState: CommunityReviewReviewerInvitationState;
  readonly reviewerInvitationTtlMs: number;
}

export type CommunityReviewConfigurationErrorCode =
  | "invalid_environment"
  | "invalid_storage"
  | "database_required"
  | "database_invalid"
  | "database_tls_required"
  | "invalid_auth_mode"
  | "oidc_required"
  | "oidc_invalid"
  | "operator_allowlist_required"
  | "material_root_required"
  | "material_root_invalid"
  | "public_intake_disabled"
  | "invalid_application_intake_state"
  | "invalid_trusted_proxy_config"
  | "invalid_application_cors_config"
  | "invalid_reviewer_invitation_state"
  | "invalid_runtime_value";

export class CommunityReviewConfigurationError extends Error {
  readonly code: CommunityReviewConfigurationErrorCode;

  constructor(code: CommunityReviewConfigurationErrorCode) {
    super("Community Review runtime configuration is invalid.");
    this.name = "CommunityReviewConfigurationError";
    this.code = code;
  }
}

export interface CommunityReviewConfigLoadOptions {
  readonly env?: NodeJS.ProcessEnv;
  readonly command?: CommunityReviewRuntimeCommand;
  readonly cwd?: string;
}

const providerPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/u;
const maxSubjectLength = 512;

function value(env: NodeJS.ProcessEnv, key: string): string | undefined {
  const raw = env[key];
  if (raw === undefined) return undefined;
  const trimmed = raw.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}

function enumValue<T extends string>(
  raw: string | undefined,
  allowed: readonly T[],
  code: CommunityReviewConfigurationErrorCode,
): T | undefined {
  if (raw === undefined) return undefined;
  if (!allowed.includes(raw as T)) throw new CommunityReviewConfigurationError(code);
  return raw as T;
}

function booleanValue(
  raw: string | undefined,
  defaultValue: boolean,
): boolean {
  if (raw === undefined) return defaultValue;
  if (raw === "true") return true;
  if (raw === "false") return false;
  throw new CommunityReviewConfigurationError("invalid_runtime_value");
}

function applicationIntakeState(raw: unknown): CommunityReviewApplicationIntakeState {
  // Whitespace, omission, and empty values are fail-closed configuration, not
  // a license to reinterpret an operator's intent as OPEN.
  if (raw === undefined || raw === null || typeof raw !== "string" || raw.length === 0 ||
    raw.trim().length === 0 || raw.trim() !== raw) {
    return "CLOSED";
  }
  if (raw === "CLOSED" || raw === "OPEN" || raw === "PAUSED") return raw;
  throw new CommunityReviewConfigurationError("invalid_application_intake_state");
}

function boundedInteger(
  raw: string | undefined,
  defaultValue: number,
  minimum: number,
  maximum: number,
): number {
  if (raw === undefined) return defaultValue;
  if (!/^\d+$/u.test(raw)) throw new CommunityReviewConfigurationError("invalid_runtime_value");
  const parsed = Number(raw);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new CommunityReviewConfigurationError("invalid_runtime_value");
  }
  return parsed;
}

function canonicalHttpUrl(raw: string, allowInsecureHttp: boolean): string {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new CommunityReviewConfigurationError("oidc_invalid");
  }
  if (parsed.username !== "" || parsed.password !== "" || parsed.hash !== "" ||
    (parsed.protocol !== "https:" && !(allowInsecureHttp && parsed.protocol === "http:")) ||
    parsed.href !== raw) {
    throw new CommunityReviewConfigurationError("oidc_invalid");
  }
  return parsed.href;
}

function databaseUrl(raw: string | undefined): string | undefined {
  if (raw === undefined) return undefined;
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new CommunityReviewConfigurationError("database_invalid");
  }
  if ((parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") ||
    parsed.hostname.length === 0 || parsed.hash !== "" || parsed.searchParams.has("sslmode")) {
    throw new CommunityReviewConfigurationError("database_invalid");
  }
  return raw;
}

function pathContains(parent: string, child: string): boolean {
  const relative = path.relative(parent, child);
  return relative === "" || (!path.isAbsolute(relative) && relative !== ".." &&
    !relative.startsWith(`..${path.sep}`));
}

function defaultMigrationsDirectory(cwd: string): string {
  const local = path.resolve(cwd, "migrations");
  return path.basename(cwd) === "community-review-service"
    ? local
    : path.resolve(cwd, "services/community-review-service/migrations");
}

function absoluteDirectory(raw: string | undefined): string | undefined {
  if (raw === undefined) return undefined;
  if (!path.isAbsolute(raw) || raw.includes("\u0000")) {
    throw new CommunityReviewConfigurationError("material_root_invalid");
  }
  return path.resolve(raw);
}

function parseOperatorPrincipals(raw: string | undefined): readonly AuthenticatedPrincipal[] {
  if (raw === undefined) return [];
  const entries = raw.split(",").map((item) => item.trim()).filter((item) => item.length > 0);
  const principals: AuthenticatedPrincipal[] = [];
  for (const entry of entries) {
    const separator = entry.indexOf("|");
    const provider = separator < 0 ? "" : entry.slice(0, separator).trim();
    const subject = separator < 0 ? "" : entry.slice(separator + 1).trim();
    if (!providerPattern.test(provider) || subject.length === 0 || subject.length > maxSubjectLength ||
      subject.includes("\u0000")) {
      throw new CommunityReviewConfigurationError("operator_allowlist_required");
    }
    try {
      principals.push(parseAuthenticatedPrincipal({ principal: { provider, subject } }));
    } catch {
      throw new CommunityReviewConfigurationError("operator_allowlist_required");
    }
  }
  return principals;
}

function parseSyntheticIdentities(
  raw: string | undefined,
): ReadonlyMap<string, AuthenticationContext> {
  const identities = new Map<string, AuthenticationContext>();
  if (raw === undefined) return identities;
  for (const entry of raw.split(",").map((item) => item.trim()).filter((item) => item.length > 0)) {
    const equal = entry.indexOf("=");
    const parts = equal > 0 ? entry.slice(equal + 1).split("|") : [];
    const credential = equal > 0 ? entry.slice(0, equal) : "";
    const channel = parts[0];
    const provider = parts[1];
    const subject = parts[2];
    if (credential.length === 0 || credential.length > 512 || credential.includes("\u0000") ||
      parts.length !== 3 || (channel !== "operator" && channel !== "reviewer") ||
      provider === undefined || subject === undefined || subject.length === 0) {
      throw new CommunityReviewConfigurationError("invalid_auth_mode");
    }
    try {
      const context = parseAuthenticationContext({
        principal: { provider, subject },
        channel,
      });
      if (identities.has(credential)) throw new Error("duplicate synthetic credential");
      identities.set(credential, context);
    } catch {
      throw new CommunityReviewConfigurationError("invalid_auth_mode");
    }
  }
  return identities;
}

function parseOidcPolicy(
  env: NodeJS.ProcessEnv,
  audience: string | undefined,
  profileKey: string,
  clientKey: string,
  scopeKey: string,
): CommunityReviewOidcPolicyConfig | undefined {
  const profile = value(env, profileKey);
  const clientId = value(env, clientKey);
  const requiredScope = value(env, scopeKey);
  // A provider/audience may be known before the exact token profile, client
  // binding, and permission scope have been read back. Keep that channel
  // inactive rather than treating partial operational knowledge as authority.
  if (profile === undefined && clientId === undefined && requiredScope === undefined) {
    return undefined;
  }
  if (audience === undefined || profile === undefined || clientId === undefined || requiredScope === undefined ||
    (profile !== "auth0" && profile !== "rfc9068") || clientId.length > 256 || requiredScope.length > 128 ||
    /\s/u.test(clientId) || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u.test(requiredScope)) {
    throw new CommunityReviewConfigurationError("oidc_invalid");
  }
  return {
    audience,
    tokenProfile: profile,
    clientId,
    requiredScope,
  };
}

function assertProductionMaterialBoundary(root: string, cwd: string): void {
  const relative = path.relative(cwd, root);
  const first = relative.split(path.sep)[0]?.toLowerCase();
  if (pathContains(root, cwd) || relative === "" || first === ".git" || first === ".github" ||
    first === "src" || first === "services" || first === "docs" || first === "tests" ||
    first === "data" || first === "assets" || first === "scenarios" || first === "prompts" ||
    first === "scripts" || first === "dist" || first === "node_modules") {
    throw new CommunityReviewConfigurationError("material_root_invalid");
  }
}

/** Parse one typed configuration for migrate, readiness, and serve commands. */
export function loadCommunityReviewConfig(
  options: CommunityReviewConfigLoadOptions = {},
): CommunityReviewServiceConfig {
  const env = options.env ?? process.env;
  const cwd = options.cwd ?? process.cwd();
  const command = options.command ?? "serve";
  const environment = enumValue(
    value(env, "COMMUNITY_REVIEW_ENV") ?? value(env, "NODE_ENV") ?? "development",
    ["test", "development", "production"],
    "invalid_environment",
  ) ?? "development";
  const storage = enumValue(
    value(env, "COMMUNITY_REVIEW_STORAGE") ?? (environment === "test" ? "in-memory" : "postgres"),
    ["postgres", "in-memory"],
    "invalid_storage",
  ) ?? "postgres";
  const authMode = enumValue(
    value(env, "COMMUNITY_REVIEW_AUTH_MODE") ?? (environment === "test" ? "synthetic" : "oidc"),
    ["oidc", "synthetic"],
    "invalid_auth_mode",
  ) ?? "oidc";
  const publicIntakeEnabled = booleanValue(value(env, "COMMUNITY_REVIEW_PUBLIC_INTAKE"), false);
  if (publicIntakeEnabled) throw new CommunityReviewConfigurationError("public_intake_disabled");
  const applicationIntake = applicationIntakeState(env.COMMUNITY_REVIEW_APPLICATION_INTAKE_STATE);
  const reviewerInvitationState = enumValue(
    value(env, "COMMUNITY_REVIEW_REVIEWER_INVITATION_STATE") ?? "DISABLED",
    ["DISABLED", "INVITE_ONLY"],
    "invalid_reviewer_invitation_state",
  ) ?? "DISABLED";
  let trustedProxyNetworks: readonly CommunityReviewTrustedProxyNetwork[];
  try {
    trustedProxyNetworks = parseTrustedProxyNetworks(value(env, "COMMUNITY_REVIEW_TRUSTED_PROXY_CIDRS"));
  } catch {
    throw new CommunityReviewConfigurationError("invalid_trusted_proxy_config");
  }
  let applicationCorsOrigins: readonly string[];
  try {
    applicationCorsOrigins = parseApplicationCorsOrigins(
      value(env, "COMMUNITY_REVIEW_APPLICATION_CORS_ORIGINS"),
      environment === "production",
    );
  } catch {
    throw new CommunityReviewConfigurationError("invalid_application_cors_config");
  }
  const applicationCorsMaxAgeSeconds = boundedInteger(
    value(env, "COMMUNITY_REVIEW_APPLICATION_CORS_MAX_AGE_SECONDS"),
    300,
    0,
    86_400,
  );

  const dbRequired = storage === "postgres" && (command === "migrate" || command === "readiness" ||
    command === "serve" || environment === "production");
  const configuredDatabaseUrl = databaseUrl(value(env, "COMMUNITY_REVIEW_DATABASE_URL") ?? value(env, "DATABASE_URL"));
  if (dbRequired && configuredDatabaseUrl === undefined) {
    throw new CommunityReviewConfigurationError("database_required");
  }
  if (environment === "production" && storage !== "postgres") {
    throw new CommunityReviewConfigurationError("database_required");
  }
  const databaseSsl = enumValue(
    value(env, "COMMUNITY_REVIEW_DATABASE_SSL") ?? (environment === "production" ? "require" : "disable"),
    ["require", "disable"],
    "invalid_runtime_value",
  ) === "require";
  const databaseSslRejectUnauthorized = booleanValue(
    value(env, "COMMUNITY_REVIEW_DATABASE_SSL_REJECT_UNAUTHORIZED"),
    true,
  );
  if (environment === "production" && !databaseSsl) {
    throw new CommunityReviewConfigurationError("database_tls_required");
  }

  const operatorPrincipals = parseOperatorPrincipals(value(env, "COMMUNITY_REVIEW_OPERATOR_SUBJECTS"));
  if (environment === "production" && command !== "migrate" && operatorPrincipals.length === 0) {
    throw new CommunityReviewConfigurationError("operator_allowlist_required");
  }

  const allowInsecureHttp = booleanValue(value(env, "COMMUNITY_REVIEW_OIDC_ALLOW_INSECURE_HTTP"), false);
  const syntheticIdentities = authMode === "synthetic"
    ? parseSyntheticIdentities(value(env, "COMMUNITY_REVIEW_SYNTHETIC_IDENTITIES"))
    : new Map<string, AuthenticationContext>();
  const provider = value(env, "COMMUNITY_REVIEW_OIDC_PROVIDER");
  const issuer = value(env, "COMMUNITY_REVIEW_OIDC_ISSUER");
  const audience = value(env, "COMMUNITY_REVIEW_OIDC_AUDIENCE");
  const jwksUri = value(env, "COMMUNITY_REVIEW_OIDC_JWKS_URI");
  const reviewerAudience = value(env, "COMMUNITY_REVIEW_REVIEWER_OIDC_AUDIENCE");
  let oidc: CommunityReviewOidcConfig | undefined;
  if (authMode === "oidc" && command !== "migrate") {
    if (provider === undefined || issuer === undefined || audience === undefined || jwksUri === undefined) {
      throw new CommunityReviewConfigurationError("oidc_required");
    }
    if (!providerPattern.test(provider) || audience.length === 0) {
      throw new CommunityReviewConfigurationError("oidc_invalid");
    }
    if (environment === "production" && allowInsecureHttp) {
      throw new CommunityReviewConfigurationError("oidc_invalid");
    }
    const operator = parseOidcPolicy(
      env,
      audience,
      "COMMUNITY_REVIEW_OIDC_TOKEN_PROFILE",
      "COMMUNITY_REVIEW_OPERATOR_OIDC_CLIENT_ID",
      "COMMUNITY_REVIEW_OPERATOR_OIDC_SCOPE",
    );
    const reviewer = parseOidcPolicy(
      env,
      reviewerAudience,
      "COMMUNITY_REVIEW_REVIEWER_OIDC_TOKEN_PROFILE",
      "COMMUNITY_REVIEW_REVIEWER_OIDC_CLIENT_ID",
      "COMMUNITY_REVIEW_REVIEWER_OIDC_SCOPE",
    );
    oidc = {
      provider,
      issuer: canonicalHttpUrl(issuer, allowInsecureHttp),
      jwksUri: canonicalHttpUrl(jwksUri, allowInsecureHttp),
      clockToleranceSeconds: boundedInteger(value(env, "COMMUNITY_REVIEW_OIDC_CLOCK_TOLERANCE_SECONDS"), 5, 0, 60),
      timeoutDurationMs: boundedInteger(value(env, "COMMUNITY_REVIEW_OIDC_TIMEOUT_MS"), 5000, 500, 30000),
      allowInsecureHttp,
      ...(operator === undefined ? {} : { operator }),
      ...(reviewer === undefined ? {} : { reviewer }),
    };
  }
  if (environment === "production" && authMode !== "oidc") {
    throw new CommunityReviewConfigurationError("oidc_required");
  }
  if (environment === "production" && !databaseSslRejectUnauthorized) {
    throw new CommunityReviewConfigurationError("database_tls_required");
  }

  const materialRoot = absoluteDirectory(value(env, "COMMUNITY_REVIEW_MATERIAL_ROOT"));
  if (environment === "production" && command !== "migrate") {
    if (materialRoot === undefined) throw new CommunityReviewConfigurationError("material_root_required");
    assertProductionMaterialBoundary(materialRoot, cwd);
  }

  const migrationsDirectory = path.resolve(
    cwd,
    value(env, "COMMUNITY_REVIEW_MIGRATIONS_DIRECTORY") ?? defaultMigrationsDirectory(cwd),
  );
  const logLevel = enumValue(value(env, "COMMUNITY_REVIEW_LOG_LEVEL"), ["info", "warn", "error"], "invalid_runtime_value") ?? "info";
  return {
    environment,
    storage,
    ...(configuredDatabaseUrl === undefined ? {} : { databaseUrl: configuredDatabaseUrl }),
    databaseSsl,
    databaseSslRejectUnauthorized,
    migrationsDirectory,
    host: value(env, "COMMUNITY_REVIEW_HOST") ?? "127.0.0.1",
    port: boundedInteger(value(env, "COMMUNITY_REVIEW_PORT"), 8787, 1, 65535),
    requestBodyLimitBytes: boundedInteger(value(env, "COMMUNITY_REVIEW_REQUEST_BODY_LIMIT_BYTES"), 1_048_576, 1024, 10_485_760),
    applicationRateLimitMaximumRequests: boundedInteger(
      value(env, "COMMUNITY_REVIEW_APPLICATION_RATE_LIMIT_MAX_REQUESTS"),
      30,
      1,
      1000,
    ),
    applicationRateLimitWindowMs: boundedInteger(
      value(env, "COMMUNITY_REVIEW_APPLICATION_RATE_LIMIT_WINDOW_MS"),
      60_000,
      1000,
      86_400_000,
    ),
    reviewerInvitationTtlMs: boundedInteger(
      value(env, "COMMUNITY_REVIEW_REVIEWER_INVITATION_TTL_MS"),
      7 * 24 * 60 * 60 * 1000,
      60_000,
      31 * 24 * 60 * 60 * 1000,
    ),
    shutdownTimeoutMs: boundedInteger(value(env, "COMMUNITY_REVIEW_SHUTDOWN_TIMEOUT_MS"), 10000, 1000, 60000),
    logLevel,
    authMode,
    ...(oidc === undefined ? {} : { oidc }),
    syntheticIdentities,
    operatorPrincipals,
    ...(materialRoot === undefined ? {} : { privateMaterialRoot: materialRoot }),
    publicIntakeEnabled: false,
    applicationIntakeState: applicationIntake,
    reviewerInvitationState,
    trustedProxyNetworks,
    applicationCors: {
      allowedOrigins: applicationCorsOrigins,
      maxAgeSeconds: applicationCorsMaxAgeSeconds,
    },
  };
}
