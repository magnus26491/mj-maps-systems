-- 003_stops_pin_columns.sql
-- Add pin confirmation columns to stops table if they don't exist.
-- All columns are nullable — existing stops are unaffected.

ALTER TABLE stops
  ADD COLUMN IF NOT EXISTS normalised_address TEXT,
  ADD COLUMN IF NOT EXISTS pin_corrected_lat  DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS pin_corrected_lng  DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS pin_verify_count   INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pin_verified       BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS pin_verified_at    TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_stops_normalised_address
  ON stops(normalised_address)
  WHERE normalised_address IS NOT NULL;
