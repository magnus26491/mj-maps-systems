-- Migration: 033_password_reset_tokens.sql
-- Creates the password_reset_tokens table for secure password reset flow.
-- Single-use tokens with 1-hour expiry, one active token per user (upsert).
-- NOTE: references users(id) — 'drivers' is a view, not a base table.

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id          BIGSERIAL PRIMARY KEY,
  driver_id   UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token       TEXT        NOT NULL UNIQUE,
  expires_at  TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One active token per user
CREATE UNIQUE INDEX IF NOT EXISTS idx_password_reset_tokens_driver_id
  ON password_reset_tokens (driver_id)
  WHERE expires_at > NOW();

-- Token lookup by token value
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_token
  ON password_reset_tokens (token);

-- Expiry cleanup job can run periodically:
-- DELETE FROM password_reset_tokens WHERE expires_at < NOW();
