/**
 * services/route-optimizer/src/time-aware-cost.ts
 * ================================================
 * Time-aware edge cost computation for TSP routing.
 * Replaces raw Haversine distance with congestion-adjusted travel time
 * and delay penalties for road conditions (tidal, roadworks, incidents, surface).
 */

import { getCongestionMultiplier, optimiseDeparture } from '../../traffic-engine/index.js';
import { effectiveSpeedKph, VEHICLE_SPEED_PROFILES } from './vehicle-profiles.js';
import type { VehicleClass } from '../../../packages/vehicle-profiles/index.js';
import type { StopPoint } from './index.js';

export interface EdgeCostParams {
  vehicleClass: VehicleClass;
  distanceKm: number;
  departureHour: number;
  /** Road surface: 'paved' | 'unpaved' | 'gravel' */
  surface?: 'paved' | 'unpaved' | 'gravel';
  /** Whether this edge crosses a tidal road that may be one-directional */
  isTidal?: boolean;
  /** Hours when tidal road runs in the correct direction (e.g. [6,10] = 06:00–10:00) */
  tidalCorrectWindow?: [number, number];
  /** Active roadworks on this edge */
  hasRoadworks?: boolean;
  /** Active incident on this edge */
  hasIncident?: boolean;
  /** Whether a toll is on this edge */
  hasToll?: boolean;
  /** Optional toll cost in pence (for cost-weighted objective) */
  tollCostPence?: number;
}

export interface EdgeCost {
  /** Estimated travel time in seconds */
  travelTimeSec: number;
  /** Total penalty seconds (all delay factors combined) */
  penaltySec: number;
  /** Whether this edge should be avoided entirely */
  hardBlock: boolean;
  /** Human-readable reason if hardBlock = true */
  blockReason?: string;
}

/**
 * Compute the time-aware cost of traversing an edge between two stops.
 *
 * Factors considered:
 *   - Congestion at departure hour (traffic-engine)
 *   - Vehicle speed profile (vehicle-profiles.ts)
 *   - Road surface (unpaved = hard block for HGV/artic)
 *   - Tidal road directionality
 *   - Roadworks (+8 min average)
 *   - Incidents (+18 min average)
 *   - Toll plaza slow-down (+90s)
 */
export function computeEdgeCost(params: EdgeCostParams): EdgeCost {
  const profile = VEHICLE_SPEED_PROFILES[params.vehicleClass];
  const congestion = getCongestionMultiplier(params.departureHour);
  const speedKph = effectiveSpeedKph(profile, congestion);
  let travelTimeSec = (params.distanceKm / speedKph) * 3600;
  let penaltySec = 0;
  let hardBlock = false;
  let blockReason: string | undefined;

  // ── Road surface penalty ────────────────────────────────────────────────────
  if (params.surface === 'unpaved') {
    if (params.vehicleClass === 'artic' || params.vehicleClass === 'hgv') {
      // HGV/artic cannot safely traverse unpaved roads — hard block
      hardBlock = true;
      blockReason = `${params.vehicleClass} cannot traverse unpaved road`;
    } else {
      // Light vehicles: speed drops to 15 kph on unpaved
      const unpavedTime = (params.distanceKm / 15) * 3600;
      penaltySec += Math.max(0, unpavedTime - travelTimeSec);
    }
  }
  if (params.surface === 'gravel') {
    travelTimeSec *= 1.35;
  }

  // ── Tidal road: block if in wrong-direction window ─────────────────────────
  if (params.isTidal && params.tidalCorrectWindow) {
    const [winStart, winEnd] = params.tidalCorrectWindow;
    const inCorrectWindow =
      params.departureHour >= winStart && params.departureHour <= winEnd;
    if (!inCorrectWindow) {
      hardBlock = true;
      blockReason =
        `Tidal road — wrong direction at ${params.departureHour.toFixed(2)}h (correct window ${winStart}–${winEnd})`;
    }
  }

  // ── Roadworks penalty: +8 min average queue ───────────────────────────────
  if (params.hasRoadworks) penaltySec += 480;

  // ── Incident penalty: +18 min average ─────────────────────────────────────
  if (params.hasIncident) penaltySec += 1080;

  // ── Toll: +90s for toll plaza slow-down ────────────────────────────────────
  if (params.hasToll) penaltySec += 90;

  return { travelTimeSec, penaltySec, hardBlock, blockReason };
}

/**
 * Score a full departure window and return the optimal departure hour.
 * Delegates to the existing optimiseDeparture() in traffic-engine.
 */
export function scoreDepartureWindows(params: {
  earliestDeparture: number;
  latestDeparture: number;
  routeDurationHours: number;
}): { optimalHour: number; label: string; congestionScore: number } {
  const result = optimiseDeparture({
    earliestDeparture: params.earliestDeparture,
    latestDeparture:    params.latestDeparture,
    routeDurationHours: params.routeDurationHours,
    stepMinutes: 15,
  });
  return {
    optimalHour:    result.optimalDeparture,
    label:          result.label,
    congestionScore: result.congestionScore,
  };
}
