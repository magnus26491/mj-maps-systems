/**
 * MJ Maps Systems — Route Planning API Example
 *
 * End-to-end orchestration example:
 *  1. Compute setback for all stops
 *  2. Optimize route with setback-aware sequencing
 *  3. Enrich route with turn warnings, clusters, and crossings
 */

import { estimatePropertySetbackBatch } from '../property-engine/setback-engine';
import { optimizeRoute, type OptimizerStop } from '../route-optimizer/index';
import { enrichRoute } from '../osm/road-enricher';
import { VEHICLE_PROFILES } from '../../packages/vehicle-profiles/index';

export async function buildPlannedRoute(input: {
  depot: { lat: number; lng: number };
  stops: OptimizerStop[];
  vehicleProfileKey: keyof typeof VEHICLE_PROFILES;
}) {
  const setbackMap = await estimatePropertySetbackBatch(
    input.stops.map(s => ({ id: s.id, lat: s.lat, lng: s.lng, address: s.address })),
  );

  const setbackAwareStops = input.stops.map(stop => ({
    ...stop,
    setbackFromRoadM: setbackMap.get(stop.id)?.setbackFromRoadM ?? 0,
  }));

  const optimized = optimizeRoute({
    depot: input.depot,
    stops: setbackAwareStops,
  });

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
    vehicle: VEHICLE_PROFILES[input.vehicleProfileKey],
  });

  return {
    optimized,
    setbacks: Array.from(setbackMap.values()),
    enriched,
  };
}
