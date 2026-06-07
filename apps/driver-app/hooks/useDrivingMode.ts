/**
 * hooks/useDrivingMode.ts
 * Detects when the driver is moving above a speed threshold.
 *
 * isDriving = true when GPS speed > 8 km/h.
 * Debounce: 3 consecutive readings above threshold before isDriving flips true.
 *          2 consecutive readings below threshold before isDriving flips false.
 * This prevents false positives at traffic lights.
 */
import { useEffect, useRef, useState } from 'react';
import * as Location from 'expo-location';

const SPEED_THRESHOLD_KPH  = 8;
const REQUIRED_TRUE         = 3; // consecutive above → driving
const REQUIRED_FALSE        = 2; // consecutive below → not driving

export function useDrivingMode(): { isDriving: boolean; speedKmh: number } {
  const [isDriving, setIsDriving] = useState(false);
  const [speedKmh, setSpeedKmh]   = useState(0);

  const aboveCount  = useRef(0);
  const belowCount  = useRef(0);

  useEffect(() => {
    let cancelled = false;

    async function startWatching() {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;

      const watch = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.BestForNavigation,
          distanceInterval: 5,   // metres
          timeInterval: 1000,    // 1 second minimum
        },
        (location) => {
          if (cancelled) return;

          const speedMs    = location.coords.speed ?? -1;
          const speed      = speedMs >= 0 ? speedMs * 3.6 : 0; // m/s → km/h
          const above      = speed > SPEED_THRESHOLD_KPH;

          setSpeedKmh(Math.round(speed));

          if (above) {
            belowCount.current = 0;
            aboveCount.current += 1;
            if (aboveCount.current >= REQUIRED_TRUE) {
              aboveCount.current = REQUIRED_TRUE; // cap to stay stable
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

      return () => {
        watch.remove();
      };
    }

    const cleanup = startWatching();
    return () => {
      cancelled = true;
      cleanup.then(fn => fn?.());
    };
  }, []);

  return { isDriving, speedKmh };
}