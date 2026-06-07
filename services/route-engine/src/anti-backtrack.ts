/**
 * MJ Maps Systems — Anti-Backtrack Engine
 *
 * FIX #4: Backtracking Routes
 *
 * Complaint: apps send drivers off a street, then back later in the route.
 * This is the single most common complaint across r/couriersofreddit.
 *
 * Solution:
 *   1. Zone-sweep ordering: complete all stops in a neighbourhood before moving on
 *   2. Direction cosine enforcement: penalise sharp bearing reversals
 *   3. Neighbourhood completion score: measure how much of each zone is done
 *      before the route leaves it (target: >90%)
 *   4. Post-solve audit: detect remaining backtrack pairs and flag them
 *
 * This module is applied POST 2-opt as a final check + re-sequence pass.
 */

import type { StopPoint, LatLng, SweepZone } from './types';

const DEG_PER_M = 1 / 111_000;

// ─── TYPES ────────────────────────────────────────────────────────────────────

export interface BacktrackEvent {
  atIndex: number;       // index in ordered array where backtrack occurs
  fromStopId: string;
  toStopId: string;
  bearingChange: number; // degrees — >120 is a significant reversal
  detourKm: number;      // estimated extra km caused by this backtrack
}

export interface AntiBacktrackResult {
  ordered: StopPoint[];
  backtracksRemoved: number;
  backtracksRemaining: BacktrackEvent[];
  zoneCompletionScores: ZoneCompletionScore[];
  totalDetourKmEliminated: number;
}

export interface ZoneCompletionScore {
  zoneId: string;
  stopsInZone: number;
  completedBeforeLeaving: number;
  completionPct: number;           // 0-100
  passes: number;                  // how many times the route enters/exits this zone
}

// ─── BEARING ─────────────────────────────────────────────────────────────────

function stopLatLng(s: StopPoint): LatLng {
  return { lat: s.pin?.lat ?? s.lat, lng: s.pin?.lng ?? s.lng };
}

function bearingDeg(from: LatLng, to: LatLng): number {
  const dLng = (to.lng - from.lng) * (Math.PI / 180);
  const fromLat = from.lat * (Math.PI / 180);
  const toLat   = to.lat   * (Math.PI / 180);
  const x = Math.sin(dLng) * Math.cos(toLat);
  const y = Math.cos(fromLat) * Math.sin(toLat)
          - Math.sin(fromLat) * Math.cos(toLat) * Math.cos(dLng);
  return ((Math.atan2(x, y) * (180 / Math.PI)) + 360) % 360;
}

function angularDiff(a: number, b: number): number {
  const diff = Math.abs(a - b) % 360;
  return diff > 180 ? 360 - diff : diff;
}

function distKm(a: LatLng, b: LatLng): number {
  const dLat = (b.lat - a.lat) * 111;
  const dLng = (b.lng - a.lng) * 111 * Math.cos(a.lat * Math.PI / 180);
  return Math.sqrt(dLat ** 2 + dLng ** 2);
}

// ─── ZONE MEMBERSHIP ─────────────────────────────────────────────────────────

function stopZoneId(stop: StopPoint, zones: SweepZone[]): string | null {
  for (const zone of zones) {
    if (zone.stopIds.includes(stop.id)) return zone.id;
  }
  return null;
}

// ─── BACKTRACK DETECTION ─────────────────────────────────────────────────────

export function detectBacktracks(
  ordered: StopPoint[],
  bearingThresholdDeg = 130,
): BacktrackEvent[] {
  const events: BacktrackEvent[] = [];

  for (let i = 1; i < ordered.length - 1; i++) {
    const prev  = stopLatLng(ordered[i - 1]);
    const curr  = stopLatLng(ordered[i]);
    const next  = stopLatLng(ordered[i + 1]);

    const b1 = bearingDeg(prev, curr);
    const b2 = bearingDeg(curr, next);
    const diff = angularDiff(b1, b2);

    if (diff >= bearingThresholdDeg) {
      // Estimate detour: extra distance vs going straight
      const directKm   = distKm(prev, next);
      const routedKm   = distKm(prev, curr) + distKm(curr, next);
      const detourKm   = Math.max(0, routedKm - directKm);

      events.push({
        atIndex:       i,
        fromStopId:    ordered[i].id,
        toStopId:      ordered[i + 1].id,
        bearingChange: diff,
        detourKm,
      });
    }
  }

  return events;
}

// ─── ZONE COMPLETION SCORING ─────────────────────────────────────────────────

export function scoreZoneCompletion(
  ordered: StopPoint[],
  zones: SweepZone[],
): ZoneCompletionScore[] {
  // Track how many stops per zone, and how many times the route enters/exits
  const zoneStopCount = new Map<string, number>();
  const zonePassCount = new Map<string, number>();
  let prevZoneId: string | null = null;

  for (const stop of ordered) {
    const zid = stopZoneId(stop, zones);
    if (!zid) continue;

    zoneStopCount.set(zid, (zoneStopCount.get(zid) ?? 0) + 1);

    if (zid !== prevZoneId) {
      zonePassCount.set(zid, (zonePassCount.get(zid) ?? 0) + 1);
      prevZoneId = zid;
    }
  }

  return zones.map(zone => {
    const total  = zoneStopCount.get(zone.id) ?? 0;
    const passes = zonePassCount.get(zone.id) ?? 0;
    // If passes === 1 the zone was completed in one sweep (perfect)
    // Completion % = 1 / passes (1 pass = 100%, 2 passes = 50%, etc.)
    const completedBeforeLeaving = passes <= 1 ? total : Math.round(total / passes);
    const completionPct = passes <= 1 ? 100 : Math.round(100 / passes);

    return {
      zoneId: zone.id,
      stopsInZone: total,
      completedBeforeLeaving,
      completionPct,
      passes,
    };
  });
}

// ─── ZONE-SWEEP RE-SEQUENCE ───────────────────────────────────────────────────

/**
 * Re-sequences stops to maximise zone completion before moving on.
 * Uses a greedy zone-then-nearest approach:
 *   1. Start at depot (or current position)
 *   2. Pick the nearest unvisited stop
 *   3. Complete ALL stops in the same zone before moving to any other zone
 *   4. Repeat until all stops are placed
 *
 * This is a post-2-opt pass — it may slightly increase total distance
 * but massively reduces backtracking and re-entry events.
 */
export function zoneSweepResequence(
  stops: StopPoint[],
  zones: SweepZone[],
  depotLat: number,
  depotLng: number,
): StopPoint[] {
  if (stops.length === 0) return [];

  const remaining = new Set(stops.map(s => s.id));
  const stopById = new Map(stops.map(s => [s.id, s]));
  const ordered: StopPoint[] = [];

  let curPos: LatLng = { lat: depotLat, lng: depotLng };

  while (remaining.size > 0) {
    // Find nearest unvisited stop from current position
    let nearestId: string | null = null;
    let nearestDist = Infinity;

    remaining.forEach(id => {
      const s = stopById.get(id)!;
      const d = distKm(curPos, stopLatLng(s));
      if (d < nearestDist) { nearestDist = d; nearestId = id; }
    });

    if (!nearestId) break;

    const anchorStop = stopById.get(nearestId)!;
    const anchorZoneId = stopZoneId(anchorStop, zones);

    if (!anchorZoneId) {
      // No zone — just add this stop and continue
      ordered.push(anchorStop);
      remaining.delete(nearestId);
      curPos = stopLatLng(anchorStop);
      continue;
    }

    // Complete the entire zone before moving on
    const zoneStopIds = zones
      .find(z => z.id === anchorZoneId)!
      .stopIds
      .filter(id => remaining.has(id));

    // Sort zone stops by nearest-neighbour from anchor
    let zonePos = curPos;
    const zoneStops = [...zoneStopIds].map(id => stopById.get(id)!);
    const zoneRemaining = new Set(zoneStops.map(s => s.id));

    while (zoneRemaining.size > 0) {
      let bestId: string | null = null;
      let bestDist = Infinity;

      zoneRemaining.forEach(id => {
        const s = stopById.get(id)!;
        const d = distKm(zonePos, stopLatLng(s));
        if (d < bestDist) { bestDist = d; bestId = id; }
      });

      if (!bestId) break;
      const next = stopById.get(bestId)!;
      ordered.push(next);
      remaining.delete(bestId);
      zoneRemaining.delete(bestId);
      zonePos = stopLatLng(next);
    }

    curPos = zonePos;
  }

  return ordered;
}

// ─── MAIN ENTRY POINT ────────────────────────────────────────────────────────

/**
 * Apply the full anti-backtrack pipeline to a solved route.
 * Returns the improved sequence with audit data.
 */
export function applyAntiBacktrack(
  ordered: StopPoint[],
  zones: SweepZone[],
  depotLat: number,
  depotLng: number,
): AntiBacktrackResult {
  // 1. Audit existing backtrack events
  const beforeEvents = detectBacktracks(ordered);
  const beforeDetour  = beforeEvents.reduce((s, e) => s + e.detourKm, 0);

  // 2. Re-sequence using zone sweep
  const resequenced = zoneSweepResequence(ordered, zones, depotLat, depotLng);

  // 3. Audit after re-sequence
  const afterEvents = detectBacktracks(resequenced);
  const afterDetour  = afterEvents.reduce((s, e) => s + e.detourKm, 0);

  // 4. Score zone completion
  const zoneScores = scoreZoneCompletion(resequenced, zones);

  return {
    ordered:                  resequenced,
    backtracksRemoved:        Math.max(0, beforeEvents.length - afterEvents.length),
    backtracksRemaining:      afterEvents,
    zoneCompletionScores:     zoneScores,
    totalDetourKmEliminated:  Math.max(0, beforeDetour - afterDetour),
  };
}
