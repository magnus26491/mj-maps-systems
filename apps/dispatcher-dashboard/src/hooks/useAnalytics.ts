import { useState, useEffect } from 'react';
import { getAnalyticsSummary, getAnalyticsRoutes } from '../api';
import type { AnalyticsSummary, RouteAnalyticsSummary } from '../types';

export function useAnalytics() {
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [routes, setRoutes] = useState<RouteAnalyticsSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);

    Promise.all([
      getAnalyticsSummary(),
      getAnalyticsRoutes({ limit: 20 }),
    ])
      .then(([sum, { routes: r }]) => {
        if (!cancelled) {
          setSummary(sum);
          setRoutes(r);
          setIsLoading(false);
        }
      })
      .catch(err => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load analytics');
          setIsLoading(false);
        }
      });

    return () => { cancelled = true; };
  }, []);

  return { summary, routes, isLoading, error };
}