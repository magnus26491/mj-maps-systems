-- Migration 027: Delivery difficulty reports — driver community consensus
--
-- Drivers can report difficulty categories after a delivery.
-- Once 2+ drivers report the same category at the same address, it becomes
-- part of the consensus note shown to future drivers via ApproachBrief.

CREATE TABLE IF NOT EXISTS delivery_difficulty_reports (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  stop_id       UUID        REFERENCES stops(id) ON DELETE SET NULL,
  address_hash  TEXT        NOT NULL,   -- normalised(address) — links reports across routes
  driver_id     UUID        REFERENCES users(id) ON DELETE SET NULL,
  categories    TEXT[]      NOT NULL DEFAULT '{}',
  note          TEXT,                   -- optional free-text (max 120 chars, enforced in API)
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_difficulty_address ON delivery_difficulty_reports(address_hash);
CREATE INDEX IF NOT EXISTS idx_difficulty_driver  ON delivery_difficulty_reports(driver_id);
CREATE INDEX IF NOT EXISTS idx_difficulty_created ON delivery_difficulty_reports(created_at DESC);

-- Consensus view: top categories per address with ≥2 independent drivers reporting
-- Used to synthesise access_notes text shown in ApproachBrief.
CREATE OR REPLACE VIEW delivery_difficulty_consensus AS
SELECT
  address_hash,
  category,
  COUNT(DISTINCT driver_id)  AS driver_count,
  COUNT(*)                   AS report_count,
  MAX(created_at)            AS last_reported_at
FROM delivery_difficulty_reports,
     UNNEST(categories) AS category
GROUP BY address_hash, category
HAVING COUNT(DISTINCT driver_id) >= 2
ORDER BY address_hash, driver_count DESC, report_count DESC;
