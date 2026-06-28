-- Migration 034: Admin portal — missing columns and tables
--
-- Adds columns used by the admin panel /overview and /trials endpoints.
-- Also creates the tickets table and admin_audit_logs table referenced
-- by the admin portal queries.
--
-- Safe to re-run: ADD COLUMN IF NOT EXISTS and CREATE TABLE IF NOT EXISTS
-- are idempotent.

-- ── users table extensions ──────────────────────────────────────────────────

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS plan_status    TEXT NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS trial_ends_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS plan_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS is_owner       BOOLEAN NOT NULL DEFAULT FALSE;

-- Normalise plan_status from existing plan column for users who already exist
UPDATE users
SET
  plan_status    = CASE WHEN plan IN ('courier', 'fleet', 'enterprise') THEN 'active'
                        WHEN plan = 'custom' THEN 'enterprise_active'
                        ELSE 'active' END,
  trial_ends_at  = CASE WHEN plan = 'free' AND created_at >= NOW() - INTERVAL '14 days'
                        THEN created_at + INTERVAL '14 days' END,
  is_owner       = COALESCE(is_owner, FALSE)
WHERE plan_status = 'active' OR plan_status = 'free';

-- ── tickets table ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS tickets (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID REFERENCES users(id) ON DELETE SET NULL,
  subject       TEXT NOT NULL,
  description   TEXT,
  status        TEXT NOT NULL DEFAULT 'open'
                  CHECK (status IN ('open', 'in_progress', 'resolved', 'closed')),
  priority      TEXT NOT NULL DEFAULT 'normal'
                  CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  assignee_id   UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tickets_status       ON tickets(status);
CREATE INDEX IF NOT EXISTS idx_tickets_user_id      ON tickets(user_id);
CREATE INDEX IF NOT EXISTS idx_tickets_assignee_id  ON tickets(assignee_id);

-- ── admin_audit_logs table ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS admin_audit_logs (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id            UUID REFERENCES users(id) ON DELETE SET NULL,
  action              TEXT NOT NULL,
  target_type         TEXT,
  target_id           TEXT,
  old_value           JSONB,
  new_value           JSONB,
  reason              TEXT,
  ip_address          TEXT,
  impersonating       BOOLEAN NOT NULL DEFAULT FALSE,
  impersonated_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_admin_id   ON admin_audit_logs(admin_id);
CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_action     ON admin_audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_created_at ON admin_audit_logs(created_at DESC);