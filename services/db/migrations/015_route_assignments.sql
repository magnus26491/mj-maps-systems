-- 015_route_assignments.sql
-- Creates route_assignments table used by POST /api/dispatcher/assign.
-- Idempotent.


CREATE TABLE IF NOT EXISTS route_assignments (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  route_id    UUID NOT NULL REFERENCES routes(id) ON DELETE CASCADE,
  driver_id   UUID NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
  assigned_by UUID REFERENCES drivers(id) ON DELETE SET NULL,
  note        TEXT,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


CREATE INDEX IF NOT EXISTS route_assignments_route_id_idx  ON route_assignments(route_id);
CREATE INDEX IF NOT EXISTS route_assignments_driver_id_idx ON route_assignments(driver_id);