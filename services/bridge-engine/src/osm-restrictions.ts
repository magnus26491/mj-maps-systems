/**
 * Bridge / OSM Restriction Queries
 * Fetches bridge clearance, weight limits, and access restrictions
 * for a given location using the Overpass API.
 */

import { runOverpassQuery } from '../../osm/overpass-client';
import {
  computeBridgeScore,
  getBridgeAlert,
  type VehicleProfile,
  type BridgeScoreResult,
  type TurnAlert,
} from '../../../packages/vehicle-profiles/index';

export interface BridgeRestriction {
  osmId: number;
  lat: number;
  lng: number;
  clearanceM: number | null;
  maxWeightT: number | null;
  name: string | null;
  scoreResult: BridgeScoreResult;
  alert: TurnAlert;
  /** OSM layer of this bridge way — 1 = one level above ground, etc. */
  layer: number;
}

/**
 * Find all bridges within radiusM of a point and score them for the given vehicle.
 *
 * @param driverLayer - OSM layer the driver is currently on (from getRoadContext().road.layer).
 *   When provided, bridges at the same or lower layer are suppressed — the driver is ON or
 *   ABOVE those structures, not passing under them.  Bridges at a higher layer (something
 *   above the driver) are still included because the driver would pass under them.
 *   Omit (or pass 0) when the driver's layer is unknown.
 */
export async function queryBridgesNear(
  lat: number,
  lng: number,
  vehicle: VehicleProfile,
  radiusM = 200,
  driverLayer = 0,
): Promise<BridgeRestriction[]> {
  const query = `
    [out:json][timeout:15];
    (
      way(around:${radiusM},${lat},${lng})["bridge"="yes"];
      way(around:${radiusM},${lat},${lng})["maxheight"];
    );
    out body center;
  `;

  const data = await runOverpassQuery(query);
  const elements: any[] = (data as any).elements ?? [];

  const bridges: BridgeRestriction[] = [];

  for (const el of elements) {
    if (!el.tags) continue;

    const layer = parseInt(el.tags.layer ?? '1', 10); // bridges default to layer=1

    // If the driver is at the same or higher layer, they are ON or ABOVE this bridge
    // structure — the clearance restriction applies to traffic passing underneath, not
    // to the driver.  Only warn about structures that are ABOVE the driver (layer > driverLayer).
    if (layer <= driverLayer) continue;

    const clearanceM = el.tags.maxheight
      ? parseFloat(el.tags.maxheight)
      : null;

    const maxWeightT = el.tags.maxweight
      ? parseFloat(el.tags.maxweight)
      : null;

    const score = computeBridgeScore(
      vehicle,
      clearanceM ?? (vehicle.heightM + 1.0), // assume 1m headroom if no data
      clearanceM ? 'measured' : 'unknown',
    );

    const alert = getBridgeAlert(score, vehicle.label);

    bridges.push({
      osmId: el.id,
      lat: el.center?.lat ?? lat,
      lng: el.center?.lon ?? lng,
      clearanceM,
      maxWeightT,
      name: el.tags.name ?? null,
      scoreResult: score,
      alert,
      layer,
    });
  }

  return bridges;
}

/**
 * Fetch OSM restrictions for a single road segment by lat/lng.
 * Returns bridge/weight/height restrictions within 100m of the point.
 * Pass driverLayer (from getRoadContext road.layer) to suppress false positives
 * when the driver is on an elevated road (bridge) and the restriction is below them.
 * Used by bridge-engine/src/index.ts.
 */
export async function fetchRestrictionsForSegment(
  lat: number,
  lng: number,
  vehicle: VehicleProfile,
  driverLayer = 0,
): Promise<BridgeRestriction[]> {
  return queryBridgesNear(lat, lng, vehicle, 100, driverLayer);
}
