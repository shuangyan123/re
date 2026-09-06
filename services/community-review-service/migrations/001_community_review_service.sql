-- P4-A Community Review service foundation.
--
-- This migration is a PostgreSQL design boundary only. P4-A does not connect
-- to or provision a hosted database, and none of the references below carry
-- reviewer contact data, qualification answers, or sealed source payloads.

CREATE TABLE reviewer_accounts (
  internal_id TEXT PRIMARY KEY,
  reviewer_id TEXT NOT NULL UNIQUE,
  private_auth_subject_reference TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('ACTIVE', 'SUSPENDED', 'WITHDRAWN')),
  consent_version TEXT NOT NULL,
  consent_state TEXT NOT NULL CHECK (consent_state IN ('NOT_CONSENTED', 'CONSENTED', 'WITHDRAWN')),
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  CHECK (reviewer_id ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$'),
  CHECK (position('@' IN reviewer_id) = 0)
);

CREATE TABLE qualification_pools (
  pool_id TEXT NOT NULL,
  pool_version TEXT NOT NULL,
  qualification_id TEXT NOT NULL,
  qualification_version TEXT NOT NULL,
  data_kind TEXT NOT NULL CHECK (data_kind IN ('community-review', 'synthetic-fixture')),
  fixture JSONB,
  definition_fingerprint TEXT NOT NULL,
  instrument_fingerprint TEXT NOT NULL,
  review_locale TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('SEALED', 'OPEN', 'RETIRED')),
  sealed_definition_reference TEXT NOT NULL,
  private_answer_key_reference TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (pool_id, pool_version),
  CHECK ((data_kind = 'synthetic-fixture') = (fixture IS NOT NULL)),
  CHECK (definition_fingerprint ~ '^sha256:[0-9a-f]{64}$'),
  CHECK (instrument_fingerprint ~ '^sha256:[0-9a-f]{64}$')
);

CREATE TABLE qualification_attempts (
  attempt_id TEXT PRIMARY KEY,
  reviewer_id TEXT NOT NULL REFERENCES reviewer_accounts (reviewer_id),
  pool_id TEXT NOT NULL,
  pool_version TEXT NOT NULL,
  nonce_hash TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('STARTED', 'QUALIFIED', 'REJECTED', 'EXPIRED')),
  result TEXT CHECK (result IN ('qualified', 'not-qualified')),
  started_at TIMESTAMPTZ NOT NULL,
  submitted_at TIMESTAMPTZ,
  FOREIGN KEY (pool_id, pool_version)
    REFERENCES qualification_pools (pool_id, pool_version),
  UNIQUE (reviewer_id, pool_id, pool_version, nonce_hash),
  UNIQUE (attempt_id, reviewer_id, pool_id, pool_version),
  CHECK (
    (state = 'QUALIFIED' AND result = 'qualified') OR
    (state = 'REJECTED' AND result = 'not-qualified') OR
    (state IN ('STARTED', 'EXPIRED') AND result IS NULL)
  ),
  CHECK ((state = 'STARTED' AND submitted_at IS NULL) OR state <> 'STARTED')
);

CREATE TABLE qualification_receipts (
  receipt_fingerprint TEXT PRIMARY KEY,
  attempt_id TEXT NOT NULL,
  reviewer_id TEXT NOT NULL REFERENCES reviewer_accounts (reviewer_id),
  pool_id TEXT NOT NULL,
  pool_version TEXT NOT NULL,
  receipt JSONB NOT NULL,
  authority_state TEXT NOT NULL CHECK (authority_state IN ('authoritative', 'revoked')),
  issued_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  FOREIGN KEY (attempt_id, reviewer_id, pool_id, pool_version)
    REFERENCES qualification_attempts (attempt_id, reviewer_id, pool_id, pool_version),
  FOREIGN KEY (pool_id, pool_version)
    REFERENCES qualification_pools (pool_id, pool_version),
  UNIQUE (attempt_id),
  CHECK (receipt_fingerprint ~ '^sha256:[0-9a-f]{64}$'),
  CHECK ((authority_state = 'revoked') = (revoked_at IS NOT NULL))
);

CREATE TABLE review_batches (
  batch_id TEXT PRIMARY KEY,
  batch_fingerprint TEXT NOT NULL UNIQUE,
  manifest JSONB NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('SEALED', 'OPEN', 'CLOSED', 'FROZEN')),
  state_version INTEGER NOT NULL CHECK (state_version >= 0),
  sealed_source_reference TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  CHECK (manifest->>'batchId' = batch_id),
  CHECK (manifest->>'batchFingerprint' = batch_fingerprint),
  CHECK (manifest->>'state' = state)
);

-- This table stores only the lookup reference for a private sealed source.
CREATE TABLE sealed_batch_payload_references (
  batch_id TEXT PRIMARY KEY REFERENCES review_batches (batch_id),
  source_reference TEXT NOT NULL,
  visible_task_set_fingerprint TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  CHECK (visible_task_set_fingerprint ~ '^sha256:[0-9a-f]{64}$')
);

CREATE TABLE review_assignments (
  assignment_id TEXT PRIMARY KEY,
  batch_id TEXT NOT NULL REFERENCES review_batches (batch_id),
  reviewer_id TEXT NOT NULL REFERENCES reviewer_accounts (reviewer_id),
  assignment JSONB NOT NULL,
  packet JSONB NOT NULL,
  assignment_state TEXT NOT NULL CHECK (assignment_state IN ('assigned', 'withdrawn')),
  assigned_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  UNIQUE (batch_id, reviewer_id),
  UNIQUE (batch_id, assignment_id),
  CHECK (assignment->>'assignmentId' = assignment_id),
  CHECK (assignment->>'batchId' = batch_id),
  CHECK (assignment->>'reviewerId' = reviewer_id),
  CHECK (packet->>'assignmentId' = assignment_id),
  CHECK (packet->>'reviewerId' = reviewer_id)
);

CREATE TABLE review_submissions (
  submission_fingerprint TEXT PRIMARY KEY,
  assignment_id TEXT NOT NULL UNIQUE,
  batch_id TEXT NOT NULL,
  reviewer_id TEXT NOT NULL,
  submission JSONB NOT NULL,
  accepted_at TIMESTAMPTZ NOT NULL,
  FOREIGN KEY (batch_id, assignment_id)
    REFERENCES review_assignments (batch_id, assignment_id),
  FOREIGN KEY (batch_id, reviewer_id)
    REFERENCES review_assignments (batch_id, reviewer_id),
  UNIQUE (batch_id, reviewer_id),
  CHECK (submission->>'submissionFingerprint' = submission_fingerprint),
  CHECK (submission->>'assignmentId' = assignment_id),
  CHECK (submission->>'batchId' = batch_id),
  CHECK (submission->>'reviewerId' = reviewer_id),
  CHECK (submission->>'submissionDisposition' = 'accepted-before-close')
);

-- Rejections contain audit metadata only. Raw invalid payloads are never stored.
CREATE TABLE rejected_submission_attempts (
  rejection_id TEXT PRIMARY KEY,
  batch_id TEXT,
  assignment_id TEXT,
  reviewer_id TEXT,
  reason TEXT NOT NULL,
  payload_fingerprint TEXT,
  attempted_at TIMESTAMPTZ NOT NULL,
  CHECK (payload_fingerprint IS NULL OR payload_fingerprint ~ '^sha256:[0-9a-f]{64}$')
);

CREATE TABLE review_batch_closes (
  batch_id TEXT PRIMARY KEY REFERENCES review_batches (batch_id),
  close_fingerprint TEXT NOT NULL UNIQUE,
  manifest JSONB NOT NULL,
  close_record JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  CHECK (manifest->>'batchId' = batch_id),
  CHECK (manifest->>'state' = 'CLOSED'),
  CHECK (close_record->>'batchId' = batch_id),
  CHECK (close_record->>'closeFingerprint' = close_fingerprint),
  CHECK (close_record->>'state' = 'CLOSED')
);

CREATE TABLE frozen_review_pools (
  batch_id TEXT PRIMARY KEY REFERENCES review_batches (batch_id),
  freeze_fingerprint TEXT NOT NULL UNIQUE,
  frozen_pool JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  CHECK (frozen_pool->>'batchId' = batch_id),
  CHECK (frozen_pool->>'freezeFingerprint' = freeze_fingerprint),
  CHECK (frozen_pool->>'state' = 'FROZEN')
);

-- Transaction order for the service adapter:
--
-- Accept submission:
--   BEGIN;
--   SELECT * FROM review_batches WHERE batch_id = $1 FOR UPDATE;
--   assert state = 'OPEN'; load the assignment, authoritative receipt, and
--   stored positive-allowlist packet; call P3 validation; INSERT into
--   review_submissions; COMMIT.
--
-- Close:
--   BEGIN;
--   SELECT * FROM review_batches WHERE batch_id = $1 FOR UPDATE;
--   assert state = 'OPEN'; read the exact assignment/submission snapshot;
--   call P3 closeCommunityReviewBatch; INSERT close record; update the batch
--   to CLOSED; COMMIT.
--
-- Freeze:
--   BEGIN;
--   SELECT * FROM review_batches WHERE batch_id = $1 FOR UPDATE;
--   assert state = 'CLOSED'; read the authoritative close record; call P3
--   freezeCommunityReviewPool; INSERT frozen pool; update to FROZEN; COMMIT.
--
-- No external network operation is part of any of these database transactions.
