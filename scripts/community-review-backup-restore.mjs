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

function run(command, args) {
  const result = spawnSync(command, args, { stdio: "ignore", windowsHide: true });
  if (result.error !== undefined || result.status !== 0) throw new Error("database command failed");
}

function query(connection, sql) {
  const result = spawnSync("psql", ["--dbname", connection, "--tuples-only", "--no-align", "--command", sql], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
    windowsHide: true,
  });
  if (result.error !== undefined || result.status !== 0) throw new Error("database query failed");
  return result.stdout.trim();
}

const restoreName = `tutorbench_community_review_restore_${process.pid}_${randomUUID().replaceAll("-", "").slice(0, 12)}`;
const adminConnection = databaseConnection(databaseUrl, "postgres");
const restoreConnection = databaseConnection(databaseUrl, restoreName);
let temporaryDirectory;
try {
  temporaryDirectory = await mkdtemp(join(tmpdir(), "tutorbench-community-review-backup-"));
  const backupPath = join(temporaryDirectory, "community-review.dump");
  const migrationCount = query(databaseUrl, "SELECT COUNT(*) FROM community_review_schema_migrations");
  run("pg_dump", ["--format=custom", "--file", backupPath, "--dbname", databaseUrl]);
  run("createdb", ["--dbname", adminConnection, restoreName]);
  try {
    run("pg_restore", ["--no-owner", "--exit-on-error", "--dbname", restoreConnection, backupPath]);
    const restoredCount = query(restoreConnection, "SELECT COUNT(*) FROM community_review_schema_migrations");
    const hasServiceTable = query(
      restoreConnection,
      "SELECT CASE WHEN to_regclass('public.reviewer_accounts') IS NULL THEN '0' ELSE '1' END",
    );
    if (restoredCount !== migrationCount || hasServiceTable !== "1") throw new Error("backup verification failed");
  } finally {
    run("dropdb", ["--if-exists", "--dbname", adminConnection, restoreName]);
  }
  const dumpSize = (await readFile(backupPath)).byteLength;
  if (dumpSize <= 0) throw new Error("empty backup");
  process.stdout.write(JSON.stringify({ status: "passed", migrationCount: Number(migrationCount), dumpBytes: dumpSize }) + "\n");
} catch {
  process.stdout.write(JSON.stringify({ status: "failed", reasonCode: "backup_restore_failed" }) + "\n");
  process.exitCode = 1;
} finally {
  if (temporaryDirectory !== undefined) await rm(temporaryDirectory, { recursive: true, force: true });
}
