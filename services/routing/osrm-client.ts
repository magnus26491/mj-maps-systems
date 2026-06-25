/**
 * OSRM matrix client.
 *
 * Calls ${OSRM_URL}/table/v1/driving/{coords} and returns an N×N
 * duration + distance matrix.
 *
 * Falls back to Haversine when OSRM_URL is not configured.
 */

import type { LatLng, MatrixResult, MatrixProvider } from './types.js';
import * as https from 'https';
import * as http from 'http';

function getOsrmUrl(): string | undefined {
  return process.env.OSRM_URL?.replace(/\/$/, '');
}

/** Haversine distance in metres between two points */
function haversineM(a: LatLng, b: LatLng): number {
  const R = 6_371_000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) *
    Math.cos((b.lat * Math.PI) / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}

/** Rough speed model in m/s for Haversine fallback */
function roughSpeedMs(_from: LatLng, _to: LatLng): number {
  return 10; // ~36 km/h — typical urban average
}

function buildHaversineMatrix(coords: LatLng[]): MatrixResult {
  const n = coords.length;
  const durations: number[][] = [];
  const distances: number[][] = [];
  for (let i = 0; i < n; i++) {
    durations[i] = [];
    distances[i] = [];
    for (let j = 0; j < n; j++) {
      if (i === j) {
        durations[i][j] = 0;
        distances[i][j] = 0;
      } else {
        const d = haversineM(coords[i], coords[j]);
        const spd = roughSpeedMs(coords[i], coords[j]);
        distances[i][j] = Math.round(d);
        durations[i][j] = Math.round(d / spd);
      }
    }
  }
  return { durations, distances, durationMs: 0, source: 'haversine' };
}

function fetch(url: string, timeoutMs = 10_000): Promise<string> {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http;
    const timer = setTimeout(() => reject(new Error(`OSRM request timed out after ${timeoutMs}ms`)), timeoutMs);
    lib.get(url, (res) => {
      let body = '';
      res.on('data', (c: Buffer) => { body += c; });
      res.on('end', () => { clearTimeout(timer); resolve(body); });
    }).on('error', (err: Error) => { clearTimeout(timer); reject(err); });
  });
}

export class OsrmMatrixClient implements MatrixProvider {
  async getMatrix(coords: LatLng[], _departAt?: Date): Promise<MatrixResult> {
    const t0 = Date.now();

    const OSRM_URL = getOsrmUrl();
    if (!OSRM_URL || coords.length === 0) {
      const result = buildHaversineMatrix(coords);
      return { ...result, durationMs: Date.now() - t0 };
    }

    // OSRM expects lon,lat order
    const coordStr = coords.map(c => `${c.lng},${c.lat}`).join(';');
    const url = `${OSRM_URL}/table/v1/driving/${coordStr}?annotations=duration,distance`;

    try {
      const raw = await fetch(url);
      const data = JSON.parse(raw) as {
        code: string;
        durations?: number[][];
        distances?: number[][];
      };
      if (data.code !== 'Ok' || !data.durations) {
        throw new Error(`OSRM returned code=${data.code}`);
      }
      return {
        durations: data.durations,
        distances: data.distances ?? buildHaversineMatrix(coords).distances,
        durationMs: Date.now() - t0,
        source: 'osrm',
      };
    } catch (err) {
      console.warn('[osrm] Matrix request failed, falling back to Haversine:', (err as Error).message);
      const result = buildHaversineMatrix(coords);
      return { ...result, durationMs: Date.now() - t0 };
    }
  }
}

/** Singleton — constructed once; re-uses the same URL env var for the process lifetime */
export const osrmClient = new OsrmMatrixClient();
