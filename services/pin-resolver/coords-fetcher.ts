/**
 * MJ Maps Systems — Pin Coords Fetcher
 *
 * Builds the `fetchCoords` callback required by batchResolvePins().
 *
 * Resolution order per stop:
 *   1. What3Words API  (if stop.what3words set)
 *   2. OSM Nominatim  building-level geocode (house number + street + postcode)
 *   3. OSM Overpass   building outline centroid within 50m of geocoded coord
 *   4. Postcode centroid via postcodes.io  (always available for UK stops)
 *
 * All external calls are bounded by a 6-second timeout and never throw —
 * they degrade gracefully so a single bad geocode never blocks the route.
 *
 * In production, OS AddressBase / Royal Mail PAF results can be injected
 * by replacing the Nominatim call with your licensed data feed.
 */

import type { PinResolveInput } from './index';

const FETCH_TIMEOUT_MS = 6_000;
const W3W_API_BASE     = 'https://api.what3words.com/v3';
const NOMINATIM_BASE   = 'https://nominatim.openstreetmap.org';
const POSTCODES_BASE   = 'https://api.postcodes.io';
const OVERPASS_BASE    = 'https://overpass-api.de/api/interpreter';

// ─── HELPERS ─────────────────────────────────────────────────────────────────

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T | null> {
  try {
    const res = await fetch(url, {
      ...init,
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'MJMaps/1.0 (contact@mjmaps.co.uk)',
        ...(init?.headers ?? {}),
      },
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

interface LatLng { lat: number; lng: number; }

// ─── WHAT3WORDS ──────────────────────────────────────────────────────────────

async function resolveW3W(
  words: string,
  apiKey: string,
): Promise<LatLng | null> {
  const url = `${W3W_API_BASE}/convert-to-coordinates?words=${encodeURIComponent(words)}&key=${apiKey}`;
  const data = await fetchJson<{ coordinates?: { lat: number; lng: number } }>(url);
  if (!data?.coordinates) return null;
  return { lat: data.coordinates.lat, lng: data.coordinates.lng };
}

// ─── NOMINATIM (OSM building-level geocode) ───────────────────────────────────

async function resolveNominatim(
  address: string,
  postcode: string,
): Promise<LatLng | null> {
  const q = encodeURIComponent(`${address}, ${postcode}, United Kingdom`);
  const url = `${NOMINATIM_BASE}/search?q=${q}&format=jsonv2&addressdetails=0&limit=1&countrycodes=gb`;
  const data = await fetchJson<Array<{ lat: string; lon: string }>>(url);
  if (!data || data.length === 0) return null;
  const first = data[0];
  return { lat: parseFloat(first.lat), lng: parseFloat(first.lon) };
}

// ─── OSM BUILDING CENTROID ────────────────────────────────────────────────────

async function resolveOsmBuilding(
  lat: number,
  lng: number,
): Promise<LatLng | null> {
  const query = [
    '[out:json][timeout:5];',
    `way(around:50,${lat},${lng})[building];`,
    'out center 1;',
  ].join('');

  const res = await fetchJson<{ elements?: Array<{ type: string; center?: { lat: number; lon: number } }> }>(
    OVERPASS_BASE,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `data=${encodeURIComponent(query)}`,
    },
  );

  const buildings = res?.elements?.filter(e => e.type === 'way' && e.center) ?? [];
  if (buildings.length === 0) return null;
  const c = buildings[0].center!;
  return { lat: c.lat, lng: c.lon };
}

// ─── POSTCODE CENTROID (postcodes.io) ─────────────────────────────────────────

async function resolvePostcode(postcode: string): Promise<LatLng | null> {
  const url = `${POSTCODES_BASE}/postcodes/${encodeURIComponent(postcode)}`;
  const data = await fetchJson<{ result?: { latitude: number; longitude: number } }>(url);
  if (!data?.result) return null;
  return { lat: data.result.latitude, lng: data.result.longitude };
}

// ─── MAIN FACTORY ─────────────────────────────────────────────────────────────

export interface CoordsBundle {
  w3wCoord?: LatLng;
  addressbaseCoord?: LatLng;   // injected externally if OS AddressBase licensed
  osmBuildingCoord?: LatLng;
  geocoderCoord?: LatLng;
  postcodeCoord: LatLng;       // always present (falls back to {0,0} only if API down)
}

/**
 * Build the fetchCoords callback for batchResolvePins().
 *
 * @param w3wApiKey  What3Words API key (optional — skips W3W if absent)
 * @param stopIndex  Map from stopId → PinResolveInput for address/postcode lookup
 */
export function buildFetchCoords(
  stopIndex: Map<string, PinResolveInput>,
  w3wApiKey?: string,
): (stopId: string) => Promise<CoordsBundle> {
  return async (stopId: string): Promise<CoordsBundle> => {
    const stop = stopIndex.get(stopId);
    if (!stop) {
      // Unknown stop — return zero coords, pin-resolver will use postcode fallback
      return { postcodeCoord: { lat: 0, lng: 0 } };
    }

    // Run all resolution strategies in parallel, bounded by individual timeouts
    const [
      w3wCoord,
      geocoderCoord,
      postcodeCoord,
    ] = await Promise.all([
      // 1. What3Words
      stop.what3words && w3wApiKey
        ? resolveW3W(stop.what3words, w3wApiKey)
        : Promise.resolve(null),

      // 2. Nominatim building geocode
      resolveNominatim(stop.address, stop.postcode),

      // 3. Postcode centroid (base fallback)
      resolvePostcode(stop.postcode),
    ]);

    // 3. OSM building centroid — only fetch if Nominatim succeeded (needs seed coord)
    let osmBuildingCoord: LatLng | null = null;
    if (geocoderCoord) {
      osmBuildingCoord = await resolveOsmBuilding(geocoderCoord.lat, geocoderCoord.lng);
    }

    return {
      ...(w3wCoord        ? { w3wCoord }        : {}),
      ...(geocoderCoord   ? { geocoderCoord }   : {}),
      ...(osmBuildingCoord ? { osmBuildingCoord } : {}),
      postcodeCoord: postcodeCoord ?? { lat: 0, lng: 0 },
    };
  };
}
