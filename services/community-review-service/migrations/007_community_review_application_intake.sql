-- L2-C2C closed participation-application intake.
--
-- Application contact/free text is intentionally isolated from reviewer and
-- protocol tables. Withdrawal and retention purge redact the contact row and
-- free text while preserving a small application tombstone and idempotency
-- mapping for audit/replay safety.

BEGIN;

CREATE TABLE community_review_applications (
  application_id TEXT PRIMARY KEY,
  schema_version INTEGER NOT NULL CHECK (schema_version = 1),
  application_kind TEXT NOT NULL CHECK (application_kind = 'community-review-application'),
  contract_id TEXT NOT NULL CHECK (contract_id = 'community-review-application'),
  contract_version TEXT NOT NULL CHECK (contract_version = '0.1.0'),
  notice_version TEXT NOT NULL CHECK (notice_version = '0.1.0'),
  submitted_locale TEXT NOT NULL CHECK (submitted_locale IN ('en', 'zh-CN')),
  preferred_review_locale TEXT NOT NULL CHECK (preferred_review_locale IN ('en', 'zh-CN')),
  motivation TEXT,
  experience_summary TEXT,
  availability TEXT NOT NULL CHECK (availability IN ('occasional', 'regular', 'flexible')),
  acknowledgements JSONB NOT NULL,
  decision TEXT NOT NULL CHECK (decision IN ('PENDING', 'INVITED', 'DECLINED')),
  lifecycle TEXT NOT NULL CHECK (lifecycle IN ('ACTIVE', 'WITHDRAWN', 'PURGED')),
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  decision_at TIMESTAMPTZ,
  retention_expires_at TIMESTAMPTZ NOT NULL,
  withdrawn_at TIMESTAMPTZ,
  purged_at TIMESTAMPTZ,
  withdrawal_credential_digest TEXT,
  CHECK (application_id ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$'),
  CHECK (length(motivation) <= 1000),
  CHECK (length(experience_summary) <= 1000),
  CHECK (withdrawal_credential_digest IS NULL OR withdrawal_credential_digest ~ '^sha256:[0-9a-f]{64}$'),
  CHECK ((decision = 'PENDING') = (decision_at IS NULL)),
  CHECK ((lifecycle = 'WITHDRAWN') = (withdrawn_at IS NOT NULL)),
  CHECK ((lifecycle = 'PURGED') = (purged_at IS NOT NULL)),
  CHECK (lifecycle = 'ACTIVE' OR (motivation IS NULL AND experience_summary IS NULL)),
  CHECK (lifecycle <> 'ACTIVE' OR motivation IS NOT NULL)
);

CREATE INDEX community_review_applications_pending_idx
  ON community_review_applications (decision, lifecycle, created_at, application_id);

CREATE INDEX community_review_applications_retention_idx
  ON community_review_applications (retention_expires_at, lifecycle);

CREATE TABLE community_review_application_contacts (
  application_id TEXT PRIMARY KEY REFERENCES community_review_applications (application_id),
  contact_type TEXT NOT NULL CHECK (contact_type = 'email'),
  contact_value TEXT NOT NULL CHECK (length(contact_value) BETWEEN 3 AND 254),
  created_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE community_review_application_idempotency (
  idempotency_key_fingerprint TEXT PRIMARY KEY,
  request_fingerprint TEXT NOT NULL,
  application_id TEXT NOT NULL REFERENCES community_review_applications (application_id),
  contract_id TEXT NOT NULL CHECK (contract_id = 'community-review-application'),
  contract_version TEXT NOT NULL CHECK (contract_version = '0.1.0'),
  notice_version TEXT NOT NULL CHECK (notice_version = '0.1.0'),
  received_at TIMESTAMPTZ NOT NULL,
  withdrawal_credential_returned BOOLEAN NOT NULL CHECK (withdrawal_credential_returned),
  created_at TIMESTAMPTZ NOT NULL,
  CHECK (idempotency_key_fingerprint ~ '^sha256:[0-9a-f]{64}$'),
  CHECK (request_fingerprint ~ '^sha256:[0-9a-f]{64}$')
);

CREATE TABLE community_review_application_audit_events (
  event_id TEXT PRIMARY KEY,
  application_id TEXT NOT NULL REFERENCES community_review_applications (application_id),
  event_type TEXT NOT NULL CHECK (event_type IN (
    'application_submitted',
    'application_decision_recorded',
    'application_withdrawn',
    'application_purged'
  )),
  decision TEXT CHECK (decision IS NULL OR decision IN ('PENDING', 'INVITED', 'DECLINED')),
  occurred_at TIMESTAMPTZ NOT NULL,
  CHECK (event_type <> 'application_decision_recorded' OR decision IS NOT NULL)
);

CREATE INDEX community_review_application_audit_events_application_idx
  ON community_review_application_audit_events (application_id, occurred_at, event_id);

COMMIT;
