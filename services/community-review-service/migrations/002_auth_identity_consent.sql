-- P4-B production authentication, private reviewer identity, and consent authority.
--
-- This is a PostgreSQL design boundary only. It stores the minimum private
-- mapping needed to resolve an authenticated principal; it never stores
-- tokens, cookies, JWTs, raw claims, or authentication material in P3 JSON.

BEGIN;

ALTER TABLE reviewer_accounts
  DROP CONSTRAINT reviewer_accounts_status_check,
  DROP CONSTRAINT reviewer_accounts_consent_state_check;

-- Normalize the P4-A placeholder names before installing the lifecycle model.
UPDATE reviewer_accounts
SET status = 'DISABLED'
WHERE status = 'SUSPENDED';

UPDATE reviewer_accounts
SET consent_state = 'REVOKED'
WHERE consent_state = 'WITHDRAWN';

ALTER TABLE reviewer_accounts
  ADD CONSTRAINT reviewer_accounts_status_check
    CHECK (status IN ('ACTIVE', 'WITHDRAWN', 'DISABLED')),
  ADD CONSTRAINT reviewer_accounts_consent_state_check
    CHECK (consent_state IN ('NOT_CONSENTED', 'CONSENTED', 'REVOKED')),
  ADD CONSTRAINT reviewer_accounts_internal_reviewer_key
    UNIQUE (internal_id, reviewer_id);

-- The subject is private identity data. It is never copied into a P3 object
-- or returned by reviewer-facing application operations.
CREATE TABLE reviewer_auth_identities (
  auth_identity_id TEXT PRIMARY KEY,
  internal_id TEXT NOT NULL UNIQUE REFERENCES reviewer_accounts (internal_id),
  reviewer_id TEXT NOT NULL UNIQUE REFERENCES reviewer_accounts (reviewer_id),
  auth_provider TEXT NOT NULL,
  auth_subject TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  UNIQUE (auth_provider, auth_subject),
  FOREIGN KEY (internal_id, reviewer_id)
    REFERENCES reviewer_accounts (internal_id, reviewer_id),
  CHECK (auth_provider ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$'),
  CHECK (length(auth_subject) BETWEEN 1 AND 512)
);

-- Consent is append-only. Current validity is the latest event for the
-- reviewer/policy tuple, not a caller-controlled mutable history row.
CREATE TABLE reviewer_consent_events (
  consent_event_id TEXT PRIMARY KEY,
  internal_id TEXT NOT NULL REFERENCES reviewer_accounts (internal_id),
  reviewer_id TEXT NOT NULL REFERENCES reviewer_accounts (reviewer_id),
  policy_id TEXT NOT NULL,
  policy_version TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('ACCEPTED', 'REVOKED')),
  accepted_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  recorded_at TIMESTAMPTZ NOT NULL,
  CHECK (length(policy_id) BETWEEN 1 AND 128),
  CHECK (length(policy_version) BETWEEN 1 AND 128),
  CHECK (
    (state = 'ACCEPTED' AND accepted_at IS NOT NULL AND revoked_at IS NULL) OR
    (state = 'REVOKED' AND accepted_at IS NULL AND revoked_at IS NOT NULL)
  ),
  FOREIGN KEY (internal_id, reviewer_id)
    REFERENCES reviewer_accounts (internal_id, reviewer_id)
);

CREATE INDEX reviewer_consent_events_current_idx
  ON reviewer_consent_events (internal_id, policy_id, policy_version, recorded_at DESC, consent_event_id DESC);

-- Preserve an explicitly consented P4-A account as historical data. New
-- accounts created by P4-B start NOT_CONSENTED and must use recordConsent.
INSERT INTO reviewer_consent_events (
  consent_event_id,
  internal_id,
  reviewer_id,
  policy_id,
  policy_version,
  state,
  accepted_at,
  recorded_at
)
SELECT
  'legacy-consent-' || internal_id,
  internal_id,
  reviewer_id,
  'community-review',
  consent_version,
  'ACCEPTED',
  created_at,
  created_at
FROM reviewer_accounts
WHERE consent_state = 'CONSENTED'
ON CONFLICT (consent_event_id) DO NOTHING;

-- Audit metadata is intentionally narrow. In particular, there is no subject,
-- token, cookie, JWT, password, or claims column.
CREATE TABLE reviewer_auth_audit_events (
  event_id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL CHECK (event_type IN (
    'account_created',
    'consent_accepted',
    'consent_revoked',
    'account_withdrawn',
    'account_disabled',
    'authentication_mapping_created',
    'authentication_mapping_rejected'
  )),
  internal_id TEXT REFERENCES reviewer_accounts (internal_id),
  reviewer_id TEXT REFERENCES reviewer_accounts (reviewer_id),
  auth_provider TEXT,
  reason_code TEXT,
  occurred_at TIMESTAMPTZ NOT NULL,
  FOREIGN KEY (internal_id, reviewer_id)
    REFERENCES reviewer_accounts (internal_id, reviewer_id),
  CHECK (auth_provider IS NULL OR auth_provider ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$'),
  CHECK (reason_code IS NULL OR reason_code ~ '^[A-Za-z0-9._:-]{1,80}$')
);

CREATE INDEX reviewer_auth_audit_events_internal_idx
  ON reviewer_auth_audit_events (internal_id, occurred_at, event_id);

COMMIT;
