-- Migration: 037_fix_password_reset_tokens_used_at.sql
-- The 033 migration includes a `used_at` column in its CREATE TABLE, but the
-- migration runner marked 033 as already applied before that column existed
-- (an earlier broken run created the table without it).
-- This migration adds the column + its partial index idempotently so the
-- cleanup job in server.ts and the auth.ts invalidation query both work.

ALTER TABLE password_reset_tokens
  ADD COLUMN IF NOT EXISTS used_at TIMESTAMPTZ DEFAULT NULL;

ALTER TABLE password_reset_tokens
  ADD COLUMN IF NOT EXISTS ip_address TEXT DEFAULT NULL;

ALTER TABLE password_reset_tokens
  ADD COLUMN IF NOT EXISTS user_agent TEXT DEFAULT NULL;

-- Partial index for the cleanup job (mirrors what 033 intended)
CREATE INDEX IF NOT EXISTS idx_prt_used_at
  ON password_reset_tokens (used_at)
  WHERE used_at IS NOT NULL;
