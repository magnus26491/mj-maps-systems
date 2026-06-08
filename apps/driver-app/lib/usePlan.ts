import { useAuthStore } from './auth';
import type { PlanId } from './types';

// All features in the system. Enterprise features are PRESENT in code —
// canUse() simply returns false for lower plans until upgraded.
const FEATURE_MAP: Record<string, PlanId[]> = {
  // ── Pro + Enterprise ──────────────────────────────────────────────────
  'route_builder':       ['pro', 'enterprise'],
  'paf_lookup':          ['pro', 'enterprise'],
  'csv_import':          ['pro', 'enterprise'],
  'route_optimise':      ['pro', 'enterprise'],
  'saved_routes':        ['pro', 'enterprise'],
  'voice_navigation':    ['pro', 'enterprise'],
  'vehicle_specs':       ['pro', 'enterprise'],
  'dark_mode':           ['pro', 'enterprise'],
  'pod_capture':         ['pro', 'enterprise'],
  'driving_mode_lock':   ['pro', 'enterprise'],
  'live_activity':       ['pro', 'enterprise'],
  // ── Enterprise only ───────────────────────────────────────────────────
  'fleet_dispatch':      ['enterprise'],
  'dispatcher_dashboard':['enterprise'],
  'route_assignment':    ['enterprise'],
  'fleet_tracking':      ['enterprise'],
  'fleet_analytics':     ['enterprise'],
  'pod_export':          ['enterprise'],
  'bulk_stop_upload':    ['enterprise'],
  'time_windows':        ['enterprise'],
  'priority_stops':      ['enterprise'],
  'custom_pod_branding': ['enterprise'],
  'multi_depot':         ['enterprise'],
  'admin_panel':         ['enterprise'],
};

export type Feature = keyof typeof FEATURE_MAP;

export function usePlan() {
  const user = useAuthStore(s => s.user);
  const plan = (user?.planId ?? 'free') as PlanId;

  const canUse = (feature: Feature): boolean => {
    const allowed = FEATURE_MAP[feature];
    if (!allowed) return false;
    return allowed.includes(plan);
  };

  const isTrialing = (): boolean => {
    if (!user?.trialEndsAt) return false;
    return new Date(user.trialEndsAt) > new Date();
  };

  return { plan, canUse, isTrialing };
}

// Standalone selector for non-hook contexts (e.g. navigation guards)
export function getPlan(): PlanId {
  return (useAuthStore.getState().user?.planId ?? 'free') as PlanId;
}