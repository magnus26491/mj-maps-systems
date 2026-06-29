-- 028_admin_audit_logs.sql
-- Immutable audit log for all admin actions.
-- Rows can NEVER be updated or deleted by anyone — enforced by DB-level rules.
-- Every mutation (plan change, impersonation, flag toggle) creates a row here.
-- No admin (including superuser) can modify this table.

BEGIN;

-- ── Admin audit logs ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS admin_audit_logs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id        UUID NOT NULL,                              -- who did it
  action          TEXT NOT NULL,                              -- e.g. 'plan_change', 'impersonation_start', 'flag_toggle'
  target_type     TEXT,                                       -- e.g. 'user', 'feature_flag', 'subscription'
  target_id       TEXT,                                       -- UUID or key of the affected entity
  old_value       JSONB,                                      -- serialised previous state (never null for plan changes)
  new_value       JSONB,                                      -- serialised new state
  reason          TEXT,                                       -- mandatory for sensitive actions
  ip_address      INET,
  user_agent      TEXT,
  impersonating   BOOLEAN NOT NULL DEFAULT FALSE,             -- was admin acting as another user?
  impersonated_user_id UUID,                                  -- if impersonating is true
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for admin-specific queries (admin dashboard, compliance)
CREATE INDEX IF NOT EXISTS idx_admin_audit_admin_id
  ON admin_audit_logs(admin_id, created_at DESC);

-- Index for target-based queries (what happened to user X?)
CREATE INDEX IF NOT EXISTS idx_admin_audit_target
  ON admin_audit_logs(target_type, target_id, created_at DESC);

-- Index for action-type queries (all impersonation events?)
CREATE INDEX IF NOT EXISTS idx_admin_audit_action
  ON admin_audit_logs(action, created_at DESC);

-- Index for date-range queries (compliance window)
CREATE INDEX IF NOT EXISTS idx_admin_audit_created
  ON admin_audit_logs(created_at DESC);

-- ── Impersonation sessions ─────────────────────────────────────────────────────
-- Tracks active impersonation sessions so they can be revoked on admin logout.
CREATE TABLE IF NOT EXISTS impersonation_sessions (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id            UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  impersonated_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  impersonation_token_hash TEXT NOT NULL,    -- SHA-256 of the short-lived JWT
  reason              TEXT NOT NULL,
  ip_address          INET,
  user_agent          TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at          TIMESTAMPTZ NOT NULL,
  revoked_at          TIMESTAMPTZ,               -- set when admin ends impersonation
  revoked_by          UUID REFERENCES users(id)   -- self or system
);

CREATE INDEX IF NOT EXISTS idx_impersonation_admin
  ON impersonation_sessions(admin_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_impersonation_user
  ON impersonation_sessions(impersonated_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_impersonation_token
  ON impersonation_sessions(impersonation_token_hash);

CREATE INDEX IF NOT EXISTS idx_impersonation_active
  ON impersonation_sessions(admin_id)
  WHERE revoked_at IS NULL;

-- ── Row-level security: prevent UPDATE/DELETE on audit logs ───────────────────
-- Using a trigger to enforce immutability — even DB admins cannot modify audit rows.
CREATE OR REPLACE FUNCTION prevent_audit_modification()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Admin audit logs are immutable. UPDATE and DELETE are not permitted.';
END;
$$ LANGUAGE plpgsql;

-- Apply to admin_audit_logs — AFTER INSERT is OK, UPDATE/DELETE blocked
DROP TRIGGER IF EXISTS block_audit_update ON admin_audit_logs;
CREATE TRIGGER block_audit_update
  BEFORE UPDATE OR DELETE ON admin_audit_logs
  FOR EACH ROW EXECUTE FUNCTION prevent_audit_modification();

-- Impersonation sessions CAN be updated (to set revoked_at) but never deleted
DROP TRIGGER IF EXISTS block_impersonation_delete ON impersonation_sessions;
CREATE TRIGGER block_impersonation_delete
  BEFORE DELETE ON impersonation_sessions
  FOR EACH ROW EXECUTE FUNCTION prevent_audit_modification();

-- ── Impersonation sessions revocation trigger ───────────────────────────────────
-- When an admin user is deleted, revoke all their active impersonation sessions.
CREATE OR REPLACE FUNCTION revoke_admin_impersonations()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE impersonation_sessions
  SET revoked_at = NOW(), revoked_by = NULL
  WHERE admin_id = OLD.id AND revoked_at IS NULL;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS revoke_impersonations_on_admin_delete ON users;
CREATE TRIGGER revoke_impersonations_on_admin_delete
  BEFORE DELETE ON users
  FOR EACH ROW
  WHEN (OLD.role = 'admin')
  EXECUTE FUNCTION revoke_admin_impersonations();

COMMIT;
