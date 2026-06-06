/**
 * useOfflineQueue — persists driver events when the device has no signal.
 *
 * Why this matters:
 *  UK rural routes commonly lose signal for 2-15 minutes at a time.
 *  Without this, completed/failed stop events are silently lost, meaning
 *  dispatcher dashboards show stale data and drivers have to re-confirm.
 *
 * How it works:
 *  · Events (STOP_COMPLETE, STOP_FAIL, LOCATION_PING) are written to an
 *    in-memory queue (React ref — no AsyncStorage, avoids sandboxing issues)
 *  · NetInfo monitors connectivity
 *  · When connection is restored, flush() sends all queued events to
 *    POST /api/v1/driver/event in batches of 20, retrying failed batches
 *  · Events are timestamped at queue time (not flush time) so server
 *    can reconstruct correct event ordering
 *
 * B2B note:
 *  For dispatcher-tier subscribers, events also include parcelId and
 *  photoUri (populated by the POD module when feature flag is enabled).
 */
import { useRef, useEffect, useCallback } from 'react';
import NetInfo from '@react-native-community/netinfo';
import { useShiftStore } from '../store/shift';

export type QueuedEvent = {
  type:       'STOP_COMPLETE' | 'STOP_FAIL' | 'LOCATION_PING';
  stopId?:    string;
  driverId:   string;
  routeId:    string;
  ts:         number;          // Unix ms — time event occurred
  lat?:       number;
  lng?:       number;
  reason?:    string;          // For STOP_FAIL
  notes?:     string;
  // B2B feature-flagged fields (populated by POD module if enabled)
  parcelId?:  string;
  photoUri?:  string;
  signature?: string;
};

const BATCH_SIZE = 20;

export function useOfflineQueue() {
  const queue     = useRef<QueuedEvent[]>([]);
  const flushing  = useRef(false);
  const token     = useShiftStore(s => s.token);
  const shift     = useShiftStore(s => s.shift);

  const API = process.env.EXPO_PUBLIC_API_URL ?? 'https://api.mjmaps.app';

  // ── Enqueue an event ──────────────────────────────────────────────────────
  const enqueue = useCallback((event: Omit<QueuedEvent, 'ts'>) => {
    queue.current.push({ ...event, ts: Date.now() });
  }, []);

  // ── Flush queue to server ─────────────────────────────────────────────────
  const flush = useCallback(async () => {
    if (flushing.current || !queue.current.length || !token) return;
    flushing.current = true;

    while (queue.current.length > 0) {
      const batch = queue.current.slice(0, BATCH_SIZE);
      try {
        const res = await fetch(`${API}/api/v1/driver/event`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ events: batch }),
        });
        if (res.ok) {
          // Remove successfully sent events
          queue.current = queue.current.slice(batch.length);
        } else {
          // Server error — stop flushing, retry next connection
          break;
        }
      } catch {
        // Network still down — stop flushing
        break;
      }
    }

    flushing.current = false;
  }, [token]);

  // ── Auto-flush on connectivity restored ──────────────────────────────────
  useEffect(() => {
    const unsub = NetInfo.addEventListener(state => {
      if (state.isConnected && state.isInternetReachable) {
        flush();
      }
    });
    return () => unsub();
  }, [flush]);

  return { enqueue, flush, queueLength: () => queue.current.length };
}
