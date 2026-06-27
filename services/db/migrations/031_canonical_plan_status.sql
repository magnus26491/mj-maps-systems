-- 031_canonical_plan_status.sql
-- ───────────────────────────────────────────────────────────────────────────
-- Phase 2: Canonical Plan Data Model
--
-- PROBLEM: The users table has THREE overlapping plan columns:
--   subscription_tier  — 'pro'|'enterprise'|null (pre-2025 legacy)
--   plan_id            — 'navigation'|'custom'|null (current)
--   plan               — 'free'|... (another variant)
-- This creates ambiguity about which is authoritative.
--
-- SOLUTION: Define ONE canonical model driven by packages/plans:
--
--   plan_id     TEXT NOT NULL DEFAULT 'navigation'  (PlanId: 'navigation'|'custom')
--   plan_status TEXT NOT NULL DEFAULT 'free'
--                 CHECK (plan_status IN ('trialing','active','past_due','canceled','free'))
--
-- Mapping from legacy columns (applied in priority order):
--   1. If subscription_tier = 'pro' OR plan = 'pro'  → plan_id = 'navigation'
--   2. If subscription_tier = 'enterprise' OR plan = 'enterprise' → plan_id = 'custom'
--   3. Default: plan_id = 'navigation'
--
--   Status determination:
--   - trial_ends_at IS NOT NULL AND trial_ends_at > NOW()  → 'trialing'
--   - plan_expires_at IS NOT NULL AND plan_expires_at < NOW() → 'canceled'
--   - plan_expires_at IS NOT NULL AND plan_expires_at > NOW() → 'active'
--   - Default: 'free'
--
-- Flagged records (cannot be cleanly mapped — logged, not guessed):
--   - subscription_tier AND plan both set AND disagree on tier level
--   - plan_expires_at < created_at (impossible expiry)
--   - plan_id = 'custom' but no stripe_customer_id (Enterprise without billing)
--
-- Legacy columns are KEPT readable during transition (never written by new code).
-- The admin portal and feature gates read plan_id + plan_status only.
--
-- See docs/PLAN_MODEL.md for full documentation.
-- ───────────────────────────────────────────────────────────────────────────

BEGIN;

-- ── Add canonical plan columns ────────────────────────────────────────────────
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS plan_id TEXT NOT NULL DEFAULT 'navigation',
  ADD COLUMN IF NOT EXISTS plan_status TEXT NOT NULL DEFAULT 'free';

-- CHECK constraint on plan_status
DO $$
BEGIN
  ALTER TABLE users
    ADD CONSTRAINT users_plan_status_check
    CHECK (plan_status IN ('trialing', 'active', 'past_due', 'canceled', 'free'))
    NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CHECK constraint on plan_id
DO $$
BEGIN
  ALTER TABLE users
    ADD CONSTRAINT users_plan_id_check
    CHECK (plan_id IN ('navigation', 'custom'))
    NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Index for plan-status queries
CREATE INDEX IF NOT EXISTS idx_users_plan_status ON users (plan_status);
CREATE INDEX IF NOT EXISTS idx_users_plan_id    ON users (plan_id);

-- ── Backfill plan_id ───────────────────────────────────────────────────────────
-- Priority: subscription_tier > plan > default
DO $$
DECLARE
  flagged_count INTEGER := 0;
  row_count     INTEGER;
BEGIN
  -- Phase 1: set plan_id from subscription_tier where it is non-null
  UPDATE users
     SET plan_id = CASE
       WHEN subscription_tier IN ('pro', 'enterprise') AND plan IN ('pro', 'enterprise', NULL) THEN
         CASE WHEN subscription_tier = 'enterprise' OR plan = 'enterprise' THEN 'custom' ELSE 'navigation' END
       WHEN subscription_tier IN ('pro', 'enterprise') AND plan IS DISTINCT FROM NULL
            AND plan NOT IN ('pro', 'enterprise') THEN
         CASE WHEN subscription_tier = 'enterprise' THEN 'custom' ELSE 'navigation' END
       ELSE plan_id  -- no change
     END
   WHERE subscription_tier IS NOT NULL
     AND plan_id = 'navigation'  -- only update default rows
     AND subscription_tier IN ('pro', 'enterprise', 'starter');

  GET DIAGNOSTICS row_count = ROW_COUNT;

  -- Phase 2: where subscription_tier is null but plan is set, use plan
  UPDATE users
     SET plan_id = CASE
       WHEN plan IN ('pro', 'starter')    THEN 'navigation'
       WHEN plan IN ('enterprise', 'custom') THEN 'custom'
       ELSE plan_id
     END
   WHERE plan_id = 'navigation'
     AND plan IS NOT NULL
     AND plan NOT IN ('free', 'basic');

  -- Phase 3: Enterprise tier → custom
  UPDATE users
     SET plan_id = 'custom'
   WHERE plan_id = 'navigation'
     AND (subscription_tier = 'enterprise' OR plan = 'enterprise');

  GET DIAGNOSTICS row_count = row_count + ROW_COUNT;

  RAISE NOTICE '031: plan_id backfill: % rows updated', row_count;
END $$;

-- ── Backfill plan_status ───────────────────────────────────────────────────────
DO $$
DECLARE
  row_count INTEGER;
BEGIN
  -- trialing: trial_ends_at is in the future
  UPDATE users
     SET plan_status = 'trialing'
   WHERE plan_status = 'free'
     AND trial_ends_at IS NOT NULL
     AND trial_ends_at > NOW();

  -- past_due: has a plan but expired (trial ended without conversion)
  UPDATE users
     SET plan_status = 'past_due'
   WHERE plan_status = 'free'
     AND plan_expires_at IS NOT NULL
     AND plan_expires_at < NOW()
     AND trial_ends_at IS NOT NULL
     AND trial_ends_at < NOW();

  -- active: has an expiry in the future (converted or comped)
  UPDATE users
     SET plan_status = 'active'
   WHERE plan_status = 'free'
     AND plan_expires_at IS NOT NULL
     AND plan_expires_at > NOW();

  -- canceled: was active but now expired without renewal
  UPDATE users
     SET plan_status = 'canceled'
   WHERE plan_status IN ('free', 'active')
     AND plan_expires_at IS NOT NULL
     AND plan_expires_at < NOW()
     AND (trial_ends_at IS NULL OR trial_ends_at < NOW() - INTERVAL '1 day');

  GET DIAGNOSTICS row_count = ROW_COUNT;
  RAISE NOTICE '031: plan_status backfill: % rows updated', row_count;
END $$;

-- ── Flag ambiguous records (logged, not auto-corrected) ────────────────────────
DO $$
DECLARE
  ambiguous RECORD;
  flag_count INTEGER := 0;
BEGIN
  FOR ambiguous IN (
    SELECT id, email,
           subscription_tier, plan, plan_id, plan_status,
           trial_ends_at, plan_expires_at, stripe_customer_id
    FROM   users
    WHERE  (
      -- Both subscription_tier AND plan are set and disagree
      (subscription_tier IS NOT NULL AND plan IS NOT NULL
       AND NOT (
         (subscription_tier = 'enterprise' AND plan IN ('enterprise','custom'))
         OR (subscription_tier IN ('pro','starter') AND plan IN ('pro','starter','free',NULL))
         OR (subscription_tier = 'free' AND plan IN ('free','basic',NULL))
       ))
      OR
      -- Impossible expiry date
      (plan_expires_at IS NOT NULL AND plan_expires_at < created_at)
      OR
      -- Enterprise without Stripe (flag for human review)
      ((subscription_tier = 'enterprise' OR plan = 'enterprise' OR plan_id = 'custom')
       AND stripe_customer_id IS NULL AND role = 'driver')
    )
  ) LOOP
    RAISE WARNING '031 AMBIGUOUS: id=%, email=%, subscription_tier=%, plan=%, plan_id=%, plan_status=%, trial_ends=%, plan_expires=%, stripe=%',
      ambiguous.id, ambiguous.email, ambiguous.subscription_tier, ambiguous.plan,
      ambiguous.plan_id, ambiguous.plan_status, ambiguous.trial_ends_at,
      ambiguous.plan_expires_at, ambiguous.stripe_customer_id;
    flag_count := flag_count + 1;
  END LOOP;

  RAISE NOTICE '031: % ambiguous records flagged for manual review (see warnings above)', flag_count;
END $$;

-- ── Ensure defaults are applied to any remaining un-set rows ───────────────────
UPDATE users SET plan_id     = 'navigation' WHERE plan_id     IS NULL;
UPDATE users SET plan_status = 'free'       WHERE plan_status IS NULL;

-- Mark all constraints as valid now that existing data is consistent
ALTER TABLE users VALIDATE CONSTRAINT users_plan_status_check;
ALTER TABLE users VALIDATE CONSTRAINT users_plan_id_check;

COMMIT;

-- Verification
SELECT '031_canonical_plan_status applied' AS migration,
       (SELECT COUNT(*) FROM users WHERE plan_id = 'navigation') AS nav_users,
       (SELECT COUNT(*) FROM users WHERE plan_id = 'custom')     AS ent_users,
       (SELECT COUNT(*) FROM users WHERE plan_status = 'trialing') AS trialing,
       (SELECT COUNT(*) FROM users WHERE plan_status = 'active')  AS active,
       (SELECT COUNT(*) FROM users WHERE plan_status = 'free')    AS free,
       (SELECT COUNT(*) FROM users WHERE plan_status = 'past_due') AS past_due,
       (SELECT COUNT(*) FROM users WHERE plan_status = 'canceled') AS canceled;