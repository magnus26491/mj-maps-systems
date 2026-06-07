/**
 * useOfflineRoute — hook for shift-start screen
 *
 * 1. Try to fetch enriched route from server (online path)
 * 2. On success → write everything to SQLite offline cache
 * 3. On failure / no signal → read from SQLite cache
 * 4. Expose isOffline flag so UI can show the offline banner
 */

import { useState, useEffect } from 'react';
import NetInfo from '@react-native-community/netinfo';
import {
  getCachedShift,
  cacheShift,
  upsertStops,
  getStopsForShift,
  type OfflineStop,
} from './index';

interface UseOfflineRouteResult {
  stops: OfflineStop[];
  isOffline: boolean;
  isCacheStale: boolean;  // cached >8h ago
  isLoading: boolean;
  error: string | null;
  reload: () => void;
}

export function useOfflineRoute(
  shiftId: string,
  authToken: string,
  apiBase: string
): UseOfflineRouteResult {
  const [stops, setStops] = useState<OfflineStop[]>([]);
  const [isOffline, setIsOffline] = useState(false);
  const [isCacheStale, setIsCacheStale] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setIsLoading(true);
      setError(null);

      const net = await NetInfo.fetch();

      if (net.isConnected && net.isInternetReachable) {
        // ── Online path ──────────────────────────────────────────────────
        try {
          const res = await fetch(`${apiBase}/api/v1/routes/${shiftId}`, {
            headers: { Authorization: `Bearer ${authToken}` },
          });
          if (!res.ok) throw new Error(`API ${res.status}`);
          const data = await res.json();

          // Write to SQLite immediately
          await cacheShift(shiftId, data);
          await upsertStops(data.stops.map((s: any) => ({ ...s, shiftId })));

          if (!cancelled) {
            setStops(data.stops.map((s: any) => ({ ...s, shiftId })));
            setIsOffline(false);
            setIsCacheStale(false);
          }
        } catch (e: any) {
          // Online fetch failed — fall through to cache
          await loadFromCache(cancelled);
        }
      } else {
        // ── Offline path ─────────────────────────────────────────────────
        setIsOffline(true);
        await loadFromCache(cancelled);
      }

      if (!cancelled) setIsLoading(false);
    }

    async function loadFromCache(cancelled: boolean) {
      const cached = await getCachedShift(shiftId);
      const cachedStops = await getStopsForShift(shiftId);

      if (!cancelled) {
        if (cachedStops.length > 0) {
          setStops(cachedStops);
          // Stale if cached >8h
          const shift = cached as any;
          if (shift?.cachedAt) {
            setIsCacheStale(Date.now() - shift.cachedAt > 8 * 60 * 60 * 1000);
          }
        } else {
          setError('No cached route found. Connect to load your shift.');
        }
        setIsOffline(true);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [shiftId, authToken, apiBase, tick]);

  return { stops, isOffline, isCacheStale, isLoading, error, reload: () => setTick(t => t + 1) };
}
