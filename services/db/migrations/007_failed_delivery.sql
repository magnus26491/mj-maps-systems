-- 007_failed_delivery.sql
-- Structured failed delivery columns + audit table.
-- failure_reason TEXT already exists — adding structured code alongside it.


BEGIN;

ALTER TABLE stops
  ADD COLUMN IF NOT EXISTS failure_code     TEXT
    CHECK (failure_code IN (
      'NO_ANSWER','REFUSED','ACCESS_DENIED','WRONG_ADDRESS',
      'DAMAGED','TOO_LARGE','SAFE_PLACE','NEIGHBOUR','LOCKER','CARDED'
    )),
  ADD COLUMN IF NOT EXISTS attempt_number   INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS reslotted_to_seq INTEGER,
  ADD COLUMN IF NOT EXISTS failed_at        TIMESTAMPTZ;


CREATE TABLE IF NOT EXISTS failed_delivery_audit (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stop_id         UUID NOT NULL REFERENCES stops(id) ON DELETE CASCADE,
  route_id        UUID NOT NULL,
  driver_id       UUID REFERENCES users(id) ON DELETE SET NULL,
  failure_code    TEXT NOT NULL,
  failure_reason  TEXT,
  attempt_number  INTEGER NOT NULL DEFAULT 1,
  reslot_action   TEXT NOT NULL CHECK (reslot_action IN ('end_of_route','return_depot','next_day','completed')),
  reslotted_to_seq INTEGER,
  attempt_card_required BOOLEAN NOT NULL DEFAULT FALSE,
  occurred_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


CREATE INDEX IF NOT EXISTS idx_failed_audit_stop_id   ON failed_delivery_audit(stop_id);
CREATE INDEX IF NOT EXISTS idx_failed_audit_route_id  ON failed_delivery_audit(route_id);
CREATE INDEX IF NOT EXISTS idx_failed_audit_occurred   ON failed_delivery_audit(occurred_at);

COMMIT;