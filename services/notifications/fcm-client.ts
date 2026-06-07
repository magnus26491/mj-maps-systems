/**
 * services/notifications/fcm-client.ts
 *
 * Minimal FCM HTTP v1 client.
 * Auth: Google service account → short-lived OAuth2 Bearer token.
 * No firebase-admin dependency — uses jsonwebtoken (already installed).
 *
 * Env vars (warn at startup, never crash):
 *   FCM_PROJECT_ID     — Firebase project ID (e.g. mj-maps-prod)
 *   FCM_CLIENT_EMAIL   — Service account client_email
 *   FCM_PRIVATE_KEY    — Service account private_key (\\n = newline)
 */
import jwt from 'jsonwebtoken';


export const fcmConfigured = Boolean(
  process.env.FCM_PROJECT_ID &&
  process.env.FCM_CLIENT_EMAIL &&
  process.env.FCM_PRIVATE_KEY,
);


if (!fcmConfigured) {
  console.warn(
    '[fcm-client] FCM_PROJECT_ID / FCM_CLIENT_EMAIL / FCM_PRIVATE_KEY not set — FCM push disabled',
  );
}


// ── Token cache ──────────────────────────────────────────────────────────────
let cachedToken: string | null = null;
let tokenExpiresAt = 0; // epoch ms


async function getAccessToken(): Promise<string> {
  if (cachedToken && Date.now() < tokenExpiresAt) return cachedToken;

  const privateKey = (process.env.FCM_PRIVATE_KEY ?? '').replace(/\\n/g, '\n');
  const clientEmail = process.env.FCM_CLIENT_EMAIL!;

  // Sign a JWT assertion for Google OAuth2 token endpoint
  const nowSec = Math.floor(Date.now() / 1000);
  const assertion = jwt.sign(
    {
      iss:   clientEmail,
      sub:   clientEmail,
      aud:   'https://oauth2.googleapis.com/token',
      scope: 'https://www.googleapis.com/auth/firebase.messaging',
      iat:   nowSec,
      exp:   nowSec + 3600,
    },
    privateKey,
    { algorithm: 'RS256' },
  );

  const body = new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth2:grant-type:jwt-bearer',
    assertion,
  });

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`[fcm-client] OAuth2 token fetch failed: ${res.status} ${text}`);
  }

  const data = await res.json() as { access_token: string; expires_in: number };
  cachedToken = data.access_token;
  // Refresh 60 seconds before expiry
  tokenExpiresAt = Date.now() + (data.expires_in - 60) * 1000;
  return cachedToken;
}


// ── FCM message types ────────────────────────────────────────────────────────


export interface FcmNotification {
  title: string;
  body: string;
}


export interface FcmMessage {
  token: string;                          // FCM device registration token
  notification?: FcmNotification;        // visible push (absent = silent)
  data?: Record<string, string>;        // custom key/value payload
  android?: {
    priority?: 'HIGH' | 'NORMAL';
    notification?: { channel_id?: string; sound?: string };
  };
  apns?: {
    headers?: Record<string, string>;
    payload?: { aps?: Record<string, unknown> };
  };
}


export interface FcmSendResult {
  ok: boolean;
  messageId?: string;
  error?: string;
}


/**
 * Send a single FCM message to one device token.
 * Returns a result object — never throws.
 */
export async function sendFcmMessage(message: FcmMessage): Promise<FcmSendResult> {
  if (!fcmConfigured) return { ok: false, error: 'FCM not configured' };

  try {
    const token = await getAccessToken();
    const projectId = process.env.FCM_PROJECT_ID!;
    const url = `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`;

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ message }),
    });

    if (!res.ok) {
      const text = await res.text();
      return { ok: false, error: `FCM HTTP ${res.status}: ${text}` };
    }

    const data = await res.json() as { name?: string };
    return { ok: true, messageId: data.name };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}