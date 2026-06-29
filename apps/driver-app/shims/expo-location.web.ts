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

export default {
  Accuracy,
  PermissionStatus,
  requestForegroundPermissionsAsync,
  requestBackgroundPermissionsAsync,
  getForegroundPermissionsAsync,
  getCurrentPositionAsync,
  watchPositionAsync,
  hasServicesEnabledAsync,
  enableNetworkProviderAsync,
};
