/**
 * useDriverLocation — device GPS subscription.
 *
 * This is the canonical foreground GPS watcher — it feeds the shared-location
 * singleton so all other GPS consumers (delivery, driving mode, navigation)
 * share the same subscription without creating multiple watchers.
 *
 * Also starts the background task for backend GPS pings when the app is backgrounded.
 */
import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import * as Location from 'expo-location';
import { publishLocation } from '../lib/shared-location';

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

      if (Platform.OS !== 'web') {
        const bg = await Location.requestBackgroundPermissionsAsync();
        if (bg.status === 'granted') {
          await Location.startLocationUpdatesAsync(BACKGROUND_TASK, {
            accuracy:         Location.Accuracy.Balanced,
            timeInterval:     10_000,
            distanceInterval: 15,
            foregroundService: {
              notificationTitle: 'MJ Maps — Shift Active',
              notificationBody:  'Tracking your location for route guidance.',
              notificationColor: '#4fc3f7',
            },
          }).catch(() => {});
        }
      }

      sub = await Location.watchPositionAsync(
        {
          accuracy:         Location.Accuracy.BestForNavigation,
          timeInterval:     3000,
          distanceInterval: 5,
        },
        loc => {
          const locData: DriverLocation = {
            lat:        loc.coords.latitude,
            lng:        loc.coords.longitude,
            headingDeg: loc.coords.heading,
            speedMps:   loc.coords.speed,
            accuracyM:  loc.coords.accuracy,
          };
          setLocation(locData);
          // Feed the shared singleton so other hooks don't need their own watcher
          publishLocation({
            latitude:  loc.coords.latitude,
            longitude: loc.coords.longitude,
            heading:   loc.coords.heading,
            speed:     loc.coords.speed,
            accuracy:  loc.coords.accuracy,
            altitude:  loc.coords.altitude,
            timestamp: loc.timestamp,
          });
        },
      );
    })();

    return () => { sub?.remove(); };
  }, []);

  return location;
}
