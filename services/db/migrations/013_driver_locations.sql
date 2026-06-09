-- 013_driver_locations.sql
-- Creates the driver_locations table used by POST /api/v1/location.
-- Idempotent.

CREATE TABLE IF NOT EXISTS driver_locations (
  driver_id   UUID PRIMARY KEY REFERENCES drivers(id) ON DELETE CASCADE,
  route_id    UUID REFERENCES routes(id) ON DELETE SET NULL,
  lat         DOUBLE PRECISION NOT NULL,
  lng         DOUBLE PRECISION NOT NULL,
  heading     DOUBLE PRECISION,
  speed_kmh   DOUBLE PRECISION,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_driver_locations_recorded_at
  ON driver_locations(recorded_at);