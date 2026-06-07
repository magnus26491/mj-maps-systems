-- 005_users_plan_column.sql
ALTER TABLE drivers
  ADD COLUMN IF NOT EXISTS plan_id TEXT NOT NULL DEFAULT 'navigation'
  CHECK (plan_id IN ('navigation', 'custom'));

-- Admin always gets full access
UPDATE drivers SET plan_id = 'custom' WHERE role = 'admin';
