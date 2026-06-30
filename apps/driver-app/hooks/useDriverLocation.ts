/**
 * useDriverLocation — device GPS subscription.
 *
 * Adaptive accuracy: defaults to Balanced (8s / 20m) to save battery while
 * the driver is delivering on foot. Upgrades to BestForNavigation (2s / 3m)
 * when navigation is active — signalled via setNavHighAccuracy() in
 * shared-location.ts. Restarts the watcher automatically on mode change.
 *
 * Feeds the shared-location singleton so all consumers share one GPS stream.
 */
import { useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import * as Location from 'expo-location';
import { publishLocation, subscribeAccuracyMode } from '../lib/shared-location';

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
  const [highAccuracy, setHighAccuracy] = useState(false);
  // Track whether background task is running so we don't start it twice
  const bgStarted = useRef(false);

  // Subscribe to navigation-driven accuracy requests
  useEffect(() => subscribeAccuracyMode(setHighAccuracy), []);

  useEffect(() => {
    let sub: Location.LocationSubscription | null = null;
    let active = true;

    (async () => {
      const { status: fgStatus } = await Location.getForegroundPermissionsAsync();
      if (fgStatus !== 'granted') {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          console.warn('[location] Foreground permission denied');
          return;
        }
      }

      // Background task only starts once — accuracy changes only affect the
      // foreground watcher; background stays at Balanced + 10s/15m always.
      if (Platform.OS !== 'web' && !bgStarted.current) {
        const { status: bgCurrent } = await Location.getBackgroundPermissionsAsync();
        if (bgCurrent === 'undetermined') {
          await Location.requestBackgroundPermissionsAsync();
        }
        const { status: bgGranted } = await Location.getBackgroundPermissionsAsync();
        if (bgGranted === 'granted') {
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
          bgStarted.current = true;
        }
      }

      if (!active) return;

      // Foreground accuracy adapts to navigation state:
      //   Balanced      — 8s / 20m  — delivering on foot, driver parked
      //   BestForNav    — 2s / 3m   — active turn-by-turn navigation
      sub = await Location.watchPositionAsync(
        highAccuracy
          ? { accuracy: Location.Accuracy.BestForNavigation, timeInterval: 2000,  distanceInterval: 3  }
          : { accuracy: Location.Accuracy.Balanced,           timeInterval: 8000,  distanceInterval: 20 },
        loc => {
          const locData: DriverLocation = {
            lat:        loc.coords.latitude,
            lng:        loc.coords.longitude,
            headingDeg: loc.coords.heading,
            speedMps:   loc.coords.speed,
            accuracyM:  loc.coords.accuracy,
          };
          setLocation(locData);
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

    return () => {
      active = false;
      sub?.remove();
    };
  }, [highAccuracy]); // restarts watcher when accuracy mode changes

  return location;
}
