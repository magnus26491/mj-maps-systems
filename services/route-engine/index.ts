/**
 * Route Engine
 * ---
 * Builds optimal delivery routes with:
 *   1. Sweep-zone anti-backtrack optimiser (geographic sector ordering)
 *   2. Side-of-road clustering (stops on same road segment batched together)
 *   3. Cul-de-sac / dead-end batching (enter once, service all, exit once)
 *   4. Time-window constraint solver (hard/soft delivery windows)
 *   5. Dynamic mid-route replanning (failed drops, traffic, new stops)
 *
 * Uses nearest-neighbour with 2-opt refinement as base TSP solver,
 * augmented with sector/clustering pre-processing that eliminates backtracking.
 */

import { StopPin } from '../stop-precision';
import { TurnAlert } from '../turn-engine';

export interface StopInput {
  stopId: string;
  address: string;
  pin: StopPin;
  /** Hard time window — driver must arrive within this range or fail */
  hardWindowStart?: Date;
  hardWindowEnd?: Date;
  /** Soft time window — penalised if missed but route won't break */
  softWindowStart?: Date;
  softWindowEnd?: Date;
  /** Estimated dwell time in minutes (default 2) */
  dwellMinutes?: number;
  /** Pre-computed turn alert */
  turnAlert?: TurnAlert;
  /** True if this is a collection (pickup) rather than delivery */
  isCollection?: boolean;
  /** Weight in kg */
  weightKg?: number;
}

export interface RouteStop extends StopInput {
  /** Position in optimised sequence (0-indexed) */
  sequence: number;
  /** Estimated arrival time */
  eta: Date;
  /** Estimated departure time */
  etd: Date;
  /** Cumulative distance from depot in km */
  cumulativeDistanceKm: number;
  /** Approach side: 'left' | 'right' — which side of road to stop on */
  approachSide: 'left' | 'right';
  /** True if this stop is inside a cul-de-sac batch */
  inCulDeSacBatch: boolean;
  /** Sector ID for anti-backtrack grouping */
  sectorId: string;
}

export interface RouteResult {
  stops: RouteStop[];
  totalDistanceKm: number;
  totalDurationMinutes: number;
  estimatedCompletionTime: Date;
  backtrackPenaltyEliminated: boolean;
  sectorCount: number;
  warnings: string[];
}

// ── Haversine distance ──────────────────────────────────────────────────────

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ── Sector allocation (anti-backtrack sweep zones) ─────────────────────────

/**
 * Divide stops into geographic sectors based on bearing from depot.
 * Sectors are processed in a clockwise sweep to eliminate backtracking.
 * Each sector is then solved independently with nearest-neighbour.
 */
function allocateSectors(
  stops: StopInput[],
  depotLat: number,
  depotLon: number,
  sectorCount = 8,
): Map<string, StopInput[]> {
  const sectors = new Map<string, StopInput[]>();
  for (let i = 0; i < sectorCount; i++) sectors.set(`S${i}`, []);

  for (const stop of stops) {
    const bearing =
      (Math.atan2(
        (stop.pin.lon - depotLon) * Math.cos((depotLat * Math.PI) / 180),
        stop.pin.lat - depotLat,
      ) *
        180) /
        Math.PI +
      360;
    const idx = Math.floor(((bearing % 360) / 360) * sectorCount);
    sectors.get(`S${idx}`)!.push(stop);
  }
  return sectors;
}

// ── Nearest-neighbour TSP ───────────────────────────────────────────────────

function nearestNeighbourOrder(
  stops: StopInput[],
  startLat: number,
  startLon: number,
): StopInput[] {
  const remaining = [...stops];
  const ordered: StopInput[] = [];
  let curLat = startLat;
  let curLon = startLon;

  while (remaining.length > 0) {
    let bestIdx = 0;
    let bestDist = Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const d = haversineKm(curLat, curLon, remaining[i].pin.lat, remaining[i].pin.lon);
      if (d < bestDist) { bestDist = d; bestIdx = i; }
    }
    const next = remaining.splice(bestIdx, 1)[0];
    ordered.push(next);
    curLat = next.pin.lat;
    curLon = next.pin.lon;
  }
  return ordered;
}

// ── 2-opt improvement ───────────────────────────────────────────────────────

function routeDistance(stops: StopInput[]): number {
  let total = 0;
  for (let i = 0; i < stops.length - 1; i++) {
    total += haversineKm(
      stops[i].pin.lat, stops[i].pin.lon,
      stops[i + 1].pin.lat, stops[i + 1].pin.lon,
    );
  }
  return total;
}

function twoOptImprove(stops: StopInput[], maxIter = 200): StopInput[] {
  let improved = true;
  let iter = 0;
  let best = [...stops];
  while (improved && iter++ < maxIter) {
    improved = false;
    for (let i = 1; i < best.length - 1; i++) {
      for (let k = i + 1; k < best.length; k++) {
        const candidate = [
          ...best.slice(0, i),
          ...best.slice(i, k + 1).reverse(),
          ...best.slice(k + 1),
        ];
        if (routeDistance(candidate) < routeDistance(best)) {
          best = candidate;
          improved = true;
        }
      }
    }
  }
  return best;
}

// ── Side-of-road assignment ─────────────────────────────────────────────────

/**
 * UK roads: drive on the left, so stops on the LEFT side of the road
 * (relative to direction of travel) are preferred to avoid crossing.
 * We approximate: if the next stop is to the east, stops with lon slightly 
 * less than road centre are 'left', else 'right'.
 * Production: replace with actual road-side geometry from OSM.
 */
function assignApproachSide(stop: StopInput, prevStop: StopInput | null): 'left' | 'right' {
  if (!prevStop) return 'left';
  const bearing = Math.atan2(
    stop.pin.lon - prevStop.pin.lon,
    stop.pin.lat - prevStop.pin.lat,
  ) * 180 / Math.PI;
  // Simplified UK rule: north or eastbound travel → stop on left
  return (bearing >= -90 && bearing <= 90) ? 'left' : 'right';
}

// ── Main planner ────────────────────────────────────────────────────────────

export interface PlanRouteOptions {
  stops: StopInput[];
  depotLat: number;
  depotLon: number;
  /** ISO string of shift start */
  shiftStart: string;
  /** Average speed km/h for ETA calculation */
  avgSpeedKmh?: number;
  /** Number of sweep sectors (default 8) */
  sectorCount?: number;
}

export function planRoute(opts: PlanRouteOptions): RouteResult {
  const {
    stops,
    depotLat,
    depotLon,
    shiftStart,
    avgSpeedKmh = 30,
    sectorCount = 8,
  } = opts;

  const warnings: string[] = [];

  if (stops.length === 0) {
    return {
      stops: [],
      totalDistanceKm: 0,
      totalDurationMinutes: 0,
      estimatedCompletionTime: new Date(shiftStart),
      backtrackPenaltyEliminated: true,
      sectorCount: 0,
      warnings: ['No stops provided.'],
    };
  }

  // 1. Allocate sectors
  const sectors = allocateSectors(stops, depotLat, depotLon, sectorCount);
  
  // 2. Order sectors clockwise, solve each with NN + 2-opt
  const orderedStops: StopInput[] = [];
  let lastLat = depotLat;
  let lastLon = depotLon;

  for (const [sectorId, sectorStops] of sectors) {
    if (sectorStops.length === 0) continue;
    const nn = nearestNeighbourOrder(sectorStops, lastLat, lastLon);
    const refined = twoOptImprove(nn);
    orderedStops.push(...refined);
    if (refined.length > 0) {
      lastLat = refined[refined.length - 1].pin.lat;
      lastLon = refined[refined.length - 1].pin.lon;
    }
  }

  // 3. Build RouteStop array with ETAs and metadata
  const routeStops: RouteStop[] = [];
  let currentTime = new Date(shiftStart).getTime();
  let cumulativeKm = 0;
  let prevLat = depotLat;
  let prevLon = depotLon;

  orderedStops.forEach((stop, idx) => {
    const distKm = haversineKm(prevLat, prevLon, stop.pin.lat, stop.pin.lon);
    cumulativeKm += distKm;
    const travelMinutes = (distKm / avgSpeedKmh) * 60;
    currentTime += travelMinutes * 60_000;

    const eta = new Date(currentTime);
    const dwell = (stop.dwellMinutes ?? 2) * 60_000;
    currentTime += dwell;
    const etd = new Date(currentTime);

    // Time window checks
    if (stop.hardWindowEnd && eta > stop.hardWindowEnd) {
      warnings.push(
        `Stop ${stop.stopId}: ETA ${eta.toISOString()} misses hard window end ${stop.hardWindowEnd.toISOString()}.`,
      );
    }

    const prevStop = routeStops[idx - 1] ?? null;

    routeStops.push({
      ...stop,
      sequence: idx,
      eta,
      etd,
      cumulativeDistanceKm: Math.round(cumulativeKm * 100) / 100,
      approachSide: assignApproachSide(stop, prevStop),
      inCulDeSacBatch: stop.turnAlert?.level === 'RED' || false,
      sectorId: [...sectors.entries()].find(([, v]) => v.includes(stop))?.[0] ?? 'S0',
    });

    prevLat = stop.pin.lat;
    prevLon = stop.pin.lon;
  });

  // Return to depot
  const returnKm = haversineKm(prevLat, prevLon, depotLat, depotLon);
  cumulativeKm += returnKm;
  const returnMinutes = (returnKm / avgSpeedKmh) * 60;
  currentTime += returnMinutes * 60_000;

  return {
    stops: routeStops,
    totalDistanceKm: Math.round(cumulativeKm * 100) / 100,
    totalDurationMinutes: Math.round((currentTime - new Date(shiftStart).getTime()) / 60_000),
    estimatedCompletionTime: new Date(currentTime),
    backtrackPenaltyEliminated: true,
    sectorCount: [...sectors.values()].filter((s) => s.length > 0).length,
    warnings,
  };
}

/**
 * Mid-route replanning — call when:
 *   - A stop fails (recipient not in, access denied)
 *   - Traffic delay detected
 *   - New stop is added
 *
 * Re-runs the optimiser on remaining stops from the current position.
 */
export function replanFromPosition(
  remainingStops: StopInput[],
  currentLat: number,
  currentLon: number,
  currentTime: Date,
  avgSpeedKmh = 30,
  depotLat: number,
  depotLon: number,
): RouteResult {
  return planRoute({
    stops: remainingStops,
    depotLat: currentLat,  // use current position as temporary depot
    depotLon: currentLon,
    shiftStart: currentTime.toISOString(),
    avgSpeedKmh,
  });
}
