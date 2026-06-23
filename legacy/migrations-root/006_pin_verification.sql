ALTER TABLE stops
  ADD COLUMN IF NOT EXISTS pin_verified       BOOLEAN  NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS pin_verify_count   SMALLINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pin_corrected_lat  DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS pin_corrected_lng  DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS pin_verified_at    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS normalised_address TEXT;


CREATE INDEX IF NOT EXISTS idx_stops_normalised_address
  ON stops (normalised_address)
  WHERE pin_verified = TRUE;