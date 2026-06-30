/**
 * useTurnScore — polls /api/v1/turn-score as driver approaches a stop.
 * Poll interval: 5s when >500m away, 2s when <500m (approaching).
 * Falls back to cached GREEN if network unavailable — never blocks driver.
 */
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '../lib/auth';
import type { DeliveryStop } from '../store/shift';

function haversineM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6_371_000;
  const toRad = (d: number) => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2
          + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

interface TurnScoreResult {
  score:  number | null;
  alert:  'GREEN' | 'AMBER' | 'RED' | null;
  reason: string | null;
}

const API_BASE = process.env.EXPO_PUBLIC_API_URL ?? 'https://api.mjmaps.co.uk';

async function fetchTurnScore(
  lat: number,
  lng: number,
  vehicleId: string,
  token: string,
): Promise<TurnScoreResult> {
  const res = await fetch(
    `${API_BASE}/api/v1/turn-score?lat=${lat}&lng=${lng}&vehicleId=${vehicleId}`,
    {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(5000),
    },
  );
  if (!res.ok) throw new Error(`turn-score ${res.status}`);
  const json = await res.json();
  return {
    score:  json.data?.score  ?? null,
    alert:  json.data?.alert  ?? null,
    reason: json.data?.reason ?? null,
  };
}

export function useTurnScore(
  stop: DeliveryStop | null,
  vehicleId: string | null | undefined,
  driverLat?: number | null,
  driverLng?: number | null,
): TurnScoreResult {
  const token = useAuthStore(s => s.token);

  // Compute live distance so the 2s fast-poll activates correctly near stops.
  // Falls back to stored distanceM, then 9999 when position is unavailable.
  const distM = useMemo(() => {
    if (driverLat != null && driverLng != null && stop?.lat != null && stop?.lng != null) {
      return haversineM(driverLat, driverLng, stop.lat, stop.lng);
    }
    return stop?.distanceM ?? 9999;
  }, [driverLat, driverLng, stop?.lat, stop?.lng, stop?.distanceM]);

  const enabled = !!(stop && vehicleId && token);

  const { data } = useQuery({
    queryKey:         ['turn-score', stop?.id, vehicleId],
    queryFn:          () => {
      const lat = stop?.lat;
      const lng = stop?.lng;
      if (lat === undefined || lng === undefined) throw new Error('missing lat/lng');
      return fetchTurnScore(lat, lng, vehicleId!, token!);
    },
    enabled,
    // Road geometry at a stop doesn't change minute-to-minute — 20s when
    // approaching (<200m), 90s otherwise. Prevents unnecessary API hammering.
    refetchInterval:  (distM ?? 9999) < 200 ? 20_000 : 90_000,
    placeholderData:  { score: null, alert: 'GREEN' as const, reason: null },
    staleTime:        10_000,
  });

  return data ?? { score: null, alert: null, reason: null };
}
