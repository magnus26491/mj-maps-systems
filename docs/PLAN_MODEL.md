# Plan Data Model — Canonical Specification
**Last updated:** Phase 10  
**Authority:** `packages/plans/index.ts`  
**Applies to:** All code paths that read or write plan state

---

## Problem

The `users` table historically accumulated three overlapping plan columns:

| Column | Values | Origin |
|---|---|---|
| `subscription_tier` | `'pro'`, `'enterprise'`, `NULL` | Pre-2025 billing system |
| `plan_id` | `'navigation'`, `'custom'`, `NULL` | Current billing |
| `plan` | `'free'`, `'pro'`, `'enterprise'`, `NULL` | Another variant |

This created ambiguity about which column to trust for feature-gate decisions.

---

## Canonical Model

Migration `031_canonical_plan_status` (idempotent) establishes these as the **only authoritative fields**:

### `plan_id` — Plan Tier

```sql
plan_id TEXT NOT NULL DEFAULT 'navigation'
  CHECK (plan_id IN ('navigation', 'custom'))
```

| `plan_id` | Maps from | Feature set |
|---|---|---|
| `'navigation'` | `subscription_tier='pro'`, `plan='pro'`, `plan='starter'` | `NAVIGATION` features |
| `'custom'` | `subscription_tier='enterprise'`, `plan='enterprise'`, `plan='custom'` | All features |

### `plan_status` — Subscription Lifecycle

```sql
plan_status TEXT NOT NULL DEFAULT 'free'
  CHECK (plan_status IN ('trialing', 'active', 'past_due', 'canceled', 'free'))
```

| Status | Meaning | Derived from |
|---|---|---|
| `'free'` | No active or trial subscription | Default |
| `'trialing'` | 14-day trial active | `trial_ends_at > NOW()` |
| `'active'` | Paid subscription, not expired | `plan_expires_at > NOW()` |
| `'past_due'` | Trial ended without conversion | `trial_ends_at < NOW()` AND `plan_expires_at < NOW()` |
| `'canceled'` | Was active, now expired | `plan_expires_at < NOW()` (past) |

### Supplementary dates

| Column | Type | Meaning |
|---|---|---|
| `trial_ends_at` | `TIMESTAMPTZ` | When the free trial expires |
| `plan_expires_at` | `TIMESTAMPTZ` | When the paid subscription expires |

---

## Backfill Mapping

Applied by `031_canonical_plan_status.sql` in priority order:

```sql
-- 1. subscription_tier takes priority
UPDATE users SET plan_id = 'custom'
  WHERE subscription_tier = 'enterprise';

UPDATE users SET plan_id = 'navigation'
  WHERE subscription_tier IN ('pro', 'starter')
    AND plan_id = 'navigation';  -- only default rows

-- 2. plan column where subscription_tier is null
UPDATE users SET plan_id = 'custom'
  WHERE plan_id = 'navigation'
    AND plan IN ('enterprise', 'custom');

UPDATE users SET plan_id = 'navigation'
  WHERE plan_id = 'navigation'
    AND plan IN ('pro', 'starter');
```

**Ambiguous records** (both `subscription_tier` AND `plan` set but disagreeing) are flagged as `RAISE WARNING` during migration and require human review. No data is guessed.

---

## Feature Gates

All `requireFeature()` calls and `hasFeature()` lookups now use **`plan_id`** only:

```typescript
// packages/billing/subscription-guard.ts
export function hasFeature(planId: PlanId, feature: FeatureKey): boolean {
  const features = PLAN_FEATURES[planId];  // 'navigation' | 'custom'
  return features.includes(feature);
}
```

The `plan_status` field drives UI state (trial banner, upgrade prompts, expired state) — **not** feature gates.

---

## Legacy Columns

`subscription_tier`, `plan`, and `stripe_sub_id` are **kept readable** during the transition period for backward compatibility with any reporting queries. They are **never written by new code paths**.

- `subscription_tier` — READ ONLY, may contain stale data
- `plan` — READ ONLY, may contain stale data  
- `stripe_sub_id` — READ ONLY, do not use for new logic

If you need current plan state, query `plan_id + plan_status + trial_ends_at + plan_expires_at`.

---

## Admin Portal Reads

The admin portal `/admin/users/:id` and `/admin/subscriptions` endpoints return:

```typescript
interface UserPlanState {
  planId:      'navigation' | 'custom';
  planStatus:  'free' | 'trialing' | 'active' | 'past_due' | 'canceled';
  trialEndsAt: string | null;   // ISO timestamp
  expiresAt:   string | null;   // ISO timestamp
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
}
```

---

## Migration Safety

`031_canonical_plan_status.sql` is **idempotent**:
- `IF NOT EXISTS` on all `ALTER TABLE ADD COLUMN`
- `DO $$ BEGIN ... EXCEPTION WHEN duplicate_object THEN NULL; END $$` on constraints
- `VALIDATE CONSTRAINT` only after backfill completes

Run it as many times as needed — the result is always the same.

---

## Adding New Plan IDs

To add a new plan (e.g. `'starter'` for a free tier):

1. Add `'starter'` to `PlanId` in `packages/plans/index.ts`
2. Add `PLAN_FEATURES['starter'] = [...]` entry
3. Add `'starter'` to the `CHECK` constraint in migration `031`
4. Add mapping in the backfill logic
5. Update `hasFeature()` — starter typically has subset of navigation features

Do NOT create new columns in the users table for plan variants. Extend `plan_id` or add a `plan_variant` column if needed.