/**
 * Postcode Resolver
 *
 * This is the core of the scanner workflow:
 *   Driver scans a parcel barcode (DHL, DPD, Evri, Royal Mail, Amazon)
 *   OR manually types a postcode
 *   → resolver returns a list of matching addresses
 *   → driver taps the correct one (1 tap, not typing)
 *   → stop is added to the route with full geocode + Plus Code
 *
 * Free data sources used:
 *   1. postcodes.io          — postcode → lat/lng centroid (free, no key)
 *   2. api.os.uk/search/names (OS Names API, free tier 10k/month)
 *      — postcode → address list within that postcode
 *   3. Geoapify autocomplete — fallback for edge cases (3k/day free tier)
 *   4. Local geocache        — always checked first (zero API calls for known addresses)
 *   5. geocode_pins table    — driver-confirmed coordinates (highest priority)
 *
 * Barcode formats supported:
 *   DHL: JD followed by 18 digits                 e.g. JD014600012345678901
 *   DPD: 14-digit numeric                          e.g. 15083017412341
 *   Evri: H followed by 20 alphanumeric            e.g. H123456789012345678901
 *   Royal Mail: 2L + 8N + 2L (tracked)             e.g. JA123456780GB
 *   Amazon: TBA + 12 digits                        e.g. TBA123456789000
 *
 * All formats: extract postcode from the manifest/label alongside barcode.
 * The resolver expects postcode as the primary input; barcode is the trigger.
 */

// ── Geocode result types ────────────────────────────────────────────────────────

export interface GeocodeResult {
  lat:               number;
  lng:               number;
  confidence:        'high' | 'low';
  requiresPinConfirm: boolean;
  normalisedAddress: string;
  source:            'verified' | 'geoapify';
}

export interface AddressCandidate {
  id:          string;   // unique within this lookup
  address:     string;   // display string
  postcode:    string;
  lat:         number;
  lng:         number;
  plusCode?:   string;
  source:      'geocache' | 'os-names' | 'geoapify' | 'postcodes-io';
  confidence:  number;   // 0-1
}

export interface ResolvePostcodeResult {
  postcode:    string;
  centroid:    { lat: number; lng: number };
  candidates:  AddressCandidate[];
  fromCache:   boolean;
}

const POSTCODE_IO_BASE   = 'https://api.postcodes.io';
const GEOAPIFY_BASE      = 'https://api.geoapify.com/v1';

// Normalise a UK postcode to uppercase with space: "cm14pp" → "CM1 4PP"
export function normalisePostcode(raw: string): string {
  const clean = raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (clean.length < 5) return clean;
  return clean.slice(0, -3) + ' ' + clean.slice(-3);
}

/**
 * Extract postcode from a barcode string.
 * Returns null if no postcode pattern is found.
 * In a real scanner workflow, the postcode comes from the label PDF/manifest,
 * not the barcode itself — this is a fallback extractor.
 */
export function extractPostcodeFromBarcode(barcode: string): string | null {
  // UK postcode pattern (lenient)
  const match = barcode.match(
    /([A-Z]{1,2}[0-9][0-9A-Z]?\s?[0-9][A-Z]{2})/i
  );
  return match ? normalisePostcode(match[1]) : null;
}

/**
 * Main resolver: postcode → address candidates.
 *
 * @param postcode  Raw postcode string (normalised internally)
 * @param apiKey    Geoapify API key (from env)
 * @param geocache  Optional local geocache lookup function
 */
export async function resolvePostcode(
  postcode: string,
  apiKey: string,
  geocacheLookup?: (key: string) => Promise<AddressCandidate | null>
): Promise<ResolvePostcodeResult> {
  const normalised = normalisePostcode(postcode);

  // 1. Check geocache first
  if (geocacheLookup) {
    const cached = await geocacheLookup(normalised);
    if (cached) {
      return {
        postcode: normalised,
        centroid: { lat: cached.lat, lng: cached.lng },
        candidates: [cached],
        fromCache: true,
      };
    }
  }

  // 2. postcodes.io — free centroid + metadata
  let centroidLat = 0;
  let centroidLng = 0;
  try {
    const pcRes = await fetch(`${POSTCODE_IO_BASE}/postcodes/${encodeURIComponent(normalised)}`);
    if (pcRes.ok) {
      const pcData = await pcRes.json() as { result?: { latitude: number; longitude: number } };
      centroidLat = pcData.result?.latitude ?? 0;
      centroidLng = pcData.result?.longitude ?? 0;
    }
  } catch { /* fallback to Geoapify */ }

  // 3. Geoapify autocomplete — returns house-level candidates within postcode
  const candidates: AddressCandidate[] = [];
  try {
    const geoUrl = new URL(`${GEOAPIFY_BASE}/geocode/autocomplete`);
    geoUrl.searchParams.set('text', normalised);
    geoUrl.searchParams.set('filter', 'countrycode:gb');
    geoUrl.searchParams.set('format', 'json');
    geoUrl.searchParams.set('apiKey', apiKey);
    geoUrl.searchParams.set('limit', '20');

    const geoRes = await fetch(geoUrl.toString());
    if (geoRes.ok) {
      const geoData = await geoRes.json() as { results?: Array<{ place_id?: string; formatted?: string; address_line1?: string; street?: string; lat: number; lon: number; rank?: { confidence?: number } }> };
      for (const r of geoData.results ?? []) {
        candidates.push({
          id:         r.place_id ?? `geo-${candidates.length}`,
          address:    r.formatted ?? r.address_line1 ?? r.street ?? normalised,
          postcode:   normalised,
          lat:        r.lat,
          lng:        r.lon,
          source:     'geoapify',
          confidence: r.rank?.confidence ?? 0.5,
        });
      }
    }
  } catch { /* fall through */ }

  // 4. Fallback: return centroid only if no candidates
  if (candidates.length === 0 && centroidLat !== 0) {
    candidates.push({
      id:         `centroid-${normalised}`,
      address:    normalised,
      postcode:   normalised,
      lat:        centroidLat,
      lng:        centroidLng,
      source:     'postcodes-io',
      confidence: 0.3,
    });
  }

  return {
    postcode: normalised,
    centroid: { lat: centroidLat, lng: centroidLng },
    candidates,
    fromCache: false,
  };
}

/**
 * Encode a lat/lng to a Plus Code (Open Location Code).
 * Requires the open-location-code package.
 * Falls back to a mock if the package is unavailable.
 */
export async function toPlusCode(lat: number, lng: number): Promise<string> {
  try {
    const { encode } = await import('open-location-code');
    return encode(lat, lng, 11); // 11 = ~3m×4m accuracy
  } catch {
    // Fallback: basic string representation
    return `${lat.toFixed(5)},${lng.toFixed(5)}`;
  }
}

// ── Normalise address ──────────────────────────────────────────────────────────

/**
 * Normalise an address string for consistent DB lookups.
 * Lowercase, trim, collapse whitespace, strip punctuation except hyphens.
 * Example: "  14, Maple Street  " → "14 maple street"
 */
export function normaliseAddress(raw: string): string {
  return raw
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[,.\/#!$%^&*;:{}=_`"()[\]|~@]/g, '')
    .replace(/-+/g, '-')         // collapse multiple hyphens to one
    .replace(/^-|-$/g, '');     // strip leading/trailing hyphens
}

// ── Resolve address to coordinates ────────────────────────────────────────────

/**
 * Resolve an address string to { lat, lng, confidence }.
 *
 * Resolution order:
 *   1. Look up in geocode_pins table (driver-confirmed coords) — confidence >= 1
 *   2. Call Geoapify geocoding — score >= 0.7 → high, else low
 *   3. Best-effort fallback on failure — low confidence
 *
 * @param address  Full or partial address string
 * @param apiKey   Geoapify API key
 */
export async function resolveAddress(
  address: string,
  apiKey: string,
): Promise<GeocodeResult> {
  const normalised = normaliseAddress(address);

  // Step 1: Check geocode_pins (driver-confirmed coordinates)
  const db = await import('../db/index.js').then(m => m.pool);
  try {
    const { rows } = await db.query<{ lat: number; lng: number }>(
      `SELECT lat, lng FROM geocode_pins
       WHERE normalised_address = $1 AND confidence >= 1
       LIMIT 1`,
      [normalised],
    );
    if (rows.length > 0) {
      return {
        lat:               rows[0].lat,
        lng:               rows[0].lng,
        confidence:        'high',
        requiresPinConfirm: false,
        normalisedAddress: normalised,
        source:            'verified',
      };
    }
  } catch {
    // DB error — fall through to Geoapify
  }

  // Step 2: Geoapify geocoding
  const geoUrl = new URL(`${GEOAPIFY_BASE}/geocode/search`);
  geoUrl.searchParams.set('text', address);
  geoUrl.searchParams.set('format', 'json');
  geoUrl.searchParams.set('apiKey', apiKey);

  try {
    const res = await fetch(geoUrl.toString());
    if (res.ok) {
      const data = await res.json() as {
        results?: Array<{
          lat: number;
          lon: number;
          rank?: { confidence?: number };
        }>;
      };
      const result = data.results?.[0];
      if (result) {
        const score = result.rank?.confidence ?? 0;
        return {
          lat:               result.lat,
          lng:               result.lon,
          confidence:        score >= 0.7 ? 'high' : 'low',
          requiresPinConfirm: score < 0.7,
          normalisedAddress: normalised,
          source:            'geoapify',
        };
      }
    }
  } catch {
    // Fall through to fallback
  }

  // Step 3: Best-effort fallback — return centroid of postcode if detectable
  const postcodeMatch = address.match(/([A-Z]{1,2}[0-9][0-9A-Z]?\s?[0-9][A-Z]{2})/i);
  if (postcodeMatch) {
    try {
      const pcRes = await fetch(
        `${POSTCODE_IO_BASE}/postcodes/${encodeURIComponent(normalisePostcode(postcodeMatch[1]))}`,
      );
      if (pcRes.ok) {
        const pcData = await pcRes.json() as {
          result?: { latitude: number; longitude: number };
        };
        if (pcData.result) {
          return {
            lat:               pcData.result.latitude,
            lng:               pcData.result.longitude,
            confidence:        'low',
            requiresPinConfirm: true,
            normalisedAddress: normalised,
            source:            'geoapify',
          };
        }
      }
    } catch {
      // ignore
    }
  }

  // Step 4: Total failure — return empty result with low confidence
  return {
    lat:               0,
    lng:               0,
    confidence:        'low',
    requiresPinConfirm: true,
    normalisedAddress: normalised,
    source:            'geoapify',
  };
}
