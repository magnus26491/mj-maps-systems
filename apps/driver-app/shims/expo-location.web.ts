// Web stub for expo-location — browser Geolocation API where available, no-ops otherwise.

export type LocationCoordinates = {
  latitude: number;
  longitude: number;
  altitude: number | null;
  accuracy: number;
  altitudeAccuracy: number | null;
  heading: number | null;
  speed: number | null;
};

export type LocationObject = {
  coords: LocationCoordinates;
  timestamp: number;
};

export type LocationSubscription = { remove: () => void };

export const Accuracy = {
  Lowest: 1,
  Low: 2,
  Balanced: 3,
  High: 4,
  Highest: 5,
  BestForNavigation: 6,
};

export const PermissionStatus = {
  GRANTED: 'granted',
  DENIED: 'denied',
  UNDETERMINED: 'undetermined',
};

export async function requestForegroundPermissionsAsync() {
  return { status: PermissionStatus.GRANTED };
}

export async function requestBackgroundPermissionsAsync() {
  return { status: PermissionStatus.GRANTED };
}

export async function getForegroundPermissionsAsync() {
  return { status: PermissionStatus.GRANTED };
}

export async function getCurrentPositionAsync(
  _options?: object,
): Promise<LocationObject> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocation not available'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        resolve({
          coords: {
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
            altitude: pos.coords.altitude,
            accuracy: pos.coords.accuracy,
            altitudeAccuracy: pos.coords.altitudeAccuracy,
            heading: pos.coords.heading,
            speed: pos.coords.speed,
          },
          timestamp: pos.timestamp,
        }),
      reject,
      { enableHighAccuracy: true, timeout: 10000 },
    );
  });
}

export function watchPositionAsync(
  _options: object,
  callback: (loc: LocationObject) => void,
): Promise<LocationSubscription> {
  if (!navigator.geolocation) {
    return Promise.resolve({ remove: () => {} });
  }
  const id = navigator.geolocation.watchPosition(
    (pos) =>
      callback({
        coords: {
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          altitude: pos.coords.altitude,
          accuracy: pos.coords.accuracy,
          altitudeAccuracy: pos.coords.altitudeAccuracy,
          heading: pos.coords.heading,
          speed: pos.coords.speed,
        },
        timestamp: pos.timestamp,
      }),
    undefined,
    { enableHighAccuracy: true },
  );
  return Promise.resolve({ remove: () => navigator.geolocation.clearWatch(id) });
}

export async function hasServicesEnabledAsync(): Promise<boolean> {
  return typeof navigator !== 'undefined' && 'geolocation' in navigator;
}

export async function enableNetworkProviderAsync(): Promise<void> {}

// Background tasks — no-ops on web (no background execution)
export async function startLocationUpdatesAsync(
  _taskName: string,
  _options?: object,
): Promise<void> {}

export async function stopLocationUpdatesAsync(_taskName: string): Promise<void> {}

export async function hasStartedLocationUpdatesAsync(_taskName: string): Promise<boolean> {
  return false;
}

// Geofencing — no-ops on web
export enum GeofencingEventType {
  Enter = 1,
  Exit  = 2,
}

export const LocationGeofencingEventType = GeofencingEventType;

export async function startGeofencingAsync(
  _taskName: string,
  _regions: object[],
): Promise<void> {}

export async function stopGeofencingAsync(_taskName: string): Promise<void> {}

export async function hasStartedGeofencingAsync(_taskName: string): Promise<boolean> {
  return false;
}

// Provider status
export async function getProviderStatusAsync() {
  return {
    locationServicesEnabled: typeof navigator !== 'undefined' && 'geolocation' in navigator,
    backgroundModeEnabled: false,
    gpsAvailable: true,
    networkAvailable: typeof navigator !== 'undefined' && navigator.onLine,
    passiveAvailable: false,
  };
}

export default {
  Accuracy,
  PermissionStatus,
  GeofencingEventType,
  LocationGeofencingEventType,
  requestForegroundPermissionsAsync,
  requestBackgroundPermissionsAsync,
  getForegroundPermissionsAsync,
  getCurrentPositionAsync,
  watchPositionAsync,
  hasServicesEnabledAsync,
  enableNetworkProviderAsync,
  startLocationUpdatesAsync,
  stopLocationUpdatesAsync,
  hasStartedLocationUpdatesAsync,
  startGeofencingAsync,
  stopGeofencingAsync,
  hasStartedGeofencingAsync,
  getProviderStatusAsync,
};
