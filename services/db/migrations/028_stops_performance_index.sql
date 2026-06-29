-- Composite index for the most frequent query pattern: stops by route_id + status
-- Used by the WebSocket APPROACH_BRIEF query and dispatcher route detail endpoint.
-- Without this, every location ping triggers a seq-scan on a growing stops table.
CREATE INDEX IF NOT EXISTS idx_stops_route_status_seq
  ON stops (route_id, status, sequence_number);

-- Index for driver_locations time-series queries (dispatcher live map, off-route detection)
CREATE INDEX IF NOT EXISTS idx_driver_locations_driver_recorded
  ON driver_locations (driver_id, recorded_at DESC);

-- Partial index: active routes by driver (used by off-route detection and today-route endpoint)
CREATE INDEX IF NOT EXISTS idx_routes_driver_active
  ON routes (driver_id, created_at DESC)
  WHERE status = 'active';
