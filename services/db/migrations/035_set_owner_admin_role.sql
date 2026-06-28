-- Migration 035: Promote owner account to role='admin'
--
-- The owner account (is_owner=TRUE, set in migration 034) has role='driver'
-- by default from migration 001. requireAdmin() checks role='admin', so the
-- owner gets 403 on all admin portal endpoints.
--
-- Safe to re-run: only updates rows where is_owner=TRUE and role != 'admin'.

UPDATE users
SET role = 'admin'
WHERE is_owner = TRUE
  AND role != 'admin';

-- Fallback: if is_owner was never set on the owner account, promote by
-- the first-created account (the original owner). This handles any case
-- where migration 034 ran but the is_owner flag was not set on any row.
UPDATE users
SET role = 'admin', is_owner = TRUE
WHERE id = (
  SELECT id FROM users ORDER BY created_at ASC LIMIT 1
)
  AND role != 'admin';

-- Verify: at least one admin must exist after this migration
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM users WHERE role = 'admin') THEN
    RAISE EXCEPTION 'Migration 035 failed: no admin user exists after promotion.';
  END IF;
END $$;