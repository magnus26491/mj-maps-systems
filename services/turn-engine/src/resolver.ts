/**
 * Turn Engine — resolver
 *
 * Orchestrates: OSM data fetch → cache check → scorer → result.
 * This is the function the API route calls.
 *
 * Cache strategy:
 *   - Road geometry cached in Redis for 1 hour (geometry doesn't change fast)
 *   - Community driver reports blended in at 60/40 weight if available
 *   - Fallback to highway class heuristic if Overpass times out
 */
import type { TurnScoreResult, VehicleProfile } from './types';
import { scoreTurn } from './scorer';
import { getRoadGeometry } from '../../osm/src/index';
import { VEHICLE_PROFILES } from '../../../packages/vehicle-profiles/index';

export interface ResolveOptions {
  lat:       number;
  lng:       number;
  vehicleId: string;
}

export async function resolveTurnScore(
  opts: ResolveOptions,
): Promise<TurnScoreResult> {
  const vehicle: VehicleProfile | undefined = VEHICLE_PROFILES[opts.vehicleId];

  if (!vehicle) {
    throw new Error(`Unknown vehicleId: ${opts.vehicleId}`);
  }

  // Fetch road geometry from OSM service (Redis-cached)
  const geometry = await getRoadGeometry(opts.lat, opts.lng);

  // Score the turn
  return scoreTurn(geometry, vehicle);
}
