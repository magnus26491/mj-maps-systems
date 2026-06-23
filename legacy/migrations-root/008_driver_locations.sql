-- migrations/008_driver_locations.sql
-- Stores latest GPS ping per driver. Upserted on every driver ping (every 10s).
-- Primary key on driver_id = one row per driver. Redis mirrors this for fast reads.

CREATE TABLE IF NOT EXISTS driver_locations (
  driver_id   UUID        NOT NULL,
  route_id    UUID,
  lat         DOUBLE PRECISION NOT NULL,
  lng         DOUBLE PRECISION NOT NULL,
  heading     SMALLINT,        -- degrees 0-359, nullable
  speed_kmh   REAL,            -- nullable
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT driver_locations_pkey PRIMARY KEY (driver_id)
);

CREATE INDEX IF NOT EXISTS idx_driver_locations_route ON driver_locations (route_id);