import { useState, useEffect, useRef, useCallback } from 'react';
import { getRoutes, getLocationStreamUrl } from '../api';
import type { Route } from '../types';

interface SseLocation {
  driverId: string;
  lat: number;
  lng: number;
  heading: number | null;
  speedKmh: number | null;
  routeId: string | null;
  recordedAt: string;
}

export function useRoutes() {
  const [routes, setRoutes] = useState<Route[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  // Route-id → driver-id lookup (populated from the initial GET /routes call)
  const routeIdToDriverId = useRef<Map<string, string>>(new Map());

  // Fallback polling interval handle
  const fallbackInterval = useRef<ReturnType<typeof setInterval> | null>(null);

  // Stop SSE + polling cleanup
  const cleanup = useCallback(() => {
    if (fallbackInterval.current) {
      clearInterval(fallbackInterval.current);
      fallbackInterval.current = null;
    }
  }, []);

  useEffect(() => {
    let es: EventSource | null = null;
    let cancelled = false;

    (async () => {
      // 1. Initial fetch to populate full route metadata
      try {
        const data = await getRoutes();
        if (cancelled) return;
        setRoutes(data);
        // Build routeId → driverId map for SSE delta updates
        const map = new Map<string, string>();
        for (const route of data) {
          map.set(route.routeId, route.driverId);
        }
        routeIdToDriverId.current = map;
        setLoading(false);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err : new Error(String(err)));
        setLoading(false);
        return;
      }

      // 2. Open SSE stream for live location updates
      es = new EventSource(getLocationStreamUrl());

      es.addEventListener('snapshot', (e: MessageEvent) => {
        if (cancelled) return;
        try {
          const snapshot = JSON.parse(e.data) as SseLocation[];
          setRoutes(prev =>
            prev.map(route => {
              const entry = snapshot.find(s => s.driverId === route.driverId);
              if (!entry) return route;
              return {
                ...route,
                currentLat: entry.lat,
                currentLon: entry.lng,
                lastPing: entry.recordedAt,
                heading: entry.heading,
              };
            })
          );
        } catch { /* malformed snapshot — skip */ }
      });

      es.addEventListener('location', (e: MessageEvent) => {
        if (cancelled) return;
        try {
          const loc = JSON.parse(e.data) as SseLocation;
          setRoutes(prev =>
            prev.map(route => {
              if (route.driverId !== loc.driverId) return route;
              return {
                ...route,
                currentLat: loc.lat,
                currentLon: loc.lng,
                lastPing: loc.recordedAt,
                heading: loc.heading,
              };
            })
          );
        } catch { /* malformed message — skip */ }
      });

      // On error or close, fall back to polling
      es.onerror = () => {
        if (cancelled) return;
        es?.close();
        es = null;
        cleanup();
        fallbackInterval.current = setInterval(async () => {
          try { setRoutes(await getRoutes()); }
          catch { /* swallow polling errors — last state stays visible */ }
        }, 15_000);
      };
    })();

    return () => {
      cancelled = true;
      es?.close();
      cleanup();
    };
  }, [cleanup]);

  return { routes, isLoading: loading, error };
}
