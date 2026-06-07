/**
 * lib/offline-queue.ts
 * Persistent event queue backed by AsyncStorage.
 *
 * Queue strategy:
 *   LOCATION_UPDATE  → discard when queue > 50 (non-critical)
 *   APPROACH_BRIEF    → never queue (time-sensitive, meaningless when replayed)
 *   STOP_COMPLETED    → critical = true, never discard
 *   STOP_FAILED       → critical = true, never discard
 *   ROUTE_STARTED     → critical = true
 *   ROUTE_COMPLETED   → critical = true
 *
 * Retry: exponential backoff 2s → 4s → 8s → 16s → 30s cap
 * Storage: AsyncStorage key 'mj_event_queue'
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiDriverEvent } from './api';
import type { QueuedEvent } from './types';
import { DriverEventType } from '../constants/events';

const QUEUE_KEY           = 'mj_event_queue';
const MAX_LOCATION_QUEUE  = 50;

function uuid(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function isCritical(type: string): boolean {
  return [
    DriverEventType.STOP_COMPLETED,
    DriverEventType.STOP_FAILED,
    DriverEventType.ROUTE_STARTED,
    DriverEventType.ROUTE_COMPLETED,
  ].includes(type as any);
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
  type:    string,
  payload: Record<string, unknown>,
): Promise<void> {
  // Never queue approach briefs
  if (type === DriverEventType.APPROACH_BRIEF) return;

  const queue    = await readQueue();
  const critical = isCritical(type);

  // Cull non-critical location updates if queue is too large
  if (type === DriverEventType.LOCATION_UPDATE) {
    const locationCount = queue.filter(e => e.type === DriverEventType.LOCATION_UPDATE).length;
    if (locationCount >= MAX_LOCATION_QUEUE) return; // discard
  }

  const entry: QueuedEvent = {
    id:         uuid(),
    type,
    payload,
    queuedAt:   Date.now(),
    retryCount: 0,
    critical,
  };

  await writeQueue([...queue, entry]);
}

export async function flushQueue(): Promise<void> {
  const queue = await readQueue();
  if (queue.length === 0) return;

  const remaining: QueuedEvent[] = [];

  for (const event of queue) {
    try {
      await apiDriverEvent({ type: event.type, ...event.payload });
      // Success — drop from queue
    } catch {
      event.retryCount += 1;
      // Exponential backoff
      const backoffMs = Math.min(2000 * Math.pow(2, event.retryCount - 1), 30_000);
      const retryAfter = event.queuedAt + backoffMs * event.retryCount;
      if (Date.now() < retryAfter && !event.critical) {
        remaining.push(event);
      } else {
        remaining.push(event); // critical events stay forever until sent
      }
    }
  }

  await writeQueue(remaining);
}

export async function getQueueLength(): Promise<number> {
  const q = await readQueue();
  return q.length;
}