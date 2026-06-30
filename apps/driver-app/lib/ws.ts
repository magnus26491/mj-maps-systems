/**
 * lib/ws.ts
 * Driver WebSocket client.
 *
 * Connects to: WS_BASE/ws/driver/:driverId/:routeId
 * Auth: sends { type: 'AUTH', token } as first message after onopen
 *       (never in URL — prevents token appearing in server/proxy logs)
 * Sends:   JSON driver events
 * Receives: APPROACH_BRIEF, REPLAN, ETA_UPDATE, WORKLOAD_WARNING, WORKLOAD_OVERLOAD
 *           (PLAN_UPDATE is legacy alias for REPLAN)
 *
 * Auto-reconnects every 3s on drop, with token refresh on 4008/4001 close codes.
 * Falls back to enqueue() for send if WS not open.
 */
import { useEffect, useRef, useState, useCallback } from 'react';
import { useAuthStore, refreshAccessToken } from './auth';
import { enqueue } from './offline-queue';
import { ServerMessageType, DriverEventType } from '../constants/events';
import type { ServerMessage } from './types';

const WS_BASE = (process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000')
  .replace(/^https/, 'wss')
  .replace(/^http/, 'ws');

// WS close codes used by our server
const CODE_UNAUTHORIZED   = 4001;
const CODE_TOKEN_EXPIRED  = 4008;

interface UseDriverWsOptions {
  driverId:           string;
  routeId:            string;
  onApproachBrief?:   (msg: ServerMessage) => void;
  onReplan?:          (msg: ServerMessage) => void;   // server sends: type: 'REPLAN'
  onPlanUpdate?:      (msg: ServerMessage) => void;   // legacy alias for REPLAN
  onEtaUpdate?:       (msg: ServerMessage) => void;   // server sends: type: 'ETA_UPDATE'
  onWorkloadWarning?: (msg: ServerMessage) => void;
  onOverload?:        (msg: ServerMessage) => void;
}

export function useDriverWs({
  driverId,
  routeId,
  onApproachBrief,
  onReplan,
  onPlanUpdate,
  onEtaUpdate,
  onWorkloadWarning,
  onOverload,
}: UseDriverWsOptions) {
  const wsRef         = useRef<WebSocket | null>(null);
  const [connected, setConnected] = useState(false);
  const reconnectRef  = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function connect() {
      if (cancelled || !driverId || !routeId) return;

      let token = useAuthStore.getState().token;
      if (!token) token = await refreshAccessToken();
      if (cancelled || !token) return;

      // Token NOT in URL — sent as first message after open
      const url = `${WS_BASE}/ws/driver/${driverId}/${routeId}`;
      const ws  = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        if (cancelled) return;
        // Authenticate via first message (token never in URL/logs)
        ws.send(JSON.stringify({ type: 'AUTH', token }));
        setConnected(true);
      };

      ws.onmessage = (e) => {
        if (cancelled) return;
        try {
          const msg: ServerMessage = JSON.parse(e.data as string);
          switch (msg.type) {
            case ServerMessageType.APPROACH_BRIEF:    onApproachBrief?.(msg);   break;
            case ServerMessageType.REPLAN:            onReplan?.(msg);           break;
            case ServerMessageType.PLAN_UPDATE:       onPlanUpdate?.(msg);      break;  // legacy alias
            case ServerMessageType.ETA_UPDATE:        onEtaUpdate?.(msg);        break;
            case ServerMessageType.WORKLOAD_WARNING:  onWorkloadWarning?.(msg); break;
            case ServerMessageType.WORKLOAD_OVERLOAD: onOverload?.(msg);        break;
            // STOP_COMPLETED, CONNECTED, ERROR — no-op hooks for now
            // (handlers can be added later as needed)
          }
        } catch { /* ignore malformed */ }
      };

      ws.onclose = async (event) => {
        if (cancelled) return;
        setConnected(false);

        // Token expired — refresh before reconnecting
        if (event.code === CODE_UNAUTHORIZED || event.code === CODE_TOKEN_EXPIRED) {
          await refreshAccessToken();
        }

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
    async (type: DriverEventType, payload: Record<string, unknown>) => {
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