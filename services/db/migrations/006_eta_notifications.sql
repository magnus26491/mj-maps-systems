-- 006_eta_notifications.sql
-- Customer ETA SMS notifications via Twilio.
-- Triggered when driver is 2 stops away from delivery, or ETA < 15 min.

-- Add notification fields to stops if not present
ALTER TABLE stops
  ADD COLUMN IF NOT EXISTS customer_phone   TEXT,
  ADD COLUMN IF NOT EXISTS customer_name   TEXT,
  ADD COLUMN IF NOT EXISTS customer_email  TEXT,
  ADD COLUMN IF NOT EXISTS notification_sent BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS notification_sent_at TIMESTAMPTZ;

-- Audit trail for all outbound ETA SMS
CREATE TABLE IF NOT EXISTS eta_notifications (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stop_id         UUID NOT NULL REFERENCES stops(id) ON DELETE CASCADE,
  phone           TEXT NOT NULL,
  message         TEXT NOT NULL,
  twilio_sid      TEXT,
  status          TEXT NOT NULL DEFAULT 'queued',
  sent_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  error_message   TEXT
);

CREATE INDEX IF NOT EXISTS idx_eta_notifications_stop_id ON eta_notifications(stop_id);
CREATE INDEX IF NOT EXISTS idx_eta_notifications_status  ON eta_notifications(status) WHERE status = 'queued';
