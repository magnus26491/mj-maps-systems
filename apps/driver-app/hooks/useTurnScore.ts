/**
 * useTurnScore — polls /api/v1/turn-score as driver approaches a stop.
 * Poll interval: 5s when >500m away, 2s when <500m (approaching).
 * Falls back to cached GREEN if network unavailable — never blocks driver.
 */
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { DeliveryStop } from '../store/shift';

interface TurnScoreResult {
  score:  number | null;
  alert:  'GREEN' | 'AMBER' | 'RED' | null;
  reason: string | null;
}

const API_BASE = process.env.EXPO_PUBLIC_API_URL ?? 'https://api.mjmaps.app';

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
): TurnScoreResult {
  const [token, setToken] = useState<string>('');

  useEffect(() => {
    // TODO: replace with auth store when implemented
    setToken((global as any).__mjMapsToken ?? '');
  }, []);

  const distM  = stop?.distanceM ?? 9999;
  const enabled = !!(stop && vehicleId && token);

  const { data } = useQuery({
    queryKey:         ['turn-score', stop?.id, vehicleId],
    queryFn:          () => {
      const lat = stop?.lat;
      const lng = stop?.lng;
      if (lat === undefined || lng === undefined) throw new Error('missing lat/lng');
      return fetchTurnScore(lat, lng, vehicleId!, token);
    },
    enabled,
    refetchInterval:  (distM ?? 9999) < 500 ? 2000 : 5000,
    placeholderData:  { score: null, alert: 'GREEN' as const, reason: null },
    staleTime:        10_000,
  });

  return data ?? { score: null, alert: null, reason: null };
}
