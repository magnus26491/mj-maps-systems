/**
 * Turn Engine — resolver
 *
 * Orchestrates: OSM data fetch → scorer → result assembly.
 * This is the function the route-engine calls per stop.
 */
import type { TurnScoreResult, TurnEngineResult, VehicleProfile, RoadGeometry } from './types';
import { scoreTurn } from './scorer';
import { fetchNearestRoadSegment } from './osm-fetcher';
import { VEHICLE_PROFILES } from '../../../packages/vehicle-profiles/index';

/** Alert-level → pre-alert distance (metres before stop) */
const ALERT_DISTANCES: Record<string, number> = {
  GREEN: 0,
  AMBER: 300,
  RED:   500,
};

export interface ResolveOptions {
  lat:       number;
  lng:       number;
  vehicleId: string;
}

export async function resolveTurnScore(
  opts: ResolveOptions,
): Promise<TurnEngineResult> {
  const vehicle: VehicleProfile | undefined = VEHICLE_PROFILES[opts.vehicleId];

  if (!vehicle) {
    throw new Error(`Unknown vehicleId: ${opts.vehicleId}`);
  }

  // Fetch nearest OSM road segment
  const segment = await fetchNearestRoadSegment({ lat: opts.lat, lng: opts.lng });

  // Build RoadGeometry from segment (or fallback if null)
  const geometry: RoadGeometry = segment
    ? {
        widthM:          segment.widthM,
        maxWidthM:       null, // parsed inside osm-fetcher into widthM already
        maxHeightM:      segment.maxHeightM,
        maxWeightT:      segment.maxWeightT,
        highwayClass:    segment.tags.highway ?? null,
        isDeadEnd:       segment.isDeadEnd,
        isOneWay:        segment.tags.oneway === 'yes' || segment.tags.oneway === '1',
        hasTurningHead:  segment.hasTurningHead,
        hasPassingPlace: false,
        deadEndDepthM:   segment.lengthToEndM,
        source:          'osm',
      }
    : {
        widthM:          null,
        maxWidthM:       null,
        maxHeightM:      null,
        maxWeightT:      null,
        highwayClass:    null,
        isDeadEnd:       false,
        isOneWay:        false,
        hasTurningHead:  false,
        hasPassingPlace: false,
        deadEndDepthM:   100,
        source:          'fallback',
      };

  const scoreResult: TurnScoreResult = scoreTurn(geometry, vehicle);

  const alertDistanceM = ALERT_DISTANCES[scoreResult.alert] ?? 300;

  return {
    ...scoreResult,
    vehicleId:      opts.vehicleId,
    lat:            opts.lat,
    lng:            opts.lng,
    hasTurningHead: geometry.hasTurningHead,
    deadEndLengthM: geometry.isDeadEnd ? geometry.deadEndDepthM : null,
    alertDistanceM,
    canEnter:       scoreResult.score > 0,
    communityBlend: false,
    cached:         false,
    segment,
  };
}
