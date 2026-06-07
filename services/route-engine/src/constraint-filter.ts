/**
 * Constraint Filter
 * Removes stops that cannot be serviced by the selected vehicle profile.
 */

import { VEHICLE_PROFILES } from '../../../packages/vehicle-profiles/index';
import type { StopPoint } from './types';

export function filterConstraints(stops: StopPoint[], vehicleId: string): StopPoint[] {
  const profile = (VEHICLE_PROFILES as Record<string, any>)[vehicleId];
  if (!profile) return stops; // unknown vehicle — pass all through

  return stops.filter(stop => {
    const r = stop.restrictions;
    if (!r) return true;

    // Weight restriction
    if (r.maxWeightT !== undefined && profile.gvwT > r.maxWeightT) return false;

    // Height restriction
    if (r.maxHeightM !== undefined && profile.heightM > r.maxHeightM) return false;

    // Width restriction
    if (r.maxWidthM !== undefined && profile.widthM > r.maxWidthM) return false;

    // No HGV
    if (r.noHgv && profile.hgvRouting) return false;

    // Pre-computed turn score: skip stops with extremely low score (< 0.15)
    if (stop.turnScore !== undefined && stop.turnScore < 0.15) return false;

    return true;
  });
}
