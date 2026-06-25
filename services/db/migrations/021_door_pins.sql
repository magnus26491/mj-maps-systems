-- 021_door_pins.sql
-- Precise door-level pin storage for stops and a full audit trail of
-- driver corrections.
--
-- door_pin_* columns: the best available geocoded pin at stop-intake time
-- (OS Places / what3words / Plus Code).  Separate from pin_corrected_*
-- (003) which tracks community driver verifications.
--
-- stop_pin_corrections: every driver drag recorded for analytics and future
-- crowdsourced accuracy improvements.

ALTER TABLE stops
  ADD COLUMN IF NOT EXISTS door_pin_lat        DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS door_pin_lng        DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS door_pin_source     TEXT,
  ADD COLUMN IF NOT EXISTS door_pin_confidence NUMERIC(3,2),
  ADD COLUMN IF NOT EXISTS door_pin_updated_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_stops_door_pin_source
  ON stops(door_pin_source)
  WHERE door_pin_source IS NOT NULL;

-- Full history of every driver pin correction for this stop.
CREATE TABLE IF NOT EXISTS stop_pin_corrections (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stop_id     UUID NOT NULL REFERENCES stops(id) ON DELETE CASCADE,
  driver_id   UUID,                      -- NULL = dispatcher / system correction
  lat         DOUBLE PRECISION NOT NULL,
  lng         DOUBLE PRECISION NOT NULL,
  source      TEXT NOT NULL,             -- 'driver_drag' | 'w3w' | 'plus_code' | 'system'
  note        TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_stop_pin_corrections_stop
  ON stop_pin_corrections(stop_id);

CREATE INDEX IF NOT EXISTS idx_stop_pin_corrections_driver
  ON stop_pin_corrections(driver_id)
  WHERE driver_id IS NOT NULL;
