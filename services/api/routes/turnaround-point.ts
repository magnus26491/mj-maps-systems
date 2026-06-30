/**
 * GET /api/v1/routes/turnaround-point
 *
 * Given a delivery stop coordinate and vehicle type, determines whether the
 * driver can safely turn around at that point and, if not, returns the nearest
 * viable alternative (turning circle, junction, or wider road access).
 *
 * Used by navigation.tsx when needsTurnaround is true so the U-turn marker
 * is placed at the real turning point rather than at the narrow stop.
 *
 * Query params:
 *   lat       number  — stop latitude
 *   lng       number  — stop longitude
 *   vehicleId string  — e.g. 'lwb_van' (defaults to 'lwb_van')
 *
 * Response:
 *   {
 *     tooNarrow:      boolean,
 *     turnaroundLat:  number | null,   // null when tooNarrow = false
 *     turnaroundLng:  number | null,
 *     distanceM:      number | null,
 *     reason:         string
 *   }
 */

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { VEHICLE_PROFILES } from '../../../packages/vehicle-profiles/index.js';
import { getRoadContext, runOverpassQuery } from '../../osm/overpass-client.js';

const QuerySchema = z.object({
  lat:       z.string().transform(Number),
  lng:       z.string().transform(Number),
  vehicleId: z.string().default('lwb_van'),
});

function haversineM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6_371_000;
  const toRad = (x: number) => x * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Find the nearest turning circle or turning loop via Overpass within searchRadiusM.
 * Returns [lat, lng] or null if none found.
 */
async function findNearestTurningNode(
  lat: number, lng: number, radiusM: number,
): Promise<{ lat: number; lng: number } | null> {
  const query = `
    [out:json][timeout:10];
    (
      node["highway"="turning_circle"](around:${radiusM},${lat},${lng});
      node["highway"="turning_loop"](around:${radiusM},${lat},${lng});
    );
    out body;
  `;
  try {
    const data = await runOverpassQuery(query);
    const nodes: any[] = (data?.elements ?? []).filter((e: any) => e.type === 'node');
    if (!nodes.length) return null;
    // Pick the nearest
    let best: { lat: number; lng: number } | null = null;
    let bestDist = Infinity;
    for (const n of nodes) {
      const d = haversineM(lat, lng, n.lat, n.lon);
      if (d < bestDist) { bestDist = d; best = { lat: n.lat, lng: n.lon }; }
    }
    return best;
  } catch {
    return null;
  }
}

/**
 * Find the nearest node on a wider road (residential+ class) via Overpass.
 * Approximated by getting the geometry of wider ways and picking the closest node.
 */
async function findNearestWiderRoad(
  lat: number, lng: number, radiusM: number, minWidthM: number,
): Promise<{ lat: number; lng: number } | null> {
  const query = `
    [out:json][timeout:10];
    (
      way["highway"~"^(primary|secondary|tertiary|residential|unclassified)$"](around:${radiusM},${lat},${lng});
    );
    out body geom;
  `;
  try {
    const data = await runOverpassQuery(query);
    const ways: any[] = (data?.elements ?? []).filter((e: any) => e.type === 'way');

    const HIGHWAY_WIDTH: Record<string, number> = {
      primary: 7.5, secondary: 6.5, tertiary: 5.5,
      residential: 5.0, unclassified: 5.0,
    };

    let best: { lat: number; lng: number } | null = null;
    let bestDist = Infinity;

    for (const way of ways) {
      const hw = way.tags?.highway ?? '';
      const inferredWidth = HIGHWAY_WIDTH[hw] ?? 5.0;
      const taggedWidth = way.tags?.width ? parseFloat(way.tags.width) : null;
      const effectiveWidth = taggedWidth ?? inferredWidth;
      if (effectiveWidth < minWidthM) continue;

      const geometry: Array<{ lat: number; lon: number }> = way.geometry ?? [];
      for (const pt of geometry) {
        const d = haversineM(lat, lng, pt.lat, pt.lon);
        if (d < bestDist) {
          bestDist = d;
          best = { lat: pt.lat, lng: pt.lon };
        }
      }
    }
    return best;
  } catch {
    return null;
  }
}

export const turnaroundPointRoute: FastifyPluginAsync = async (app) => {
  app.get('/api/v1/routes/turnaround-point', {
    preHandler: [requireAuth],
  }, async (request, reply) => {
    const parsed = QuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.code(400).send({ ok: false, error: 'lat, lng required' });
    }
    const { lat, lng, vehicleId } = parsed.data;

    if (isNaN(lat) || isNaN(lng)) {
      return reply.code(400).send({ ok: false, error: 'lat and lng must be valid numbers' });
    }

    const profile = VEHICLE_PROFILES[vehicleId as keyof typeof VEHICLE_PROFILES]
      ?? VEHICLE_PROFILES['lwb_van'];

    const MIN_TURNING_WIDTH_M = profile.minRoadWidthTurnM;
    const SEARCH_RADIUS_M = 500;

    let tooNarrow = false;
    let reason = 'Road is suitable for turning';

    try {
      // Phase 1: check road width at the stop (5s timeout so we don't block nav)
      const ctx = await Promise.race([
        getRoadContext(lat, lng),
        new Promise<null>(r => setTimeout(() => r(null), 5_000)),
      ]);

      if (ctx?.road) {
        const { widthM, highway, name, hasTurningHead } = ctx.road;

        if (hasTurningHead) {
          // Explicit turning circle/head at this node — always fine
          return reply.send({
            tooNarrow: false,
            turnaroundLat: null,
            turnaroundLng: null,
            distanceM: null,
            reason: `Turning head/circle at ${name ?? 'this location'}`,
          });
        }

        if (widthM < MIN_TURNING_WIDTH_M) {
          tooNarrow = true;
          reason = `${name ?? highway} is too narrow to turn around (${widthM.toFixed(1)}m — ${profile.label} needs ${MIN_TURNING_WIDTH_M}m)`;
        } else if (highway === 'service' || highway === 'track' || highway === 'path') {
          tooNarrow = true;
          reason = `${name ?? highway} may not have space for a safe ${profile.label} turnaround`;
        }
      }
    } catch {
      // Overpass unavailable — assume OK rather than block navigation
    }

    if (!tooNarrow) {
      return reply.send({
        tooNarrow: false,
        turnaroundLat: null,
        turnaroundLng: null,
        distanceM: null,
        reason,
      });
    }

    // Phase 2: find the nearest viable turning point
    const [turningNode, widerRoad] = await Promise.allSettled([
      findNearestTurningNode(lat, lng, SEARCH_RADIUS_M),
      findNearestWiderRoad(lat, lng, SEARCH_RADIUS_M, MIN_TURNING_WIDTH_M),
    ]);

    const candidateTurning = turningNode.status === 'fulfilled' ? turningNode.value : null;
    const candidateWider   = widerRoad.status   === 'fulfilled' ? widerRoad.value   : null;

    // Prefer an explicit turning circle; fall back to nearest wider road node
    let best: { lat: number; lng: number } | null = null;
    let bestDist: number | null = null;

    if (candidateTurning) {
      best = candidateTurning;
      bestDist = haversineM(lat, lng, candidateTurning.lat, candidateTurning.lng);
      reason = `Turn around at the turning circle${bestDist ? ` (${Math.round(bestDist)}m away)` : ''}`;
    } else if (candidateWider) {
      best = candidateWider;
      bestDist = haversineM(lat, lng, candidateWider.lat, candidateWider.lng);
      reason = `Turn around at the wider road ahead (${Math.round(bestDist ?? 0)}m away)`;
    } else {
      reason = 'No suitable turning point found nearby — reverse out carefully';
    }

    return reply.send({
      tooNarrow:     true,
      turnaroundLat: best?.lat ?? null,
      turnaroundLng: best?.lng ?? null,
      distanceM:     bestDist,
      reason,
    });
  });
};
