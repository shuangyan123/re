-- P4-D blind delivery and assignment authority.
--
-- Migration 001 already enforces UNIQUE (batch_id, reviewer_id) for review
-- assignments. This migration adds only the narrow delivery audit boundary;
-- packet contents, sealed source material, receipts, credentials, and tokens
-- remain outside audit records.

BEGIN;

CREATE TABLE review_delivery_audit_events (
  event_id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL CHECK (event_type IN (
    'assignment_issued',
    'assignment_retrieved',
    'assignment_withdrawn',
    'assignment_issuance_rejected',
    'batch_material_mismatch',
    'eligibility_rejected'
  )),
  batch_id TEXT REFERENCES review_batches (batch_id),
  assignment_id TEXT REFERENCES review_assignments (assignment_id),
  reviewer_id TEXT REFERENCES reviewer_accounts (reviewer_id),
  reason_code TEXT,
  occurred_at TIMESTAMPTZ NOT NULL,
  CHECK (reason_code IS NULL OR reason_code ~ '^[A-Za-z0-9._:-]{1,80}$')
);

CREATE INDEX review_delivery_audit_events_batch_idx
  ON review_delivery_audit_events (batch_id, occurred_at, event_id);

CREATE INDEX review_delivery_audit_events_assignment_idx
  ON review_delivery_audit_events (assignment_id, occurred_at, event_id);

-- The service transaction for a new assignment remains:
--   BEGIN; resolve authenticated reviewer; assert ACTIVE/current consent;
--   lock/read an authoritative qualification receipt; lock the OPEN batch;
--   load and fingerprint-check private visible material; call P3 builders;
--   INSERT assignment (protected by UNIQUE(batch_id, reviewer_id));
--   INSERT delivery audit event; COMMIT.
-- A batch transition wins the same row lock first, so no assignment can commit
-- against a non-OPEN snapshot.

COMMIT;
