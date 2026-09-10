import { readFile } from "node:fs/promises";
import path from "node:path";

import type { CommunityReviewServiceConfig } from "./config.js";

export interface CommunityReviewPortalRouteResult {
  readonly status: number;
  readonly body: Buffer | string;
  readonly headers: Readonly<Record<string, string>>;
  readonly level?: "info" | "warn" | "error";
}

const portalAssets: ReadonlyMap<string, { readonly file: string; readonly contentType: string }> = new Map([
  ["/reviewer/", { file: "index.html", contentType: "text/html; charset=utf-8" }],
  ["/reviewer/index.html", { file: "index.html", contentType: "text/html; charset=utf-8" }],
  ["/reviewer/callback", { file: "index.html", contentType: "text/html; charset=utf-8" }],
  ["/reviewer/favicon.svg", { file: "favicon.svg", contentType: "image/svg+xml" }],
  ["/reviewer/portal.css", { file: "portal.css", contentType: "text/css; charset=utf-8" }],
  ["/reviewer/portal.js", { file: "portal.js", contentType: "text/javascript; charset=utf-8" }],
  ["/reviewer/vendor/auth0-spa-js.js", {
    file: path.join("vendor", "auth0-spa-js.js"),
    contentType: "text/javascript; charset=utf-8",
  }],
]);

function portalHeaders(config: CommunityReviewServiceConfig): Record<string, string> {
  const connectSources = ["'self'"];
  if (config.reviewerPortal.issuer !== undefined) {
    connectSources.push(new URL(config.reviewerPortal.issuer).origin);
  }
  return {
    "cache-control": "no-store",
    "content-security-policy": [
      "default-src 'none'",
      "base-uri 'none'",
      "object-src 'none'",
      "frame-ancestors 'none'",
      "form-action 'none'",
      "script-src 'self'",
      "style-src 'self'",
      `connect-src ${connectSources.join(" ")}`,
      "img-src 'self'",
      "font-src 'self'",
    ].join("; "),
    "permissions-policy": "camera=(), microphone=(), geolocation=()",
    "referrer-policy": "no-referrer",
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY",
    "x-robots-tag": "noindex, nofollow",
  };
}

function jsonBody(value: Record<string, unknown>): string {
  return JSON.stringify(value);
}

function jsonResult(
  config: CommunityReviewServiceConfig,
  status: number,
  value: Record<string, unknown>,
  level: "info" | "warn" | "error" = "warn",
): CommunityReviewPortalRouteResult {
  return {
    status,
    body: jsonBody(value),
    headers: {
      ...portalHeaders(config),
      "content-type": "application/json; charset=utf-8",
    },
    level,
  };
}

function publicPortalConfig(config: CommunityReviewServiceConfig): Record<string, unknown> {
  const portal = config.reviewerPortal;
  if (portal.state === "DISABLED") {
    return {
      enabled: false,
      portalPath: portal.portalPath,
      callbackPath: portal.callbackPath,
    };
  }
  return {
    enabled: true,
    issuer: portal.issuer,
    clientId: portal.clientId,
    audience: portal.audience,
    scope: portal.scope,
    portalPath: portal.portalPath,
    callbackPath: portal.callbackPath,
  };
}

/**
 * Serve only the fixed first-party portal asset allowlist. The callback uses
 * the same document so the browser can validate and then clean its URL.
 */
export async function handleCommunityReviewPortalRequest(
  config: CommunityReviewServiceConfig,
  route: string,
  method: string | undefined,
): Promise<CommunityReviewPortalRouteResult | undefined> {
  if (route !== "/reviewer" && !route.startsWith("/reviewer/")) return undefined;
  if (method !== "GET") {
    return {
      status: 405,
      body: jsonBody({ error: "method_not_allowed" }),
      headers: {
        ...portalHeaders(config),
        "allow": "GET",
        "content-type": "application/json; charset=utf-8",
      },
    };
  }
  if (route === "/reviewer") {
    return {
      status: 308,
      body: "",
      headers: { ...portalHeaders(config), location: config.reviewerPortal.portalPath },
      level: "info",
    };
  }
  if (route === "/reviewer/config.json") {
    return {
      status: 200,
      body: jsonBody(publicPortalConfig(config)),
      headers: {
        ...portalHeaders(config),
        "content-type": "application/json; charset=utf-8",
      },
      level: "info",
    };
  }
  const asset = portalAssets.get(route);
  if (asset === undefined) return jsonResult(config, 404, { error: "not_found" });
  try {
    const body = await readFile(path.join(config.reviewerPortal.directory, asset.file));
    return {
      status: 200,
      body,
      headers: { ...portalHeaders(config), "content-type": asset.contentType },
      level: "info",
    };
  } catch {
    return jsonResult(config, 503, { error: "portal_unavailable" }, "error");
  }
}
