/**
 * lib/usePlan.ts
 * Client-side plan feature gate hook.
 *
 * Feature map is kept in sync with services/billing/subscription-guard.ts.
 * Backend is authoritative — this is purely for UI experience.
 *
 * Canonical plan IDs (matching backend):
 *   'free'       — no subscription
 *   'navigation' — Driver Pro
 *   'custom'    — Enterprise
 */

import { useAuthStore } from './auth';
import type { PlanId } from './types';

// Feature → required plan(s) — mirrors services/billing/subscription-guard.ts
// Both 'navigation' AND 'custom' share the same features (subscription-guard
// treats 'navigation' as the paid tier). 'custom' adds dispatch/admin features.
const FEATURE_MAP: Record<string, PlanId[]> = {
  // ── Navigation plan (Driver Pro) + Enterprise ─────────────────────────
  // These are on 'navigation' in subscription-guard, but subscription-guard
  // only has 'navigation'/'custom' — we use 'navigation' as the paid tier here.
  'route_builder':       ['navigation', 'custom'],
  'paf_lookup':          ['navigation', 'custom'],
  'csv_import':          ['navigation', 'custom'],
  'route_optimise':      ['navigation', 'custom'],
  'saved_routes':        ['navigation', 'custom'],
  'voice_navigation':    ['navigation', 'custom'],
  'vehicle_specs':       ['navigation', 'custom'],
  'pod_capture':         ['navigation', 'custom'],
  'driving_mode_lock':   ['navigation', 'custom'],
  'live_activity':       ['navigation', 'custom'],
  // ── Enterprise only ───────────────────────────────────────────────────
  'fleet_dispatch':      ['custom'],
  'dispatcher_dashboard':['custom'],
  'route_assignment':    ['custom'],
  'fleet_tracking':      ['custom'],
  'fleet_analytics':     ['custom'],
  'pod_export':          ['custom'],
  'bulk_stop_upload':    ['custom'],
  'time_windows':        ['custom'],
  'priority_stops':      ['custom'],
  'custom_pod_branding': ['custom'],
  'multi_depot':         ['custom'],
  'admin_panel':         ['custom'],
};

export type Feature = keyof typeof FEATURE_MAP;

export function usePlan() {
  const user = useAuthStore(s => s.user);
  // Canonical planId — backend always sends 'free' | 'navigation' | 'custom'
  const plan: PlanId = (user?.planId ?? 'free') as PlanId;

  const canUse = (feature: Feature): boolean => {
    const allowed = FEATURE_MAP[feature];
    if (!allowed) return false;
    return allowed.includes(plan);
  };

  const isTrialing = (): boolean => {
    if (!user?.trialEndsAt) return false;
    return new Date(user.trialEndsAt) > new Date();
  };

  /** Display name for the current plan (for UI labels) */
  const planDisplayName = (): string => {
    const names: Record<PlanId, string> = {
      free:       'Free',
      navigation: 'Driver Pro',
      custom:     'Enterprise',
    };
    return names[plan];
  };

  return { plan, canUse, isTrialing, planDisplayName };
}

// Standalone selector for non-hook contexts (e.g. navigation guards)
export function getPlan(): PlanId {
  return (useAuthStore.getState().user?.planId ?? 'free') as PlanId;
}