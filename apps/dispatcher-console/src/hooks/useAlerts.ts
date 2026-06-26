'use client';

import { useEffect, useRef, useState } from 'react';
import { authFetch, getToken } from '@/lib/auth';
import type { LiveAlert } from '@/types';

const API = process.env.NEXT_PUBLIC_API_URL ?? '';
const MAX_ALERTS = 50;

/**
 * Connects to the server-sent events stream for live turn alerts.
 * Falls back to polling every 6 seconds if SSE is unavailable.
 * EventSource doesn't support custom headers, so token is passed as query param for SSE.
 */
export function useAlerts() {
  const [alerts, setAlerts] = useState<LiveAlert[]>([]);
  const [connected, setConnected] = useState(false);
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    const token = getToken();
    // EventSource doesn't support Authorization header — pass token in query string for SSE only.
    // The server validates it as a bearer token when present as ?token=...
    const sseUrl = token
      ? `${API}/api/v1/dispatcher/alerts/stream?token=${encodeURIComponent(token)}`
      : `${API}/api/v1/dispatcher/alerts/stream`;

    let pollCleanup: (() => void) | undefined;

    function startPolling() {
      const interval = setInterval(async () => {
        try {
          const res = await authFetch(`${API}/api/v1/dispatcher/alerts?limit=20`);
          if (!res.ok) return;
          const data = await res.json() as { alerts: LiveAlert[] };
          setAlerts(data.alerts.slice(0, MAX_ALERTS));
          setConnected(true);
        } catch {
          setConnected(false);
        }
      }, 6_000);
      pollCleanup = () => clearInterval(interval);
    }

    try {
      const es = new EventSource(sseUrl);
      esRef.current = es;

      es.onopen = () => setConnected(true);

      es.addEventListener('alert', (e: MessageEvent) => {
        const alert = JSON.parse(e.data) as LiveAlert;
        setAlerts((prev) => {
          const deduped = prev.filter((a) => a.alertId !== alert.alertId);
          return [alert, ...deduped].slice(0, MAX_ALERTS);
        });
      });

      es.onerror = () => {
        setConnected(false);
        es.close();
        startPolling();
      };
    } catch {
      startPolling();
    }

    return () => {
      esRef.current?.close();
      pollCleanup?.();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const dismiss = (alertId: string) => {
    setAlerts((prev) =>
      prev.map((a) => a.alertId === alertId ? { ...a, dismissed: true } : a)
    );
    authFetch(`${API}/api/v1/dispatcher/alerts/${alertId}/dismiss`, { method: 'POST' }).catch(() => {});
  };

  const undismissedCount = alerts.filter(
    (a) => !a.dismissed && (a.level === 'RED' || a.level === 'AMBER')
  ).length;

  return { alerts, connected, dismiss, undismissedCount };
}
