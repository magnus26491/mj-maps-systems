-- 011_pod_uploads_nullable.sql
-- Allow uploaded_by_user_id to be NULL so accounts can be deleted.
-- Records are retained for legal compliance but anonymised on deletion.
-- Idempotent: safe to re-run on any existing DB.


BEGIN;

ALTER TABLE pod_uploads
  ALTER COLUMN uploaded_by_user_id DROP NOT NULL;

COMMIT;