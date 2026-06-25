/**
 * Geocoding layer interfaces — shared types for OS Places, what3words, and Plus Codes.
 *
 * All implementations satisfy these contracts so the orchestrator in
 * geocoding-provider.ts can chain them without knowing which is active.
 */

export interface LatLng {
  lat: number;
  lng: number;
}

// ── Postcode lookup ───────────────────────────────────────────────────────────

export interface AddressCandidate {
  /** Stable address identifier: UPRN for OS Places, w3w words, or plus code */
  id: string;
  address: string;
  postcode?: string;
  lat: number;
  lng: number;
  source: 'os_places' | 'nominatim' | 'plus_code';
  confidence: number;   // 0–1
  uprn?: string;
}

// ── Door pin (precise delivery location) ─────────────────────────────────────

export type DoorPinSource = 'os_places' | 'what3words' | 'plus_code' | 'nominatim';

export interface DoorPin {
  lat: number;
  lng: number;
  source: DoorPinSource;
  confidence: number;   // 0–1
  plusCode?: string;    // always computed and attached by the orchestrator
  uprn?: string;
}

// ── Reverse geocode ───────────────────────────────────────────────────────────

export interface ReverseResult {
  address: string;
  postcode?: string;
  lat: number;
  lng: number;
  distanceM: number;
  source: 'os_places' | 'nominatim' | 'plus_code';
}

// ── Provider contract ─────────────────────────────────────────────────────────

export interface GeocodingProvider {
  /** Returns address candidates for a UK postcode, best-first. */
  resolvePostcodeToCandidates(postcode: string): Promise<AddressCandidate[]>;

  /**
   * Resolves a candidate ID (UPRN, W3W words, or OLC plus code) to a precise
   * door pin.  Returns null when the ID cannot be resolved.
   */
  resolveToDoorPin(addressId: string): Promise<DoorPin | null>;

  /** Nearest address to a coordinate pair. Returns null on error. */
  reverse(latlng: LatLng): Promise<ReverseResult | null>;
}
