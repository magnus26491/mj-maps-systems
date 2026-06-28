/**
 * POST /api/v1/navigate/leg
 *
 * Provides a single navigation leg (origin → destination) in the format
 * expected by apps/driver-app/lib/navigation.ts#fetchNavRoute().
 *
 * Resolution chain:
 *   1. Valhalla (VALHALLA_URL) — truck/van routing, encoded polyline, maneuvers
 *   2. Geoapify (GEOAPIFY_API_KEY) — routing for cars/vans when Valhalla unset
 *   3. Haversine stub — straight-line fallback; always works offline
 *
 * Keeping the key server-side means the client device never sees it.
 *
 * Stage 4/5: enables in-app turn-by-turn navigation + voice (expo-speech
 * is wired in useNavigation.ts and speaks each step automatically).
 */

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { requireAuth, requireTier } from '../middleware/auth.js';
import { VEHICLE_PROFILES } from '../../../packages/vehicle-profiles/index.js';
import { getRoadContext } from '../../osm/overpass-client.js';

const BodySchema = z.object({
  fromLat:       z.number(),
  fromLng:       z.number(),
  toLat:         z.number(),
  toLng:         z.number(),
  vehicleId:     z.string().default('lwb_van'),
  customHeightM: z.number().min(1.0).max(6.0).optional(),
});

interface NavStep {
  instruction:  string;
  distanceM:    number;
  durationSec:  number;
  bearing:      number;
  maneuver:     string;
}

interface NavRoute {
  steps:            NavStep[];
  totalDistanceM:   number;
  totalDurationSec: number;
  polyline:         { lat: number; lng: number }[];
}

// ── Valhalla ──────────────────────────────────────────────────────────────────

async function routeViaValhalla(
  fromLat: number, fromLng: number,
  toLat: number, toLng: number,
  vehicleId: string,
): Promise<NavRoute | null> {
  const VALHALLA_URL = process.env.VALHALLA_URL?.replace(/\/$/, '');
  if (!VALHALLA_URL) return null;

  const profile = VEHICLE_PROFILES[vehicleId];
  const isHeavy = profile ? profile.gvwT > 3.5 : false;
  const costing = isHeavy ? 'truck' : 'auto';

  const payload = {
    locations: [
      { lat: fromLat, lon: fromLng, type: 'break' },
      { lat: toLat,   lon: toLng,   type: 'break' },
    ],
    costing,
    directions_options: { units: 'kilometers', narrative: true },
  };

  try {
    const res = await fetch(`${VALHALLA_URL}/route`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as any;
    if (!data.trip?.legs?.[0]) return null;

    const leg = data.trip.legs[0];
    const polyline = decodeValhallaPolyline(leg.shape);

    const steps: NavStep[] = (leg.maneuvers ?? []).map((m: any) => ({
      instruction:  m.instruction ?? '',
      distanceM:    Math.round(m.length * 1000),
      durationSec:  m.time,
      bearing:      m.begin_heading ?? 0,
      maneuver:     valhallaTypeToManeuver(m.type),
    }));

    return {
      steps,
      totalDistanceM:   Math.round(data.trip.length * 1000),
      totalDurationSec: data.trip.time,
      polyline,
    };
  } catch {
    return null;
  }
}

function decodeValhallaPolyline(encoded: string, precision = 6): { lat: number; lng: number }[] {
  let index = 0, lat = 0, lng = 0;
  const coords: { lat: number; lng: number }[] = [];
  const factor = Math.pow(10, precision);
  while (index < encoded.length) {
    let b: number, shift = 0, result = 0;
    do { b = encoded.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
    lat += result & 1 ? ~(result >> 1) : result >> 1;
    shift = 0; result = 0;
    do { b = encoded.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
    lng += result & 1 ? ~(result >> 1) : result >> 1;
    coords.push({ lat: lat / factor, lng: lng / factor });
  }
  return coords;
}

function valhallaTypeToManeuver(type: number): string {
  const map: Record<number, string> = {
    0: 'straight', 1: 'depart', 4: 'arrive',
    8: 'continue', 9: 'turn-slight-right', 10: 'turn-right',
    11: 'turn-sharp-right', 14: 'turn-sharp-left', 15: 'turn-left',
    16: 'turn-slight-left', 25: 'merge', 26: 'roundabout',
  };
  return map[type] ?? 'straight';
}

// ── Geoapify fallback ─────────────────────────────────────────────────────────

async function routeViaGeoapify(
  fromLat: number, fromLng: number,
  toLat: number, toLng: number,
  vehicleId: string,
): Promise<NavRoute | null> {
  const key = process.env.GEOAPIFY_API_KEY;
  if (!key) return null;

  const profile = VEHICLE_PROFILES[vehicleId];
  const isHeavy = profile ? profile.gvwT > 3.5 : false;
  const mode = isHeavy ? 'truck' : 'drive';

  const url = `https://api.geoapify.com/v1/routing?waypoints=${fromLat},${fromLng}|${toLat},${toLng}&mode=${mode}&details=instruction_details&apiKey=${key}`;

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8_000) });
    if (!res.ok) return null;
    const data = (await res.json()) as any;
    const leg = data.features?.[0]?.properties?.legs?.[0];
    if (!leg) return null;

    const steps: NavStep[] = (leg.steps ?? []).map((s: any) => ({
      instruction:  s.instruction ?? '',
      distanceM:    Math.round(s.distance ?? 0),
      durationSec:  Math.round(s.time ?? 0),
      bearing:      s.bearing_before ?? 0,
      maneuver:     geoapifyToManeuver(s.action ?? ''),
    }));

    const polyline: { lat: number; lng: number }[] = (leg.geometry?.coordinates ?? [])
      .map(([lng, lat]: [number, number]) => ({ lat, lng }));

    return {
      steps,
      totalDistanceM:   Math.round(leg.distance ?? 0),
      totalDurationSec: Math.round(leg.time ?? 0),
      polyline,
    };
  } catch {
    return null;
  }
}

function geoapifyToManeuver(action: string): string {
  const map: Record<string, string> = {
    'turn-left': 'turn-left', 'turn-right': 'turn-right',
    'turn-sharp-left': 'turn-sharp-left', 'turn-sharp-right': 'turn-sharp-right',
    'turn-slight-left': 'turn-slight-left', 'turn-slight-right': 'turn-slight-right',
    'straight': 'straight', 'roundabout': 'roundabout',
    'exit-roundabout': 'exit-roundabout', 'u-turn': 'u-turn',
    'depart': 'depart', 'arrive': 'arrive',
  };
  return map[action] ?? 'straight';
}

// ── Haversine stub (always works) ─────────────────────────────────────────────

function routeHaversineStub(
  fromLat: number, fromLng: number,
  toLat: number, toLng: number,
): NavRoute {
  const R = 6_371_000;
  const dLat = (toLat - fromLat) * Math.PI / 180;
  const dLng = (toLng - fromLng) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(fromLat * Math.PI / 180) * Math.cos(toLat * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  const distM = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const speedMs = 10;  // ~36 km/h urban average
  const durationSec = Math.round(distM / speedMs);

  const bearing = Math.atan2(
    Math.sin((toLng - fromLng) * Math.PI / 180) * Math.cos(toLat * Math.PI / 180),
    Math.cos(fromLat * Math.PI / 180) * Math.sin(toLat * Math.PI / 180) -
    Math.sin(fromLat * Math.PI / 180) * Math.cos(toLat * Math.PI / 180) *
    Math.cos((toLng - fromLng) * Math.PI / 180),
  ) * 180 / Math.PI;

  return {
    steps: [
      {
        instruction: `Head ${compassDir(bearing)} for ${Math.round(distM)}m`,
        distanceM: Math.round(distM),
        durationSec,
        bearing: (bearing + 360) % 360,
        maneuver: 'depart',
      },
      {
        instruction: 'Arrive at destination',
        distanceM: 0,
        durationSec: 0,
        bearing: 0,
        maneuver: 'arrive',
      },
    ],
    totalDistanceM:   Math.round(distM),
    totalDurationSec: durationSec,
    polyline: [
      { lat: fromLat, lng: fromLng },
      { lat: toLat,   lng: toLng },
    ],
  };
}

function compassDir(deg: number): string {
  const d = ((deg % 360) + 360) % 360;
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  return dirs[Math.round(d / 45) % 8];
}

// ── Route plugin ──────────────────────────────────────────────────────────────

export const navigateLegRoute: FastifyPluginAsync = async (fastify) => {
  fastify.post<{ Body: z.infer<typeof BodySchema> }>(
    '/api/v1/navigate/leg',
    {
      preHandler: [requireAuth, requireTier('courier', 'fleet', 'enterprise')],
      schema: {
        body: {
          type: 'object',
          properties: {
            fromLat:   { type: 'number' },
            fromLng:   { type: 'number' },
            toLat:     { type: 'number' },
            toLng:     { type: 'number' },
            vehicleId: { type: 'string' },
          },
          required: ['fromLat', 'fromLng', 'toLat', 'toLng'],
        },
      },
    },
    async (request, reply) => {
      const parsed = BodySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ ok: false, error: parsed.error.message });
      }

      const { fromLat, fromLng, toLat, toLng, vehicleId, customHeightM } = parsed.data;

      const route =
        (await routeViaValhalla(fromLat, fromLng, toLat, toLng, vehicleId)) ??
        (await routeViaGeoapify(fromLat, fromLng, toLat, toLng, vehicleId)) ??
        routeHaversineStub(fromLat, fromLng, toLat, toLng);

      // Navigation guard — non-fatal restriction warnings for each step
      let guardWarnings: { stepIndex: number; severity: string; title: string; message: string }[] = [];
      try {
        const { guardNavigation } = await import('../../../services/_incubator/navigation-guard/index.js');
        const profile = VEHICLE_PROFILES[vehicleId];
        if (profile) {
          // Use custom height if driver set one (e.g. artic trailer override)
          const effectiveHeightM = customHeightM ?? profile.heightM;

          // Fetch real road restrictions for the destination segment (5s timeout)
          type RoadRestriction = { type: string; value?: string; description: string };
          let roadRestrictions: RoadRestriction[] = [];
          try {
            const ctx = await Promise.race([
              getRoadContext(toLat, toLng),
              new Promise<null>(r => setTimeout(() => r(null), 5_000)),
            ]);
            if (ctx?.road) {
              const road = ctx.road;
              if (road.maxWeightT != null && road.maxWeightT < profile.gvwT)
                roadRestrictions.push({ type: 'weight', value: `${road.maxWeightT}t`, description: `${road.name ?? 'Road'} — max weight ${road.maxWeightT}t` });
              if (road.maxHeightM != null && road.maxHeightM < effectiveHeightM)
                roadRestrictions.push({ type: 'height', value: `${road.maxHeightM}m`, description: `${road.name ?? 'Road'} — max height ${road.maxHeightM}m` });
              if (road.access && road.access !== 'yes' && road.access !== 'public')
                roadRestrictions.push({ type: 'access', description: `Access restricted: ${road.access}` });
            }
          } catch { /* Overpass unavailable — guard still runs with empty restrictions */ }

          const vehicleForGuard = {
            vehicleType: vehicleId,
            height: effectiveHeightM,
            weight: profile.gvwT,
            width:  profile.widthM,
            length: (profile as any).lengthM,
          };
          route.steps.forEach((step, i) => {
            const action = (step.maneuver === 'turn-left' || step.maneuver === 'turn-right'
              ? step.maneuver.replace('-', '_')
              : step.maneuver === 'u-turn' ? 'u_turn'
              : step.maneuver === 'arrive' ? 'arrive' : 'continue') as any;
            const result = guardNavigation({ action, road: step.instruction, distance: step.distanceM }, vehicleForGuard, roadRestrictions as any[]);
            if (!result.safe) {
              guardWarnings = guardWarnings.concat(
                result.warnings.map((w: any) => ({ stepIndex: i, severity: w.severity, title: w.title, message: w.message })),
              );
            }
          });
        }
      } catch {
        // guard is incubator code — never fail the route response
      }

      return reply.send({ ok: true, data: { ...route, guardWarnings } });
    },
  );
};
