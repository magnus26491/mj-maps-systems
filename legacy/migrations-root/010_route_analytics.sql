-- Phase 16: Route Analytics
-- Add summary columns written when a route is marked complete
ALTER TABLE routes
  ADD COLUMN IF NOT EXISTS finished_at          TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS actual_distance_km   NUMERIC(8,2),
  ADD COLUMN IF NOT EXISTS on_time              BOOLEAN;

-- Index for analytics queries (date range on completed routes)
CREATE INDEX IF NOT EXISTS idx_routes_finished_at
  ON routes (finished_at DESC)
  WHERE finished_at IS NOT NULL;