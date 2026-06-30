/**
 * PAF Lookup — /api/v1/paf/lookup?postcode=SO15+3SP
 *
 * Returns individual addresses within a UK postcode unit.
 *
 * Resolution order:
 *   1. OS Places API (UPRN-level door coords, requires OS_PLACES_KEY)
 *   2. OpenStreetMap Overpass — nodes/ways tagged addr:postcode=X (free)
 *   3. postcodes.io centroid (last resort — one result at postcode centre)
 */

import type { FastifyPluginAsync } from 'fastify';
import { requireAuth } from '../middleware/auth.js';
import { osPlacesPostcodeCandidates } from '../../geocoding/os-places-client.js';

const OVERPASS    = process.env.OVERPASS_URL ?? 'https://overpass-api.de/api/interpreter';
const POSTCODES_IO = 'https://api.postcodes.io';
const FETCH_TIMEOUT = 10_000;

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

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T | null> {
  try {
    const res = await fetch(url, {
      ...init,
      signal: AbortSignal.timeout(FETCH_TIMEOUT),
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'MJMaps/1.0 (contact@mjmaps.co.uk)',
        ...(init?.headers as Record<string, string> ?? {}),
      },
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

interface OverpassElement {
  type: 'node' | 'way' | 'relation';
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

interface OverpassResult {
  elements?: OverpassElement[];
}

async function lookupViaOverpass(postcode: string): Promise<PafAddress[]> {
  // Query all nodes and ways with addr:postcode matching this unit
  const query = `[out:json][timeout:10];
(
  node["addr:postcode"="${postcode}"];
  way["addr:postcode"="${postcode}"];
);
out center;`;

  const data = await fetchJson<OverpassResult>(OVERPASS, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `data=${encodeURIComponent(query)}`,
  });

  const elements = data?.elements ?? [];
  const results: PafAddress[] = [];

  for (const el of elements) {
    const tags = el.tags ?? {};
    const houseNum  = tags['addr:housenumber'] ?? tags['addr:flats'] ?? '';
    const street    = tags['addr:street'] ?? '';
    if (!street) continue; // skip unaddressed elements

    const lat = el.lat ?? el.center?.lat;
    const lng = el.lon ?? el.center?.lon;
    if (!lat || !lng) continue;

    const postTown = tags['addr:city'] ?? tags['addr:town'] ?? tags['addr:suburb'] ?? '';
    const line1    = [houseNum, street].filter(Boolean).join(' ');
    const pc       = tags['addr:postcode'] ?? postcode;
    const full     = [line1, postTown, pc].filter(Boolean).join(', ');

    results.push({
      line1,
      postTown,
      postcode: pc,
      fullAddress: full,
      lat,
      lng,
      source: 'osm',
      confidence: 0.8,
    });
  }

  // Sort by house number numerically then alphabetically
  results.sort((a, b) => {
    const na = parseInt(a.line1) || 0;
    const nb = parseInt(b.line1) || 0;
    if (na !== nb) return na - nb;
    return a.line1.localeCompare(b.line1);
  });

  return results;
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

// OS Places returns ALL CAPS — convert to Title Case for display
const ALWAYS_UPPER = new Set(['PO', 'SO', 'SW', 'NW', 'NE', 'SE', 'EC', 'WC', 'UK', 'GB']);
function toTitleCase(s: string): string {
  return s.replace(/\b\w+/g, w =>
    ALWAYS_UPPER.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase(),
  );
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

      // Normalise: "so153sp" → "SO15 3SP"
      const clean = raw.toUpperCase().replace(/\s+/g, '');
      const postcode = clean.replace(/^([A-Z]{1,2}\d[A-Z\d]?)(\d[A-Z]{2})$/, '$1 $2');

      try {
        // 1. OS Places (UPRN-level individual houses)
        const osResults = await osPlacesPostcodeCandidates(postcode);
        if (osResults.length) {
          const addresses: PafAddress[] = osResults.map(c => {
            const tc = (s?: string) => s ? toTitleCase(s) : '';
            const pc = c.postcode ?? postcode;

            // Build line1: most specific identifier for this delivery point.
            // Priority: organisation name → flat/unit → building name → number+street
            const orgName  = tc(c.organisationName);
            const subBldg  = tc(c.subBuildingName);
            const bldgName = tc(c.buildingName);
            const bldgNum  = c.buildingNumber ?? '';
            const street   = [tc(c.dependentThoroughfareName), tc(c.thoroughfareName)].filter(Boolean).join(', ');
            const town     = tc(c.postTown);

            let line1: string;
            let line2: string | undefined;

            if (orgName) {
              // Commercial: "Tesco Express" / "Unit 3B"
              line1 = orgName;
              // If there's also a sub-building or building, add it
              const bldgPart = [subBldg, bldgName].filter(Boolean).join(', ');
              const streetPart = [bldgNum, street].filter(Boolean).join(' ');
              line2 = [bldgPart, streetPart].filter(Boolean).join(', ') || undefined;
            } else if (subBldg) {
              // Flat/unit within a named building or street: "Flat 2A, Harbour House" / "Flat 2A, 12 High Street"
              line1 = subBldg;
              const streetPart = [bldgNum, street].filter(Boolean).join(' ');
              line2 = [bldgName, streetPart].filter(Boolean).join(', ') || undefined;
            } else if (bldgName) {
              // Named building without org: "Harbour House, 12 High Street"
              line1 = bldgName;
              line2 = [bldgNum, street].filter(Boolean).join(' ') || undefined;
            } else {
              // Standard numbered address: "12 High Street"
              line1 = [bldgNum, street].filter(Boolean).join(' ') || toTitleCase(c.address).split(',')[0]?.trim() ?? '';
            }

            const full = toTitleCase(c.address);

            return {
              line1,
              line2,
              postTown:    town || full.split(',').at(-2)?.trim() ?? '',
              postcode:    pc,
              fullAddress: full,
              lat:         c.lat,
              lng:         c.lng,
              uprn:        c.uprn,
              confidence:  c.confidence,
              source:      'os_places',
            };
          });
          return reply.send({ ok: true, addresses, source: 'os_places' });
        }

        // 2. Overpass OSM — buildings/addresses tagged with this postcode
        const osmResults = await lookupViaOverpass(postcode);
        if (osmResults.length) {
          return reply.send({ ok: true, addresses: osmResults, source: 'osm' });
        }

        // 3. postcodes.io centroid only
        const centroid = await lookupViaCentroid(postcode);
        return reply.send({ ok: true, addresses: centroid, source: 'postcode_centroid' });
      } catch (err) {
        fastify.log.error({ err }, '[paf] lookup error');
        return reply.code(500).send({ ok: false, error: 'Address lookup failed' });
      }
    },
  );
};
