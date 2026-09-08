import { Pool } from "pg";
import type { PoolConfig } from "pg";

import { InMemoryCommunityReviewRepository } from "./in-memory-repository.js";
import {
  loadPersistenceSnapshot,
  persistPersistenceSnapshot,
} from "./postgres-codec.js";
import type {
  CommunityReviewPersistence,
  CommunityReviewPersistenceTransaction,
} from "./persistence.js";
import {
  CommunityReviewMigrationRunner,
  type MigrationStatus,
} from "./migrations.js";

const SERVICE_TRANSACTION_LOCK_NAME = "tutorbench.community-review.service";

/**
 * The application persistence contract is intentionally synchronous inside a
 * transaction callback. PostgreSQL work therefore uses one real SQL
 * transaction, a fixed-order authority lock, and a storage-neutral working
 * snapshot. The existing in-memory transaction remains the single contract
 * validator; the successful snapshot is then written through explicit SQL.
 */
export interface PostgreSQLCommunityReviewRepositoryOptions {
  readonly connectionString?: string;
  readonly pool?: Pool;
  readonly poolConfig?: Omit<PoolConfig, "connectionString">;
  readonly migrationsDirectory?: string;
}

export class PostgreSQLCommunityReviewRepository implements CommunityReviewPersistence {
  private readonly pool: Pool;
  private readonly ownsPool: boolean;
  private readonly migrationRunner: CommunityReviewMigrationRunner;

  constructor(options: PostgreSQLCommunityReviewRepositoryOptions) {
    if (options.pool !== undefined && options.connectionString !== undefined) {
      throw new Error("Provide either a PostgreSQL pool or a connection string, not both.");
    }
    if (options.pool !== undefined) {
      this.pool = options.pool;
      this.ownsPool = false;
    } else {
      if (options.connectionString === undefined || options.connectionString.trim().length === 0) {
        throw new Error("A PostgreSQL connection string is required.");
      }
      this.pool = new Pool({
        ...(options.poolConfig ?? {}),
        connectionString: options.connectionString,
      });
      this.ownsPool = true;
    }
    this.migrationRunner = new CommunityReviewMigrationRunner(options.migrationsDirectory);
  }

  async migrate(): Promise<MigrationStatus> {
    return this.migrationRunner.migrate(this.pool);
  }

  async verifyMigrations(): Promise<MigrationStatus> {
    return this.migrationRunner.verify(this.pool);
  }

  async ping(): Promise<void> {
    await this.pool.query("SELECT 1");
  }

  getPool(): Pool {
    return this.pool;
  }

  async close(): Promise<void> {
    if (this.ownsPool) await this.pool.end();
  }

  async transaction<T>(
    callback: (transaction: CommunityReviewPersistenceTransaction) => Promise<T> | T,
  ): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      // The advisory transaction lock closes the insert-only race for empty
      // tables; the row locks below make the lock order explicit for existing
      // authority records and for direct maintenance writers.
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtext($1)::bigint)",
        [SERVICE_TRANSACTION_LOCK_NAME],
      );
      await lockAuthorityRows(client);
      const before = await loadPersistenceSnapshot(client);
      const local = new InMemoryCommunityReviewRepository(before);
      const result = await local.transaction(callback);
      const after = local.snapshot();
      await persistPersistenceSnapshot(client, before, after);
      await client.query("COMMIT");
      return structuredClone(result);
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }
}

async function lockAuthorityRows(client: { query(sql: string): Promise<unknown> }): Promise<void> {
  // Keep this order aligned with the documented service write order. The
  // coarse advisory lock is deliberately retained because row locks cannot
  // protect a concurrent insert into an empty relation.
  const statements = [
    // Batch is first so database-side lifecycle triggers and application
    // transactions cannot acquire a batch after holding a parent row lock.
    "SELECT batch_id FROM review_batches ORDER BY batch_id FOR UPDATE",
    "SELECT application_id FROM community_review_applications ORDER BY application_id FOR UPDATE",
    "SELECT application_id FROM community_review_application_contacts ORDER BY application_id FOR UPDATE",
    "SELECT idempotency_key_fingerprint FROM community_review_application_idempotency ORDER BY idempotency_key_fingerprint FOR UPDATE",
    "SELECT event_id FROM community_review_application_audit_events ORDER BY event_id FOR UPDATE",
    "SELECT internal_id FROM reviewer_accounts ORDER BY internal_id FOR UPDATE",
    "SELECT auth_identity_id FROM reviewer_auth_identities ORDER BY auth_identity_id FOR UPDATE",
    "SELECT consent_event_id FROM reviewer_consent_events ORDER BY consent_event_id FOR UPDATE",
    "SELECT pool_id, pool_version FROM qualification_pools ORDER BY pool_id, pool_version FOR UPDATE",
    "SELECT attempt_id FROM qualification_attempts ORDER BY attempt_id FOR UPDATE",
    "SELECT receipt_fingerprint FROM qualification_receipts ORDER BY receipt_fingerprint FOR UPDATE",
    "SELECT batch_id FROM sealed_batch_payload_references ORDER BY batch_id FOR UPDATE",
    "SELECT assignment_id FROM review_assignments ORDER BY assignment_id FOR UPDATE",
    "SELECT assignment_id FROM review_submissions ORDER BY assignment_id FOR UPDATE",
    "SELECT rejection_id FROM rejected_submission_attempts ORDER BY rejection_id FOR UPDATE",
    "SELECT batch_id FROM review_batch_closes ORDER BY batch_id FOR UPDATE",
    "SELECT batch_id, submission_fingerprint FROM review_batch_close_submissions ORDER BY batch_id, submission_fingerprint FOR UPDATE",
    "SELECT batch_id FROM frozen_review_pools ORDER BY batch_id FOR UPDATE",
    "SELECT batch_id FROM community_review_agreement_evidence ORDER BY batch_id FOR UPDATE",
    "SELECT disclosure_id FROM community_review_disclosures ORDER BY disclosure_id FOR UPDATE",
    "SELECT event_id FROM reviewer_auth_audit_events ORDER BY event_id FOR UPDATE",
    "SELECT event_id FROM qualification_authority_audit_events ORDER BY event_id FOR UPDATE",
    "SELECT event_id FROM review_delivery_audit_events ORDER BY event_id FOR UPDATE",
    "SELECT event_id FROM review_submission_audit_events ORDER BY event_id FOR UPDATE",
    "SELECT event_id FROM community_review_evidence_audit_events ORDER BY event_id FOR UPDATE",
  ];
  for (const statement of statements) await client.query(statement);
}
