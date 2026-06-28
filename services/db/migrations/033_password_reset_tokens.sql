-- Migration: 033_password_reset_tokens.sql
-- Production-grade password reset tokens for 50,000+ users.
-- Tokens are never stored in plaintext — only SHA-256 hashes.
-- Full audit trail: used_at records consumption, rows are never deleted.
-- Multiple pending tokens allowed — only the latest is valid (app logic).
-- Expired/used tokens are ignored by the lookup query, not deleted.
-- Hard-delete of used+expired tokens runs every 24h (server.ts cleanup job).

-- Drop the temp table if it was already partially created by the broken migration
DROP TABLE IF EXISTS password_reset_tokens;

CREATE TABLE password_reset_tokens (
  id          BIGSERIAL    PRIMARY KEY,
  user_id     UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  TEXT         NOT NULL UNIQUE,
  expires_at  TIMESTAMPTZ  NOT NULL,
  used_at     TIMESTAMPTZ  DEFAULT NULL,
  ip_address  TEXT         DEFAULT NULL,
  user_agent  TEXT         DEFAULT NULL,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Lookup by token hash (the primary query path)
CREATE INDEX idx_prt_token_hash ON password_reset_tokens (token_hash);

-- Find all tokens for a user (invalidation, history)
CREATE INDEX idx_prt_user_id    ON password_reset_tokens (user_id);

-- Cleanup job: find expired/used tokens
CREATE INDEX idx_prt_expires_at ON password_reset_tokens (expires_at);
CREATE INDEX idx_prt_used_at    ON password_reset_tokens (used_at) WHERE used_at IS NOT NULL;
