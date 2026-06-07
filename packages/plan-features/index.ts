/**
 * packages/plan-features/index.ts
 * Shared plan → feature mapping for API and driver app front-end.
 *
 * Usage:
 *   import { canUse } from '@mj-maps/plan-features';
 *   if (canUse(user.planId, 'POD_PHOTO')) { showPodButton(); }
 */


export type PlanId = 'navigation' | 'custom';


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


const PLAN_FEATURES: Record<PlanId, Set<FeatureKey>> = {
  navigation: new Set([
    'NAVIGATION', 'HGV_ROUTING', 'BRIDGE_RESTRICTIONS', 'LIVE_TRAFFIC',
    'ROADWORKS_AVOIDANCE', 'TIME_AWARE_OPTIMIZER', 'OFFLINE_CACHE',
    'PARKING_ADVISORY', 'TIDAL_AVOIDANCE', 'UNPAVED_SCORING',
    'TURN_SCORE', 'W3W_PIN',
  ]),
  custom: new Set([
    'NAVIGATION', 'HGV_ROUTING', 'BRIDGE_RESTRICTIONS', 'LIVE_TRAFFIC',
    'ROADWORKS_AVOIDANCE', 'TIME_AWARE_OPTIMIZER', 'OFFLINE_CACHE',
    'PARKING_ADVISORY', 'TIDAL_AVOIDANCE', 'UNPAVED_SCORING',
    'TURN_SCORE', 'W3W_PIN',
    'BARCODE_SCANNING', 'POD_PHOTO', 'SIGNATURE_CAPTURE',
    'ROUTE_OPTIMISE', 'STOP_MANAGEMENT', 'PIN_CONFIRM', 'ACCESS_NOTES',
    'FAILED_DELIVERY', 'STOP_STATUS', 'ETA_NOTIFICATIONS', 'DISPATCHER',
    'LIVE_TRACKING_WS', 'WORKLOAD_GUARD', 'TROLLEY_ADVISORY',
    'ROUTE_INTEL', 'RED_ALERTS', 'ADMIN_ANALYTICS',
  ]),
};


export function canUse(planId: PlanId, feature: FeatureKey): boolean {
  return PLAN_FEATURES[planId]?.has(feature) ?? false;
}


export function featuresForPlan(planId: PlanId): FeatureKey[] {
  return Array.from(PLAN_FEATURES[planId] ?? []);
}


export function minimumPlanFor(feature: FeatureKey): PlanId {
  return PLAN_FEATURES.navigation.has(feature) ? 'navigation' : 'custom';
}
