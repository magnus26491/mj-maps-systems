-- migrations/007_dispatcher_assignments.sql
-- Tracks which driver is assigned to which route by a dispatcher.

CREATE TABLE IF NOT EXISTS route_assignments (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  route_id      UUID NOT NULL REFERENCES routes(id) ON DELETE CASCADE,
  driver_id     UUID NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
  assigned_by   UUID REFERENCES drivers(id),
  assigned_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  note          TEXT,
  status        TEXT NOT NULL DEFAULT 'pending'
);

CREATE INDEX IF NOT EXISTS idx_route_assignments_driver_id ON route_assignments(driver_id);
CREATE INDEX IF NOT EXISTS idx_route_assignments_route_id  ON route_assignments(route_id);