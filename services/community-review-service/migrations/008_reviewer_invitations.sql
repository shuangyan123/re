-- L2-C3B private Reviewer Invitation authority.
--
-- The raw one-time credential is returned only by the issuance operation. This
-- schema stores a digest and bounded lifecycle metadata, never a URL, token,
-- provider subject, applicant contact, or other identity data.

BEGIN;

CREATE TABLE reviewer_invitations (
  invitation_id TEXT PRIMARY KEY,
  secret_digest TEXT NOT NULL UNIQUE,
  application_id TEXT REFERENCES community_review_applications (application_id),
  state TEXT NOT NULL CHECK (state IN ('ISSUED', 'CONSUMED', 'REVOKED', 'EXPIRED')),
  issued_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  expired_at TIMESTAMPTZ,
  CHECK (invitation_id ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$'),
  CHECK (secret_digest ~ '^sha256:[0-9a-f]{64}$'),
  CHECK (expires_at > issued_at),
  CHECK ((state = 'ISSUED' AND consumed_at IS NULL AND revoked_at IS NULL AND expired_at IS NULL) OR
    (state = 'CONSUMED' AND consumed_at IS NOT NULL AND revoked_at IS NULL AND expired_at IS NULL) OR
    (state = 'REVOKED' AND consumed_at IS NULL AND revoked_at IS NOT NULL AND expired_at IS NULL) OR
    (state = 'EXPIRED' AND consumed_at IS NULL AND revoked_at IS NULL AND expired_at IS NOT NULL))
);

CREATE INDEX reviewer_invitations_state_expiry_idx
  ON reviewer_invitations (state, expires_at, invitation_id);

CREATE TABLE reviewer_invitation_audit_events (
  event_id TEXT PRIMARY KEY,
  invitation_id TEXT NOT NULL REFERENCES reviewer_invitations (invitation_id),
  event_type TEXT NOT NULL CHECK (event_type IN ('issued', 'consumed', 'revoked', 'expired')),
  application_id TEXT REFERENCES community_review_applications (application_id),
  occurred_at TIMESTAMPTZ NOT NULL,
  CHECK (event_id ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$'),
  CHECK (application_id IS NULL OR application_id ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$')
);

CREATE INDEX reviewer_invitation_audit_events_invitation_idx
  ON reviewer_invitation_audit_events (invitation_id, occurred_at, event_id);

COMMIT;
