-- 009_fcm_tokens.sql
-- FCM device tokens and push audit trail.


-- Driver / dispatcher FCM token (set when app registers at login)
ALTER TABLE drivers
  ADD COLUMN IF NOT EXISTS fcm_token TEXT;


-- Customer tracking token (set when customer opens tracking link in browser/app)
-- Stored per-stop because each delivery may have a different customer device
ALTER TABLE stops
  ADD COLUMN IF NOT EXISTS fcm_customer_token       TEXT,
  ADD COLUMN IF NOT EXISTS fcm_notified_delivered  BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS fcm_notified_failed      BOOLEAN NOT NULL DEFAULT FALSE;


-- Dispatcher FCM token — stored in a separate 1-row config table per organisation.
-- For now, a single dispatcher token is sufficient (multi-dispatcher = future work).
CREATE TABLE IF NOT EXISTS dispatcher_config (
  id         SERIAL PRIMARY KEY,
  fcm_token  TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- Audit trail mirrors eta_notification_audit pattern
CREATE TABLE IF NOT EXISTS fcm_notification_audit (
  id                 BIGSERIAL PRIMARY KEY,
  stop_id            TEXT,
  driver_id          TEXT,
  target_type        TEXT NOT NULL CHECK (target_type IN ('customer','dispatcher','driver')),
  notification_type  TEXT NOT NULL,
  fcm_message_id     TEXT,
  status             TEXT NOT NULL CHECK (status IN ('sent','failed','skipped')),
  error_message      TEXT,
  sent_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


CREATE INDEX IF NOT EXISTS idx_fcm_audit_stop     ON fcm_notification_audit(stop_id);
CREATE INDEX IF NOT EXISTS idx_fcm_audit_driver ON fcm_notification_audit(driver_id);
CREATE INDEX IF NOT EXISTS idx_fcm_audit_sent_at ON fcm_notification_audit(sent_at DESC);