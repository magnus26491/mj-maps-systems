/**
 * Geocoding enrichment for stop intake.
 *
 * Called in the background after /api/v1/routes/optimise returns.
 * For each stop that carries a postcode and a persisted DB id, tries to
 * resolve a door-level pin and writes it to door_pin_* on the stops row.
 *
 * This is deliberately fire-and-forget — it never throws to the caller
 * and never delays the route-optimise response.
 */

import { geocodingProvider } from './geocoding-provider.js';
import { encodePlusCode } from './plus-codes-client.js';
import { pool } from '../db/index.js';

interface StopLike {
  id: string;
  lat: number;
  lng: number;
}

export async function enrichStopDoorPins(stops: StopLike[]): Promise<void> {
  if (!pool) return;  // guard against test environments with no DB

  for (const stop of stops) {
    const postcode: string | undefined = (stop as any).postcode;
    if (!postcode) continue;

    try {
      const candidates = await geocodingProvider.resolvePostcodeToCandidates(postcode);
      if (candidates.length === 0) continue;

      // Use the highest-confidence candidate
      const best = candidates[0];
      const plusCode = encodePlusCode(best.lat, best.lng);

      // Only update if the stop is persisted (id looks like a UUID)
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(stop.id);
      if (!isUuid) continue;

      await pool.query(
        `UPDATE stops SET
           door_pin_lat        = $1,
           door_pin_lng        = $2,
           door_pin_source     = $3,
           door_pin_confidence = $4,
           door_pin_updated_at = NOW()
         WHERE id = $5
           AND door_pin_lat IS NULL`,  // only set if not already resolved
        [best.lat, best.lng, best.source, best.confidence, stop.id],
      );
    } catch (err) {
      // per-stop errors are non-fatal
      console.warn(`[geocoding] enrichStopDoorPins stop=${stop.id}:`, (err as Error).message);
    }
  }
}
