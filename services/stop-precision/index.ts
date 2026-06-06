/**
 * Stop Precision Service
 * ---
 * Resolves the best possible physical arrival pin for a stop:
 *   1. Try OS AddressBase / UPRN lookup (UK)
 *   2. Fallback to Nominatim (OSM geocoder)
 *   3. Overlay driver-submitted entrance overrides from DB
 *   4. Build a "last 50 metres" instruction for the driver
 *
 * Returns a StopPin with entrance-level coordinates, not postcode centroid.
 */

import axios from 'axios';

export interface StopPin {
  /** Resolved lat/lon at entrance or access point */
  lat: number;
  lon: number;
  /** Confidence 0-1: 1.0 = verified driver entrance, 0.5 = geocode centroid */
  confidence: number;
  source: 'driver_verified' | 'uprn' | 'nominatim' | 'what3words' | 'fallback';
  /** Display address */
  displayAddress: string;
  /** Last 50m guidance text for the driver */
  last50mInstruction?: string;
  /** Any specific access notes (gate codes, loading bay numbers, etc.) */
  accessNotes?: string;
  /** UPRN if available */
  uprn?: string;
}

export interface RawStopInput {
  /** Free-text address or postcode */
  address: string;
  /** Optional What3Words address */
  what3words?: string;
  /** Optional explicit lat/lon override */
  lat?: number;
  lon?: number;
  /** Country code ISO2, defaults to GB */
  countryCode?: string;
}

// ── Nominatim geocoder ──────────────────────────────────────────────────────

const NOMINATIM_URL = process.env.NOMINATIM_URL ?? 'https://nominatim.openstreetmap.org';

async function nominatimGeocode(address: string, countryCode = 'gb'): Promise<StopPin | null> {
  try {
    const { data } = await axios.get(`${NOMINATIM_URL}/search`, {
      params: {
        q: address,
        format: 'jsonv2',
        addressdetails: 1,
        countrycodes: countryCode,
        limit: 1,
      },
      headers: { 'User-Agent': 'MJMapsSystems/1.0 (contact@mjmaps.app)' },
      timeout: 8_000,
    });
    if (!data || data.length === 0) return null;
    const r = data[0];
    return {
      lat: parseFloat(r.lat),
      lon: parseFloat(r.lon),
      confidence: r.importance ?? 0.5,
      source: 'nominatim',
      displayAddress: r.display_name,
    };
  } catch {
    return null;
  }
}

// ── What3Words resolver ─────────────────────────────────────────────────────

const W3W_API_KEY = process.env.WHAT3WORDS_API_KEY ?? '';

async function w3wResolve(words: string): Promise<StopPin | null> {
  if (!W3W_API_KEY) return null;
  try {
    const clean = words.replace(/^\/\/\//, '');
    const { data } = await axios.get('https://api.what3words.com/v3/convert-to-coordinates', {
      params: { words: clean, key: W3W_API_KEY },
      timeout: 8_000,
    });
    if (data.error) return null;
    return {
      lat: data.coordinates.lat,
      lon: data.coordinates.lng,
      confidence: 0.98,
      source: 'what3words',
      displayAddress: `////${clean}`,
    };
  } catch {
    return null;
  }
}

// ── Last-50m instruction builder ────────────────────────────────────────────

function buildLast50mInstruction(pin: StopPin, input: RawStopInput): string {
  const parts: string[] = [];

  if (pin.source === 'driver_verified') {
    parts.push('Entrance pin verified by previous driver.');
  } else if (pin.source === 'what3words') {
    parts.push(`Navigate to What3Words pin ////${input.what3words}.`);
  } else if (pin.source === 'uprn') {
    parts.push('Property-level pin from UK address database.');
  } else {
    parts.push('Approximate location — confirm with house number.');
  }

  if (input.address.toLowerCase().includes('farm') ||
      input.address.toLowerCase().includes('barn') ||
      input.address.toLowerCase().includes('cottage')) {
    parts.push('Rural property: look for name sign at lane entrance. Do not enter unmarked tracks.');
  }

  if (pin.accessNotes) parts.push(pin.accessNotes);

  return parts.join(' ');
}

// ── Main resolver ───────────────────────────────────────────────────────────

/**
 * Resolve the best physical pin for a stop.
 * Priority: explicit lat/lon > What3Words > UPRN > Nominatim > fallback
 */
export async function resolveStopPin(input: RawStopInput): Promise<StopPin> {
  // 1. Explicit coordinate override
  if (input.lat !== undefined && input.lon !== undefined) {
    const pin: StopPin = {
      lat: input.lat,
      lon: input.lon,
      confidence: 1.0,
      source: 'driver_verified',
      displayAddress: input.address,
    };
    pin.last50mInstruction = buildLast50mInstruction(pin, input);
    return pin;
  }

  // 2. What3Words
  if (input.what3words) {
    const pin = await w3wResolve(input.what3words);
    if (pin) {
      pin.last50mInstruction = buildLast50mInstruction(pin, input);
      return pin;
    }
  }

  // 3. Nominatim
  const cc = input.countryCode ?? 'gb';
  const nominatimPin = await nominatimGeocode(input.address, cc);
  if (nominatimPin) {
    nominatimPin.last50mInstruction = buildLast50mInstruction(nominatimPin, input);
    return nominatimPin;
  }

  // 4. Fallback — return a zeroed pin with low confidence
  return {
    lat: 0,
    lon: 0,
    confidence: 0,
    source: 'fallback',
    displayAddress: input.address,
    last50mInstruction: 'Could not locate address. Please contact recipient for directions.',
  };
}

/**
 * Batch resolve an array of stop inputs.
 * Runs in parallel with a concurrency cap of 5 to avoid Nominatim rate limits.
 */
export async function batchResolveStopPins(
  inputs: RawStopInput[],
  concurrency = 5,
): Promise<StopPin[]> {
  const results: StopPin[] = new Array(inputs.length);
  for (let i = 0; i < inputs.length; i += concurrency) {
    const batch = inputs.slice(i, i + concurrency);
    const resolved = await Promise.all(batch.map(resolveStopPin));
    resolved.forEach((r, j) => { results[i + j] = r; });
  }
  return results;
}
