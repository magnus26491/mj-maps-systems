/**
 * lib/auth.web.ts
 * JWT storage via in-memory Map, Zustand auth store, token refresh.
 * All drivers access auth state via useAuthStore() — single source of truth.
 */
import { create } from 'zustand';
import type { User } from './types';

const memStore = new Map<string, string>();
const secureGet = async (key: string) => memStore.get(key) ?? null;
const secureSet = async (key: string, val: string) => { memStore.set(key, val); };
const secureDel = async (key: string) => { memStore.delete(key); };

const TOKEN_KEY    = 'mj_jwt';
const REFRESH_KEY  = 'mj_refresh';
const USER_KEY     = 'mj_user';
const ROUTE_KEY    = 'mj_route_id';

const BASE = process.env.EXPO_PUBLIC_API_URL ?? 'https://api.mjmapsystems.com';

interface AuthState {
  token:   string | null;
  user:    User | null;
  isReady: boolean;
  setAuth: (token: string, refreshToken: string, user: User) => Promise<void>;
  loadStored: () => Promise<void>;
  logout: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  token:   null,
  user:    null,
  isReady: false,

  setAuth: async (token, refreshToken, user) => {
    await secureSet(TOKEN_KEY,    token);
    await secureSet(REFRESH_KEY, refreshToken);
    await secureSet(USER_KEY,    JSON.stringify(user));
    set({ token, user, isReady: true });

    try {
      const res = await fetch(`${BASE}/api/v1/driver/me/today-route`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const json = await res.json() as { ok: boolean; data: { routeId: string } | null };
        if (json.ok && json.data?.routeId) {
          await secureSet(ROUTE_KEY, json.data.routeId);
        }
      }
    } catch {
      // Non-fatal
    }
  },

  loadStored: async () => {
    const [token, refresh, userRaw] = await Promise.all([
      secureGet(TOKEN_KEY),
      secureGet(REFRESH_KEY),
      secureGet(USER_KEY),
    ]);
    const user = userRaw ? (JSON.parse(userRaw) as User) : null;
    set({ token, user, isReady: true });
  },

  logout: async () => {
    await Promise.all([
      secureDel(TOKEN_KEY),
      secureDel(REFRESH_KEY),
      secureDel(USER_KEY),
      secureDel(ROUTE_KEY),
    ]);
    set({ token: null, user: null });
  },
}));

export async function refreshAccessToken(): Promise<string | null> {
  const refreshToken = await secureGet(REFRESH_KEY);
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
    const userRaw = await secureGet(USER_KEY);
    const user    = userRaw ? (JSON.parse(userRaw) as User) : null;
    if (!user) return null;
    await secureSet(TOKEN_KEY, data.data.token);
    useAuthStore.setState({ token: data.data.token });
    return data.data.token;
  } catch {
    return null;
  }
}
