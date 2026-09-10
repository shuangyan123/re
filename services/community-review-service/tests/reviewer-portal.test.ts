import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import path from "node:path";
import { test } from "node:test";

import {
  CommunityReviewConfigurationError,
  CommunityReviewLogger,
  createCommunityReviewHttpServer,
  createCommunityReviewRuntime,
  gracefulShutdown,
  loadCommunityReviewConfig,
} from "../src/index.js";

async function listen(server: Server): Promise<AddressInfo> {
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.removeAllListeners("error");
      resolve();
    });
  });
  const address = server.address();
  assert.notEqual(address, null);
  assert.equal(typeof address, "object");
  return address as AddressInfo;
}

function portalEnvironment(state: "DISABLED" | "PRIVATE" = "PRIVATE"): NodeJS.ProcessEnv {
  return {
    COMMUNITY_REVIEW_ENV: "development",
    COMMUNITY_REVIEW_STORAGE: "in-memory",
    COMMUNITY_REVIEW_AUTH_MODE: "synthetic",
    COMMUNITY_REVIEW_OPERATOR_SUBJECTS: "example-oidc|operator-portal-test",
    COMMUNITY_REVIEW_SYNTHETIC_IDENTITIES:
      "Bearer operator-portal-token=operator|example-oidc|operator-portal-test,Bearer reviewer-portal-token=reviewer|example-oidc|reviewer-portal-test",
    COMMUNITY_REVIEW_REVIEWER_PORTAL_STATE: state,
    COMMUNITY_REVIEW_REVIEWER_PORTAL_ISSUER: "https://tenant.example.invalid/",
    COMMUNITY_REVIEW_REVIEWER_PORTAL_CLIENT_ID: "reviewer-spa-client",
    COMMUNITY_REVIEW_REVIEWER_PORTAL_AUDIENCE: "https://staging.tutorbench.community-review/reviewer",
    COMMUNITY_REVIEW_REVIEWER_PORTAL_SCOPE: "reviewer:portal",
  };
}

function auth(token: string): Record<string, string> {
  return { authorization: `Bearer ${token}` };
}

test("reviewer portal configuration fails closed and exposes only public browser settings", async () => {
  const defaults = loadCommunityReviewConfig({ env: portalEnvironment("DISABLED") });
  assert.equal(defaults.reviewerPortal.state, "DISABLED");
  assert.equal(defaults.reviewerPortal.portalPath, "/reviewer/");
  assert.equal(defaults.reviewerPortal.callbackPath, "/reviewer/callback");
  assert.equal(defaults.reviewerPortal.issuer, undefined);

  assert.throws(
    () => loadCommunityReviewConfig({
      env: { ...portalEnvironment("DISABLED"), COMMUNITY_REVIEW_REVIEWER_PORTAL_STATE: "PUBLIC" },
    }),
    (error: unknown) => error instanceof CommunityReviewConfigurationError &&
      error.code === "invalid_reviewer_portal_state",
  );
  assert.throws(
    () => loadCommunityReviewConfig({
      env: {
        ...portalEnvironment("PRIVATE"),
        COMMUNITY_REVIEW_REVIEWER_PORTAL_CLIENT_ID: undefined,
      },
    }),
    (error: unknown) => error instanceof CommunityReviewConfigurationError &&
      error.code === "reviewer_portal_invalid",
  );

  const runtime = createCommunityReviewRuntime(loadCommunityReviewConfig({ env: portalEnvironment() }));
  const server = createCommunityReviewHttpServer(runtime, new CommunityReviewLogger("error"));
  const address = await listen(server);
  try {
    const response = await fetch(`http://127.0.0.1:${address.port}/reviewer/config.json`);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.equal(response.headers.get("access-control-allow-origin"), null);
    const body = await response.json() as Record<string, unknown>;
    assert.deepEqual(body, {
      enabled: true,
      issuer: "https://tenant.example.invalid/",
      clientId: "reviewer-spa-client",
      audience: "https://staging.tutorbench.community-review/reviewer",
      scope: "reviewer:portal",
      portalPath: "/reviewer/",
      callbackPath: "/reviewer/callback",
    });
    assert.equal("operatorClientId" in body, false);
    assert.equal("operatorSubject" in body, false);
    assert.equal("databaseUrl" in body, false);
  } finally {
    await gracefulShutdown(server, runtime, 1000);
  }
});

test("generated portal artifacts keep browser credentials and third-party surface bounded", async () => {
  const portalDirectory = path.resolve(process.cwd(), "services/community-review-service/dist/portal");
  const html = await readFile(path.join(portalDirectory, "index.html"), "utf8");
  const script = await readFile(path.join(portalDirectory, "portal.js"), "utf8");
  const vendorFiles = await readdir(path.join(portalDirectory, "vendor"));
  assert.equal(/<script(?![^>]+\bsrc=)/u.test(html), false);
  assert.equal(/https?:\/\//u.test(html), false);
  for (const forbidden of [
    "localStorage",
    "sessionStorage",
    "indexedDB",
    "document.cookie",
    "innerHTML",
    "console.",
    "client_secret",
    "operator:review",
    "postgresql://",
  ]) {
    assert.equal(script.includes(forbidden), false, `portal.js contains ${forbidden}`);
  }
  assert.equal(/Bearer\s+eyJ[A-Za-z0-9_-]{20,}\./u.test(script), false);
  assert.equal(vendorFiles.includes("auth0-spa-js.LICENSE.txt"), true);
  assert.equal(vendorFiles.some((file) => file.endsWith(".map")), false);
});

test("reviewer portal serves a fixed same-origin asset surface with hardened headers", async () => {
  const disabledRuntime = createCommunityReviewRuntime(loadCommunityReviewConfig({
    env: portalEnvironment("DISABLED"),
  }));
  const disabledServer = createCommunityReviewHttpServer(disabledRuntime, new CommunityReviewLogger("error"));
  const disabledAddress = await listen(disabledServer);
  try {
    const config = await fetch(`http://127.0.0.1:${disabledAddress.port}/reviewer/config.json`);
    assert.equal(config.status, 200);
    assert.deepEqual(await config.json(), {
      enabled: false,
      portalPath: "/reviewer/",
      callbackPath: "/reviewer/callback",
    });
    const page = await fetch(`http://127.0.0.1:${disabledAddress.port}/reviewer/`);
    assert.equal(page.status, 200);
    assert.match(await page.text(), /private reviewer workspace/iu);
    assert.equal(page.headers.get("content-security-policy")?.includes("script-src 'self'"), true);
    assert.equal(page.headers.get("x-content-type-options"), "nosniff");
    assert.equal(page.headers.get("x-frame-options"), "DENY");
    assert.equal(page.headers.get("referrer-policy"), "no-referrer");
    assert.equal(page.headers.get("x-robots-tag"), "noindex, nofollow");
    const callback = await fetch(`http://127.0.0.1:${disabledAddress.port}/reviewer/callback`);
    assert.equal(callback.status, 200);
    const favicon = await fetch(`http://127.0.0.1:${disabledAddress.port}/reviewer/favicon.svg`);
    assert.equal(favicon.status, 200);
    assert.equal(favicon.headers.get("content-type"), "image/svg+xml");
    const method = await fetch(`http://127.0.0.1:${disabledAddress.port}/reviewer/`, { method: "POST" });
    assert.equal(method.status, 405);
    assert.equal(method.headers.get("allow"), "GET");
    const unknown = await fetch(`http://127.0.0.1:${disabledAddress.port}/reviewer/not-an-asset`);
    assert.equal(unknown.status, 404);
  } finally {
    await gracefulShutdown(disabledServer, disabledRuntime, 1000);
  }
});

test("reviewer session bootstrap is coarse, channel-bound, and generic for unmapped accounts", async () => {
  const runtime = createCommunityReviewRuntime(loadCommunityReviewConfig({ env: portalEnvironment() }));
  const server = createCommunityReviewHttpServer(runtime, new CommunityReviewLogger("error"));
  const address = await listen(server);
  const base = `http://127.0.0.1:${address.port}`;
  try {
    const unauthenticated = await fetch(`${base}/v1/reviewer/session`);
    assert.equal(unauthenticated.status, 401);

    const unmapped = await fetch(`${base}/v1/reviewer/session`, {
      headers: auth("reviewer-portal-token"),
    });
    assert.equal(unmapped.status, 403);
    const unmappedBody = await unmapped.json() as Record<string, unknown>;
    assert.equal(unmappedBody.error, "reviewer_access_not_enabled");
    assert.deepEqual(unmappedBody.reasonCodes, ["reviewer_access_not_enabled"]);
    assert.equal("principal" in unmappedBody, false);
    assert.equal("subject" in unmappedBody, false);

    const wrongChannel = await fetch(`${base}/v1/reviewer/session`, {
      headers: auth("operator-portal-token"),
    });
    assert.equal(wrongChannel.status, 403);
    const wrongChannelBody = await wrongChannel.json() as Record<string, unknown>;
    assert.equal(wrongChannelBody.error, "reviewer_not_authorized");
    assert.deepEqual(wrongChannelBody.reasonCodes, ["reviewer_not_authorized"]);

    const provisioned = await fetch(`${base}/v1/operator/reviewers`, {
      method: "POST",
      headers: { ...auth("operator-portal-token"), "content-type": "application/json" },
      body: JSON.stringify({ principal: { provider: "example-oidc", subject: "reviewer-portal-test" } }),
    });
    assert.equal(provisioned.status, 200);

    const active = await fetch(`${base}/v1/reviewer/session`, {
      headers: auth("reviewer-portal-token"),
    });
    assert.equal(active.status, 200);
    const activeBody = await active.json() as { data: Record<string, unknown> };
    assert.deepEqual(activeBody.data, {
      reviewerAccess: "ENABLED",
      consentState: "NOT_CONSENTED",
    });
    assert.equal("reviewerId" in activeBody.data, false);
    assert.equal("subject" in activeBody.data, false);
    assert.equal("email" in activeBody.data, false);

    const withdrawn = await fetch(`${base}/v1/reviewer/account/withdraw`, {
      method: "POST",
      headers: auth("reviewer-portal-token"),
    });
    assert.equal(withdrawn.status, 200);
    const withdrawnSession = await fetch(`${base}/v1/reviewer/session`, {
      headers: auth("reviewer-portal-token"),
    });
    assert.equal(withdrawnSession.status, 403);
    const withdrawnBody = await withdrawnSession.json() as Record<string, unknown>;
    assert.equal(withdrawnBody.error, "reviewer_access_not_enabled");
    assert.deepEqual(withdrawnBody.reasonCodes, ["reviewer_access_not_enabled"]);
  } finally {
    await gracefulShutdown(server, runtime, 1000);
  }
});
