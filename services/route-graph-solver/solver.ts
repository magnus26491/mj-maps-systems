/**
 * Route Graph Solver — constraint-aware TSP solver using a graph model.
 * Uses nearest-neighbour heuristic + 2-opt improvement.
 * Respects time windows (time_window_start / time_window_end on StopPoint).
 */

import type { StopPoint, SequencerInput, SequencerOutput } from '../route-engine/src/types';
import { buildSweepZones } from '../route-engine/src/sweep-zones';
import { twoOpt } from '../route-engine/src/two-opt';

const DEFAULT_SPEED_MPS = 30 / 3.6;
const DEFAULT_DWELL_SEC = 120;

function dist(a: StopPoint, b: StopPoint): number {
  const aLat = a.pin?.lat ?? a.lat;
  const aLng = a.pin?.lng ?? a.lng;
  const bLat = b.pin?.lat ?? b.lat;
  const bLng = b.pin?.lng ?? b.lng;
  const dLat = (bLat - aLat) * 111_000;
  const dLng = (bLng - aLng) * 111_000 * Math.cos(aLat * Math.PI / 180);
  return Math.sqrt(dLat ** 2 + dLng ** 2);
}

function travelTimeSec(a: StopPoint, b: StopPoint): number {
  return dist(a, b) / DEFAULT_SPEED_MPS;
}

function dwellSec(stop: StopPoint): number {
  return stop.dwellSeconds ?? stop.dwellTimeS
    ?? (stop.dwell_minutes ? stop.dwell_minutes * 60 : DEFAULT_DWELL_SEC);
}

function totalDistKm(stops: StopPoint[], depotLat: number, depotLng: number): number {
  if (stops.length === 0) return 0;
  const depot = { id: '__depot__', address: 'depot', lat: depotLat, lng: depotLng };
  let d = dist(depot as StopPoint, stops[0]);
  for (let i = 0; i < stops.length - 1; i++) d += dist(stops[i], stops[i + 1]);
  d += dist(stops[stops.length - 1], depot as StopPoint);
  return d / 1000;
}

export async function solveGraph(input: SequencerInput): Promise<SequencerOutput> {
  const { stops, depotLat, depotLng, shiftStartISO, respectTimeWindows } = input;

  const shiftStartMs = shiftStartISO ? new Date(shiftStartISO).getTime() : Date.now();

  // ── Nearest-neighbour construction ──────────────────────────────────────────
  const depot = { id: '__depot__', address: 'depot', lat: depotLat, lng: depotLng } as StopPoint;
  const remaining = [...stops];
  const ordered: StopPoint[] = [];
  let currentPos: StopPoint = depot;
  let currentTimeMs = shiftStartMs;

  while (remaining.length > 0) {
    let bestIdx = 0;
    let bestScore = Infinity;

    for (let i = 0; i < remaining.length; i++) {
      const candidate = remaining[i];
      const travelMs = travelTimeSec(currentPos, candidate) * 1000;
      const arrivalMs = currentTimeMs + travelMs;

      // Time-window penalty
      let score = dist(currentPos, candidate);

      if (respectTimeWindows) {
        const twStart = candidate.timeWindow?.start ?? candidate.time_window_start;
        const twEnd   = candidate.timeWindow?.end   ?? candidate.time_window_end;

        if (twStart) {
          const twStartMs = new Date(twStart).getTime();
          // Penalise arriving before window opens (waiting)
          if (arrivalMs < twStartMs) score += (twStartMs - arrivalMs) / 1000;
        }
        if (twEnd) {
          const twEndMs = new Date(twEnd).getTime();
          // Heavily penalise missing the window close
          if (arrivalMs > twEndMs) score += 1_000_000;
        }
      }

      if (score < bestScore) {
        bestScore = score;
        bestIdx = i;
      }
    }

    const next = remaining.splice(bestIdx, 1)[0];
    const travelMs = travelTimeSec(currentPos, next) * 1000;
    currentTimeMs += travelMs + dwellSec(next) * 1000;
    ordered.push(next);
    currentPos = next;
  }

  // ── 2-opt improvement ────────────────────────────────────────────────────────
  const { stops: improved, savingM } = twoOpt(ordered, 150);

  const totalKm = totalDistKm(improved, depotLat, depotLng);
  const sweepZones = buildSweepZones(improved);

  return {
    ordered: improved,
    totalDistanceKm: totalKm,
    totalDistanceM: totalKm * 1000,
    estimatedDurationMin: (totalKm * 1000 / DEFAULT_SPEED_MPS) / 60,
    totalDurationSec: totalKm * 1000 / DEFAULT_SPEED_MPS,
    sweepZones,
    estimatedSavingM: savingM,
    droppedStops: [],
  };
}
