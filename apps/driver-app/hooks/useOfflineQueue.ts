/**
 * useOfflineQueue — persists driver events when the device has no signal.
 *
 * Events survive app restarts: the queue is written to AsyncStorage on every
 * change and restored on mount. This matters because UK rural routes lose signal
 * for 2-15 minutes; without persistence a background-killed app loses all
 * queued STOP_COMPLETE / STOP_FAIL events, leaving dispatcher dashboards stale.
 */
import { useRef, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { useShiftStore } from '../store/shift';
import { useAuthStore } from '../lib/auth';

export type QueuedEvent = {
  type:       'STOP_COMPLETE' | 'STOP_FAIL' | 'LOCATION_PING' | 'DIFFICULTY_REPORT';
  stopId?:    string;
  driverId:   string;
  routeId:    string;
  ts:         number;
  lat?:       number;
  lng?:       number;
  reason?:    string;
  notes?:     string;
  address?:   string;
  categories?: string[];
  parcelId?:  string;
  photoUri?:  string;
  signature?: string;
};

const STORAGE_KEY = 'mj_offline_queue_v1';
const BATCH_SIZE  = 20;

async function persist(events: QueuedEvent[]) {
  try {
    if (events.length === 0) {
      await AsyncStorage.removeItem(STORAGE_KEY);
    } else {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(events));
    }
  } catch {
    // Storage failure is non-fatal; events remain in memory
  }
}

async function load(): Promise<QueuedEvent[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as QueuedEvent[]) : [];
  } catch {
    return [];
  }
}

export function useOfflineQueue() {
  const queue    = useRef<QueuedEvent[]>([]);
  const flushing = useRef(false);
  const loaded   = useRef(false);
  const token    = useAuthStore(s => s.token);
  const shift    = useShiftStore(s => s.shift);

  const API = process.env.EXPO_PUBLIC_API_URL ?? 'https://api.mjmaps.co.uk';

  // ── Restore persisted queue on mount ─────────────────────────────────────
  useEffect(() => {
    load().then(events => {
      if (events.length > 0) queue.current = events;
      loaded.current = true;
    });
  }, []);

  // ── Persist helper ────────────────────────────────────────────────────────
  const save = useCallback(() => persist(queue.current), []);

  // ── Enqueue an event ──────────────────────────────────────────────────────
  const enqueue = useCallback((event: Omit<QueuedEvent, 'ts'>) => {
    queue.current.push({ ...event, ts: Date.now() });
    save();
  }, [save]);

  // ── Flush queue to server ─────────────────────────────────────────────────
  const flush = useCallback(async () => {
    if (flushing.current || !queue.current.length || !token) return;
    flushing.current = true;

    // Drain difficulty reports first — they go to a different endpoint
    const difficulties = queue.current.filter(e => e.type === 'DIFFICULTY_REPORT');
    for (const ev of difficulties) {
      try {
        const res = await fetch(`${API}/api/v1/stops/${ev.stopId}/difficulty`, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body:    JSON.stringify({ categories: ev.categories ?? [], note: ev.notes, address: ev.address ?? '' }),
        });
        if (res.ok) {
          queue.current = queue.current.filter(e => e !== ev);
          save();
        }
      } catch {
        // Network still down — leave in queue
      }
    }

    // Flush remaining events in batches
    while (queue.current.filter(e => e.type !== 'DIFFICULTY_REPORT').length > 0) {
      const batch = queue.current.filter(e => e.type !== 'DIFFICULTY_REPORT').slice(0, BATCH_SIZE);
      try {
        const res = await fetch(`${API}/api/v1/driver/event`, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body:    JSON.stringify({ events: batch }),
        });
        if (res.ok) {
          queue.current = queue.current.filter(e => !batch.includes(e));
          save();
        } else {
          break;
        }
      } catch {
        break;
      }
    }

    flushing.current = false;
  }, [token, save]);

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
