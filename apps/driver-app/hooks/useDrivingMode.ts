/**
 * hooks/useDrivingMode.ts
 *
 * Detects when the driver is moving above a speed threshold.
 * isDriving = true when GPS speed > 8 km/h.
 * Debounce: 3 consecutive readings above threshold before isDriving flips true.
 *          2 consecutive readings below threshold before isDriving flips false.
 * This prevents false positives at traffic lights.
 *
 * ALSO exports geofencing for stop-approach detection:
 *   startStopGeofences(stops) — register regions for next 20 stops
 *   stopStopGeofences()       — unregister all regions
 *
 * Uses WhenInUse permission only — no background location needed.
 */
import { useEffect, useRef, useState } from 'react';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import type { StopPoint } from '../store/deliveryStore';

const SPEED_THRESHOLD_KPH = 8;
const REQUIRED_TRUE        = 3; // consecutive above → driving
const REQUIRED_FALSE       = 2; // consecutive below → not driving

// ─── Speed detection ─────────────────────────────────────────────────────────

export function useDrivingMode(): { isDriving: boolean; speedKmh: number } {
  const [isDriving, setIsDriving] = useState(false);
  const [speedKmh, setSpeedKmh]   = useState(0);

  const aboveCount = useRef(0);
  const belowCount = useRef(0);

  useEffect(() => {
    let cancelled = false;

    async function startWatching() {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;

      const watch = await Location.watchPositionAsync(
        {
          accuracy:        Location.Accuracy.BestForNavigation,
          distanceInterval: 5,
          timeInterval:    1000,
        },
        (location) => {
          if (cancelled) return;
          const speedMs    = location.coords.speed ?? -1;
          const speed       = speedMs >= 0 ? speedMs * 3.6 : 0;
          const above       = speed > SPEED_THRESHOLD_KPH;

          setSpeedKmh(Math.round(speed));

          if (above) {
            belowCount.current = 0;
            aboveCount.current += 1;
            if (aboveCount.current >= REQUIRED_TRUE) {
              aboveCount.current = REQUIRED_TRUE;
              setIsDriving(true);
            }
          } else {
            aboveCount.current = 0;
            belowCount.current += 1;
            if (belowCount.current >= REQUIRED_FALSE) {
              belowCount.current = REQUIRED_FALSE;
              setIsDriving(false);
            }
          }
        },
      );

      return () => { watch.remove(); };
    }

    const cleanup = startWatching();
    return () => {
      cancelled = true;
      cleanup.then(fn => fn?.());
    };
  }, []);

  return { isDriving, speedKmh };
}

// ─── Geofencing ─────────────────────────────────────────────────────────────

const GEOFENCE_TASK      = 'STOP_APPROACH_GEOFENCE';
const APPROACH_RADIUS_M  = 80; // ~15 seconds walk

// Import dynamically to avoid circular issues
function getDeliveryStore() {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const store = require('../store/deliveryStore');
  return store.useDeliveryStore.getState();
}

TaskManager.defineTask(GEOFENCE_TASK, ({ data, error }) => {
  if (error) return;
  const { eventType, region } = data as { eventType: string; region: { identifier: string } };
  if (eventType === Location.GeofencingEventType.Enter) {
    getDeliveryStore().onApproachingStop(region.identifier);
  }
});

/**
 * Register geofence regions for the next N stops from current position.
 * iOS limits to 20 regions; we register only the next 20 to respect that limit.
 */
export async function startStopGeofences(stops: StopPoint[]): Promise<void> {
  const regions = stops.slice(0, 20).map(stop => ({
    identifier:  stop.id,
    latitude:    stop.pin?.lat ?? stop.lat,
    longitude:   stop.pin?.lng ?? stop.lng,
    radius:      APPROACH_RADIUS_M,
    notifyOnEnter: true,
    notifyOnExit:  false,
  }));

  if (regions.length === 0) return;

  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== 'granted') return;

  await Location.startGeofencingAsync(GEOFENCE_TASK, regions);
}

/**
 * Unregister all geofence regions.
 * Call this when the shift ends.
 */
export async function stopStopGeofences(): Promise<void> {
  try {
    const isRunning = await Location.hasStartedGeofencingAsync(GEOFENCE_TASK);
    if (isRunning) {
      await Location.stopGeofencingAsync(GEOFENCE_TASK);
    }
  } catch { /* non-fatal */ }
}