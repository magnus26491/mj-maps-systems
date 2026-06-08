import type { Alert, Driver, Route, Stats } from './types';

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

// ── SSE URL helper ───────────────────────────────────────────────────────────

export function getAlertStreamUrl(): string {
  const token = localStorage.getItem(TOKEN_KEY) ?? '';
  return `/api/dispatcher/alerts/stream?token=${encodeURIComponent(token)}`;
}
