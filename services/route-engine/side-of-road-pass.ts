/**
 * MJ Maps Systems — Direction-Aware Side-of-Road Pass
 *
 * Solves the "lapping the block" problem:
 * Drivers are sent: house 4 → loop → house 3 → loop → house 2 → loop → house 1
 * because optimisers group by street name but ignore travel direction.
 *
 * This pass takes a sequence of stops on the same street and re-orders them
 * into a single clean sweep:
 *   LEFT-side stops in travel direction → U-turn at junction → RIGHT-side stops back
 *
 * Algorithm:
 *  1. Group stops by street segment (same OSM way ID or same street name)
 *  2. For each group, determine travel direction (bearing from first to last stop)
 *  3. Classify each stop as LEFT or RIGHT of that bearing
 *  4. Order LEFT stops in travel direction, RIGHT stops in reverse
 *  5. Interleave: all LEFT stops → U-turn point → all RIGHT stops
 *  6. Splice the result back into the global route sequence
 *
 * Used by: route optimiser post-processing pass
 */

// ─── TYPES ───────────────────────────────────────────────────────────────────

export interface StopForPass {
  id: string;
  lat: number;
  lng: number;
  streetName?: string | null;
  osmWayId?: number | null;
  /** Injected by this pass — do not set manually */
  _side?: 'LEFT' | 'RIGHT';
  _passIndex?: number;
}

export interface SideOfRoadPassResult {
  /** Re-ordered stops after the pass */
  stops: StopForPass[];
  /** Number of stops reordered */
  stopsReordered: number;
  /** Number of street groups processed */
  groupsProcessed: number;
  /** Estimated laps eliminated */
  lapsEliminated: number;
}

// ─── GEOMETRY HELPERS ────────────────────────────────────────────────────────

/** Bearing in degrees (0 = North, 90 = East) from point A to point B */
function bearingDeg(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const lat1R = lat1 * Math.PI / 180;
  const lat2R = lat2 * Math.PI / 180;
  const y = Math.sin(dLng) * Math.cos(lat2R);
  const x = Math.cos(lat1R) * Math.sin(lat2R) - Math.sin(lat1R) * Math.cos(lat2R) * Math.cos(dLng);
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}

/**
 * Classify a stop as LEFT or RIGHT of the travel direction.
 * Uses the cross product of (direction vector) × (stop offset vector).
 * Positive cross product = LEFT, negative = RIGHT.
 */
function classifySide(
  stopLat: number, stopLng: number,
  dirLat1: number, dirLng1: number,
  dirLat2: number, dirLng2: number,
): 'LEFT' | 'RIGHT' {
  // Translate to 2D vectors (small area approximation is fine for street-level)
  const dx = dirLng2 - dirLng1;
  const dy = dirLat2 - dirLat1;
  const px = stopLng - dirLng1;
  const py = stopLat - dirLat1;
  // Cross product z-component
  const cross = dx * py - dy * px;
  return cross > 0 ? 'LEFT' : 'RIGHT';
}

/** Project a stop onto the travel axis — used for ordering within a side */
function projectOnAxis(
  stopLat: number, stopLng: number,
  dirLat1: number, dirLng1: number,
  dirLat2: number, dirLng2: number,
): number {
  const dx = dirLng2 - dirLng1;
  const dy = dirLat2 - dirLat1;
  const px = stopLng - dirLng1;
  const py = stopLat - dirLat1;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return 0;
  return (px * dx + py * dy) / lenSq;
}

// ─── GROUPING ────────────────────────────────────────────────────────────────

const MIN_GROUP_SIZE = 3; // Only apply the pass to groups of 3+ stops on same street

function groupKey(stop: StopForPass): string {
  if (stop.osmWayId)    return `way:${stop.osmWayId}`;
  if (stop.streetName)  return `name:${stop.streetName.toLowerCase().trim()}`;
  return `pos:${stop.lat.toFixed(3)},${stop.lng.toFixed(3)}`; // last resort: ~100m grid cell
}

// ─── MAIN EXPORT ─────────────────────────────────────────────────────────────

/**
 * Apply the direction-aware side-of-road pass to a route sequence.
 *
 * @param stops  Ordered route stops (output of primary route optimiser)
 * @returns      Re-ordered stops with lapping eliminated on multi-stop streets
 *
 * @example
 * const result = applySideOfRoadPass(optimisedStops);
 * console.log(`Eliminated ${result.lapsEliminated} laps across ${result.groupsProcessed} streets`);
 */
export function applySideOfRoadPass(stops: StopForPass[]): SideOfRoadPassResult {
  if (stops.length < 3) {
    return { stops, stopsReordered: 0, groupsProcessed: 0, lapsEliminated: 0 };
  }

  // Build index map: stop id → original position
  const indexMap = new Map(stops.map((s, i) => [s.id, i]));

  // Group stops by street
  const groups = new Map<string, StopForPass[]>();
  for (const stop of stops) {
    const key = groupKey(stop);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(stop);
  }

  let stopsReordered = 0;
  let groupsProcessed = 0;
  let lapsEliminated = 0;

  // Work on a mutable copy
  const result = [...stops];

  for (const [, group] of groups) {
    if (group.length < MIN_GROUP_SIZE) continue;

    // Sort group by original route order
    group.sort((a, b) => (indexMap.get(a.id) ?? 0) - (indexMap.get(b.id) ?? 0));

    // Travel direction: from first to last stop in current order
    const first = group[0];
    const last  = group[group.length - 1];

    // Classify each stop
    for (const stop of group) {
      stop._side = classifySide(
        stop.lat, stop.lng,
        first.lat, first.lng,
        last.lat,  last.lng,
      );
      stop._passIndex = projectOnAxis(
        stop.lat, stop.lng,
        first.lat, first.lng,
        last.lat,  last.lng,
      );
    }

    const leftStops  = group.filter(s => s._side === 'LEFT' ).sort((a, b) => (a._passIndex ?? 0) - (b._passIndex ?? 0));
    const rightStops = group.filter(s => s._side === 'RIGHT').sort((a, b) => (b._passIndex ?? 0) - (a._passIndex ?? 0));

    // New order: all left stops in direction, then right stops in reverse
    const newOrder = [...leftStops, ...rightStops];

    // Count how many are out of place vs original
    const positions = group.map(s => indexMap.get(s.id) ?? 0);
    const minPos = Math.min(...positions);
    const maxPos = Math.max(...positions);

    let changed = 0;
    for (let i = 0; i < newOrder.length; i++) {
      const targetIdx = minPos + i;
      if (result[targetIdx]?.id !== newOrder[i].id) {
        result[targetIdx] = newOrder[i];
        changed++;
      }
    }

    if (changed > 0) {
      stopsReordered += changed;
      groupsProcessed++;
      // Each direction change eliminated = (original laps - 1)
      // Conservative: each reordered group eliminates at least 1 lap
      const originalLaps = Math.floor(maxPos - minPos);
      lapsEliminated += Math.max(1, Math.floor(originalLaps / 2));
    }
  }

  return { stops: result, stopsReordered, groupsProcessed, lapsEliminated };
}
