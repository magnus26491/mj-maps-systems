-- 024_stop_delivery_columns.sql
-- Stage 7: Offline-first — add delivery lifecycle columns to stops.
-- Idempotent.

ALTER TABLE stops
  ADD COLUMN IF NOT EXISTS status       TEXT NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS fail_reason  TEXT,
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_stops_status    ON stops(status);
CREATE INDEX IF NOT EXISTS idx_stops_completed ON stops(completed_at) WHERE completed_at IS NOT NULL;

-- Trigger to keep updated_at current
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS stops_updated_at ON stops;
CREATE TRIGGER stops_updated_at
  BEFORE UPDATE ON stops
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
