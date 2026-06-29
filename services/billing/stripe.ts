/**
 * Billing — Stripe integration
 * Handles subscription creation, webhook processing, and entitlement checks.
 */

import Stripe from 'stripe';

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY ?? '';
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET ?? '';

if (process.env.NODE_ENV === 'production' && !STRIPE_SECRET_KEY) {
  console.warn('[billing] STRIPE_SECRET_KEY not set — billing endpoints will return 503');
}

export const stripe = STRIPE_SECRET_KEY
  ? new Stripe(STRIPE_SECRET_KEY, { apiVersion: '2024-04-10' as any })
  : null;

export type SubscriptionTier = 'free' | 'courier' | 'fleet' | 'enterprise';

export interface SubscriptionStatus {
  tier: SubscriptionTier;
  active: boolean;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
}

/** Create a Stripe Checkout session for a new subscription */
export async function createCheckoutSession(params: {
  driverId: string;
  email: string;
  priceId: string;
  successUrl: string;
  cancelUrl: string;
}): Promise<{ url: string }> {
  if (!stripe) throw new Error('Stripe not configured.');

  const session = await stripe.checkout.sessions.create({
    customer_email: params.email,
    mode: 'subscription',
    line_items: [{ price: params.priceId, quantity: 1 }],
    success_url: params.successUrl,
    cancel_url: params.cancelUrl,
    metadata: { driverId: params.driverId },
    subscription_data: { trial_period_days: 14 },
  });

  return { url: session.url! };
}

/** Validate and parse a Stripe webhook event */
export function constructWebhookEvent(
  rawBody: Buffer | string,
  signature: string,
): Stripe.Event {
  if (!stripe) throw new Error('Stripe not configured.');
  return stripe.webhooks.constructEvent(rawBody, signature, STRIPE_WEBHOOK_SECRET);
}

/** Get subscription status for a Stripe customer */
export async function getSubscriptionStatus(
  stripeCustomerId: string,
): Promise<SubscriptionStatus> {
  if (!stripe) return { tier: 'free', active: false, currentPeriodEnd: null, cancelAtPeriodEnd: false };

  const subscriptions = await stripe.subscriptions.list({
    customer: stripeCustomerId,
    status: 'active',
    limit: 1,
  });

  const sub = subscriptions.data[0];
  if (!sub) return { tier: 'free', active: false, currentPeriodEnd: null, cancelAtPeriodEnd: false };

  const tierMap: Record<string, SubscriptionTier> = {
    'price_courier': 'courier',
    'price_fleet': 'fleet',
    'price_enterprise': 'enterprise',
  };

  const priceId = sub.items.data[0]?.price.id ?? '';
  const tier = tierMap[priceId] ?? 'courier';

  return {
    tier,
    active: sub.status === 'active',
    currentPeriodEnd: new Date((sub as any).current_period_end * 1000),
    cancelAtPeriodEnd: sub.cancel_at_period_end,
  };
}
