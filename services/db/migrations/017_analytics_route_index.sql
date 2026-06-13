-- 017_analytics_route_index.sql
-- Phase 16: Adds a partial index on finished_at for analytics date-range queries.
-- Columns (finished_at, on_time, actual_distance_km) were added by migration 014.

CREATE INDEX IF NOT EXISTS idx_routes_finished_at
  ON routes (finished_at DESC)
  WHERE finished_at IS NOT NULL;