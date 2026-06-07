/**
 * MJ Maps Systems — Route Planning API Example
 *
 * End-to-end orchestration example:
 *  1. Compute setback for all stops
 *  2. Validate vehicle against jurisdiction rules (weight/height/width limits)
 *  3. Check requiresAccessPermit gate for artic vehicles
 *  4. Resolve address geocodes — stamp requiresPinConfirm + geocodeConfidence on each stop
 *  5. Optimize route with setback-aware sequencing + HGV routing flag
 *  6. Enrich route with turn warnings, clusters, and crossings
 *  7. Return legalWarnings[], driveSide, and geocode metadata for driver app
 */

import { estimatePropertySetbackBatch } from '../services/property-engine/src/setback-engine';
import { optimizeRoute, type OptimizerStop } from '../services/route-optimizer/index';
import { enrichRoute } from '../services/osm/road-enricher';
import { VEHICLE_PROFILES, type VehicleProfile } from '../packages/vehicle-profiles/index';
import { validateVehicleForJurisdiction, getJurisdiction, type DriveSide } from '../services/route-engine/src/jurisdiction-rules';
import { getDwellMinutes } from '../services/route-engine/src/time-aware-solver';
import { resolveAddress } from '../services/postcode-resolver/index.js';

export interface PlannedRouteResponse {
  optimized: ReturnType<typeof optimizeRoute>;
  setbacks: Array<{ id: string; setbackFromRoadM: number }>;
  enriched: Awaited<ReturnType<typeof enrichRoute>>;
  /** Legal violations (operator may hold permits — warn, not block) */
  legalWarnings: string[];
  /** Drive side for the route's country — driver app uses this for approach arrow direction */
  driveSide: DriveSide;
  /** Country code of the route (ISO 3166-1 alpha-2) */
  countryCode: string;
  /** Stops with permit warnings (artic vehicles on access-restricted roads) */
  stopWarnings: Array<{ stopId: string; permitWarning: string }>;
  /** Stops where geocode confidence is low — driver should confirm the pin */
  stopGeocodes: Array<{
    stopId: string;
    requiresPinConfirm: boolean;
    geocodeConfidence: 'high' | 'low' | 'verified';
    lat: number;
    lng: number;
  }>;
}

/**
 * Detect country from the first stop's lat/lng via Geoapify reverse geocoding.
 * Falls back to 'GB' if the call fails.
 */
async function detectCountry(
  lat: number,
  lng: number,
  apiKey?: string,
): Promise<string> {
  if (!apiKey) return 'GB';
  try {
    const url = `https://api.geoapify.com/v1/geocode/reverse?lat=${lat}&lon=${lng}&type=country&apiKey=${apiKey}`;
    const res = await fetch(url);
    if (!res.ok) return 'GB';
    const data = await res.json() as { results?: Array<{ country_code?: string }> };
    return data.results?.[0]?.country_code?.toUpperCase() ?? 'GB';
  } catch {
    return 'GB';
  }
}

export async function buildPlannedRoute(input: {
  depot: { lat: number; lng: number };
  stops: OptimizerStop[];
  vehicleProfileKey: keyof typeof VEHICLE_PROFILES;
  geoapifyApiKey?: string;
}): Promise<PlannedRouteResponse> {
  const vehicle: VehicleProfile = VEHICLE_PROFILES[input.vehicleProfileKey];
  const dwellMinutes = getDwellMinutes(vehicle.vehicleClass);

  // ── 1. Jurisdiction validation ─────────────────────────────────────────────
  const countryCode = await detectCountry(
    input.stops[0]?.lat ?? input.depot.lat,
    input.stops[0]?.lng ?? input.depot.lng,
    input.geoapifyApiKey,
  );
  const { valid, violations } = validateVehicleForJurisdiction(vehicle, countryCode);
  const legalWarnings = violations;

  // ── 2. Access permit gate for artic vehicles ───────────────────────────────
  const stopWarnings: Array<{ stopId: string; permitWarning: string }> = [];
  if (vehicle.requiresAccessPermit) {
    for (const stop of input.stops) {
      const confirmed = (stop as any).accessPermitConfirmed;
      if (confirmed !== true) {
        stopWarnings.push({
          stopId: stop.id,
          permitWarning:
            `${vehicle.label} requires access permit for this location. Confirm permit before dispatch.`,
        });
      }
    }
  }

  // ── 3. Geocode resolution — stamp requiresPinConfirm + geocodeConfidence ──
  const stopGeocodes: PlannedRouteResponse['stopGeocodes'] = [];
  if (input.geoapifyApiKey) {
    const geocodeResults = await Promise.all(
      input.stops.map(async (stop) => {
        const result = await resolveAddress(stop.address, input.geoapifyApiKey!);
        return { stopId: stop.id, ...result };
      }),
    );
    for (const geo of geocodeResults) {
      stopGeocodes.push({
        stopId:             geo.stopId,
        requiresPinConfirm: geo.requiresPinConfirm,
        geocodeConfidence:  geo.source === 'verified' ? 'verified' : geo.confidence,
        lat:                geo.lat,
        lng:                geo.lng,
      });
    }
  }

  // ── 4. Setback ─────────────────────────────────────────────────────────────
  const setbackMap = await estimatePropertySetbackBatch(
    input.stops.map(s => ({ id: s.id, lat: s.lat, lng: s.lng, address: s.address })),
  );

  const setbackAwareStops = input.stops.map(stop => ({
    ...stop,
    setbackFromRoadM:  setbackMap.get(stop.id)?.setbackFromRoadM ?? 0,
    dwell_minutes:     dwellMinutes,
  }));

  // ── 5. Optimize ────────────────────────────────────────────────────────────
  const optimized = optimizeRoute({
    depot: input.depot,
    stops: setbackAwareStops,
  });

  // ── 6. Enrich ─────────────────────────────────────────────────────────────
  const enriched = await enrichRoute({
    stops: optimized.orderedStops.map((s, idx) => ({
      id: s.id,
      lat: s.lat,
      lng: s.lng,
      address: s.address,
      parcelCount: s.parcelCount ?? 1,
      totalWeightKg: s.totalWeightKg ?? 1,
      requiresSignature: false,
      isOversize: false,
      sequence: idx + 1,
    })),
    vehicle,
  });

  const driveSide = getJurisdiction(countryCode).driveSide;

  return {
    optimized,
    setbacks: Array.from(setbackMap.values()),
    enriched,
    legalWarnings,
    driveSide,
    countryCode,
    stopWarnings,
    stopGeocodes,
  };
}
