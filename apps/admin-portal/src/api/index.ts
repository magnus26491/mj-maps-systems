// apps/admin-portal/src/api/index.ts
// Centralised API client — mirrors dispatcher app pattern

const API_BASE = '/api/v1';

// ── In-memory auth store ──────────────────────────────────────────────────────
// localStorage / sessionStorage are blocked inside sandboxed iframes.
// An in-memory module-level Map survives React re-renders within the same
// page session. Hard page refresh logs the admin out — acceptable for a
// privileged portal, and more secure (tokens never hit storage APIs).
const _store = new Map<string, string>();

function storeGet(key: string): string | null {
  return _store.get(key) ?? null;
}
function storeSet(key: string, value: string): void {
  _store.set(key, value);
}
function storeRemove(key: string): void {
  _store.delete(key);
}

// ── Auth helpers ──────────────────────────────────────────────────────────────

export function authHeaders(): Record<string, string> {
  const token = storeGet('mj_admin_token');
  if (!token) throw new Error('Not authenticated');
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
  };
}

async function apiFetch<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      ...(opts.headers && typeof opts.headers === 'object' && !Array.isArray(opts.headers) && 'Authorization' in opts.headers ? {} : authHeaders()),
      ...opts.headers,
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    const msg = (body as { error?: string }).error ?? `HTTP ${res.status}`;
    throw Object.assign(new Error(msg), { status: res.status, code: (body as { code?: string }).code });
  }
  if (res.status === 204) return {} as T;
  return res.json() as Promise<T>;
}

// ── Auth ─────────────────────────────────────────────────────────────────────

export async function adminLogin(email: string, password: string): Promise<{
  accessToken: string;
  refreshToken: string;
  user: { id: string; email: string; role: string; isOwner: boolean };
}> {
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const body = await res.json() as {
    accessToken: string;
    refreshToken: string;
    user: { id: string; email: string; role: string; isOwner: boolean; planId: string };
  };
  if (!res.ok) throw new Error((body as { error?: string }).error ?? 'Login failed');
  // Verify admin role
  if (body.user.role !== 'admin') {
    throw Object.assign(new Error('Admin access required. This portal is for administrators only.'), {
      status: 403, code: 'ADMIN_REQUIRED',
    });
  }
  // Store in memory
  storeSet('mj_admin_token', body.accessToken);
  storeSet('mj_admin_refresh', body.refreshToken);
  storeSet('mj_admin_user', JSON.stringify(body.user));
  return body;
}

export function logout(): void {
  storeRemove('mj_admin_token');
  storeRemove('mj_admin_refresh');
  storeRemove('mj_admin_user');
}

export function getStoredUser(): { id: string; email: string; role: string; isOwner: boolean } | null {
  const raw = storeGet('mj_admin_user');
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

export function isAuthenticated(): boolean {
  return !!storeGet('mj_admin_token');
}

export function isOwner(): boolean {
  const user = getStoredUser();
  return user?.isOwner ?? false;
}

// ── Overview ──────────────────────────────────────────────────────────────────

export const getOverview = () =>
  apiFetch<{ ok: boolean; overview: import('../types').Overview }>('/admin/overview');

// ── Users ─────────────────────────────────────────────────────────────────────

export const getUsers = (params: {
  search?: string; plan?: string; isActive?: string; sort?: string;
  page?: number; limit?: number;
} = {}) => {
  const qs = new URLSearchParams();
  if (params.search)  qs.set('search', params.search);
  if (params.plan)    qs.set('plan', params.plan);
  if (params.isActive) qs.set('isActive', params.isActive);
  if (params.sort)    qs.set('sort', params.sort);
  qs.set('page', String(params.page ?? 1));
  qs.set('limit', String(params.limit ?? 20));
  return apiFetch<{ ok: boolean; users: import('../types').User[]; pagination: import('../types').Pagination }>(
    `/admin/users?${qs}`
  );
};

export const getUser = (id: string) =>
  apiFetch<{ ok: boolean; user: import('../types').User; recentRoutes: unknown[] }>(
    `/admin/users/${id}`
  );

export const updateUser = (id: string, data: { isActive?: boolean; reason?: string }) =>
  apiFetch<{ ok: boolean }>(`/admin/users/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });

export const changeSubscription = (
  id: string,
  data: {
    planId?: string; trialDays?: number; expiresAt?: string;
    compMonths?: number; cancelAtPeriodEnd?: boolean; reason: string;
  }
) =>
  apiFetch<{ ok: boolean }>(`/admin/users/${id}/subscription`, {
    method: 'POST',
    body: JSON.stringify(data),
  });

export const changeRole = (id: string, role: string, reason: string) =>
  apiFetch<{ ok: boolean }>(`/admin/users/${id}/role`, {
    method: 'POST',
    body: JSON.stringify({ role, reason }),
  });

// ── Trials ─────────────────────────────────────────────────────────────────────

export const getTrials = () =>
  apiFetch<{ ok: boolean; trials: Array<{
    id: string; email: string; role: string;
    trialEndsAt: string; daysRemaining: number; planStatus: string;
    joinedAt: string; lastLogin: string | null;
  }> }>('/admin/trials');

// ── Admins ─────────────────────────────────────────────────────────────────────

export const getAdmins = () =>
  apiFetch<{ ok: boolean; admins: import('../types').Admin[] }>('/admin/admins');

export const addAdmin = (email: string, reason: string) =>
  apiFetch<{ ok: boolean; userId: string; email: string }>('/admin/admins', {
    method: 'POST',
    body: JSON.stringify({ email, reason }),
  });

export const removeAdmin = (id: string, reason: string) =>
  apiFetch<{ ok: boolean }>(`/admin/admins/${id}`, {
    method: 'DELETE',
    body: JSON.stringify({ reason }),
  });

// ── Tickets ─────────────────────────────────────────────────────────────────────

export const getTickets = (params: { status?: string; priority?: string; page?: string } = {}) => {
  const qs = new URLSearchParams();
  if (params.status)   qs.set('status', params.status);
  if (params.priority)  qs.set('priority', params.priority);
  if (params.page)      qs.set('page', params.page);
  return apiFetch<{ ok: boolean; tickets: import('../types').Ticket[]; pagination: import('../types').Pagination }>(
    `/admin/tickets?${qs}`
  );
};

export const getTicket = (id: string) =>
  apiFetch<{ ok: boolean; ticket: import('../types').Ticket; messages: import('../types').TicketMessage[] }>(
    `/admin/tickets/${id}`
  );

export const replyTicket = (id: string, body: string) =>
  apiFetch<{ ok: boolean; messageId: string }>(`/admin/tickets/${id}/reply`, {
    method: 'POST',
    body: JSON.stringify({ body }),
  });

export const updateTicket = (id: string, data: {
  status?: string; priority?: string; assigneeId?: string | null;
}) =>
  apiFetch<{ ok: boolean }>(`/admin/tickets/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });

// ── System Health ────────────────────────────────────────────────────────────────

export const getSystemHealth = () =>
  apiFetch<{ ok: boolean; health: {
    database: { status: string; latencyMs: number | null };
    redis: { status: string; note?: string };
    timestamp: string;
    uptime: number;
    environment: string;
    tableSizes: Record<string, number>;
  } }>('/admin/system-health');

// ── Audit Log ──────────────────────────────────────────────────────────────────

export const getAuditLog = (params: {
  adminId?: string; action?: string; targetId?: string;
  search?: string; from?: string; to?: string;
  page?: string; limit?: string;
} = {}) => {
  const qs = new URLSearchParams();
  if (params.adminId)  qs.set('adminId', params.adminId);
  if (params.action)   qs.set('action', params.action);
  if (params.targetId) qs.set('targetId', params.targetId);
  if (params.search)   qs.set('search', params.search);
  if (params.from)     qs.set('from', params.from);
  if (params.to)       qs.set('to', params.to);
  if (params.page)     qs.set('page', params.page);
  if (params.limit)     qs.set('limit', params.limit);
  return apiFetch<{
    ok: boolean; logs: import('../types').AuditLogEntry[]; pagination: import('../types').Pagination;
  }>(`/admin/audit-logs?${qs}`);
};

// ── Errors ─────────────────────────────────────────────────────────────────────

export const getErrors = (params: { page?: string; limit?: string } = {}) => {
  const qs = new URLSearchParams();
  if (params.page)  qs.set('page', params.page);
  if (params.limit) qs.set('limit', params.limit);
  return apiFetch<{
    ok: boolean; errors: import('../types').AuditLogEntry[]; pagination: import('../types').Pagination;
  }>(`/admin/errors?${qs}`);
};


// ── Impersonation ─────────────────────────────────────────────────────────────

export async function startImpersonation(
  userId: string,
  reason: string,
): Promise<{
  ok: boolean;
  token: string;
  expiresAt: string;
  sessionId: string;
  impersonatedUser: { id: string; email: string; role: string };
}> {
  return apiFetch(`/admin/users/${userId}/impersonate`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  });
}

export async function endImpersonationSession(sessionId?: string): Promise<{ ok: boolean }> {
  return apiFetch('/admin/impersonation/end', {
    method: 'POST',
    body: JSON.stringify(sessionId ? { sessionId } : {}),
  });
}

export async function getImpersonationSessions(): Promise<{
  ok: boolean;
  sessions: Array<{
    id: string;
    impersonatedUserEmail: string;
    impersonatedUserId: string;
    impersonatedUserRole: string;
    reason: string;
    ipAddress: string | null;
    startedAt: string;
    expiresAt: string;
    revokedAt: string | null;
  }>;
}> {
  return apiFetch('/admin/impersonation/sessions');
}
