/**
 * apps/dispatcher-dashboard/lib/api.ts
 * Typed API client for the dispatcher dashboard.
 * Reads NEXT_PUBLIC_API_URL from env — defaults to http://localhost:3000
 */

const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';

function getToken(): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(/(?:^|;\s*)mjtoken=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getToken();
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `HTTP ${res.status}`);
  }
  return res.json();
}

export const api = {
  login:        (email: string, password: string) =>
    apiFetch<{ ok: boolean; data: { token: string; refreshToken: string } }>(
      '/api/v1/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) },
    ),

  me:           () => apiFetch<{ ok: boolean; data: any }>('/api/v1/auth/me'),

  overview:     () => apiFetch<{ ok: boolean; data: any[] }>('/api/v1/dispatcher/overview'),
  drivers:      () => apiFetch<{ ok: boolean; data: any[] }>('/api/v1/dispatcher/drivers'),
  routeDetail:  (routeId: string) => apiFetch<{ ok: boolean; data: any }>(`/api/v1/dispatcher/routes/${routeId}`),
  failedStops:  () => apiFetch<{ ok: boolean; data: any[]; count: number }>('/api/v1/dispatcher/failed-stops'),
  analyticsToday: () => apiFetch<{ ok: boolean; data: any }>('/api/v1/dispatcher/analytics/today'),

  alerts:       (routeId: string) => apiFetch<{ ok: boolean; data: any }>(`/api/v1/routes/${routeId}/alerts`),
  redAlerts:    (routeId: string) => apiFetch<{ ok: boolean; data: any }>(`/api/v1/routes/${routeId}/alerts/red`),
  replan:       (routeId: string, body: any) =>
    apiFetch(`/api/v1/routes/${routeId}/replan`, { method: 'POST', body: JSON.stringify(body) }),
  deleteRoute:  (routeId: string) =>
    apiFetch(`/api/v1/routes/${routeId}`, { method: 'DELETE' }),
  reassignStop: (routeId: string, stopId: string, targetRouteId: string) =>
    apiFetch(`/api/v1/dispatcher/routes/${routeId}/reassign-stop`, {
      method: 'POST', body: JSON.stringify({ stopId, targetRouteId }),
    }),
  updateStopNotes: (stopId: string, body: { accessNotes?: string; last50m?: string }) =>
    apiFetch(`/api/v1/stops/${stopId}/notes`, { method: 'PATCH', body: JSON.stringify(body) }),
  optimise:     (body: any) =>
    apiFetch('/api/v1/routes/optimise', { method: 'POST', body: JSON.stringify(body) }),
};