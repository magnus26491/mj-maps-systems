-- 000_base_schema.sql
-- Base tables: routes, stops, turn_reports
-- Must run before 001-onwards which ALTER these tables.
-- All idempotent via IF NOT EXISTS.


BEGIN;


CREATE TABLE IF NOT EXISTS routes (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id           UUID,
  vehicle_id          TEXT,
  depot_lat           DOUBLE PRECISION,
  depot_lon           DOUBLE PRECISION,
  shift_start         TIMESTAMPTZ,
  total_stops         INTEGER NOT NULL DEFAULT 0,
  completed_stops     INTEGER NOT NULL DEFAULT 0,
  failed_stops        INTEGER NOT NULL DEFAULT 0,
  status              TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','completed','abandoned')),
  raw_result          JSONB,
  actual_completion   TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


CREATE TABLE IF NOT EXISTS stops (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  route_id            UUID REFERENCES routes(id) ON DELETE CASCADE,
  stop_ref            TEXT,
  address             TEXT NOT NULL,
  pin_lat             DOUBLE PRECISION,
  pin_lon             DOUBLE PRECISION,
  status              TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','completed','failed','skipped')),
  sequence_number     INTEGER,
  turn_alert_level    TEXT,
  turn_score          DOUBLE PRECISION,
  failure_reason      TEXT,
  proof_photo_url     TEXT,
  actual_arrival      TIMESTAMPTZ,
  actual_departure    TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


CREATE TABLE IF NOT EXISTS turn_reports (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id           UUID,
  stop_id             UUID REFERENCES stops(id) ON DELETE SET NULL,
  lat                 DOUBLE PRECISION NOT NULL,
  lon                 DOUBLE PRECISION NOT NULL,
  vehicle_id          TEXT NOT NULL,
  could_turn          BOOLEAN NOT NULL,
  had_to_reverse      BOOLEAN NOT NULL,
  road_width_est      DOUBLE PRECISION,
  notes               TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


CREATE INDEX IF NOT EXISTS idx_routes_driver_id  ON routes(driver_id);
CREATE INDEX IF NOT EXISTS idx_routes_status     ON routes(status);
CREATE INDEX IF NOT EXISTS idx_stops_route_id    ON stops(route_id);
CREATE INDEX IF NOT EXISTS idx_stops_status      ON stops(status);
CREATE INDEX IF NOT EXISTS idx_turn_reports_stop ON turn_reports(stop_id);
CREATE INDEX IF NOT EXISTS idx_turn_reports_loc  ON turn_reports(lat, lon);


COMMIT;