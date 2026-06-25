/**
 * Traffic Engine — ETA calculator
 *
 * Given current driver position, remaining stops, and traffic conditions,
 * recalculates ETAs for all pending stops.
 *
 * Algorithm:
 *   1. Calculate straight-line distance to each remaining stop
 *   2. Apply road-type speed estimate (or live traffic speed if available)
 *   3. Add stop dwell time (learned from driver history, default 3 min)
 *   4. Cascade: each stop ETA = previous stop departure time + travel time
 *
 * This runs every 2 minutes during an active shift via the WebSocket heartbeat.
 */
import type { EtaRecalcResult, TrafficSegment } from './types';

const DEFAULT_DWELL_SECONDS = 180; // 3 minutes per stop default
const URBAN_SPEED_KPH       = 25;  // Conservative urban driving speed
const RURAL_SPEED_KPH       = 50;

interface StopForEta {
  id:      string;
  lat:     number;
  lng:     number;
  distanceToNextM?: number;
}

function haversineM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R     = 6_371_000;
  const dLat  = (lat2 - lat1) * Math.PI / 180;
  const dLng  = (lng2 - lng1) * Math.PI / 180;
  const a     = Math.sin(dLat/2)**2 + Math.cos(lat1 * Math.PI/180) * Math.cos(lat2 * Math.PI/180) * Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

function speedKphForSegment(segment: TrafficSegment | null): number {
  if (!segment) return URBAN_SPEED_KPH;
  return Math.max(5, segment.currentSpeedKph); // floor at 5 kph (near standstill)
}

export function recalculateEtas(
  currentLat:     number,
  currentLng:     number,
  remainingStops: StopForEta[],
  departureTime:  number, // Unix ms — when driver leaves current position
  trafficSegments: TrafficSegment[] = [],
  dwellSeconds:   number = DEFAULT_DWELL_SECONDS,
): EtaRecalcResult[] {
  if (!remainingStops.length) return [];

  const results: EtaRecalcResult[] = [];
  let curLat  = currentLat;
  let curLng  = currentLng;
  let curTime = departureTime;

  for (const stop of remainingStops) {
    const distM    = haversineM(curLat, curLng, stop.lat, stop.lng);

    // Find best matching traffic segment (closest midpoint)
    const midLat = (curLat + stop.lat) / 2;
    const midLng = (curLng + stop.lng) / 2;
    const segment = trafficSegments.find(s => {
      const d = haversineM(midLat, midLng, (s.fromLat + s.toLat) / 2, (s.fromLng + s.toLng) / 2);
      return d < 500; // within 500m of segment midpoint
    }) ?? null;

    const speedKph    = speedKphForSegment(segment);
    const travelSecs  = (distM / 1000) / speedKph * 3600;
    const arrivalTime = curTime + travelSecs * 1000;
    const eta         = arrivalTime;

    // Confidence based on traffic data availability
    const confidence = segment ? 'HIGH' : (distM < 2000 ? 'MEDIUM' : 'LOW');

    // Reason only if there's a significant delay
    let reason: string | null = null;
    if (segment && segment.severity === 'HEAVY')   reason = 'Heavy traffic ahead';
    if (segment && segment.severity === 'STANDSTILL') reason = 'Traffic standstill on route';

    results.push({
      stopId:       stop.id,
      originalEta:  eta, // Will be overridden by caller with original from store
      revisedEta:   eta,
      deltaSeconds: 0,   // Caller computes delta vs stored original ETA
      reason,
      confidence,
    });

    // Next iteration: depart from this stop after dwell time
    curLat  = stop.lat;
    curLng  = stop.lng;
    curTime = eta + dwellSeconds * 1000;
  }

  return results;
}
