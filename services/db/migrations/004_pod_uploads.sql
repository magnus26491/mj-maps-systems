-- 004_pod_uploads.sql
-- Audit table for POD photo uploads.
-- proof_photo_url on stops is the live record; this table is the audit trail.


BEGIN;

CREATE TABLE IF NOT EXISTS pod_uploads (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stop_id              UUID NOT NULL REFERENCES stops(id) ON DELETE CASCADE,
  uploaded_by_user_id  UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  object_key           TEXT NOT NULL,
  photo_url            TEXT NOT NULL,
  uploaded_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pod_uploads_stop_id ON pod_uploads(stop_id);
CREATE INDEX IF NOT EXISTS idx_pod_uploads_user_id ON pod_uploads(uploaded_by_user_id);

COMMIT;
