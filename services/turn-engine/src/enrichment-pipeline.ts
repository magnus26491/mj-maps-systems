/**
 * MJ Maps Systems — Enrichment Pipeline
 *
 * Runs after route optimisation. For each ordered stop:
 *   1. Fetch OSM road context via resolveTurnScore (Redis-first, Overpass fallback)
 *   2. Compute approach method via resolveApproach
 *   3. Assemble into EnrichedStopInput
 *   4. Store the full array in the API's in-memory route store
 *
 * Concurrency is capped at MAX_CONCURRENT (default 8) to avoid slamming
 * the Overpass public API. In production, swap the cache layer to Redis
 * so parallel deployments share lookups and the cap can be relaxed.
 *
 * Error strategy:
 *   • Each stop is enriched independently inside a try/catch.
 *   • A failed stop gets turn: null — the alert dispatcher skips null-turn
 *     stops cleanly, so one Overpass timeout never kills the whole route.
 *   • enrichRouteBackground() wraps enrichRoute() in a fire-and-forget
 *     promise that logs but never throws — safe to call from HTTP handlers.
 */

import { resolveTurnScore } from './resolver';
import { resolveApproach, type TurnScoreInput } from './approach-side';
import { setEnrichedRoute } from '../../api/driver-api';
import { VEHICLE_PROFILES } from '../../../packages/vehicle-profiles/index';
import type { EnrichedStopInput } from './alert-dispatcher';
import type { Stop } from '../../route-engine/route-engine';

// ─── CONFIG ────────────────────────────────────────────────────────────────

const MAX_CONCURRENT = 8;

// ─── HELPERS ───────────────────────────────────────────────────────────────

export function generateRouteId(
  vehicleId: string,
  depotLat: number,
  depotLng: number,
): string {
  const depotHash = Math.abs(
    Math.round(depotLat * 1e4) * 73856093 ^
    Math.round(depotLng * 1e4) * 19349663,
  ).toString(16).slice(0, 6);
  const epochSec = Math.floor(Date.now() / 1000).toString(36);
  return `${vehicleId}-${depotHash}-${epochSec}`;
}

async function withConcurrencyLimit<T>(
  tasks: Array<() => Promise<T>>,
  limit: number,
): Promise<T[]> {
  const results: T[] = new Array(tasks.length);
  let nextIdx = 0;

  async function worker(): Promise<void> {
    while (nextIdx < tasks.length) {
      const idx = nextIdx++;
      results[idx] = await tasks[idx]();
    }
  }

  const workers = Array.from({ length: Math.min(limit, tasks.length) }, worker);
  await Promise.all(workers);
  return results;
}

// ─── SINGLE-STOP ENRICHER ──────────────────────────────────────────────────

async function enrichStop(
  stop: Stop,
  sequence: number,
  vehicleId: string,
): Promise<EnrichedStopInput> {
  const fetchedAt = new Date().toISOString();

  try {
    const turnResult = await resolveTurnScore({ lat: stop.lat, lng: stop.lng, vehicleId });

    const vehicle = VEHICLE_PROFILES[vehicleId];
    if (!vehicle) throw new Error(`Unknown vehicleId: ${vehicleId}`);

    const roadWidthM = turnResult.segment?.widthM ?? null;

    // TurnEngineResult extends TurnScoreResult which lacks [key: string]: unknown.
    // TurnScoreInput requires that index signature. Double-cast via unknown is
    // safe here — the fields are a strict superset and we own both types.
    const approach = resolveApproach(
      turnResult as unknown as TurnScoreInput,
      vehicle,
      roadWidthM,
      {
        hasTurningHead:  turnResult.hasTurningHead,
        isDeadEnd:       turnResult.deadEndLengthM !== null,
        deadEndDepthM:   turnResult.deadEndLengthM ?? 0,
        stopLat:         stop.lat,
        stopLng:         stop.lng,
        incomingBearing: 0,
      },
    );

    const alertLevel = (turnResult.alert as string).toLowerCase() as 'green' | 'amber' | 'red';

    return {
      id:       stop.id,
      sequence,
      address:  stop.notes ?? `Stop ${stop.id}`,
      lat:      stop.lat,
      lng:      stop.lng,
      pin:      { lat: stop.lat, lng: stop.lng },
      turn: {
        alertLevel,
        approach: {
          turnAroundMethod:  approach.turnAroundMethod,
          alertDistanceM:    approach.alertDistanceM,
          preAlertWaypoint:  approach.preAlertWaypoint,
          message:           approach.message,
          confidence:        approach.confidence,
        },
      },
      osmContext: { fetchedAt },
    };
  } catch (err) {
    console.warn(
      `[enrichment-pipeline] Stop ${stop.id} failed enrichment:`,
      (err as Error).message,
    );
    return {
      id:       stop.id,
      sequence,
      address:  stop.notes ?? `Stop ${stop.id}`,
      lat:      stop.lat,
      lng:      stop.lng,
      pin:      null,
      turn:     null,
      osmContext: { fetchedAt },
    };
  }
}

// ─── MAIN EXPORT ───────────────────────────────────────────────────────────

export async function enrichRoute(
  stops: Stop[],
  vehicleId: string,
  routeId: string,
): Promise<EnrichedStopInput[]> {
  if (!stops.length) {
    setEnrichedRoute(routeId, []);
    return [];
  }

  const tasks = stops.map(
    (stop, i) => () => enrichStop(stop, i, vehicleId),
  );

  const enriched = await withConcurrencyLimit(tasks, MAX_CONCURRENT);
  setEnrichedRoute(routeId, enriched);
  return enriched;
}

export function enrichRouteBackground(
  stops: Stop[],
  vehicleId: string,
  routeId: string,
): void {
  enrichRoute(stops, vehicleId, routeId).catch(err => {
    console.error(
      `[enrichment-pipeline] Background enrichment failed for route ${routeId}:`,
      (err as Error).message,
    );
  });
}
