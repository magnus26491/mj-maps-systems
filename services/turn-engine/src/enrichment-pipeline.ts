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
import { resolveApproach }  from './approach-side';
import { setEnrichedRoute } from '../../api/driver-api';
import type { EnrichedStopInput } from './alert-dispatcher';
import type { Stop } from '../../route-engine/route-engine';

// ─── CONFIG ─────────────────────────────────────────────────────────────────

/**
 * Max simultaneous Overpass requests per enrichment run.
 * 8 is safe for the public Overpass API without triggering 429s.
 * Raise to 20+ when using a private Overpass instance.
 */
const MAX_CONCURRENT = 8;

// ─── HELPERS ─────────────────────────────────────────────────────────────

/**
 * Generates a deterministic, URL-safe routeId from depot coords +
 * vehicleId + current Unix second. Collision probability at 1 route/sec
 * is effectively zero. Format: `{vehicleId}-{depotHash}-{epochSec}`.
 */
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

/**
 * Run a batch of async tasks with a maximum concurrency.
 * Equivalent to p-limit but with zero dependencies.
 */
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

// ─── SINGLE-STOP ENRICHER ────────────────────────────────────────────────────

async function enrichStop(
  stop: Stop,
  sequence: number,
  vehicleId: string,
): Promise<EnrichedStopInput> {
  const fetchedAt = new Date().toISOString();

  try {
    // 1. OSM road context + turn score
    const turnResult = await resolveTurnScore({ lat: stop.lat, lng: stop.lng, vehicleId });

    // 2. Approach method (which side, which manoeuvre, how far to warn)
    const approach = resolveApproach(turnResult);

    return {
      id:       stop.id,
      sequence,
      address:  stop.notes ?? `Stop ${stop.id}`,
      lat:      stop.lat,
      lng:      stop.lng,
      pin:      { lat: stop.lat, lng: stop.lng }, // replaced by W3W/building pin when available
      turn: {
        alertLevel: turnResult.alert.toLowerCase() as 'green' | 'amber' | 'red',
        approach: {
          turnAroundMethod:  approach.method,
          alertDistanceM:    approach.alertDistanceM,
          preAlertWaypoint:  approach.preAlertWaypoint,
          message:           approach.message,
          confidence:        approach.confidence,
        },
      },
      osmContext: {
        fetchedAt,
      },
    };
  } catch (err) {
    // Graceful per-stop fallback — null turn means alert-dispatcher skips it
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

// ─── MAIN EXPORT ─────────────────────────────────────────────────────────────

/**
 * Enrich all stops in a route and store the result.
 *
 * @param stops     Ordered stops from optimiseRoute result
 * @param vehicleId Vehicle profile ID (e.g. 'lwb_van', 'rigid_75t')
 * @param routeId   Stable ID used to retrieve enrichment from the store
 *
 * @returns EnrichedStopInput[] — same length as input, failed stops have turn:null
 */
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

  // Store so alert endpoints can serve immediately
  setEnrichedRoute(routeId, enriched);

  return enriched;
}

/**
 * Fire-and-forget wrapper for use inside HTTP handlers.
 *
 * Call this after returning the HTTP response — it does not block the client.
 * Errors are logged but never propagated.
 *
 * @example
 * reply.send(ok({ routeId, ...result }, t0));
 * enrichRouteBackground(result.orderedStops, vehicleId, routeId);
 */
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
