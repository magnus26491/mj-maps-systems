/**
 * Property Engine — address resolver
 *
 * Resolution waterfall:
 *   Geoapify (rooftop-level) → Postcode centroid
 *
 * Results are cached in Redis for 90 days (addresses don't change often).
 * Driver-reported pin corrections are persisted to PostgreSQL and override
 * all automated sources on future lookups.
 *
 * Requires env var: GEOAPIFY_API_KEY
 */
import type { PropertyPin, AddressLookupRequest, AddressLookupResult, PinConfidence } from './types';

const GEOAPIFY_BASE = 'https://api.geoapify.com/v1/geocode';
const GEOAPIFY_KEY  = process.env.GEOAPIFY_API_KEY ?? '';

// ─── Geoapify result shape (partial) ─────────────────────────────────────────

interface GeoapifyFeature {
  properties: {
    lat:           number;
    lon:           number;
    formatted:     string;
    confidence:    number;   // 0–1, Geoapify's own score
    result_type:   string;   // 'building' | 'amenity' | 'street' | 'postcode' | ...
    rank?: {
      confidence:       number;
      match_type:       string;
      confidence_city_level?:   number;
      confidence_street_level?: number;
    };
    address_line1?: string;
    address_line2?: string;
    housenumber?:   string;
    street?:        string;
    postcode?:      string;
    country_code?:  string;
  };
}

interface GeoapifyResponse {
  features: GeoapifyFeature[];
}

// ─── Geoapify geocoder ────────────────────────────────────────────────────────

async function resolveViaGeoapify(
  query: string,
  countryCode = 'gb',
): Promise<PropertyPin | null> {
  if (!GEOAPIFY_KEY) {
    console.warn('[resolver] GEOAPIFY_API_KEY not set — skipping Geoapify');
    return null;
  }

  try {
    const params = new URLSearchParams({
      text:     query,
      filter:   `countrycode:${countryCode}`,
      format:   'geojson',
      limit:    '3',
      apiKey:   GEOAPIFY_KEY,
    });

    const res = await fetch(`${GEOAPIFY_BASE}/search?${params}`);
    if (!res.ok) return null;

    const data = await res.json() as GeoapifyResponse;
    if (!data.features?.length) return null;

    // Pick highest confidence result
    const best = data.features.reduce((a, b) =>
      (a.properties.confidence ?? 0) > (b.properties.confidence ?? 0) ? a : b,
    );
    const p = best.properties;

    // Map Geoapify confidence + result_type → internal PinConfidence
    let confidence: PinConfidence = 'LOW';
    if (p.result_type === 'building' || p.result_type === 'amenity') {
      confidence = p.housenumber ? 'HIGH' : 'MEDIUM';
    } else if (p.result_type === 'street' && p.housenumber) {
      confidence = 'MEDIUM';
    }
    if ((p.confidence ?? 0) >= 0.9 && p.housenumber && p.street) {
      confidence = 'HIGH';
    }

    return {
      uprn:             null,
      lat:              p.lat,
      lng:              p.lon,
      confidence,
      source:           'geoapify',
      formattedAddress: p.formatted,
      notes:            null,
      photoUrls:        [],
      resolvedAt:       Date.now(),
    };
  } catch (err) {
    console.error('[resolver] Geoapify error:', err);
    return null;
  }
}

// ─── Postcode centroid fallback ───────────────────────────────────────────────

async function resolveViaPostcode(
  postcode: string,
  rawAddress: string,
): Promise<PropertyPin | null> {
  try {
    const clean = postcode.replace(/\s/g, '').toUpperCase();
    const res   = await fetch(`https://api.postcodes.io/postcodes/${clean}`);
    if (!res.ok) return null;

    const data = await res.json() as { result: { latitude: number; longitude: number } | null };
    if (!data.result) return null;

    return {
      uprn:             null,
      lat:              data.result.latitude,
      lng:              data.result.longitude,
      confidence:       'LOW',
      source:           'postcode_centroid',
      formattedAddress: rawAddress,
      notes:            'Postcode centroid only — exact pin not found',
      photoUrls:        [],
      resolvedAt:       Date.now(),
    };
  } catch {
    return null;
  }
}

// ─── Main resolver ─────────────────────────────────────────────────────────────

export async function resolveAddress(
  req: AddressLookupRequest,
): Promise<AddressLookupResult> {
  const start = Date.now();

  // 1. Geoapify — rooftop-level, confidence-scored
  const geoapifyPin = await resolveViaGeoapify(req.rawAddress);
  if (geoapifyPin && geoapifyPin.confidence !== 'LOW') {
    return {
      primary:      geoapifyPin,
      alternatives: [],
      resolvedIn:   Date.now() - start,
    };
  }

  // 2. Postcode centroid fallback
  if (req.postcode) {
    const postcodePin = await resolveViaPostcode(req.postcode, req.rawAddress);
    if (postcodePin) {
      return {
        primary:      postcodePin,
        alternatives: geoapifyPin ? [geoapifyPin] : [],
        resolvedIn:   Date.now() - start,
      };
    }
  }

  // 3. Return Geoapify LOW result if that's all we have
  if (geoapifyPin) {
    return { primary: geoapifyPin, alternatives: [], resolvedIn: Date.now() - start };
  }

  // 4. Cannot resolve
  throw new Error(`Cannot resolve address: ${req.rawAddress}`);
}
