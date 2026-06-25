/**
 * useNearbyPOI — fetches fuel stations and EV charging points near the driver.
 *
 * Fetches once on mount, then re-fetches every time the driver moves
 * more than REFETCH_THRESHOLD_M from the last fetch position.
 * Results are cached server-side (5 min) to keep Overpass load low.
 */
import { useState, useEffect, useRef } from 'react';
import { apiGetPOIs } from '../lib/api';
import type { FuelStation, EVCharger } from '../lib/api';

export type { FuelStation, EVCharger };

interface NearbyPOI {
  fuel:       FuelStation[];
  evCharging: EVCharger[];
  loading:    boolean;
  error:      string | null;
}

const REFETCH_THRESHOLD_M = 1500; // re-fetch when driver moves 1.5 km
const RADIUS_M            = 4000; // search 4 km around current position

function haversineM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R    = 6_371_000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function useNearbyPOI(
  lat: number | null,
  lng: number | null,
): NearbyPOI {
  const [fuel,       setFuel]       = useState<FuelStation[]>([]);
  const [evCharging, setEvCharging] = useState<EVCharger[]>([]);
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState<string | null>(null);

  const lastFetchPos = useRef<{ lat: number; lng: number } | null>(null);
  const isFetching   = useRef(false);

  useEffect(() => {
    if (lat == null || lng == null) return;

    // Skip if driver hasn't moved far enough from last fetch
    if (lastFetchPos.current) {
      const dist = haversineM(lat, lng, lastFetchPos.current.lat, lastFetchPos.current.lng);
      if (dist < REFETCH_THRESHOLD_M) return;
    }

    if (isFetching.current) return;
    isFetching.current = true;
    setLoading(true);

    apiGetPOIs(lat, lng, RADIUS_M)
      .then(res => {
        setFuel(res.data.fuel);
        setEvCharging(res.data.evCharging);
        setError(null);
        lastFetchPos.current = { lat, lng };
      })
      .catch(err => {
        setError(err.message ?? 'POI fetch failed');
      })
      .finally(() => {
        setLoading(false);
        isFetching.current = false;
      });
  }, [lat, lng]);

  return { fuel, evCharging, loading, error };
}
