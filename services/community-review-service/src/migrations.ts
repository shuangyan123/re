import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";

import type { Pool, PoolClient } from "pg";

const MIGRATION_LOCK_NAME = "tutorbench.community-review.schema-migrations";
const MIGRATION_HISTORY_TABLE = "community_review_schema_migrations";

export type MigrationVerificationCode =
  | "migration_history_missing"
  | "migration_checksum_drift"
  | "missing_historical_migration"
  | "migration_set_invalid"
  | "migration_not_applied";

export class MigrationVerificationError extends Error {
  readonly code: MigrationVerificationCode;

  constructor(code: MigrationVerificationCode) {
    super(`Community Review migration verification failed: ${code}.`);
    this.name = "MigrationVerificationError";
    this.code = code;
  }
}

export class MigrationExecutionError extends Error {
  readonly version: number;

  constructor(version: number) {
    super(`Community Review migration ${version} failed.`);
    this.name = "MigrationExecutionError";
    this.version = version;
  }
}

export interface CommunityReviewMigration {
  readonly version: number;
  readonly filename: string;
  readonly sha256: string;
  readonly sql: string;
}

export interface MigrationStatus {
  readonly currentVersion: number;
  readonly knownMigrationCount: number;
  readonly appliedMigrationCount: number;
  readonly ready: true;
}

function migrationDirectoryDefault(): string {
  const local = resolve(process.cwd(), "migrations");
  return existsSync(local)
    ? local
    : resolve(process.cwd(), "services", "community-review-service", "migrations");
}

function stripTransactionWrappers(sql: string): string {
  const lines = sql.split(/\r?\n/u);
  const begin = lines.findIndex((line) => line.trim().toUpperCase() === "BEGIN;");
  if (begin >= 0) lines[begin] = "";
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    if (lines[index]!.trim().length === 0) continue;
    if (lines[index]!.trim().toUpperCase() === "COMMIT;") lines[index] = "";
    break;
  }
  return lines.join("\n");
}

export async function loadCommunityReviewMigrations(
  directory = migrationDirectoryDefault(),
): Promise<readonly CommunityReviewMigration[]> {
  const filenames = (await readdir(directory, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && /^\d+_[A-Za-z0-9._-]+\.sql$/u.test(entry.name))
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right, "en"));
  if (filenames.length === 0) throw new MigrationVerificationError("migration_set_invalid");

  const migrations: CommunityReviewMigration[] = [];
  for (const filename of filenames) {
    const match = /^(\d+)_([A-Za-z0-9._-]+)\.sql$/u.exec(filename);
    if (match === null) throw new MigrationVerificationError("migration_set_invalid");
    const version = Number.parseInt(match[1]!, 10);
    const bytes = await readFile(resolve(directory, filename));
    const digest = createHash("sha256").update(bytes).digest("hex");
    migrations.push({
      version,
      filename,
      sha256: `sha256:${digest}`,
      sql: bytes.toString("utf8"),
    });
  }
  for (const [index, migration] of migrations.entries()) {
    if (migration.version !== index + 1) {
      throw new MigrationVerificationError("migration_set_invalid");
    }
  }
  return migrations;
}

async function acquireMigrationLock(client: PoolClient): Promise<void> {
  await client.query(
    "SELECT pg_advisory_lock(hashtext($1)::bigint)",
    [MIGRATION_LOCK_NAME],
  );
}

async function releaseMigrationLock(client: PoolClient): Promise<void> {
  await client.query(
    "SELECT pg_advisory_unlock(hashtext($1)::bigint)",
    [MIGRATION_LOCK_NAME],
  );
}

async function ensureHistoryTable(client: PoolClient): Promise<void> {
  await client.query(
    `CREATE TABLE IF NOT EXISTS ${MIGRATION_HISTORY_TABLE} (
       version INTEGER PRIMARY KEY CHECK (version >= 1),
       filename TEXT NOT NULL UNIQUE,
       sha256 TEXT NOT NULL CHECK (sha256 ~ '^sha256:[0-9a-f]{64}$'),
       applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
     )`,
  );
}

interface AppliedMigration {
  readonly version: number;
  readonly filename: string;
  readonly sha256: string;
}

async function readAppliedMigrations(client: PoolClient): Promise<readonly AppliedMigration[]> {
  const result = await client.query<AppliedMigration>(
    `SELECT version, filename, sha256
       FROM ${MIGRATION_HISTORY_TABLE}
      ORDER BY version`,
  );
  return result.rows;
}

function verifyAppliedHistory(
  migrations: readonly CommunityReviewMigration[],
  applied: readonly AppliedMigration[],
): Map<number, AppliedMigration> {
  const known = new Map(migrations.map((migration) => [migration.version, migration]));
  const history = new Map<number, AppliedMigration>();
  for (const row of applied) {
    const migration = known.get(row.version);
    if (migration === undefined) throw new MigrationVerificationError("missing_historical_migration");
    if (history.has(row.version) || row.filename !== migration.filename || row.sha256 !== migration.sha256) {
      throw new MigrationVerificationError("migration_checksum_drift");
    }
    history.set(row.version, row);
  }
  const maxVersion = Math.max(0, ...history.keys());
  for (let version = 1; version <= maxVersion; version += 1) {
    if (!history.has(version)) throw new MigrationVerificationError("missing_historical_migration");
  }
  return history;
}

async function withMigrationLock<T>(pool: Pool, callback: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  let locked = false;
  try {
    await acquireMigrationLock(client);
    locked = true;
    return await callback(client);
  } finally {
    if (locked) {
      try {
        await releaseMigrationLock(client);
      } catch {
        // The connection is released immediately; an already-closed session
        // cannot retain a session-level advisory lock.
      }
    }
    client.release();
  }
}

export class CommunityReviewMigrationRunner {
  private readonly directory: string;

  constructor(directory = migrationDirectoryDefault()) {
    this.directory = directory;
  }

  getMigrationsDirectory(): string {
    return this.directory;
  }

  async migrate(pool: Pool): Promise<MigrationStatus> {
    const migrations = await loadCommunityReviewMigrations(this.directory);
    return withMigrationLock(pool, async (client) => {
      await ensureHistoryTable(client);
      const applied = verifyAppliedHistory(migrations, await readAppliedMigrations(client));
      for (const migration of migrations) {
        if (applied.has(migration.version)) continue;
        await client.query("BEGIN");
        try {
          await client.query(stripTransactionWrappers(migration.sql));
          await client.query(
            `INSERT INTO ${MIGRATION_HISTORY_TABLE} (version, filename, sha256)
             VALUES ($1, $2, $3)`,
            [migration.version, migration.filename, migration.sha256],
          );
          await client.query("COMMIT");
          applied.set(migration.version, migration);
        } catch (error) {
          await client.query("ROLLBACK").catch(() => undefined);
          if (error instanceof MigrationVerificationError) throw error;
          throw new MigrationExecutionError(migration.version);
        }
      }
      return {
        currentVersion: migrations[migrations.length - 1]!.version,
        knownMigrationCount: migrations.length,
        appliedMigrationCount: applied.size,
        ready: true,
      };
    });
  }

  async verify(pool: Pool): Promise<MigrationStatus> {
    const migrations = await loadCommunityReviewMigrations(this.directory);
    return withMigrationLock(pool, async (client) => {
      const table = await client.query<{ readonly tableName: string | null }>(
        "SELECT to_regclass($1) AS \"tableName\"",
        [`public.${MIGRATION_HISTORY_TABLE}`],
      );
      if (table.rows[0]?.tableName === null || table.rows[0] === undefined) {
        throw new MigrationVerificationError("migration_history_missing");
      }
      const applied = verifyAppliedHistory(migrations, await readAppliedMigrations(client));
      if (applied.size !== migrations.length) {
        throw new MigrationVerificationError("migration_not_applied");
      }
      return {
        currentVersion: migrations[migrations.length - 1]!.version,
        knownMigrationCount: migrations.length,
        appliedMigrationCount: applied.size,
        ready: true,
      };
    });
  }
}
