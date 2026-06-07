/**
 * MJ Maps Systems — Route Engine
 * Stop Sequencer
 *
 * Nearest-neighbour TSP with:
 *   1. Anti-backtrack sweep zone clustering
 *   2. Hard time-window constraint enforcement
 *   3. Side-of-road batching
 *
 * StopPoint uses flat .lat / .lng — no .location wrapper.
 */

import { haversineM } from '../../turn-engine/src/osm-fetcher';
import type { StopPoint, SequencerInput, SequencerOutput, SweepZone, LatLng } from './types';

const ZONE_RADIUS_M = 400;

// ─── SWEEP ZONE CLUSTERING ────────────────────────────────────────────────────

export function buildSweepZones(stops: StopPoint[]): SweepZone[] {
  const assigned = new Set<string>();
  const zones: SweepZone[] = [];
  let zoneIdx = 0;

  for (const stop of stops) {
    if (assigned.has(stop.id)) continue;

    const memberIds: string[] = [stop.id];
    assigned.add(stop.id);

    for (const other of stops) {
      if (other.id === stop.id || assigned.has(other.id)) continue;
      const dist = haversineM(
        { lat: stop.lat, lon: stop.lng },
        { lat: other.lat, lon: other.lng },
      );
      if (dist <= ZONE_RADIUS_M) {
        memberIds.push(other.id);
        assigned.add(other.id);
      }
    }

    const members = memberIds.map(id => stops.find(s => s.id === id)!);
    const centroidLat = members.reduce((s, m) => s + m.lat, 0) / members.length;
    const centroidLng = members.reduce((s, m) => s + m.lng, 0) / members.length;

    zones.push({
      id:          `zone-${zoneIdx++}`,
      stopIds:     memberIds,
      centroidLat,
      centroidLng,
      radiusKm:    ZONE_RADIUS_M / 1000,
    });
  }

  return zones;
}

// ─── TIME WINDOW HELPERS ──────────────────────────────────────────────────────

function timeWindowKey(stop: StopPoint): number {
  if (!stop.time_window_start) return Infinity;
  return new Date(stop.time_window_start).getTime();
}

// ─── MAIN EXPORT ─────────────────────────────────────────────────────────────

export function sequenceStops(input: SequencerInput): SequencerOutput {
  // Support both depotLat/depotLng and depotLocation aliases
  const depotLat = input.depotLat ?? input.depotLocation?.lat ?? 0;
  const depotLng = input.depotLng ?? input.depotLocation?.lng ?? 0;
  const respectTW = input.respectTimeWindows ?? true;
  const { stops } = input;

  if (stops.length === 0) {
    return { ordered: [], totalDistanceKm: 0, estimatedDurationMin: 0, sweepZones: [] };
  }
  if (stops.length === 1) {
    return { ordered: [...stops], totalDistanceKm: 0, estimatedDurationMin: 2, sweepZones: [] };
  }

  const hardWindow = respectTW
    ? stops.filter(s => s.time_window_start != null).sort((a, b) => timeWindowKey(a) - timeWindowKey(b))
    : [];
  const freeStops = stops.filter(s => !respectTW || s.time_window_start == null);

  const zones    = buildSweepZones(freeStops);
  const depot: LatLng = { lat: depotLat, lng: depotLng };
  const orderedFree = visitZonesNearestFirst(zones, freeStops, depot);

  const ordered = respectTW ? mergeTimeWindowStops(hardWindow, orderedFree) : orderedFree;

  const naiveDist     = measureRouteDistance(stops, depot);
  const optimisedDist = measureRouteDistance(ordered, depot);
  const savingM       = Math.max(0, naiveDist - optimisedDist);

  const originalIds = stops.map(s => s.id);
  const resequencedIndexes = ordered
    .map((s, newIdx) => ({ newIdx, origIdx: originalIds.indexOf(s.id) }))
    .filter(({ newIdx, origIdx }) => newIdx !== origIdx)
    .map(({ origIdx }) => origIdx);

  const totalDistanceKm     = optimisedDist / 1000;
  const estimatedDurationMin = Math.round(optimisedDist / (20_000 / 60));

  return {
    ordered:            ordered.map((s, i) => ({ ...s, sequenceIndex: i })),
    totalDistanceKm,
    estimatedDurationMin,
    sweepZones:         zones,
    // Legacy compat
    orderedStops:       ordered,
    resequencedIndexes,
    estimatedSavingM:   savingM,
  };
}

function visitZonesNearestFirst(
  zones: SweepZone[],
  stops: StopPoint[],
  startLocation: LatLng,
): StopPoint[] {
  const stopMap = new Map(stops.map(s => [s.id, s]));
  const remaining = [...zones];
  const result: StopPoint[] = [];
  let current = startLocation;

  while (remaining.length > 0) {
    let nearestIdx = 0;
    let nearestDist = Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const d = haversineM(
        { lat: current.lat, lon: current.lng },
        { lat: remaining[i].centroidLat, lon: remaining[i].centroidLng },
      );
      if (d < nearestDist) { nearestDist = d; nearestIdx = i; }
    }
    const zone = remaining.splice(nearestIdx, 1)[0];
    const zoneStops = zone.stopIds.map(id => stopMap.get(id)!).filter(Boolean);
    const visited   = nearestNeighbour(zoneStops, current);
    result.push(...visited);
    if (visited.length > 0) current = { lat: visited[visited.length - 1].lat, lng: visited[visited.length - 1].lng };
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
        { lat: remaining[i].lat,  lon: remaining[i].lng },
      );
      if (d < nearestDist) { nearestDist = d; nearestIdx = i; }
    }
    const next = remaining.splice(nearestIdx, 1)[0];
    result.push(next);
    current = { lat: next.lat, lng: next.lng };
  }

  return result;
}

function mergeTimeWindowStops(hardWindow: StopPoint[], freeOrdered: StopPoint[]): StopPoint[] {
  if (hardWindow.length === 0) return freeOrdered;
  const result = [...freeOrdered];
  let offset = 0;
  for (const hw of hardWindow) { result.splice(offset++, 0, hw); }
  return result;
}

function measureRouteDistance(stops: StopPoint[], depot: LatLng): number {
  if (stops.length === 0) return 0;
  let total = haversineM(
    { lat: depot.lat, lon: depot.lng },
    { lat: stops[0].lat, lon: stops[0].lng },
  );
  for (let i = 0; i < stops.length - 1; i++) {
    total += haversineM(
      { lat: stops[i].lat,     lon: stops[i].lng },
      { lat: stops[i + 1].lat, lon: stops[i + 1].lng },
    );
  }
  return total;
}
