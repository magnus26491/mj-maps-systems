/**
 * Billing Service
 *
 * Transparent subscription management — the #1 Delm8 complaint is the
 * auto-renewal trap with no warning email and refusal to refund.
 *
 * Our model:
 *  · 7-day renewal warning email + push notification
 *  · 3-day final warning
 *  · Immediate cancellation effective end of period (no partial refund needed)
 *  · Grace period: 48h refund window after accidental renewal
 *  · All events logged for audit trail
 *
 * Integrates with Stripe via webhook events.
 */

export type PlanId = 'free' | 'starter' | 'pro' | 'fleet';

export interface Plan {
  id:            PlanId;
  label:         string;
  priceGBP:      number;    // monthly
  maxStops:      number;    // per shift
  maxVehicles:   number;
  features:      string[];
}

export const PLANS: Record<PlanId, Plan> = {
  free: {
    id: 'free', label: 'Free', priceGBP: 0,
    maxStops: 20, maxVehicles: 1,
    features: ['Basic route optimisation', 'Up to 20 stops', 'SWB Van only'],
  },
  starter: {
    id: 'starter', label: 'Starter', priceGBP: 7.99,
    maxStops: 100, maxVehicles: 1,
    features: ['Anti-backtrack clustering', 'Turn-around alerts', 'All vehicle types', '7-day renewal warning'],
  },
  pro: {
    id: 'pro', label: 'Pro', priceGBP: 14.99,
    maxStops: 999, maxVehicles: 1,
    features: ['Everything in Starter', 'Bridge/weight alerts', 'Live traffic ETAs', 'Road closure rerouting', 'Property-level GPS pins', 'Offline mode'],
  },
  fleet: {
    id: 'fleet', label: 'Fleet', priceGBP: 49.99,
    maxStops: 999, maxVehicles: 50,
    features: ['Everything in Pro', 'Fleet dispatcher console', 'Up to 50 vehicles', 'Driver performance analytics', 'API access', 'Priority support'],
  },
};

export type BillingEventType =
  | 'subscription_created'
  | 'subscription_renewed'
  | 'subscription_cancelled'
  | 'renewal_warning_7d'
  | 'renewal_warning_3d'
  | 'refund_issued'
  | 'payment_failed'
  | 'grace_period_refund';

export interface BillingEvent {
  type:       BillingEventType;
  userId:     string;
  planId:     PlanId;
  amountGBP?: number;
  timestamp:  number;
  meta?:      Record<string, unknown>;
}

/**
 * Calculate days until renewal.
 */
export function daysUntilRenewal(renewalTimestampMs: number): number {
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.max(0, Math.floor((renewalTimestampMs - Date.now()) / msPerDay));
}

/**
 * Determine if a renewal warning should be sent.
 * Returns the warning level or null if no warning needed.
 */
export function getRenewalWarningLevel(
  renewalTimestampMs: number,
): '7d' | '3d' | null {
  const days = daysUntilRenewal(renewalTimestampMs);
  if (days <= 3)  return '3d';
  if (days <= 7)  return '7d';
  return null;
}

/**
 * Check if a refund is still within the 48h grace period after renewal.
 */
export function isWithinGracePeriod(
  renewedAtMs: number,
  gracePeriodMs = 48 * 60 * 60 * 1000,
): boolean {
  return Date.now() - renewedAtMs < gracePeriodMs;
}

/**
 * Format a billing event for audit logging.
 */
export function formatBillingEvent(event: BillingEvent): string {
  const ts = new Date(event.timestamp).toISOString();
  const amount = event.amountGBP !== undefined ? ` £${event.amountGBP.toFixed(2)}` : '';
  return `[${ts}] ${event.type} userId=${event.userId} plan=${event.planId}${amount}`;
}
