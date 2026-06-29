-- Ensure all admin users have plan_id='custom' and subscription_tier='enterprise'.
-- Admin accounts created before seed-admin.ts was fixed defaulted to plan_id='navigation'.
-- This is idempotent — safe to run multiple times.
UPDATE users
SET
  plan_id           = 'custom',
  subscription_tier = 'enterprise'
WHERE role = 'admin'
  AND (plan_id IS DISTINCT FROM 'custom' OR subscription_tier IS DISTINCT FROM 'enterprise');
