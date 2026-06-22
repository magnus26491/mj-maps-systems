/**
 * Delivery Intake — Geocoding Resolver
 * 
 * Handles geocoding for delivery stops using existing services.
 * Wraps Geoapify + postcode.io with caching support.
 */

import type { IntakeStopInput, IntakeStopOutput, IntakeStopOutput } from './index';
import { generateStopId, normalisePostcode, isPostcode } from './index';

const GEOAPIFY_BASE = 'https://api.geoapify.com/v1/geocode';
const GEOAPIFY_KEY = process.env.GEOAPIFY_API_KEY ?? '';

interface GeoapifyFeature {
  properties: {
    lat: number;
    lon: number;
    formatted: string;
    confidence: number;
    result_type: string;
    housenumber?: string;
    street?: string;
    postcode?: string;
  };
}

interface GeoapifyResponse {
  features: GeoapifyFeature[];
}

interface PostcodeResponse {
  result: {
    latitude: number;
    longitude: number;
  } | null;
}

/**
 * Resolve a single stop using Geoapify
 */
export async function resolveStop(input: IntakeStopInput): Promise<{
  lat: number | null;
  lng: number | null;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW' | 'UNRESOLVED';
  source: 'geoapify' | 'postcode_centroid' | 'none';
  formattedAddress: string;
}> {
  const startTime = Date.now();
  
  // Try Geoapify first
  if (GEOAPIFY_KEY) {
    try {
      const params = new URLSearchParams({
        text: input.address,
        filter: 'countrycode:gb',
        format: 'geojson',
        limit: '1',
        apiKey: GEOAPIFY_KEY,
      });
      
      const res = await fetch(`${GEOAPIFY_BASE}/search?${params}`);
      if (res.ok) {
        const data = await res.json() as GeoapifyResponse;
        if (data.features?.length > 0) {
          const feature = data.features[0];
          const p = feature.properties;
          
          // Calculate confidence
          let confidence: 'HIGH' | 'MEDIUM' | 'LOW' = 'LOW';
          if (p.result_type === 'building' || p.result_type === 'amenity') {
            confidence = p.housenumber ? 'HIGH' : 'MEDIUM';
          } else if (p.result_type === 'street' && p.housenumber) {
            confidence = 'MEDIUM';
          }
          if ((p.confidence ?? 0) >= 0.9 && p.housenumber && p.street) {
            confidence = 'HIGH';
          }
          
          return {
            lat: p.lat,
            lng: p.lon,
            confidence,
            source: 'geoapify',
            formattedAddress: p.formatted,
          };
        }
      }
    } catch (err) {
      console.error('[delivery-intake] Geoapify error:', err);
    }
  }
  
  // Fallback to postcode centroid if we have a postcode
  if (input.postcode) {
    const formatted = normalisePostcode(input.postcode);
    if (formatted) {
      try {
        const clean = formatted.replace(/\s/g, '');
        const res = await fetch(`https://api.postcodes.io/postcodes/${clean}`);
        if (res.ok) {
          const data = await res.json() as PostcodeResponse;
          if (data.result) {
            return {
              lat: data.result.latitude,
              lng: data.result.longitude,
              confidence: 'LOW',
              source: 'postcode_centroid',
              formattedAddress: input.address,
            };
          }
        }
      } catch (err) {
        console.error('[delivery-intake] Postcode.io error:', err);
      }
    }
  }
  
  return {
    lat: null,
    lng: null,
    confidence: 'UNRESOLVED',
    source: 'none',
    formattedAddress: input.address,
  };
}

/**
 * Convert IntakeStopInput to IntakeStopOutput
 */
export async function processStop(
  input: IntakeStopInput,
  seenAddresses: Map<string, string>
): Promise<IntakeStopOutput> {
  const id = generateStopId();
  const startTime = Date.now();
  
  // Resolve geocode
  const { lat, lng, confidence, source, formattedAddress } = await resolveStop(input);
  
  // Check for duplicates
  let duplicateStatus: 'UNIQUE' | 'DUPLICATE_EXACT' | 'DUPLICATE_SIMILAR' = 'UNIQUE';
  let duplicateOf: string | undefined;
  
  const normalizedAddr = input.address.toLowerCase().replace(/\s+/g, ' ');
  for (const [existingAddr, existingId] of seenAddresses) {
    if (normalizedAddr === existingAddr) {
      duplicateStatus = 'DUPLICATE_EXACT';
      duplicateOf = existingId;
      break;
    }
  }
  
  // Record this address for future duplicate detection
  if (duplicateStatus === 'UNIQUE') {
    seenAddresses.set(normalizedAddr, id);
  }
  
  return {
    id,
    address: formattedAddress || input.address,
    postcode: input.postcode ? normalisePostcode(input.postcode) ?? null : null,
    lat,
    lng,
    confidence,
    source,
    duplicateStatus,
    duplicateOf,
    riskFactors: [], // Risk assessment done separately
    reference: input.reference,
    notes: input.notes,
    parcelCount: input.parcelCount ?? 1,
    resolvedIn: Date.now() - startTime,
  };
}
