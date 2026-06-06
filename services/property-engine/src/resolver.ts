/**
 * Property Engine — address resolver
 *
 * Resolution waterfall:
 *   OS AddressBase → OS Names → Nominatim → Driver-reported → Postcode centroid
 *
 * Results are cached in Redis for 7 days (addresses don't change often).
 * Driver-reported pin corrections are persisted to PostgreSQL and override
 * all automated sources on future lookups.
 */
import type { PropertyPin, AddressLookupRequest, AddressLookupResult, PinConfidence } from './types';

const NOMINATIM_BASE = 'https://nominatim.openstreetmap.org';
const NOMINATIM_HEADERS = {
  'User-Agent': 'MJMaps/1.0 (magnus@mjadsystems.com)',
  'Accept-Language': 'en-GB',
};

// ─── Nominatim fallback ────────────────────────────────────────────────────

interface NominatimResult {
  lat:          string;
  lon:          string;
  display_name: string;
  type:         string;
  importance:   number;
  address: {
    house_number?: string;
    road?:         string;
    postcode?:     string;
    country_code?: string;
  };
}

async function resolveViaNominatim(
  query: string,
  countryCode = 'gb',
): Promise<PropertyPin | null> {
  try {
    const params = new URLSearchParams({
      q:              query,
      format:         'json',
      addressdetails: '1',
      limit:          '3',
      countrycodes:   countryCode,
    });

    const res = await fetch(`${NOMINATIM_BASE}/search?${params}`, {
      headers: NOMINATIM_HEADERS,
    });

    if (!res.ok) return null;

    const results: NominatimResult[] = await res.json();
    if (!results.length) return null;

    // Pick highest importance result
    const best = results.reduce((a, b) => a.importance > b.importance ? a : b);

    // Determine confidence based on result type and address detail
    let confidence: PinConfidence = 'MEDIUM';
    if (best.address.house_number && best.address.road) confidence = 'HIGH';
    if (best.type === 'house' || best.type === 'building') confidence = 'HIGH';

    return {
      uprn:             null,
      lat:              parseFloat(best.lat),
      lng:              parseFloat(best.lon),
      confidence,
      source:           'nominatim',
      formattedAddress: best.display_name,
      notes:            null,
      photoUrls:        [],
      resolvedAt:       Date.now(),
    };
  } catch {
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

    const data = await res.json();
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

  // 1. Try Nominatim first (free, no API key needed for MVP)
  const nominatimPin = await resolveViaNominatim(req.rawAddress);
  if (nominatimPin && nominatimPin.confidence !== 'LOW') {
    return {
      primary:      nominatimPin,
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
        alternatives: nominatimPin ? [nominatimPin] : [],
        resolvedIn:   Date.now() - start,
      };
    }
  }

  // 3. Return Nominatim LOW result if that's all we have
  if (nominatimPin) {
    return { primary: nominatimPin, alternatives: [], resolvedIn: Date.now() - start };
  }

  // 4. Cannot resolve
  throw new Error(`Cannot resolve address: ${req.rawAddress}`);
}
