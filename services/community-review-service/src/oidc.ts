import { createRemoteJWKSet, jwtVerify } from "jose";

import {
  authenticationPrincipalKey,
  parseAuthenticatedPrincipal,
  parseAuthenticationContext,
  AuthenticationAdapterError,
} from "./authentication.js";
import type {
  AuthenticatedCredentialChannel,
  AuthenticatedPrincipal,
  AuthenticationAdapter,
  AuthenticationContext,
  OperatorAuthorizer,
} from "./authentication.js";

export type OidcAccessTokenProfile = "auth0" | "rfc9068";

export interface OidcJwtAuthenticationAdapterOptions {
  readonly provider: string;
  readonly issuer: string;
  readonly audience: string;
  readonly jwksUri: string;
  readonly channel: AuthenticatedCredentialChannel;
  readonly tokenProfile: OidcAccessTokenProfile;
  readonly clientId: string;
  readonly requiredScope: string;
  readonly clockToleranceSeconds?: number;
  readonly timeoutDurationMs?: number;
  /** Only tests may opt into a local HTTP issuer/JWKS endpoint. */
  readonly allowInsecureHttp?: boolean;
}

function validUrl(value: string, allowInsecureHttp: boolean): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("Invalid OIDC URL.");
  }
  if (url.protocol !== "https:" && !(allowInsecureHttp && url.protocol === "http:")) {
    throw new Error("OIDC URLs must use HTTPS.");
  }
  return url;
}

function bearerToken(input: unknown): string | undefined {
  const value = typeof input === "string"
    ? input
    : typeof input === "object" && input !== null
      ? (input as Record<string, unknown>).authorization ??
        (input as Record<string, unknown>).Authorization
      : undefined;
  if (typeof value !== "string") return undefined;
  const match = /^Bearer[ \t]+([^ \t\r\n]+)$/u.exec(value);
  return match?.[1];
}

const permissionPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;

function exactAudience(value: unknown, expected: string): boolean {
  return value === expected || Array.isArray(value) && value.length === 1 && value[0] === expected;
}

function assertPermissionClaims(payload: Record<string, unknown>, requiredScope: string): void {
  const scope = payload.scope;
  if (typeof scope !== "string" || scope.length === 0 || scope.trim() !== scope || /\s{2,}/u.test(scope)) {
    throw new AuthenticationAdapterError();
  }
  const scopes = scope.split(" ");
  if (scopes.some((item) => !permissionPattern.test(item)) || new Set(scopes).size !== scopes.length ||
    !scopes.includes(requiredScope)) {
    throw new AuthenticationAdapterError();
  }

  // `scope` is authoritative for this service. If Auth0 also emits
  // `permissions`, it must still be a well-formed, duplicate-free array so a
  // second malformed representation cannot create an authorization bypass.
  const permissions = payload.permissions;
  if (permissions === undefined) return;
  if (!Array.isArray(permissions) || permissions.some((item) =>
    typeof item !== "string" || !permissionPattern.test(item)) ||
    new Set(permissions).size !== permissions.length) {
    throw new AuthenticationAdapterError();
  }
}

function assertClientBinding(
  payload: Record<string, unknown>,
  profile: OidcAccessTokenProfile,
  clientId: string,
): void {
  const claim = profile === "auth0" ? payload.azp : payload.client_id;
  if (typeof claim !== "string" || claim !== clientId) throw new AuthenticationAdapterError();
}

/** Standards-based JWT verification; decoded-but-unverified claims never cross the boundary. */
export class OidcJwtAuthenticationAdapter implements AuthenticationAdapter {
  private readonly provider: string;
  private readonly issuer: string;
  private readonly audience: string;
  private readonly channel: AuthenticatedCredentialChannel;
  private readonly tokenProfile: OidcAccessTokenProfile;
  private readonly clientId: string;
  private readonly requiredScope: string;
  private readonly remoteJwks: ReturnType<typeof createRemoteJWKSet>;
  private readonly clockToleranceSeconds: number;

  constructor(options: OidcJwtAuthenticationAdapterOptions) {
    const allowInsecureHttp = options.allowInsecureHttp === true;
    if (typeof options.provider !== "string" || options.provider.trim().length === 0 ||
      typeof options.issuer !== "string" || typeof options.audience !== "string" ||
      options.issuer.trim().length === 0 || options.audience.trim().length === 0 ||
      (options.channel !== "operator" && options.channel !== "reviewer") ||
      (options.tokenProfile !== "auth0" && options.tokenProfile !== "rfc9068") ||
      typeof options.clientId !== "string" || !permissionPattern.test(options.clientId) ||
      typeof options.requiredScope !== "string" || !permissionPattern.test(options.requiredScope)) {
      throw new Error("OIDC provider configuration is invalid.");
    }
    const issuer = validUrl(options.issuer, allowInsecureHttp);
    const jwksUri = validUrl(options.jwksUri, allowInsecureHttp);
    if (issuer.href !== options.issuer || jwksUri.href !== options.jwksUri) {
      throw new Error("OIDC URLs must be canonical.");
    }
    const clockToleranceSeconds = options.clockToleranceSeconds ?? 5;
    const timeoutDurationMs = options.timeoutDurationMs ?? 5000;
    if (!Number.isInteger(clockToleranceSeconds) || clockToleranceSeconds < 0 || clockToleranceSeconds > 60 ||
      !Number.isInteger(timeoutDurationMs) || timeoutDurationMs < 500 || timeoutDurationMs > 30000) {
      throw new Error("OIDC timing configuration is invalid.");
    }
    this.provider = options.provider;
    this.issuer = options.issuer;
    this.audience = options.audience;
    this.channel = options.channel;
    this.tokenProfile = options.tokenProfile;
    this.clientId = options.clientId;
    this.requiredScope = options.requiredScope;
    this.clockToleranceSeconds = clockToleranceSeconds;
    this.remoteJwks = createRemoteJWKSet(jwksUri, {
      timeoutDuration: timeoutDurationMs,
    });
  }

  async authenticate(input: unknown): Promise<AuthenticationContext> {
    const token = bearerToken(input);
    if (token === undefined) throw new AuthenticationAdapterError();
    try {
      const result = await jwtVerify(token, this.remoteJwks, {
        issuer: this.issuer,
        audience: this.audience,
        algorithms: ["RS256", "PS256"],
        clockTolerance: this.clockToleranceSeconds,
      });
      const expectedType = this.tokenProfile === "rfc9068" ? "at+jwt" : "JWT";
      if (result.protectedHeader.typ !== expectedType || !exactAudience(result.payload.aud, this.audience)) {
        throw new AuthenticationAdapterError();
      }
      assertClientBinding(result.payload, this.tokenProfile, this.clientId);
      assertPermissionClaims(result.payload, this.requiredScope);
      if (typeof result.payload.sub !== "string" || result.payload.sub.trim().length === 0) {
        throw new AuthenticationAdapterError();
      }
      return parseAuthenticationContext({
        principal: {
          provider: this.provider,
          subject: result.payload.sub,
        },
        channel: this.channel,
      });
    } catch (error) {
      if (error instanceof AuthenticationAdapterError) throw error;
      throw new AuthenticationAdapterError();
    }
  }
}

/**
 * Try only the explicitly configured, channel-bound OIDC policies. An empty
 * policy set is intentionally fail-closed and never falls back to subject-only
 * authentication.
 */
export class MultiPolicyAuthenticationAdapter implements AuthenticationAdapter {
  constructor(private readonly adapters: readonly AuthenticationAdapter[]) {}

  async authenticate(input: unknown): Promise<AuthenticationContext> {
    for (const adapter of this.adapters) {
      try {
        return await adapter.authenticate(input);
      } catch {
        // A credential may be valid for another configured route channel.
      }
    }
    throw new AuthenticationAdapterError();
  }
}

/** Explicit private subject allowlist for operator authority. */
export class ConfiguredOperatorAuthorizer implements OperatorAuthorizer {
  private readonly operators: ReadonlySet<string>;

  constructor(principals: readonly AuthenticatedPrincipal[]) {
    this.operators = new Set(principals.map((principal) => {
      return authenticationPrincipalKey(parseAuthenticatedPrincipal({ principal }));
    }));
    if (this.operators.size === 0) throw new Error("At least one operator principal is required.");
  }

  isOperator(context: AuthenticationContext): boolean {
    const parsed = parseAuthenticationContext(context);
    return parsed.channel === "operator" && this.operators.has(authenticationPrincipalKey(parsed.principal));
  }
}
