-- 008_driver_vehicle_spec.sql
-- Add real vehicle spec columns to drivers table.
-- vehicle_id TEXT already exists — kept as the routing profile key.
-- New columns carry the actual measured specs for bridge/turn/height filtering.


ALTER TABLE drivers
  ADD COLUMN IF NOT EXISTS vehicle_make       TEXT,
  ADD COLUMN IF NOT EXISTS vehicle_model      TEXT,
  ADD COLUMN IF NOT EXISTS vehicle_year       INTEGER,
  ADD COLUMN IF NOT EXISTS vehicle_height_m   DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS vehicle_gvw_kg     INTEGER,
  ADD COLUMN IF NOT EXISTS vehicle_payload_kg INTEGER,
  ADD COLUMN IF NOT EXISTS vehicle_length_m   DOUBLE PRECISION;