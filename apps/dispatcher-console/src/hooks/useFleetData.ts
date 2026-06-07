'use client';

import useSWR from 'swr';
import type { ActiveRoute, FleetStats } from '@/types';

const API = process.env.NEXT_PUBLIC_API_URL ?? '';

const fetcher = (url: string) =>
  fetch(url).then((r) => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  });

/** Poll active routes every 8 seconds */
export function useActiveRoutes() {
  const { data, error, isLoading, mutate } = useSWR<{ routes: ActiveRoute[] }>(
    `${API}/api/dispatcher/routes`,
    fetcher,
    { refreshInterval: 8_000, dedupingInterval: 4_000 },
  );
  return {
    routes: data?.routes ?? [],
    error,
    isLoading,
    refresh: mutate,
  };
}

/** Poll fleet KPI stats every 15 seconds */
export function useFleetStats() {
  const { data, error, isLoading } = useSWR<FleetStats>(
    `${API}/api/dispatcher/stats`,
    fetcher,
    { refreshInterval: 15_000 },
  );
  return {
    stats: data ?? null,
    error,
    isLoading,
  };
}

/** Get a single route by ID, polled every 5s when a route is selected */
export function useRouteDetail(routeId: string | null) {
  const { data, error, isLoading, mutate } = useSWR<{ route: ActiveRoute }>(
    routeId ? `${API}/api/dispatcher/routes/${routeId}` : null,
    fetcher,
    { refreshInterval: 5_000 },
  );
  return {
    route: data?.route ?? null,
    error,
    isLoading,
    refresh: mutate,
  };
}
