import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import type {
  IncomingMessage,
  Server,
  ServerResponse,
} from "node:http";

import type { PoolConfig } from "pg";

import {
  CommunityReviewApplicationService,
} from "./application.js";
import {
  ApplicationSubmissionRateLimiter,
  CommunityReviewApplicationIntakeApplicationService,
  CommunityReviewApplicationIntakeService,
} from "./application-intake.js";
import {
  ConfiguredOperatorAuthorizer,
  OidcJwtAuthenticationAdapter,
} from "./oidc.js";
import {
  PostgreSQLCommunityReviewRepository,
} from "./postgres-repository.js";
import type { CommunityReviewPersistence } from "./persistence.js";
import {
  InMemoryCommunityReviewRepository,
} from "./in-memory-repository.js";
import {
  FilesystemQualificationMaterialStore,
  FilesystemReviewBatchMaterialStore,
  assertPrivateMaterialRootUsable,
} from "./filesystem-material.js";
import {
  SyntheticAuthenticationAdapter,
} from "./authentication.js";
import type {
  AuthenticationAdapter,
  OperatorAuthorizer,
} from "./authentication.js";
import { StaticOperatorAuthorizer } from "./authentication.js";
import { CommunityReviewService } from "./service.js";
import {
  CommunityReviewConfigurationError,
  type CommunityReviewLogLevel,
  type CommunityReviewServiceConfig,
} from "./config.js";
import {
  MigrationVerificationError,
} from "./migrations.js";
import { handleCommunityReviewApiRequest } from "./http.js";

export interface CommunityReviewReadinessResult {
  readonly ready: boolean;
  readonly reasonCodes: readonly string[];
  readonly checkedAt: string;
}

export interface CommunityReviewRuntime {
  readonly config: CommunityReviewServiceConfig;
  readonly persistence: CommunityReviewPersistence;
  readonly service: CommunityReviewService;
  readonly application: CommunityReviewApplicationService;
  readonly applicationIntake: CommunityReviewApplicationIntakeApplicationService;
  readonly checkReadiness: () => Promise<CommunityReviewReadinessResult>;
  readonly close: () => Promise<void>;
}

function createAuthentication(config: CommunityReviewServiceConfig): AuthenticationAdapter {
  if (config.authMode === "oidc") {
    if (config.oidc === undefined) throw new CommunityReviewConfigurationError("oidc_required");
    return new OidcJwtAuthenticationAdapter(config.oidc);
  }
  return new SyntheticAuthenticationAdapter(config.syntheticIdentities);
}

function createOperatorAuthorizer(config: CommunityReviewServiceConfig): OperatorAuthorizer {
  if (config.operatorPrincipals.length === 0) return new StaticOperatorAuthorizer([]);
  return new ConfiguredOperatorAuthorizer(config.operatorPrincipals);
}

export function createCommunityReviewPostgresRepository(
  config: CommunityReviewServiceConfig,
): PostgreSQLCommunityReviewRepository {
  if (config.databaseUrl === undefined) throw new CommunityReviewConfigurationError("database_required");
  const poolConfig: Omit<PoolConfig, "connectionString"> = {
    max: 10,
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 30000,
    ssl: config.databaseSsl ? { rejectUnauthorized: config.databaseSslRejectUnauthorized } : false,
  };
  return new PostgreSQLCommunityReviewRepository({
    connectionString: config.databaseUrl,
    poolConfig,
    migrationsDirectory: config.migrationsDirectory,
  });
}

/** Construct the service graph without running migrations or opening a port. */
export function createCommunityReviewRuntime(config: CommunityReviewServiceConfig): CommunityReviewRuntime {
  if (config.environment === "production") {
    if (config.storage !== "postgres" || config.databaseUrl === undefined) {
      throw new CommunityReviewConfigurationError("database_required");
    }
    if (!config.databaseSsl || !config.databaseSslRejectUnauthorized) {
      throw new CommunityReviewConfigurationError("database_tls_required");
    }
    if (config.authMode !== "oidc" || config.oidc === undefined) {
      throw new CommunityReviewConfigurationError("oidc_required");
    }
    if (config.oidc.allowInsecureHttp) {
      throw new CommunityReviewConfigurationError("oidc_invalid");
    }
    if (config.operatorPrincipals.length === 0) {
      throw new CommunityReviewConfigurationError("operator_allowlist_required");
    }
    if (config.privateMaterialRoot === undefined) {
      throw new CommunityReviewConfigurationError("material_root_required");
    }
  }
  const postgres = config.storage === "postgres" ? createCommunityReviewPostgresRepository(config) : undefined;
  const persistence: CommunityReviewPersistence = postgres ?? new InMemoryCommunityReviewRepository();
  const qualificationMaterialStore = config.privateMaterialRoot === undefined
    ? undefined
    : new FilesystemQualificationMaterialStore(config.privateMaterialRoot);
  const reviewBatchMaterialStore = config.privateMaterialRoot === undefined
    ? undefined
    : new FilesystemReviewBatchMaterialStore(config.privateMaterialRoot);
  const service = new CommunityReviewService(persistence, {
    ...(qualificationMaterialStore === undefined ? {} : { qualificationMaterialStore }),
    ...(reviewBatchMaterialStore === undefined ? {} : { reviewBatchMaterialStore }),
  });
  const authentication = createAuthentication(config);
  const operatorAuthorizer = createOperatorAuthorizer(config);
  const application = new CommunityReviewApplicationService(
    service,
    authentication,
    operatorAuthorizer,
  );
  const applicationIntake = new CommunityReviewApplicationIntakeApplicationService(
    new CommunityReviewApplicationIntakeService(persistence, {
      intakeState: config.applicationIntakeState,
      rateLimiter: new ApplicationSubmissionRateLimiter({
        maximumRequests: config.applicationRateLimitMaximumRequests,
        windowMs: config.applicationRateLimitWindowMs,
      }),
    }),
    authentication,
    operatorAuthorizer,
  );
  let closed = false;

  const checkReadiness = async (): Promise<CommunityReviewReadinessResult> => {
    const reasonCodes: string[] = [];
    if (postgres !== undefined) {
      try {
        await postgres.ping();
      } catch {
        reasonCodes.push("database_unavailable");
      }
      if (reasonCodes.length === 0) {
        try {
          await postgres.verifyMigrations();
        } catch (error) {
          reasonCodes.push(error instanceof MigrationVerificationError
            ? `migration_${error.code}`
            : "migration_verification_failed");
        }
      }
    } else if (config.environment === "production") {
      reasonCodes.push("production_storage_not_postgres");
    } else {
      reasonCodes.push("in_memory_non_production");
    }
    if (config.privateMaterialRoot !== undefined) {
      try {
        await assertPrivateMaterialRootUsable(config.privateMaterialRoot);
      } catch {
        reasonCodes.push("private_material_unavailable");
      }
    } else if (config.environment === "production") {
      reasonCodes.push("private_material_not_configured");
    }
    return {
      ready: reasonCodes.length === 0 ||
        (config.environment !== "production" && reasonCodes.length === 1 && reasonCodes[0] === "in_memory_non_production"),
      reasonCodes,
      checkedAt: new Date().toISOString(),
    };
  };

  const close = async (): Promise<void> => {
    if (closed) return;
    closed = true;
    if (postgres !== undefined) await postgres.close();
  };
  return { config, persistence, service, application, applicationIntake, checkReadiness, close };
}

export interface CommunityReviewLogEvent {
  readonly level: CommunityReviewLogLevel;
  readonly event: string;
  readonly requestId?: string;
  readonly route?: string;
  readonly status?: number;
  readonly durationMs?: number;
  readonly reasonCodes?: readonly string[];
}

const logRank: Record<CommunityReviewLogLevel, number> = { info: 1, warn: 2, error: 3 };

/** JSON logs deliberately accept only non-sensitive operational fields. */
export class CommunityReviewLogger {
  constructor(private readonly minimumLevel: CommunityReviewLogLevel = "info") {}

  write(event: CommunityReviewLogEvent): void {
    if (logRank[event.level] < logRank[this.minimumLevel]) return;
    process.stdout.write(`${JSON.stringify({
      timestamp: new Date().toISOString(),
      level: event.level,
      event: event.event,
      ...(event.requestId === undefined ? {} : { requestId: event.requestId }),
      ...(event.route === undefined ? {} : { route: event.route }),
      ...(event.status === undefined ? {} : { status: event.status }),
      ...(event.durationMs === undefined ? {} : { durationMs: event.durationMs }),
      ...(event.reasonCodes === undefined ? {} : { reasonCodes: event.reasonCodes }),
    })}\n`);
  }
}

function respond(
  response: ServerResponse,
  status: number,
  requestId: string,
  body: Record<string, unknown>,
): void {
  if (response.writableEnded) return;
  response.statusCode = status;
  response.setHeader("cache-control", "no-store");
  response.setHeader("x-content-type-options", "nosniff");
  response.setHeader("referrer-policy", "no-referrer");
  if (status === 204) {
    response.setHeader("content-length", "0");
    response.end();
    return;
  }
  const payload = JSON.stringify({ requestId, ...body });
  response.setHeader("content-type", "application/json; charset=utf-8");
  response.setHeader("content-length", Buffer.byteLength(payload));
  response.end(payload);
}

function requestPath(request: IncomingMessage): string {
  try {
    return new URL(request.url ?? "/", "http://community-review.invalid").pathname;
  } catch {
    return "<invalid>";
  }
}

function contentLength(request: IncomingMessage): number | "invalid" | undefined {
  const distinct = request.headersDistinct?.["content-length"];
  if (distinct !== undefined && distinct.length !== 1) return "invalid";
  const header = request.headers["content-length"];
  if (header === undefined) return undefined;
  if (Array.isArray(header) || !/^\d+$/u.test(header)) return "invalid";
  const parsed = Number(header);
  return Number.isSafeInteger(parsed) ? parsed : "invalid";
}

const rejectDuplicateHeaders = [
  "content-length",
  "transfer-encoding",
  "content-type",
  "idempotency-key",
  "authorization",
  "origin",
  "access-control-request-method",
  "access-control-request-headers",
  "forwarded",
  "x-forwarded-for",
  "x-real-ip",
  "x-forwarded-host",
  "host",
] as const;

function hasAmbiguousDuplicateHeader(request: IncomingMessage): boolean {
  return rejectDuplicateHeaders.some((name) => {
    const distinct = request.headersDistinct?.[name];
    return (distinct !== undefined && distinct.length !== 1) || Array.isArray(request.headers[name]);
  });
}

export function createCommunityReviewHttpServer(
  runtime: CommunityReviewRuntime,
  logger = new CommunityReviewLogger(runtime.config.logLevel),
): Server {
  return createServer((request, response) => {
    const started = Date.now();
    const requestId = randomUUID();
    const route = requestPath(request);
    const finish = (status: number, body: Record<string, unknown>, level: CommunityReviewLogLevel = "info"): void => {
      respond(response, status, requestId, body);
      logger.write({
        level,
        event: "http_request",
        requestId,
        route,
        status,
        durationMs: Date.now() - started,
        ...(Array.isArray(body.reasonCodes) ? { reasonCodes: body.reasonCodes.filter((item): item is string => typeof item === "string") } : {}),
      });
    };
    if (hasAmbiguousDuplicateHeader(request)) {
      request.resume();
      finish(400, { error: "invalid_request", reasonCodes: ["ambiguous_header"] }, "warn");
      return;
    }
    const length = contentLength(request);
    if (length === "invalid") {
      request.resume();
      finish(400, { error: "invalid_request" }, "warn");
      return;
    }
    if (length !== undefined && length > runtime.config.requestBodyLimitBytes) {
      request.resume();
      finish(413, { error: "request_too_large" }, "warn");
      return;
    }
    if (route.startsWith("/v1/")) {
      void handleCommunityReviewApiRequest(
        runtime.application,
        runtime.applicationIntake,
        request,
        route,
        runtime.config.requestBodyLimitBytes,
        {
          trustedProxyNetworks: runtime.config.trustedProxyNetworks,
          applicationCors: runtime.config.applicationCors,
        },
      ).then((result) => {
        if (result === undefined) {
          request.resume();
          finish(404, { error: "not_found" }, "warn");
          return;
        }
        if (result.headers !== undefined) {
          for (const [name, value] of Object.entries(result.headers)) response.setHeader(name, value);
        }
        finish(result.status, result.body, result.level ?? "info");
      }).catch(() => {
        finish(500, { error: "internal_error", reasonCodes: ["internal_error"] }, "error");
      });
      return;
    }
    if (request.method !== "GET") {
      request.resume();
      response.setHeader("allow", "GET");
      finish(405, { error: "method_not_allowed" }, "warn");
      return;
    }
    if (route === "/health/live") {
      request.resume();
      finish(200, { status: "live" });
      return;
    }
    if (route === "/health/ready") {
      request.resume();
      void runtime.checkReadiness().then((readiness) => {
        finish(readiness.ready ? 200 : 503, {
          status: readiness.ready ? "ready" : "not_ready",
          reasonCodes: readiness.reasonCodes,
        }, readiness.ready ? "info" : "warn");
      }).catch(() => {
        finish(503, { status: "not_ready", reasonCodes: ["readiness_check_failed"] }, "warn");
      });
      return;
    }
    request.resume();
    finish(404, { error: "not_found" }, "warn");
  });
}

export async function listenCommunityReviewServer(
  server: Server,
  config: CommunityReviewServiceConfig,
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const onError = (error: Error): void => {
      server.off("listening", onListening);
      reject(error);
    };
    const onListening = (): void => {
      server.off("error", onError);
      resolve();
    };
    server.once("error", onError);
    server.once("listening", onListening);
    server.listen(config.port, config.host);
  });
}

export async function gracefulShutdown(
  server: Server,
  runtime: CommunityReviewRuntime,
  timeoutMs: number,
): Promise<void> {
  let serverClosed = false;
  const serverClose = new Promise<void>((resolve) => {
    server.close(() => {
      serverClosed = true;
      resolve();
    });
  });
  const timeout = new Promise<void>((resolve) => {
    setTimeout(resolve, timeoutMs).unref();
  });
  await Promise.race([serverClose, timeout]);
  if (!serverClosed && typeof server.closeAllConnections === "function") server.closeAllConnections();
  await Promise.race([runtime.close(), timeout]);
}
