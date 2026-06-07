-- services/db/migrations/002_geocode_pins.sql
-- Driver pin confirmation loop — verified geocode storage
--
-- When a driver confirms or corrects a delivery pin, the adjusted coordinates
-- are written here so future drivers get the accurate entrance location.
-- Confidence levels:
--   0 = unverified (original geocode)
--   1 = single driver confirmed
--   2 = multi-driver consensus (>= 3 contributors)

CREATE TABLE IF NOT EXISTS geocode_pins (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  normalised_address   TEXT NOT NULL,
  lat                  DOUBLE PRECISION NOT NULL,
  lng                  DOUBLE PRECISION NOT NULL,
  confidence           SMALLINT NOT NULL DEFAULT 0,
  contributor_count    INTEGER NOT NULL DEFAULT 1,
  last_confirmed_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_geocode_pins_address ON geocode_pins(normalised_address);
CREATE INDEX IF NOT EXISTS idx_geocode_pins_confidence   ON geocode_pins(confidence);
