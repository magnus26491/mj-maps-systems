/**
 * Vehicle profile store — Zustand with SecureStore persistence
 *
 * Driver selects ONE vehicle for the entire shift.
 * Sent to backend with every route request so enrichRoute()
 * computes turn.alertLevel correctly for that vehicle.
 */
import { create } from 'zustand';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

function localGet(key: string): string | null {
  if (Platform.OS === 'web') {
    try { return typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null; }
    catch { return null; }
  }
  return null;
}

function localSet(key: string, value: string): void {
  if (Platform.OS === 'web') {
    try { if (typeof localStorage !== 'undefined') localStorage.setItem(key, value); }
    catch {}
  }
}

export type VehicleProfile =
  | 'car'
  | 'small_van'
  | 'luton_van'
  | 'rigid_7_5t'
  | 'artic';

export interface VehicleOption {
  key: VehicleProfile;
  label: string;
  description: string;
}

export const VEHICLE_OPTIONS: VehicleOption[] = [
  { key: 'car',       label: 'Car',         description: 'Standard car' },
  { key: 'small_van', label: 'Small Van',    description: '≤3.5t panel van' },
  { key: 'luton_van', label: 'Luton Van',   description: 'Box van with tail lift' },
  { key: 'rigid_7_5t', label: '7.5t Rigid', description: '7.5 tonne rigid truck' },
  { key: 'artic',     label: 'Artic',       description: 'Articulated lorry' },
];

const STORAGE_KEY = 'vehicle_profile';

// Map to backend vehicle profile keys
export const VEHICLE_PROFILE_MAP: Record<VehicleProfile, string> = {
  car:        'car',
  small_van:  'small_van',
  luton_van:  'luton_van',
  rigid_7_5t: 'rigid_7_5t',
  artic:      'artic',
};

interface VehicleState {
  vehicleProfile: VehicleProfile | null;
  isLoaded: boolean;
  setVehicleProfile: (profile: VehicleProfile) => Promise<void>;
  loadVehicleProfile: () => Promise<void>;
}

export const useVehicleStore = create<VehicleState>((set) => ({
  vehicleProfile: null,
  isLoaded: false,

  loadVehicleProfile: async () => {
    try {
      const stored = Platform.OS === 'web'
        ? localGet(STORAGE_KEY)
        : await SecureStore.getItemAsync(STORAGE_KEY);
      if (stored && VEHICLE_OPTIONS.some(v => v.key === stored)) {
        set({ vehicleProfile: stored as VehicleProfile, isLoaded: true });
      } else {
        set({ isLoaded: true });
      }
    } catch {
      set({ isLoaded: true });
    }
  },

  setVehicleProfile: async (profile) => {
    try {
      if (Platform.OS === 'web') {
        localSet(STORAGE_KEY, profile);
      } else {
        await SecureStore.setItemAsync(STORAGE_KEY, profile);
      }
      set({ vehicleProfile: profile });
    } catch (err) {
      console.error('[vehicleStore] Failed to persist:', err);
    }
  },
}));