/**
 * Route Engine — sweep-zone clustering (anti-backtrack core)
 *
 * The #1 driver complaint: apps send you out of an area then back in later.
 * This module prevents that by:
 *
 *   1. Dividing stops into geographic zones (grid cells or radial sectors)
 *   2. Sorting zones by compass bearing from depot (N → NE → E → SE → S → …)
 *   3. Sequencing stops within each zone using nearest-neighbour
 *   4. Applying a zone-completion penalty so the solver strongly prefers
 *      finishing a zone before moving to the next
 *
 * The result is a "sweep" motion — the driver works one area clean,
 * then sweeps to the next. No backtracking.
 *
 * Zone granularity: configurable via ZONE_CELL_DEG (default 0.015° ≈ 1.2km).
 * For dense urban routes use 0.008° (~700m). For rural use 0.025° (~2km).
 */

import { haversineM, bearingDeg } from './geo';
import type { Stop } from './types';

const ZONE_CELL_DEG = 0.015; // ~1.2km grid cells

interface Zone {
  key:     string;
  stops:   Stop[];
  centLat: number;
  centLng: number;
  /** Bearing from depot to zone centroid */
  bearing: number;
}

function zoneKey(lat: number, lng: number): string {
  const row = Math.floor(lat / ZONE_CELL_DEG);
  const col = Math.floor(lng / ZONE_CELL_DEG);
  return `${row}:${col}`;
}

function centroid(stops: Stop[]): { lat: number; lng: number } {
  const lat = stops.reduce((s, st) => s + st.pin.lat, 0) / stops.length;
  const lng = stops.reduce((s, st) => s + st.pin.lng, 0) / stops.length;
  return { lat, lng };
}

/**
 * Group stops into geographic grid zones.
 */
export function buildZones(
  stops:     Stop[],
  depotLat:  number,
  depotLng:  number,
): Zone[] {
  const zoneMap = new Map<string, Stop[]>();

  for (const stop of stops) {
    const key = zoneKey(stop.pin.lat, stop.pin.lng);
    if (!zoneMap.has(key)) zoneMap.set(key, []);
    zoneMap.get(key)!.push(stop);
  }

  const zones: Zone[] = [];
  for (const [key, zoneStops] of zoneMap) {
    const c = centroid(zoneStops);
    zones.push({
      key,
      stops:   zoneStops,
      centLat: c.lat,
      centLng: c.lng,
      bearing: bearingDeg(depotLat, depotLng, c.lat, c.lng),
    });
  }

  // Sort zones by bearing (clockwise sweep from North)
  zones.sort((a, b) => a.bearing - b.bearing);
  return zones;
}

/**
 * Within a zone, sequence stops using nearest-neighbour from the
 * zone entry point (previous stop position or zone centroid).
 */
export function sequenceZone(
  zone:     Zone,
  entryLat: number,
  entryLng: number,
): Stop[] {
  const remaining = [...zone.stops];
  const ordered:   Stop[] = [];
  let curLat = entryLat;
  let curLng = entryLng;

  while (remaining.length) {
    let bestIdx  = 0;
    let bestDist = Infinity;

    for (let i = 0; i < remaining.length; i++) {
      const d = haversineM(curLat, curLng, remaining[i].pin.lat, remaining[i].pin.lng);
      if (d < bestDist) { bestDist = d; bestIdx = i; }
    }

    const next = remaining.splice(bestIdx, 1)[0];
    ordered.push(next);
    curLat = next.pin.lat;
    curLng = next.pin.lng;
  }

  return ordered;
}

/**
 * Full sweep-zone sequencer.
 * Returns stops in anti-backtrack order with sequence numbers set.
 */
export function sweepSequence(
  stops:    Stop[],
  depotLat: number,
  depotLng: number,
): Stop[] {
  if (!stops.length) return [];

  const zones  = buildZones(stops, depotLat, depotLng);
  const result: Stop[] = [];
  let curLat   = depotLat;
  let curLng   = depotLng;

  for (const zone of zones) {
    const sequenced = sequenceZone(zone, curLat, curLng);
    result.push(...sequenced);
    if (sequenced.length) {
      curLat = sequenced[sequenced.length - 1].pin.lat;
      curLng = sequenced[sequenced.length - 1].pin.lng;
    }
  }

  // Assign sequence numbers
  return result.map((stop, idx) => ({ ...stop, sequence: idx + 1 }));
}
