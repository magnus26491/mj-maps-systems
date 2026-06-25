/**
 * useTokenRefresh
 * Silently refreshes the driver's JWT 5 minutes before it expires.
 * Prevents mid-shift logouts without any driver interaction.
 *
 * Mount once inside AuthGuard (above all screens) so the timer
 * re-arms whenever the token changes (e.g. after manual refresh).
 */
import { useEffect, useRef } from 'react';
import { useAuthStore, refreshAccessToken } from '../lib/auth';

function jwtExpiryMs(token: string): number | null {
  try {
    const payloadB64 = token.split('.')[1];
    if (!payloadB64) return null;
    const payload = JSON.parse(
      // atob works in both RN (hermes) and web
      Buffer.from(payloadB64, 'base64').toString('utf-8'),
    );
    return typeof payload.exp === 'number' ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
}

const REFRESH_BEFORE_MS = 5 * 60 * 1_000; // refresh 5 min before expiry

export function useTokenRefresh(): void {
  const token  = useAuthStore(s => s.token);
  const logout = useAuthStore(s => s.logout);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (!token) return;

    const expMs = jwtExpiryMs(token);
    if (!expMs) return;

    const msUntilRefresh = expMs - Date.now() - REFRESH_BEFORE_MS;

    const doRefresh = async () => {
      const newToken = await refreshAccessToken();
      if (!newToken) {
        // Refresh token itself expired — force re-login
        await logout();
      }
      // On success, useAuthStore.token changes → this effect re-runs and re-arms
    };

    if (msUntilRefresh <= 0) {
      // Token already near/past expiry — refresh immediately
      doRefresh();
      return;
    }

    timerRef.current = setTimeout(doRefresh, msUntilRefresh);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [token]);
}
