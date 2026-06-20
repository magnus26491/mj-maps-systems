/**
 * lib/navigation.ts
 * Server-side Geoapify routing client for in-app turn-by-turn navigation.
 *
 * Calls POST /api/v1/navigate/leg (our backend) rather than Geoapify directly.
 * This keeps GEOAPIFY_API_KEY off the client device.
 *
 * The server resolves vehicle profile → Geoapify mode bucket.
 */
import * as SecureStore from 'expo-secure-store';

export interface NavStep {
  instruction:  string;
  distanceM:    number;
  durationSec: number;
  bearing:     number;
  maneuver:    string;
}

export interface NavRoute {
  steps:            NavStep[];
  totalDistanceM:   number;
  totalDurationSec: number;
  polyline:         { lat: number; lng: number }[];
}

const API_BASE = process.env.EXPO_PUBLIC_API_URL ?? 'https://api.mjmaps.co.uk';

export async function fetchNavRoute(
  fromLat: number, fromLng: number,
  toLat:   number, toLng:   number,
  vehicleId: string,
): Promise<NavRoute | null> {
  const token = await SecureStore.getItemAsync('mj_jwt');

  const res = await fetch(`${API_BASE}/api/v1/navigate/leg`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ fromLat, fromLng, toLat, toLng, vehicleId }),
  });

  if (!res.ok) return null;
  const json = await res.json();
  if (!json.ok || !json.data) return null;

  return json.data as NavRoute;
}

export function formatDistance(m: number): string {
  if (m < 1000) return `${Math.round(m)}m`;
  return `${(m / 1000).toFixed(1)}km`;
}

export function formatDuration(sec: number): string {
  const m = Math.round(sec / 60);
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

export function maneuverArrow(maneuver: string): string {
  const map: Record<string, string> = {
    'turn-left':        '←',
    'turn-right':       '→',
    'turn-sharp-left':  '↰',
    'turn-sharp-right': '↱',
    'turn-slight-left': '↖',
    'turn-slight-right':'↗',
    'straight':         '↑',
    'continue':        '↑',
    'roundabout':       '⟳',
    'exit-roundabout':  '↗',
    'u-turn':           '↩',
    'arrive':           '📍',
    'depart':           '🚗',
  };
  return map[maneuver] ?? '↑';
}