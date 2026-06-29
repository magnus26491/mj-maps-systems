/**
 * packages/plan-reconciliation/index.ts
 *
 * Maps between legacy plan ID strings used in different parts of the codebase:
 *
 * Backend DB / API  → 'free' | 'navigation' | 'custom'
 * Legacy client     → 'free' | 'pro' | 'enterprise'
 * Landing/pricing   → 'free' | 'navigation' | 'custom' (matches backend)
 *
 * This package provides a single canonical type and bidirectional mapping.
 * No surface should hard-code plan ID strings — import from here.
 *
 * Backend is authoritative. Legacy 'pro'/'enterprise' are aliases for 'navigation'/'custom'.
 * The mapping is applied at:
 *   - API response normalisation (backend → client)
 *   - Client-side plan checks (FEATURE_MAP in usePlan.ts)
 *
 * Usage:
 *   import { PLAN_IDS, toBackend, fromBackend, type CanonicalPlanId } from '@mj-maps/plan-reconciliation';
 */

import type { PlanId } from '../plans/index.js';

// ─── Canonical plan IDs (matches backend DB + API) ─────────────────────────────

export type CanonicalPlanId = 'free' | 'navigation' | 'custom';

// Legacy aliases (what the driver-app used to use)
export type LegacyPlanId = 'free' | 'pro' | 'enterprise';

// ─── Alias maps ───────────────────────────────────────────────────────────────

/** Map legacy → canonical. 'pro' → 'navigation', 'enterprise' → 'custom' */
export function toBackend(legacy: LegacyPlanId): CanonicalPlanId {
  return LEGACY_TO_CANONICAL[legacy] as CanonicalPlanId;
}

/** Map canonical → legacy. 'navigation' → 'pro', 'custom' → 'enterprise' */
export function fromBackend(canonical: CanonicalPlanId): LegacyPlanId {
  return CANONICAL_TO_LEGACY[canonical] as LegacyPlanId;
}

/** Canonical plan ID strings (for DB column values) */
export const PLAN_IDS = {
  FREE:        'free',
  NAVIGATION:  'navigation',   // formerly 'pro'
  CUSTOM:      'custom',      // formerly 'enterprise'
} as const;

const LEGACY_TO_CANONICAL: Record<LegacyPlanId, string> = {
  free:       'free',
  pro:        'navigation',
  enterprise: 'custom',
};

const CANONICAL_TO_LEGACY: Record<CanonicalPlanId, string> = {
  free:       'free',
  navigation: 'pro',
  custom:     'enterprise',
};

// ─── Display names for UI ─────────────────────────────────────────────────────

export const PLAN_DISPLAY_NAMES: Record<CanonicalPlanId, string> = {
  free:       'Free',
  navigation: 'Driver Pro',
  custom:     'Enterprise',
};

// ─── Canonical PlanId for use in packages/plans / subscription-guard ─────────

export type { PlanId } from '../plans/index.js';

/**
 * Validates a plan ID string against canonical values.
 * Use at API boundary to sanitise untrusted input.
 */
export function isValidPlanId(value: unknown): value is CanonicalPlanId {
  return typeof value === 'string' && (value === 'free' || value === 'navigation' || value === 'custom');
}
