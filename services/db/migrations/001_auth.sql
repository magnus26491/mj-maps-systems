-- MJ Maps Systems — Auth Schema Migration
-- Migration: 001_auth
-- Run: psql $POSTGRES_URL -f services/db/migrations/001_auth.sql
--
-- Creates the users table (primary auth identity) and refresh_tokens table
-- (server-side token rotation for long-lived sessions).
-- All existing routes/stops/turn_reports tables are unchanged.

BEGIN;

-- ─── Users ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email            TEXT UNIQUE NOT NULL,
  password_hash    TEXT NOT NULL,
  role             TEXT NOT NULL DEFAULT 'driver',  -- 'driver' | 'dispatcher' | 'admin'
  organisation_id  UUID,
  subscription_tier TEXT NOT NULL DEFAULT 'pro'
    CONSTRAINT valid_tier CHECK (subscription_tier IN ('pro', 'enterprise')),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_login       TIMESTAMPTZ,
  is_active        BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_org ON users(organisation_id);

-- ─── Refresh Tokens ────────────────────────────────────────────────────────────
-- Stores SHA-256 hash of the opaque refresh token, never the raw token.
-- Rotation: on each /refresh call, the old token is revoked and a new pair issued.
-- Cleanup job (external cron or pg_cron) should purge rows where revoked=true
-- or expires_at < NOW() to prevent table bloat.

CREATE TABLE IF NOT EXISTS refresh_tokens (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  TEXT NOT NULL,          -- SHA-256 of the raw refresh token
  expires_at  TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked     BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_hash ON refresh_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_valid
  ON refresh_tokens(user_id)
  WHERE revoked = FALSE;

COMMIT;