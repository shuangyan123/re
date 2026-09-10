import { CommunityReviewServiceError } from "./errors.js";

/** The only identity shape allowed to cross the authentication boundary. */
export interface AuthenticatedPrincipal {
  readonly provider: string;
  readonly subject: string;
}

export type AuthenticatedCredentialChannel = "operator" | "reviewer";

export interface AuthenticationContext {
  readonly principal: AuthenticatedPrincipal;
  /** Narrow server-verified route channel; raw token claims never cross here. */
  readonly channel: AuthenticatedCredentialChannel;
}

export interface AuthenticationAdapter {
  /** Validate credentials and reduce them to a provider/subject principal. */
  authenticate(input: unknown): Promise<AuthenticationContext>;
}

/** Authorization for service-operator actions, separate from reviewer identity. */
export interface OperatorAuthorizer {
  isOperator(context: AuthenticationContext): Promise<boolean> | boolean;
}

export class AuthenticationAdapterError extends Error {
  constructor() {
    super("Authentication adapter rejected the supplied input.");
    this.name = "AuthenticationAdapterError";
  }
}

const providerPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/u;
const authSubjectMaxLength = 512;

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null
    ? value as Record<string, unknown>
    : undefined;
}

function validProvider(value: unknown): value is string {
  return typeof value === "string" && providerPattern.test(value);
}

function validSubject(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 &&
    value.length <= authSubjectMaxLength && !value.includes("\u0000");
}

export function parseAuthenticatedPrincipal(value: unknown): AuthenticatedPrincipal {
  const context = record(value);
  const principal = record(context?.principal);
  if (principal === undefined || !validProvider(principal.provider) || !validSubject(principal.subject)) {
    throw new CommunityReviewServiceError("authentication_failed");
  }
  return {
    provider: principal.provider,
    subject: principal.subject,
  };
}

/** Normalize adapter output so claims, tokens, and other fields cannot propagate. */
export function parseAuthenticationContext(value: unknown): AuthenticationContext {
  const context = record(value);
  const channel = context?.channel;
  if (channel !== "operator" && channel !== "reviewer") {
    throw new CommunityReviewServiceError("authentication_failed");
  }
  return {
    principal: parseAuthenticatedPrincipal(value),
    channel,
  };
}

export function authenticationPrincipalKey(principal: AuthenticatedPrincipal): string {
  return `${principal.provider}\u0000${principal.subject}`;
}

function credentialFromInput(input: unknown): string | undefined {
  if (typeof input === "string" && input.length > 0) return input;
  const parsed = record(input);
  if (typeof parsed?.token === "string" && parsed.token.length > 0) return parsed.token;
  if (typeof parsed?.credential === "string" && parsed.credential.length > 0) return parsed.credential;
  return undefined;
}

/** Synthetic-only adapter for deterministic tests; it never returns credentials or claims. */
export class SyntheticAuthenticationAdapter implements AuthenticationAdapter {
  private readonly identities: Map<string, AuthenticationContext>;

  constructor(
    identities: ReadonlyMap<string, AuthenticatedPrincipal | AuthenticationContext> |
      Readonly<Record<string, AuthenticatedPrincipal | AuthenticationContext>>,
    defaultChannel: AuthenticatedCredentialChannel = "reviewer",
  ) {
    const entries = identities instanceof Map ? identities.entries() : Object.entries(identities);
    this.identities = new Map([...entries].map(([credential, value]) => {
      const candidate = record(value);
      const context = candidate?.principal === undefined
        ? { principal: parseAuthenticatedPrincipal({ principal: value }), channel: defaultChannel }
        : parseAuthenticationContext(value);
      return [credential, context] as const;
    }));
    for (const [credential, context] of this.identities) {
      if (credential.length === 0) throw new Error("Synthetic credential must not be empty.");
      parseAuthenticationContext(context);
    }
  }

  async authenticate(input: unknown): Promise<AuthenticationContext> {
    const credential = credentialFromInput(input);
    const context = credential === undefined ? undefined : this.identities.get(credential);
    if (context === undefined) throw new AuthenticationAdapterError();
    return parseAuthenticationContext(context);
  }
}

/** Fail-closed adapter used while a provider channel is not activated. */
export class RejectingAuthenticationAdapter implements AuthenticationAdapter {
  async authenticate(_input: unknown): Promise<AuthenticationContext> {
    throw new AuthenticationAdapterError();
  }
}

/** Deterministic operator policy for synthetic/service-boundary tests. */
export class StaticOperatorAuthorizer implements OperatorAuthorizer {
  private readonly operators: Set<string>;

  constructor(principals: readonly AuthenticatedPrincipal[]) {
    this.operators = new Set(principals.map((principal) => {
      return authenticationPrincipalKey(parseAuthenticatedPrincipal({ principal }));
    }));
  }

  isOperator(context: AuthenticationContext): boolean {
    const parsed = parseAuthenticationContext(context);
    return parsed.channel === "operator" && this.operators.has(authenticationPrincipalKey(parsed.principal));
  }
}

export const SyntheticOperatorAuthorizer = StaticOperatorAuthorizer;
