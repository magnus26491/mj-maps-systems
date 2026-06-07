/**
 * MJ Maps — Subscription Tier Engine
 *
 * Tiers:
 *   FREE        — individual driver, 15 stops/day, no POD, no team
 *   SOLO        — individual driver, unlimited stops, POD, offline
 *   BUSINESS    — org account, unlimited stops, multi-driver, dispatcher dashboard
 *   ENTERPRISE  — white-label, API access, custom integrations
 *
 * Key design decision:
 *   Drivers in a BUSINESS/ENTERPRISE org never see a paywall.
 *   Only the org owner (dispatcher) manages billing.
 *   This directly solves the delm8 problem where individual drivers
 *   were charged and then complained about unexpected billing.
 */

export type PlanId = 'free' | 'solo' | 'business' | 'enterprise';
export type PlanContext = 'individual' | 'org';

export interface Plan {
  id: PlanId;
  name: string;
  context: PlanContext;
  priceGBPPerMonth: number;     // 0 for free/enterprise (custom)
  priceGBPPerYear: number;
  maxStopsPerShift: number;     // -1 = unlimited
  maxDrivers: number;           // -1 = unlimited
  features: PlanFeature[];
}

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

export const PLANS: Record<PlanId, Plan> = {
  free: {
    id: 'free',
    name: 'Free',
    context: 'individual',
    priceGBPPerMonth: 0,
    priceGBPPerYear: 0,
    maxStopsPerShift: 15,
    maxDrivers: 1,
    features: [
      'turn_warnings',
      'vehicle_profiles',
      'access_notes',
    ],
  },

  solo: {
    id: 'solo',
    name: 'Solo',
    context: 'individual',
    priceGBPPerMonth: 4.99,
    priceGBPPerYear: 39.99,     // ~2 months free vs monthly
    maxStopsPerShift: -1,       // unlimited
    maxDrivers: 1,
    features: [
      'turn_warnings',
      'vehicle_profiles',
      'access_notes',
      'offline_mode',
      'pod_photo',
      'pod_signature',
      'route_optimisation',
    ],
  },

  business: {
    id: 'business',
    name: 'Business',
    context: 'org',
    priceGBPPerMonth: 19.99,    // per dispatcher seat, drivers free
    priceGBPPerYear: 179.99,
    maxStopsPerShift: -1,
    maxDrivers: -1,             // unlimited drivers under org
    features: [
      'turn_warnings',
      'vehicle_profiles',
      'access_notes',
      'offline_mode',
      'pod_photo',
      'pod_signature',
      'route_optimisation',
      'dispatcher_dashboard',
      'multi_driver',
      'team_management',
      'analytics',
      'priority_support',
    ],
  },

  enterprise: {
    id: 'enterprise',
    name: 'Enterprise',
    context: 'org',
    priceGBPPerMonth: 0,        // custom pricing
    priceGBPPerYear: 0,
    maxStopsPerShift: -1,
    maxDrivers: -1,
    features: [
      'turn_warnings',
      'vehicle_profiles',
      'access_notes',
      'offline_mode',
      'pod_photo',
      'pod_signature',
      'route_optimisation',
      'dispatcher_dashboard',
      'multi_driver',
      'team_management',
      'analytics',
      'priority_support',
      'api_access',
      'white_label',
      'custom_integrations',
    ],
  },
};

// ─── Gate checks ──────────────────────────────────────────────────────────

export interface PlanGate {
  allowed: boolean;
  reason?: string;
  upgradeHint?: PlanId;
}

export function canAddStop(planId: PlanId, currentStopCount: number): PlanGate {
  const plan = PLANS[planId];
  if (plan.maxStopsPerShift === -1) return { allowed: true };
  if (currentStopCount < plan.maxStopsPerShift) return { allowed: true };
  return {
    allowed: false,
    reason: `Your ${plan.name} plan includes up to ${plan.maxStopsPerShift} stops per shift.`,
    upgradeHint: planId === 'free' ? 'solo' : 'business',
  };
}

export function hasFeature(planId: PlanId, feature: PlanFeature): PlanGate {
  const plan = PLANS[planId];
  if (plan.features.includes(feature)) return { allowed: true };
  return {
    allowed: false,
    reason: `${featureLabel(feature)} requires a higher plan.`,
    upgradeHint: getSmallestPlanWithFeature(feature),
  };
}

export function canAddDriver(planId: PlanId, currentDriverCount: number): PlanGate {
  const plan = PLANS[planId];
  if (plan.context === 'individual' && currentDriverCount >= 1) {
    return {
      allowed: false,
      reason: 'Individual plans support one driver. Upgrade to Business for multi-driver teams.',
      upgradeHint: 'business',
    };
  }
  if (plan.maxDrivers !== -1 && currentDriverCount >= plan.maxDrivers) {
    return {
      allowed: false,
      reason: `You've reached the driver limit for your ${plan.name} plan.`,
      upgradeHint: 'enterprise',
    };
  }
  return { allowed: true };
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function getSmallestPlanWithFeature(feature: PlanFeature): PlanId {
  const order: PlanId[] = ['free', 'solo', 'business', 'enterprise'];
  for (const id of order) {
    if (PLANS[id].features.includes(feature)) return id;
  }
  return 'enterprise';
}

function featureLabel(feature: PlanFeature): string {
  const labels: Record<PlanFeature, string> = {
    offline_mode: 'Offline mode',
    pod_photo: 'Photo proof of delivery',
    pod_signature: 'Signature capture',
    turn_warnings: 'Turn warnings',
    vehicle_profiles: 'Vehicle profiles',
    access_notes: 'Access notes',
    dispatcher_dashboard: 'Dispatcher dashboard',
    multi_driver: 'Multiple drivers',
    team_management: 'Team management',
    route_optimisation: 'Route optimisation',
    api_access: 'API access',
    white_label: 'White-label branding',
    priority_support: 'Priority support',
    analytics: 'Analytics',
    custom_integrations: 'Custom integrations',
  };
  return labels[feature] ?? feature;
}
