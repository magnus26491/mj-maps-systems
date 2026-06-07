-- MJ Maps Systems — PostgreSQL Schema v2
-- Added: password_hash + role columns to drivers table
-- Run once on a fresh database.
--   CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─── Drivers ───────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS drivers (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name             TEXT NOT NULL,
  email            TEXT UNIQUE NOT NULL,
  phone            TEXT,
  password_hash    TEXT NOT NULL,
  role             TEXT NOT NULL DEFAULT 'driver', -- driver|dispatcher|admin
  telegram_chat_id BIGINT,
  vehicle_id       TEXT NOT NULL DEFAULT 'swb_van',
  active           BOOLEAN NOT NULL DEFAULT TRUE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Routes ───────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS routes (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  driver_id             UUID REFERENCES drivers(id) ON DELETE SET NULL,
  vehicle_id            TEXT NOT NULL,
  depot_lat             DOUBLE PRECISION NOT NULL,
  depot_lon             DOUBLE PRECISION NOT NULL,
  shift_start           TIMESTAMPTZ NOT NULL,
  estimated_completion  TIMESTAMPTZ,
  actual_completion     TIMESTAMPTZ,
  total_stops           INTEGER NOT NULL DEFAULT 0,
  completed_stops       INTEGER NOT NULL DEFAULT 0,
  failed_stops          INTEGER NOT NULL DEFAULT 0,
  total_distance_km     DOUBLE PRECISION,
  status                TEXT NOT NULL DEFAULT 'planned',
  raw_result            JSONB,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS routes_driver_id_idx ON routes(driver_id);
CREATE INDEX IF NOT EXISTS routes_status_idx ON routes(status);
CREATE INDEX IF NOT EXISTS routes_shift_start_idx ON routes(shift_start);

-- ─── Stops ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS stops (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  route_id          UUID REFERENCES routes(id) ON DELETE CASCADE,
  stop_ref          TEXT NOT NULL,
  address           TEXT NOT NULL,
  what3words        TEXT,
  pin_lat           DOUBLE PRECISION,
  pin_lon           DOUBLE PRECISION,
  pin_source        TEXT,
  pin_confidence    DOUBLE PRECISION,
  sequence          INTEGER NOT NULL DEFAULT 0,
  eta               TIMESTAMPTZ,
  actual_arrival    TIMESTAMPTZ,
  actual_departure  TIMESTAMPTZ,
  dwell_minutes     INTEGER DEFAULT 2,
  status            TEXT NOT NULL DEFAULT 'pending',
  failure_reason    TEXT,
  proof_photo_url   TEXT,
  signature_url     TEXT,
  access_notes      TEXT,
  last_50m          TEXT,
  turn_alert_level  TEXT,
  turn_score        DOUBLE PRECISION,
  approach_side     TEXT,
  is_collection     BOOLEAN NOT NULL DEFAULT FALSE,
  weight_kg         DOUBLE PRECISION,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS stops_route_id_idx ON stops(route_id);
CREATE INDEX IF NOT EXISTS stops_status_idx ON stops(status);
CREATE INDEX IF NOT EXISTS stops_pin_latlon_idx ON stops(pin_lat, pin_lon);

-- ─── Turn Reports ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS turn_reports (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  driver_id       UUID REFERENCES drivers(id) ON DELETE SET NULL,
  stop_id         UUID REFERENCES stops(id) ON DELETE SET NULL,
  lat             DOUBLE PRECISION NOT NULL,
  lon             DOUBLE PRECISION NOT NULL,
  vehicle_id      TEXT NOT NULL,
  could_turn      BOOLEAN NOT NULL,
  had_to_reverse  BOOLEAN NOT NULL DEFAULT FALSE,
  road_width_est  DOUBLE PRECISION,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS turn_reports_latlon_idx ON turn_reports(lat, lon);
CREATE INDEX IF NOT EXISTS turn_reports_vehicle_idx ON turn_reports(vehicle_id);

-- ─── Community Scores ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS community_scores (
  lat_bucket    DOUBLE PRECISION NOT NULL,
  lon_bucket    DOUBLE PRECISION NOT NULL,
  vehicle_id    TEXT NOT NULL,
  report_count  INTEGER NOT NULL DEFAULT 0,
  score         DOUBLE PRECISION NOT NULL,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (lat_bucket, lon_bucket, vehicle_id)
);

CREATE OR REPLACE FUNCTION refresh_community_score()
RETURNS TRIGGER AS $$
DECLARE
  bucket_lat DOUBLE PRECISION := ROUND(NEW.lat::NUMERIC, 4);
  bucket_lon DOUBLE PRECISION := ROUND(NEW.lon::NUMERIC, 4);
  new_count  INTEGER;
  new_score  DOUBLE PRECISION;
BEGIN
  SELECT COUNT(*), AVG(CASE WHEN could_turn THEN 1.0 ELSE 0.0 END)
  INTO new_count, new_score
  FROM turn_reports
  WHERE ROUND(lat::NUMERIC, 4) = bucket_lat
    AND ROUND(lon::NUMERIC, 4) = bucket_lon
    AND vehicle_id = NEW.vehicle_id;

  INSERT INTO community_scores (lat_bucket, lon_bucket, vehicle_id, report_count, score, updated_at)
  VALUES (bucket_lat, bucket_lon, NEW.vehicle_id, new_count, COALESCE(new_score, 0.5), NOW())
  ON CONFLICT (lat_bucket, lon_bucket, vehicle_id)
  DO UPDATE SET report_count = EXCLUDED.report_count,
                score        = EXCLUDED.score,
                updated_at   = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_refresh_community_score ON turn_reports;
CREATE TRIGGER trg_refresh_community_score
  AFTER INSERT ON turn_reports
  FOR EACH ROW EXECUTE FUNCTION refresh_community_score();

-- ─── Driver Sessions ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS driver_sessions (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  driver_id   UUID NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
  token_hash  TEXT NOT NULL UNIQUE,
  device_info TEXT,
  expires_at  TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS driver_sessions_driver_id_idx ON driver_sessions(driver_id);
CREATE INDEX IF NOT EXISTS driver_sessions_expires_idx ON driver_sessions(expires_at);

-- ─── Seed: create first admin driver (change password after first login!) ────────────
-- Password: 'ChangeMe123!' (bcrypt hash below, cost 12)
-- Run: UPDATE drivers SET password_hash = '<your_hash>' WHERE email = 'admin@mjmaps.app';
-- Or use the /api/auth/login endpoint and then a future /api/admin/reset-password route.
INSERT INTO drivers (name, email, password_hash, role, vehicle_id)
VALUES (
  'Admin',
  'admin@mjmaps.app',
  '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBPj/RK.s5uOeK', -- ChangeMe123!
  'admin',
  'swb_van'
) ON CONFLICT (email) DO NOTHING;
