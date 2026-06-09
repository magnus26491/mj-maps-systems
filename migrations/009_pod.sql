-- Phase 15: Proof of Delivery (POD) Capture
-- Adds POD photo storage columns to the stops table

ALTER TABLE stops
  ADD COLUMN IF NOT EXISTS pod_url         TEXT,
  ADD COLUMN IF NOT EXISTS pod_type       TEXT CHECK (pod_type IN ('photo','signature')),
  ADD COLUMN IF NOT EXISTS pod_captured_at TIMESTAMPTZ;