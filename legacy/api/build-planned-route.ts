/**
 * MJ Maps Systems — Route Planning API Example
 *
 * End-to-end orchestration example:
 *  1. Compute setback for all stops
 *  2. Validate vehicle against jurisdiction rules (weight/height/width limits)
 *  3. Check requiresAccessPermit gate for artic vehicles
 *  4. Resolve address geocodes — stamp requiresPinConfirm + geocodeConfidence on each stop
 *  5. Tidal road check with drive-side correction (blocked segments get warnings + reroute time)
 *  6. Optimize route with setback-aware sequencing + HGV routing flag
 *  7. Enrich route with turn warnings, clusters, and crossings
 *  8. Return legalWarnings[], driveSide, geocode metadata, tidal risks, and totalEstimatedMinutes
 */

import { estimatePropertySetbackBatch } from '../services/property-engine/src/setback-engine';
import { optimizeRoute, type OptimizerStop } from '../services/route-optimizer/index';
import { enrichRoute } from '../services/osm/road-enricher';
import { VEHICLE_PROFILES, type VehicleProfile } from '../packages/vehicle-profiles/index';
import { validateVehicleForJurisdiction, getJurisdiction, type DriveSide } from '../services/route-engine/src/jurisdiction-rules';
import { getDwellMinutes } from '../services/route-engine/src/time-aware-solver';
import { resolveAddress } from '../services/postcode-resolver/index.js';
import {
  checkRouteForTidalRisks,
  type TidalStatus,
} from '../services/route-engine/src/tidal-checker.js';
import { getDepartureDelayMultiplier, getBestDepartureWindow } from '../services/route-engine/src/departure-optimizer.js';
import { getTrafficMultiplier } from '../services/route-engine/src/traffic-weighting.js';

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
  /** Tidal road segments that are currently blocked — driver must reroute */
  tidalWarnings: Array<{
    segmentId: string;
    segmentName: string;
    status: TidalStatus;
    country: string;
    driveSide: DriveSide;
    tidalRangeMetres: number;
    roadRiskType: string;
    driverRiskModifier: number;
    blockedProbability: number;
    nextClearTime?: string;
    rerouteMinutes: number;
  }>;
  /** Tidal segments in caution (passable but risky) — driver should verify depth */
  tidalCautions: Array<{
    segmentName: string;
    status: 'caution';
    windowCloseTime?: string;
    driverRiskNote?: string;
  }>;
  /** Sum of reroute times for all blocked tidal segments */
  tidalRerouteTotalMinutes: number;
  /** ISO-8601 datetime of earliest next-clear time across all blocked segments */
  suggestedDepartureAdjustment?: string;
  /** Best departure window for this route */
  suggestedDepartureWindow?: string;
  /** Delay vs best window in minutes */
  departureDelayMinutes?: number;
  /** Total estimated minutes for the route (traffic-weighted, includes dwell + tidal reroute) */
  totalEstimatedMinutes: number;
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
  plannedDepartureTime?: string; // ISO-8601, defaults to now
}): Promise<PlannedRouteResponse> {
  const vehicle: VehicleProfile = VEHICLE_PROFILES[input.vehicleProfileKey];
  const dwellMinutes = getDwellMinutes(vehicle.vehicleClass);
  const departureTime = input.plannedDepartureTime
    ? new Date(input.plannedDepartureTime)
    : new Date();
  const departureHour = departureTime.getHours() + departureTime.getMinutes() / 60;

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

  // ── 5. Setback ─────────────────────────────────────────────────────────────
  const setbackMap = await estimatePropertySetbackBatch(
    input.stops.map(s => ({ id: s.id, lat: s.lat, lng: s.lng, address: s.address })),
  );

  const setbackAwareStops = input.stops.map(stop => ({
    ...stop,
    setbackFromRoadM:  setbackMap.get(stop.id)?.setbackFromRoadM ?? 0,
    dwell_minutes:     dwellMinutes,
  }));

  // ── 6. Optimize ────────────────────────────────────────────────────────────
  const optimized = optimizeRoute({
    depot: input.depot,
    stops: setbackAwareStops,
  });

  // ── 7. Tidal road check ───────────────────────────────────────────────────
  const routeCoords = [
    { lat: input.depot.lat, lng: input.depot.lng },
    ...optimized.orderedStops.map(s => ({ lat: s.lat, lng: s.lng })),
  ];
  const tidalRisks = checkRouteForTidalRisks(
    routeCoords,
    departureTime,
    vehicle.vehicleClass,
  );

  const blockedSegments = tidalRisks.filter(r => r.status === 'blocked');
  const cautionSegments = tidalRisks.filter(r => r.status === 'caution');
  const totalTidalRerouteMin = blockedSegments.reduce((s, r) => s + r.rerouteMinutes, 0);

  const tidalWarnings: PlannedRouteResponse['tidalWarnings'] = blockedSegments.map(r => ({
    segmentId:           r.segment.segmentId,
    segmentName:         r.segment.name,
    status:              r.status,
    country:             r.segment.regionProfile.country,
    driveSide:           r.segment.regionProfile.driveSide,
    tidalRangeMetres:    r.segment.regionProfile.tidalRangeMetres,
    roadRiskType:        r.segment.regionProfile.roadRiskType,
    driverRiskModifier:  r.driverRiskModifier,
    blockedProbability:   r.blockedProbability,
    nextClearTime:       r.nextClearTime?.toISOString(),
    rerouteMinutes:      r.rerouteMinutes,
  }));

  const tidalCautions: PlannedRouteResponse['tidalCautions'] = cautionSegments.map(r => ({
    segmentName:   r.segment.name,
    status:        'caution' as const,
    windowCloseTime: r.windowCloseTime?.toISOString(),
    driverRiskNote: r.driverRiskModifier > 1.0
      ? 'Right-drive road: sea approaches passenger side — verify road depth before crossing'
      : undefined,
  }));

  // Earliest next-clear time across all blocked segments
  const nextClearTimes = blockedSegments
    .map(r => r.nextClearTime)
    .filter((t): t is Date => t !== undefined)
    .sort((a, b) => a.getTime() - b.getTime());
  const suggestedDepartureAdjustment = nextClearTimes[0]?.toISOString();

  // ── 8. Departure window advice ─────────────────────────────────────────────
  const bestWindow = getBestDepartureWindow(departureHour);
  const trafficMultiplier = getTrafficMultiplier(departureTime);
  const delayMultiplier = getDepartureDelayMultiplier(departureHour);

  // ── 9. Enrich ─────────────────────────────────────────────────────────────
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

  // ── 10. Total time estimate ────────────────────────────────────────────────
  // base route time from optimized result (km / avg speed)
  const baseRouteMinutes = optimized.totalDistanceKm
    ? (optimized.totalDistanceKm / 40) * 60
    : 0;
  const dwellTotalMinutes = input.stops.length * dwellMinutes;
  const trafficWeightedMinutes = baseRouteMinutes * delayMultiplier;
  const totalEstimatedMinutes = Math.round(
    trafficWeightedMinutes + dwellTotalMinutes + totalTidalRerouteMin,
  );

  return {
    optimized,
    setbacks: Array.from(setbackMap.values()),
    enriched,
    legalWarnings,
    driveSide,
    countryCode,
    stopWarnings,
    stopGeocodes,
    tidalWarnings,
    tidalCautions,
    tidalRerouteTotalMinutes: totalTidalRerouteMin,
    suggestedDepartureAdjustment,
    suggestedDepartureWindow: bestWindow.label,
    departureDelayMinutes: bestWindow.delayMinutes,
    totalEstimatedMinutes,
  };
}
