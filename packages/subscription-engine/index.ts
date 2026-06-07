/**
 * MJ Maps — Subscription Tier Engine
 *
 * Two tiers only:
 *   PRO         — unlimited stops, unlimited drivers, all core features
 *                 Monthly or yearly billing in GBP/EUR/USD
 *   ENTERPRISE  — everything in Pro plus POD photo, POD signature,
 *                 API access, white-label, custom integrations
 *                 Custom pricing, activated manually
 *
 * Key design decision:
 *   Drivers in an org never see a paywall.
 *   Only the org owner (dispatcher) manages billing.
 */

export type PlanId       = 'pro' | 'enterprise';
export type CurrencyCode = 'GBP' | 'EUR' | 'USD';
export type BillingCycle = 'monthly' | 'yearly';
export type PlanContext  = 'org';

export type PlanFeature =
  | 'offline_mode'
  | 'pod_photo'
  | 'pod_signature'
  | 'turn_warnings'
  | 'vehicle_profiles'
  | 'access_notes'
  | 'dispatcher_dashboard'
  | 'multi_driver'
  | 'team_management'
  | 'route_optimisation'
  | 'api_access'
  | 'white_label'
  | 'priority_support'
  | 'analytics'
  | 'custom_integrations';

// ── Price table ─────────────────────────────────────────────────────────────

interface PlanPrices {
  monthlyGBP:  number;   // 9.97
  monthlyEUR:  number;   // 11.97
  monthlyUSD:  number;   // 13.47
  yearlyGBP:   number;   // 97.00
  yearlyEUR:   number;   // 116.00
  yearlyUSD:   number;   // 130.00
}

const PRO_PRICES: PlanPrices = {
  monthlyGBP:  9.97,
  monthlyEUR:  11.97,
  monthlyUSD:  13.47,
  yearlyGBP:   97.00,
  yearlyEUR:   116.00,
  yearlyUSD:   130.00,
};

// ── Plan interface ───────────────────────────────────────────────────────────

export interface Plan {
  id: PlanId;
  name: string;
  context: PlanContext;
  maxStopsPerShift: number;   // -1 = unlimited
  maxDrivers: number;          // -1 = unlimited
  features: PlanFeature[];
}

export const PLANS: Record<PlanId, Plan> = {
  pro: {
    id: 'pro',
    name: 'Pro',
    context: 'org',
    maxStopsPerShift: -1,
    maxDrivers: -1,
    features: [
      'turn_warnings',
      'vehicle_profiles',
      'access_notes',
      'offline_mode',
      'route_optimisation',
      'dispatcher_dashboard',
      'multi_driver',
      'team_management',
      'analytics',
      'priority_support',
      // NOTE: pod_photo and pod_signature intentionally excluded — Enterprise only
    ],
  },

  enterprise: {
    id: 'enterprise',
    name: 'Enterprise',
    context: 'org',
    maxStopsPerShift: -1,
    maxDrivers: -1,
    features: [
      'turn_warnings',
      'vehicle_profiles',
      'access_notes',
      'offline_mode',
      'route_optimisation',
      'dispatcher_dashboard',
      'multi_driver',
      'team_management',
      'analytics',
      'priority_support',
      'pod_photo',
      'pod_signature',
      'api_access',
      'white_label',
      'custom_integrations',
    ],
  },
};

// ── Currency resolution ────────────────────────────────────────────────────

/** Countries that use GBP (UK) */
const GBP_COUNTRIES = new Set(['GB']);

/** Countries that use EUR (European Economic Area) */
const EUR_COUNTRIES = new Set([
  'IE', 'DE', 'FR', 'NL', 'BE', 'AT', 'CH', 'ES', 'IT', 'PT',
  'SE', 'NO', 'DK', 'FI', 'PL', 'CZ', 'HU', 'RO', 'GR',
  'SK', 'SI', 'EE', 'LV', 'LT', 'CY', 'MT', 'LU',
]);

function countryToCurrency(countryCode: string): CurrencyCode {
  const code = countryCode.toUpperCase();
  if (GBP_COUNTRIES.has(code)) return 'GBP';
  if (EUR_COUNTRIES.has(code)) return 'EUR';
  return 'USD';
}

// ── Pricing ─────────────────────────────────────────────────────────────────

export interface PlanPrice {
  amount:       number;
  currency:     CurrencyCode;
  formatted:    string;        // e.g. "£9.97/mo", "€116.00/yr", "Custom pricing"
  savingVsMonthly?: string;   // e.g. "Save £22.64/yr" for yearly Pro
}

/**
 * Return the correct price for a plan in the user's currency.
 * Pure function — no side effects, no DB calls.
 *
 * @param planId    'pro' | 'enterprise'
 * @param countryCode  ISO 3166-1 alpha-2 (e.g. 'GB', 'DE', 'US')
 * @param billing   'monthly' (default) or 'yearly'
 */
export function getPlanPrice(
  planId: PlanId,
  countryCode: string,
  billing: BillingCycle = 'monthly',
): PlanPrice {
  const currency = countryToCurrency(countryCode);

  // Enterprise: custom pricing regardless of billing cycle
  if (planId === 'enterprise') {
    return {
      amount:    0,
      currency,
      formatted: 'Custom pricing',
    };
  }

  // Pro: multi-currency, monthly and yearly
  const symbol = currency === 'GBP' ? '£' : currency === 'EUR' ? '€' : '$';

  if (billing === 'yearly') {
    const priceMap: Record<CurrencyCode, number> = {
      GBP: PRO_PRICES.yearlyGBP,
      EUR: PRO_PRICES.yearlyEUR,
      USD: PRO_PRICES.yearlyUSD,
    };
    const price = priceMap[currency];

    // Compute saving vs monthly: (monthly × 12) - yearly
    const monthlyPriceMap: Record<CurrencyCode, number> = {
      GBP: PRO_PRICES.monthlyGBP,
      EUR: PRO_PRICES.monthlyEUR,
      USD: PRO_PRICES.monthlyUSD,
    };
    const monthlyPrice = monthlyPriceMap[currency];
    const saving = Math.round((monthlyPrice * 12 - price) * 100) / 100;
    const savingFormatted = `Save ${symbol}${saving.toFixed(2)}/yr`;

    return {
      amount:    price,
      currency,
      formatted: `${symbol}${price.toFixed(2)}/yr`,
      savingVsMonthly: savingFormatted,
    };
  }

  // Pro monthly
  const priceMap: Record<CurrencyCode, number> = {
    GBP: PRO_PRICES.monthlyGBP,
    EUR: PRO_PRICES.monthlyEUR,
    USD: PRO_PRICES.monthlyUSD,
  };
  const price = priceMap[currency];

  return {
    amount:    price,
    currency,
    formatted: `${symbol}${price.toFixed(2)}/mo`,
  };
}

// ── Gate checks ─────────────────────────────────────────────────────────────

export interface PlanGate {
  allowed:     boolean;
  reason?:     string;
  upgradeHint?: PlanId;
}

export function canAddStop(_planId: PlanId, _currentStopCount: number): PlanGate {
  // Both Pro and Enterprise have unlimited stops — no limit to enforce
  return { allowed: true };
}

export function hasFeature(planId: PlanId, feature: PlanFeature): PlanGate {
  const plan = PLANS[planId];
  if (plan.features.includes(feature)) return { allowed: true };

  // For features that are Enterprise-only, upgradeHint is always 'enterprise'
  const enterpriseOnlyFeatures: PlanFeature[] = [
    'pod_photo',
    'pod_signature',
    'api_access',
    'white_label',
    'custom_integrations',
  ];

  const upgradeHint: PlanId = enterpriseOnlyFeatures.includes(feature)
    ? 'enterprise'
    : 'enterprise';  // all missing features point to Enterprise

  return {
    allowed: false,
    reason: `${featureLabel(feature)} requires MJ Maps Enterprise. Contact support to upgrade.`,
    upgradeHint,
  };
}

export function canAddDriver(_planId: PlanId, _currentDriverCount: number): PlanGate {
  // Both Pro and Enterprise allow unlimited drivers
  return { allowed: true };
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function featureLabel(feature: PlanFeature): string {
  const labels: Record<PlanFeature, string> = {
    offline_mode:      'Offline mode',
    pod_photo:         'Photo proof of delivery',
    pod_signature:     'Signature capture',
    turn_warnings:     'Turn warnings',
    vehicle_profiles:  'Vehicle profiles',
    access_notes:      'Access notes',
    dispatcher_dashboard: 'Dispatcher dashboard',
    multi_driver:      'Multiple drivers',
    team_management:   'Team management',
    route_optimisation:'Route optimisation',
    api_access:        'API access',
    white_label:       'White-label branding',
    priority_support:  'Priority support',
    analytics:         'Analytics',
    custom_integrations: 'Custom integrations',
  };
  return labels[feature] ?? feature;
}
