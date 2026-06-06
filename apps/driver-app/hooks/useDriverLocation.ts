/**
 * useDriverLocation — device GPS subscription.
 * Battery-efficient: 10s background interval, 3s foreground.
 * Foreground service notification keeps tracking when screen is off.
 */
import { useEffect, useState } from 'react';
import * as Location from 'expo-location';

export interface DriverLocation {
  lat:        number;
  lng:        number;
  headingDeg: number | null;
  speedMps:   number | null;
  accuracyM:  number | null;
}

const BACKGROUND_TASK = 'mj-maps-location';

export function useDriverLocation(): DriverLocation | null {
  const [location, setLocation] = useState<DriverLocation | null>(null);

  useEffect(() => {
    let sub: Location.LocationSubscription | null = null;

    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        console.warn('[location] Foreground permission denied');
        return;
      }

      const bg = await Location.requestBackgroundPermissionsAsync();
      if (bg.status === 'granted') {
        await Location.startLocationUpdatesAsync(BACKGROUND_TASK, {
          accuracy:         Location.Accuracy.Balanced,
          timeInterval:     10_000, // 10s — battery efficient
          distanceInterval: 15,     // or every 15m
          foregroundService: {
            notificationTitle: 'MJ Maps — Shift Active',
            notificationBody:  'Tracking your location for route guidance.',
            notificationColor: '#4fc3f7',
          },
        }).catch(() => {});
      }

      sub = await Location.watchPositionAsync(
        {
          accuracy:         Location.Accuracy.BestForNavigation,
          timeInterval:     3000,
          distanceInterval: 5,
        },
        loc => setLocation({
          lat:        loc.coords.latitude,
          lng:        loc.coords.longitude,
          headingDeg: loc.coords.heading,
          speedMps:   loc.coords.speed,
          accuracyM:  loc.coords.accuracy,
        }),
      );
    })();

    return () => { sub?.remove(); };
  }, []);

  return location;
}
