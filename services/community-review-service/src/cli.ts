import {
  CommunityReviewConfigurationError,
  loadCommunityReviewConfig,
} from "./config.js";
import {
  MigrationExecutionError,
  MigrationVerificationError,
} from "./migrations.js";
import {
  CommunityReviewLogger,
  createCommunityReviewHttpServer,
  createCommunityReviewPostgresRepository,
  createCommunityReviewRuntime,
  gracefulShutdown,
  listenCommunityReviewServer,
} from "./runtime.js";

function output(value: Record<string, unknown>): void {
  process.stdout.write(`${JSON.stringify(value)}\n`);
}

function failureReason(error: unknown): string {
  if (error instanceof CommunityReviewConfigurationError) return `configuration_${error.code}`;
  if (error instanceof MigrationVerificationError) return `migration_${error.code}`;
  if (error instanceof MigrationExecutionError) return "migration_execution_failed";
  return "runtime_failure";
}

async function migrate(): Promise<void> {
  const config = loadCommunityReviewConfig({ command: "migrate" });
  if (config.storage !== "postgres") {
    throw new CommunityReviewConfigurationError("database_required");
  }
  const repository = createCommunityReviewPostgresRepository(config);
  try {
    const status = await repository.migrate();
    output({
      status: "migrated",
      currentVersion: status.currentVersion,
      knownMigrationCount: status.knownMigrationCount,
      appliedMigrationCount: status.appliedMigrationCount,
    });
  } finally {
    await repository.close();
  }
}

async function readiness(): Promise<void> {
  const config = loadCommunityReviewConfig({ command: "readiness" });
  const runtime = createCommunityReviewRuntime(config);
  try {
    const result = await runtime.checkReadiness();
    output({ status: result.ready ? "ready" : "not_ready", reasonCodes: result.reasonCodes });
    if (!result.ready) process.exitCode = 1;
  } finally {
    await runtime.close();
  }
}

async function serve(): Promise<void> {
  const config = loadCommunityReviewConfig({ command: "serve" });
  const runtime = createCommunityReviewRuntime(config);
  const logger = new CommunityReviewLogger(config.logLevel);
  const server = createCommunityReviewHttpServer(runtime, logger);
  let stopping = false;
  const stop = async (signal: string): Promise<void> => {
    if (stopping) return;
    stopping = true;
    logger.write({ level: "info", event: "shutdown_requested", reasonCodes: [signal] });
    await gracefulShutdown(server, runtime, config.shutdownTimeoutMs);
  };
  process.once("SIGINT", () => { void stop("SIGINT"); });
  process.once("SIGTERM", () => { void stop("SIGTERM"); });
  try {
    await listenCommunityReviewServer(server, config);
    logger.write({ level: "info", event: "server_started" });
  } catch (error) {
    await runtime.close();
    throw error;
  }
}

async function main(): Promise<void> {
  const command = process.argv[2] ?? "serve";
  if (command === "migrate") return migrate();
  if (command === "readiness") return readiness();
  if (command === "serve") return serve();
  throw new CommunityReviewConfigurationError("invalid_runtime_value");
}

void main().catch((error: unknown) => {
  output({ status: "failed", reasonCode: failureReason(error) });
  process.exitCode = 1;
});
