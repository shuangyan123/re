import assert from "node:assert/strict";
import type { IncomingMessage } from "node:http";
import { test } from "node:test";

import {
  evaluateApplicationCors,
  parseApplicationCorsOrigins,
  parseTrustedProxyNetworks,
  resolveClientNetworkAddress,
} from "../src/index.js";

function request(
  remoteAddress: string | undefined,
  method: string,
  headers: Record<string, string | string[] | undefined>,
): IncomingMessage {
  return {
    method,
    headers,
    socket: { remoteAddress },
  } as unknown as IncomingMessage;
}

test("direct mode ignores spoofed forwarding headers and uses the socket peer", () => {
  const value = resolveClientNetworkAddress(
    request("203.0.113.9", "POST", { "x-forwarded-for": "198.51.100.7" }),
    [],
  );
  assert.equal(value, "203.0.113.9");
});

test("untrusted peers cannot supply a forwarded client identity", () => {
  const networks = parseTrustedProxyNetworks("127.0.0.1/32");
  const value = resolveClientNetworkAddress(
    request("203.0.113.9", "POST", {
      forwarded: "for=198.51.100.7",
      "x-forwarded-for": "198.51.100.8",
    }),
    networks,
  );
  assert.equal(value, "203.0.113.9");
});

test("trusted proxy forwarding is strict, bounded, and conflict-safe", () => {
  const networks = parseTrustedProxyNetworks("127.0.0.1/32");
  assert.equal(resolveClientNetworkAddress(
    request("127.0.0.1", "POST", { "x-forwarded-for": "198.51.100.7, 127.0.0.1" }),
    networks,
  ), "198.51.100.7");
  assert.equal(resolveClientNetworkAddress(
    request("127.0.0.1", "POST", { forwarded: "for=\"[2001:db8::7]\"" }),
    networks,
  ), "2001:db8::7");
  assert.equal(resolveClientNetworkAddress(
    request("127.0.0.1", "POST", { forwarded: "for=[2001:db8::7]:65536" }),
    networks,
  ), "127.0.0.1");
  assert.equal(resolveClientNetworkAddress(
    request("127.0.0.1", "POST", { forwarded: "for=unknown" }),
    networks,
  ), "127.0.0.1");
  assert.equal(resolveClientNetworkAddress(
    request("127.0.0.1", "POST", { "x-forwarded-for": "198.51.100.7", "x-real-ip": "198.51.100.8" }),
    networks,
  ), "127.0.0.1");
  assert.equal(resolveClientNetworkAddress(
    request("127.0.0.1", "POST", { "x-forwarded-for": "198.51.100.7".repeat(1000) }),
    networks,
  ), "127.0.0.1");
  assert.equal(resolveClientNetworkAddress(
    request("127.0.0.1", "POST", { "x-forwarded-for": ["198.51.100.7", "198.51.100.8"] }),
    networks,
  ), "127.0.0.1");
});

test("CORS policy is exact, application-only, and disabled by an empty allowlist", () => {
  const disabled = { allowedOrigins: [], maxAgeSeconds: 300 } as const;
  assert.deepEqual(
    evaluateApplicationCors(request("127.0.0.1", "OPTIONS", {
      origin: "https://apply.example.invalid",
      "access-control-request-method": "POST",
    }), "/v1/applications", disabled),
    { kind: "none" },
  );

  const policy = { allowedOrigins: ["https://apply.example.invalid"], maxAgeSeconds: 300 } as const;
  assert.deepEqual(
    evaluateApplicationCors(request("127.0.0.1", "POST", { origin: "https://apply.example.invalid" }),
      "/v1/applications", policy),
    { kind: "allow", headers: { "access-control-allow-origin": "https://apply.example.invalid", vary: "Origin" } },
  );
  assert.equal(evaluateApplicationCors(
    request("127.0.0.1", "POST", { origin: "https://other.example.invalid" }),
    "/v1/applications",
    policy,
  ).kind, "reject");
  assert.deepEqual(
    evaluateApplicationCors(request("127.0.0.1", "GET", { origin: "https://apply.example.invalid" }),
      "/v1/operator/applications", policy),
    { kind: "none" },
  );
});

test("CORS preflight permits only the narrow application method and headers", () => {
  const policy = { allowedOrigins: ["https://apply.example.invalid"], maxAgeSeconds: 120 } as const;
  const allowed = evaluateApplicationCors(request("127.0.0.1", "OPTIONS", {
    origin: "https://apply.example.invalid",
    "access-control-request-method": "POST",
    "access-control-request-headers": "content-type, idempotency-key",
  }), "/v1/applications", policy);
  assert.deepEqual(allowed, {
    kind: "preflight",
    headers: {
      "access-control-allow-origin": "https://apply.example.invalid",
      "access-control-allow-methods": "POST",
      "access-control-allow-headers": "Content-Type, Idempotency-Key",
      "access-control-max-age": "120",
      vary: "Origin",
    },
  });
  assert.equal(evaluateApplicationCors(request("127.0.0.1", "OPTIONS", {
    origin: "https://apply.example.invalid",
    "access-control-request-method": "POST",
    "access-control-request-headers": "authorization",
  }), "/v1/applications", policy).kind, "reject");
  assert.equal(evaluateApplicationCors(request("127.0.0.1", "OPTIONS", {
    origin: "https://other.example.invalid",
    "access-control-request-method": "POST",
  }), "/v1/applications", policy).kind, "reject");
});

test("exposure configuration rejects wildcards and insecure production origins", () => {
  assert.deepEqual(parseTrustedProxyNetworks(undefined), []);
  assert.deepEqual(parseApplicationCorsOrigins(undefined, true), []);
  assert.throws(() => parseTrustedProxyNetworks("proxy.example.invalid/32"));
  assert.throws(() => parseApplicationCorsOrigins("*", true));
  assert.throws(() => parseApplicationCorsOrigins("http://apply.example.invalid", true));
  assert.deepEqual(parseApplicationCorsOrigins("https://apply.example.invalid/", true), [
    "https://apply.example.invalid",
  ]);
});
