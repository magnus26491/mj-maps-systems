/**
 * useDeliveryLocation — shared GPS subscription hook.
 *
 * Uses the singleton shared-location.ts watcher.
 * Computes haversine distance to current stop.
 * Auto-transitions phase based on distance:
 *   > 200m → EN_ROUTE
 *   ≤ 200m → ARRIVING (fires once per stop)
 */
import { useEffect, useState } from 'react';
import { subscribeSharedLocation, type SharedLocation } from '../lib/shared-location';
import { useDeliveryStore } from '../store/deliveryStore';

interface LocationState {
  lat: number | null;
  lng: number | null;
  distanceM: number | null;
  error: string | null;
}

// Haversine distance in meters
function haversine(
  lat1: number, lng1: number,
  lat2: number, lng2: number,
): number {
  const R = 6371000;
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lng2 - lng1) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) *
    Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

export function useDeliveryLocation() {
  const currentStop = useDeliveryStore(s => s.currentStop);
  const phase = useDeliveryStore(s => s.phase);
  const triggerArriving = useDeliveryStore(s => s.triggerArriving);
  const hasTriggeredArriving = useDeliveryStore(s => s.hasTriggeredArriving);

  const [location, setLocation] = useState<LocationState>({
    lat: null,
    lng: null,
    distanceM: null,
    error: null,
  });

  useEffect(() => {
    const unsub = subscribeSharedLocation((loc: SharedLocation) => {
      setLocation({
        lat: loc.latitude,
        lng: loc.longitude,
        distanceM: null,
        error: null,
      });

      const stop = currentStop;
      if (stop?.pin) {
        const dist = haversine(
          loc.latitude, loc.longitude,
          stop.pin.lat, stop.pin.lng,
        );
        setLocation(l => ({ ...l, distanceM: dist }));

        // Auto-transition: distance ≤ 200m → ARRIVING (once per stop)
        if (
          dist <= 200 &&
          phase === 'EN_ROUTE' &&
          !hasTriggeredArriving
        ) {
          triggerArriving();
        }
      }
    });

    return unsub;
  }, [currentStop?.id, phase, hasTriggeredArriving]);

  return location;
}