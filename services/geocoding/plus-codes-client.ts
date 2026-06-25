/**
 * Plus Codes (Open Location Code) adapter — fully offline, no API key.
 *
 * Encodes coordinates to a Plus Code and decodes a Plus Code to its
 * bounding-box centre.  Always available as the last-resort fallback.
 *
 * Code length 11 gives ~3.5 m × 3.5 m precision — good enough for
 * a precise doorstep pin.
 */

import type { DoorPin, LatLng, AddressCandidate, ReverseResult } from './types.js';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { OpenLocationCode } = require('open-location-code') as {
  OpenLocationCode: new () => {
    isValid(code: string): boolean;
    isFull(code: string): boolean;
    encode(lat: number, lng: number, codeLength?: number): string;
    decode(code: string): { latitudeCenter: number; longitudeCenter: number; codeLength: number };
    recoverNearest(shortCode: string, lat: number, lng: number): string;
  };
};

const olc = new OpenLocationCode();

const OLC_FULL_PATTERN = /^[23456789CFGHJMPQRVWX]{8}\+[23456789CFGHJMPQRVWX]{2,}$/i;

/** Returns true if the string looks like a full Plus Code */
export function isPlusCode(s: string): boolean {
  return OLC_FULL_PATTERN.test(s.trim().toUpperCase());
}

/** Encode a coordinate to a Plus Code string (precision 11 ≈ 3.5 m). */
export function encodePlusCode(lat: number, lng: number, codeLength = 11): string {
  return olc.encode(lat, lng, codeLength);
}

/** Decode a full Plus Code to its centre coordinate. Returns null if invalid. */
export function decodePlusCode(code: string): LatLng | null {
  const clean = code.trim().toUpperCase();
  try {
    if (!olc.isValid(clean) || !olc.isFull(clean)) return null;
    const area = olc.decode(clean);
    return { lat: area.latitudeCenter, lng: area.longitudeCenter };
  } catch {
    return null;
  }
}

/** Resolve a Plus Code string to a DoorPin. Returns null if the code is invalid. */
export function resolvePlusCodeToDoorPin(code: string): DoorPin | null {
  const coords = decodePlusCode(code);
  if (!coords) return null;
  return {
    lat: coords.lat,
    lng: coords.lng,
    source: 'plus_code',
    confidence: 0.70,
    plusCode: code.trim().toUpperCase(),
  };
}

/**
 * Synthesise a single-item AddressCandidate from a coordinate pair.
 * Used as the ultimate offline fallback in the orchestrator.
 */
export function coordsToCandidate(lat: number, lng: number): AddressCandidate {
  const code = encodePlusCode(lat, lng);
  return {
    id: code,
    address: code,
    lat,
    lng,
    source: 'plus_code',
    confidence: 0.10,
  };
}

/** Reverse-geocode a LatLng to its Plus Code as a ReverseResult. Always succeeds. */
export function reversePlusCode(latlng: LatLng): ReverseResult {
  const code = encodePlusCode(latlng.lat, latlng.lng);
  return {
    address: code,
    lat: latlng.lat,
    lng: latlng.lng,
    distanceM: 0,
    source: 'plus_code',
  };
}
