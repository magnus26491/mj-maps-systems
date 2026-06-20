/**
 * lib/shared-location.ts
 *
 * Singleton GPS subscription shared across all location consumers.
 *
 * The canonical GPS watcher is owned by useDriverLocation (which also manages
 * background tasks). It calls publishLocation() on every fix.
 * All other consumers (delivery, driving mode, navigation) subscribe here —
 * they share the same update stream and never create their own watchers.
 *
 * Consumers:
 *   - useDriverLocation     → owns the watchPositionAsync + feeds this module
 *   - useDeliveryLocation   → distance to stop + phase transition
 *   - useDrivingMode        → speed-based driving detection
 *   - useNavigation         → nav polyline tracking + off-route detection
 */
import type { LocationCoordinates } from 'expo-location';

export interface SharedLocation {
  latitude:  number;
  longitude:  number;
  heading:    number | null;
  speed:      number | null;
  accuracy:   number | null;
  altitude:   number | null;
  timestamp:  number;
}

let latestLocation: SharedLocation | null = null;
type Listener = (loc: SharedLocation) => void;
const listeners = new Set<Listener>();

/**
 * Called by useDriverLocation on every GPS fix to broadcast to all subscribers.
 * Also sets latestLocation so getLatestLocation() returns a fresh value.
 */
export function publishLocation(loc: LocationCoordinates & { timestamp: number }): void {
  latestLocation = {
    latitude:  loc.latitude,
    longitude: loc.longitude,
    heading:   loc.heading ?? null,
    speed:     loc.speed ?? null,
    accuracy:  loc.accuracy ?? null,
    altitude:  loc.altitude ?? null,
    timestamp: loc.timestamp,
  };
  for (const cb of listeners) cb(latestLocation);
}

/**
 * Subscribe to shared GPS updates. Calls cb immediately with current position if available.
 * Automatically starts the canonical watcher via useDriverLocation.
 */
export function subscribeSharedLocation(cb: Listener): () => void {
  listeners.add(cb);
  if (latestLocation) cb(latestLocation);
  return () => { listeners.delete(cb); };
}

/** Get the latest location synchronously (may be null before first fix). */
export function getLatestLocation(): SharedLocation | null {
  return latestLocation;
}
