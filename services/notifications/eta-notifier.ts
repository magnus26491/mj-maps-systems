/**
 * services/notifications/eta-notifier.ts
 * Twilio SMS notifications for customer ETA.
 *
 * Env vars required (warn at startup, do NOT crash):
 *   TWILIO_ACCOUNT_SID
 *   TWILIO_AUTH_TOKEN
 *   TWILIO_FROM_NUMBER
 *
 * Follows the same startup-warning pattern as s3-client.ts.
 */
import { getNextPendingStops, insertEtaNotificationAudit } from '../db/eta-store.js';
import { redis } from '../cache/index.js';
import { triggerFcmEtaPush } from './fcm-push.js';


// ── Twilio config ──────────────────────────────────────────────────────────────

export const twilioConfigured = Boolean(
  process.env.TWILIO_ACCOUNT_SID &&
  process.env.TWILIO_AUTH_TOKEN &&
  process.env.TWILIO_FROM_NUMBER,
);


if (!twilioConfigured) {
  console.warn(
    '[eta-notifier] TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_FROM_NUMBER not set — ETA SMS disabled',
  );
}


// Lazy-import Twilio so the module still compiles when env vars are absent
async function getTwilioClient() {
  const twilio = (await import('twilio')).default;
  return twilio(
    process.env.TWILIO_ACCOUNT_SID!,
    process.env.TWILIO_AUTH_TOKEN!,
  );
}


// ── Redis dedup ───────────────────────────────────────────────────────────────

const NOTIFIED_KEY_PREFIX = 'eta:notified:';
const NOTIFIED_TTL_SECONDS = 86_400; // 24h — prevents re-send on route replan

async function isAlreadyNotified(stopId: string): Promise<boolean> {
  try {
    const key = NOTIFIED_KEY_PREFIX + stopId;
    const val = await redis.get(key);
    return val !== null;
  } catch {
    // Redis down — fail open: allow the SMS to proceed
    return false;
  }
}


async function markNotified(stopId: string): Promise<void> {
  try {
    const key = NOTIFIED_KEY_PREFIX + stopId;
    await redis.setex(key, NOTIFIED_TTL_SECONDS, '1');
  } catch {
    // Non-fatal — DB write is the authoritative record
  }
}


// ── SMS builder ───────────────────────────────────────────────────────────────

function buildEtaMessage(params: {
  customerName: string | null;
  address: string;
  etaMinutes: number;
  driverName?: string;
}): string {
  const name = params.customerName ? `, ${params.customerName}` : '';
  const driver = params.driverName ? `Your driver is ${params.driverName}. ` : '';
  const mins = params.etaMinutes <= 1 ? 'less than 1 minute' : `~${params.etaMinutes} minutes`;
  return (
    `Hi${name}! Your MJ Maps delivery is almost there. ` +
    `${driver}ETA: ${mins}. ` +
    `Track live: https://app.mjmaps.co.uk/track`
  );
}


// ── Core trigger ─────────────────────────────────────────────────────────────

type PendingStop = Awaited<ReturnType<typeof getNextPendingStops>>[0];

/**
 * Fire-and-forget ETA notification for a route.
 *
 * Trigger conditions:
 *   - Stop is the current (active) stop, OR
 *   - Scheduled arrival is within 15 minutes
 *
 * Never throws to the caller — all errors are caught and logged internally.
 * Redis down → allow SMS (fail open). Twilio error → audit row with error.
 */
export async function triggerEtaNotifications(
  routeId: string,
  currentStopId: string,
): Promise<void> {
  if (!twilioConfigured) return;

  try {
    const pending = await getNextPendingStops(routeId);
    if (!pending.length) return;

    const now = Date.now();
    const FIFTEEN_MIN_MS = 15 * 60 * 1000;

    const toNotify = pending.filter(stop => {
      if (stop.notificationSent) return false;
      if (stop.stopId === currentStopId) return true;
      if (stop.scheduledArrivalEpoch && stop.scheduledArrivalEpoch * 1000 - now <= FIFTEEN_MIN_MS) return true;
      return false;
    });

    if (!toNotify.length) return;

    await Promise.allSettled(
      toNotify.map(stop => sendEtaSms(stop, currentStopId)),
    );
  } catch (err) {
    console.error('[eta-notifier] triggerEtaNotifications failed:', err);
  }
}


async function sendEtaSms(stop: PendingStop, currentStopId: string): Promise<void> {
  const { stopId, customerPhone, customerName, address } = stop;

  if (!customerPhone) return;
  if (await isAlreadyNotified(stopId)) return;

  try {
    const client = await getTwilioClient();
    const etaMinutes = estimateEta(stop, currentStopId);
    const message = buildEtaMessage({ customerName, address, etaMinutes });

    const twilioMessage = await client.messages.create({
      from: process.env.TWILIO_FROM_NUMBER!,
      to:   customerPhone,
      body: message,
    });

    await markNotified(stopId);

    await insertEtaNotificationAudit({
      stopId,
      phone: customerPhone,
      message,
      twilioSid: twilioMessage.sid,
      status: 'sent',
    });

    const { markStopNotified } = await import('../db/eta-store.js');
    await markStopNotified(stopId);

    // Fire FCM push in parallel — non-fatal
    const customerFcmToken = (stop as any).fcmCustomerToken ?? null;
    triggerFcmEtaPush(stopId, etaMinutes, address, customerFcmToken).catch(() => {});
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    console.error(`[eta-notifier] Failed to send SMS for stop ${stopId}:`, error);

    await insertEtaNotificationAudit({
      stopId,
      phone: customerPhone,
      message: buildEtaMessage({ customerName, address, etaMinutes: 5 }),
      status: 'failed',
      errorMessage: error,
    });
  }
}


function estimateEta(stop: PendingStop, currentStopId: string): number {
  if (stop.scheduledArrivalEpoch) {
    const diffMs = stop.scheduledArrivalEpoch * 1000 - Date.now();
    return Math.max(1, Math.round(diffMs / 60_000));
  }
  return stop.stopId === currentStopId ? 5 : 15;
}