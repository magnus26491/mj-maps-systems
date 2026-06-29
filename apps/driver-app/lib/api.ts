/**
 * lib/api.ts
 * Typed fetch client for the MJ Maps driver app.
 * All requests include JWT Bearer token.
 * On 401: attempt one token refresh → retry once.
 * On second 401: throw 'SESSION_EXPIRED' — caller redirects to login.
 */
import { refreshAccessToken, ssGet } from './auth';
import type {
  AuthResponse, RouteDetail, Vehicle, Alert, AccessBrief, User,
} from './types';

const BASE = process.env.EXPO_PUBLIC_API_URL ?? 'https://api.mjmaps.co.uk';

/** Exported for hooks that build URLs directly (e.g. useGuardian). */
export const API_BASE = BASE;

async function apiFetch<T>(
  path: string,
  init?: RequestInit,
  retry = true,
): Promise<T> {
  const token = await ssGet('mj_jwt');
  const res   = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers ?? {}),
    },
  });

  if (res.status === 401 && retry) {
    const newToken = await refreshAccessToken();
    if (newToken) return apiFetch<T>(path, init, false);
    throw new Error('SESSION_EXPIRED');
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(body.error ?? `HTTP ${res.status}`);
  }

  return res.json();
}

// ── Auth ───────────────────────────────────────────────────────────────────────
export const apiLogin = (email: string, password: string) =>
  apiFetch<AuthResponse>('/api/v1/auth/login', {
    method:  'POST',
    body:    JSON.stringify({ email, password }),
  });

// ── Auth (legacy format — keep for existing callers) ──────────────────────────
export const apiLoginLegacy = (email: string, password: string) =>
  apiFetch<{ success: boolean; accessToken: string; refreshToken: string; driver: User }>(
    '/api/v1/auth/login',
    {
      method:  'POST',
      body:    JSON.stringify({ email, password }),
    },
  );

export const apiMe = () =>
  apiFetch<{ ok: boolean; data: User }>('/api/v1/auth/me');

// ── Driver ───────────────────────────────────────────────────────────────────
export const apiSetVehicle = (vehicleId: string) =>
  apiFetch<{ ok: boolean }>('/api/v1/drivers/me/vehicle', {
    method: 'PATCH',
    body:   JSON.stringify({ vehicleId }),
  });

export const apiRegisterFcmToken = (fcmToken: string) =>
  apiFetch<{ ok: boolean }>('/api/v1/drivers/me/fcm-token', {
    method: 'POST',
    body:   JSON.stringify({ fcmToken }),
  });

// ── Vehicles ──────────────────────────────────────────────────────────────────
export const apiGetVehicles = () =>
  apiFetch<{ ok: boolean; data: Vehicle[] }>('/api/v1/vehicles');

// ── Routes ────────────────────────────────────────────────────────────────────
export const apiGetRouteDetail = (routeId: string) =>
  apiFetch<{ ok: boolean; data: RouteDetail }>(`/api/v1/dispatcher/routes/${routeId}`);

export const apiGetAlerts = (routeId: string) =>
  apiFetch<{ ok: boolean; data: { events: Alert[]; summary: Record<string, number> } }>(
    `/api/v1/routes/${routeId}/alerts`,
  );

export const apiAcceptPlan = (routeId: string) =>
  apiFetch<{ ok: boolean }>(`/api/v1/routes/${routeId}/plan/accept`, { method: 'POST' });

// ── Stops ─────────────────────────────────────────────────────────────────────
export const apiGetApproach = (stopId: string) =>
  apiFetch<{ ok: boolean; data: AccessBrief }>(`/api/v1/stops/${stopId}/approach`);

// ── Driver Events ─────────────────────────────────────────────────────────────
export const apiDriverEvent = (payload: Record<string, unknown>) =>
  apiFetch<{ ok: boolean }>('/api/v1/driver/event', {
    method: 'POST',
    body:   JSON.stringify(payload),
  });

// ── POD Photo ─────────────────────────────────────────────────────────────────
/**
 * Upload POD photo using the presigned S3 URL flow:
 *  1. POST /api/v1/stops/:stopId/pod/upload-url  → { uploadUrl, objectKey }
 *  2. PUT photo blob directly to the presigned S3 URL
 *  3. POST /api/v1/stops/:stopId/pod/confirm     → { proofPhotoUrl }
 */
export async function apiUploadPod(
  stopId:   string,
  photoUri: string,
): Promise<{ podPhotoUrl: string }> {
  // Step 1: Get presigned upload URL
  const urlRes = await apiFetch<{ ok: boolean; data: { uploadUrl: string; objectKey: string; expiresAt: string } }>(
    `/api/v1/stops/${stopId}/pod/upload-url`,
    { method: 'POST' },
  );
  const { uploadUrl, objectKey } = urlRes.data;

  // Step 2: Read photo as blob from local file URI and PUT to S3
  const photoRes = await fetch(photoUri);
  const photoBlob = await photoRes.blob();
  const s3Res = await fetch(uploadUrl, {
    method:  'PUT',
    headers: { 'Content-Type': 'image/jpeg' },
    body:    photoBlob,
  });
  if (!s3Res.ok) throw new Error(`S3 upload failed: ${s3Res.status}`);

  // Step 3: Confirm upload with backend
  const confirmRes = await apiFetch<{ ok: boolean; data: { proofPhotoUrl: string } }>(
    `/api/v1/stops/${stopId}/pod/confirm`,
    {
      method: 'POST',
      body:   JSON.stringify({ objectKey }),
    },
  );
  return { podPhotoUrl: confirmRes.data.proofPhotoUrl };
}

// ── Driver Route Discovery ───────────────────────────────────────────────────

/**
 * Discover today's routeId for the authenticated driver.
 * Called on login. Returns null if no route assigned yet.
 */
export const apiGetTodayRoute = () =>
  apiFetch<{ ok: boolean; data: { routeId: string } | null }>(
    '/api/v1/driver/me/today-route',
  );

/**
 * Fetch full route detail + stops for the authenticated driver.
 * Uses the driver-accessible endpoint (not the dispatcher endpoint).
 * Security enforced server-side: driver can only fetch their own route.
 */
export const apiGetDriverRoute = (routeId: string) =>
  apiFetch<{ ok: boolean; data: RouteDetail }>(
    `/api/v1/driver/routes/${encodeURIComponent(routeId)}`,
  );

// ── Points of Interest ────────────────────────────────────────────────────────
export interface FuelStation {
  id: string; lat: number; lng: number;
  name: string | null; brand: string | null; openingHours: string | null;
}
export interface EVCharger {
  id: string; lat: number; lng: number;
  name: string | null; network: string | null;
  capacity: number | null; maxKw: number | null;
  sockets: string[]; freeToUse: boolean | null;
}
export interface POIData {
  fuel: FuelStation[]; evCharging: EVCharger[]; radiusM: number; cachedAt: string;
}

export const apiGetPOIs = (lat: number, lng: number, radiusM = 3000) =>
  apiFetch<{ ok: boolean; data: POIData }>(
    `/api/v1/pois?lat=${lat}&lng=${lng}&radius=${radiusM}`,
  );

// ── Savings & Insights (Pro/Enterprise) ─────────────────────────────────────────

export interface SavingsMetrics {
  ok: boolean;
  periodDays: number;
  completedRoutes: number;
  headline: string;
  metrics: {
    distanceSavedKm: number;
    durationSavedMin: number;
    fuelSavedLitres: number;
    riskyTurnsAvoided: number;
    avgDistanceSavedKm: number;
    avgDurationSavedMin: number;
  };
}

export interface InsightsSummary {
  ok: boolean;
  trend: 'improving' | 'stable' | 'declining';
  greenRate: number;
  comparedToFleet: number;
  topPattern: {
    type: string;
    description: string;
    count: number;
    recommendation: string;
    severity: 'low' | 'medium' | 'high';
  } | null;
}

/**
 * 30-day rolling savings summary — for HUD card and post-shift screen.
 * Returns ENTERPRISE_REQUIRED error if plan is not Pro or Enterprise.
 */
export async function apiGetSavingsSummary(): Promise<SavingsMetrics> {
  return apiFetch<SavingsMetrics>('/api/v1/analytics/savings/summary');
}

/**
 * Driver coaching insights summary — lightweight version for HUD.
 * Available to all authenticated drivers (their own data only).
 */
export async function apiGetInsightsSummary(driverId: string): Promise<InsightsSummary> {
  return apiFetch<InsightsSummary>(`/api/v1/drivers/${encodeURIComponent(driverId)}/insights/summary`);
}

// ── Generic API client (for DeleteAccountModal) ─────────────────────────────
interface ApiClient {
  delete: (path: string, token: string | null) => Promise<{ ok: boolean; json: () => Promise<{ message?: string }> }>;
}

export const api: ApiClient = {
  delete: async (path: string, token: string | null) => {
    const res = await fetch(`${BASE}${path}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });
    return {
      ok: res.ok,
      json: () => res.json(),
    };
  },
};