import type { Alert, Driver, Route, Stats, RouteAnalyticsSummary, StopAnalyticsRow, AnalyticsSummary, DriverRow, DriverDetail, DriverRouteRow } from './types';

const TOKEN_KEY = 'mj_dispatcher_token';

// ── Auth helpers ───────────────────────────────────────────────────────────────

export async function login(email: string, password: string) {
  const r = await fetch('/api/v1/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!r.ok) throw new Error('Login failed');
  const data = await r.json() as {
    success: boolean;
    accessToken: string;
    refreshToken: string;
    driver: { id: string; name: string; email: string; role: string; vehicleId: string | null; planId: string };
  };
  localStorage.setItem(TOKEN_KEY, data.accessToken);
  return data;
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

// ── API helpers ───────────────────────────────────────────────────────────────

export async function getStats(): Promise<Stats> {
  const res = await fetch('/api/v1/dispatcher/stats', { headers: authHeaders() });
  if (!res.ok) throw new Error('Failed to load stats');
  return res.json() as Promise<Stats>;
}

export async function getRoutes(): Promise<Route[]> {
  const res = await fetch('/api/v1/dispatcher/routes', { headers: authHeaders() });
  if (!res.ok) throw new Error('Failed to load routes');
  const data = await res.json() as { routes: Route[] };
  return data.routes;
}

export async function getAlerts(): Promise<Alert[]> {
  const res = await fetch('/api/v1/dispatcher/alerts?limit=50', { headers: authHeaders() });
  if (!res.ok) return [];
  const data = await res.json() as { alerts: Alert[] };
  return data.alerts;
}

export async function dismissAlert(id: string): Promise<void> {
  await fetch(`/api/v1/dispatcher/alerts/${id}/dismiss`, {
    method: 'POST',
    headers: authHeaders(),
  });
}

export async function getDrivers(): Promise<Driver[]> {
  const res = await fetch('/api/v1/dispatcher/drivers', { headers: authHeaders() });
  if (res.status === 403) return [];
  if (!res.ok) throw new Error('Failed to load drivers');
  const data = await res.json() as { drivers: Driver[] };
  return data.drivers;
}

export async function assignRoute(routeId: string, driverId: string, note?: string): Promise<void> {
  await fetch('/api/v1/dispatcher/assign', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ routeId, driverId, note }),
  });
}

// ── Driver management helpers ──────────────────────────────────────────────

export async function getDispatcherDrivers(): Promise<{ drivers: DriverRow[] }> {
  return apiFetch('/api/v1/dispatcher/drivers') as Promise<{ drivers: DriverRow[] }>;
}

export async function getDriver(driverId: string): Promise<{
  driver: DriverDetail;
  routes: DriverRouteRow[];
}> {
  return apiFetch(`/api/v1/dispatcher/drivers/${driverId}`) as Promise<{
    driver: DriverDetail;
    routes: DriverRouteRow[];
  }>;
}

export async function updateDriver(
  driverId: string,
  fields: { name?: string; email?: string; role?: string },
): Promise<{ success: boolean }> {
  const res = await fetch(`/api/v1/dispatcher/drivers/${driverId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(fields),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(body.error ?? 'Failed to update driver');
  }
  return res.json() as Promise<{ success: boolean }>;
}

export async function deleteDriver(driverId: string): Promise<{ success: boolean }> {
  const res = await fetch(`/api/v1/dispatcher/drivers/${driverId}`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(body.error ?? 'Failed to delete driver');
  }
  return res.json() as Promise<{ success: boolean }>;
}

// ── SSE URL helpers ────────────────────────────────────────────────────────────

export function getAlertStreamUrl(): string {
  const token = localStorage.getItem(TOKEN_KEY) ?? '';
  return `/api/v1/dispatcher/alerts/stream?token=${encodeURIComponent(token)}`;
}

export function getLocationStreamUrl(): string {
  const token = localStorage.getItem(TOKEN_KEY) ?? '';
  return `/api/v1/dispatcher/locations/stream?token=${encodeURIComponent(token)}`;
}

export async function getStopPod(stopId: string): Promise<{ podUrl: string; podType: string; podCapturedAt: string }> {
  const data = await apiFetch(`/api/v1/dispatcher/stops/${stopId}/pod`) as { success: boolean; podUrl: string; podType: string; podCapturedAt: string };
  return { podUrl: data.podUrl, podType: data.podType, podCapturedAt: data.podCapturedAt };
}

// ── Analytics helpers (Fastify server: /api/v1/dispatcher/analytics/*) ─────────

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
  const path = `/api/v1/dispatcher/analytics/routes${qs.size ? `?${qs}` : ''}`;
  const data = await apiFetch(path) as { ok: boolean; routes: RouteAnalyticsSummary[] };
  if (!data.ok) throw new Error('Analytics routes request failed.');
  return { routes: data.routes };
}

export async function getAnalyticsRoute(routeId: string): Promise<{
  route: RouteAnalyticsSummary;
  stops: StopAnalyticsRow[];
}> {
  const data = await apiFetch(`/api/v1/dispatcher/analytics/routes/${routeId}`) as {
    ok: boolean;
    route: RouteAnalyticsSummary;
    stops: StopAnalyticsRow[];
  };
  if (!data.ok) throw new Error('Analytics route detail request failed.');
  return { route: data.route, stops: data.stops };
}

export async function getAnalyticsSummary(): Promise<AnalyticsSummary> {
  const data = await apiFetch('/api/v1/dispatcher/analytics/summary') as {
    ok: boolean;
  } & AnalyticsSummary;
  if (!data.ok) throw new Error('Analytics summary request failed.');
  const { ok: _ok, ...summary } = data;
  return summary as AnalyticsSummary;
}

// ── Route completion helpers ────────────────────────────────────────────────

export async function forceCompleteRoute(routeId: string): Promise<{ success: boolean }> {
  const res = await fetch(`/api/v1/dispatcher/routes/${routeId}/complete`, {
    method: 'POST',
    headers: authHeaders(),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(body.error ?? 'Failed to complete route');
  }
  return res.json() as Promise<{ success: boolean }>;
}
