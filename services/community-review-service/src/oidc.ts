import { createRemoteJWKSet, jwtVerify } from "jose";

import {
  authenticationPrincipalKey,
  parseAuthenticationContext,
  AuthenticationAdapterError,
} from "./authentication.js";
import type {
  AuthenticatedPrincipal,
  AuthenticationAdapter,
  AuthenticationContext,
  OperatorAuthorizer,
} from "./authentication.js";

export interface OidcJwtAuthenticationAdapterOptions {
  readonly provider: string;
  readonly issuer: string;
  readonly audience: string;
  readonly jwksUri: string;
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

/** Standards-based JWT verification; decoded-but-unverified claims never cross the boundary. */
export class OidcJwtAuthenticationAdapter implements AuthenticationAdapter {
  private readonly provider: string;
  private readonly issuer: string;
  private readonly audience: string;
  private readonly remoteJwks: ReturnType<typeof createRemoteJWKSet>;
  private readonly clockToleranceSeconds: number;

  constructor(options: OidcJwtAuthenticationAdapterOptions) {
    const allowInsecureHttp = options.allowInsecureHttp === true;
    if (typeof options.provider !== "string" || options.provider.trim().length === 0 ||
      typeof options.issuer !== "string" || typeof options.audience !== "string" ||
      options.issuer.trim().length === 0 || options.audience.trim().length === 0) {
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
      if (typeof result.payload.sub !== "string" || result.payload.sub.trim().length === 0) {
        throw new AuthenticationAdapterError();
      }
      return parseAuthenticationContext({
        principal: {
          provider: this.provider,
          subject: result.payload.sub,
        },
      });
    } catch (error) {
      if (error instanceof AuthenticationAdapterError) throw error;
      throw new AuthenticationAdapterError();
    }
  }
}

/** Explicit private subject allowlist for operator authority. */
export class ConfiguredOperatorAuthorizer implements OperatorAuthorizer {
  private readonly operators: ReadonlySet<string>;

  constructor(principals: readonly AuthenticatedPrincipal[]) {
    this.operators = new Set(principals.map((principal) => {
      return authenticationPrincipalKey(parseAuthenticationContext({ principal }).principal);
    }));
    if (this.operators.size === 0) throw new Error("At least one operator principal is required.");
  }

  isOperator(context: AuthenticationContext): boolean {
    return this.operators.has(authenticationPrincipalKey(parseAuthenticationContext(context).principal));
  }
}
