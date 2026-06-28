-- Migration: 033_password_reset_tokens.sql
-- Creates the password_reset_tokens table for secure password reset flow.
-- Single-use tokens with 1-hour expiry, one active token per user (upsert).
-- NOTE: references users(id) — 'drivers' is a view, not a base table.
-- NOTE: partial index with NOW() is not allowed (non-immutable); using plain unique index instead.

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id          BIGSERIAL PRIMARY KEY,
  driver_id   UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token       TEXT        NOT NULL UNIQUE,
  expires_at  TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One token per user (plain unique — expired tokens must be deleted before issuing a new one)
CREATE UNIQUE INDEX IF NOT EXISTS idx_password_reset_tokens_driver_id
  ON password_reset_tokens (driver_id);

-- Token lookup by token value
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_token
  ON password_reset_tokens (token);

-- Expiry cleanup (run periodically or before issuing a new token):
-- DELETE FROM password_reset_tokens WHERE expires_at < NOW();
