/**
 * lib/auth.ts
 * JWT storage via expo-secure-store, Zustand auth store, token refresh.
 * All drivers access auth state via useAuthStore() — single source of truth.
 * Web fallback: uses in-memory Map when Platform.OS === 'web'.
 */
import { create } from 'zustand';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import type { User } from './types';

const TOKEN_KEY   = 'mj_jwt';
const REFRESH_KEY = 'mj_refresh';
const USER_KEY    = 'mj_user';
const ROUTE_KEY   = 'mj_route_id';

function webStore() {
  try { return typeof localStorage !== 'undefined' ? localStorage : null; }
  catch { return null; }
}

async function ssGet(key: string): Promise<string | null> {
  if (Platform.OS === 'web') return webStore()?.getItem(key) ?? null;
  return SecureStore.getItemAsync(key);
}

async function ssSet(key: string, value: string): Promise<void> {
  if (Platform.OS === 'web') { webStore()?.setItem(key, value); return; }
  return SecureStore.setItemAsync(key, value);
}

async function ssDel(key: string): Promise<void> {
  if (Platform.OS === 'web') { webStore()?.removeItem(key); return; }
  return SecureStore.deleteItemAsync(key);
}

const BASE = process.env.EXPO_PUBLIC_API_URL ?? 'https://api.mjmaps.co.uk';

interface AuthState {
  token:   string | null;
  user:    User | null;
  isReady: boolean;
  // Actions
  setAuth: (token: string, refreshToken: string, user: User) => Promise<void>;
  loadStored: () => Promise<void>;
  logout: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  token:   null,
  user:    null,
  isReady: false,

  setAuth: async (token, refreshToken, user) => {
    await ssSet(TOKEN_KEY,    token);
    await ssSet(REFRESH_KEY, refreshToken);
    await ssSet(USER_KEY,     JSON.stringify(user));
    set({ token, user, isReady: true });
  },

  loadStored: async () => {
    const [token, refresh, userRaw] = await Promise.all([
      ssGet(TOKEN_KEY),
      ssGet(REFRESH_KEY),
      ssGet(USER_KEY),
    ]);
    const user = userRaw ? (JSON.parse(userRaw) as User) : null;
    set({ token, user, isReady: true });
  },

  logout: async () => {
    const refreshToken = await ssGet(REFRESH_KEY);
    // Revoke server-side so the refresh token can't be replayed after logout.
    // Fire-and-forget — local state clears immediately regardless of network.
    if (refreshToken) {
      fetch(`${BASE}/api/v1/auth/logout`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ refreshToken }),
      }).catch(() => {});
    }
    await Promise.all([
      ssDel(TOKEN_KEY),
      ssDel(REFRESH_KEY),
      ssDel(USER_KEY),
      ssDel(ROUTE_KEY),
    ]);
    set({ token: null, user: null });
  },
}));

/**
 * Attempt to refresh the access token using stored refresh token.
 * Returns new token or null on failure.
 */
export async function refreshAccessToken(): Promise<string | null> {
  const refreshToken = await ssGet(REFRESH_KEY);
  if (!refreshToken) return null;
  try {
    const res = await fetch(`${BASE}/api/v1/auth/refresh`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ refreshToken }),
    });
    if (!res.ok) return null;
    const data = await res.json() as { accessToken: string; refreshToken: string };
    if (!data.accessToken) return null;
    await ssSet(TOKEN_KEY, data.accessToken);
    if (data.refreshToken) await ssSet(REFRESH_KEY, data.refreshToken);
    useAuthStore.setState({ token: data.accessToken });
    return data.accessToken;
  } catch {
    return null;
  }
}