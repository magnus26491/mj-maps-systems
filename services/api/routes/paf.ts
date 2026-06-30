/**
 * PAF Lookup — /api/v1/paf/lookup?postcode=SO15+3SP
 *
 * Returns individual addresses within a UK postcode unit.
 *
 * Resolution order:
 *   1. getAddress.io  (Royal Mail PAF, ~50ms, GETADDRESS_KEY required)
 *   2. OS Places API  (UPRN-level door coords, OS_PLACES_KEY required)
 *   3. OpenStreetMap Overpass — nodes/ways tagged addr:postcode=X (free)
 *   4. Nominatim     — OSM geocoder with UK OpenNames data
 *   5. postcodes.io centroid (last resort)
 *
 * Redis cache: 7-day TTL per postcode — repeat lookups are instant.
 */

import type { FastifyPluginAsync } from 'fastify';
import { requireAuth } from '../middleware/auth.js';
import { osPlacesPostcodeCandidates } from '../../geocoding/os-places-client.js';

const OVERPASS     = process.env.OVERPASS_URL ?? 'https://overpass-api.de/api/interpreter';
const POSTCODES_IO = 'https://api.postcodes.io';
const FETCH_TIMEOUT = 10_000;
const PAF_CACHE_TTL = 60 * 60 * 24 * 7; // 7 days

async function pafCacheGet(postcode: string): Promise<{ addresses: PafAddress[]; source: string } | null> {
  try {
    const { redis } = await import('../../cache/index.js');
    const raw = await redis.get(`paf:${postcode.replace(/\s/g, '').toLowerCase()}`);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

async function pafCacheSet(postcode: string, result: { addresses: PafAddress[]; source: string }): Promise<void> {
  try {
    const { redis } = await import('../../cache/index.js');
    await redis.setex(`paf:${postcode.replace(/\s/g, '').toLowerCase()}`, PAF_CACHE_TTL, JSON.stringify(result));
  } catch { /* non-fatal */ }
}

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
  // Query nodes, ways and relations tagged with this postcode.
  // Also include elements within the postcode boundary area (catches buildings
  // that carry addr:street but no addr:postcode — common in UK industrial estates).
  const query = `[out:json][timeout:12];
(
  node["addr:postcode"="${postcode}"];
  way["addr:postcode"="${postcode}"];
  relation["addr:postcode"="${postcode}"];
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
    const street    = tags['addr:street'] ?? tags['addr:place'] ?? '';
    // Fall back to the element name for business/commercial premises that
    // are tagged with name rather than addr:housenumber + addr:street.
    const nameTag   = tags['name'] ?? tags['addr:housename'] ?? tags['addr:unit'] ?? '';

    const lat = el.lat ?? el.center?.lat;
    const lng = el.lon ?? el.center?.lon;
    if (lat == null || lng == null || !isFinite(lat) || !isFinite(lng)) continue;

    // Build line1: numbered+street wins; named premises second; bare postcode skipped
    let line1: string;
    if (street) {
      line1 = [houseNum, street].filter(Boolean).join(' ');
    } else if (nameTag) {
      line1 = nameTag;
    } else {
      continue; // no usable label
    }

    const postTown = tags['addr:city'] ?? tags['addr:town'] ?? tags['addr:suburb'] ?? '';
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

  // Sort numerically then alphabetically
  results.sort((a, b) => {
    const na = parseInt(a.line1) || 0;
    const nb = parseInt(b.line1) || 0;
    if (na !== nb) return na - nb;
    return a.line1.localeCompare(b.line1);
  });

  return results;
}

interface NominatimResult {
  lat:          string;
  lon:          string;
  display_name: string;
  type:         string;
  address?: {
    house_number?: string;
    road?:         string;
    pedestrian?:   string;
    footway?:      string;
    retail?:       string;
    industrial?:   string;
    town?:         string;
    city?:         string;
    village?:      string;
    county?:       string;
    postcode?:     string;
  };
}

async function lookupViaNominatim(postcode: string): Promise<PafAddress[]> {
  // Nominatim is the OSM geocoder; for UK postcodes it incorporates OS OpenNames
  // data and often returns individual premises that Overpass misses.
  const params = new URLSearchParams({
    postalcode:   postcode,
    countrycodes: 'gb',
    format:       'json',
    addressdetails: '1',
    limit:        '100',
  });

  const data = await fetchJson<NominatimResult[]>(
    `https://nominatim.openstreetmap.org/search?${params}`,
  );
  if (!Array.isArray(data) || !data.length) return [];

  const results: PafAddress[] = [];
  const seen = new Set<string>();

  for (const item of data) {
    const addr      = item.address ?? {};
    const houseNum  = addr.house_number ?? '';
    const road      = addr.road ?? addr.pedestrian ?? addr.footway ?? addr.retail ?? addr.industrial ?? '';
    const postTown  = addr.town ?? addr.city ?? addr.village ?? addr.county ?? '';
    const pc        = addr.postcode ?? postcode;
    const lat       = parseFloat(item.lat);
    const lng       = parseFloat(item.lon);

    if (!isFinite(lat) || !isFinite(lng)) continue;
    if (!road && !houseNum) continue;

    const line1 = [houseNum, road].filter(Boolean).join(' ');
    const dedup = `${line1}|${lat.toFixed(5)}|${lng.toFixed(5)}`;
    if (seen.has(dedup)) continue;
    seen.add(dedup);

    const full = item.display_name;

    results.push({
      line1,
      postTown,
      postcode: pc,
      fullAddress: full,
      lat,
      lng,
      source: 'nominatim',
      confidence: 0.75,
    });
  }

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

// ── Ideal Postcodes — Royal Mail PAF reseller, ~50ms, 100 free trial lookups ─
// getAddress.io shut down 4 Feb 2026 (Royal Mail v Codeberry judgment).
// Ideal Postcodes won that same lawsuit and is the legally compliant replacement.
// Register at https://ideal-postcodes.co.uk → Dashboard → API Keys
// Free trial: 100 lookups. Paid: ~2.5p/lookup.

interface IdealPostcodesAddress {
  organisation_name?: string;
  sub_building_name?: string;
  building_name?:     string;
  building_number?:   string;
  line_1?:            string;
  line_2?:            string;
  line_3?:            string;
  post_town?:         string;
  postcode?:          string;
  latitude?:          number;
  longitude?:         number;
  udprn?:             string;
}

async function lookupViaIdealPostcodes(postcode: string): Promise<PafAddress[]> {
  const key = process.env.IDEAL_POSTCODES_KEY;
  if (!key) return [];
  const encoded = encodeURIComponent(postcode);
  const url = `https://api.ideal-postcodes.co.uk/v1/postcodes/${encoded}?api_key=${key}`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(6_000) });
    if (!res.ok) return [];
    const data = (await res.json()) as { result?: IdealPostcodesAddress[] };
    if (!Array.isArray(data.result) || !data.result.length) return [];

    return data.result.map(a => {
      const orgName  = toTitleCase(a.organisation_name ?? '');
      const subBldg  = toTitleCase(a.sub_building_name ?? '');
      const bldgName = toTitleCase(a.building_name ?? '');
      const bldgNum  = a.building_number ?? '';
      const line1Raw = toTitleCase(a.line_1 ?? '');
      const line2Raw = a.line_2 ? toTitleCase(a.line_2) : undefined;
      const postTown = toTitleCase(a.post_town ?? '');
      const pc       = a.postcode ?? postcode.toUpperCase();

      // Prefer the structured fields when available; fall back to pre-built line_1
      let line1 = line1Raw;
      let line2 = line2Raw;
      if (orgName && !line1Raw.startsWith(orgName)) {
        line1 = orgName;
        line2 = line1Raw || line2Raw;
      } else if (subBldg && !line1Raw.startsWith(subBldg)) {
        line1 = subBldg;
        line2 = [bldgName, bldgNum, line1Raw].filter(Boolean).join(', ') || line2Raw;
      }

      const parts = [line1, line2, postTown, pc].filter(Boolean);
      return {
        line1,
        line2,
        postTown,
        postcode:    pc,
        fullAddress: parts.join(', '),
        lat:         a.latitude  ?? 0,
        lng:         a.longitude ?? 0,
        uprn:        a.udprn,
        source:      'ideal_postcodes' as const,
        confidence:  0.97,
      };
    }).filter(a => isFinite(a.lat) && isFinite(a.lng) && a.lat !== 0);
  } catch {
    return [];
  }
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

      // Reject malformed postcodes before they reach Overpass QL interpolation
      if (!/^[A-Z]{1,2}\d[A-Z\d]? \d[A-Z]{2}$/.test(postcode)) {
        return reply.code(400).send({ ok: false, error: 'Invalid UK postcode format' });
      }

      try {
        // ── Redis cache check (instant on hit) ──────────────────────────────
        const cached = await pafCacheGet(postcode);
        if (cached) {
          return reply.send({ ok: true, ...cached, cached: true });
        }

        // ── Provider chain ──────────────────────────────────────────────────
        // 1. Ideal Postcodes — Royal Mail PAF, ~50ms, requires IDEAL_POSTCODES_KEY
        const ipResults = await lookupViaIdealPostcodes(postcode);
        if (ipResults.length) {
          const result = { addresses: ipResults, source: 'ideal_postcodes' };
          await pafCacheSet(postcode, result);
          return reply.send({ ok: true, ...result });
        }

        // 2. OS Places (UPRN-level individual houses, requires OS_PLACES_KEY)
        const osResults = await osPlacesPostcodeCandidates(postcode);
        if (osResults.length) {
          const addresses: PafAddress[] = osResults.map(c => {
            const tc = (s?: string) => s ? toTitleCase(s) : '';
            const pc = c.postcode ?? postcode;

            const orgName  = tc(c.organisationName);
            const subBldg  = tc(c.subBuildingName);
            const bldgName = tc(c.buildingName);
            const bldgNum  = c.buildingNumber ?? '';
            const street   = [tc(c.dependentThoroughfareName), tc(c.thoroughfareName)].filter(Boolean).join(', ');
            const town     = tc(c.postTown);

            let line1: string;
            let line2: string | undefined;

            if (orgName) {
              line1 = orgName;
              const bldgPart = [subBldg, bldgName].filter(Boolean).join(', ');
              const streetPart = [bldgNum, street].filter(Boolean).join(' ');
              line2 = [bldgPart, streetPart].filter(Boolean).join(', ') || undefined;
            } else if (subBldg) {
              line1 = subBldg;
              const streetPart = [bldgNum, street].filter(Boolean).join(' ');
              line2 = [bldgName, streetPart].filter(Boolean).join(', ') || undefined;
            } else if (bldgName) {
              line1 = bldgName;
              line2 = [bldgNum, street].filter(Boolean).join(' ') || undefined;
            } else {
              line1 = [bldgNum, street].filter(Boolean).join(' ') || toTitleCase(c.address).split(',')[0].trim();
            }

            const full = toTitleCase(c.address);
            return {
              line1, line2,
              postTown:    town || full.split(',').at(-2)?.trim() || '',
              postcode:    pc,
              fullAddress: full,
              lat:         c.lat,
              lng:         c.lng,
              uprn:        c.uprn,
              confidence:  c.confidence,
              source:      'os_places',
            };
          });
          const result = { addresses, source: 'os_places' };
          await pafCacheSet(postcode, result);
          return reply.send({ ok: true, ...result });
        }

        // 3. Overpass + Nominatim in parallel — both are free but slow on first hit
        const [osmResults, nominatimResults] = await Promise.all([
          lookupViaOverpass(postcode),
          lookupViaNominatim(postcode),
        ]);
        if (osmResults.length) {
          const result = { addresses: osmResults, source: 'osm' };
          await pafCacheSet(postcode, result);
          return reply.send({ ok: true, ...result });
        }
        if (nominatimResults.length) {
          const result = { addresses: nominatimResults, source: 'nominatim' };
          await pafCacheSet(postcode, result);
          return reply.send({ ok: true, ...result });
        }

        // 4. postcodes.io centroid only — not cached (useless to cache a centroid long-term)
        const centroid = await lookupViaCentroid(postcode);
        return reply.send({ ok: true, addresses: centroid, source: 'postcode_centroid' });
      } catch (err) {
        fastify.log.error({ err }, '[paf] lookup error');
        return reply.code(500).send({ ok: false, error: 'Address lookup failed' });
      }
    },
  );
};
