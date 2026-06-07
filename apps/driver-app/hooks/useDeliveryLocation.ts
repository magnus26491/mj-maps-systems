/**
 * useDeliveryLocation — Expo Location hook
 *
 * Watches position with high accuracy.
 * Computes haversine distance to current stop.
 * Auto-transitions phase based on distance:
 *   > 200m → EN_ROUTE
 *   ≤ 200m → ARRIVING (fires once per stop)
 */
import { useEffect, useRef, useState } from 'react';
import * as Location from 'expo-location';
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
  const R = 6371000; // Earth radius in meters
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

  const subscriptionRef = useRef<Location.LocationSubscription | null>(null);

  useEffect(() => {
    let mounted = true;

    async function startWatching() {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        if (mounted) {
          setLocation(l => ({ ...l, error: 'Location permission denied' }));
        }
        return;
      }

      subscriptionRef.current = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.BestForNavigation,
          timeInterval: 3000,
          distanceInterval: 5,
        },
        (location) => {
          if (!mounted) return;

          const { latitude, longitude } = location.coords;
          setLocation({
            lat: latitude,
            lng: longitude,
            distanceM: null,
            error: null,
          });

          // Compute distance to current stop
          const stop = currentStop;
          if (stop?.pin) {
            const dist = haversine(
              latitude, longitude,
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
        },
      );
    }

    startWatching();

    return () => {
      mounted = false;
      if (subscriptionRef.current) {
        subscriptionRef.current.remove();
        subscriptionRef.current = null;
      }
    };
  }, [currentStop?.id, phase, hasTriggeredArriving]);

  return location;
}