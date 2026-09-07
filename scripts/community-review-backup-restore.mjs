import { mkdtemp, readFile, rm } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

if (process.env.COMMUNITY_REVIEW_BACKUP_RESTORE !== "1") {
  process.stdout.write(JSON.stringify({ status: "skipped", reasonCode: "explicit_opt_in_required" }) + "\n");
  process.exit(0);
}

const databaseUrl = process.env.COMMUNITY_REVIEW_DATABASE_URL;
if (databaseUrl === undefined || databaseUrl.trim().length === 0) {
  process.stdout.write(JSON.stringify({ status: "failed", reasonCode: "database_required" }) + "\n");
  process.exit(1);
}

function databaseConnection(raw, databaseName) {
  const parsed = new URL(raw);
  if ((parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") || parsed.hostname.length === 0) {
    throw new Error("invalid database URL");
  }
  parsed.pathname = `/${databaseName}`;
  parsed.hash = "";
  return parsed.toString();
}

function failure(stage, reason) {
  const error = new Error("backup/restore command failed");
  error.stage = stage;
  error.reason = reason;
  return error;
}

function run(stage, command, args) {
  const result = spawnSync(command, args, { stdio: "ignore", windowsHide: true });
  if (result.error !== undefined) throw failure(stage, result.error.code ?? "spawn_error");
  if (result.status !== 0) throw failure(stage, `exit_${result.status ?? "unknown"}`);
}

function query(stage, connection, sql) {
  const result = spawnSync("psql", ["--dbname", connection, "--tuples-only", "--no-align", "--command", sql], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
    windowsHide: true,
  });
  if (result.error !== undefined) throw failure(stage, result.error.code ?? "spawn_error");
  if (result.status !== 0) throw failure(stage, `exit_${result.status ?? "unknown"}`);
  return result.stdout.trim();
}

const restoreName = `tutorbench_community_review_restore_${process.pid}_${randomUUID().replaceAll("-", "").slice(0, 12)}`;
const adminConnection = databaseConnection(databaseUrl, "postgres");
const restoreConnection = databaseConnection(databaseUrl, restoreName);
let temporaryDirectory;
let currentStage = "initialize";
try {
  temporaryDirectory = await mkdtemp(join(tmpdir(), "tutorbench-community-review-backup-"));
  const backupPath = join(temporaryDirectory, "community-review.dump");
  currentStage = "source_migration_count";
  const migrationCount = query(currentStage, databaseUrl, "SELECT COUNT(*) FROM community_review_schema_migrations");
  currentStage = "backup_dump";
  run(currentStage, "pg_dump", ["--format=custom", "--file", backupPath, "--dbname", databaseUrl]);
  currentStage = "create_restore_database";
  run(currentStage, "createdb", ["--dbname", adminConnection, restoreName]);
  try {
    currentStage = "restore_dump";
    run(currentStage, "pg_restore", ["--no-owner", "--exit-on-error", "--dbname", restoreConnection, backupPath]);
    currentStage = "restore_migration_count";
    const restoredCount = query(currentStage, restoreConnection, "SELECT COUNT(*) FROM community_review_schema_migrations");
    currentStage = "restore_service_table_check";
    const hasServiceTable = query(
      currentStage,
      restoreConnection,
      "SELECT CASE WHEN to_regclass('public.reviewer_accounts') IS NULL THEN '0' ELSE '1' END",
    );
    if (restoredCount !== migrationCount || hasServiceTable !== "1") {
      throw failure("restore_verification", "content_mismatch");
    }
  } finally {
    currentStage = "drop_restore_database";
    run(currentStage, "dropdb", ["--if-exists", "--dbname", adminConnection, restoreName]);
  }
  currentStage = "backup_file_check";
  const dumpSize = (await readFile(backupPath)).byteLength;
  if (dumpSize <= 0) throw failure(currentStage, "empty_backup");
  process.stdout.write(JSON.stringify({ status: "passed", migrationCount: Number(migrationCount), dumpBytes: dumpSize }) + "\n");
} catch (error) {
  const stage = typeof error === "object" && error !== null && "stage" in error && typeof error.stage === "string"
    ? error.stage
    : currentStage;
  const reason = typeof error === "object" && error !== null && "reason" in error && typeof error.reason === "string"
    ? error.reason
    : "unknown";
  process.stdout.write(JSON.stringify({
    status: "failed",
    reasonCode: "backup_restore_failed",
    failureStage: stage,
    failureReason: reason,
  }) + "\n");
  process.exitCode = 1;
} finally {
  if (temporaryDirectory !== undefined) await rm(temporaryDirectory, { recursive: true, force: true });
}
