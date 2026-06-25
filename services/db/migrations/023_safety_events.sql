-- 023_safety_events.sql
-- Stage 9: Safety UX — structured safety event log for drivers and dispatchers.
--
-- Events are raised by:
--   a) Driver tapping the one-touch SOS button in the driver app
--   b) Navigation guard detecting a critical vehicle restriction
--   c) System (automatic welfare-check trigger after long stop dwell)

CREATE TABLE IF NOT EXISTS safety_events (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id    UUID REFERENCES users(id) ON DELETE SET NULL,
  type         TEXT NOT NULL,   -- NEAR_MISS | HAZARD_SPOTTED | VEHICLE_DAMAGE | WELFARE_CHECK | ROUTE_BLOCKED | EMERGENCY
  severity     TEXT NOT NULL DEFAULT 'MEDIUM',  -- LOW | MEDIUM | HIGH | CRITICAL
  lat          DOUBLE PRECISION,
  lng          DOUBLE PRECISION,
  note         TEXT,
  route_id     UUID REFERENCES routes(id) ON DELETE SET NULL,
  stop_id      UUID REFERENCES stops(id) ON DELETE SET NULL,
  resolved_at  TIMESTAMPTZ,
  resolved_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_safety_events_driver    ON safety_events(driver_id);
CREATE INDEX IF NOT EXISTS idx_safety_events_created   ON safety_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_safety_events_severity  ON safety_events(severity, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_safety_events_unresolved
  ON safety_events(created_at DESC) WHERE resolved_at IS NULL;
