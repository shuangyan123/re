import { CommunityReviewServiceError } from "./errors.js";

/** The only identity shape allowed to cross the authentication boundary. */
export interface AuthenticatedPrincipal {
  readonly provider: string;
  readonly subject: string;
}

export interface AuthenticationContext {
  readonly principal: AuthenticatedPrincipal;
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

/** Normalize adapter output so claims, tokens, and other fields cannot propagate. */
export function parseAuthenticationContext(value: unknown): AuthenticationContext {
  const context = record(value);
  const principal = record(context?.principal);
  if (principal === undefined || !validProvider(principal.provider) || !validSubject(principal.subject)) {
    throw new CommunityReviewServiceError("authentication_failed");
  }
  return {
    principal: {
      provider: principal.provider,
      subject: principal.subject,
    },
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
  private readonly identities: Map<string, AuthenticatedPrincipal>;

  constructor(
    identities: ReadonlyMap<string, AuthenticatedPrincipal> | Readonly<Record<string, AuthenticatedPrincipal>>,
  ) {
    this.identities = new Map(
      identities instanceof Map ? identities.entries() : Object.entries(identities),
    );
    for (const principal of this.identities.values()) {
      parseAuthenticationContext({ principal });
    }
  }

  async authenticate(input: unknown): Promise<AuthenticationContext> {
    const credential = credentialFromInput(input);
    const principal = credential === undefined ? undefined : this.identities.get(credential);
    if (principal === undefined) throw new AuthenticationAdapterError();
    return parseAuthenticationContext({ principal });
  }
}

/** Deterministic operator policy for synthetic/service-boundary tests. */
export class StaticOperatorAuthorizer implements OperatorAuthorizer {
  private readonly operators: Set<string>;

  constructor(principals: readonly AuthenticatedPrincipal[]) {
    this.operators = new Set(principals.map((principal) => {
      const context = parseAuthenticationContext({ principal });
      return authenticationPrincipalKey(context.principal);
    }));
  }

  isOperator(context: AuthenticationContext): boolean {
    return this.operators.has(authenticationPrincipalKey(parseAuthenticationContext(context).principal));
  }
}

export const SyntheticOperatorAuthorizer = StaticOperatorAuthorizer;
