-- P4-C sealed qualification authority.
--
-- This migration defines PostgreSQL constraints and an immutability trigger for
-- the service boundary only.
-- Answer-key content remains in a private material store; it is never copied
-- into a P3 receipt, reviewer packet, or audit event.

BEGIN;

ALTER TABLE qualification_pools
  ADD COLUMN instrument JSONB,
  ADD COLUMN visible_task_set_fingerprint TEXT,
  ADD COLUMN answer_key_commitment TEXT,
  ADD COLUMN pass_rule_id TEXT,
  ADD COLUMN state_version INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN sealed_at TIMESTAMPTZ,
  ADD COLUMN retired_at TIMESTAMPTZ;

ALTER TABLE qualification_pools
  DROP CONSTRAINT IF EXISTS qualification_pools_state_check;

ALTER TABLE qualification_pools
  ADD CONSTRAINT qualification_pools_state_check
    CHECK (state IN ('DRAFT', 'SEALED', 'ACTIVE', 'RETIRED', 'OPEN')),
  ADD CONSTRAINT qualification_pools_state_version_check
    CHECK (state_version >= 0),
  ADD CONSTRAINT qualification_pools_visible_task_fingerprint_check
    CHECK (visible_task_set_fingerprint IS NULL OR
      visible_task_set_fingerprint ~ '^sha256:[0-9a-f]{64}$'),
  ADD CONSTRAINT qualification_pools_answer_commitment_check
    CHECK (answer_key_commitment IS NULL OR answer_key_commitment ~ '^sha256:[0-9a-f]{64}$'),
  ADD CONSTRAINT qualification_pools_pass_rule_check
    CHECK (pass_rule_id IS NULL OR pass_rule_id = 'all-required-items-correct@1'),
  ADD CONSTRAINT qualification_pools_instrument_object_check
    CHECK (instrument IS NULL OR jsonb_typeof(instrument) = 'object'),
  ADD CONSTRAINT qualification_pools_draft_instrument_check
    CHECK (state <> 'DRAFT' OR instrument IS NOT NULL),
  ADD CONSTRAINT qualification_pools_open_legacy_check
    CHECK (state <> 'OPEN' OR
      (instrument IS NULL AND visible_task_set_fingerprint IS NULL AND
       answer_key_commitment IS NULL AND pass_rule_id IS NULL AND sealed_at IS NULL AND
       retired_at IS NULL)),
  ADD CONSTRAINT qualification_pools_instrument_binding_check
    CHECK (instrument IS NULL OR
      (instrument->>'fingerprint' = instrument_fingerprint AND
       instrument->>'reviewLocale' = review_locale)),
  ADD CONSTRAINT qualification_pools_sealed_metadata_check
    CHECK (
      state IN ('DRAFT', 'OPEN') OR
      (
        state IN ('SEALED', 'RETIRED') AND state_version = 0 AND
        instrument IS NULL AND visible_task_set_fingerprint IS NULL AND
        answer_key_commitment IS NULL AND pass_rule_id IS NULL AND
        sealed_at IS NULL
      ) OR
      (
        instrument IS NOT NULL AND
        visible_task_set_fingerprint IS NOT NULL AND
        answer_key_commitment IS NOT NULL AND
        pass_rule_id = 'all-required-items-correct@1' AND
        sealed_at IS NOT NULL
      )
    ),
  ADD CONSTRAINT qualification_pools_retirement_timestamp_check
    CHECK (state <> 'RETIRED' OR retired_at IS NOT NULL OR state_version = 0),
  ADD CONSTRAINT qualification_pools_retired_at_state_check
    CHECK (retired_at IS NULL OR state = 'RETIRED');

-- Service transitions are the normal writer, but the database also protects
-- sealed semantic fields if another trusted maintenance path touches the row.
CREATE OR REPLACE FUNCTION community_review_guard_sealed_qualification_pool()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.pool_id IS DISTINCT FROM OLD.pool_id OR
     NEW.pool_version IS DISTINCT FROM OLD.pool_version OR
     NEW.qualification_id IS DISTINCT FROM OLD.qualification_id OR
     NEW.qualification_version IS DISTINCT FROM OLD.qualification_version OR
     NEW.definition_fingerprint IS DISTINCT FROM OLD.definition_fingerprint OR
     NEW.instrument_fingerprint IS DISTINCT FROM OLD.instrument_fingerprint OR
     NEW.review_locale IS DISTINCT FROM OLD.review_locale OR
     NEW.sealed_definition_reference IS DISTINCT FROM OLD.sealed_definition_reference OR
     NEW.private_answer_key_reference IS DISTINCT FROM OLD.private_answer_key_reference THEN
    RAISE EXCEPTION 'qualification pool identity is immutable';
  END IF;
  IF OLD.state <> 'DRAFT' AND (
    NEW.instrument IS DISTINCT FROM OLD.instrument OR
    NEW.visible_task_set_fingerprint IS DISTINCT FROM OLD.visible_task_set_fingerprint OR
    NEW.answer_key_commitment IS DISTINCT FROM OLD.answer_key_commitment OR
    NEW.pass_rule_id IS DISTINCT FROM OLD.pass_rule_id OR
    NEW.sealed_at IS DISTINCT FROM OLD.sealed_at
  ) THEN
    RAISE EXCEPTION 'sealed qualification material is immutable';
  END IF;
  IF OLD.state <> 'ACTIVE' AND NEW.retired_at IS DISTINCT FROM OLD.retired_at THEN
    RAISE EXCEPTION 'qualification retirement timestamp is immutable outside activation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS qualification_pools_sealed_immutability ON qualification_pools;

CREATE TRIGGER qualification_pools_sealed_immutability
  BEFORE UPDATE ON qualification_pools
  FOR EACH ROW
  EXECUTE FUNCTION community_review_guard_sealed_qualification_pool();

-- P4-A used STARTED/REJECTED. Preserve those historical rows as non-P4-C
-- imported records while making the new lifecycle names available.
ALTER TABLE qualification_attempts
  ADD COLUMN issued_at TIMESTAMPTZ,
  ADD COLUMN evaluated_at TIMESTAMPTZ,
  ADD COLUMN qualification_definition_fingerprint TEXT,
  ADD COLUMN instrument_fingerprint TEXT,
  ADD COLUMN review_locale TEXT,
  ADD COLUMN packet_fingerprint TEXT,
  ADD COLUMN responses JSONB,
  ADD COLUMN response_fingerprint TEXT,
  ADD COLUMN evaluation_rule_id TEXT,
  ADD COLUMN failure_code TEXT;

ALTER TABLE qualification_attempts
  DROP CONSTRAINT IF EXISTS qualification_attempts_state_check,
  DROP CONSTRAINT IF EXISTS qualification_attempts_result_check,
  DROP CONSTRAINT IF EXISTS qualification_attempts_check,
  DROP CONSTRAINT IF EXISTS qualification_attempts_check1;

UPDATE qualification_attempts
SET state = 'CREATED'
WHERE state = 'STARTED';

UPDATE qualification_attempts
SET state = 'NOT_QUALIFIED',
    evaluated_at = NULL
WHERE state = 'REJECTED';

ALTER TABLE qualification_attempts
  ADD CONSTRAINT qualification_attempts_state_check
    CHECK (state IN ('CREATED', 'ISSUED', 'SUBMITTED', 'QUALIFIED', 'NOT_QUALIFIED', 'EXPIRED')),
  ADD CONSTRAINT qualification_attempts_binding_fingerprint_check
    CHECK (qualification_definition_fingerprint IS NULL OR
      qualification_definition_fingerprint ~ '^sha256:[0-9a-f]{64}$'),
  ADD CONSTRAINT qualification_attempts_instrument_fingerprint_check
    CHECK (instrument_fingerprint IS NULL OR instrument_fingerprint ~ '^sha256:[0-9a-f]{64}$'),
  ADD CONSTRAINT qualification_attempts_packet_fingerprint_check
    CHECK (packet_fingerprint IS NULL OR packet_fingerprint ~ '^sha256:[0-9a-f]{64}$'),
  ADD CONSTRAINT qualification_attempts_response_fingerprint_check
    CHECK (response_fingerprint IS NULL OR response_fingerprint ~ '^sha256:[0-9a-f]{64}$'),
  ADD CONSTRAINT qualification_attempts_response_array_check
    CHECK (responses IS NULL OR jsonb_typeof(responses) = 'array'),
  ADD CONSTRAINT qualification_attempts_binding_complete_check
    CHECK (
      (qualification_definition_fingerprint IS NULL AND instrument_fingerprint IS NULL AND
       review_locale IS NULL AND packet_fingerprint IS NULL) OR
      (qualification_definition_fingerprint IS NOT NULL AND instrument_fingerprint IS NOT NULL AND
       review_locale IS NOT NULL AND packet_fingerprint IS NOT NULL)
    ),
  ADD CONSTRAINT qualification_attempts_result_check
    CHECK (
      (
        state = 'CREATED' AND result IS NULL AND issued_at IS NULL AND submitted_at IS NULL AND
        evaluated_at IS NULL AND responses IS NULL AND response_fingerprint IS NULL AND
        evaluation_rule_id IS NULL
      ) OR
      (
        state = 'ISSUED' AND result IS NULL AND issued_at IS NOT NULL AND submitted_at IS NULL AND
        evaluated_at IS NULL AND responses IS NULL AND response_fingerprint IS NULL AND
        evaluation_rule_id IS NULL AND qualification_definition_fingerprint IS NOT NULL AND
        instrument_fingerprint IS NOT NULL AND review_locale IS NOT NULL AND
        packet_fingerprint IS NOT NULL
      ) OR
      (
        state = 'SUBMITTED' AND result IS NULL AND issued_at IS NOT NULL AND submitted_at IS NOT NULL AND
        evaluated_at IS NULL AND responses IS NOT NULL AND response_fingerprint IS NOT NULL AND
        evaluation_rule_id IS NULL AND qualification_definition_fingerprint IS NOT NULL AND
        instrument_fingerprint IS NOT NULL AND review_locale IS NOT NULL AND
        packet_fingerprint IS NOT NULL
      ) OR
      (
        state = 'QUALIFIED' AND result = 'qualified' AND issued_at IS NOT NULL AND
        submitted_at IS NOT NULL AND evaluated_at IS NOT NULL AND responses IS NOT NULL AND
        response_fingerprint IS NOT NULL AND evaluation_rule_id = 'all-required-items-correct@1' AND
        qualification_definition_fingerprint IS NOT NULL AND instrument_fingerprint IS NOT NULL AND
        review_locale IS NOT NULL AND packet_fingerprint IS NOT NULL
      ) OR
      (
        state = 'NOT_QUALIFIED' AND result = 'not-qualified' AND issued_at IS NOT NULL AND
        submitted_at IS NOT NULL AND evaluated_at IS NOT NULL AND responses IS NOT NULL AND
        response_fingerprint IS NOT NULL AND evaluation_rule_id = 'all-required-items-correct@1' AND
        qualification_definition_fingerprint IS NOT NULL AND instrument_fingerprint IS NOT NULL AND
        review_locale IS NOT NULL AND packet_fingerprint IS NOT NULL
      ) OR
      (
        state = 'EXPIRED' AND result IS NULL
      ) OR
      (
        -- Historical P4-A qualification rows are not eligible for the P4-C
        -- receipt issuer until a service evaluation has populated the fields.
        state IN ('QUALIFIED', 'NOT_QUALIFIED') AND issued_at IS NULL AND
        evaluated_at IS NULL AND responses IS NULL AND response_fingerprint IS NULL AND
        evaluation_rule_id IS NULL AND
        ((state = 'QUALIFIED' AND result = 'qualified') OR
         (state = 'NOT_QUALIFIED' AND result = 'not-qualified'))
      )
    ),
  ADD CONSTRAINT qualification_attempts_failure_code_check
    CHECK (failure_code IS NULL OR failure_code ~ '^[A-Za-z0-9._:-]{1,80}$');

-- The existing reviewer/pool/nonce uniqueness remains. This stronger pool-wide
-- uniqueness also prevents a raw nonce from being replayed under another owner.
CREATE UNIQUE INDEX qualification_attempts_pool_nonce_unique
  ON qualification_attempts (pool_id, pool_version, nonce_hash);

CREATE INDEX qualification_attempts_reviewer_pool_idx
  ON qualification_attempts (reviewer_id, pool_id, pool_version, started_at, attempt_id);

ALTER TABLE qualification_receipts
  ADD CONSTRAINT qualification_receipts_qualified_status_check
    CHECK (receipt->>'qualificationStatus' = 'qualified');

CREATE TABLE qualification_authority_audit_events (
  event_id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL CHECK (event_type IN (
    'pool_registered',
    'pool_sealed',
    'pool_activated',
    'pool_retired',
    'attempt_issued',
    'response_submitted',
    'qualification_passed',
    'qualification_failed',
    'receipt_issued'
  )),
  reviewer_id TEXT REFERENCES reviewer_accounts (reviewer_id),
  attempt_id TEXT REFERENCES qualification_attempts (attempt_id),
  pool_id TEXT,
  pool_version TEXT,
  reason_code TEXT,
  occurred_at TIMESTAMPTZ NOT NULL,
  FOREIGN KEY (pool_id, pool_version)
    REFERENCES qualification_pools (pool_id, pool_version),
  CHECK (reason_code IS NULL OR reason_code ~ '^[A-Za-z0-9._:-]{1,80}$'),
  CHECK (pool_id IS NULL AND pool_version IS NULL OR pool_id IS NOT NULL AND pool_version IS NOT NULL)
);

CREATE INDEX qualification_authority_audit_events_pool_idx
  ON qualification_authority_audit_events (pool_id, pool_version, occurred_at, event_id);

COMMIT;
