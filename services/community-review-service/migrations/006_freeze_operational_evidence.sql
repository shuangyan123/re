-- P4-F freeze authority, diagnostic evidence, and disclosure persistence.
--
-- This migration is a PostgreSQL design boundary only. P4-F does not provision
-- or connect to PostgreSQL. It persists only immutable P3-derived artifacts and
-- narrow operational metadata; reviewer identities, credentials, qualification
-- answers, sealed source material, and hidden evaluator fields remain outside
-- these tables.

BEGIN;

-- 001 already owns the one-frozen-pool-per-batch authority. P4-F adds the
-- immutable diagnostic projection and keeps its identity separate from the P3
-- agreement meaning.
CREATE TABLE community_review_agreement_evidence (
  batch_id TEXT PRIMARY KEY REFERENCES frozen_review_pools (batch_id),
  freeze_fingerprint TEXT NOT NULL UNIQUE,
  evidence_persistence_fingerprint TEXT NOT NULL UNIQUE,
  evidence JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  CHECK (freeze_fingerprint ~ '^sha256:[0-9a-f]{64}$'),
  CHECK (evidence_persistence_fingerprint ~ '^sha256:[0-9a-f]{64}$'),
  CHECK ((
    jsonb_typeof(evidence) = 'object' AND
    evidence->>'agreementKind' IS NOT NULL AND
    evidence->>'agreementKind' = 'community-review-agreement' AND
    evidence->>'poolFingerprint' IS NOT NULL AND
    evidence->>'poolFingerprint' = freeze_fingerprint
  ) IS TRUE)
);

-- Disclosure is append-only history. A PRIVATE decision is the default and
-- carries no public artifact. PUBLIC is an explicit operator decision over a
-- P3 allowlisted artifact produced from the stored frozen pool.
CREATE TABLE community_review_disclosures (
  disclosure_id TEXT PRIMARY KEY,
  batch_id TEXT NOT NULL REFERENCES frozen_review_pools (batch_id),
  freeze_fingerprint TEXT NOT NULL,
  agreement_evidence_persistence_fingerprint TEXT NOT NULL
    REFERENCES community_review_agreement_evidence (evidence_persistence_fingerprint),
  disclosure_version INTEGER NOT NULL CHECK (disclosure_version >= 1),
  mode TEXT NOT NULL CHECK (mode IN ('PRIVATE', 'PUBLIC')),
  disclosure_policy JSONB NOT NULL,
  disclosure_date DATE,
  public_artifact JSONB,
  public_artifact_fingerprint TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  UNIQUE (batch_id, disclosure_version),
  CHECK (length(btrim(disclosure_id)) BETWEEN 1 AND 160),
  CHECK (freeze_fingerprint ~ '^sha256:[0-9a-f]{64}$'),
  CHECK (agreement_evidence_persistence_fingerprint ~ '^sha256:[0-9a-f]{64}$'),
  CHECK (jsonb_typeof(disclosure_policy) = 'object'),
  -- PostgreSQL has no jsonb_object_length function; subtracting the exact
  -- allowlist also rejects extra policy keys while retaining a plain CHECK.
  CHECK (disclosure_policy - 'publishReviewerIds' - 'publishAtomicAnnotations' -
    'publishReviewerEvidence' = '{}'::JSONB),
  CHECK (disclosure_policy->>'publishReviewerIds' IS NOT NULL),
  CHECK (disclosure_policy->>'publishAtomicAnnotations' IS NOT NULL),
  CHECK (disclosure_policy->>'publishReviewerEvidence' IS NOT NULL),
  CHECK (disclosure_policy->>'publishReviewerIds' IN ('true', 'false')),
  CHECK (disclosure_policy->>'publishAtomicAnnotations' IN ('true', 'false')),
  CHECK (disclosure_policy->>'publishReviewerEvidence' IN ('true', 'false')),
  CHECK ((
    (mode = 'PRIVATE' AND
      disclosure_date IS NULL AND
      public_artifact IS NULL AND
      public_artifact_fingerprint IS NULL AND
      disclosure_policy->>'publishReviewerIds' = 'false' AND
      disclosure_policy->>'publishAtomicAnnotations' = 'false' AND
      disclosure_policy->>'publishReviewerEvidence' = 'false') OR
    (mode = 'PUBLIC' AND
      disclosure_date IS NOT NULL AND
      public_artifact IS NOT NULL AND
      public_artifact_fingerprint IS NOT NULL AND
      public_artifact_fingerprint ~ '^sha256:[0-9a-f]{64}$' AND
      public_artifact->>'artifactKind' = 'community-review-public-evidence' AND
      public_artifact->>'state' = 'FROZEN' AND
      public_artifact->>'batchId' = batch_id AND
      public_artifact->>'frozenPoolFingerprint' = freeze_fingerprint AND
      public_artifact->>'disclosureDate' = disclosure_date::TEXT AND
      public_artifact->'disclosurePolicy' = disclosure_policy)
  ) IS TRUE)
);

CREATE UNIQUE INDEX community_review_disclosures_identity_unique
  ON community_review_disclosures (
    batch_id,
    freeze_fingerprint,
    mode,
    disclosure_policy,
    COALESCE(disclosure_date, DATE '0001-01-01')
  );

CREATE INDEX community_review_disclosures_batch_idx
  ON community_review_disclosures (batch_id, disclosure_version, disclosure_id);

-- Audit records bind operational actions without copying evidence payloads,
-- annotations, private identities, auth subjects, or disclosure contents.
CREATE TABLE community_review_evidence_audit_events (
  event_id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL CHECK (event_type IN (
    'batch_frozen',
    'freeze_retrieved',
    'agreement_evidence_generated',
    'agreement_evidence_retrieved',
    'disclosure_created',
    'public_artifact_generated',
    'disclosure_rejected'
  )),
  batch_id TEXT NOT NULL REFERENCES review_batches (batch_id),
  freeze_fingerprint TEXT,
  agreement_evidence_persistence_fingerprint TEXT
    REFERENCES community_review_agreement_evidence (evidence_persistence_fingerprint),
  disclosure_id TEXT REFERENCES community_review_disclosures (disclosure_id),
  disclosure_version INTEGER CHECK (disclosure_version IS NULL OR disclosure_version >= 1),
  disclosure_mode TEXT CHECK (disclosure_mode IS NULL OR disclosure_mode IN ('PRIVATE', 'PUBLIC')),
  disclosure_policy JSONB,
  reason_code TEXT,
  occurred_at TIMESTAMPTZ NOT NULL,
  CHECK (freeze_fingerprint IS NULL OR freeze_fingerprint ~ '^sha256:[0-9a-f]{64}$'),
  CHECK (agreement_evidence_persistence_fingerprint IS NULL OR
    agreement_evidence_persistence_fingerprint ~ '^sha256:[0-9a-f]{64}$'),
  CHECK (reason_code IS NULL OR reason_code ~ '^[A-Za-z0-9._:-]{1,80}$'),
  CHECK ((
    disclosure_policy IS NULL OR (
      jsonb_typeof(disclosure_policy) = 'object' AND
      disclosure_policy - 'publishReviewerIds' - 'publishAtomicAnnotations' -
        'publishReviewerEvidence' = '{}'::JSONB AND
      disclosure_policy->>'publishReviewerIds' IS NOT NULL AND
      disclosure_policy->>'publishAtomicAnnotations' IS NOT NULL AND
      disclosure_policy->>'publishReviewerEvidence' IS NOT NULL AND
      disclosure_policy->>'publishReviewerIds' IN ('true', 'false') AND
      disclosure_policy->>'publishAtomicAnnotations' IN ('true', 'false') AND
      disclosure_policy->>'publishReviewerEvidence' IN ('true', 'false')
    )
  ) IS TRUE)
);

CREATE INDEX community_review_evidence_audit_events_batch_idx
  ON community_review_evidence_audit_events (batch_id, occurred_at, event_id);

-- The existing P4-E trigger function is the common immutable-record guard.
-- Frozen pools were created in 001, so install the missing write guard here
-- without replacing that table or its one-row identity constraint.
DROP TRIGGER IF EXISTS frozen_review_pools_immutable_write ON frozen_review_pools;
CREATE TRIGGER frozen_review_pools_immutable_write
  BEFORE UPDATE OR DELETE ON frozen_review_pools
  FOR EACH ROW
  EXECUTE FUNCTION community_review_reject_immutable_record_write();

CREATE OR REPLACE FUNCTION community_review_guard_frozen_pool_insert()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  batch_state TEXT;
  expected_batch_fingerprint TEXT;
  expected_close_fingerprint TEXT;
  expected_close_record JSONB;
BEGIN
  SELECT state, batch_fingerprint, manifest->>'closeRecordFingerprint'
    INTO batch_state, expected_batch_fingerprint, expected_close_fingerprint
  FROM review_batches
  WHERE batch_id = NEW.batch_id
  FOR UPDATE;

  IF batch_state IS DISTINCT FROM 'CLOSED' OR
     NEW.frozen_pool->>'batchId' IS DISTINCT FROM NEW.batch_id OR
     NEW.frozen_pool->>'batchFingerprint' IS DISTINCT FROM expected_batch_fingerprint OR
     NEW.frozen_pool->>'closeRecordFingerprint' IS DISTINCT FROM expected_close_fingerprint OR
     NEW.frozen_pool->>'freezeFingerprint' IS DISTINCT FROM NEW.freeze_fingerprint THEN
    RAISE EXCEPTION 'community review frozen pool is not bound to the exact CLOSED authority'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT close_row.close_record INTO expected_close_record
  FROM review_batch_closes AS close_row
  WHERE close_row.batch_id = NEW.batch_id
    AND close_row.close_fingerprint = expected_close_fingerprint
  FOR SHARE;
  IF expected_close_record IS NULL OR
     NEW.frozen_pool->'acceptedAssignmentIds' IS DISTINCT FROM expected_close_record->'acceptedAssignmentIds' OR
     NEW.frozen_pool->'acceptedReviewerIds' IS DISTINCT FROM expected_close_record->'acceptedReviewerIds' OR
     NEW.frozen_pool->'acceptedSubmissionFingerprints' IS DISTINCT FROM
       expected_close_record->'acceptedSubmissionFingerprints' THEN
    RAISE EXCEPTION 'community review frozen pool accepted set is not the exact close snapshot'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS frozen_review_pools_authority_guard ON frozen_review_pools;
CREATE TRIGGER frozen_review_pools_authority_guard
  BEFORE INSERT ON frozen_review_pools
  FOR EACH ROW
  EXECUTE FUNCTION community_review_guard_frozen_pool_insert();

CREATE OR REPLACE FUNCTION community_review_guard_agreement_evidence_insert()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  batch_state TEXT;
  frozen_fingerprint TEXT;
BEGIN
  SELECT state INTO batch_state
  FROM review_batches
  WHERE batch_id = NEW.batch_id
  FOR UPDATE;
  SELECT freeze_fingerprint INTO frozen_fingerprint
  FROM frozen_review_pools
  WHERE batch_id = NEW.batch_id
  FOR SHARE;
  IF batch_state IS DISTINCT FROM 'FROZEN' OR
     frozen_fingerprint IS DISTINCT FROM NEW.freeze_fingerprint OR
     NEW.evidence->>'poolFingerprint' IS DISTINCT FROM NEW.freeze_fingerprint THEN
    RAISE EXCEPTION 'community review agreement evidence requires the stored FROZEN pool'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS community_review_agreement_evidence_authority_guard
  ON community_review_agreement_evidence;
CREATE TRIGGER community_review_agreement_evidence_authority_guard
  BEFORE INSERT ON community_review_agreement_evidence
  FOR EACH ROW
  EXECUTE FUNCTION community_review_guard_agreement_evidence_insert();

CREATE OR REPLACE FUNCTION community_review_guard_disclosure_insert()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  batch_state TEXT;
  expected_batch_fingerprint TEXT;
  visible_task_set_fingerprint TEXT;
  frozen_fingerprint TEXT;
  agreement_fingerprint TEXT;
  stored_frozen_pool JSONB;
BEGIN
  SELECT state, batch_fingerprint, manifest->>'visibleTaskSetFingerprint'
    INTO batch_state, expected_batch_fingerprint, visible_task_set_fingerprint
  FROM review_batches
  WHERE batch_id = NEW.batch_id
  FOR UPDATE;
  SELECT freeze_fingerprint, frozen_pool
    INTO frozen_fingerprint, stored_frozen_pool
  FROM frozen_review_pools
  WHERE batch_id = NEW.batch_id
  FOR SHARE;
  SELECT evidence_persistence_fingerprint INTO agreement_fingerprint
  FROM community_review_agreement_evidence
  WHERE batch_id = NEW.batch_id
  FOR SHARE;

  IF batch_state IS DISTINCT FROM 'FROZEN' OR
     frozen_fingerprint IS DISTINCT FROM NEW.freeze_fingerprint OR
     agreement_fingerprint IS DISTINCT FROM NEW.agreement_evidence_persistence_fingerprint THEN
    RAISE EXCEPTION 'community review disclosure requires the exact stored FROZEN evidence'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.mode = 'PUBLIC' AND (
    NEW.public_artifact->>'batchFingerprint' IS DISTINCT FROM expected_batch_fingerprint OR
    NEW.public_artifact->>'visibleTaskSetFingerprint' IS DISTINCT FROM visible_task_set_fingerprint OR
    NEW.public_artifact->>'frozenPoolFingerprint' IS DISTINCT FROM frozen_fingerprint OR
    NEW.public_artifact->'acceptedSubmissionFingerprints' IS DISTINCT FROM
      stored_frozen_pool->'acceptedSubmissionFingerprints' OR
    NEW.public_artifact->>'state' IS DISTINCT FROM 'FROZEN') THEN
    RAISE EXCEPTION 'community review public artifact is outside the P3 allowlisted frozen pool'
      USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.mode = 'PUBLIC' AND EXISTS (
    SELECT 1
    FROM jsonb_object_keys(NEW.public_artifact) AS field_name
    WHERE field_name NOT IN (
      'schemaVersion', 'artifactKind', 'dataKind', 'fixture', 'protocolId',
      'protocolVersion', 'batchId', 'batchFingerprint', 'instrument',
      'qualificationEligibility', 'visibleTaskSetFingerprint', 'state',
      'frozenPoolFingerprint', 'acceptedSubmissionFingerprints',
      'disclosureDate', 'disclosurePolicy', 'publishedReviewerIds',
      'publishedSubmissions', 'agreement', 'limitations'
    )
  ) THEN
    RAISE EXCEPTION 'community review public artifact contains a non-allowlisted field'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS community_review_disclosures_authority_guard
  ON community_review_disclosures;
CREATE TRIGGER community_review_disclosures_authority_guard
  BEFORE INSERT ON community_review_disclosures
  FOR EACH ROW
  EXECUTE FUNCTION community_review_guard_disclosure_insert();

CREATE OR REPLACE FUNCTION community_review_guard_evidence_audit_insert()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  batch_state TEXT;
  frozen_fingerprint TEXT;
  agreement_batch_id TEXT;
  disclosure_batch_id TEXT;
  expected_disclosure_mode TEXT;
  expected_disclosure_version INTEGER;
BEGIN
  SELECT state INTO batch_state
  FROM review_batches
  WHERE batch_id = NEW.batch_id
  FOR SHARE;

  IF NEW.freeze_fingerprint IS NOT NULL THEN
    SELECT freeze_fingerprint INTO frozen_fingerprint
    FROM frozen_review_pools
    WHERE batch_id = NEW.batch_id
    FOR SHARE;
    IF frozen_fingerprint IS DISTINCT FROM NEW.freeze_fingerprint THEN
      RAISE EXCEPTION 'community review evidence audit has an invalid freeze binding'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  IF NEW.agreement_evidence_persistence_fingerprint IS NOT NULL THEN
    SELECT batch_id INTO agreement_batch_id
    FROM community_review_agreement_evidence
    WHERE evidence_persistence_fingerprint = NEW.agreement_evidence_persistence_fingerprint
    FOR SHARE;
    IF agreement_batch_id IS DISTINCT FROM NEW.batch_id THEN
      RAISE EXCEPTION 'community review evidence audit has an invalid agreement binding'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  IF NEW.disclosure_id IS NOT NULL THEN
    SELECT disclosure.batch_id, disclosure.mode, disclosure.disclosure_version
      INTO disclosure_batch_id, expected_disclosure_mode, expected_disclosure_version
    FROM community_review_disclosures AS disclosure
    WHERE disclosure.disclosure_id = NEW.disclosure_id
    FOR SHARE;
    IF disclosure_batch_id IS DISTINCT FROM NEW.batch_id OR
       NEW.disclosure_mode IS DISTINCT FROM expected_disclosure_mode OR
       NEW.disclosure_version IS DISTINCT FROM expected_disclosure_version THEN
      RAISE EXCEPTION 'community review evidence audit has an invalid disclosure binding'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  IF NEW.event_type IN ('batch_frozen', 'freeze_retrieved') AND
     (batch_state IS DISTINCT FROM 'FROZEN' OR NEW.freeze_fingerprint IS NULL) OR
     NEW.event_type IN ('agreement_evidence_generated', 'agreement_evidence_retrieved') AND
       NEW.agreement_evidence_persistence_fingerprint IS NULL OR
     NEW.event_type = 'disclosure_created' AND NEW.disclosure_id IS NULL OR
     NEW.event_type = 'public_artifact_generated' AND NEW.disclosure_mode IS DISTINCT FROM 'PUBLIC' OR
     NEW.event_type = 'disclosure_rejected' AND NEW.reason_code IS NULL THEN
    RAISE EXCEPTION 'community review evidence audit event is incomplete'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS community_review_evidence_audit_authority_guard
  ON community_review_evidence_audit_events;
CREATE TRIGGER community_review_evidence_audit_authority_guard
  BEFORE INSERT ON community_review_evidence_audit_events
  FOR EACH ROW
  EXECUTE FUNCTION community_review_guard_evidence_audit_insert();

DROP TRIGGER IF EXISTS community_review_agreement_evidence_immutable_write
  ON community_review_agreement_evidence;
CREATE TRIGGER community_review_agreement_evidence_immutable_write
  BEFORE UPDATE OR DELETE ON community_review_agreement_evidence
  FOR EACH ROW
  EXECUTE FUNCTION community_review_reject_immutable_record_write();

DROP TRIGGER IF EXISTS community_review_disclosures_immutable_write
  ON community_review_disclosures;
CREATE TRIGGER community_review_disclosures_immutable_write
  BEFORE UPDATE OR DELETE ON community_review_disclosures
  FOR EACH ROW
  EXECUTE FUNCTION community_review_reject_immutable_record_write();

DROP TRIGGER IF EXISTS community_review_evidence_audit_immutable_write
  ON community_review_evidence_audit_events;
CREATE TRIGGER community_review_evidence_audit_immutable_write
  BEFORE UPDATE OR DELETE ON community_review_evidence_audit_events
  FOR EACH ROW
  EXECUTE FUNCTION community_review_reject_immutable_record_write();

-- PostgreSQL execution and operational deployment remain P4-G concerns. The
-- application adapter must still run the same transaction order:
--   lock CLOSED batch -> load exact P4-E close -> verify sets -> call P3
--   freezeCommunityReviewPool -> persist frozen pool -> transition FROZEN;
--   then derive agreement/disclosure only from the stored frozen pool.

COMMIT;
