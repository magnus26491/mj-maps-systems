/**
 * useWebSocket — live route updates via WS /ws/driver/:driverId/:routeId
 *
 * Responsibilities:
 *  · Maintain a persistent WebSocket to the API
 *  · Auto-reconnect with exponential back-off (1s → 2s → 4s → 8s → 30s max)
 *  · Parse incoming messages and apply to shift store:
 *      - REORDER: server has re-optimised stop sequence
 *      - STOP_UPDATE: a stop's intel/turn score has been refreshed
 *      - ETA_UPDATE: ETAs adjusted due to traffic
 *      - PING: keep-alive — reply with PONG
 *  · Flush offline queue when connection is restored
 *  · Tear down cleanly on unmount
 *
 * Mobile constraint: WebSocket stays alive in background via
 *  expo-task-manager if foregrounded app loses focus.
 */
import { useEffect, useRef, useCallback } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { useShiftStore } from '../store/shift';
import { useAuthStore } from '../lib/auth';
import { useOfflineQueue } from './useOfflineQueue';

const BASE_URL  = (process.env.EXPO_PUBLIC_API_URL ?? 'https://api.mjmaps.co.uk')
  .replace(/^https/, 'wss')
  .replace(/^http/, 'ws');

const RECONNECT_DELAYS = [1_000, 2_000, 4_000, 8_000, 15_000, 30_000];

export function useWebSocket(driverId: string | null, routeId: string | null) {
  const wsRef        = useRef<WebSocket | null>(null);
  const retryIdx     = useRef(0);
  const mountedRef   = useRef(true);
  const retryTimer   = useRef<ReturnType<typeof setTimeout> | null>(null);

  const token              = useAuthStore(s => s.token);
  const applyReorder       = useShiftStore(s => s.applyReorder);
  const applyStopUpdate    = useShiftStore(s => s.applyStopUpdate);
  const applyEtaUpdate     = useShiftStore(s => s.applyEtaUpdate);
  const setWsConnected     = useShiftStore(s => s.setWsConnected);

  const { flush } = useOfflineQueue();

  const connect = useCallback(() => {
    if (!driverId || !routeId || !token || !mountedRef.current) return;

    const url = `${BASE_URL}/ws/driver/${driverId}/${routeId}?token=${token}`;
    const ws  = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      retryIdx.current = 0;
      setWsConnected(true);
      // Flush any events that queued while offline
      flush();
    };

    ws.onmessage = (evt) => {
      try {
        const msg = JSON.parse(evt.data as string);
        switch (msg.type) {
          case 'PING':
            ws.send(JSON.stringify({ type: 'PONG' }));
            break;
          case 'REORDER':
            applyReorder(msg.payload.orderedStops);
            break;
          case 'STOP_UPDATE':
            applyStopUpdate(msg.payload.stopId, msg.payload.patch);
            break;
          case 'ETA_UPDATE':
            applyEtaUpdate(msg.payload.etas);
            break;
          default:
            // Unknown message type — ignore gracefully
            break;
        }
      } catch {
        // Malformed message — ignore
      }
    };

    ws.onerror = () => {
      setWsConnected(false);
    };

    ws.onclose = (evt) => {
      setWsConnected(false);
      wsRef.current = null;
      if (!mountedRef.current) return;
      // Don't retry on clean close (code 1000) or auth failure (4001)
      if (evt.code === 1000 || evt.code === 4001) return;
      // Exponential back-off reconnect
      const delay = RECONNECT_DELAYS[Math.min(retryIdx.current, RECONNECT_DELAYS.length - 1)];
      retryIdx.current += 1;
      retryTimer.current = setTimeout(connect, delay);
    };
  }, [driverId, routeId, token]);

  // Reconnect when app comes back to foreground
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state: AppStateStatus) => {
      if (state === 'active' && !wsRef.current) {
        connect();
      }
    });
    return () => sub.remove();
  }, [connect]);

  // Initial connect + cleanup
  useEffect(() => {
    mountedRef.current = true;
    connect();
    return () => {
      mountedRef.current = false;
      if (retryTimer.current) clearTimeout(retryTimer.current);
      wsRef.current?.close(1000);
    };
  }, [connect]);

  const send = useCallback((payload: object) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(payload));
      return true;
    }
    return false;
  }, []);

  return { send };
}
