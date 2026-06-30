/**
 * PAF Lookup — /api/v1/paf/lookup?postcode=SO15+3SP
 *
 * Returns all addresses within a UK postcode unit.
 *
 * Resolution order:
 *   1. OS Places API (UPRN-level, requires OS_PLACES_KEY)
 *   2. Nominatim (OSM, free, no key needed — street-level precision)
 *   3. postcodes.io centroid (last resort — one result at postcode centre)
 */

import type { FastifyPluginAsync } from 'fastify';
import { requireAuth } from '../middleware/auth.js';
import { osPlacesPostcodeCandidates } from '../../geocoding/os-places-client.js';

const NOMINATIM = process.env.NOMINATIM_URL ?? 'https://nominatim.openstreetmap.org';
const POSTCODES_IO = 'https://api.postcodes.io';
const FETCH_TIMEOUT = 8_000;

interface PafAddress {
  line1:       string;
  line2?:      string;
  postTown:    string;
  postcode:    string;
  fullAddress: string;
  lat:         number;
  lng:         number;
  uprn?:       string;
  confidence?: number;
  source?:     string;
}

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT),
      headers: { 'Accept': 'application/json', 'User-Agent': 'MJMaps/1.0 (contact@mjmaps.co.uk)' },
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

interface NominatimResult {
  lat: string;
  lon: string;
  display_name: string;
  address?: {
    house_number?: string;
    road?: string;
    suburb?: string;
    town?: string;
    city?: string;
    postcode?: string;
  };
}

async function lookupViaNominatim(postcode: string): Promise<PafAddress[]> {
  const url = `${NOMINATIM}/search?postalcode=${encodeURIComponent(postcode)}&countrycodes=gb&format=jsonv2&addressdetails=1&limit=50`;
  const results = await fetchJson<NominatimResult[]>(url);
  if (!results?.length) return [];

  return results
    .filter(r => r.address?.road)
    .map(r => {
      const a = r.address!;
      const line1 = [a.house_number, a.road].filter(Boolean).join(' ');
      const postTown = a.city ?? a.town ?? a.suburb ?? '';
      const pc = a.postcode ?? postcode;
      const full = [line1, postTown, pc].filter(Boolean).join(', ');
      return {
        line1,
        postTown,
        postcode: pc,
        fullAddress: full,
        lat: parseFloat(r.lat),
        lng: parseFloat(r.lon),
        source: 'nominatim',
        confidence: 0.7,
      };
    })
    .filter(a => a.line1);
}

async function lookupViaCentroid(postcode: string): Promise<PafAddress[]> {
  const url = `${POSTCODES_IO}/postcodes/${encodeURIComponent(postcode)}`;
  const data = await fetchJson<{ result?: { latitude: number; longitude: number; admin_district?: string } }>(url);
  if (!data?.result) return [];
  return [{
    line1:       postcode.toUpperCase(),
    postTown:    data.result.admin_district ?? '',
    postcode:    postcode.toUpperCase(),
    fullAddress: postcode.toUpperCase(),
    lat:         data.result.latitude,
    lng:         data.result.longitude,
    source:      'postcode_centroid',
    confidence:  0.3,
  }];
}

export const pafRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get<{ Querystring: { postcode?: string } }>(
    '/api/v1/paf/lookup',
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const raw = (request.query.postcode ?? '').trim();
      if (!raw) {
        return reply.code(400).send({ ok: false, error: 'postcode query param required' });
      }

      const postcode = raw.toUpperCase().replace(/\s+/g, ' ').replace(/^([A-Z]{1,2}\d[A-Z\d]?)(\d[A-Z]{2})$/, '$1 $2');

      try {
        // 1. OS Places (UPRN-level)
        const osResults = await osPlacesPostcodeCandidates(postcode);
        if (osResults.length) {
          const addresses: PafAddress[] = osResults.map(c => ({
            line1:       c.address,
            postTown:    '',
            postcode:    c.postcode ?? postcode,
            fullAddress: c.address,
            lat:         c.lat,
            lng:         c.lng,
            uprn:        c.uprn,
            confidence:  c.confidence,
            source:      'os_places',
          }));
          return reply.send({ ok: true, addresses, source: 'os_places' });
        }

        // 2. Nominatim fallback
        const nomResults = await lookupViaNominatim(postcode);
        if (nomResults.length) {
          return reply.send({ ok: true, addresses: nomResults, source: 'nominatim' });
        }

        // 3. Postcode centroid only
        const centroid = await lookupViaCentroid(postcode);
        return reply.send({ ok: true, addresses: centroid, source: 'postcode_centroid' });
      } catch (err) {
        fastify.log.error({ err }, '[paf] lookup error');
        return reply.code(500).send({ ok: false, error: 'Address lookup failed' });
      }
    },
  );
};
