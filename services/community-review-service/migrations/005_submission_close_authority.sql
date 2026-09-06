-- P4-E production-grade submission and close authority.
--
-- This migration strengthens the PostgreSQL boundary only. P4-E still has no
-- hosted database or deployed service. The service must acquire the batch row
-- lock before it validates or writes any submission, withdrawal, close, or
-- close-snapshot row.

BEGIN;

-- Keep the rejection table to bounded audit metadata. The raw rejected request
-- is never persisted.
ALTER TABLE rejected_submission_attempts
  ADD CONSTRAINT rejected_submission_attempts_reason_code_check
    CHECK (reason ~ '^[A-Za-z0-9._:-]{1,80}$');

ALTER TABLE rejected_submission_attempts
  ADD CONSTRAINT rejected_submission_attempts_id_check
    CHECK (length(btrim(rejection_id)) > 0);

-- The accepted set is a relational, immutable snapshot of the exact
-- review_submissions rows visible to the close transaction. The close record's
-- P3 arrays and this table are checked against one another before the batch is
-- transitioned to CLOSED.
ALTER TABLE review_submissions
  ADD CONSTRAINT review_submissions_close_snapshot_identity_unique
    UNIQUE (batch_id, submission_fingerprint, assignment_id, reviewer_id);

CREATE TABLE review_batch_close_submissions (
  batch_id TEXT NOT NULL REFERENCES review_batch_closes (batch_id),
  submission_fingerprint TEXT NOT NULL,
  assignment_id TEXT NOT NULL,
  reviewer_id TEXT NOT NULL,
  PRIMARY KEY (batch_id, submission_fingerprint),
  UNIQUE (batch_id, assignment_id),
  UNIQUE (batch_id, reviewer_id),
  FOREIGN KEY (batch_id, submission_fingerprint, assignment_id, reviewer_id)
    REFERENCES review_submissions (
      batch_id, submission_fingerprint, assignment_id, reviewer_id
    )
  );

CREATE TABLE review_submission_audit_events (
  event_id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL CHECK (event_type = 'submission_accepted'),
  batch_id TEXT NOT NULL REFERENCES review_batches (batch_id),
  assignment_id TEXT NOT NULL,
  reviewer_id TEXT NOT NULL,
  submission_fingerprint TEXT NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL,
  FOREIGN KEY (batch_id, submission_fingerprint, assignment_id, reviewer_id)
    REFERENCES review_submissions (
      batch_id, submission_fingerprint, assignment_id, reviewer_id
    )
);

CREATE INDEX review_submission_audit_events_batch_idx
  ON review_submission_audit_events (batch_id, occurred_at, event_id);

ALTER TABLE review_submission_audit_events
  ADD CONSTRAINT review_submission_audit_events_submission_once_unique
    UNIQUE (batch_id, submission_fingerprint, event_type);

ALTER TABLE review_assignments
  ADD CONSTRAINT review_assignments_state_projection_check
    CHECK (assignment->>'assignmentState' = assignment_state);

-- All accepted submission rows are append-only protocol evidence.
CREATE OR REPLACE FUNCTION community_review_reject_immutable_record_write()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'community review authority record is immutable'
    USING ERRCODE = 'object_not_in_prerequisite_state';
END;
$$;

DROP TRIGGER IF EXISTS review_submissions_immutable_write ON review_submissions;
CREATE TRIGGER review_submissions_immutable_write
  BEFORE UPDATE OR DELETE ON review_submissions
  FOR EACH ROW
  EXECUTE FUNCTION community_review_reject_immutable_record_write();

DROP TRIGGER IF EXISTS review_batch_closes_immutable_write ON review_batch_closes;
CREATE TRIGGER review_batch_closes_immutable_write
  BEFORE UPDATE OR DELETE ON review_batch_closes
  FOR EACH ROW
  EXECUTE FUNCTION community_review_reject_immutable_record_write();

DROP TRIGGER IF EXISTS review_batch_close_submissions_immutable_write
  ON review_batch_close_submissions;
CREATE TRIGGER review_batch_close_submissions_immutable_write
  BEFORE UPDATE OR DELETE ON review_batch_close_submissions
  FOR EACH ROW
  EXECUTE FUNCTION community_review_reject_immutable_record_write();

DROP TRIGGER IF EXISTS review_submission_audit_events_immutable_write
  ON review_submission_audit_events;
CREATE TRIGGER review_submission_audit_events_immutable_write
  BEFORE UPDATE OR DELETE ON review_submission_audit_events
  FOR EACH ROW
  EXECUTE FUNCTION community_review_reject_immutable_record_write();

-- A submission and its assignment withdrawal share the batch boundary. The
-- SELECT ... FOR UPDATE makes direct database writers use the same lock order
-- as the service and prevents a write against a CLOSED/FROZEN batch.
CREATE OR REPLACE FUNCTION community_review_guard_submission_authority()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  batch_state TEXT;
  expected_assignment_state TEXT;
BEGIN
  SELECT state INTO batch_state
  FROM review_batches
  WHERE batch_id = NEW.batch_id
  FOR UPDATE;

  IF batch_state IS DISTINCT FROM 'OPEN' THEN
    RAISE EXCEPTION 'community review batch is not OPEN'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT assignment_state INTO expected_assignment_state
  FROM review_assignments
  WHERE batch_id = NEW.batch_id AND assignment_id = NEW.assignment_id
  FOR UPDATE;

  IF expected_assignment_state IS DISTINCT FROM 'assigned' THEN
    RAISE EXCEPTION 'community review assignment is not assigned'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS review_submissions_authority_guard ON review_submissions;
CREATE TRIGGER review_submissions_authority_guard
  BEFORE INSERT ON review_submissions
  FOR EACH ROW
  EXECUTE FUNCTION community_review_guard_submission_authority();

CREATE OR REPLACE FUNCTION community_review_guard_close_record_insert()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  batch_state TEXT;
BEGIN
  SELECT state INTO batch_state
  FROM review_batches
  WHERE batch_id = NEW.batch_id
  FOR UPDATE;
  IF batch_state IS DISTINCT FROM 'OPEN' THEN
    RAISE EXCEPTION 'community review close requires an OPEN batch'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS review_batch_closes_authority_guard ON review_batch_closes;
CREATE TRIGGER review_batch_closes_authority_guard
  BEFORE INSERT ON review_batch_closes
  FOR EACH ROW
  EXECUTE FUNCTION community_review_guard_close_record_insert();

CREATE OR REPLACE FUNCTION community_review_guard_assignment_authority()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  batch_state TEXT;
BEGIN
  SELECT state INTO batch_state
  FROM review_batches
  WHERE batch_id = NEW.batch_id
  FOR UPDATE;

  IF batch_state IS DISTINCT FROM 'OPEN' THEN
    RAISE EXCEPTION 'community review assignment requires an OPEN batch'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.assignment->>'assignmentId' IS DISTINCT FROM NEW.assignment_id OR
     NEW.assignment->>'batchId' IS DISTINCT FROM NEW.batch_id OR
     NEW.assignment->>'reviewerId' IS DISTINCT FROM NEW.reviewer_id OR
     NEW.assignment->>'assignmentState' IS DISTINCT FROM NEW.assignment_state OR
     (TG_OP = 'INSERT' AND NEW.assignment_state IS DISTINCT FROM 'assigned') THEN
    RAISE EXCEPTION 'community review assignment identity is invalid'
      USING ERRCODE = 'check_violation';
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF EXISTS (
      SELECT 1
      FROM review_submissions
      WHERE batch_id = NEW.batch_id AND assignment_id = NEW.assignment_id
    ) THEN
      RAISE EXCEPTION 'community review assignment has an accepted submission'
        USING ERRCODE = 'check_violation';
    END IF;
    IF OLD.assignment_id IS DISTINCT FROM NEW.assignment_id OR
       OLD.batch_id IS DISTINCT FROM NEW.batch_id OR
       OLD.reviewer_id IS DISTINCT FROM NEW.reviewer_id OR
       OLD.assignment - 'assignmentState' - 'assignmentFingerprint' IS DISTINCT FROM
         NEW.assignment - 'assignmentState' - 'assignmentFingerprint' OR
       OLD.packet IS DISTINCT FROM NEW.packet OR
       OLD.assigned_at IS DISTINCT FROM NEW.assigned_at OR
       OLD.assignment_state IS DISTINCT FROM 'assigned' OR
       NEW.assignment_state IS DISTINCT FROM 'withdrawn' THEN
      RAISE EXCEPTION 'community review assignment identity is immutable'
        USING ERRCODE = 'object_not_in_prerequisite_state';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS review_assignments_authority_guard ON review_assignments;
CREATE TRIGGER review_assignments_authority_guard
  BEFORE INSERT OR UPDATE ON review_assignments
  FOR EACH ROW
  EXECUTE FUNCTION community_review_guard_assignment_authority();

-- Close snapshot rows may be inserted only while the batch is still OPEN. The
-- subsequent batch transition verifies that the child set is exact, then the
-- child rows become immutable.
CREATE OR REPLACE FUNCTION community_review_guard_close_snapshot()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  batch_state TEXT;
BEGIN
  SELECT state INTO batch_state
  FROM review_batches
  WHERE batch_id = NEW.batch_id
  FOR UPDATE;
  IF batch_state IS DISTINCT FROM 'OPEN' THEN
    RAISE EXCEPTION 'community review close snapshot requires an OPEN batch'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS review_batch_close_submissions_authority_guard
  ON review_batch_close_submissions;
CREATE TRIGGER review_batch_close_submissions_authority_guard
  BEFORE INSERT ON review_batch_close_submissions
  FOR EACH ROW
  EXECUTE FUNCTION community_review_guard_close_snapshot();

CREATE OR REPLACE FUNCTION community_review_guard_batch_authority()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  expected_close_fingerprint TEXT;
  expected_frozen_fingerprint TEXT;
  snapshot_count INTEGER;
  accepted_count INTEGER;
  close_assignment_count INTEGER;
  close_reviewer_count INTEGER;
  close_submission_count INTEGER;
BEGIN
  IF NEW.batch_id IS DISTINCT FROM OLD.batch_id OR
     NEW.batch_fingerprint IS DISTINCT FROM OLD.batch_fingerprint OR
     NEW.sealed_source_reference IS DISTINCT FROM OLD.sealed_source_reference OR
     NEW.state_version IS DISTINCT FROM OLD.state_version + 1 OR
     NEW.manifest - 'state' - 'closeRecordFingerprint' - 'freezeFingerprint' IS DISTINCT FROM
       OLD.manifest - 'state' - 'closeRecordFingerprint' - 'freezeFingerprint' THEN
    RAISE EXCEPTION 'community review batch identity or version is immutable'
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;

  IF OLD.state = 'SEALED' AND NEW.state = 'OPEN' THEN
    RETURN NEW;
  END IF;

  IF OLD.state = 'OPEN' AND NEW.state = 'CLOSED' THEN
    expected_close_fingerprint := NEW.manifest->>'closeRecordFingerprint';
    IF expected_close_fingerprint IS NULL OR
       NOT EXISTS (
         SELECT 1 FROM review_batch_closes
         WHERE review_batch_closes.batch_id = NEW.batch_id
           AND review_batch_closes.close_fingerprint = expected_close_fingerprint
           AND review_batch_closes.manifest = NEW.manifest
       ) THEN
      RAISE EXCEPTION 'closed community review batch has no close record'
        USING ERRCODE = 'check_violation';
    END IF;

    SELECT count(*) INTO accepted_count
    FROM review_submissions
    WHERE batch_id = NEW.batch_id;
    SELECT count(*) INTO snapshot_count
    FROM review_batch_close_submissions
    WHERE batch_id = NEW.batch_id;
    IF accepted_count <> snapshot_count OR EXISTS (
      SELECT 1
      FROM review_submissions submission
      WHERE submission.batch_id = NEW.batch_id
        AND NOT EXISTS (
          SELECT 1 FROM review_batch_close_submissions snapshot
          WHERE snapshot.batch_id = submission.batch_id
            AND snapshot.submission_fingerprint = submission.submission_fingerprint
        )
    ) OR EXISTS (
      SELECT 1
      FROM review_batch_close_submissions snapshot
      WHERE snapshot.batch_id = NEW.batch_id
        AND NOT EXISTS (
          SELECT 1 FROM review_submissions submission
          WHERE submission.batch_id = snapshot.batch_id
            AND submission.submission_fingerprint = snapshot.submission_fingerprint
        )
    ) THEN
      RAISE EXCEPTION 'community review close snapshot is not the authoritative accepted set'
        USING ERRCODE = 'check_violation';
    END IF;

    IF (SELECT jsonb_typeof(close_record->'acceptedAssignmentIds')
        FROM review_batch_closes WHERE batch_id = NEW.batch_id) IS DISTINCT FROM 'array' OR
       (SELECT jsonb_typeof(close_record->'acceptedReviewerIds')
        FROM review_batch_closes WHERE batch_id = NEW.batch_id) IS DISTINCT FROM 'array' OR
       (SELECT jsonb_typeof(close_record->'acceptedSubmissionFingerprints')
        FROM review_batch_closes WHERE batch_id = NEW.batch_id) IS DISTINCT FROM 'array' THEN
      RAISE EXCEPTION 'community review close record accepted-set fields must be arrays'
        USING ERRCODE = 'check_violation';
    END IF;

    SELECT count(*) INTO close_assignment_count
    FROM jsonb_array_elements_text((
      SELECT close_record->'acceptedAssignmentIds'
      FROM review_batch_closes
      WHERE batch_id = NEW.batch_id
    ));
    SELECT count(*) INTO close_reviewer_count
    FROM jsonb_array_elements_text((
      SELECT close_record->'acceptedReviewerIds'
      FROM review_batch_closes
      WHERE batch_id = NEW.batch_id
    ));
    SELECT count(*) INTO close_submission_count
    FROM jsonb_array_elements_text((
      SELECT close_record->'acceptedSubmissionFingerprints'
      FROM review_batch_closes
      WHERE batch_id = NEW.batch_id
    ));
    IF close_assignment_count <> snapshot_count OR
       close_reviewer_count <> snapshot_count OR
       close_submission_count <> snapshot_count OR EXISTS (
      SELECT 1
      FROM review_batch_close_submissions snapshot
      WHERE snapshot.batch_id = NEW.batch_id
        AND NOT EXISTS (
          SELECT 1
          FROM review_batch_closes close_row,
               jsonb_array_elements_text(close_row.close_record->'acceptedSubmissionFingerprints') item
          WHERE close_row.batch_id = NEW.batch_id
            AND item.value = snapshot.submission_fingerprint
        )
    ) OR EXISTS (
      SELECT 1
      FROM review_batch_close_submissions snapshot
      WHERE snapshot.batch_id = NEW.batch_id
        AND NOT EXISTS (
          SELECT 1
          FROM review_batch_closes close_row,
               jsonb_array_elements_text(close_row.close_record->'acceptedAssignmentIds') item
          WHERE close_row.batch_id = NEW.batch_id
            AND item.value = snapshot.assignment_id
        )
    ) OR EXISTS (
      SELECT 1
      FROM review_batch_close_submissions snapshot
      WHERE snapshot.batch_id = NEW.batch_id
        AND NOT EXISTS (
          SELECT 1
          FROM review_batch_closes close_row,
               jsonb_array_elements_text(close_row.close_record->'acceptedReviewerIds') item
          WHERE close_row.batch_id = NEW.batch_id
            AND item.value = snapshot.reviewer_id
        )
    ) THEN
      RAISE EXCEPTION 'community review close record does not commit the exact accepted set'
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;

  IF OLD.state = 'CLOSED' AND NEW.state = 'FROZEN' THEN
    expected_close_fingerprint := NEW.manifest->>'closeRecordFingerprint';
    expected_frozen_fingerprint := NEW.manifest->>'freezeFingerprint';
    IF expected_close_fingerprint IS NULL OR expected_frozen_fingerprint IS NULL OR
       NOT EXISTS (
         SELECT 1 FROM review_batch_closes
         WHERE batch_id = NEW.batch_id AND review_batch_closes.close_fingerprint = expected_close_fingerprint
       ) OR NOT EXISTS (
         SELECT 1 FROM frozen_review_pools
         WHERE batch_id = NEW.batch_id AND frozen_review_pools.freeze_fingerprint = expected_frozen_fingerprint
       ) THEN
      RAISE EXCEPTION 'frozen community review batch has no matching immutable records'
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'invalid community review batch lifecycle transition'
    USING ERRCODE = 'check_violation';
END;
$$;

DROP TRIGGER IF EXISTS review_batches_authority_guard ON review_batches;
CREATE TRIGGER review_batches_authority_guard
  BEFORE UPDATE ON review_batches
  FOR EACH ROW
  EXECUTE FUNCTION community_review_guard_batch_authority();

-- The service lock order is:
--   batch -> assignment -> accepted submission / close snapshot. Authentication
--   mapping is resolved before the service transaction; submission and close
--   both lock the batch before reading OPEN, so exactly one wins a race.
--
-- Submission:
--   BEGIN; lock batch; verify owner, current consent, assignment and packet;
--   call P3 builder; INSERT accepted row and audit; COMMIT.
--
-- Close:
--   BEGIN; lock batch; read all assignments and accepted rows; call P3 close;
--   INSERT close row and exact snapshot rows; update batch to CLOSED; COMMIT.
--
-- Withdrawal follows the same batch lock and can commit only before an accepted
-- submission. No external network operation is part of these transactions.

COMMIT;
