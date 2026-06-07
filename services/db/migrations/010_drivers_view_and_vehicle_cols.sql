-- 010_drivers_view_and_vehicle_cols.sql
--
-- PROBLEM: All application code (dispatcher.ts, driver-routes.ts, assign-route.ts,
-- driver-api.ts) queries FROM drivers / JOIN drivers. But the auth schema (001)
-- creates only a 'users' table. There is no 'drivers' table — so all these queries
-- crash with "relation drivers does not exist" immediately after startup.
--
-- SOLUTION:
--   Step 1 — Add any missing columns to 'users' that auth.ts and dispatcher.ts need.
--   Step 2 — Create 'drivers' as a view aliasing 'users'.
--            Application code needs zero changes.
--
-- Idempotent: uses IF NOT EXISTS / DROP VIEW IF EXISTS throughout.
-- Safe to re-run on any existing DB (fresh Railway deploy or re-run).

BEGIN;

-- ── Step 1: Add missing columns to users ─────────────────────────────────────
-- These columns are queried by auth.ts GET /me and dispatcher.ts but
-- were never added by 001 or 005 (which were written for a 'drivers' table
-- that doesn't exist). Safe to re-run — ADD COLUMN IF NOT EXISTS is no-op
-- if the column already exists.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS name               TEXT,
  ADD COLUMN IF NOT EXISTS plan_id            TEXT    NOT NULL DEFAULT 'navigation',
  ADD COLUMN IF NOT EXISTS vehicle_id         TEXT,
  ADD COLUMN IF NOT EXISTS vehicle_make       TEXT,
  ADD COLUMN IF NOT EXISTS vehicle_model      TEXT,
  ADD COLUMN IF NOT EXISTS vehicle_year       INTEGER,
  ADD COLUMN IF NOT EXISTS vehicle_height_m   DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS vehicle_gvw_kg     INTEGER,
  ADD COLUMN IF NOT EXISTS vehicle_payload_kg INTEGER,
  ADD COLUMN IF NOT EXISTS vehicle_length_m   DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS fcm_token          TEXT;


-- ── Step 2: Drop the view if it exists (allows clean recreation) ─────────────
DROP VIEW IF EXISTS drivers;


-- ── Step 3: Create 'drivers' view aliasing 'users' ───────────────────────────
-- All application code queries FROM drivers / JOIN drivers.
-- This view makes those queries work without changing any application code.
-- The view includes every column that dispatcher.ts, driver-routes.ts,
-- assign-route.ts, driver-api.ts, auth.ts, and fcm-token.ts reference.

CREATE VIEW drivers AS
  SELECT
    id,
    email,
    name,
    role,
    plan_id,
    organisation_id,
    subscription_tier,
    is_active,
    created_at,
    last_login,
    fcm_token,
    vehicle_id,
    vehicle_make,
    vehicle_model,
    vehicle_year,
    vehicle_height_m,
    vehicle_gvw_kg,
    vehicle_payload_kg,
    vehicle_length_m
  FROM users;


COMMIT;