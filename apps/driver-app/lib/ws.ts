/**
 * lib/ws.ts
 * Driver WebSocket client.
 *
 * Connects to: WS_BASE/ws/driver/:driverId/:routeId?token=JWT
 * Sends:   JSON driver events (same shape as POST /api/v1/driver/event)
 * Receives: APPROACH_BRIEF, PLAN_UPDATE, WORKLOAD_WARNING, WORKLOAD_OVERLOAD
 *
 * Auto-reconnects every 3s on drop.
 * Falls back to enqueue() for send if WS not open.
 */
import { useEffect, useRef, useState, useCallback } from 'react';
import * as SecureStore from 'expo-secure-store';
import { enqueue } from './offline-queue';
import { ServerMessageType } from '../constants/events';
import type { ServerMessage } from './types';

const WS_BASE = (process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000')
  .replace(/^http/, 'ws');

interface UseDriverWsOptions {
  driverId:        string;
  routeId:         string;
  onApproachBrief?:   (msg: ServerMessage) => void;
  onPlanUpdate?:      (msg: ServerMessage) => void;
  onWorkloadWarning?: (msg: ServerMessage) => void;
  onOverload?:        (msg: ServerMessage) => void;
}

export function useDriverWs({
  driverId,
  routeId,
  onApproachBrief,
  onPlanUpdate,
  onWorkloadWarning,
  onOverload,
}: UseDriverWsOptions) {
  const wsRef       = useRef<WebSocket | null>(null);
  const [connected, setConnected] = useState(false);
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef   = useRef(true);

  useEffect(() => {
    let cancelled = false;

    async function connect() {
      if (cancelled || !driverId || !routeId) return;
      const token = await SecureStore.getItemAsync('mj_jwt');
      if (cancelled || !token) return;

      const url = `${WS_BASE}/ws/driver/${driverId}/${routeId}?token=${encodeURIComponent(token)}`;
      const ws  = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => { if (!cancelled) setConnected(true); };

      ws.onmessage = (e) => {
        if (cancelled) return;
        try {
          const msg: ServerMessage = JSON.parse(e.data as string);
          switch (msg.type) {
            case ServerMessageType.APPROACH_BRIEF:    onApproachBrief?.(msg);   break;
            case ServerMessageType.PLAN_UPDATE:       onPlanUpdate?.(msg);      break;
            case ServerMessageType.WORKLOAD_WARNING:  onWorkloadWarning?.(msg); break;
            case ServerMessageType.WORKLOAD_OVERLOAD: onOverload?.(msg);        break;
          }
        } catch { /* ignore malformed */ }
      };

      ws.onclose = () => {
        if (cancelled) return;
        setConnected(false);
        reconnectRef.current = setTimeout(connect, 3000);
      };

      ws.onerror = () => ws.close();
    }

    connect();
    return () => {
      cancelled = true;
      if (reconnectRef.current) clearTimeout(reconnectRef.current);
      wsRef.current?.close();
    };
  }, [driverId, routeId]);

  const sendEvent = useCallback(
    async (type: string, payload: Record<string, unknown>) => {
      const fullPayload = { type, driverId, routeId, ...payload };
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify(fullPayload));
      } else {
        await enqueue(type, fullPayload);
      }
    },
    [driverId, routeId],
  );

  return { connected, sendEvent };
}