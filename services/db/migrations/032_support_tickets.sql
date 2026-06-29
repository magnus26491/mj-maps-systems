-- 032_support_tickets.sql
-- ───────────────────────────────────────────────────────────────────────────
-- Phase 5: Support ticket system
--
-- Allows drivers and dispatchers to raise tickets, and admins to respond
-- and manage ticket lifecycle from the admin portal.
--
-- Tables:
--   tickets          — the ticket header (user, subject, status, priority)
--   ticket_messages  — threaded replies (user or admin)
--
-- Access:
--   Drivers/Dispatchers: POST /api/v1/support/tickets (own tickets only)
--   Admins:              full CRUD via /api/v1/admin/tickets/*
--
-- No fake/placeholder data — only real tickets raised by real users.
-- ───────────────────────────────────────────────────────────────────────────

BEGIN;

-- ── Tickets table ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tickets (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subject           TEXT NOT NULL,
  body              TEXT NOT NULL,                          -- initial message
  status            TEXT NOT NULL DEFAULT 'open'
                    CHECK (status IN ('open', 'pending', 'closed')),
  priority          TEXT NOT NULL DEFAULT 'normal'
                    CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  assignee_admin_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  closed_at         TIMESTAMPTZ
);

-- Indexes for admin queries
CREATE INDEX IF NOT EXISTS idx_tickets_status     ON tickets (status);
CREATE INDEX IF NOT EXISTS idx_tickets_priority   ON tickets (priority);
CREATE INDEX IF NOT EXISTS idx_tickets_user_id    ON tickets (user_id);
CREATE INDEX IF NOT EXISTS idx_tickets_assignee   ON tickets (assignee_admin_id)
  WHERE assignee_admin_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tickets_created    ON tickets (created_at DESC);

-- ── Ticket messages table ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ticket_messages (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id       UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  author_user_id  UUID REFERENCES users(id) ON DELETE SET NULL,  -- null = system message
  author_is_admin BOOLEAN NOT NULL DEFAULT FALSE,
  body            TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ticket_messages_ticket_id ON ticket_messages (ticket_id);
CREATE INDEX IF NOT EXISTS idx_ticket_messages_created  ON ticket_messages (ticket_id, created_at ASC);

-- ── Auto-update updated_at ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_tickets_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  IF NEW.status = 'closed' AND OLD.status != 'closed' THEN
    NEW.closed_at = NOW();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_tickets_updated_at ON tickets;
CREATE TRIGGER trigger_tickets_updated_at
  BEFORE UPDATE ON tickets
  FOR EACH ROW EXECUTE FUNCTION update_tickets_updated_at();

-- ── Open-ticket count for admin overview (materialised view for performance) ──
-- Lightweight: just count rows — no need for a separate counter table
-- Admin overview query: SELECT COUNT(*) FROM tickets WHERE status = 'open'

COMMIT;

SELECT '032_support_tickets applied' AS migration,
       (SELECT COUNT(*) FROM information_schema.tables WHERE table_name = 'tickets')           AS tickets_exists,
       (SELECT COUNT(*) FROM information_schema.tables WHERE table_name = 'ticket_messages')   AS messages_exists,
       (SELECT COUNT(*) FROM tickets WHERE status = 'open')                                    AS open_tickets,
       (SELECT COUNT(*) FROM tickets WHERE status = 'pending')                                 AS pending_tickets,
       (SELECT COUNT(*) FROM tickets WHERE status = 'closed')                                  AS closed_tickets;