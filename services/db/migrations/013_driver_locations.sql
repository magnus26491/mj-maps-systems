-- 013_driver_locations.sql
-- Creates the driver_locations table used by POST /api/v1/location.
-- Stores full GPS history per driver for route completion distance calculation.
-- Idempotent.
-- NOTE: FK references users (real table). drivers is a VIEW aliasing users.


CREATE TABLE IF NOT EXISTS driver_locations (
  driver_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  route_id    UUID REFERENCES routes(id) ON DELETE SET NULL,
  lat         DOUBLE PRECISION NOT NULL,
  lng         DOUBLE PRECISION NOT NULL,
  heading     DOUBLE PRECISION,
  speed_kmh   DOUBLE PRECISION,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (driver_id, recorded_at)
);


CREATE INDEX IF NOT EXISTS idx_driver_locations_route_id
  ON driver_locations(route_id);


CREATE INDEX IF NOT EXISTS idx_driver_locations_recorded_at
  ON driver_locations(recorded_at);
