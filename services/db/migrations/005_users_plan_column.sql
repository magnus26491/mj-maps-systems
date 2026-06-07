-- 005_users_plan_column.sql
-- Add plan_id to the users table (stored in auth JWT, checked by feature gates).
-- Targets users table — the drivers view (010+) aliases users.


BEGIN;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS plan_id TEXT NOT NULL DEFAULT 'navigation';

COMMIT;

-- Admin always gets full access (runs once on existing rows)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'users') THEN
    UPDATE users SET plan_id = 'custom' WHERE role = 'admin' AND plan_id = 'navigation';
  END IF;
END $$;
