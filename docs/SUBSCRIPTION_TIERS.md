# MJ Maps — Subscription Tiers

## The Delm8 Problem We Solved

Delm8 charges **individual drivers** £40/year with:
- Silent auto-renew
- No grace period on cancellation
- No refund on same-day cancel
- **10-stop limit on the basic plan** — drivers had to delete stops to fit
- Zero multi-driver or team features at any price point

MJ Maps inverts this entirely.

---

## Tier Comparison

| | Free | Solo | Business | Enterprise |
|---|---|---|---|---|
| **Price** | £0 | £4.99/mo or £39.99/yr | £19.99/mo or £179.99/yr | Custom |
| **Who pays** | Driver | Driver | Business owner | Business owner |
| **Drivers see billing** | Never | Own plan only | Never | Never |
| **Stops per shift** | **15** | **Unlimited** | **Unlimited** | **Unlimited** |
| **Turn warnings** | ✅ | ✅ | ✅ | ✅ |
| **Vehicle profiles** | ✅ | ✅ | ✅ | ✅ |
| **Access notes** | ✅ | ✅ | ✅ | ✅ |
| **Offline mode** | ❌ | ✅ | ✅ | ✅ |
| **POD photo** | ❌ | ✅ | ✅ | ✅ |
| **POD signature** | ❌ | ✅ | ✅ | ✅ |
| **Route optimisation** | ❌ | ✅ | ✅ | ✅ |
| **Dispatcher dashboard** | ❌ | ❌ | ✅ | ✅ |
| **Multi-driver** | ❌ | ❌ | ✅ | ✅ |
| **Analytics** | ❌ | ❌ | ✅ | ✅ |
| **API access** | ❌ | ❌ | ❌ | ✅ |
| **White-label** | ❌ | ❌ | ❌ | ✅ |

---

## Key Design Decisions

### 1. Free tier has 15 stops (not 10)
Delm8's basic plan was 10 stops — so frustrating it was the #1 complaint.
Our free tier gives 15, which covers most local courier and small van shifts.
The upgrade prompt is triggered only when they actually hit the limit.

### 2. Solo replaces delm8 entirely for less money
£4.99/month vs delm8's £40/year (£3.33/month) — but Solo includes:
- Unlimited stops (delm8 charges more for this)
- Offline mode (delm8 has none at any price)
- POD capture (delm8 has none at any price)
- Route optimisation

### 3. Business — drivers are free
A business owner pays £19.99/month. Every driver they add costs nothing.
Drivers never see a billing screen, subscription prompt, or paywall.
This is the structural reason delm8 reviews are angry — their model
charges the wrong person.

### 4. Yearly discount is transparent
Solo: £4.99 × 12 = £59.88 vs £39.99/yr — 33% saving, clearly shown.
No hidden auto-renew. Cancellation effective immediately with no charge
for the current month (monthly) or remaining months credited (annual).

### 5. No stop deletion ever
Free users who reach 15 stops see an upgrade prompt — they do NOT have
to delete existing stops to add new ones. The shift is locked at current
stops until they upgrade. Their existing stops remain intact.

---

## Upgrade Flow (No Dark Patterns)

```
Driver adds stop 16 (Free plan)
         │
         ▼
  PlanGateModal appears:
  "You've reached 15 stops on your Free plan.
   Upgrade to Solo for unlimited stops — £4.99/month."
         │
    ┌────┴────┐
    │Upgrade  │──→ Stripe Checkout (in-app WebView)
    └─────────┘
    │Not now  │──→ Dismiss, existing 15 stops untouched
    └─────────┘
```

No existing data is ever deleted as a result of a plan limit.
