/**
 * lib/navigation.ts
 * Geoapify Routing API client for in-app turn-by-turn navigation.
 */

export interface NavStep {
  instruction:  string;
  distanceM:    number;
  durationSec: number;
  bearing:     number;
  maneuver:    string;
}

export interface NavRoute {
  steps:          NavStep[];
  totalDistanceM:   number;
  totalDurationSec: number;
  polyline:       { lat: number; lng: number }[];
}

export async function fetchNavRoute(
  fromLat: number, fromLng: number,
  toLat:   number, toLng:   number,
  profileKey: string,
): Promise<NavRoute | null> {
  const key  = process.env.EXPO_PUBLIC_GEOAPIFY_KEY ?? '';
  const mode = profileKeyToMode(profileKey);
  const url  = `https://router.geoapify.com/v1/routing`
    + `?waypoints=${fromLat},${fromLng}|${toLat},${toLng}`
    + `&mode=${mode}&format=json&apiKey=${key}`;

  const res = await fetch(url);
  if (!res.ok) return null;

  const json = await res.json();
  const feature = json.features?.[0];
  if (!feature) return null;

  const props = feature.properties;
  const steps: NavStep[] = (props.legs?.[0]?.steps ?? []).map((s: any) => ({
    instruction:  s.instruction?.text ?? '',
    distanceM:    s.distance ?? 0,
    durationSec: s.time ?? 0,
    bearing:     s.bearing_after ?? 0,
    maneuver:    s.maneuver?.type ?? 'straight',
  }));

  const coords = feature.geometry?.coordinates ?? [];
  const polyline = coords.map(([lng, lat]: [number, number]) => ({ lat, lng }));

  return {
    steps,
    totalDistanceM:    props.distance ?? 0,
    totalDurationSec: props.time ?? 0,
    polyline,
  };
}

function profileKeyToMode(profileKey: string): string {
  if (profileKey.includes('HGV') || profileKey.includes('ARTIC')) return 'truck';
  if (profileKey.includes('LUTON')) return 'truck';
  return 'drive';
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