import type { Alert, Driver, Route, Stats, RouteAnalyticsSummary, StopAnalyticsRow, AnalyticsSummary } from './types';

const TOKEN_KEY = 'mj_dispatcher_token';

// ── Auth helpers ─────────────────────────────────────────────────────────────

export function login(email: string, password: string): Promise<{ token: string }> {
  return fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  }).then(r => {
    if (!r.ok) throw new Error('Login failed');
    return r.json() as Promise<{ token: string }>;
  }).then(data => {
    localStorage.setItem(TOKEN_KEY, data.token);
    return data;
  });
}

export function logout(): void {
  localStorage.removeItem(TOKEN_KEY);
}

function authHeaders(): HeadersInit {
  const token = localStorage.getItem(TOKEN_KEY) ?? '';
  return { Authorization: `Bearer ${token}` };
}

async function apiFetch(path: string): Promise<unknown> {
  const res = await fetch(path, { headers: authHeaders() });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: 'Request failed' })) as { error?: string; code?: string };
    if (res.status === 403 && body.code === 'ENTERPRISE_REQUIRED') {
      throw Object.assign(new Error('Enterprise plan required'), { code: 'ENTERPRISE_REQUIRED' });
    }
    throw new Error(body.error ?? `Request failed: ${res.status}`);
  }
  return res.json();
}

// ── API helpers ─────────────────────────────────────────────────────────────

export async function getStats(): Promise<Stats> {
  const res = await fetch('/api/dispatcher/stats', { headers: authHeaders() });
  if (!res.ok) throw new Error('Failed to load stats');
  return res.json() as Promise<Stats>;
}

export async function getRoutes(): Promise<Route[]> {
  const res = await fetch('/api/dispatcher/routes', { headers: authHeaders() });
  if (!res.ok) throw new Error('Failed to load routes');
  const data = await res.json() as { routes: Route[] };
  return data.routes;
}

export async function getAlerts(): Promise<Alert[]> {
  const res = await fetch('/api/dispatcher/alerts?limit=50', { headers: authHeaders() });
  if (!res.ok) return [];
  const data = await res.json() as { alerts: Alert[] };
  return data.alerts;
}

export async function dismissAlert(id: string): Promise<void> {
  await fetch(`/api/dispatcher/alerts/${id}/dismiss`, {
    method: 'POST',
    headers: authHeaders(),
  });
}

export async function getDrivers(): Promise<Driver[]> {
  const res = await fetch('/api/dispatcher/drivers', { headers: authHeaders() });
  if (res.status === 403) return [];
  if (!res.ok) throw new Error('Failed to load drivers');
  const data = await res.json() as { drivers: Driver[] };
  return data.drivers;
}

export async function assignRoute(routeId: string, driverId: string, note?: string): Promise<void> {
  await fetch('/api/dispatcher/assign', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ routeId, driverId, note }),
  });
}

// ── SSE URL helpers ──────────────────────────────────────────────────────────

export function getAlertStreamUrl(): string {
  const token = localStorage.getItem(TOKEN_KEY) ?? '';
  return `/api/dispatcher/alerts/stream?token=${encodeURIComponent(token)}`;
}

export function getLocationStreamUrl(): string {
  const token = localStorage.getItem(TOKEN_KEY) ?? '';
  return `/api/dispatcher/locations/stream?token=${encodeURIComponent(token)}`;
}

export async function getStopPod(stopId: string): Promise<{ podUrl: string; podType: string; podCapturedAt: string }> {
  const data = await apiFetch(`/api/dispatcher/stops/${stopId}/pod`) as { success: boolean; podUrl: string; podType: string; podCapturedAt: string };
  return { podUrl: data.podUrl, podType: data.podType, podCapturedAt: data.podCapturedAt };
}

// ── Analytics helpers ───────────────────────────────────────────────────────

export async function getAnalyticsRoutes(params?: {
  from?: string;
  to?: string;
  driverId?: string;
  limit?: number;
}): Promise<{ routes: RouteAnalyticsSummary[] }> {
  const qs = new URLSearchParams();
  if (params?.from) qs.set('from', params.from);
  if (params?.to) qs.set('to', params.to);
  if (params?.driverId) qs.set('driverId', params.driverId);
  if (params?.limit) qs.set('limit', String(params.limit));
  const path = `/api/dispatcher/analytics/routes${qs.size ? `?${qs}` : ''}`;
  return apiFetch(path) as Promise<{ routes: RouteAnalyticsSummary[] }>;
}

export async function getAnalyticsRoute(routeId: string): Promise<{
  route: RouteAnalyticsSummary;
  stops: StopAnalyticsRow[];
}> {
  return apiFetch(`/api/dispatcher/analytics/routes/${routeId}`) as Promise<{
    route: RouteAnalyticsSummary;
    stops: StopAnalyticsRow[];
  }>;
}

export async function getAnalyticsSummary(): Promise<AnalyticsSummary> {
  return apiFetch('/api/dispatcher/analytics/summary') as Promise<AnalyticsSummary>;
}
