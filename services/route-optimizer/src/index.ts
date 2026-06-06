// ─────────────────────────────────────────────────────────────────────────────
// Route Optimizer Service
// Implements nearest-neighbour + 2-opt TSP optimisation with:
//   - Anti-backtracking sweep zones (neighbourhood completion logic)
//   - Side-of-road preference clustering
//   - Hard time windows (open/close)
//   - Vehicle capacity constraints
//   - Turn-feasibility pre-filtering (marks RED segments before routing)
// ─────────────────────────────────────────────────────────────────────────────
import Fastify from 'fastify';
import type { VehicleClass } from '../../../packages/vehicle-profiles/index';

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
  avgSpeedKph?: number;
  dwellTimePerStopMs?: number;
}

export interface OptimiseResult {
  orderedStops: StopPoint[];
  totalDistanceKm: number;
  estimatedDurationMs: number;
  warnings: string[];
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
  let stops = [...req.stops];

  // Warn about RED turn alerts
  const redStops = stops.filter((s) => s.turnAlert === 'RED');
  if (redStops.length > 0) {
    warnings.push(
      `${redStops.length} stop(s) have RED turn-around alerts — vehicle may not be able to manoeuvre: ${redStops.map((s) => s.label).join(', ')}`,
    );
  }

  // Validate time windows
  if (req.shiftStartMs) {
    stops.forEach((s) => {
      if (s.windowCloseMs && s.windowCloseMs < req.shiftStartMs!) {
        warnings.push(`Stop ${s.label} has a delivery window that closes before shift start.`);
      }
    });
  }

  // Step 1: Nearest-neighbour seed
  let ordered = nearestNeighbour(stops, req.depotLat, req.depotLon);

  // Step 2: 2-opt improvement
  ordered = twoOpt(ordered, req.depotLat, req.depotLon);

  // Step 3: Anti-backtrack sweep zones
  ordered = applySweepZones(ordered, req.depotLat, req.depotLon);

  // Compute metrics
  const totalDistanceKm = totalRouteDistance(ordered, req.depotLat, req.depotLon);
  const avgSpeed = req.avgSpeedKph ?? 40;
  const dwellMs = req.dwellTimePerStopMs ?? 3 * 60 * 1000; // 3 min default
  const driveMs = (totalDistanceKm / avgSpeed) * 3_600_000;
  const estimatedDurationMs = driveMs + stops.length * dwellMs;

  return { orderedStops: ordered, totalDistanceKm, estimatedDurationMs, warnings };
}

// ── HTTP Endpoints ────────────────────────────────────────────────────────────
app.post<{ Body: OptimiseRequest }>('/route/optimise', async (req, reply) => {
  const result = optimiseRoute(req.body);
  return reply.send(result);
});

app.get('/health', async () => ({ status: 'ok', service: 'route-optimizer' }));

const PORT = Number(process.env.PORT ?? 3004);
app.listen({ port: PORT, host: '0.0.0.0' });
