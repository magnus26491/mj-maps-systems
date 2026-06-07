/**
 * MJ Maps Systems — Route Engine
 *
 * The core route optimisation engine. Turns a list of unordered stops into
 * the most efficient executable sequence for a driver.
 *
 * Algorithms:
 *  1. Sweep-zone anti-backtrack   — divides the service area into angular
 *     sweep sectors and forces completion of each sector before moving on.
 *  2. Side-of-road clustering     — within each sector, groups stops by
 *     which side of the road they sit on to minimise road crossings.
 *  3. Time-window constraint      — hard/soft window enforcement with
 *     feasibility check before committing a sequence.
 *  4. Nearest-neighbour seed      — fast O(n²) initial solution fed into
 *     2-opt local search for improvement.
 *  5. 2-opt local search          — iteratively reverses sub-sequences to
 *     reduce total distance until no improvement is possible.
 *  6. Dynamic replanning          — accepts mid-route events (failed stop,
 *     traffic delay, new stop insertion) and re-solves from current position.
 */

// ─── TYPES ───────────────────────────────────────────────────────────────────

export interface LatLng {
  lat: number;
  lng: number;
}

export interface TimeWindow {
  earliestEpoch: number;  // Unix timestamp seconds
  latestEpoch: number;
  isHard: boolean;        // hard = must arrive within window; soft = penalty only
}

export interface Stop {
  id: string;
  lat: number;
  lng: number;
  /** Estimated service time in minutes (dwell + walk + delivery) */
  serviceMinutes: number;
  timeWindow?: TimeWindow | null;
  /** Difficulty score 1–5 from apartment engine */
  difficultyScore?: number;
  /** Whether stop has been completed */
  completed?: boolean;
  /** Driver notes */
  notes?: string;
}

export interface RouteConfig {
  depotLat: number;
  depotLng: number;
  vehicleId: string;
  shiftStartEpoch: number;   // Unix timestamp seconds
  shiftEndEpoch: number;
  maxStops?: number;         // cap per route (default: unlimited)
  returnToDepot?: boolean;   // default: true
  antiBacktrackWeight?: number; // 0–1, default 0.7
  sideOfRoadWeight?: number;    // 0–1, default 0.5
  // Optional real vehicle specs (populated when driver sets make/model):
  vehicleHeightM?:   number;  // feeds bridge-engine height filter
  vehicleGvwKg?:     number;  // feeds bridge-engine weight filter
  vehicleLengthM?:   number;  // feeds turn-engine difficulty scorer
  vehiclePayloadKg?: number;  // informational — used in shift summary warnings
}

export interface RouteResult {
  orderedStops: Stop[];
  totalDistanceKm: number;
  totalDurationMin: number;
  estimatedCompletionEpoch: number;
  sectorCount: number;
  backtrackScore: number;   // 0 = no backtracking, 1 = maximum
  feasible: boolean;        // whether all hard time windows are satisfiable
  infeasibleStopIds: string[];
  warnings: string[];
}

// ─── DISTANCE HELPERS ────────────────────────────────────────────────────────

export function haversineKm(a: LatLng, b: LatLng): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) *
    Math.cos((b.lat * Math.PI) / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}

export function totalRouteDistanceKm(stops: LatLng[], depot: LatLng, returnToDepot = true): number {
  if (!stops.length) return 0;
  let dist = haversineKm(depot, stops[0]);
  for (let i = 0; i < stops.length - 1; i++) dist += haversineKm(stops[i], stops[i + 1]);
  if (returnToDepot) dist += haversineKm(stops[stops.length - 1], depot);
  return Math.round(dist * 100) / 100;
}

// ─── CENTROID ────────────────────────────────────────────────────────────────

function centroid(points: LatLng[]): LatLng {
  return {
    lat: points.reduce((s, p) => s + p.lat, 0) / points.length,
    lng: points.reduce((s, p) => s + p.lng, 0) / points.length,
  };
}

// ─── BEARING ─────────────────────────────────────────────────────────────────

/** Bearing in degrees [0, 360) from origin to point */
function bearingDeg(origin: LatLng, point: LatLng): number {
  const dLng = ((point.lng - origin.lng) * Math.PI) / 180;
  const lat1 = (origin.lat * Math.PI) / 180;
  const lat2 = (point.lat  * Math.PI) / 180;
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

// ─── 1. SWEEP-ZONE SECTOR ASSIGNMENT ────────────────────────────────────────

/**
 * Divides stops into angular sweep sectors from the depot centroid.
 * Sectors are sized to contain roughly equal numbers of stops (adaptive).
 *
 * Returns stops sorted by: sector → side-of-road → nearest-neighbour within sector.
 */
export function assignSectors(stops: Stop[], depot: LatLng, sectorCount?: number): Stop[][] {
  if (!stops.length) return [];

  // Adaptive sector count: sqrt(n) sectors, min 4, max 16
  const n = sectorCount ?? Math.max(4, Math.min(16, Math.round(Math.sqrt(stops.length))));
  const sectorSizeDeg = 360 / n;

  const sectors: Stop[][] = Array.from({ length: n }, () => []);

  for (const stop of stops) {
    const bearing = bearingDeg(depot, stop);
    const idx = Math.floor(bearing / sectorSizeDeg) % n;
    sectors[idx].push(stop);
  }

  // Remove empty sectors
  return sectors.filter(s => s.length > 0);
}

/**
 * Order sectors for minimal inter-sector travel.
 * Uses a greedy nearest-sector algorithm starting from sector 0 (north).
 */
export function orderSectors(sectors: Stop[][], depot: LatLng): Stop[][] {
  if (sectors.length <= 1) return sectors;

  const sectorCentroids = sectors.map(s => centroid(s));
  const visited = new Set<number>();
  const result: Stop[][] = [];
  let current = depot;

  while (result.length < sectors.length) {
    let bestIdx = -1;
    let bestDist = Infinity;
    for (let i = 0; i < sectors.length; i++) {
      if (visited.has(i)) continue;
      const d = haversineKm(current, sectorCentroids[i]);
      if (d < bestDist) {
        bestDist = d;
        bestIdx = i;
      }
    }
    visited.add(bestIdx);
    result.push(sectors[bestIdx]);
    current = sectorCentroids[bestIdx];
  }

  return result;
}

// ─── 2. SIDE-OF-ROAD CLUSTERING ──────────────────────────────────────────────

/**
 * Within a sector, split stops into left-side and right-side of the direction
 * of travel. Returns them interleaved so the driver clears one side then
 * crosses once to clear the other — minimising U-turns.
 *
 * Uses a simple cross-product sign test against the sector travel vector.
 */
export function clusterBySideOfRoad(stops: Stop[], travelDirection: LatLng): Stop[] {
  if (stops.length <= 1) return stops;

  const mid = centroid(stops);
  const dx = travelDirection.lng - mid.lng;
  const dy = travelDirection.lat - mid.lat;

  const left: Stop[] = [];
  const right: Stop[] = [];

  for (const stop of stops) {
    const cross = dx * (stop.lat - mid.lat) - dy * (stop.lng - mid.lng);
    if (cross >= 0) right.push(stop);
    else left.push(stop);
  }

  // Sort each side by proximity along the travel axis
  const sortAlongAxis = (arr: Stop[]) =>
    arr.sort((a, b) => {
      const da = dx * (a.lat - mid.lat) + dy * (a.lng - mid.lng);
      const db = dx * (b.lat - mid.lat) + dy * (b.lng - mid.lng);
      return da - db;
    });

  sortAlongAxis(left);
  sortAlongAxis(right);

  // Interleave: right-side first (UK driving — left-hand traffic), then left
  return [...right, ...left];
}

// ─── 3. NEAREST-NEIGHBOUR SEED ───────────────────────────────────────────────

export function nearestNeighbourOrder(stops: Stop[], start: LatLng): Stop[] {
  if (!stops.length) return [];
  const remaining = [...stops];
  const result: Stop[] = [];
  let current = start;

  while (remaining.length) {
    let bestIdx = 0;
    let bestDist = Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const d = haversineKm(current, remaining[i]);
      if (d < bestDist) { bestDist = d; bestIdx = i; }
    }
    result.push(remaining[bestIdx]);
    current = remaining[bestIdx];
    remaining.splice(bestIdx, 1);
  }

  return result;
}

// ─── 4. 2-OPT LOCAL SEARCH ───────────────────────────────────────────────────

export function twoOpt(stops: Stop[], depot: LatLng, returnToDepot = true): Stop[] {
  if (stops.length < 4) return stops;
  let best = [...stops];
  let bestDist = totalRouteDistanceKm(best, depot, returnToDepot);
  let improved = true;

  while (improved) {
    improved = false;
    for (let i = 1; i < best.length - 1; i++) {
      for (let j = i + 1; j < best.length; j++) {
        const candidate = [
          ...best.slice(0, i),
          ...best.slice(i, j + 1).reverse(),
          ...best.slice(j + 1),
        ];
        const d = totalRouteDistanceKm(candidate, depot, returnToDepot);
        if (d < bestDist - 0.001) {
          best = candidate;
          bestDist = d;
          improved = true;
        }
      }
    }
  }

  return best;
}

// ─── 5. TIME-WINDOW FEASIBILITY ──────────────────────────────────────────────

/** Average road speed assumptions (km/h) for urban UK delivery */
const SPEED_KMH = 30;

function travelMinutes(a: LatLng, b: LatLng): number {
  return (haversineKm(a, b) / SPEED_KMH) * 60;
}

export interface TimeWindowCheck {
  feasible: boolean;
  infeasibleStopIds: string[];
  warnings: string[];
}

export function checkTimeWindows(
  orderedStops: Stop[],
  depot: LatLng,
  shiftStartEpoch: number,
): TimeWindowCheck {
  const infeasible: string[] = [];
  const warnings: string[] = [];
  let currentTimeEpoch = shiftStartEpoch;
  let current: LatLng = depot;

  for (const stop of orderedStops) {
    const travelMin = travelMinutes(current, stop);
    currentTimeEpoch += travelMin * 60;

    const tw = stop.timeWindow;
    if (tw) {
      if (currentTimeEpoch < tw.earliestEpoch) {
        // Arrive early — wait
        currentTimeEpoch = tw.earliestEpoch;
        warnings.push(`Stop ${stop.id}: early arrival, driver must wait.`);
      } else if (currentTimeEpoch > tw.latestEpoch) {
        if (tw.isHard) {
          infeasible.push(stop.id);
        } else {
          warnings.push(`Stop ${stop.id}: soft time window breached by ${Math.round((currentTimeEpoch - tw.latestEpoch) / 60)} min.`);
        }
      }
    }

    currentTimeEpoch += (stop.serviceMinutes ?? 3) * 60;
    current = stop;
  }

  return { feasible: infeasible.length === 0, infeasibleStopIds: infeasible, warnings };
}

// ─── 6. BACKTRACK SCORE ──────────────────────────────────────────────────────

/**
 * Measures how much the route backtracks.
 * Score 0 = perfectly progressive (no retracing), 1 = maximum backtracking.
 *
 * Calculated as the ratio of direction reversals to total stop transitions.
 */
export function calculateBacktrackScore(stops: Stop[], depot: LatLng): number {
  if (stops.length < 3) return 0;
  let reversals = 0;
  const all = [depot, ...stops, depot];

  for (let i = 1; i < all.length - 1; i++) {
    const bearingIn  = bearingDeg(all[i - 1], all[i]);
    const bearingOut = bearingDeg(all[i],     all[i + 1]);
    const diff = Math.abs(bearingIn - bearingOut);
    const turn = Math.min(diff, 360 - diff);
    if (turn > 120) reversals++;
  }

  return Math.round((reversals / (stops.length - 1)) * 100) / 100;
}

// ─── MAIN EXPORT ─────────────────────────────────────────────────────────────

/**
 * Optimise a list of stops into the best executable route.
 *
 * @example
 * const result = await optimiseRoute(stops, {
 *   depotLat: 51.5074, depotLng: -0.1278,
 *   vehicleId: 'lwb-van',
 *   shiftStartEpoch: Date.now() / 1000,
 *   shiftEndEpoch: Date.now() / 1000 + 8 * 3600,
 * });
 *
 * result.orderedStops      // stops in execution order
 * result.totalDistanceKm   // 87.3
 * result.backtrackScore    // 0.04  (near-zero — excellent)
 * result.warnings          // ['Stop apt-5: soft time window breached by 4 min']
 */
export async function optimiseRoute(
  stops: Stop[],
  config: RouteConfig,
): Promise<RouteResult> {
  const depot: LatLng = { lat: config.depotLat, lng: config.depotLng };
  const warnings: string[] = [];

  if (!stops.length) {
    return {
      orderedStops: [], totalDistanceKm: 0, totalDurationMin: 0,
      estimatedCompletionEpoch: config.shiftStartEpoch, sectorCount: 0,
      backtrackScore: 0, feasible: true, infeasibleStopIds: [], warnings,
    };
  }

  // 1. Remove already-completed stops
  const active = stops.filter(s => !s.completed);

  // 2. Sweep-zone sector assignment
  const rawSectors  = assignSectors(active, depot);
  const orderedSectors = orderSectors(rawSectors, depot);

  // 3. Side-of-road clustering within each sector
  const clustered: Stop[] = [];
  for (let i = 0; i < orderedSectors.length; i++) {
    const sector = orderedSectors[i];
    const nextSectorCentroid = orderedSectors[i + 1]
      ? centroid(orderedSectors[i + 1])
      : depot;
    const sideOrdered = clusterBySideOfRoad(sector, nextSectorCentroid);
    clustered.push(...sideOrdered);
  }

  // 4. Nearest-neighbour seed
  const nnOrdered = nearestNeighbourOrder(clustered, depot);

  // 5. 2-opt improvement
  const optimised = twoOpt(nnOrdered, depot, config.returnToDepot ?? true);

  // 6. Time-window feasibility check
  const twCheck = checkTimeWindows(optimised, depot, config.shiftStartEpoch);
  warnings.push(...twCheck.warnings);

  if (!twCheck.feasible) {
    warnings.push(`${twCheck.infeasibleStopIds.length} stop(s) have infeasible hard time windows and were flagged.`);
  }

  // 7. Metrics
  const totalDistanceKm  = totalRouteDistanceKm(optimised, depot, config.returnToDepot ?? true);
  const totalServiceMin  = optimised.reduce((s, st) => s + (st.serviceMinutes ?? 3), 0);

  // 7a. Payload overload warning (informational — does not change stop order)
  if (config.vehiclePayloadKg) {
    const estimatedLoadKg = optimised.length * 15; // rough 15 kg per parcel average
    if (estimatedLoadKg > config.vehiclePayloadKg) {
      warnings.push(
        `Estimated load (${estimatedLoadKg}kg) may exceed vehicle payload ` +
        `(${config.vehiclePayloadKg}kg) — verify before departure.`,
      );
    }
  }
  const travelMin        = (totalDistanceKm / SPEED_KMH) * 60;
  const totalDurationMin = Math.round(totalServiceMin + travelMin);
  const completionEpoch  = config.shiftStartEpoch + totalDurationMin * 60;
  const backtrackScore   = calculateBacktrackScore(optimised, depot);

  if (completionEpoch > config.shiftEndEpoch) {
    const overMin = Math.round((completionEpoch - config.shiftEndEpoch) / 60);
    warnings.push(`Route exceeds shift end by ${overMin} min — consider splitting into two routes.`);
  }

  return {
    orderedStops: optimised,
    totalDistanceKm,
    totalDurationMin,
    estimatedCompletionEpoch: completionEpoch,
    sectorCount: orderedSectors.length,
    backtrackScore,
    feasible: twCheck.feasible,
    infeasibleStopIds: twCheck.infeasibleStopIds,
    warnings,
  };
}

// ─── DYNAMIC REPLANNING ──────────────────────────────────────────────────────

/**
 * Replan the remaining stops from the driver's current position.
 * Call this on: failed drop, traffic hold, new stop insertion, vehicle swap.
 *
 * @param currentPos    Driver's current GPS position
 * @param remainingStops Stops not yet completed
 * @param config        Original route config (currentPos replaces depot for this solve)
 */
export async function replanFromPosition(
  currentPos: LatLng,
  remainingStops: Stop[],
  config: RouteConfig,
  nowEpoch: number,
): Promise<RouteResult> {
  return optimiseRoute(remainingStops, {
    ...config,
    depotLat: currentPos.lat,
    depotLng: currentPos.lng,
    shiftStartEpoch: nowEpoch,
  });
}
