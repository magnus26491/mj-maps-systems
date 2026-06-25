/**
 * Valhalla maneuver client.
 *
 * Calls ${VALHALLA_URL}/route with truck/van costing (height/width/length/weight
 * from vehicle constraints) to get turn-by-turn steps + encoded geometry.
 *
 * Returns source: 'none' when VALHALLA_URL is unset — maneuvers are optional
 * in the pipeline and the rest of the stack proceeds without them.
 */

import type { LatLng, VehicleConstraints, ManeuverResult, LegManeuvers, ManeuverStep, ManeuverProvider } from './types.js';
import * as https from 'https';
import * as http from 'http';
import { VEHICLE_PROFILES } from '../../packages/vehicle-profiles/index.js';

function getValhallaUrl(): string | undefined {
  return process.env.VALHALLA_URL?.replace(/\/$/, '');
}

interface ValhallaManeuver {
  type: number;
  instruction: string;
  length: number;       // km
  time: number;         // seconds
  begin_shape_index: number;
  end_shape_index: number;
  begin_heading?: number;
  end_heading?: number;
}

interface ValhallaLeg {
  maneuvers: ValhallaManeuver[];
  shape: string;        // encoded polyline
  length: number;       // km
  time: number;         // seconds
}

interface ValhallaRoute {
  legs: ValhallaLeg[];
  length: number;
  time: number;
}

interface ValhallaResponse {
  trip: ValhallaRoute;
}

function httpPost(url: string, body: string, timeoutMs = 15_000): Promise<string> {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const lib = u.protocol === 'https:' ? https : http;
    const opts = {
      hostname: u.hostname,
      port: u.port || (u.protocol === 'https:' ? 443 : 80),
      path: u.pathname + u.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    };
    const timer = setTimeout(() => reject(new Error(`Valhalla request timed out after ${timeoutMs}ms`)), timeoutMs);
    const req = lib.request(opts, (res) => {
      let data = '';
      res.on('data', (c: Buffer) => { data += c; });
      res.on('end', () => { clearTimeout(timer); resolve(data); });
    });
    req.on('error', (err: Error) => { clearTimeout(timer); reject(err); });
    req.write(body);
    req.end();
  });
}

function valhallaManeuverTypeToString(type: number): string {
  const types: Record<number, string> = {
    0: 'none', 1: 'start', 2: 'start_right', 3: 'start_left',
    4: 'destination', 5: 'destination_right', 6: 'destination_left',
    7: 'becomes', 8: 'continue', 9: 'slight_right', 10: 'right',
    11: 'sharp_right', 12: 'u_turn_right', 13: 'u_turn_left',
    14: 'sharp_left', 15: 'left', 16: 'slight_left', 17: 'ramp_straight',
    18: 'ramp_right', 19: 'ramp_left', 20: 'exit_right', 21: 'exit_left',
    22: 'stay_straight', 23: 'stay_right', 24: 'stay_left',
    25: 'merge', 26: 'roundabout_enter', 27: 'roundabout_exit',
    28: 'ferry_enter', 29: 'ferry_exit', 30: 'transit',
    31: 'transit_transfer', 32: 'transit_remain_on', 33: 'transit_connection_start',
    34: 'transit_connection_transfer', 35: 'transit_connection_destination',
    36: 'post_transit_connection_destination',
  };
  return types[type] ?? 'unknown';
}

function decodePolyline(encoded: string, precision = 6): LatLng[] {
  let index = 0, lat = 0, lng = 0;
  const coords: LatLng[] = [];
  const factor = Math.pow(10, precision);
  while (index < encoded.length) {
    let b: number, shift = 0, result = 0;
    do { b = encoded.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
    lat += result & 1 ? ~(result >> 1) : result >> 1;
    shift = 0; result = 0;
    do { b = encoded.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
    lng += result & 1 ? ~(result >> 1) : result >> 1;
    coords.push({ lat: lat / factor, lng: lng / factor });
  }
  return coords;
}

export class ValhallaClient implements ManeuverProvider {
  async getManeuvers(
    orderedCoords: LatLng[],
    constraints: VehicleConstraints,
  ): Promise<ManeuverResult> {
    const t0 = Date.now();
    const empty: ManeuverResult = {
      legs: [], totalDistanceM: 0, totalDurationSec: 0,
      durationMs: 0, source: 'none',
    };

    const VALHALLA_URL = getValhallaUrl();
    if (!VALHALLA_URL || orderedCoords.length < 2) {
      return { ...empty, durationMs: Date.now() - t0 };
    }

    // Determine costing from vehicle profile
    const profile = VEHICLE_PROFILES[constraints.vehicleId];
    const isHeavy = profile && profile.gvwKg && profile.gvwKg > 3_500;
    const costing = isHeavy ? 'truck' : 'auto';

    const costingOptions: Record<string, unknown> = {};
    if (isHeavy) {
      costingOptions[costing] = {
        ...(constraints.heightM ? { height: constraints.heightM } : {}),
        ...(constraints.widthM ? { width: constraints.widthM } : {}),
        ...(constraints.lengthM ? { length: constraints.lengthM } : {}),
        ...(constraints.weightKg ? { weight: constraints.weightKg / 1000 } : {}),
      };
    }

    const payload = {
      locations: orderedCoords.map(c => ({ lat: c.lat, lon: c.lng, type: 'break' })),
      costing,
      costing_options: Object.keys(costingOptions).length ? costingOptions : undefined,
      directions_options: { units: 'kilometers', narrative: true },
    };

    try {
      const raw = await httpPost(`${VALHALLA_URL}/route`, JSON.stringify(payload));
      const data = JSON.parse(raw) as ValhallaResponse;
      if (!data.trip?.legs) throw new Error('Valhalla response missing trip.legs');

      const shapePts = decodePolyline(data.trip.legs.flatMap(l => l.shape).join(''));

      const legs: LegManeuvers[] = data.trip.legs.map((leg, i) => {
        const pts = decodePolyline(leg.shape);
        const steps: ManeuverStep[] = leg.maneuvers.map((m) => {
          const pt = pts[m.begin_shape_index] ?? { lat: 0, lng: 0 };
          return {
            type: valhallaManeuverTypeToString(m.type),
            instruction: m.instruction,
            distanceM: Math.round(m.length * 1000),
            durationSec: m.time,
            lat: pt.lat,
            lng: pt.lng,
            bearingBefore: m.begin_heading,
            bearingAfter: m.end_heading,
          };
        });
        return {
          fromIndex: i,
          toIndex: i + 1,
          steps,
          geometry: leg.shape,
          distanceM: Math.round(leg.length * 1000),
          durationSec: leg.time,
        };
      });

      return {
        legs,
        totalDistanceM: Math.round(data.trip.length * 1000),
        totalDurationSec: data.trip.time,
        durationMs: Date.now() - t0,
        source: 'valhalla',
      };
    } catch (err) {
      console.warn('[valhalla] Maneuver request failed:', (err as Error).message);
      return { ...empty, durationMs: Date.now() - t0 };
    }
  }
}

export const valhallaClient = new ValhallaClient();
