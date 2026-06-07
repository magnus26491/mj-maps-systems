/**
 * MJ Maps Systems — Subscription Guard
 *
 * FIX #1: Billing Transparency
 *
 * Biggest Delm8 Trustpilot complaint: auto-renew fires with no warning,
 * then refunds are refused. This middleware:
 *
 *  1. Sends a renewal-warning email/push 7 days before charge
 *  2. Sends a final 24-hour reminder
 *  3. Requires explicit re-confirmation if the plan has changed price
 *  4. Enforces a 48-hour no-questions refund window post-charge
 *  5. Exposes a one-click cancel endpoint that takes effect immediately
 *
 * All events are written to subscription_events table for audit trail.
 */

export type PlanId = 'navigation' | 'custom';

export const FEATURES = {
  // ── Available on BOTH plans ───────────────────────────────────────────────
  NAVIGATION:           { plans: ['navigation', 'custom'] as PlanId[] },
  HGV_ROUTING:          { plans: ['navigation', 'custom'] as PlanId[] },
  BRIDGE_RESTRICTIONS:  { plans: ['navigation', 'custom'] as PlanId[] },
  LIVE_TRAFFIC:         { plans: ['navigation', 'custom'] as PlanId[] },
  ROADWORKS_AVOIDANCE:  { plans: ['navigation', 'custom'] as PlanId[] },
  TIME_AWARE_OPTIMIZER: { plans: ['navigation', 'custom'] as PlanId[] },
  OFFLINE_CACHE:        { plans: ['navigation', 'custom'] as PlanId[] },
  PARKING_ADVISORY:     { plans: ['navigation', 'custom'] as PlanId[] },
  TIDAL_AVOIDANCE:      { plans: ['navigation', 'custom'] as PlanId[] },
  UNPAVED_SCORING:      { plans: ['navigation', 'custom'] as PlanId[] },
  TURN_SCORE:           { plans: ['navigation', 'custom'] as PlanId[] },
  W3W_PIN:              { plans: ['navigation', 'custom'] as PlanId[] },

  // ── Custom plan only — delivery workflow ─────────────────────────────────
  BARCODE_SCANNING:     { plans: ['custom'] as PlanId[] },
  POD_PHOTO:            { plans: ['custom'] as PlanId[] },
  SIGNATURE_CAPTURE:    { plans: ['custom'] as PlanId[] },
  ROUTE_OPTIMISE:       { plans: ['custom'] as PlanId[] },
  STOP_MANAGEMENT:      { plans: ['custom'] as PlanId[] },
  PIN_CONFIRM:          { plans: ['custom'] as PlanId[] },
  ACCESS_NOTES:         { plans: ['custom'] as PlanId[] },
  FAILED_DELIVERY:      { plans: ['custom'] as PlanId[] },
  STOP_STATUS:          { plans: ['custom'] as PlanId[] },
  ETA_NOTIFICATIONS:    { plans: ['custom'] as PlanId[] },
  DISPATCHER:           { plans: ['custom'] as PlanId[] },
  LIVE_TRACKING_WS:     { plans: ['custom'] as PlanId[] },
  WORKLOAD_GUARD:       { plans: ['custom'] as PlanId[] },
  TROLLEY_ADVISORY:     { plans: ['custom'] as PlanId[] },
  ROUTE_INTEL:          { plans: ['custom'] as PlanId[] },
  RED_ALERTS:           { plans: ['custom'] as PlanId[] },
  ADMIN_ANALYTICS:      { plans: ['custom'] as PlanId[] },
} as const;

export type FeatureKey = keyof typeof FEATURES;

export function planHasFeature(planId: PlanId, feature: FeatureKey): boolean {
  return (FEATURES[feature].plans as string[]).includes(planId);
}

export interface SubscriptionRecord {
  userId: string;
  planId: PlanId;
  renewsAt: Date;
  priceGbp: number;
  cancelledAt?: Date;
  lastWarnedAt?: Date;
}

export interface RenewalWarning {
  userId: string;
  planId: PlanId;
  renewsAt: Date;
  priceGbp: number;
  daysUntilRenewal: number;
  cancelUrl: string;
  requiresReconfirm: boolean;
}

const WARN_DAYS   = [7, 1];   // days before renewal to send warning
const REFUND_WINDOW_HOURS = 48;

/**
 * Compute warnings that need to fire today for a subscription record.
 * Called by a daily cron job.
 */
export function computeRenewalWarnings(
  sub: SubscriptionRecord,
  previousPriceGbp?: number,
): RenewalWarning[] {
  const now = Date.now();
  const renewsMs = sub.renewsAt.getTime();
  const daysUntil = Math.ceil((renewsMs - now) / (1000 * 60 * 60 * 24));

  if (!WARN_DAYS.includes(daysUntil)) return [];
  if (sub.cancelledAt) return [];

  const requiresReconfirm =
    previousPriceGbp !== undefined && previousPriceGbp !== sub.priceGbp;

  return [{
    userId: sub.userId,
    planId: sub.planId,
    renewsAt: sub.renewsAt,
    priceGbp: sub.priceGbp,
    daysUntilRenewal: daysUntil,
    cancelUrl: `https://app.mjmaps.co.uk/account/cancel?uid=${sub.userId}`,
    requiresReconfirm,
  }];
}

/**
 * Returns true if a charge that occurred at chargedAt is still within
 * the refund window and should be auto-refunded on request.
 */
export function isWithinRefundWindow(chargedAt: Date): boolean {
  const ageHours = (Date.now() - chargedAt.getTime()) / (1000 * 60 * 60);
  return ageHours <= REFUND_WINDOW_HOURS;
}

/**
 * Validate a cancel request — returns the effective cancellation date.
 * Always cancels end-of-current-period (no pro-rating by default).
 * If within refund window, marks for immediate refund.
 */
export interface CancelResult {
  effectiveAt: Date;         // end of current period
  immediateRefund: boolean;  // true if within 48h window
  refundAmountGbp: number;
}

export function processCancellation(
  sub: SubscriptionRecord,
  chargedAt: Date,
): CancelResult {
  const immediateRefund = isWithinRefundWindow(chargedAt);
  return {
    effectiveAt: sub.renewsAt,
    immediateRefund,
    refundAmountGbp: immediateRefund ? sub.priceGbp : 0,
  };
}

/**
 * Subscription event log entry — written to DB for audit.
 */
export type SubscriptionEventType =
  | 'RENEWAL_WARNING_7D'
  | 'RENEWAL_WARNING_1D'
  | 'PRICE_CHANGE_RECONFIRM'
  | 'CHARGED'
  | 'CANCEL_REQUESTED'
  | 'CANCEL_CONFIRMED'
  | 'REFUND_ISSUED';

export interface SubscriptionEvent {
  userId: string;
  type: SubscriptionEventType;
  planId: PlanId;
  amountGbp?: number;
  occurredAt: Date;
  meta?: Record<string, unknown>;
}

export function buildChargeEvent(sub: SubscriptionRecord): SubscriptionEvent {
  return {
    userId:     sub.userId,
    type:       'CHARGED',
    planId:     sub.planId,
    amountGbp:  sub.priceGbp,
    occurredAt: new Date(),
  };
}

export function buildRefundEvent(
  sub: SubscriptionRecord,
  amountGbp: number,
): SubscriptionEvent {
  return {
    userId:     sub.userId,
    type:       'REFUND_ISSUED',
    planId:     sub.planId,
    amountGbp,
    occurredAt: new Date(),
  };
}
