/**
 * Cluster Engine — main entry point.
 *
 * Takes raw stops + config, returns:
 *  1. DBSCAN clusters with centroid + ordered stops
 *  2. Clusters ordered by nearest-neighbour from depot
 *  3. Flat orderedStops array ready for route-engine
 *  4. Estimated backtrack reduction percentage
 *
 * Anti-backtrack guarantee:
 *  All stops in cluster N are completed before any stop in cluster N+1.
 *  The driver never leaves a neighbourhood and comes back later.
 */
import { dbscan } from './dbscan';
import { haversineMetres, bearingDegrees } from './haversine';
import type { ClusterStop, Cluster, ClusterEngineConfig, ClusterResult } from './types';

// ─── Centroid ─────────────────────────────────────────────────────────────────
function centroid(stops: ClusterStop[]): { lat: number; lng: number } {
  const lat = stops.reduce((s, p) => s + p.lat, 0) / stops.length;
  const lng = stops.reduce((s, p) => s + p.lng, 0) / stops.length;
  return { lat, lng };
}

// ─── Nearest-neighbour cluster ordering ──────────────────────────────────────
// Greedy nearest-centroid from depot. Good enough at cluster scale (5-25 clusters).
function orderClusters(
  clusters: Cluster[],
  depotLat: number,
  depotLng: number,
): Cluster[] {
  const unvisited = [...clusters];
  const ordered:   Cluster[] = [];
  let curLat = depotLat;
  let curLng = depotLng;

  while (unvisited.length > 0) {
    let best = 0;
    let bestDist = Infinity;
    for (let i = 0; i < unvisited.length; i++) {
      const d = haversineMetres(curLat, curLng, unvisited[i].centroidLat, unvisited[i].centroidLng);
      if (d < bestDist) { bestDist = d; best = i; }
    }
    const chosen = unvisited.splice(best, 1)[0];
    ordered.push(chosen);
    curLat = chosen.centroidLat;
    curLng = chosen.centroidLng;
  }

  return ordered.map((c, i) => ({ ...c, orderIndex: i }));
}

// ─── Within-cluster stop ordering ────────────────────────────────────────────
// Nearest-neighbour from cluster entry point (previous cluster exit or depot).
function orderStopsInCluster(
  stops: ClusterStop[],
  entryLat: number,
  entryLng: number,
): ClusterStop[] {
  const unvisited = [...stops];
  const ordered:   ClusterStop[] = [];
  let curLat = entryLat;
  let curLng = entryLng;

  while (unvisited.length > 0) {
    let best = 0;
    let bestDist = Infinity;
    for (let i = 0; i < unvisited.length; i++) {
      const d = haversineMetres(curLat, curLng, unvisited[i].lat, unvisited[i].lng);
      if (d < bestDist) { bestDist = d; best = i; }
    }
    const chosen = unvisited.splice(best, 1)[0];
    // Calculate approach bearing from previous position
    const approachBearing = bearingDegrees(curLat, curLng, chosen.lat, chosen.lng);
    ordered.push({ ...chosen, approachBearing });
    curLat = chosen.lat;
    curLng = chosen.lng;
  }

  return ordered.map((s, i) => ({ ...s, clusterIndex: i }));
}

// ─── Backtrack reduction estimate ─────────────────────────────────────────────
// Rough estimate: compare clustered route distance to naive sequential distance.
function estimateBacktrackReduction(
  clusteredStops: ClusterStop[],
  originalStops: ClusterStop[],
): number {
  const routeDistance = (stops: ClusterStop[]) => {
    let d = 0;
    for (let i = 1; i < stops.length; i++) {
      d += haversineMetres(stops[i-1].lat, stops[i-1].lng, stops[i].lat, stops[i].lng);
    }
    return d;
  };

  const original   = routeDistance(originalStops);
  const clustered  = routeDistance(clusteredStops);
  if (original === 0) return 0;

  return Math.max(0, Math.round(((original - clustered) / original) * 100));
}

// ─── Main export ──────────────────────────────────────────────────────────────
export function clusterStops(
  stops: ClusterStop[],
  config: Partial<ClusterEngineConfig> & { depotLat: number; depotLng: number },
): ClusterResult {
  const cfg: ClusterEngineConfig = {
    epsilonMetres:  config.epsilonMetres  ?? 400,
    minPoints:      config.minPoints      ?? 2,
    depotLat:       config.depotLat,
    depotLng:       config.depotLng,
    sideOfRoadSort: config.sideOfRoadSort ?? true,
  };

  if (stops.length === 0) {
    return { clusters: [], orderedStops: [], totalClusters: 0, noiseStops: 0, estimatedBacktrackReductionPct: 0 };
  }

  // 1. DBSCAN
  const { labels, numClusters } = dbscan(stops, cfg.epsilonMetres, cfg.minPoints);

  // 2. Build cluster objects
  const clusterMap = new Map<number, ClusterStop[]>();
  stops.forEach((stop, i) => {
    const cid = labels[i];
    if (!clusterMap.has(cid)) clusterMap.set(cid, []);
    clusterMap.get(cid)!.push({ ...stop, clusterId: cid });
  });

  const noiseStops = clusterMap.get(-1)?.length ?? 0;

  // Treat each noise stop as its own single-stop cluster
  const noiseClusters: Cluster[] = (clusterMap.get(-1) ?? []).map((s, i) => ({
    id:          -(i + 1),
    centroidLat: s.lat,
    centroidLng: s.lng,
    stops:       [s],
    orderIndex:  0,
  }));

  const realClusters: Cluster[] = [];
  for (let cid = 0; cid < numClusters; cid++) {
    const clStops = clusterMap.get(cid) ?? [];
    const c = centroid(clStops);
    realClusters.push({
      id:          cid,
      centroidLat: c.lat,
      centroidLng: c.lng,
      stops:       clStops,
      orderIndex:  0,
    });
  }

  // 3. Order clusters by nearest-neighbour from depot
  const allClusters = [...realClusters, ...noiseClusters];
  const ordered = orderClusters(allClusters, cfg.depotLat, cfg.depotLng);

  // 4. Order stops within each cluster
  let entryLat = cfg.depotLat;
  let entryLng = cfg.depotLng;
  const orderedStops: ClusterStop[] = [];

  for (const cluster of ordered) {
    const sortedStops = orderStopsInCluster(cluster.stops, entryLat, entryLng);
    orderedStops.push(...sortedStops);
    // Next cluster entry = last stop in this cluster
    const last = sortedStops[sortedStops.length - 1];
    if (last) { entryLat = last.lat; entryLng = last.lng; }
    cluster.stops = sortedStops;
  }

  // 5. Estimate backtrack reduction vs original order
  const reductionPct = estimateBacktrackReduction(orderedStops, stops);

  return {
    clusters:    ordered,
    orderedStops,
    totalClusters:  numClusters,
    noiseStops,
    estimatedBacktrackReductionPct: reductionPct,
  };
}
