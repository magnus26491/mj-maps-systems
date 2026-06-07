/**
 * apps/dispatcher-dashboard/lib/ws.ts
 * React hook for read-only dispatcher WebSocket connection to a driver route.
 * Dispatcher observes driver events without sending — reconnects on drop.
 */
'use client';
import { useEffect, useRef, useState } from 'react';

const WS_BASE = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000')
  .replace(/^http/, 'ws');

export interface DriverEvent {
  type: string;
  driverId?: string;
  routeId?: string;
  stopId?: string;
  lat?: number;
  lng?: number;
  payload?: any;
}

export function useDriverStream(driverId: string | null, routeId: string | null) {
  const [events, setEvents] = useState<DriverEvent[]>([]);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!driverId || !routeId) return;

    function getToken() {
      const match = document.cookie.match(/(?:^|;\s*)mjtoken=([^;]+)/);
      return match ? decodeURIComponent(match[1]) : '';
    }

    function connect() {
      const token = getToken();
      const url = `${WS_BASE}/ws/driver/${driverId}/${routeId}?token=${token}`;
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => setConnected(true);
      ws.onclose = () => {
        setConnected(false);
        setTimeout(connect, 3000);
      };
      ws.onmessage = (e) => {
        try {
          const event: DriverEvent = JSON.parse(e.data);
          setEvents(prev => [event, ...prev].slice(0, 100));
        } catch { /* ignore malformed */ }
      };
    }

    connect();
    return () => wsRef.current?.close();
  }, [driverId, routeId]);

  return { events, connected };
}