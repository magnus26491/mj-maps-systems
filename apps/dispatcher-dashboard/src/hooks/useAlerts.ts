import { useState, useEffect, useCallback } from 'react';
import { getAlertStreamUrl, getAlerts, dismissAlert } from '../api';
import type { Alert } from '../types';

export function useAlerts(): { alerts: Alert[]; dismiss: (id: string) => void } {
  const [alerts, setAlerts] = useState<Alert[]>([]);

  useEffect(() => {
    let es: EventSource | null = null;
    let pollInterval: ReturnType<typeof setInterval> | null = null;

    function startPolling() {
      pollInterval = setInterval(async () => {
        const fresh = await getAlerts().catch(() => []);
        setAlerts(fresh.slice(0, 50));
      }, 10_000);
    }

    try {
      es = new EventSource(getAlertStreamUrl());
      es.addEventListener('alert', (e: MessageEvent) => {
        const alert = JSON.parse(e.data) as Alert;
        setAlerts(prev => [alert, ...prev].slice(0, 50));
      });
      es.onerror = () => {
        es?.close();
        es = null;
        startPolling();
      };
    } catch {
      startPolling();
    }

    return () => {
      es?.close();
      if (pollInterval) clearInterval(pollInterval);
    };
  }, []);

  const dismiss = useCallback(async (id: string) => {
    await dismissAlert(id);
    setAlerts(prev => prev.filter(a => a.alertId !== id));
  }, []);

  return { alerts, dismiss };
}
