/**
 * packages/plans/index.ts
 * Single source of truth for plan IDs, pricing, features, and display metadata.
 *
 * Pricing authority: docs/SUBSCRIPTION_TIERS.md
 * Feature authority: packages/plan-features/index.ts
 *
 * See docs/PLAN_RECONCILIATION.md for resolved conflicts.
 */

// ─── Feature keys (mirrors plan-features, self-contained) ─────────────────

export type FeatureKey =
  | 'NAVIGATION' | 'HGV_ROUTING' | 'BRIDGE_RESTRICTIONS' | 'LIVE_TRAFFIC'
  | 'ROADWORKS_AVOIDANCE' | 'TIME_AWARE_OPTIMIZER' | 'OFFLINE_CACHE'
  | 'PARKING_ADVISORY' | 'TIDAL_AVOIDANCE' | 'UNPAVED_SCORING'
  | 'TURN_SCORE' | 'W3W_PIN'
  | 'BARCODE_SCANNING' | 'POD_PHOTO' | 'SIGNATURE_CAPTURE'
  | 'ROUTE_OPTIMISE' | 'STOP_MANAGEMENT' | 'PIN_CONFIRM' | 'ACCESS_NOTES'
  | 'FAILED_DELIVERY' | 'STOP_STATUS' | 'ETA_NOTIFICATIONS' | 'DISPATCHER'
  | 'LIVE_TRACKING_WS' | 'WORKLOAD_GUARD' | 'TROLLEY_ADVISORY'
  | 'ROUTE_INTEL' | 'RED_ALERTS' | 'ADMIN_ANALYTICS';

export type PlanId = 'navigation' | 'custom';
export type Currency = 'GBP' | 'EUR' | 'USD';
export type Period = 'monthly' | 'yearly';

// ─── Pricing ───────────────────────────────────────────────────────────────

export type PriceTable = Record<Currency, Record<Period, number | null>>;

// null = contact us / custom pricing
export const PRICES: Record<PlanId, PriceTable> = {
  navigation: {
    GBP: { monthly: 9.97,  yearly: 97.00  },
    EUR: { monthly: 11.97, yearly: 116.00 },
    USD: { monthly: 13.47, yearly: 130.00 },
  },
  custom: {
    GBP: { monthly: null, yearly: null },
    EUR: { monthly: null, yearly: null },
    USD: { monthly: null, yearly: null },
  },
};

// Yearly savings (GBP/EUR/USD)
export const YEARLY_SAVINGS: Record<Exclude<PlanId, 'custom'>, Record<Currency, string>> = {
  navigation: {
    GBP: '£22.64',
    EUR: '€27.64',
    USD: '$31.64',
  },
};

// ─── Feature sets ──────────────────────────────────────────────────────────

export const PLAN_FEATURES: Record<PlanId, readonly FeatureKey[]> = {
  navigation: [
    'NAVIGATION', 'HGV_ROUTING', 'BRIDGE_RESTRICTIONS', 'LIVE_TRAFFIC',
    'ROADWORKS_AVOIDANCE', 'TIME_AWARE_OPTIMIZER', 'OFFLINE_CACHE',
    'PARKING_ADVISORY', 'TIDAL_AVOIDANCE', 'UNPAVED_SCORING',
    'TURN_SCORE', 'W3W_PIN',
  ],
  custom: [
    'NAVIGATION', 'HGV_ROUTING', 'BRIDGE_RESTRICTIONS', 'LIVE_TRAFFIC',
    'ROADWORKS_AVOIDANCE', 'TIME_AWARE_OPTIMIZER', 'OFFLINE_CACHE',
    'PARKING_ADVISORY', 'TIDAL_AVOIDANCE', 'UNPAVED_SCORING',
    'TURN_SCORE', 'W3W_PIN',
    'BARCODE_SCANNING', 'POD_PHOTO', 'SIGNATURE_CAPTURE',
    'ROUTE_OPTIMISE', 'STOP_MANAGEMENT', 'PIN_CONFIRM', 'ACCESS_NOTES',
    'FAILED_DELIVERY', 'STOP_STATUS', 'ETA_NOTIFICATIONS', 'DISPATCHER',
    'LIVE_TRACKING_WS', 'WORKLOAD_GUARD', 'TROLLEY_ADVISORY',
    'ROUTE_INTEL', 'RED_ALERTS', 'ADMIN_ANALYTICS',
  ],
};

// ─── Display metadata ──────────────────────────────────────────────────────

export interface FeatureMeta {
  label: string;
  description: string;
  /** Turn-score chip colour shown in the feature grid */
  signal?: 'green' | 'amber' | 'red';
  /** Not yet live — show "coming soon" badge instead of advertising as available */
  comingSoon?: boolean;
}

export const FEATURE_META: Record<FeatureKey, FeatureMeta> = {
  NAVIGATION:            { label: 'Turn-by-turn navigation',     description: 'UK-optimised routing for every delivery vehicle', signal: 'green' },
  HGV_ROUTING:           { label: 'HGV & van routing',           description: 'Height, weight and width restrictions respected', signal: 'green' },
  BRIDGE_RESTRICTIONS:   { label: 'Bridge alerts',               description: 'Low-bridge warnings before you reach the turn',   signal: 'red' },
  LIVE_TRAFFIC:          { label: 'Live traffic',                 description: 'Real-time incident and congestion avoidance' },
  ROADWORKS_AVOIDANCE:   { label: 'Roadworks avoidance',         description: 'Planned and live road closure routing' },
  TIME_AWARE_OPTIMIZER:  { label: 'Time-aware optimisation',     description: 'Routes re-scored against your delivery windows' },
  OFFLINE_CACHE:         { label: 'Offline maps',                description: 'Navigate without a signal in rural and warehouse zones' },
  PARKING_ADVISORY:      { label: 'Parking advice',              description: 'Loading bay and parking guidance near each stop' },
  TIDAL_AVOIDANCE:       { label: 'Tidal road avoidance',        description: 'Coastal tidal roads excluded during flood windows', signal: 'amber' },
  UNPAVED_SCORING:       { label: 'Unpaved road scoring',        description: 'Rough track warnings for van and lorry loads', signal: 'amber' },
  TURN_SCORE:            { label: 'Turn-score warnings',         description: 'Green / amber / red safety score on every turn',  signal: 'amber' },
  W3W_PIN:               { label: 'what3words pin delivery',     description: 'Drop pins at exact gates and yards, not postcode centroids' },
  BARCODE_SCANNING:      { label: 'Barcode scanning',            description: 'Scan parcel barcodes for instant proof of delivery' },
  POD_PHOTO:             { label: 'Photo proof of delivery',     description: 'Timestamped photo POD uploaded to dispatcher dashboard' },
  SIGNATURE_CAPTURE:     { label: 'Signature capture',           description: 'On-screen signature with PDF export' },
  ROUTE_OPTIMISE:        { label: 'Route optimisation',          description: 'Automatically sort stops to minimise drive time' },
  STOP_MANAGEMENT:       { label: 'Stop management',             description: 'Add, remove and re-order stops mid-shift' },
  PIN_CONFIRM:           { label: 'Precise pin confirmation',    description: 'Confirm exact delivery point before marking complete' },
  ACCESS_NOTES:          { label: 'Access notes',                description: 'Per-stop notes: gate codes, parking tips, contact names' },
  FAILED_DELIVERY:       { label: 'Failed delivery capture',     description: 'Log reason codes with photo and driver note' },
  STOP_STATUS:           { label: 'Live stop status',            description: 'Real-time delivered / attempted / failed for dispatcher' },
  ETA_NOTIFICATIONS:     { label: 'ETA notifications',           description: 'Automatic SMS / push ETAs sent to recipients' },
  DISPATCHER:            { label: 'Dispatcher dashboard',        description: 'Fleet-wide live map, alerts, and route control console' },
  LIVE_TRACKING_WS:      { label: 'Live driver tracking',        description: 'Sub-5s WebSocket location updates on the fleet map' },
  WORKLOAD_GUARD:        { label: 'Workload guard',              description: 'Flags over-capacity shifts before the driver departs' },
  TROLLEY_ADVISORY:      { label: 'Trolley advisory',            description: 'Flags stops requiring trolley unload based on volume' },
  ROUTE_INTEL:           { label: 'Route intelligence',          description: 'Historic dwell, delay and access pattern analysis' },
  RED_ALERTS:            { label: 'Red alerts',                  description: 'Instant Telegram / push alerts for exceptions and delays' },
  ADMIN_ANALYTICS:       { label: 'Admin analytics',             description: 'Cost-per-stop, on-time %, and driver performance dashboards' },
};

// ─── Plan display metadata ─────────────────────────────────────────────────

export interface PlanMeta {
  id: PlanId;
  displayName: string;
  tagline: string;
  cta: string;
  ctaHref: string;
  highlight?: boolean;
  badge?: string;
}

export const PLAN_META: Record<PlanId, PlanMeta> = {
  navigation: {
    id:          'navigation',
    displayName: 'Driver Pro',
    tagline:     'Everything a solo or small-team driver needs',
    cta:         'Start free trial',
    ctaHref:     '/register?plan=navigation',
    highlight:   true,
    badge:       'Most popular',
  },
  custom: {
    id:          'custom',
    displayName: 'Enterprise',
    tagline:     'Fleet-grade control for operations teams',
    cta:         'Talk to us',
    ctaHref:     'mailto:hello@mjmaps.app',
  },
};

// ─── Helpers ───────────────────────────────────────────────────────────────

export function hasFeature(planId: PlanId, feature: FeatureKey): boolean {
  return (PLAN_FEATURES[planId] as readonly string[]).includes(feature);
}

export function formatPrice(
  planId: PlanId,
  currency: Currency,
  period: Period,
): string {
  const val = PRICES[planId][currency][period];
  if (val === null) return 'Custom';
  const symbols: Record<Currency, string> = { GBP: '£', EUR: '€', USD: '$' };
  return `${symbols[currency]}${val.toFixed(2)}`;
}

// Currency symbols for display
export const CURRENCY_SYMBOLS: Record<Currency, string> = {
  GBP: '£', EUR: '€', USD: '$',
};

// Features to highlight on the home page feature grid (10 key differentiators)
export const HOME_FEATURE_KEYS: FeatureKey[] = [
  'HGV_ROUTING', 'BRIDGE_RESTRICTIONS', 'TURN_SCORE', 'UNPAVED_SCORING',
  'OFFLINE_CACHE', 'W3W_PIN', 'POD_PHOTO', 'SIGNATURE_CAPTURE',
  'DISPATCHER', 'LIVE_TRACKING_WS',
];
