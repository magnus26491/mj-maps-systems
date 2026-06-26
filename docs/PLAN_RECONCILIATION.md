# Plan Reconciliation

Resolved conflicts between four data sources:

| Source | Authority on |
|--------|-------------|
| `packages/plan-features/index.ts` | **Which features belong to which plan** |
| `docs/SUBSCRIPTION_TIERS.md` | **Prices (GBP/EUR/USD, monthly/yearly)** |
| `docs/PRODUCT_VISION.md` | Original vision, treated as aspirational |
| Previous landing page (`apps/landing/index.html`) | Not authoritative — UI only |

---

## Resolved conflicts

### Pricing
- Previous landing used £9.99 (rounded). Authoritative value from SUBSCRIPTION_TIERS.md: **£9.97/mo, £97/yr**.
- EUR/USD from SUBSCRIPTION_TIERS.md: €11.97/mo, €116/yr | $13.47/mo, $130/yr.

### DISPATCHER feature placement
**Decision:** DISPATCHER is **Enterprise-only** (`custom` plan).

Reason: `packages/plan-features/index.ts` does not include DISPATCHER in the `navigation` set. This is the authoritative feature→plan mapping. `SUBSCRIPTION_TIERS.md` lists "Dispatcher dashboard" under Pro in prose, but the code-level plan-features is ground truth for what the API actually gates. The landing page reflects the code behaviour.

> TODO(confirm): Should DISPATCHER be moved into the Pro (`navigation`) plan? If yes, add it to `packages/plan-features/index.ts` and update `packages/plans/index.ts` accordingly.

### Free tier
**Decision:** No free tier exists in production. There is no DB record with `plan_id = 'free'`.

`PRODUCT_VISION.md` described a "Free" tier (15 stops/day). This was never implemented in the subscription or auth systems. The landing page does not advertise a free tier. Instead, the Driver Pro plan CTA reads "Start free trial" (which maps to the standard onboarding registration flow with plan preselected; the trial length is TODO).

> TODO(confirm): Should a free trial period exist for Driver Pro? If yes, define trial duration (e.g., 14 days) and implement `trial_ends_at` on the users table. The landing page CTA can then read "Try free for 14 days".

---

## Safe defaults used (renders without TODO resolution)
- DISPATCHER shown only in Enterprise column on the pricing page.
- Driver Pro CTA: "Start free trial" → `/register?plan=navigation`
- Enterprise CTA: "Talk to us" → `mailto:hello@mjmaps.app`
- No "Free" plan row on the pricing page.
