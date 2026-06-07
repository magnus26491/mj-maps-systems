/**
 * ETA Assignment
 * Walks the ordered stop list and stamps an ISO eta on each stop
 * based on travel-time estimates and dwell times.
 */

import type { StopPoint } from './types';

const DEFAULT_SPEED_MPS = 30 / 3.6; // 30 km/h average urban speed
const DEFAULT_DWELL_SEC = 120;        // 2-minute default stop

/** Haversine distance in metres */
function distanceM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6_371_000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180)
    * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function assignETAs(
  stops: StopPoint[],
  shiftStartISO?: string,
): StopPoint[] {
  let cursor = shiftStartISO ? new Date(shiftStartISO).getTime() : Date.now();

  return stops.map((stop, i) => {
    // Travel time from previous stop (or depot if first)
    if (i > 0) {
      const prev = stops[i - 1];
      const prevLat = prev.pin?.lat ?? prev.lat;
      const prevLng = prev.pin?.lng ?? prev.lng;
      const stopLat = stop.pin?.lat ?? stop.lat;
      const stopLng = stop.pin?.lng ?? stop.lng;
      const dist = distanceM(prevLat, prevLng, stopLat, stopLng);
      cursor += (dist / DEFAULT_SPEED_MPS) * 1000;
    }

    // Check time window — if we arrive early, wait
    if (stop.timeWindow?.start) {
      const windowOpenMs = new Date(stop.timeWindow.start).getTime();
      if (cursor < windowOpenMs) cursor = windowOpenMs;
    } else if (stop.time_window_start) {
      const windowOpenMs = new Date(stop.time_window_start).getTime();
      if (cursor < windowOpenMs) cursor = windowOpenMs;
    }

    const eta = new Date(cursor).toISOString();

    // Advance cursor by dwell time
    const dwellSec = stop.dwellSeconds ?? stop.dwellTimeS ?? (stop.dwell_minutes ? stop.dwell_minutes * 60 : DEFAULT_DWELL_SEC);
    cursor += dwellSec * 1000;

    return { ...stop, eta, etaMs: new Date(eta).getTime() };
  });
}
