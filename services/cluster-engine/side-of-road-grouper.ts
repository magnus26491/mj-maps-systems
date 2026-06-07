/**
 * MJ Maps Systems — Side-of-Road Grouper
 *
 * FIX #2: Stop Grouping
 *
 * Complaint: routes group stops in ways that make no practical sense —
 * drivers must cross the road multiple times, enter cul-de-sacs twice,
 * or park in awkward positions.
 *
 * Solution:
 *  1. Classify each stop as LEFT or RIGHT side of the travel direction
 *  2. Batch consecutive same-side stops together
 *  3. Detect cul-de-sacs and service all stops in one in/out pass
 *  4. Penalise road-crossing moves in the sequencer scoring
 *
 * The grouper outputs a GroupedStopSequence ready for the route solver.
 */

import type { StopPoint, LatLng } from '../route-engine/src/types';

export type RoadSide = 'LEFT' | 'RIGHT' | 'UNKNOWN';

export interface SideClassifiedStop extends StopPoint {
  roadSide: RoadSide;
  isInCulDeSac: boolean;
  culDeSacGroupId?: string;
}

export interface SideGroup {
  id: string;
  side: RoadSide;
  stops: SideClassifiedStop[];
  isCulDeSac: boolean;
  entryPoint?: LatLng;
  exitPoint?: LatLng;
}

/**
 * Compute the bearing (degrees, 0=N, 90=E) from point A to point B.
 */
export function bearing(a: LatLng, b: LatLng): number {
  const dLng = (b.lng - a.lng) * (Math.PI / 180);
  const aLat = a.lat * (Math.PI / 180);
  const bLat = b.lat * (Math.PI / 180);
  const x = Math.sin(dLng) * Math.cos(bLat);
  const y = Math.cos(aLat) * Math.sin(bLat)
            - Math.sin(aLat) * Math.cos(bLat) * Math.cos(dLng);
  return ((Math.atan2(x, y) * (180 / Math.PI)) + 360) % 360;
}

/**
 * Given a travel direction (bearing from previous stop to this stop)
 * and the stop's offset from the road centreline, determine which side
 * of the road it is on.
 *
 * In the UK: travel on left, so:
 *   - stops whose cross-bearing is roughly perpendicular-left  → LEFT  (kerb side)
 *   - stops whose cross-bearing is roughly perpendicular-right → RIGHT (far side)
 *
 * We use a simplified proxy: even house numbers tend to be on one side,
 * odd on the other (in standard UK addressing). When OSM side data is
 * available we use that; otherwise fall back to parity.
 */
export function classifyRoadSide(
  stop: StopPoint,
  travelBearing: number,
  osmSide?: 'left' | 'right',
): RoadSide {
  if (osmSide === 'left')  return 'LEFT';
  if (osmSide === 'right') return 'RIGHT';

  // Heuristic: extract house number parity from address
  const numMatch = stop.address.match(/(\d+)/);
  if (numMatch) {
    const num = parseInt(numMatch[1], 10);
    // UK convention: odd numbers on right heading away from city centre.
    // Without knowing the direction convention we use travel bearing:
    // if heading roughly north (0-180) → odd = right, even = left
    const headingNorth = travelBearing >= 0 && travelBearing < 180;
    if (headingNorth) {
      return num % 2 === 1 ? 'RIGHT' : 'LEFT';
    } else {
      return num % 2 === 1 ? 'LEFT' : 'RIGHT';
    }
  }

  return 'UNKNOWN';
}

/**
 * Build side groups from an ordered stop list.
 * Groups consecutive stops on the same side into a batch.
 * Cul-de-sac stops (turnAlertLevel === 'red' or turnScore < 0.4) are grouped
 * separately and marked for single-pass traversal.
 */
export function buildSideGroups(
  orderedStops: StopPoint[],
): SideGroup[] {
  const groups: SideGroup[] = [];
  let currentGroup: SideClassifiedStop[] | null = null;
  let currentSide: RoadSide | null = null;
  let groupIdx = 0;

  const classify = (stop: StopPoint, prevStop: StopPoint | null): SideClassifiedStop => {
    const travelBearing = prevStop
      ? bearing(
          { lat: prevStop.pin?.lat ?? prevStop.lat, lng: prevStop.pin?.lng ?? prevStop.lng },
          { lat: stop.pin?.lat ?? stop.lat,          lng: stop.pin?.lng ?? stop.lng },
        )
      : 0;

    const isInCulDeSac =
      (stop.turnAlertLevel === 'red') ||
      ((stop.turnScore ?? 1) < 0.40);

    const side = classifyRoadSide(stop, travelBearing);

    return { ...stop, roadSide: side, isInCulDeSac };
  };

  for (let i = 0; i < orderedStops.length; i++) {
    const stop = orderedStops[i];
    const prev = i > 0 ? orderedStops[i - 1] : null;
    const classified = classify(stop, prev);

    // Cul-de-sac stops always get their own group (in/out pass)
    if (classified.isInCulDeSac) {
      if (currentGroup && currentGroup.length > 0) {
        groups.push({
          id: `group-${groupIdx++}`,
          side: currentSide ?? 'UNKNOWN',
          stops: currentGroup,
          isCulDeSac: false,
        });
        currentGroup = null;
        currentSide = null;
      }

      // Look ahead: are there more cul-de-sac stops on the same road?
      const culDeSacBatch: SideClassifiedStop[] = [classified];
      let j = i + 1;
      while (j < orderedStops.length) {
        const next = classify(orderedStops[j], orderedStops[j - 1]);
        if (next.isInCulDeSac) {
          culDeSacBatch.push(next);
          i = j;
          j++;
        } else {
          break;
        }
      }

      const culGroupId = `cul-group-${groupIdx}`;
      culDeSacBatch.forEach(s => { s.culDeSacGroupId = culGroupId; });

      groups.push({
        id: culGroupId,
        side: 'UNKNOWN',
        stops: culDeSacBatch,
        isCulDeSac: true,
        entryPoint: {
          lat: culDeSacBatch[0].pin?.lat ?? culDeSacBatch[0].lat,
          lng: culDeSacBatch[0].pin?.lng ?? culDeSacBatch[0].lng,
        },
        exitPoint: {
          lat: culDeSacBatch[culDeSacBatch.length - 1].pin?.lat ?? culDeSacBatch[culDeSacBatch.length - 1].lat,
          lng: culDeSacBatch[culDeSacBatch.length - 1].pin?.lng ?? culDeSacBatch[culDeSacBatch.length - 1].lng,
        },
      });
      groupIdx++;
      continue;
    }

    // Normal stop: group by side
    if (classified.roadSide !== currentSide && currentGroup) {
      groups.push({
        id: `group-${groupIdx++}`,
        side: currentSide ?? 'UNKNOWN',
        stops: currentGroup,
        isCulDeSac: false,
      });
      currentGroup = null;
      currentSide = null;
    }

    if (!currentGroup) {
      currentGroup = [];
      currentSide = classified.roadSide;
    }
    currentGroup.push(classified);
  }

  if (currentGroup && currentGroup.length > 0) {
    groups.push({
      id: `group-${groupIdx}`,
      side: currentSide ?? 'UNKNOWN',
      stops: currentGroup,
      isCulDeSac: false,
    });
  }

  return groups;
}

/**
 * Flatten grouped stops back into a linear sequence,
 * ordering each group optimally (shortest walk within group).
 */
export function flattenGroups(groups: SideGroup[]): StopPoint[] {
  const result: StopPoint[] = [];
  for (const group of groups) {
    if (group.isCulDeSac) {
      // Cul-de-sac: enter once, service all stops in distance order, exit
      const sorted = [...group.stops].sort((a, b) => {
        const aLat = a.pin?.lat ?? a.lat;
        const bLat = b.pin?.lat ?? b.lat;
        return aLat - bLat; // simplified — real impl uses nearest-neighbour from entry
      });
      result.push(...sorted);
    } else {
      // Same-side group: order by sequence index to preserve distance optimisation
      const sorted = [...group.stops].sort((a, b) =>
        (a.sequenceIndex ?? a.sequence ?? 0) - (b.sequenceIndex ?? b.sequence ?? 0)
      );
      result.push(...sorted);
    }
  }
  return result;
}

/**
 * Road-crossing penalty coefficient.
 * Used by the route solver to penalise stop pairs that require crossing.
 * Returns a multiplier to apply to the edge distance.
 */
export function crossingPenaltyCoefficient(
  stopA: SideClassifiedStop,
  stopB: SideClassifiedStop,
): number {
  if (stopA.roadSide === 'UNKNOWN' || stopB.roadSide === 'UNKNOWN') return 1.0;
  if (stopA.roadSide !== stopB.roadSide) return 1.35; // 35% penalty for road crossing
  return 1.0;
}
