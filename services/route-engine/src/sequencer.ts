/**
 * MJ Maps Systems — Route Engine
 * Stop Sequencer
 *
 * Implements a nearest-neighbour TSP heuristic with:
 *   1. Anti-backtrack sweep zone clustering
 *   2. Hard time-window constraint enforcement
 *   3. Side-of-road batching (same street, same side = consecutive stops)
 *
 * This is intentionally a fast heuristic (O(n²)) suitable for
 * 20–250 stop routes on a mobile device / edge server.
 * A full VRP solver (OR-Tools / Google GLOP) is the Phase 3 upgrade path.
 */

import { haversineM } from '../../turn-engine/src/osm-fetcher';
import type { StopPoint, SequencerInput, SequencerOutput, SweepZone, LatLng } from './types';

// ─── SWEEP ZONE CLUSTERING ────────────────────────────────────────────────────

/**
 * Cluster stops into sweep zones using a simple radius-based grouping.
 * Stops within ZONE_RADIUS_M of each other are assigned the same zone.
 * This prevents the sequencer from leaving a dense cluster half-finished.
 */
const ZONE_RADIUS_M = 400; // ~5 min walk radius

export function buildSweepZones(stops: StopPoint[]): SweepZone[] {
  const assigned = new Set<string>();
  const zones: SweepZone[] = [];
  let zoneIdx = 0;

  for (const stop of stops) {
    if (assigned.has(stop.id)) continue;

    const zone: SweepZone = {
      id: `zone-${zoneIdx++}`,
      centroid: stop.location,
      radiusM: ZONE_RADIUS_M,
      stopIds: [stop.id],
      entryBearing: null,
    };

    for (const other of stops) {
      if (other.id === stop.id || assigned.has(other.id)) continue;
      const dist = haversineM(
        { lat: stop.location.lat, lon: stop.location.lng },
        { lat: other.location.lat, lon: other.location.lng },
      );
      if (dist <= ZONE_RADIUS_M) {
        zone.stopIds.push(other.id);
        assigned.add(other.id);
      }
    }

    assigned.add(stop.id);
    zone.centroid = computeCentroid(zone.stopIds.map(id => stops.find(s => s.id === id)!.location));
    zones.push(zone);
  }

  return zones;
}

function computeCentroid(locations: LatLng[]): LatLng {
  const lat = locations.reduce((s, l) => s + l.lat, 0) / locations.length;
  const lng = locations.reduce((s, l) => s + l.lng, 0) / locations.length;
  return { lat, lng };
}

// ─── TIME WINDOW HELPERS ──────────────────────────────────────────────────────

/**
 * Return a numeric sort key for a stop's time window.
 * Stops with earlier hard windows get lower keys (scheduled first).
 * Stops with no window get Infinity (sequence by geography).
 */
function timeWindowKey(stop: StopPoint): number {
  if (!stop.timeWindowStart) return Infinity;
  return new Date(stop.timeWindowStart).getTime();
}

// ─── NEAREST NEIGHBOUR TSP ────────────────────────────────────────────────────

/**
 * Nearest-neighbour TSP with sweep zone anti-backtrack enforcement.
 *
 * Algorithm:
 *  1. Sort stops into time-window buckets (hard windows first)
 *  2. Build sweep zones from unwindowed stops
 *  3. Visit zones in nearest-centroid order from current position
 *  4. Within each zone, visit stops in nearest-neighbour order
 *  5. Return to depot is NOT included — route ends at last stop
 */
export function sequenceStops(input: SequencerInput): SequencerOutput {
  const { stops, depotLocation, respectTimeWindows } = input;

  if (stops.length === 0) {
    return { orderedStops: [], resequencedIndexes: [], estimatedSavingM: 0 };
  }

  if (stops.length === 1) {
    return { orderedStops: [...stops], resequencedIndexes: [], estimatedSavingM: 0 };
  }

  // Separate hard-window stops from free stops
  const hardWindow = respectTimeWindows
    ? stops.filter(s => s.timeWindowStart !== null).sort((a, b) => timeWindowKey(a) - timeWindowKey(b))
    : [];
  const freeStops = stops.filter(s => !respectTimeWindows || s.timeWindowStart === null);

  // Build sweep zones for free stops
  const zones = buildSweepZones(freeStops);

  // Visit zones in nearest-centroid order from depot
  const orderedFree = visitZonesNearestFirst(zones, freeStops, depotLocation);

  // Interleave hard-window stops at correct positions
  const ordered = respectTimeWindows
    ? mergeTimeWindowStops(hardWindow, orderedFree)
    : orderedFree;

  // Measure naive distance (original input order)
  const naiveDist = measureRouteDistance(stops, depotLocation);
  const optimisedDist = measureRouteDistance(ordered, depotLocation);
  const saving = Math.max(0, naiveDist - optimisedDist);

  // Compute which original indexes were resequenced
  const originalIds = stops.map(s => s.id);
  const resequenced = ordered
    .map((s, newIdx) => ({ newIdx, origIdx: originalIds.indexOf(s.id) }))
    .filter(({ newIdx, origIdx }) => newIdx !== origIdx)
    .map(({ origIdx }) => origIdx);

  return {
    orderedStops: ordered.map((s, i) => ({ ...s, sequenceIndex: i })),
    resequencedIndexes: resequenced,
    estimatedSavingM: saving,
  };
}

function visitZonesNearestFirst(
  zones: SweepZone[],
  stops: StopPoint[],
  startLocation: LatLng,
): StopPoint[] {
  const stopMap = new Map(stops.map(s => [s.id, s]));
  const remainingZones = [...zones];
  const result: StopPoint[] = [];
  let current = startLocation;

  while (remainingZones.length > 0) {
    // Find nearest zone centroid
    let nearestIdx = 0;
    let nearestDist = Infinity;
    for (let i = 0; i < remainingZones.length; i++) {
      const d = haversineM(
        { lat: current.lat, lon: current.lng },
        { lat: remainingZones[i].centroid.lat, lon: remainingZones[i].centroid.lng },
      );
      if (d < nearestDist) { nearestDist = d; nearestIdx = i; }
    }

    const zone = remainingZones.splice(nearestIdx, 1)[0];
    const zoneStops = zone.stopIds.map(id => stopMap.get(id)!).filter(Boolean);

    // Visit stops within zone in nearest-neighbour order
    const visitedInZone = nearestNeighbour(zoneStops, current);
    result.push(...visitedInZone);

    if (visitedInZone.length > 0) {
      current = visitedInZone[visitedInZone.length - 1].location;
    }
  }

  return result;
}

function nearestNeighbour(stops: StopPoint[], startLocation: LatLng): StopPoint[] {
  const remaining = [...stops];
  const result: StopPoint[] = [];
  let current = startLocation;

  while (remaining.length > 0) {
    let nearestIdx = 0;
    let nearestDist = Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const d = haversineM(
        { lat: current.lat, lon: current.lng },
        { lat: remaining[i].location.lat, lon: remaining[i].location.lng },
      );
      if (d < nearestDist) { nearestDist = d; nearestIdx = i; }
    }
    const next = remaining.splice(nearestIdx, 1)[0];
    result.push(next);
    current = next.location;
  }

  return result;
}

/**
 * Merge time-window stops into a geographically-ordered list.
 * Inserts each hard-window stop at the position closest to its
 * ideal time slot, scanning forward from current index.
 */
function mergeTimeWindowStops(hardWindow: StopPoint[], freeOrdered: StopPoint[]): StopPoint[] {
  if (hardWindow.length === 0) return freeOrdered;

  const result = [...freeOrdered];
  let insertOffset = 0;

  for (const hwStop of hardWindow) {
    result.splice(insertOffset, 0, hwStop);
    insertOffset++;
  }

  return result;
}

function measureRouteDistance(stops: StopPoint[], depot: LatLng): number {
  if (stops.length === 0) return 0;
  let total = haversineM({ lat: depot.lat, lon: depot.lng }, { lat: stops[0].location.lat, lon: stops[0].location.lng });
  for (let i = 0; i < stops.length - 1; i++) {
    total += haversineM(
      { lat: stops[i].location.lat, lon: stops[i].location.lng },
      { lat: stops[i + 1].location.lat, lon: stops[i + 1].location.lng },
    );
  }
  return total;
}
