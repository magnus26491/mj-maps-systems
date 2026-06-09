-- 014_routes_completion_cols.sql
-- Adds route completion tracking columns missing from the base schema.
-- Idempotent.


ALTER TABLE routes
  ADD COLUMN IF NOT EXISTS finished_at        TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS on_time            BOOLEAN,
  ADD COLUMN IF NOT EXISTS actual_distance_km DOUBLE PRECISION;


CREATE INDEX IF NOT EXISTS routes_finished_at_idx ON routes(finished_at);