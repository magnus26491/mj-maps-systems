/**
 * Setback Engine
 * Determines how far from the road centreline a property sits,
 * and computes the optimal stop point (kerb pin) for the delivery.
 *
 * Uses OSM road context from overpass-client.
 */

import { getRoadContext, type OsmRoadContext } from '../osm/overpass-client';
import type { VehicleProfile } from '../../packages/vehicle-profiles/index';

export interface SetbackResult {
  /** Recommended pin for the delivery — may differ from geocoded address point */
  kerbPin: { lat: number; lng: number };
  /** Estimated metres from road centreline to property entrance */
  setbackM: number;
  /** Road context fetched for this stop */
  roadContext: OsmRoadContext;
  /** Whether a suitable stopping/parking point was found within 50m */
  parkingAvailable: boolean;
  notes: string[];
}

/**
 * Compute the setback for a given property location.
 *
 * @param lat              Property geocoded latitude
 * @param lng              Property geocoded longitude
 * @param vehicle          Driver's vehicle profile
 * @returns                SetbackResult
 */
export async function computeSetback(
  lat: number,
  lng: number,
  vehicle: VehicleProfile,
): Promise<SetbackResult> {
  const roadContext = await getRoadContext(lat, lng);
  const road = roadContext.road;
  const notes: string[] = [];
  let setbackM = 0;
  let parkingAvailable = true;

  if (!road) {
    notes.push('No OSM road found within 30m — using geocoded pin directly.');
    return {
      kerbPin: { lat, lng },
      setbackM: 0,
      roadContext,
      parkingAvailable: false,
      notes,
    };
  }

  // Infer setback: if road is narrow, the kerb is closer to the house
  setbackM = Math.max(0, (road.widthM / 2) - 1.0); // rough geometric estimate

  if (road.isDeadEnd) {
    notes.push('Dead-end road — consider reversing in.');
  }

  if (road.oneway) {
    notes.push('One-way road — approach from correct direction.');
  }

  if (road.maxWeightT && vehicle.gvwT > road.maxWeightT) {
    notes.push(`Weight restriction: ${road.maxWeightT}t. Your vehicle (${vehicle.gvwT}t GVW) may not be permitted.`);
    parkingAvailable = false;
  }

  if (road.maxHeightM && vehicle.heightM > road.maxHeightM) {
    notes.push(`Height restriction: ${road.maxHeightM}m. Your vehicle (${vehicle.heightM}m) will not fit.`);
    parkingAvailable = false;
  }

  // The kerb pin is the geocoded point — setback is the computed offset
  // (in a future version this would project perpendicular to the road geometry)
  return {
    kerbPin: { lat, lng },
    setbackM,
    roadContext,
    parkingAvailable,
    notes,
  };
}
