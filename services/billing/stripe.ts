/**
 * MJ Maps Systems — Stripe Billing Integration
 *
 * Handles:
 *  - Subscription plans (Individual, Fleet, Enterprise)
 *  - Checkout session creation
 *  - Webhook processing (payment success, cancellation, renewal)
 *  - Customer Portal (self-service cancel/upgrade — eliminates the Delm8 billing complaint)
 *  - VAT-aware pricing via Stripe Tax
 *
 * IMPORTANT: Never expose STRIPE_SECRET_KEY to the client.
 * All Stripe API calls happen server-side only.
 */

import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-04-30.basil',
});

// ─── SUBSCRIPTION PLANS ───────────────────────────────────────────────────

export const PLANS = {
  individual_monthly: {
    id: 'individual_monthly',
    label: 'Individual',
    description: 'Perfect for freelance couriers and single-driver operations',
    priceId: process.env.STRIPE_PRICE_INDIVIDUAL_MONTHLY!,
    amount: 999,        // £9.99/mo
    currency: 'gbp',
    interval: 'month' as const,
    features: [
      'All vehicle profiles (van, LWB, Luton, HGV)',
      'Bridge intelligence engine',
      'Turn-around scoring & alerts',
      'Road closure live rerouting',
      'School zone & traffic avoidance',
      'Walk vs drive cluster engine',
      'LHD/RHD route optimisation',
      'Unlimited stops per route',
      'Offline mode (WASM solver)',
    ],
    vehicleLimit: 1,
    driverLimit: 1,
  },

  individual_annual: {
    id: 'individual_annual',
    label: 'Individual (Annual)',
    description: '2 months free vs monthly',
    priceId: process.env.STRIPE_PRICE_INDIVIDUAL_ANNUAL!,
    amount: 9900,       // £99/yr
    currency: 'gbp',
    interval: 'year' as const,
    features: ['Everything in Individual', '2 months free', 'Priority support'],
    vehicleLimit: 1,
    driverLimit: 1,
  },

  fleet_monthly: {
    id: 'fleet_monthly',
    label: 'Fleet',
    description: 'For operators running 2–25 vehicles',
    priceId: process.env.STRIPE_PRICE_FLEET_MONTHLY!,
    amount: 1999,       // £19.99/mo per vehicle seat
    currency: 'gbp',
    interval: 'month' as const,
    features: [
      'Everything in Individual',
      'Fleet dispatcher console',
      'Multi-driver route assignment',
      'Fleet-wide vehicle height registry',
      'Workload balancing across drivers',
      'Proof-of-delivery dashboard',
      'Team learning (shared stop intelligence)',
      'API access for TMS integration',
    ],
    vehicleLimit: 25,
    driverLimit: 25,
  },

  fleet_annual: {
    id: 'fleet_annual',
    label: 'Fleet (Annual)',
    description: '2 months free, billed per vehicle seat',
    priceId: process.env.STRIPE_PRICE_FLEET_ANNUAL!,
    amount: 19900,      // £199/yr per vehicle seat
    currency: 'gbp',
    interval: 'year' as const,
    features: ['Everything in Fleet monthly', '2 months free', 'Dedicated account manager'],
    vehicleLimit: 25,
    driverLimit: 25,
  },

  enterprise: {
    id: 'enterprise',
    label: 'Enterprise',
    description: 'Unlimited vehicles, white-label option, SLA guarantee',
    priceId: process.env.STRIPE_PRICE_ENTERPRISE!,
    amount: 9900,       // £99/yr per seat (volume discount applied)
    currency: 'gbp',
    interval: 'year' as const,
    features: [
      'Everything in Fleet',
      'Unlimited vehicles & drivers',
      'White-label branding option',
      'OR-Tools fleet solver (500+ stops)',
      '99.9% SLA uptime guarantee',
      'SSO / SAML integration',
      'Custom API rate limits',
      'Dedicated infrastructure',
    ],
    vehicleLimit: Infinity,
    driverLimit: Infinity,
  },
} as const;

export type PlanId = keyof typeof PLANS;

// ─── CHECKOUT SESSION ─────────────────────────────────────────────────────

export async function createCheckoutSession(params: {
  planId: PlanId;
  userId: string;
  userEmail: string;
  quantity?: number;         // for fleet: number of vehicle seats
  successUrl: string;
  cancelUrl: string;
  trialDays?: number;
}): Promise<{ url: string; sessionId: string }> {
  const plan = PLANS[params.planId];
  const quantity = params.quantity ?? 1;

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    payment_method_types: ['card'],
    line_items: [{
      price: plan.priceId,
      quantity,
    }],
    customer_email: params.userEmail,
    client_reference_id: params.userId,
    metadata: {
      userId: params.userId,
      planId: params.planId,
      quantity: String(quantity),
    },
    subscription_data: {
      metadata: { userId: params.userId, planId: params.planId },
      ...(params.trialDays ? { trial_period_days: params.trialDays } : {}),
    },
    // Stripe Tax — automatically calculates and collects VAT for UK + EU
    automatic_tax: { enabled: true },
    tax_id_collection: { enabled: true },
    // Allow promo codes
    allow_promotion_codes: true,
    success_url: params.successUrl,
    cancel_url: params.cancelUrl,
  });

  return { url: session.url!, sessionId: session.id };
}

// ─── CUSTOMER PORTAL (self-service cancel/upgrade) ────────────────────────
// This is the single feature that eliminates the #1 Delm8 complaint:
// drivers can cancel, upgrade, or view billing history themselves
// without contacting support.

export async function createPortalSession(params: {
  stripeCustomerId: string;
  returnUrl: string;
}): Promise<{ url: string }> {
  const session = await stripe.billingPortal.sessions.create({
    customer: params.stripeCustomerId,
    return_url: params.returnUrl,
  });
  return { url: session.url };
}

// ─── WEBHOOK HANDLER ──────────────────────────────────────────────────────

export type SubscriptionStatus =
  | 'active'
  | 'trialing'
  | 'past_due'
  | 'canceled'
  | 'unpaid';

export interface SubscriptionEvent {
  type: 'created' | 'updated' | 'canceled' | 'payment_failed' | 'payment_succeeded';
  userId: string;
  planId: string;
  status: SubscriptionStatus;
  currentPeriodEnd: Date;
  quantity: number;
  stripeCustomerId: string;
  stripeSubscriptionId: string;
}

/**
 * Process a raw Stripe webhook event.
 * Call this from your /api/webhooks/stripe POST endpoint.
 * Always verify the signature before calling this function.
 */
export async function processWebhook(
  rawBody: string | Buffer,
  signature: string,
): Promise<SubscriptionEvent | null> {
  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(
      rawBody,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch (err) {
    throw new Error(`Webhook signature verification failed: ${(err as Error).message}`);
  }

  switch (event.type) {
    case 'customer.subscription.created':
    case 'customer.subscription.updated': {
      const sub = event.data.object as Stripe.Subscription;
      return {
        type: event.type === 'customer.subscription.created' ? 'created' : 'updated',
        userId: sub.metadata.userId,
        planId: sub.metadata.planId,
        status: sub.status as SubscriptionStatus,
        currentPeriodEnd: new Date((sub as any).current_period_end * 1000),
        quantity: sub.items.data[0]?.quantity ?? 1,
        stripeCustomerId: sub.customer as string,
        stripeSubscriptionId: sub.id,
      };
    }

    case 'customer.subscription.deleted': {
      const sub = event.data.object as Stripe.Subscription;
      return {
        type: 'canceled',
        userId: sub.metadata.userId,
        planId: sub.metadata.planId,
        status: 'canceled',
        currentPeriodEnd: new Date((sub as any).current_period_end * 1000),
        quantity: sub.items.data[0]?.quantity ?? 1,
        stripeCustomerId: sub.customer as string,
        stripeSubscriptionId: sub.id,
      };
    }

    case 'invoice.payment_failed': {
      const invoice = event.data.object as Stripe.Invoice;
      const subId = typeof invoice.subscription === 'string'
        ? invoice.subscription
        : invoice.subscription?.id ?? '';
      const sub = await stripe.subscriptions.retrieve(subId);
      return {
        type: 'payment_failed',
        userId: sub.metadata.userId,
        planId: sub.metadata.planId,
        status: 'past_due',
        currentPeriodEnd: new Date((sub as any).current_period_end * 1000),
        quantity: sub.items.data[0]?.quantity ?? 1,
        stripeCustomerId: sub.customer as string,
        stripeSubscriptionId: sub.id,
      };
    }

    case 'invoice.payment_succeeded': {
      const invoice = event.data.object as Stripe.Invoice;
      const subId = typeof invoice.subscription === 'string'
        ? invoice.subscription
        : invoice.subscription?.id ?? '';
      if (!subId) return null;
      const sub = await stripe.subscriptions.retrieve(subId);
      return {
        type: 'payment_succeeded',
        userId: sub.metadata.userId,
        planId: sub.metadata.planId,
        status: 'active',
        currentPeriodEnd: new Date((sub as any).current_period_end * 1000),
        quantity: sub.items.data[0]?.quantity ?? 1,
        stripeCustomerId: sub.customer as string,
        stripeSubscriptionId: sub.id,
      };
    }

    default:
      return null;
  }
}

// ─── RENEWAL WARNING ──────────────────────────────────────────────────────
// Send 7-day and 3-day renewal warnings — directly addresses Delm8's
// biggest reputational complaint (auto-renewal with no warning)

export async function getRenewalWarnings(stripeCustomerId: string): Promise<{
  renewsAt: Date;
  amount: number;
  currency: string;
  daysUntilRenewal: number;
} | null> {
  const subscriptions = await stripe.subscriptions.list({
    customer: stripeCustomerId,
    status: 'active',
    limit: 1,
  });

  const sub = subscriptions.data[0];
  if (!sub) return null;

  const renewsAt = new Date((sub as any).current_period_end * 1000);
  const daysUntilRenewal = Math.ceil(
    (renewsAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
  );
  const upcomingInvoice = await stripe.invoices.retrieveUpcoming({
    customer: stripeCustomerId,
  });

  return {
    renewsAt,
    amount: upcomingInvoice.amount_due,
    currency: upcomingInvoice.currency,
    daysUntilRenewal,
  };
}
