-- Migration 036: VIP invite system
--
-- Allows admin to grant full pro access to users via email invite link.
-- No credit card required. Access is revocable by admin at any time.
--
-- Valid plan_status values (stored as TEXT, no CHECK constraint):
--   'active' | 'free' | 'vip' | 'enterprise_active' | 'trial'
-- plan_status='vip' grants the same features as 'custom' plan (no expiry,
-- no auto-renew, revocable by admin at any time).

CREATE TABLE IF NOT EXISTS vip_invites (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  email         TEXT        NOT NULL,
  token_hash    TEXT        NOT NULL UNIQUE,  -- SHA-256 of raw invite token
  invited_by    UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user_id       UUID        REFERENCES users(id) ON DELETE SET NULL,  -- set on redemption
  status        TEXT        NOT NULL DEFAULT 'pending'
                            CHECK (status IN ('pending', 'accepted', 'revoked')),
  note          TEXT,                         -- optional admin note (e.g. "fleet driver")
  sent_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resent_at     TIMESTAMPTZ,
  accepted_at   TIMESTAMPTZ,
  revoked_at    TIMESTAMPTZ,
  revoked_by    UUID        REFERENCES users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vip_invites_email       ON vip_invites(email);
CREATE INDEX IF NOT EXISTS idx_vip_invites_token_hash  ON vip_invites(token_hash);
CREATE INDEX IF NOT EXISTS idx_vip_invites_status      ON vip_invites(status);
CREATE INDEX IF NOT EXISTS idx_vip_invites_invited_by  ON vip_invites(invited_by);