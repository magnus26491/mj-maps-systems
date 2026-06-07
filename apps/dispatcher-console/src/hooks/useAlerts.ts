'use client';

import { useEffect, useRef, useState } from 'react';
import type { LiveAlert } from '@/types';

const API = process.env.NEXT_PUBLIC_API_URL ?? '';
const MAX_ALERTS = 50;

/**
 * Connects to the server-sent events stream for live turn alerts.
 * Falls back to polling every 6 seconds if SSE is unavailable.
 */
export function useAlerts() {
  const [alerts, setAlerts] = useState<LiveAlert[]>([]);
  const [connected, setConnected] = useState(false);
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    const url = `${API}/api/dispatcher/alerts/stream`;

    // Try SSE first
    try {
      const es = new EventSource(url);
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
        // Fallback to polling
        startPolling();
      };

      return () => { es.close(); };
    } catch {
      startPolling();
    }

    function startPolling() {
      const interval = setInterval(async () => {
        try {
          const res = await fetch(`${API}/api/dispatcher/alerts?limit=20`);
          if (!res.ok) return;
          const data = await res.json() as { alerts: LiveAlert[] };
          setAlerts(data.alerts.slice(0, MAX_ALERTS));
          setConnected(true);
        } catch {
          setConnected(false);
        }
      }, 6_000);
      return () => clearInterval(interval);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const dismiss = (alertId: string) => {
    setAlerts((prev) =>
      prev.map((a) => a.alertId === alertId ? { ...a, dismissed: true } : a)
    );
    fetch(`${API}/api/dispatcher/alerts/${alertId}/dismiss`, { method: 'POST' }).catch(() => {});
  };

  const undismissedCount = alerts.filter(
    (a) => !a.dismissed && (a.level === 'RED' || a.level === 'AMBER')
  ).length;

  return { alerts, connected, dismiss, undismissedCount };
}
