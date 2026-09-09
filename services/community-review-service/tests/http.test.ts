import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { request as httpRequest } from "node:http";
import type { Server } from "node:http";
import type { RequestOptions } from "node:http";
import { test } from "node:test";

import {
  CommunityReviewLogger,
  createCommunityReviewHttpServer,
  createCommunityReviewRuntime,
  gracefulShutdown,
  loadCommunityReviewConfig,
} from "../src/index.js";

async function listen(server: Server): Promise<AddressInfo> {
  await new Promise<void>((resolvePromise, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.removeAllListeners("error");
      resolvePromise();
    });
  });
  const address = server.address();
  assert.notEqual(address, null);
  assert.equal(typeof address, "object");
  return address as AddressInfo;
}

function auth(token: string): Record<string, string> {
  return { authorization: `Bearer ${token}` };
}

function jsonAuth(token: string): Record<string, string> {
  return {
    ...auth(token),
    "content-type": "application/json",
  };
}

function runtimeForHttp() {
  const config = loadCommunityReviewConfig({
    env: {
      COMMUNITY_REVIEW_ENV: "development",
      COMMUNITY_REVIEW_STORAGE: "in-memory",
      COMMUNITY_REVIEW_AUTH_MODE: "synthetic",
      COMMUNITY_REVIEW_OPERATOR_SUBJECTS: "example-oidc|operator-http",
      COMMUNITY_REVIEW_SYNTHETIC_IDENTITIES:
        "Bearer operator-token=example-oidc|operator-http,Bearer reviewer-token=example-oidc|reviewer-http",
      COMMUNITY_REVIEW_REQUEST_BODY_LIMIT_BYTES: "4096",
    },
  });
  return createCommunityReviewRuntime(config);
}

test("invite-only HTTP transport provisions only through operator authority and omits private auth mapping", async () => {
  const runtime = runtimeForHttp();
  const server = createCommunityReviewHttpServer(runtime, new CommunityReviewLogger("error"));
  const address = await listen(server);
  const base = `http://127.0.0.1:${address.port}`;
  try {
    const unauthenticated = await fetch(`${base}/v1/operator/reviewers`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ principal: { provider: "example-oidc", subject: "reviewer-http" } }),
    });
    assert.equal(unauthenticated.status, 401);
    assert.equal((await unauthenticated.json() as { error: string }).error, "authentication_required");

    const reviewerCannotProvision = await fetch(`${base}/v1/operator/reviewers`, {
      method: "POST",
      headers: jsonAuth("reviewer-token"),
      body: JSON.stringify({ principal: { provider: "example-oidc", subject: "reviewer-http" } }),
    });
    assert.equal(reviewerCannotProvision.status, 403);
    assert.equal((await reviewerCannotProvision.json() as { error: string }).error, "operator_not_authorized");

    const provisioned = await fetch(`${base}/v1/operator/reviewers`, {
      method: "POST",
      headers: jsonAuth("operator-token"),
      body: JSON.stringify({ principal: { provider: "example-oidc", subject: "reviewer-http" } }),
    });
    assert.equal(provisioned.status, 200);
    const provisionedBody = await provisioned.json() as {
      data: Record<string, unknown>;
    };
    assert.equal(provisionedBody.data.status, "ACTIVE");
    assert.equal(typeof provisionedBody.data.reviewerId, "string");
    assert.equal("privateAuthSubjectReference" in provisionedBody.data, false);
    assert.equal("internalId" in provisionedBody.data, false);
  } finally {
    await gracefulShutdown(server, runtime, 1000);
  }
});

test("reviewer HTTP transport derives ownership from bearer authentication and manages consent", async () => {
  const runtime = runtimeForHttp();
  const server = createCommunityReviewHttpServer(runtime, new CommunityReviewLogger("error"));
  const address = await listen(server);
  const base = `http://127.0.0.1:${address.port}`;
  try {
    const provisioned = await fetch(`${base}/v1/operator/reviewers`, {
      method: "POST",
      headers: jsonAuth("operator-token"),
      body: JSON.stringify({ principal: { provider: "example-oidc", subject: "reviewer-http" } }),
    });
    assert.equal(provisioned.status, 200);

    const before = await fetch(`${base}/v1/reviewer/consent`, {
      headers: auth("reviewer-token"),
    });
    assert.equal(before.status, 200);
    assert.equal((await before.json() as { data: { state: string } }).data.state, "NOT_CONSENTED");

    const accepted = await fetch(`${base}/v1/reviewer/consent`, {
      method: "PUT",
      headers: auth("reviewer-token"),
    });
    assert.equal(accepted.status, 200);
    assert.equal((await accepted.json() as { data: { state: string } }).data.state, "CONSENTED");

    const revoked = await fetch(`${base}/v1/reviewer/consent`, {
      method: "DELETE",
      headers: auth("reviewer-token"),
    });
    assert.equal(revoked.status, 200);
    assert.equal((await revoked.json() as { data: { state: string } }).data.state, "REVOKED");
  } finally {
    await gracefulShutdown(server, runtime, 1000);
  }
});

test("reviewer account withdrawal response omits private service identifiers", async () => {
  const runtime = runtimeForHttp();
  const server = createCommunityReviewHttpServer(runtime, new CommunityReviewLogger("error"));
  const address = await listen(server);
  const base = `http://127.0.0.1:${address.port}`;
  try {
    const provisioned = await fetch(`${base}/v1/operator/reviewers`, {
      method: "POST",
      headers: jsonAuth("operator-token"),
      body: JSON.stringify({ principal: { provider: "example-oidc", subject: "reviewer-http" } }),
    });
    assert.equal(provisioned.status, 200);

    const withdrawn = await fetch(`${base}/v1/reviewer/account/withdraw`, {
      method: "POST",
      headers: auth("reviewer-token"),
    });
    assert.equal(withdrawn.status, 200);
    const body = await withdrawn.json() as { data: Record<string, unknown> };
    assert.equal(body.data.status, "WITHDRAWN");
    assert.equal("privateAuthSubjectReference" in body.data, false);
    assert.equal("internalId" in body.data, false);
  } finally {
    await gracefulShutdown(server, runtime, 1000);
  }
});

test("HTTP transport fails closed for unknown routes, wrong methods, malformed JSON, and oversized bodies", async () => {
  const runtime = runtimeForHttp();
  const server = createCommunityReviewHttpServer(runtime, new CommunityReviewLogger("error"));
  const address = await listen(server);
  const base = `http://127.0.0.1:${address.port}`;
  try {
    const unknown = await fetch(`${base}/v1/reviewer/private-data`, {
      headers: auth("reviewer-token"),
    });
    assert.equal(unknown.status, 404);

    const wrongMethod = await fetch(`${base}/v1/reviewer/consent`, {
      method: "PATCH",
      headers: auth("reviewer-token"),
    });
    assert.equal(wrongMethod.status, 405);
    assert.equal(wrongMethod.headers.get("allow"), "DELETE, GET, PUT");

    const malformed = await fetch(`${base}/v1/operator/reviewers`, {
      method: "POST",
      headers: jsonAuth("operator-token"),
      body: "{",
    });
    assert.equal(malformed.status, 400);
    assert.equal((await malformed.json() as { error: string }).error, "invalid_json");

    const wrongMedia = await fetch(`${base}/v1/operator/reviewers`, {
      method: "POST",
      headers: {
        ...auth("operator-token"),
        "content-type": "text/plain",
      },
      body: "{}",
    });
    assert.equal(wrongMedia.status, 415);

    const oversized = await fetch(`${base}/v1/operator/reviewers`, {
      method: "POST",
      headers: jsonAuth("operator-token"),
      body: JSON.stringify({ filler: "x".repeat(5000) }),
    });
    assert.equal(oversized.status, 413);
  } finally {
    await gracefulShutdown(server, runtime, 1000);
  }
});

test("HTTP transport rejects duplicated security-sensitive headers", async () => {
  const runtime = runtimeForHttp();
  const server = createCommunityReviewHttpServer(runtime, new CommunityReviewLogger("error"));
  const address = await listen(server);
  try {
    const result = await new Promise<{ readonly status: number; readonly body: string }>((resolve, reject) => {
      const options = {
        hostname: "127.0.0.1",
        port: address.port,
        path: "/health/live",
        method: "GET",
        headers: { origin: ["https://one.example.invalid", "https://two.example.invalid"] },
      } as unknown as RequestOptions;
      const client = httpRequest(options, (response) => {
        const chunks: Buffer[] = [];
        response.on("data", (chunk: Buffer) => chunks.push(chunk));
        response.on("end", () => resolve({
          status: response.statusCode ?? 0,
          body: Buffer.concat(chunks).toString("utf8"),
        }));
      });
      client.once("error", reject);
      client.end();
    });
    assert.equal(result.status, 400);
    assert.match(result.body, /ambiguous_header/u);
  } finally {
    await gracefulShutdown(server, runtime, 1000);
  }
});
