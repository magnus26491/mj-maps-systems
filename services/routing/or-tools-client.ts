/**
 * OR-Tools VRP solver sidecar client.
 *
 * POSTs to ${ROUTE_SOLVER_URL}/solve and returns an ordered stop sequence.
 * Falls back to the TypeScript sequencer when ROUTE_SOLVER_URL is unset
 * or the sidecar is unreachable.
 */

import type { VrpInput, VrpResult, VrpSolver, MatrixResult } from './types.js';
import * as https from 'https';
import * as http from 'http';

function getRouteSolverUrl(): string | undefined {
  return process.env.ROUTE_SOLVER_URL?.replace(/\/$/, '');
}

interface SolverRequest {
  durations: number[][];        // depot + stops N×N (seconds)
  distances: number[][];        // depot + stops N×N (metres)
  service_times: number[];      // per node (seconds), index 0 = depot
  time_windows: [number, number][]; // per node [open, close] seconds from shift start
  depot_index: number;          // always 0
  time_limit_s: number;
}

interface SolverResponse {
  ordered_indices: number[];    // 0-based indices into the stops array (excl depot)
  total_duration_sec: number;
  total_distance_m: number;
  status: 'optimal' | 'feasible' | 'infeasible' | 'timeout';
}

function httpPost(url: string, body: string, timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const lib = u.protocol === 'https:' ? https : http;
    const opts = {
      hostname: u.hostname,
      port: u.port || (u.protocol === 'https:' ? 443 : 80),
      path: u.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    };
    const timer = setTimeout(() => reject(new Error(`OR-Tools sidecar timed out after ${timeoutMs}ms`)), timeoutMs);
    const req = lib.request(opts, (res) => {
      let data = '';
      res.on('data', (c: Buffer) => { data += c; });
      res.on('end', () => { clearTimeout(timer); resolve(data); });
    });
    req.on('error', (err: Error) => { clearTimeout(timer); reject(err); });
    req.write(body);
    req.end();
  });
}

/** Call the OR-Tools sidecar. Returns null if unavailable. */
async function callSidecar(req: SolverRequest, timeoutMs: number): Promise<SolverResponse | null> {
  const ROUTE_SOLVER_URL = getRouteSolverUrl();
  if (!ROUTE_SOLVER_URL) return null;
  try {
    const raw = await httpPost(`${ROUTE_SOLVER_URL}/solve`, JSON.stringify(req), timeoutMs);
    return JSON.parse(raw) as SolverResponse;
  } catch (err) {
    console.warn('[or-tools] Sidecar call failed:', (err as Error).message);
    return null;
  }
}

export class OrToolsClient implements VrpSolver {
  async solve(input: VrpInput, matrix: MatrixResult): Promise<VrpResult> {
    const t0 = Date.now();

    // Auto-scale time limit: 3s per sqrt(n) stops, min 5s, max 60s
    const n = input.stops.length;
    const autoLimitMs = Math.min(60_000, Math.max(5_000, 3_000 * Math.sqrt(n)));
    const timeLimitMs = input.timeLimitMs ?? autoLimitMs;

    // Build the solver request (depot is index 0)
    const nodes = [
      { lat: input.depot.lat, lng: input.depot.lng, serviceSeconds: 0, timeWindowOpen: 0, timeWindowClose: 86_400 },
      ...input.stops,
    ];
    const shiftStart = input.shiftStartEpoch;

    const serviceTimesSeconds = nodes.map((node, i) =>
      i === 0 ? 0 : (input.stops[i - 1].serviceSeconds ?? 300)
    );
    const timeWindows: [number, number][] = nodes.map((node, i) => {
      if (i === 0) return [0, 86_400];
      const stop = input.stops[i - 1];
      const open  = stop.timeWindowOpen  ? stop.timeWindowOpen  - shiftStart : 0;
      const close = stop.timeWindowClose ? stop.timeWindowClose - shiftStart : 86_400;
      return [Math.max(0, open), Math.max(open + 1, close)];
    });

    const req: SolverRequest = {
      durations: matrix.durations,
      distances: matrix.distances,
      service_times: serviceTimesSeconds,
      time_windows: timeWindows,
      depot_index: 0,
      time_limit_s: Math.round(timeLimitMs / 1000),
    };

    const response = await callSidecar(req, timeLimitMs + 5_000);
    if (!response || response.ordered_indices.length === 0) {
      return this.fallback(input, matrix, t0);
    }

    // Map solver indices back to stop IDs (solver uses 1-based stop index)
    const orderedIds = response.ordered_indices
      .filter(i => i > 0 && i <= input.stops.length)
      .map(i => input.stops[i - 1].id);

    return {
      orderedIds,
      totalDurationSec: response.total_duration_sec,
      totalDistanceM: response.total_distance_m,
      durationMs: Date.now() - t0,
      source: 'ortools',
    };
  }

  /** Nearest-neighbour greedy fallback when OR-Tools is unavailable */
  private fallback(input: VrpInput, matrix: MatrixResult, t0: number): VrpResult {
    const remaining = [...input.stops.map((_, i) => i + 1)]; // 1-based (0 = depot)
    const ordered: number[] = [];
    let current = 0; // depot

    while (remaining.length > 0) {
      const row = matrix.durations[current];
      let best = -1, bestDur = Infinity;
      for (const idx of remaining) {
        if (row[idx] < bestDur) { bestDur = row[idx]; best = idx; }
      }
      if (best === -1) break;
      ordered.push(best);
      remaining.splice(remaining.indexOf(best), 1);
      current = best;
    }

    const orderedIds = ordered.map(i => input.stops[i - 1].id);

    let totalDuration = 0, totalDistance = 0;
    let prev = 0;
    for (const idx of ordered) {
      totalDuration += matrix.durations[prev][idx] + (input.stops[idx - 1].serviceSeconds ?? 300);
      totalDistance += matrix.distances[prev][idx];
      prev = idx;
    }
    totalDuration += matrix.durations[prev][0];
    totalDistance += matrix.distances[prev][0];

    return {
      orderedIds,
      totalDurationSec: totalDuration,
      totalDistanceM: totalDistance,
      durationMs: Date.now() - t0,
      source: 'ts-sequencer',
    };
  }
}

export const orToolsClient = new OrToolsClient();
