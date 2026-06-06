# MJ Maps — Stripe Billing Integration

## Plans

| Plan | Price | Vehicles | Key Feature |
|---|---|---|---|
| Individual Monthly | £9.99/mo | 1 | All routing engines |
| Individual Annual | £99/yr | 1 | 2 months free |
| Fleet Monthly | £19.99/mo/seat | Up to 25 | Dispatcher console + fleet solver |
| Fleet Annual | £199/yr/seat | Up to 25 | 2 months free |
| Enterprise | £99/yr/seat | Unlimited | White-label, SLA, SSO |

## Environment Variables Required

```env
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_INDIVIDUAL_MONTHLY=price_...
STRIPE_PRICE_INDIVIDUAL_ANNUAL=price_...
STRIPE_PRICE_FLEET_MONTHLY=price_...
STRIPE_PRICE_FLEET_ANNUAL=price_...
STRIPE_PRICE_ENTERPRISE=price_...
```

## Webhook Endpoint

Register `POST /api/webhooks/stripe` in your Stripe dashboard.

Events handled:
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.payment_succeeded`
- `invoice.payment_failed`

## Renewal Warnings (Anti-Delm8 Feature)

The `getRenewalWarnings()` function should be called daily by a cron job.
Send push notifications + email at:
- **7 days before renewal** — "Your subscription renews in 7 days for £X"
- **3 days before renewal** — "Last chance to cancel before renewal"
- **24 hours before renewal** — Final reminder

This directly addresses Delm8's #1 Trustpilot complaint: surprise auto-renewals with no warning and refused refunds.

## Customer Portal

Drivers can self-serve:
- Cancel subscription (takes effect at period end, not immediately)
- Switch plans (Individual ↔ Fleet)
- Update payment method
- Download invoices
- View billing history

No support ticket needed. No hostile cancellation flows.
