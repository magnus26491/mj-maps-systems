/**
 * usePermissions — centralised permission state for the driver app.
 *
 * Permissions managed:
 *   · location (foreground)  — required for navigation
 *   · location (background)  — required for shift tracking when screen off
 *   · notifications          — required for dispatcher alerts
 *   · camera                 — required for POD photo capture (B2B tier)
 *
 * Permission state is stored in AsyncStorage so we can show "Open Settings"
 * on subsequent launches when a permission was permanently denied.
 *
 * Expo docs: Location, Notifications, and Camera each have their own
 * requestXxxAsync() function; we unify them here.
 */
import { useEffect, useState, useCallback } from 'react';
import { Platform, Linking } from 'react-native';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import * as Camera from 'expo-camera';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type PermStatus = 'undetermined' | 'granted' | 'denied';

export interface PermissionState {
  location:           PermStatus;
  locationBackground: PermStatus;
  notifications:      PermStatus;
  camera:             PermStatus;
}

const STORAGE_KEY = 'mj_permissions';

const DEFAULT_STATE: PermissionState = {
  location:           'undetermined',
  locationBackground: 'undetermined',
  notifications:      'undetermined',
  camera:             'undetermined',
};

async function loadSaved(): Promise<PermissionState> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (raw) return { ...DEFAULT_STATE, ...JSON.parse(raw) };
  } catch { /* ignore */ }
  return DEFAULT_STATE;
}

async function save(state: PermissionState) {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch { /* ignore */ }
}

function mapStatus(status: string): PermStatus {
  if (status === 'granted') return 'granted';
  if (status === 'denied' || status === 'restricted' || status === 'never_ask_again') return 'denied';
  return 'undetermined';
}

export function usePermissions() {
  const [perms, setPerms] = useState<PermissionState>(DEFAULT_STATE);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    loadSaved().then(p => {
      setPerms(p);
      setLoaded(true);
    });
  }, []);

  const updateAndSave = useCallback((patch: Partial<PermissionState>) => {
    setPerms(prev => {
      const next = { ...prev, ...patch };
      save(next);
      return next;
    });
  }, []);

  // ── Request location (foreground) ──────────────────────────────────────────
  const requestLocation = useCallback(async (): Promise<PermStatus> => {
    if (Platform.OS === 'web') { updateAndSave({ location: 'granted' }); return 'granted'; }
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      const s = mapStatus(status);
      updateAndSave({ location: s });
      return s;
    } catch {
      updateAndSave({ location: 'denied' });
      return 'denied';
    }
  }, [updateAndSave]);

  // ── Request location (background) ──────────────────────────────────────────
  const requestLocationBackground = useCallback(async (): Promise<PermStatus> => {
    if (Platform.OS === 'web') { updateAndSave({ locationBackground: 'granted' }); return 'granted'; }
    try {
      const { status } = await Location.requestBackgroundPermissionsAsync();
      const s = mapStatus(status);
      updateAndSave({ locationBackground: s });
      return s;
    } catch {
      updateAndSave({ locationBackground: 'denied' });
      return 'denied';
    }
  }, [updateAndSave]);

  // ── Request notifications ──────────────────────────────────────────────────
  const requestNotifications = useCallback(async (): Promise<PermStatus> => {
    if (Platform.OS === 'web') { updateAndSave({ notifications: 'granted' }); return 'granted'; }
    try {
      const result = await Notifications.requestPermissionsAsync({
        ios: { allowAlert: true, allowBadge: true, allowSound: true },
      });
      const s = mapStatus(result.status as string);
      updateAndSave({ notifications: s });
      return s;
    } catch {
      updateAndSave({ notifications: 'denied' });
      return 'denied';
    }
  }, [updateAndSave]);

  // ── Request camera ─────────────────────────────────────────────────────────
  const requestCamera = useCallback(async (): Promise<PermStatus> => {
    if (Platform.OS === 'web') { updateAndSave({ camera: 'granted' }); return 'granted'; }
    try {
      const { status } = await Camera.requestCameraPermissionsAsync();
      const s = mapStatus(status as string);
      updateAndSave({ camera: s });
      return s;
    } catch {
      updateAndSave({ camera: 'denied' });
      return 'denied';
    }
  }, [updateAndSave]);

  // ── Open system settings ───────────────────────────────────────────────────
  const openSettings = useCallback(() => {
    Linking.openSettings().catch(() => {});
  }, []);

  const allCriticalGranted = perms.location === 'granted';

  return {
    perms,
    loaded,
    allCriticalGranted,
    requestLocation,
    requestLocationBackground,
    requestNotifications,
    requestCamera,
    openSettings,
  };
}
