'use client';

const TOKEN_KEY   = 'mjmaps_access_token';
const REFRESH_KEY = 'mjmaps_refresh_token';
const API_BASE    = process.env.NEXT_PUBLIC_API_URL ?? '';

export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function setTokens(accessToken: string, refreshToken: string): void {
  localStorage.setItem(TOKEN_KEY, accessToken);
  localStorage.setItem(REFRESH_KEY, refreshToken);
}

export function clearTokens(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(REFRESH_KEY);
}

function decodeJwtPayload(token: string): Record<string, unknown> {
  const part = token.split('.')[1]!;
  // JWTs use base64url (- and _ instead of + and /); atob needs standard base64
  const base64 = part.replace(/-/g, '+').replace(/_/g, '/');
  const padded  = base64 + '=='.slice(0, (4 - base64.length % 4) % 4);
  return JSON.parse(atob(padded));
}

export function isLoggedIn(): boolean {
  const token = getToken();
  if (!token) return false;
  try {
    const payload = decodeJwtPayload(token);
    return typeof payload.exp === 'number' && (payload.exp as number) * 1000 > Date.now() + 30_000;
  } catch {
    return false;
  }
}

export function getUserRole(): string | null {
  const token = getToken();
  if (!token) return null;
  try {
    const payload = decodeJwtPayload(token);
    return (payload.role as string) ?? null;
  } catch {
    return null;
  }
}

/** Fetch wrapper that injects the auth header. On 401, clears tokens and reloads to /dispatcher/login. */
export async function authFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const token = getToken();
  const headers: Record<string, string> = {
    ...(init.headers as Record<string, string> | undefined),
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(url, { ...init, headers });

  if (res.status === 401) {
    clearTokens();
    if (typeof window !== 'undefined') {
      window.location.href = '/dispatcher/login';
    }
  }

  return res;
}

export async function login(email: string, password: string): Promise<{ role: string; planId: string }> {
  const res = await fetch(`${API_BASE}/api/v1/auth/login`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ email, password }),
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? 'Login failed');

  setTokens(data.accessToken, data.refreshToken);
  return { role: data.user.role, planId: data.user.planId };
}

export function logout(): void {
  clearTokens();
  if (typeof window !== 'undefined') {
    window.location.href = '/dispatcher/login';
  }
}
