-- Phase 18: Driver Management
-- Add online/offline tracking to drivers
ALTER TABLE drivers
  ADD COLUMN IF NOT EXISTS is_active     BOOLEAN     NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_drivers_is_active
  ON drivers (is_active)
  WHERE is_active = TRUE;