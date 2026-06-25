-- Migration 026: store route polyline on the routes table
-- Used by the OFF_ROUTE detection in services/api/routes/location.ts
-- to check if a driver has deviated >250m from their planned path.
-- Populated when a route is optimised (as polyline_json TEXT).

ALTER TABLE routes
  ADD COLUMN IF NOT EXISTS polyline_json TEXT;

-- Index on active routes by driver for fast lookup during location pings
CREATE INDEX IF NOT EXISTS idx_routes_driver_active
  ON routes (driver_id, status)
  WHERE status = 'active';
