-- 029_feature_flags.sql
-- Global feature flags for runtime toggles (A/B tests, early access, kill switches).
-- All changes are audited via admin_audit_logs.
-- Values are always boolean or JSON — never mixed types per key.

BEGIN;

CREATE TABLE IF NOT EXISTS feature_flags (
  key           TEXT PRIMARY KEY,                            -- e.g. 'dark_mode', 'new_optimizer'
  value         JSONB NOT NULL,                             -- boolean or object
  description   TEXT NOT NULL,                             -- human-readable description
  updated_by    UUID REFERENCES users(id),                  -- last admin who changed it
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Enforce value type: either a raw boolean or an object with a 'value' boolean field
  CONSTRAINT valid_flag_value CHECK (
    (jsonb_typeof(value) = 'boolean')
    OR
    (jsonb_typeof(value) = 'object' AND value ? 'value' AND jsonb_typeof(value->'value') = 'boolean')
  )
);

-- Index on keys (fast lookup)
CREATE INDEX IF NOT EXISTS idx_feature_flags_key ON feature_flags(key);

-- Seed with sensible defaults (match existing package/plans feature matrix)
INSERT INTO feature_flags (key, value, description) VALUES
  ('navigation_app_public',    '{"value": true}'::jsonb,  'Driver app publicly accessible for sign-up'),
  ('pro_trial_enabled',       '{"value": true}'::jsonb,  '14-day free trial available on Pro plan'),
  ('pod_capture_enabled',     '{"value": true}'::jsonb,  'Proof-of-delivery photo capture feature'),
  ('route_optimizer_v2',      '{"value": false}'::jsonb, 'Use next-gen route optimizer (coming soon)'),
  ('voice_navigation',        '{"value": true}'::jsonb,  'Turn-by-turn voice guidance in driver app'),
  ('live_fleet_tracking',     '{"value": true}'::jsonb,  'Real-time fleet location SSE stream'),
  ('analytics_panel',         '{"value": true}'::jsonb,  'Dispatcher analytics dashboard panel'),
  ('impersonation_enabled',   '{"value": true}'::jsonb,  'Allow admins to impersonate users (security-sensitive)'),
  ('refund_allowed',          '{"value": false}'::jsonb, 'Allow manual refunds via admin portal (restricted)')
ON CONFLICT (key) DO NOTHING;

COMMIT;
