-- 012_drivers_billing_and_vehicle_specs.sql
-- Driver plan & billing fields + vehicle_specs table with UK van fleet seed data.
-- Idempotent: safe to re-run on any existing DB.


BEGIN;

-- ── Driver plan & billing ───────────────────────────────────────────────────
ALTER TABLE drivers
  ADD COLUMN IF NOT EXISTS plan             TEXT NOT NULL DEFAULT 'free',
  ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS stripe_sub_id    TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS plan_expires_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS trial_ends_at    TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_drivers_stripe_customer
  ON drivers(stripe_customer_id);
CREATE INDEX IF NOT EXISTS idx_drivers_plan
  ON drivers(plan);

-- ── Vehicle specs table ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS vehicle_specs (
  id          TEXT PRIMARY KEY,
  make        TEXT NOT NULL,
  model       TEXT NOT NULL,
  year        INTEGER NOT NULL,
  height_m    NUMERIC NOT NULL,
  length_m    NUMERIC NOT NULL,
  width_m     NUMERIC NOT NULL,
  gvw_kg      INTEGER NOT NULL,
  payload_kg  INTEGER NOT NULL,
  hazmat      BOOLEAN NOT NULL DEFAULT FALSE,
  profile_key TEXT NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Seed common UK delivery vehicles ─────────────────────────────────────────
INSERT INTO vehicle_specs
  (id, make, model, year, height_m, length_m, width_m, gvw_kg, payload_kg, hazmat, profile_key)
VALUES
  ('vs-transit-lwb',    'Ford',      'Transit LWB',       2023, 2.77, 5.98, 2.05, 3500, 1400, FALSE, 'TRANSIT_LWB_GB'),
  ('vs-transit-mwb',    'Ford',      'Transit MWB',       2023, 2.77, 5.45, 2.05, 3500, 1356, FALSE, 'TRANSIT_MWB_GB'),
  ('vs-transit-swb',    'Ford',      'Transit SWB',       2023, 2.77, 4.97, 2.05, 3500, 1235, FALSE, 'TRANSIT_SWB_GB'),
  ('vs-sprinter-lwb',   'Mercedes',  'Sprinter LWB',      2023, 2.80, 6.95, 2.07, 3500, 1387, FALSE, 'SPRINTER_LWB_GB'),
  ('vs-sprinter-mwb',   'Mercedes',  'Sprinter MWB',      2023, 2.80, 6.21, 2.07, 3500, 1350, FALSE, 'SPRINTER_MWB_GB'),
  ('vs-transit-custom', 'Ford',      'Transit Custom',    2023, 1.96, 4.97, 1.97, 2800,  900, FALSE, 'TRANSIT_CUSTOM_GB'),
  ('vs-vito',           'Mercedes',  'Vito',              2023, 1.90, 4.90, 1.93, 2800,  878, FALSE, 'VITO_GB'),
  ('vs-trafic',         'Renault',   'Trafic LWB',        2023, 1.99, 5.40, 1.96, 3000, 1050, FALSE, 'TRAFIC_LWB_GB'),
  ('vs-vivaro',         'Vauxhall',  'Vivaro LWB',        2023, 1.99, 5.30, 1.96, 3000, 1030, FALSE, 'VIVARO_LWB_GB'),
  ('vs-ducato-lwb',     'Fiat',      'Ducato LWB',        2023, 2.76, 6.36, 2.05, 3500, 1410, FALSE, 'DUCATO_LWB_GB'),
  ('vs-relay-lwb',      'Citroën',   'Relay LWB',         2023, 2.76, 6.36, 2.05, 3500, 1402, FALSE, 'RELAY_LWB_GB'),
  ('vs-e-transit',      'Ford',      'E-Transit LWB',     2023, 2.77, 5.98, 2.05, 4250, 1016, FALSE, 'E_TRANSIT_LWB_GB'),
  ('vs-e-sprinter',     'Mercedes',  'eSprinter LWB',     2023, 2.80, 6.95, 2.07, 4150,  903, FALSE, 'E_SPRINTER_LWB_GB')
ON CONFLICT (id) DO NOTHING;

COMMIT;