import type { IncomingMessage } from "node:http";
import { BlockList, isIP } from "node:net";

export type CommunityReviewNetworkFamily = "ipv4" | "ipv6";

export interface CommunityReviewTrustedProxyNetwork {
  readonly address: string;
  readonly family: CommunityReviewNetworkFamily;
  readonly prefixLength: number;
}

export interface CommunityReviewApplicationCorsPolicy {
  readonly allowedOrigins: readonly string[];
  readonly maxAgeSeconds: number;
}

export type CommunityReviewApplicationCorsDecision =
  | { readonly kind: "none" }
  | { readonly kind: "allow"; readonly headers: Readonly<Record<string, string>> }
  | { readonly kind: "preflight"; readonly headers: Readonly<Record<string, string>> }
  | {
      readonly kind: "reject";
      readonly code: "application_origin_not_allowed" | "application_cors_preflight_invalid";
    };

const MAX_TRUSTED_PROXY_NETWORKS = 16;
const MAX_FORWARDED_HOPS = 16;
const MAX_FORWARDED_HEADER_BYTES = 4096;
const opaquePathId = "[A-Za-z0-9][A-Za-z0-9._-]{0,79}";

function networkFamily(address: string): CommunityReviewNetworkFamily | undefined {
  const family = isIP(address);
  return family === 4 ? "ipv4" : family === 6 ? "ipv6" : undefined;
}

function normalizeNetworkAddress(address: string | undefined): string {
  if (address === undefined) return "unknown";
  const trimmed = address.trim();
  return networkFamily(trimmed) === undefined ? "unknown" : trimmed.toLowerCase();
}

function singleHeader(request: IncomingMessage, name: string): string | null | undefined {
  const distinct = request.headersDistinct?.[name];
  if (distinct !== undefined) {
    return distinct.length === 1 ? distinct[0] : null;
  }
  const value = request.headers[name];
  if (value === undefined) return undefined;
  return Array.isArray(value) ? null : value;
}

/** Parse an explicit CIDR allowlist; an absent value means direct mode. */
export function parseTrustedProxyNetworks(raw: string | undefined): readonly CommunityReviewTrustedProxyNetwork[] {
  if (raw === undefined) return [];
  const entries = raw.split(",").map((entry) => entry.trim());
  if (entries.length === 0 || entries.length > MAX_TRUSTED_PROXY_NETWORKS || entries.some((entry) => entry.length === 0)) {
    throw new Error("invalid trusted proxy network list");
  }
  const networks: CommunityReviewTrustedProxyNetwork[] = [];
  const seen = new Set<string>();
  for (const entry of entries) {
    const slash = entry.lastIndexOf("/");
    if (slash <= 0 || slash === entry.length - 1) throw new Error("invalid trusted proxy network");
    const address = entry.slice(0, slash);
    const prefixText = entry.slice(slash + 1);
    const family = networkFamily(address);
    if (family === undefined || !/^\d{1,3}$/u.test(prefixText)) {
      throw new Error("invalid trusted proxy network");
    }
    const prefixLength = Number(prefixText);
    const maximum = family === "ipv4" ? 32 : 128;
    if (!Number.isSafeInteger(prefixLength) || prefixLength < 0 || prefixLength > maximum) {
      throw new Error("invalid trusted proxy network");
    }
    const normalized = `${family}:${address.toLowerCase()}/${prefixLength}`;
    if (seen.has(normalized)) throw new Error("duplicate trusted proxy network");
    seen.add(normalized);
    networks.push({ address, family, prefixLength });
  }
  return networks;
}

/** Parse exact browser origins. Wildcards and credentials are never accepted. */
export function parseApplicationCorsOrigins(
  raw: string | undefined,
  requireHttps: boolean,
): readonly string[] {
  if (raw === undefined) return [];
  const entries = raw.split(",").map((entry) => entry.trim());
  if (entries.length === 0 || entries.some((entry) => entry.length === 0)) {
    throw new Error("invalid application CORS origin list");
  }
  const origins: string[] = [];
  const seen = new Set<string>();
  for (const entry of entries) {
    if (entry === "*" || entry.includes("*")) throw new Error("wildcard application CORS origin");
    let parsed: URL;
    try {
      parsed = new URL(entry);
    } catch {
      throw new Error("invalid application CORS origin");
    }
    if ((parsed.protocol !== "https:" && parsed.protocol !== "http:") ||
      (requireHttps && parsed.protocol !== "https:") || parsed.username !== "" ||
      parsed.password !== "" || parsed.pathname !== "/" || parsed.search !== "" || parsed.hash !== "") {
      throw new Error("invalid application CORS origin");
    }
    if (entry !== parsed.origin && entry !== `${parsed.origin}/`) {
      throw new Error("application CORS origin must be an exact origin");
    }
    if (seen.has(parsed.origin)) throw new Error("duplicate application CORS origin");
    seen.add(parsed.origin);
    origins.push(parsed.origin);
  }
  return origins;
}

function trustedProxyMatcher(networks: readonly CommunityReviewTrustedProxyNetwork[]): (address: string) => boolean {
  const blockList = new BlockList();
  for (const network of networks) blockList.addSubnet(network.address, network.prefixLength, network.family);
  return (address: string): boolean => {
    const family = networkFamily(address);
    return family !== undefined && blockList.check(address, family);
  };
}

function parseForwardedForValue(raw: string): string | undefined {
  let value = raw.trim();
  if (value.startsWith('"')) {
    if (!value.endsWith('"') || value.length < 2 || value.slice(1, -1).includes('"') || value.includes("\\")) {
      return undefined;
    }
    value = value.slice(1, -1);
  }
  if (value.startsWith("[")) {
    const closing = value.indexOf("]");
    if (closing < 0) return undefined;
    const suffix = value.slice(closing + 1);
    if (suffix !== "" && !/^:\d{1,5}$/u.test(suffix)) return undefined;
    if (suffix !== "" && Number(suffix.slice(1)) > 65535) return undefined;
    const address = value.slice(1, closing);
    return networkFamily(address) === "ipv6" ? address.toLowerCase() : undefined;
  }
  if (networkFamily(value) !== undefined) return value.toLowerCase();
  const separator = value.lastIndexOf(":");
  if (separator > 0 && networkFamily(value.slice(0, separator)) === "ipv4" && /^\d{1,5}$/u.test(value.slice(separator + 1))) {
    const port = Number(value.slice(separator + 1));
    return port <= 65535 ? value.slice(0, separator) : undefined;
  }
  return undefined;
}

function parseForwardedHeader(value: string): string | undefined {
  if (Buffer.byteLength(value, "utf8") > MAX_FORWARDED_HEADER_BYTES) return undefined;
  const elements = value.split(",").map((element) => element.trim());
  if (elements.length === 0 || elements.length > MAX_FORWARDED_HOPS || elements.some((element) => element.length === 0)) {
    return undefined;
  }
  const addresses: string[] = [];
  for (const element of elements) {
    const parameters = element.split(";").map((parameter) => parameter.trim());
    if (parameters.length !== 1) return undefined;
    const separator = parameters[0]!.indexOf("=");
    if (separator <= 0 || parameters[0]!.slice(0, separator).toLowerCase() !== "for") return undefined;
    const address = parseForwardedForValue(parameters[0]!.slice(separator + 1));
    if (address === undefined) return undefined;
    addresses.push(address);
  }
  return addresses[0];
}

function parseXForwardedFor(value: string): string | undefined {
  if (Buffer.byteLength(value, "utf8") > MAX_FORWARDED_HEADER_BYTES) return undefined;
  const addresses = value.split(",").map((item) => item.trim());
  if (addresses.length === 0 || addresses.length > MAX_FORWARDED_HOPS || addresses.some((item) => networkFamily(item) === undefined)) {
    return undefined;
  }
  return addresses[0]!.toLowerCase();
}

/** Resolve a network address without trusting forwarding headers by default. */
export function resolveClientNetworkAddress(
  request: IncomingMessage,
  networks: readonly CommunityReviewTrustedProxyNetwork[],
): string {
  const peer = normalizeNetworkAddress(request.socket.remoteAddress);
  if (peer === "unknown" || networks.length === 0 || !trustedProxyMatcher(networks)(peer)) return peer;

  const forwarded = singleHeader(request, "forwarded");
  const xForwardedFor = singleHeader(request, "x-forwarded-for");
  const xRealIp = singleHeader(request, "x-real-ip");
  if (forwarded === null || xForwardedFor === null || xRealIp === null) return peer;
  const supplied = [forwarded, xForwardedFor, xRealIp].filter((value): value is string => value !== undefined);
  if (supplied.length !== 1) return peer;
  if (forwarded !== undefined) return parseForwardedHeader(forwarded) ?? peer;
  if (xForwardedFor !== undefined) return parseXForwardedFor(xForwardedFor) ?? peer;
  return networkFamily(xRealIp!) === undefined ? peer : xRealIp!.toLowerCase();
}

function applicationCorsEndpoint(route: string): { readonly method: "POST"; readonly headers: string } | undefined {
  if (route === "/v1/applications") return { method: "POST", headers: "Content-Type, Idempotency-Key" };
  if (new RegExp(`^/v1/applications/${opaquePathId}/withdraw$`, "u").test(route)) {
    return { method: "POST", headers: "Content-Type" };
  }
  return undefined;
}

function allowedRequestHeaders(value: string | undefined, allowed: readonly string[]): boolean {
  if (value === undefined) return true;
  const headers = value.split(",").map((item) => item.trim().toLowerCase());
  return headers.length > 0 && headers.every((header) => allowed.includes(header));
}

/** Apply CORS only to explicitly eligible application endpoints. */
export function evaluateApplicationCors(
  request: IncomingMessage,
  route: string,
  policy: CommunityReviewApplicationCorsPolicy,
): CommunityReviewApplicationCorsDecision {
  const endpoint = applicationCorsEndpoint(route);
  if (endpoint === undefined) return { kind: "none" };
  if (policy.allowedOrigins.length === 0) return { kind: "none" };

  const origin = singleHeader(request, "origin");
  if (origin === null) return { kind: "reject", code: "application_cors_preflight_invalid" };
  if (request.method === "OPTIONS") {
    const requestedMethod = singleHeader(request, "access-control-request-method");
    const requestedHeaders = singleHeader(request, "access-control-request-headers");
    if (origin === undefined || requestedMethod !== endpoint.method || requestedHeaders === null ||
      !policy.allowedOrigins.includes(origin) || !allowedRequestHeaders(requestedHeaders,
        endpoint.headers.split(", ").map((header) => header.toLowerCase()))) {
      return { kind: "reject", code: "application_cors_preflight_invalid" };
    }
    return {
      kind: "preflight",
      headers: {
        "access-control-allow-origin": origin,
        "access-control-allow-methods": endpoint.method,
        "access-control-allow-headers": endpoint.headers,
        "access-control-max-age": String(policy.maxAgeSeconds),
        vary: "Origin",
      },
    };
  }
  if (origin === undefined) return { kind: "none" };
  if (!policy.allowedOrigins.includes(origin)) return { kind: "reject", code: "application_origin_not_allowed" };
  return { kind: "allow", headers: { "access-control-allow-origin": origin, vary: "Origin" } };
}
