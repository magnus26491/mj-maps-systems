/**
 * MJ Maps Systems — Route Optimizer
 *
 * Solves stop sequencing before the OSM road enricher runs.
 * Designed so we can ship fast with a production heuristic now,
 * then swap in OR-Tools / VROOM later behind the same interface.
 *
 * Features in this first build:
 *  - Nearest-neighbour seed route
 *  - 2-opt improvement pass
 *  - Side-of-road penalty placeholder
 *  - Time-window support (soft)
 *  - Vehicle capacity placeholders
 *  - Anti-backtrack zone bias
 *  - Stop setback awareness hook (fed from property engine)
 */

export interface GeoPoint {
  lat: number;
  lng: number;
}

export interface TimeWindow {
  startMinutes: number; // minutes since midnight
  endMinutes: number;
}

export interface OptimizerStop extends GeoPoint {
  id: string;
  address: string;
  serviceMinutes?: number;
  timeWindow?: TimeWindow;
  priority?: number; // higher = earlier bias
  parcelCount?: number;
  totalWeightKg?: number;
  setbackFromRoadM?: number; // fed by property engine
  sideOfRoadHint?: 'LEFT' | 'RIGHT' | 'UNKNOWN';
  zoneHint?: string; // e.g. postcode sector / geo bucket
}

export interface OptimizeRouteParams {
  depot: GeoPoint;
  stops: OptimizerStop[];
  endDepot?: GeoPoint | null;
  startTimeMinutes?: number;
}

export interface OptimizedRoute {
  orderedStops: OptimizerStop[];
  totalDistanceM: number;
  estimatedDriveMinutes: number;
  estimatedServiceMinutes: number;
  estimatedTotalMinutes: number;
}

const AVG_DRIVE_SPEED_MPM = 550; // ~33 km/h blended local delivery speed
const DEFAULT_SERVICE_MIN = 1.5;

export function optimizeRoute(params: OptimizeRouteParams): OptimizedRoute {
  const { depot, stops, endDepot = depot } = params;
  if (!stops.length) {
    return {
      orderedStops: [],
      totalDistanceM: 0,
      estimatedDriveMinutes: 0,
      estimatedServiceMinutes: 0,
      estimatedTotalMinutes: 0,
    };
  }

  const seeded = nearestNeighbourSeed(depot, stops.slice());
  const improved = twoOptImprove(depot, seeded, endDepot);

  const totalDistanceM = routeDistance(depot, improved, endDepot);
  const estimatedDriveMinutes = totalDistanceM / AVG_DRIVE_SPEED_MPM;
  const estimatedServiceMinutes = improved.reduce(
    (sum, s) => sum + (s.serviceMinutes ?? DEFAULT_SERVICE_MIN) + setbackServicePenalty(s.setbackFromRoadM ?? 0),
    0,
  );

  return {
    orderedStops: improved,
    totalDistanceM,
    estimatedDriveMinutes,
    estimatedServiceMinutes,
    estimatedTotalMinutes: estimatedDriveMinutes + estimatedServiceMinutes,
  };
}

function nearestNeighbourSeed(origin: GeoPoint, remaining: OptimizerStop[]): OptimizerStop[] {
  const route: OptimizerStop[] = [];
  let current = origin;

  while (remaining.length) {
    let bestIdx = 0;
    let bestScore = Number.POSITIVE_INFINITY;

    for (let i = 0; i < remaining.length; i++) {
      const stop = remaining[i];
      const dist = haversineM(current.lat, current.lng, stop.lat, stop.lng);
      const score = dist
        + priorityBias(stop)
        + timeWindowBias(stop)
        + antiBacktrackBias(route, stop)
        + setbackBias(stop.setbackFromRoadM ?? 0);

      if (score < bestScore) {
        bestScore = score;
        bestIdx = i;
      }
    }

    const [next] = remaining.splice(bestIdx, 1);
    route.push(next);
    current = next;
  }

  return route;
}

function twoOptImprove(start: GeoPoint, route: OptimizerStop[], end: GeoPoint): OptimizerStop[] {
  let improved = route.slice();
  let changed = true;
  let iterations = 0;

  while (changed && iterations < 6) {
    changed = false;
    iterations++;

    for (let i = 0; i < improved.length - 2; i++) {
      for (let k = i + 1; k < improved.length - 1; k++) {
        const candidate = twoOptSwap(improved, i, k);
        if (routeDistance(start, candidate, end) < routeDistance(start, improved, end)) {
          improved = candidate;
          changed = true;
        }
      }
    }
  }

  return improved;
}

function twoOptSwap(route: OptimizerStop[], i: number, k: number): OptimizerStop[] {
  return [
    ...route.slice(0, i),
    ...route.slice(i, k + 1).reverse(),
    ...route.slice(k + 1),
  ];
}

function routeDistance(start: GeoPoint, stops: OptimizerStop[], end: GeoPoint): number {
  let total = 0;
  let prev: GeoPoint = start;

  for (const stop of stops) {
    total += haversineM(prev.lat, prev.lng, stop.lat, stop.lng);
    prev = stop;
  }

  total += haversineM(prev.lat, prev.lng, end.lat, end.lng);
  return total;
}

function priorityBias(stop: OptimizerStop): number {
  return stop.priority ? -stop.priority * 120 : 0;
}

function timeWindowBias(stop: OptimizerStop): number {
  if (!stop.timeWindow) return 0;
  return stop.timeWindow.startMinutes / 20;
}

function antiBacktrackBias(route: OptimizerStop[], stop: OptimizerStop): number {
  if (!route.length || !stop.zoneHint) return 0;
  const last = route[route.length - 1];
  if (!last.zoneHint) return 0;
  return last.zoneHint === stop.zoneHint ? -180 : 0;
}

function setbackBias(setbackM: number): number {
  if (setbackM <= 0) return 0;
  return setbackM * 0.6;
}

function setbackServicePenalty(setbackM: number): number {
  if (setbackM <= 10) return 0;
  if (setbackM <= 25) return 0.25;
  if (setbackM <= 50) return 0.6;
  if (setbackM <= 100) return 1.25;
  return 2.0;
}

function haversineM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6_371_000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
    Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
