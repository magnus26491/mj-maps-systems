/**
 * Geocoding orchestrator.
 *
 * Chains three providers in priority order with Redis caching:
 *   1. OS Places (OS_PLACES_KEY required) — UPRN-level, ~0.92 confidence
 *   2. what3words (WHAT3WORDS_API_KEY required) — W3W address, ~0.95 confidence
 *   3. Plus Codes / OLC — offline, no key, always available, ~0.70 confidence
 *
 * Cache keys:
 *   geocode:postcode:<normalised>  → AddressCandidate[]  TTL 7d
 *   geocode:door:<id>              → DoorPin             TTL 7d
 *   geocode:reverse:<lat4>:<lng4>  → ReverseResult       TTL 24h
 *
 * Falls back gracefully when Redis is unavailable — cache misses are silent.
 */

import type { GeocodingProvider, AddressCandidate, DoorPin, ReverseResult, LatLng } from './types.js';
import { osPlacesPostcodeCandidates, osPlacesUprnPin, osPlacesReverse } from './os-places-client.js';
import { resolveW3wToDoorPin, isW3wAddress } from './w3w-client.js';
import { resolvePlusCodeToDoorPin, isPlusCode, reversePlusCode, encodePlusCode } from './plus-codes-client.js';

// ── Cache helpers (lazy-import to avoid hard Redis dependency at module load) ──

async function cacheGet<T>(key: string): Promise<T | null> {
  try {
    const { redis } = await import('../cache/index.js');
    const raw = await redis.get(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

async function cacheSet(key: string, value: unknown, ttlSec: number): Promise<void> {
  try {
    const { redis } = await import('../cache/index.js');
    await redis.setex(key, ttlSec, JSON.stringify(value));
  } catch {
    // non-fatal
  }
}

const TTL_7D  = 60 * 60 * 24 * 7;
const TTL_24H = 60 * 60 * 24;

function postcodeKey(postcode: string) {
  return `geocode:postcode:${postcode.replace(/\s/g, '').toLowerCase()}`;
}
function doorKey(id: string) {
  return `geocode:door:${id.toLowerCase().replace(/\s/g, '')}`;
}
function reverseKey(lat: number, lng: number) {
  return `geocode:reverse:${lat.toFixed(4)}:${lng.toFixed(4)}`;
}

// ── Nominatim fallback for postcode lookup (no key required) ──────────────────

async function nominatimPostcodeCandidates(postcode: string): Promise<AddressCandidate[]> {
  const NOMINATIM_URL = (process.env.NOMINATIM_URL ?? 'https://nominatim.openstreetmap.org').replace(/\/$/, '');
  const encoded = encodeURIComponent(postcode.trim());
  const url = `${NOMINATIM_URL}/search?postalcode=${encoded}&countrycodes=gb&format=json&addressdetails=1&limit=5`;
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'MJMaps/1.0' },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return [];
    const data = (await res.json()) as Array<{
      place_id: string; display_name: string; lat: string; lon: string;
      address?: { postcode?: string };
    }>;
    return data.map(d => ({
      id: d.place_id,
      address: d.display_name,
      postcode: d.address?.postcode ?? postcode,
      lat: parseFloat(d.lat),
      lng: parseFloat(d.lon),
      source: 'nominatim' as const,
      confidence: 0.55,
    }));
  } catch {
    return [];
  }
}

async function nominatimReverse(latlng: LatLng): Promise<ReverseResult | null> {
  const NOMINATIM_URL = (process.env.NOMINATIM_URL ?? 'https://nominatim.openstreetmap.org').replace(/\/$/, '');
  const url = `${NOMINATIM_URL}/reverse?lat=${latlng.lat}&lon=${latlng.lng}&format=json&addressdetails=1`;
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'MJMaps/1.0' },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return null;
    const d = (await res.json()) as {
      display_name: string; lat: string; lon: string;
      address?: { postcode?: string };
    };
    const lat = parseFloat(d.lat);
    const lng = parseFloat(d.lon);
    const dLat = lat - latlng.lat;
    const dLng = lng - latlng.lng;
    return {
      address: d.display_name,
      postcode: d.address?.postcode,
      lat,
      lng,
      distanceM: Math.round(Math.sqrt(dLat * dLat + dLng * dLng) * 111_320),
      source: 'nominatim',
    };
  } catch {
    return null;
  }
}

// ── Orchestrator ──────────────────────────────────────────────────────────────

class GeocodingService implements GeocodingProvider {
  async resolvePostcodeToCandidates(postcode: string): Promise<AddressCandidate[]> {
    const key = postcodeKey(postcode);
    const cached = await cacheGet<AddressCandidate[]>(key);
    if (cached) return cached;

    // Chain: OS Places → Nominatim → empty
    let candidates = await osPlacesPostcodeCandidates(postcode);
    if (candidates.length === 0) {
      candidates = await nominatimPostcodeCandidates(postcode);
    }

    if (candidates.length > 0) {
      await cacheSet(key, candidates, TTL_7D);
    }
    return candidates;
  }

  async resolveToDoorPin(addressId: string): Promise<DoorPin | null> {
    const key = doorKey(addressId);
    const cached = await cacheGet<DoorPin>(key);
    if (cached) return cached;

    let pin: DoorPin | null = null;

    if (isW3wAddress(addressId)) {
      pin = await resolveW3wToDoorPin(addressId);
    } else if (isPlusCode(addressId)) {
      pin = resolvePlusCodeToDoorPin(addressId);
    } else {
      // Assume UPRN — try OS Places
      pin = await osPlacesUprnPin(addressId);
    }

    if (pin) {
      // Always attach a Plus Code to every door pin
      if (!pin.plusCode) {
        pin = { ...pin, plusCode: encodePlusCode(pin.lat, pin.lng) };
      }
      await cacheSet(key, pin, TTL_7D);
    }
    return pin;
  }

  async reverse(latlng: LatLng): Promise<ReverseResult | null> {
    const key = reverseKey(latlng.lat, latlng.lng);
    const cached = await cacheGet<ReverseResult>(key);
    if (cached) return cached;

    // Chain: OS Places → Nominatim → Plus Code (offline fallback always succeeds)
    let result = await osPlacesReverse(latlng);
    if (!result) result = await nominatimReverse(latlng);
    if (!result) result = reversePlusCode(latlng);

    await cacheSet(key, result, TTL_24H);
    return result;
  }
}

export const geocodingProvider = new GeocodingService();
