/**
 * OS Places API adapter.
 *
 * Uses the OS National Geographic Database Places API to look up addresses
 * by postcode (UPRN-keyed) and resolve a UPRN to precise door-level coords.
 *
 * Requires OS_PLACES_KEY env var. Returns empty results when unset so the
 * orchestrator can fall through to the next provider.
 *
 * ⚠️  Provision: register at https://osdatahub.os.uk/ and create a project
 *     with the OS Places API enabled. Set OS_PLACES_KEY in Railway variables.
 */

import type { AddressCandidate, DoorPin, ReverseResult, LatLng } from './types.js';

function getKey(): string | undefined {
  return process.env.OS_PLACES_KEY;
}

const BASE = 'https://api.os.uk/search/places/v1';

interface OsDpa {
  UPRN: string;
  ADDRESS: string;
  POSTCODE?: string;
  LAT?: number;
  LNG?: number;
  X_COORDINATE?: number;
  Y_COORDINATE?: number;
}

interface OsPlacesResponse {
  results?: Array<{ DPA?: OsDpa; LPI?: { UPRN: string; ADDRESS: string; POSTCODE?: string; LAT?: number; LNG?: number } }>;
  header?: { totalresults: number };
}

async function osGet<T>(url: string): Promise<T> {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(10_000),
    headers: { 'Accept': 'application/json' },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`OS Places HTTP ${res.status}: ${body.slice(0, 120)}`);
  }
  return res.json() as Promise<T>;
}

function extractCoords(dpa: OsDpa): { lat: number; lng: number } | null {
  if (typeof dpa.LAT === 'number' && typeof dpa.LNG === 'number') {
    return { lat: dpa.LAT, lng: dpa.LNG };
  }
  return null;
}

export async function osPlacesPostcodeCandidates(postcode: string): Promise<AddressCandidate[]> {
  const key = getKey();
  if (!key) return [];

  const encoded = encodeURIComponent(postcode.replace(/\s/g, '').toUpperCase());
  const url = `${BASE}/postcode?postcode=${encoded}&output_srs=WGS84&dataset=DPA&maxresults=100&key=${key}`;

  try {
    const data = await osGet<OsPlacesResponse>(url);
    if (!data.results?.length) {
      console.log(`[os-places] no results for postcode ${postcode} (total=${data.header?.totalresults ?? 0})`);
      return [];
    }

    return data.results
      .map(r => r.DPA ?? r.LPI)
      .filter((d): d is OsDpa => !!d)
      .map(d => {
        const coords = extractCoords(d);
        if (!coords) return null;
        return {
          id: d.UPRN,
          address: d.ADDRESS,
          postcode: d.POSTCODE,
          lat: coords.lat,
          lng: coords.lng,
          source: 'os_places' as const,
          confidence: 0.92,
          uprn: d.UPRN,
        };
      })
      .filter((c): c is NonNullable<typeof c> => c !== null);
  } catch (err) {
    console.warn('[os-places] postcode lookup failed:', (err as Error).message);
    return [];
  }
}

export async function osPlacesUprnPin(uprn: string): Promise<DoorPin | null> {
  const key = getKey();
  if (!key) return null;

  const url = `${BASE}/uprn?uprn=${encodeURIComponent(uprn)}&output_srs=WGS84&key=${key}`;

  try {
    const data = await osGet<OsPlacesResponse>(url);
    const dpa = data.results?.[0]?.DPA;
    if (!dpa) return null;
    const coords = extractCoords(dpa);
    if (!coords) return null;

    return {
      lat: coords.lat,
      lng: coords.lng,
      source: 'os_places',
      confidence: 0.92,
      uprn: dpa.UPRN,
    };
  } catch (err) {
    console.warn('[os-places] UPRN lookup failed:', (err as Error).message);
    return null;
  }
}

export async function osPlacesReverse(latlng: LatLng): Promise<ReverseResult | null> {
  const key = getKey();
  if (!key) return null;

  const url = `${BASE}/nearest?point=${latlng.lng},${latlng.lat}&output_srs=WGS84&key=${key}`;

  try {
    const data = await osGet<OsPlacesResponse>(url);
    const dpa = data.results?.[0]?.DPA;
    if (!dpa) return null;
    const coords = extractCoords(dpa);
    if (!coords) return null;

    const dLat = coords.lat - latlng.lat;
    const dLng = coords.lng - latlng.lng;
    const distanceM = Math.round(Math.sqrt(dLat * dLat + dLng * dLng) * 111_320);

    return {
      address: dpa.ADDRESS,
      postcode: dpa.POSTCODE,
      lat: coords.lat,
      lng: coords.lng,
      distanceM,
      source: 'os_places',
    };
  } catch (err) {
    console.warn('[os-places] reverse lookup failed:', (err as Error).message);
    return null;
  }
}
