/**
 * GET /api/v1/pois
 *
 * Returns nearby fuel stations and EV charging points from OpenStreetMap
 * via the Overpass API. Results are cached in Redis (5-minute TTL) to
 * avoid hammering Overpass during active navigation.
 *
 * Query params:
 *   lat    — driver latitude  (required)
 *   lng    — driver longitude (required)
 *   radius — search radius in metres (default 3000, max 8000)
 */
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { runOverpassQuery } from '../../osm/overpass-client.js';
import { redis } from '../../cache/index.js';

export interface FuelStation {
  id:           string;
  lat:          number;
  lng:          number;
  name:         string | null;
  brand:        string | null;
  openingHours: string | null;
}

export interface EVCharger {
  id:           string;
  lat:          number;
  lng:          number;
  name:         string | null;
  network:      string | null;
  capacity:     number | null;
  maxKw:        number | null;
  sockets:      string[];
  freeToUse:    boolean | null;
}

export interface POIResponse {
  fuel:        FuelStation[];
  evCharging:  EVCharger[];
  radiusM:     number;
  cachedAt:    string;
}

const QuerySchema = z.object({
  lat:    z.string().transform(Number).pipe(z.number().min(-90).max(90)),
  lng:    z.string().transform(Number).pipe(z.number().min(-180).max(180)),
  radius: z.string().optional().transform(v => Math.min(Number(v ?? 3000), 8000)),
});

// Round to 2 decimal places (~1.1km grid) for cache key
function cacheKey(lat: number, lng: number, radius: number): string {
  return `pois:${lat.toFixed(2)}:${lng.toFixed(2)}:${radius}`;
}

function extractSockets(tags: Record<string, string>): string[] {
  const knownSockets = [
    'type2', 'chademo', 'type1', 'type3', 'tesla_supercharger',
    'tesla_ccs', 'ccs', 'type2_combo',
  ];
  return knownSockets
    .filter(s => tags[`socket:${s}`] && tags[`socket:${s}`] !== 'no')
    .map(s => s.replace('_', ' ').toUpperCase());
}

function inferMaxKw(tags: Record<string, string>): number | null {
  if (tags.maxpower) {
    const kw = parseFloat(tags.maxpower.replace(/[^\d.]/g, ''));
    if (!isNaN(kw)) return kw;
  }
  // Check individual socket power ratings
  const socketPowers = Object.entries(tags)
    .filter(([k]) => k.startsWith('socket:') && k.endsWith(':power'))
    .map(([, v]) => parseFloat(v.replace(/[^\d.]/g, '')))
    .filter(v => !isNaN(v));
  if (socketPowers.length > 0) return Math.max(...socketPowers);
  return null;
}

function elementToLat(el: any): number {
  return el.type === 'way' ? el.center?.lat ?? 0 : el.lat ?? 0;
}

function elementToLng(el: any): number {
  return el.type === 'way' ? el.center?.lon ?? 0 : el.lon ?? 0;
}

async function fetchPOIs(lat: number, lng: number, radius: number): Promise<POIResponse> {
  const query = `
[out:json][timeout:15];
(
  node(around:${radius},${lat},${lng})[amenity=fuel];
  way(around:${radius},${lat},${lng})[amenity=fuel];
  node(around:${radius},${lat},${lng})[amenity=charging_station];
  way(around:${radius},${lat},${lng})[amenity=charging_station];
);
out center;
  `.trim();

  const data = await runOverpassQuery(query);
  const elements: any[] = data.elements ?? [];

  const fuel:       FuelStation[] = [];
  const evCharging: EVCharger[]   = [];

  for (const el of elements) {
    const tags: Record<string, string> = el.tags ?? {};
    const elLat = elementToLat(el);
    const elLng = elementToLng(el);
    if (!elLat || !elLng) continue;

    if (tags.amenity === 'fuel') {
      fuel.push({
        id:           `fuel_${el.id}`,
        lat:          elLat,
        lng:          elLng,
        name:         tags.name ?? null,
        brand:        tags.brand ?? tags.operator ?? null,
        openingHours: tags.opening_hours ?? null,
      });
    } else if (tags.amenity === 'charging_station') {
      evCharging.push({
        id:        `ev_${el.id}`,
        lat:       elLat,
        lng:       elLng,
        name:      tags.name ?? null,
        network:   tags.network ?? tags.operator ?? null,
        capacity:  tags.capacity ? parseInt(tags.capacity) : null,
        maxKw:     inferMaxKw(tags),
        sockets:   extractSockets(tags),
        freeToUse: tags.fee === 'no' ? true : tags.fee === 'yes' ? false : null,
      });
    }
  }

  return { fuel, evCharging, radiusM: radius, cachedAt: new Date().toISOString() };
}

export const poisRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get(
    '/api/v1/pois',
    {
      schema: {
        querystring: {
          type: 'object',
          required: ['lat', 'lng'],
          properties: {
            lat:    { type: 'string' },
            lng:    { type: 'string' },
            radius: { type: 'string' },
          },
        },
      },
    },
    async (request, reply) => {
      const parsed = QuerySchema.safeParse(request.query);
      if (!parsed.success) {
        return reply.status(400).send({ error: 'Invalid lat/lng parameters' });
      }

      const { lat, lng, radius } = parsed.data;
      const key = cacheKey(lat, lng, radius);

      try {
        const cached = await redis.get(key);
        if (cached) {
          return reply.send({ ok: true, data: JSON.parse(cached) });
        }
      } catch { /* Redis miss — continue to live fetch */ }

      let pois: POIResponse;
      try {
        pois = await fetchPOIs(lat, lng, radius);
      } catch (err) {
        fastify.log.error({ err }, 'POI Overpass fetch failed');
        return reply.status(503).send({ error: 'POI service temporarily unavailable' });
      }

      try {
        await redis.setex(key, 300, JSON.stringify(pois)); // 5-minute TTL
      } catch { /* non-fatal cache write failure */ }

      return reply.send({ ok: true, data: pois });
    },
  );
};
