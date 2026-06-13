import { useState, useEffect } from 'react';
import { getDispatcherDrivers } from '../api';
import type { DriverRow } from '../types';

export function useDrivers() {
  const [drivers, setDrivers] = useState<DriverRow[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);

    getDispatcherDrivers()
      .then(data => {
        if (!cancelled) {
          setDrivers(data.drivers);
          setIsLoading(false);
        }
      })
      .catch(err => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load drivers');
          setIsLoading(false);
        }
      });

    return () => { cancelled = true; };
  }, [refreshKey]);

  function refresh() {
    setRefreshKey(k => k + 1);
  }

  return { drivers, isLoading, error, refresh };
}
