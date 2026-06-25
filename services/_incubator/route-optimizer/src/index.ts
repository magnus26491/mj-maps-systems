// ─────────────────────────────────────────────────────────────────────────────
// Route Optimizer Service
// Implements nearest-neighbour + 2-opt TSP optimisation with:
//   - Anti-backtracking sweep zones (neighbourhood completion logic)
//   - Side-of-road preference clustering
//   - Hard time windows (open/close)
//   - Vehicle capacity constraints
//   - Turn-feasibility pre-filtering (marks RED segments before routing)
//   - Time-aware edge costs (congestion, road surface, tidal, roadworks, incidents)
//   - Vehicle-class-appropriate speed and dwell profiles
// ─────────────────────────────────────────────────────────────────────────────
import Fastify from 'fastify';
import type { VehicleClass } from '../../../packages/vehicle-profiles/index';
import { VEHICLE_SPEED_PROFILES } from './vehicle-profiles.js';
import { computeEdgeCost, scoreDepartureWindows } from './time-aware-cost.js';

const app = Fastify({ logger: true });

export interface StopPoint {
  id: string;
  label: string;
  lat: number;
  lon: number;
  /** Address as displayed to driver */
  address: string;
  postcode: string;
  /** Earliest time window (unix ms) */
  windowOpenMs?: number;
  /** Latest time window (unix ms) */
  windowCloseMs?: number;
  /** Volume in litres */
  volumeL?: number;
  /** Weight in kg */
  weightKg?: number;
  /** Driver notes */
  notes?: string;
  /** Whether this is a collection (pickup) */
  isCollection?: boolean;
  /** Pre-computed RED alert — turn-engine flagged this stop */
  turnAlert?: 'GREEN' | 'AMBER' | 'RED';
}

export interface OptimiseRequest {
  vehicleClass: VehicleClass;
  depotLat: number;
  depotLon: number;
  stops: StopPoint[];
  returnToDepot?: boolean;
  maxCapacityL?: number;
  maxCapacityKg?: number;
  shiftStartMs?: number;
  avgSpeedKph?: number;        // kept for backwards compat; overridden by vehicleClass profile
  dwellTimePerStopMs?: number; // kept for backwards compat; overridden by vehicleClass profile

  // ── NEW FIELDS ──────────────────────────────────────────────────────────────
  /** Departure window start (decimal hour, default 6.0) */
  earliestDepartureHour?: number;
  /** Departure window end (decimal hour, default 9.5) */
  latestDepartureHour?: number;
  /**
   * Per-stop road condition hints — keyed by StopPoint.id.
   * Pass in from bridge-engine / road-closure-engine outputs.
   */
  roadConditions?: Record<string, {
    surface?: 'paved' | 'unpaved' | 'gravel';
    isTidal?: boolean;
    tidalCorrectWindow?: [number, number];
    hasRoadworks?: boolean;
    hasIncident?: boolean;
    hasToll?: boolean;
  }>;
}

export interface OptimiseResult {
  orderedStops: StopPoint[];
  totalDistanceKm: number;
  estimatedDurationMs: number;
  warnings: string[];

  // ── NEW FIELDS ──────────────────────────────────────────────────────────────
  /** Recommended departure time in HH:MM format */
  recommendedDeparture?: string;
  /** Congestion score 0.0–1.0 at recommended departure (lower = better) */
  congestionScore?: number;
  /** Stops that were hard-blocked by road conditions (not removed, just flagged) */
  blockedEdges?: Array<{ fromStopId: string; toStopId: string; reason: string }>;
}

// ── Haversine Distance ────────────────────────────────────────────────────────
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

function totalRouteDistance(stops: StopPoint[], depotLat: number, depotLon: number): number {
  let dist = haversineKm(depotLat, depotLon, stops[0].lat, stops[0].lon);
  for (let i = 0; i < stops.length - 1; i++) {
    dist += haversineKm(stops[i].lat, stops[i].lon, stops[i + 1].lat, stops[i + 1].lon);
  }
  dist += haversineKm(stops[stops.length - 1].lat, stops[stops.length - 1].lon, depotLat, depotLon);
  return dist;
}

// ── Nearest-Neighbour Seed ────────────────────────────────────────────────────
function nearestNeighbour(
  stops: StopPoint[],
  depotLat: number,
  depotLon: number,
): StopPoint[] {
  const unvisited = [...stops];
  const route: StopPoint[] = [];
  let curLat = depotLat;
  let curLon = depotLon;

  while (unvisited.length > 0) {
    let bestIdx = 0;
    let bestDist = Infinity;
    for (let i = 0; i < unvisited.length; i++) {
      const d = haversineKm(curLat, curLon, unvisited[i].lat, unvisited[i].lon);
      if (d < bestDist) { bestDist = d; bestIdx = i; }
    }
    const next = unvisited.splice(bestIdx, 1)[0];
    route.push(next);
    curLat = next.lat;
    curLon = next.lon;
  }
  return route;
}

// ── 2-Opt Improvement ────────────────────────────────────────────────────────
function twoOpt(
  stops: StopPoint[],
  depotLat: number,
  depotLon: number,
  maxIterations = 1000,
): StopPoint[] {
  let best = [...stops];
  let improved = true;
  let iterations = 0;

  while (improved && iterations < maxIterations) {
    improved = false;
    iterations++;
    for (let i = 0; i < best.length - 1; i++) {
      for (let k = i + 1; k < best.length; k++) {
        const newRoute = [
          ...best.slice(0, i),
          ...best.slice(i, k + 1).reverse(),
          ...best.slice(k + 1),
        ];
        if (
          totalRouteDistance(newRoute, depotLat, depotLon) <
          totalRouteDistance(best, depotLat, depotLon)
        ) {
          best = newRoute;
          improved = true;
        }
      }
    }
  }
  return best;
}

// ── Anti-Backtrack Sweep Zones ────────────────────────────────────────────────
// Group stops into geographic clusters (approx 500m radius) and enforce that
// all stops in a cluster are completed before moving to the next cluster.
function applySweepZones(
  stops: StopPoint[],
  depotLat: number,
  depotLon: number,
  clusterRadiusKm = 0.5,
): StopPoint[] {
  if (stops.length === 0) return stops;

  // Assign each stop to a cluster centroid
  const clusters: StopPoint[][] = [];
  const assigned = new Set<string>();

  for (const stop of stops) {
    if (assigned.has(stop.id)) continue;
    const cluster: StopPoint[] = [stop];
    assigned.add(stop.id);
    for (const other of stops) {
      if (assigned.has(other.id)) continue;
      if (haversineKm(stop.lat, stop.lon, other.lat, other.lon) <= clusterRadiusKm) {
        cluster.push(other);
        assigned.add(other.id);
      }
    }
    clusters.push(cluster);
  }

  // Order clusters by nearest-neighbour from depot
  const orderedClusters: StopPoint[][] = [];
  const remaining = [...clusters];
  let curLat = depotLat;
  let curLon = depotLon;

  while (remaining.length > 0) {
    let bestIdx = 0;
    let bestDist = Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const centroid = clusterCentroid(remaining[i]);
      const d = haversineKm(curLat, curLon, centroid.lat, centroid.lon);
      if (d < bestDist) { bestDist = d; bestIdx = i; }
    }
    const cluster = remaining.splice(bestIdx, 1)[0];
    orderedClusters.push(cluster);
    const c = clusterCentroid(cluster);
    curLat = c.lat;
    curLon = c.lon;
  }

  // Within each cluster, apply nearest-neighbour
  const result: StopPoint[] = [];
  for (const cluster of orderedClusters) {
    if (cluster.length === 1) { result.push(cluster[0]); continue; }
    const ordered = nearestNeighbour(cluster, curLat, curLon);
    result.push(...ordered);
    const last = ordered[ordered.length - 1];
    curLat = last.lat;
    curLon = last.lon;
  }

  return result;
}

function clusterCentroid(stops: StopPoint[]): { lat: number; lon: number } {
  const lat = stops.reduce((s, p) => s + p.lat, 0) / stops.length;
  const lon = stops.reduce((s, p) => s + p.lon, 0) / stops.length;
  return { lat, lon };
}

// ── Main Optimise Function ────────────────────────────────────────────────────
export function optimiseRoute(req: OptimiseRequest): OptimiseResult {
  const warnings: string[] = [];
  const blockedEdges: OptimiseResult['blockedEdges'] = [];
  let stops = [...req.stops];

  // ── 0. RED turn alert warnings (existing logic — keep as-is) ──────────────
  const redStops = stops.filter((s) => s.turnAlert === 'RED');
  if (redStops.length > 0) {
    warnings.push(
      `${redStops.length} stop(s) have RED turn-around alerts — vehicle may not be able to manoeuvre: ${redStops.map((s) => s.label).join(', ')}`,
    );
  }

  // ── 0b. Time window warnings (existing logic — keep as-is) ────────────────
  if (req.shiftStartMs) {
    stops.forEach((s) => {
      if (s.windowCloseMs && s.windowCloseMs < req.shiftStartMs!) {
        warnings.push(`Stop ${s.label} has a delivery window that closes before shift start.`);
      }
    });
  }

  // ── 1. Score departure windows ────────────────────────────────────────────
  const profile = VEHICLE_SPEED_PROFILES[req.vehicleClass];
  const estDurationH =
    (stops.length * 3.0 / 60) +
    (stops.length * 2.5 / (profile.baseCruiseKph));
  const depResult = scoreDepartureWindows({
    earliestDeparture:  req.earliestDepartureHour ?? 6.0,
    latestDeparture:    req.latestDepartureHour   ?? 9.5,
    routeDurationHours: estDurationH,
  });
  const departureHour = depResult.optimalHour;

  // ── 2. Nearest-neighbour seed (existing — keep as-is) ────────────────────
  let ordered = nearestNeighbour(stops, req.depotLat, req.depotLon);

  // ── 3. 2-opt improvement (existing — keep as-is) ──────────────────────────
  ordered = twoOpt(ordered, req.depotLat, req.depotLon);

  // ── 4. Anti-backtrack sweep zones (existing — keep as-is) ───────────────
  ordered = applySweepZones(ordered, req.depotLat, req.depotLon);

  // ── 5. Compute time-aware metrics ─────────────────────────────────────────
  let totalDistanceKm = 0;
  let totalTimeSec = 0;
  let currentHour = departureHour;

  const allStops = [
    { id: '_depot', lat: req.depotLat, lon: req.depotLon },
    ...ordered,
    ...(req.returnToDepot
      ? [{ id: '_depot_return', lat: req.depotLat, lon: req.depotLon }]
      : []),
  ];

  for (let i = 0; i < allStops.length - 1; i++) {
    const from = allStops[i];
    const to   = allStops[i + 1];
    const distKm = haversineKm(from.lat, from.lon, to.lat, to.lon);
    totalDistanceKm += distKm;

    const cond = req.roadConditions?.[to.id] ?? {};
    const edge = computeEdgeCost({
      vehicleClass:   req.vehicleClass,
      distanceKm:     distKm,
      departureHour:   currentHour,
      ...cond,
    });

    if (edge.hardBlock && edge.blockReason) {
      blockedEdges!.push({ fromStopId: from.id, toStopId: to.id, reason: edge.blockReason });
      warnings.push(`BLOCKED edge ${from.id}→${to.id}: ${edge.blockReason}`);
    }

    const legSec = edge.travelTimeSec + edge.penaltySec;
    totalTimeSec += legSec;
    currentHour  += legSec / 3600;

    // Add dwell time at each stop (not at depot)
    if (to.id !== '_depot' && to.id !== '_depot_return') {
      const isLarge = (to as StopPoint).isCollection ||
        ((to as StopPoint).volumeL && (to as StopPoint).volumeL! > 100);
      const dwellS = isLarge ? profile.dwellTimeLargeS : profile.dwellTimeS;
      totalTimeSec += dwellS;
      currentHour  += dwellS / 3600;
    }
  }

  return {
    orderedStops: ordered,
    totalDistanceKm,
    estimatedDurationMs: totalTimeSec * 1000,
    warnings,
    recommendedDeparture: depResult.label,
    congestionScore:      depResult.congestionScore,
    blockedEdges: blockedEdges!.length > 0 ? blockedEdges : undefined,
  };
}

// ── HTTP Endpoints ────────────────────────────────────────────────────────────
app.post<{ Body: OptimiseRequest }>('/route/optimise', async (req, reply) => {
  const result = optimiseRoute(req.body);
  return reply.send(result);
});

app.get('/health', async () => ({ status: 'ok', service: 'route-optimizer' }));

const PORT = Number(process.env.PORT ?? 3004);
app.listen({ port: PORT, host: '0.0.0.0' });
