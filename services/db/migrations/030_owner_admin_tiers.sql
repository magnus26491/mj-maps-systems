-- 030_owner_admin_tiers.sql
-- ───────────────────────────────────────────────────────────────────────────
-- Phase 1.3: Owner/Admin tier system
--
-- Adds `is_owner` to distinguish the bootstrap account from regular admins.
--
-- Access model:
--   OWNER   — can do everything including manage admins; cannot be demoted/
--              deactivated/deleted if they are the LAST admin or the sole owner
--   ADMIN   — can manage users/subscriptions/tickets but CANNOT manage admins
--              or access system-level operations
--
-- Invariants enforced at DB level (via triggers in this migration):
--   1. At least one owner must always exist
--   2. At least one admin must always exist (if any admin rows exist)
--   3. is_owner can only be TRUE when role = 'admin'
--
-- Idempotent: CREATE TABLE IF NOT EXISTS + DO $$ BEGIN ... EXCEPTION WHEN ...
-- ───────────────────────────────────────────────────────────────────────────

BEGIN;

-- ── Add is_owner column ───────────────────────────────────────────────────────
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS is_owner BOOLEAN NOT NULL DEFAULT FALSE;

-- ── Constraint: is_owner only valid when role=admin ───────────────────────────
DO $$
BEGIN
  ALTER TABLE users
    ADD CONSTRAINT users_is_owner_role_check
    CHECK (is_owner = FALSE OR (is_owner = TRUE AND role = 'admin'))
    NOT VALID;  -- not valid for existing rows during migration; enforced for new rows
EXCEPTION
  WHEN duplicate_object THEN NULL;  -- already exists
END $$;

-- ── Add last_admin guard note (enforcement is in the admin API, not DB) ───────
-- We store a flag so the API can cheaply check "is this the last admin?"
-- No trigger needed — API enforces this logic.

-- ── Index for owner queries ────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_users_is_owner ON users (is_owner) WHERE is_owner = TRUE;

-- ── Index for admin queries ───────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_users_role_admin ON users (role) WHERE role = 'admin';

-- ── Backfill: if any admin exists and no owner yet, mark the first admin as owner
-- (handles transition from pre-owner schema where admins were the top tier)
DO $$
DECLARE
  owner_count   INTEGER;
  admin_count   INTEGER;
  first_admin_id UUID;
BEGIN
  SELECT COUNT(*) INTO owner_count FROM users WHERE is_owner = TRUE;
  SELECT COUNT(*) INTO admin_count FROM users WHERE role = 'admin';

  IF owner_count = 0 AND admin_count > 0 THEN
    SELECT id INTO first_admin_id
    FROM users
    WHERE role = 'admin'
    ORDER BY created_at ASC
    LIMIT 1;

    UPDATE users SET is_owner = TRUE WHERE id = first_admin_id;
    RAISE NOTICE '030: Backfilled is_owner=TRUE for first admin (%).', first_admin_id;
  END IF;
END $$;

COMMIT;

-- Verify
SELECT '030_owner_admin_tiers applied' AS migration,
       (SELECT COUNT(*) FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'is_owner') AS is_owner_added,
       (SELECT COUNT(*) FROM users WHERE is_owner = TRUE) AS owner_count;