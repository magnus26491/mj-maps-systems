/**
 * services/route-optimizer/src/vehicle-profiles.ts
 * ================================================
 * Vehicle speed and dwell profiles used by the time-aware route optimizer.
 *
 * VehicleClass values matched from packages/vehicle-profiles/index.ts:
 *   'light' | 'van' | 'hgv' | 'artic'
 */

import type { VehicleClass } from '../../../packages/vehicle-profiles/index.js';

/** Base cruise speed and dwell time by vehicle class */
export interface VehicleSpeedProfile {
  /** Base cruise speed kph (motorway/A-road, no traffic) */
  baseCruiseKph: number;
  /** Urban speed kph (< 1km stops, built-up) */
  urbanKph: number;
  /** Rural speed kph (B-roads, open) */
  ruralKph: number;
  /** Dwell time at a standard stop in seconds */
  dwellTimeS: number;
  /** Dwell time at an oversize/signature stop in seconds */
  dwellTimeLargeS: number;
  /** Congestion sensitivity multiplier (1.0 = same as car) */
  congestionWeight: number;
  /** Max legal speed kph */
  maxSpeedKph: number;
}

export const VEHICLE_SPEED_PROFILES: Record<VehicleClass, VehicleSpeedProfile> = {
  light: {
    baseCruiseKph:    52,
    urbanKph:         28,
    ruralKph:         65,
    dwellTimeS:       90,
    dwellTimeLargeS:  180,
    congestionWeight: 1.0,
    maxSpeedKph:      96,
  },
  van: {
    baseCruiseKph:    48,
    urbanKph:         25,
    ruralKph:         60,
    dwellTimeS:       120,
    dwellTimeLargeS:  240,
    congestionWeight: 1.1,
    maxSpeedKph:      96,
  },
  hgv: {
    baseCruiseKph:    42,
    urbanKph:         18,
    ruralKph:         50,
    dwellTimeS:       300,
    dwellTimeLargeS:  600,
    congestionWeight: 1.4,
    maxSpeedKph:      90,
  },
  artic: {
    baseCruiseKph:    38,
    urbanKph:         15,
    ruralKph:         45,
    dwellTimeS:       480,
    dwellTimeLargeS:  900,
    congestionWeight: 1.6,
    maxSpeedKph:      90,
  },
};

/**
 * Return effective speed kph at a given congestion level.
 * Heavy vehicles slow more in congestion (higher congestionWeight).
 */
export function effectiveSpeedKph(
  profile: VehicleSpeedProfile,
  congestionMultiplier: number,
): number {
  const reduction = congestionMultiplier * 0.6 * profile.congestionWeight;
  return Math.max(profile.urbanKph * 0.5, profile.baseCruiseKph * (1 - reduction));
}
