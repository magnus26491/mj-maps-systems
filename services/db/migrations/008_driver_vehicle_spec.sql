-- 008_driver_vehicle_spec.sql
-- Add vehicle spec columns to users table (the drivers view aliases users).
-- Idempotent: safe to re-run on any existing DB.


BEGIN;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS vehicle_id         TEXT,
  ADD COLUMN IF NOT EXISTS vehicle_make       TEXT,
  ADD COLUMN IF NOT EXISTS vehicle_model      TEXT,
  ADD COLUMN IF NOT EXISTS vehicle_year       INTEGER,
  ADD COLUMN IF NOT EXISTS vehicle_height_m   DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS vehicle_gvw_kg     INTEGER,
  ADD COLUMN IF NOT EXISTS vehicle_payload_kg INTEGER,
  ADD COLUMN IF NOT EXISTS vehicle_length_m   DOUBLE PRECISION;

COMMIT;