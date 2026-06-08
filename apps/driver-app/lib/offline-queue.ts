/**
 * lib/offline-queue.ts
 * Persistent event queue backed by AsyncStorage.
 *
 * Queue strategy:
 *   LOCATION_UPDATE  → discard when queue > 50 (non-critical)
 *   APPROACH_BRIEF   → never queue (time-sensitive, meaningless when replayed)
 *   STOP_COMPLETED   → critical = true, never discard
 *   STOP_FAILED      → critical = true, never discard
 *   ROUTE_STARTED    → critical = true
 *   ROUTE_COMPLETED  → critical = true
 *
 * Retry: exponential backoff 2s → 4s → 8s → 16s → 30s cap, tracked per attempt
 * Storage: AsyncStorage key 'mj_event_queue'
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiDriverEvent } from './api';
import { refreshAccessToken, useAuthStore } from './auth';
import type { QueuedEvent } from './types';
import { DriverEventType } from '../constants/events';

const QUEUE_KEY          = 'mj_event_queue';
const MAX_LOCATION_QUEUE = 50;

function uuid(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function isCritical(type: DriverEventType): boolean {
  return (
    type === DriverEventType.STOP_COMPLETED ||
    type === DriverEventType.STOP_FAILED ||
    type === DriverEventType.ROUTE_STARTED ||
    type === DriverEventType.ROUTE_COMPLETED
  );
}

async function readQueue(): Promise<QueuedEvent[]> {
  try {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

async function writeQueue(queue: QueuedEvent[]): Promise<void> {
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
}

export async function enqueue(
  type:    DriverEventType,
  payload: Record<string, unknown>,
): Promise<void> {
  if (type === DriverEventType.APPROACH_BRIEF) return;

  const queue    = await readQueue();
  const critical = isCritical(type);

  if (type === DriverEventType.LOCATION_UPDATE) {
    const locationCount = queue.filter(e => e.type === DriverEventType.LOCATION_UPDATE).length;
    if (locationCount >= MAX_LOCATION_QUEUE) return;
  }

  const entry: QueuedEvent = {
    id:            uuid(),
    type,
    payload,
    queuedAt:      Date.now(),
    lastAttemptAt: 0,     // tracks last retry time, not original queue time
    retryCount:    0,
    critical,
  };

  await writeQueue([...queue, entry]);
}

export async function flushQueue(): Promise<void> {
  const queue = await readQueue();
  if (queue.length === 0) return;

  // Attempt token refresh once before flushing — JWT may have expired
  let token = useAuthStore.getState().token;
  if (!token) {
    token = await refreshAccessToken();
    if (!token) return; // no valid token — cannot flush
  }

  const remaining: QueuedEvent[] = [];
  const now = Date.now();

  for (const event of queue) {
    // Backoff check: use lastAttemptAt (not queuedAt)
    if (event.retryCount > 0) {
      const backoffMs   = Math.min(2000 * Math.pow(2, event.retryCount - 1), 30_000);
      const retryAfter  = (event.lastAttemptAt ?? event.queuedAt) + backoffMs;
      if (now < retryAfter) {
        remaining.push(event); // not yet time to retry
        continue;
      }
    }

    try {
      await apiDriverEvent({ type: event.type, ...event.payload });
      // Success — event dropped from queue
    } catch (err: any) {
      // 401 — token expired mid-flush, attempt one refresh then retry
      if (err?.status === 401 || err?.message?.includes('401')) {
        const newToken = await refreshAccessToken();
        if (newToken) {
          try {
            await apiDriverEvent({ type: event.type, ...event.payload });
            continue; // success after refresh — drop event
          } catch {
            // still failing after refresh — re-queue
          }
        }
      }
      event.retryCount    += 1;
      event.lastAttemptAt  = now;
      remaining.push(event);
    }
  }

  await writeQueue(remaining);
}

export async function getQueueLength(): Promise<number> {
  const q = await readQueue();
  return q.length;
}