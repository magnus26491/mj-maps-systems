/**
 * lib/auth.ts
 * JWT storage via expo-secure-store, Zustand auth store, token refresh.
 * All drivers access auth state via useAuthStore() — single source of truth.
 */
import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';
import type { User } from './types';

const TOKEN_KEY   = 'mj_jwt';
const REFRESH_KEY = 'mj_refresh';
const USER_KEY    = 'mj_user';
const ROUTE_KEY   = 'mj_route_id';

const BASE = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000';

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
    await SecureStore.setItemAsync(TOKEN_KEY,    token);
    await SecureStore.setItemAsync(REFRESH_KEY, refreshToken);
    await SecureStore.setItemAsync(USER_KEY,     JSON.stringify(user));
    set({ token, user, isReady: true });

    // Discover today's routeId and cache it in SecureStore for fast startup.
    // Uses fetch directly instead of api.ts to avoid a circular dep (api → auth → api).
    try {
      const res = await fetch(`${BASE}/api/v1/driver/me/today-route`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const json = await res.json() as { ok: boolean; data: { routeId: string } | null };
        if (json.ok && json.data?.routeId) {
          await SecureStore.setItemAsync(ROUTE_KEY, json.data.routeId);
        }
      }
    } catch {
      // Non-fatal — driver can manually refresh on home screen
    }
  },

  loadStored: async () => {
    const [token, refresh, userRaw] = await Promise.all([
      SecureStore.getItemAsync(TOKEN_KEY),
      SecureStore.getItemAsync(REFRESH_KEY),
      SecureStore.getItemAsync(USER_KEY),
    ]);
    const user = userRaw ? (JSON.parse(userRaw) as User) : null;
    set({ token, user, isReady: true });
  },

  logout: async () => {
    await Promise.all([
      SecureStore.deleteItemAsync(TOKEN_KEY),
      SecureStore.deleteItemAsync(REFRESH_KEY),
      SecureStore.deleteItemAsync(USER_KEY),
      SecureStore.deleteItemAsync(ROUTE_KEY),
    ]);
    set({ token: null, user: null });
  },
}));

/**
 * Attempt to refresh the access token using stored refresh token.
 * Returns new token or null on failure.
 */
export async function refreshAccessToken(): Promise<string | null> {
  const refreshToken = await SecureStore.getItemAsync(REFRESH_KEY);
  if (!refreshToken) return null;
  try {
    const res = await fetch(`${BASE}/api/v1/auth/refresh`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ refreshToken }),
    });
    if (!res.ok) return null;
    const data = await res.json() as { ok: boolean; data: { token: string } };
    if (!data.ok) return null;
    const userRaw = await SecureStore.getItemAsync(USER_KEY);
    const user    = userRaw ? (JSON.parse(userRaw) as User) : null;
    if (!user) return null;
    const rt = await SecureStore.getItemAsync(REFRESH_KEY);
    await SecureStore.setItemAsync(TOKEN_KEY, data.data.token);
    useAuthStore.setState({ token: data.data.token });
    return data.data.token;
  } catch {
    return null;
  }
}