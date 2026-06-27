import type { Alert, Driver, Route, Stats, RouteAnalyticsSummary, StopAnalyticsRow, AnalyticsSummary, DriverRow, DriverDetail, DriverRouteRow } from './types';

const TOKEN_KEY = 'mj_dispatcher_token';

// ── Auth helpers ─────────────────────────────────────────────────────────────

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
    user: { id: string; name: string; email: string; role: string; vehicleId: string | null; planId: string };
  };
  localStorage.setItem(TOKEN_KEY, data.accessToken);
  // Persist role for client-side role checks (Admin nav item, impersonation)
  localStorage.setItem('mj_user_role', data.user.role ?? 'dispatcher');
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

// ── API helpers ─────────────────────────────────────────────────────────────

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

// ── Driver management helpers ────────────────────────────────────────────────

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

// ── SSE URL helpers ──────────────────────────────────────────────────────────

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

// ── Analytics helpers (Fastify server: /api/v1/dispatcher/analytics/*) ───────

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

// ── Route completion helpers ──────────────────────────────────────────────────

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

// ── Admin Portal API helpers ───────────────────────────────────────────────────
// All functions require role='admin' — server returns 403 for non-admins

export interface AdminUser {
  id: string;
  email: string;
  role: string;
  plan: string;
  subscriptionTier: string;
  isActive: boolean;
  createdAt: string;
  lastLoginAt: string | null;
  activeRouteCount: number;
  organisationId: string | null;
  organisationName: string | null;
}

export interface AdminAuditLog {
  id: string;
  adminId: string;
  action: string;
  targetType: string | null;
  targetId: string | null;
  oldValue: unknown | null;
  newValue: unknown | null;
  reason: string | null;
  ipAddress: string | null;
  impersonating: boolean;
  impersonatedUserId: string | null;
  createdAt: string;
}

export interface AdminFeatureFlag {
  key: string;
  value: boolean;
  rawValue: unknown;
  description: string;
  updatedBy: string | null;
  updatedAt: string;
  createdAt: string;
}

export interface AdminPlatformAnalytics {
  period: string;
  users: {
    total: number;
    active: number;
    paid: number;
    byRole: { drivers: number; dispatchers: number; admins: number };
  };
  routes: { total: number; active: number; completed: number; abandoned: number };
  stops: {
    total: number; completed: number; failed: number; pending: number;
    completionRate: number; podCaptureRate: number;
  };
  turnScores: {
    green: number; amber: number; red: number; unknown: number;
    avgScore: number; greenRate: number; amberRate: number; redRate: number;
  };
  topVehicles: { vehicleId: string; routeCount: number }[];
  fleets: { total: number };
}

export interface AdminSystemHealth {
  database: { status: string; latencyMs: number | null };
  redis: { status: string; note: string };
  timestamp: string;
  uptime: number;
  environment: string;
  tableSizes: Record<string, number>;
}

async function adminFetch(path: string, init?: RequestInit): Promise<unknown> {
  const res = await fetch(path, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...authHeaders(), ...init?.headers },
  });
  if (res.status === 403) {
    const body = await res.json().catch(() => ({})) as { error?: string; code?: string };
    throw Object.assign(new Error(body.error ?? 'Admin access required'), {
      code: body.code ?? 'ADMIN_REQUIRED',
    });
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: 'Request failed' })) as { error?: string };
    throw new Error(body.error ?? `Request failed: ${res.status}`);
  }
  return res.json();
}

export async function adminGetUsers(params?: {
  page?: number; limit?: number; search?: string; plan?: string; isActive?: string; sort?: string;
}): Promise<{ users: AdminUser[]; pagination: { page: number; limit: number; total: number; totalPages: number } }> {
  const qs = new URLSearchParams();
  if (params?.page) qs.set('page', String(params.page));
  if (params?.limit) qs.set('limit', String(params.limit));
  if (params?.search) qs.set('search', params.search);
  if (params?.plan) qs.set('plan', params.plan);
  if (params?.isActive) qs.set('isActive', params.isActive);
  if (params?.sort) qs.set('sort', params.sort);
  const path = `/api/v1/admin/users${qs.size ? `?${qs}` : ''}`;
  const data = await adminFetch(path) as { ok: boolean; users: AdminUser[]; pagination: { page: number; limit: number; total: number; totalPages: number } };
  return { users: data.users, pagination: data.pagination };
}

export async function adminGetUser(userId: string): Promise<{
  user: AdminUser;
  recentRoutes: { id: string; status: string; totalStops: number; completedStops: number; failedStops: number; shiftStart: string | null; createdAt: string }[];
}> {
  return adminFetch(`/api/v1/admin/users/${userId}`) as Promise<{
    user: AdminUser;
    recentRoutes: { id: string; status: string; totalStops: number; completedStops: number; failedStops: number; shiftStart: string | null; createdAt: string }[];
  }>;
}

export async function adminImpersonate(userId: string, reason: string): Promise<{
  token: string; expiresAt: string; sessionId: string;
  impersonatedUser: { id: string; email: string; role: string };
}> {
  const data = await adminFetch(`/api/v1/admin/users/${userId}/impersonate`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  }) as { ok: boolean; token: string; expiresAt: string; sessionId: string; impersonatedUser: { id: string; email: string; role: string } };
  return data;
}

export async function adminEndImpersonation(sessionId?: string): Promise<{ success: boolean }> {
  return adminFetch('/api/v1/admin/impersonation/end', {
    method: 'POST',
    body: JSON.stringify({ sessionId }),
  }) as Promise<{ success: boolean }>;
}

export async function adminChangePlan(userId: string, newPlan: string, reason: string): Promise<{
  user: { id: string; email: string; plan: string };
}> {
  return adminFetch(`/api/v1/admin/users/${userId}/plan`, {
    method: 'PATCH',
    body: JSON.stringify({ newPlan, reason }),
  }) as Promise<{ user: { id: string; email: string; plan: string } }>;
}

export async function adminGetAuditLogs(params?: {
  adminId?: string; action?: string; targetId?: string; from?: string; to?: string;
  page?: number; limit?: number;
}): Promise<{ logs: AdminAuditLog[]; pagination: { page: number; limit: number; total: number; totalPages: number } }> {
  const qs = new URLSearchParams();
  if (params?.adminId) qs.set('adminId', params.adminId);
  if (params?.action) qs.set('action', params.action);
  if (params?.targetId) qs.set('targetId', params.targetId);
  if (params?.from) qs.set('from', params.from);
  if (params?.to) qs.set('to', params.to);
  if (params?.page) qs.set('page', String(params.page));
  if (params?.limit) qs.set('limit', String(params.limit));
  const path = `/api/v1/admin/audit-logs${qs.size ? `?${qs}` : ''}`;
  return adminFetch(path) as Promise<{ logs: AdminAuditLog[]; pagination: { page: number; limit: number; total: number; totalPages: number } }>;
}

export async function adminGetFeatureFlags(): Promise<{ flags: AdminFeatureFlag[] }> {
  return adminFetch('/api/v1/admin/feature-flags') as Promise<{ flags: AdminFeatureFlag[] }>;
}

export async function adminToggleFeatureFlag(key: string, value: unknown, reason: string): Promise<{
  flag: { key: string; value: unknown; description: string };
}> {
  return adminFetch(`/api/v1/admin/feature-flags/${encodeURIComponent(key)}`, {
    method: 'PATCH',
    body: JSON.stringify({ value, reason }),
  }) as Promise<{ flag: { key: string; value: unknown; description: string } }>;
}

export async function adminGetPlatformAnalytics(): Promise<{ analytics: AdminPlatformAnalytics }> {
  return adminFetch('/api/v1/admin/platform-analytics') as Promise<{ analytics: AdminPlatformAnalytics }>;
}

export async function adminGetSystemHealth(): Promise<{ health: AdminSystemHealth }> {
  return adminFetch('/api/v1/admin/system-health') as Promise<{ health: AdminSystemHealth }>;
}

export async function adminGetSubscriptions(params?: { page?: number; limit?: number }): Promise<{
  subscriptions: unknown[];
  pagination: { page: number; limit: number; note?: string };
}> {
  const qs = new URLSearchParams();
  if (params?.page) qs.set('page', String(params.page));
  if (params?.limit) qs.set('limit', String(params.limit));
  const path = `/api/v1/admin/subscriptions${qs.size ? `?${qs}` : ''}`;
  return adminFetch(path) as Promise<{
    subscriptions: unknown[];
    pagination: { page: number; limit: number; note?: string };
  }>;
}
