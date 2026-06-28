-- Migration 034: Admin portal — missing columns and tables
--
-- The tickets table was created by migration 032 with column name
-- assignee_admin_id. This migration adds an assignee_id alias column
-- and any other missing columns so the admin portal queries work.
--
-- admin_audit_logs is created here (028 created a different schema).
-- All statements are idempotent (IF NOT EXISTS / ADD COLUMN IF NOT EXISTS).

-- ── users table extensions ──────────────────────────────────────────────────

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS plan_status     TEXT NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS trial_ends_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS plan_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS is_owner        BOOLEAN NOT NULL DEFAULT FALSE;

-- Normalise plan_status for existing rows
UPDATE users
SET
  plan_status   = CASE
                    WHEN plan_id IN ('navigation', 'custom') THEN 'active'
                    ELSE 'active'
                  END,
  is_owner      = COALESCE(is_owner, FALSE)
WHERE plan_status = 'active';

-- ── tickets table: add missing assignee_id column (alias for assignee_admin_id)
-- 032 created tickets with assignee_admin_id; admin portal queries use assignee_id.
-- We add it as a separate nullable column so both names work going forward.

ALTER TABLE tickets
  ADD COLUMN IF NOT EXISTS assignee_id UUID REFERENCES users(id) ON DELETE SET NULL;

-- Add description column if missing (032 used body, admin portal uses description)
ALTER TABLE tickets
  ADD COLUMN IF NOT EXISTS description TEXT;

CREATE INDEX IF NOT EXISTS idx_tickets_assignee_id ON tickets(assignee_id);

-- ── admin_audit_logs table ───────────────────────────────────────────────────
-- 028 may have created this with a different schema; use IF NOT EXISTS to be safe.

CREATE TABLE IF NOT EXISTS admin_audit_logs (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id             UUID REFERENCES users(id) ON DELETE SET NULL,
  action               TEXT NOT NULL,
  target_type          TEXT,
  target_id            TEXT,
  old_value            JSONB,
  new_value            JSONB,
  reason               TEXT,
  ip_address           TEXT,
  impersonating        BOOLEAN NOT NULL DEFAULT FALSE,
  impersonated_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_admin_id   ON admin_audit_logs(admin_id);
CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_action     ON admin_audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_created_at ON admin_audit_logs(created_at DESC);
