/**
 * MJ Maps Systems — Property Pin Resolver
 *
 * FIX #5: Last-50-Metres Intelligence
 *
 * Complaint: drivers lose 5-15 minutes per stop at gates, wrong entrances,
 * unit numbers, and rural sites because the app drops the pin on the
 * postcode centroid instead of the actual delivery point.
 *
 * Solution:
 *   1. Resolve a stop's exact delivery pin using a priority chain:
 *      a) Driver-verified pin (community, highest trust)
 *      b) What3Words coordinate (if words provided)
 *      c) OS AddressBase / Royal Mail PAF geocode (UK)
 *      d) OSM building centroid
 *      e) Postcode centroid (last resort)
 *
 *   2. Attach structured access notes:
 *      - Gate code / intercom instructions
 *      - Correct entrance (side door, loading bay, rear gate)
 *      - Parking instruction (park on opposite side, yellow line exemption)
 *      - Photo proof of last successful delivery (thumbnail URL)
 *
 *   3. Return confidence score 0-1 so the driver UI can show how precise
 *      the pin is and warn when falling back to postcode.
 *
 * Integration: called by road-enricher.ts before enrichRoute().
 */

import { encode } from 'open-location-code';

export type PinSource =
  | 'community_verified'   // driver confirmed in-app
  | 'what3words'           // exact W3W coordinate
  | 'addressbase'          // OS AddressBase / Royal Mail PAF
  | 'osm_building'         // OSM building outline centroid
  | 'geocoder'             // standard geocoder (Nominatim / Google)
  | 'postcode_centroid';   // least precise fallback

export interface ResolvedPin {
  lat: number;
  lng: number;
  source: PinSource;
  confidence: number;          // 0.0 – 1.0
  what3wordsAddress?: string;  // e.g. "filled.count.soap"
  entranceNotes?: string;      // e.g. "Side gate on left, code 1234"
  parkingNote?: string;        // e.g. "Park opposite, not in front of gates"
  lastPhotoUrl?: string;       // thumbnail of last successful drop
  lastVerifiedAt?: string;     // ISO date of last community verification
}

export interface PinResolveInput {
  stopId: string;
  address: string;
  postcode: string;
  what3words?: string;
  driverVerifiedPin?: { lat: number; lng: number; verifiedAt: string };
  communityPin?: { lat: number; lng: number; verifiedAt: string; verifyCount: number };
}

// Confidence by source (used when source-specific confidence unavailable)
const SOURCE_CONFIDENCE: Record<PinSource, number> = {
  community_verified: 0.97,
  what3words:         0.95,
  addressbase:        0.88,
  osm_building:       0.75,
  geocoder:           0.62,
  postcode_centroid:  0.25,
};

/**
 * Resolve the most accurate pin available for a stop.
 * In production this calls external APIs in order; here the resolution
 * chain is fully implemented — callers supply cached/fetched data.
 */
export function resolvePin(input: PinResolveInput, options: {
  w3wCoord?: { lat: number; lng: number };
  addressbaseCoord?: { lat: number; lng: number };
  osmBuildingCoord?: { lat: number; lng: number };
  geocoderCoord?: { lat: number; lng: number };
  postcodeCoord: { lat: number; lng: number };   // always available
}): ResolvedPin {
  // Priority 1: Community-verified driver pin
  if (input.communityPin && input.communityPin.verifyCount >= 2) {
    return {
      lat: input.communityPin.lat,
      lng: input.communityPin.lng,
      source: 'community_verified',
      confidence: Math.min(0.97, 0.85 + input.communityPin.verifyCount * 0.03),
      lastVerifiedAt: input.communityPin.verifiedAt,
    };
  }

  if (input.driverVerifiedPin) {
    return {
      lat: input.driverVerifiedPin.lat,
      lng: input.driverVerifiedPin.lng,
      source: 'community_verified',
      confidence: 0.90,
      lastVerifiedAt: input.driverVerifiedPin.verifiedAt,
    };
  }

  // Priority 2: What3Words
  if (input.what3words && options.w3wCoord) {
    return {
      lat: options.w3wCoord.lat,
      lng: options.w3wCoord.lng,
      source: 'what3words',
      confidence: SOURCE_CONFIDENCE.what3words,
      what3wordsAddress: input.what3words,
    };
  }

  // Priority 3: OS AddressBase / Royal Mail PAF
  if (options.addressbaseCoord) {
    return {
      lat: options.addressbaseCoord.lat,
      lng: options.addressbaseCoord.lng,
      source: 'addressbase',
      confidence: SOURCE_CONFIDENCE.addressbase,
    };
  }

  // Priority 4: OSM building centroid
  if (options.osmBuildingCoord) {
    return {
      lat: options.osmBuildingCoord.lat,
      lng: options.osmBuildingCoord.lng,
      source: 'osm_building',
      confidence: SOURCE_CONFIDENCE.osm_building,
    };
  }

  // Priority 5: Generic geocoder
  if (options.geocoderCoord) {
    return {
      lat: options.geocoderCoord.lat,
      lng: options.geocoderCoord.lng,
      source: 'geocoder',
      confidence: SOURCE_CONFIDENCE.geocoder,
    };
  }

  // Last resort: postcode centroid
  return {
    lat: options.postcodeCoord.lat,
    lng: options.postcodeCoord.lng,
    source: 'postcode_centroid',
    confidence: SOURCE_CONFIDENCE.postcode_centroid,
  };
}

/**
 * Merge a resolved pin into a StopPoint.
 * Updates .pin, .lat/.lng (kept as geocoded centroid for fallback),
 * and appends access notes.
 */
export function applyPinToStop<T extends { lat: number; lng: number; pin?: { lat: number; lng: number }; notes?: string; access_notes?: string; plusCode?: string }>(
  stop: T,
  resolved: ResolvedPin,
): T {
  const accessLines: string[] = [];
  if (resolved.entranceNotes) accessLines.push(`🚪 ${resolved.entranceNotes}`);
  if (resolved.parkingNote)   accessLines.push(`🅿️ ${resolved.parkingNote}`);
  if (resolved.source === 'postcode_centroid') {
    accessLines.push(`⚠️ Approximate location only — verify on arrival`);
  }
  if (resolved.what3wordsAddress) {
    accessLines.push(`📍 What3Words: ${resolved.what3wordsAddress}`);
  }

  return {
    ...stop,
    pin: { lat: resolved.lat, lng: resolved.lng },
    plusCode: encode(resolved.lat, resolved.lng, 11),
    access_notes: accessLines.length > 0 ? accessLines.join('\n') : stop.access_notes,
  };
}

/**
 * Batch resolve pins for an entire route.
 *
 * Generic over T so that callers passing a richer stop type (e.g.
 * PinResolveInput & StopPoint) get back that same rich type — TypeScript
 * will not widen the return to the bare parameter-constraint type.
 *
 * T must satisfy the minimum shape batchResolvePins needs to call
 * resolvePin and applyPinToStop.
 */
export async function batchResolvePins<T extends PinResolveInput & {
  lat: number;
  lng: number;
  pin?: { lat: number; lng: number };
  notes?: string;
  access_notes?: string;
}>(
  stops: T[],
  fetchCoords: (stopId: string) => Promise<{
    w3wCoord?: { lat: number; lng: number };
    addressbaseCoord?: { lat: number; lng: number };
    osmBuildingCoord?: { lat: number; lng: number };
    geocoderCoord?: { lat: number; lng: number };
    postcodeCoord: { lat: number; lng: number };
  }>,
): Promise<T[]> {
  return Promise.all(
    stops.map(async (stop): Promise<T> => {
      const coords = await fetchCoords(stop.stopId);
      const resolved = resolvePin(stop, coords);
      return applyPinToStop(stop, resolved);
    })
  );
}
