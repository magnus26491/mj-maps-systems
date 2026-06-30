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
 * Uses the shared location singleton — no own GPS watcher.
 */
import { useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import type { StopPoint } from '../store/deliveryStore';
import { subscribeSharedLocation } from '../lib/shared-location';

const SPEED_THRESHOLD_KPH = 8;
const REQUIRED_TRUE        = 3; // consecutive above → driving
const REQUIRED_FALSE       = 2; // consecutive below → not driving

// ─── Speed detection ─────────────────────────────────────────────────────────

export function useDrivingMode(): { isDriving: boolean; speedKmh: number } {
  const [isDriving, setIsDriving] = useState(false);
  const [speedKmh, setSpeedKmh]   = useState(0);

  const aboveCount   = useRef(0);
  const belowCount   = useRef(0);
  const prevSpeedRef = useRef(-1);

  useEffect(() => {
    const unsub = subscribeSharedLocation((loc) => {
      const speedMs  = loc.speed ?? -1;
      const speed    = speedMs >= 0 ? speedMs * 3.6 : 0;
      const above    = speed > SPEED_THRESHOLD_KPH;

      // Only re-render when the displayed integer changes, not every GPS tick
      const rounded = Math.round(speed);
      if (rounded !== prevSpeedRef.current) {
        prevSpeedRef.current = rounded;
        setSpeedKmh(rounded);
      }

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
    });

    return unsub;
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

if (Platform.OS !== 'web') {
  TaskManager.defineTask(GEOFENCE_TASK, ({ data, error }: any) => {
    if (error) return;
    const { eventType, region } = data as { eventType: Location.LocationGeofencingEventType; region: { identifier: string } };
    if (eventType === Location.GeofencingEventType.Enter) {
      getDeliveryStore().onApproachingStop(region.identifier);
    }
  });
}

/**
 * Register geofence regions for the next N stops from current position.
 * iOS limits to 20 regions; we register only the next 20 to respect that limit.
 */
export async function startStopGeofences(stops: StopPoint[]): Promise<void> {
  if (Platform.OS === 'web') return;

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
  if (Platform.OS === 'web') return;
  try {
    const isRunning = await Location.hasStartedGeofencingAsync(GEOFENCE_TASK);
    if (isRunning) {
      await Location.stopGeofencingAsync(GEOFENCE_TASK);
    }
  } catch { /* non-fatal */ }
}