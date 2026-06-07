/**
 * services/notifications/fcm-push.ts
 *
 * All FCM push notification triggers for MJ Maps Systems.
 *
 * Targets:
 *   Customer   — delivery ETA, delivered, failed, safe-place
 *   Dispatcher — failed delivery alert, workload overload
 *   Driver     — silent approach brief (wakes app if WebSocket dropped)
 *
 * Never throws to callers. All functions are fire-and-forget safe.
 */
import { sendFcmMessage, fcmConfigured } from './fcm-client.js';
import { redis } from '../cache/index.js';
import { pool } from '../db/index.js';


// ── Redis dedup keys ─────────────────────────────────────────────────────────


function dedupKey(stopId: string, type: string): string {
  return `fcm:sent:${type}:${stopId}`;
}


async function isAlreadySent(stopId: string, type: string): Promise<boolean> {
  try {
    return (await redis.get(dedupKey(stopId, type))) !== null;
  } catch {
    return false; // fail open
  }
}


async function markSent(stopId: string, type: string): Promise<void> {
  try {
    await redis.setex(dedupKey(stopId, type), 86_400, '1');
  } catch { /* non-fatal */ }
}


// ── Audit helper ─────────────────────────────────────────────────────────────


async function auditFcm(row: {
  stopId?: string;
  driverId?: string;
  targetType: 'customer' | 'dispatcher' | 'driver';
  notificationType: string;
  fcmMessageId?: string;
  status: 'sent' | 'failed' | 'skipped';
  errorMessage?: string;
}): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO fcm_notification_audit
         (stop_id, driver_id, target_type, notification_type, fcm_message_id, status, error_message)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [
        row.stopId ?? null, row.driverId ?? null, row.targetType,
        row.notificationType, row.fcmMessageId ?? null,
        row.status, row.errorMessage ?? null,
      ],
    );
  } catch { /* audit failure must not break the flow */ }
}


// ── Dispatcher FCM token lookup ───────────────────────────────────────────────


async function getDispatcherToken(): Promise<string | null> {
  try {
    const { rows } = await pool.query<{ fcm_token: string | null }>(
      `SELECT fcm_token FROM dispatcher_config ORDER BY id DESC LIMIT 1`,
    );
    return rows[0]?.fcm_token ?? null;
  } catch {
    return null;
  }
}


// ── Customer: ETA push (fires alongside Twilio SMS) ──────────────────────────


/**
 * Push ETA notification to the customer who owns this stop.
 * Deduped per stop — safe to call multiple times.
 */
export async function triggerFcmEtaPush(
  stopId: string,
  etaMinutes: number,
  address: string,
  customerFcmToken: string | null,
): Promise<void> {
  if (!fcmConfigured || !customerFcmToken) return;
  if (await isAlreadySent(stopId, 'eta')) return;

  const result = await sendFcmMessage({
    token: customerFcmToken,
    notification: {
      title: 'Your delivery is on its way 🚚',
      body:  `ETA ~${etaMinutes} min to ${address}`,
    },
    data: {
      type:       'ETA_UPDATE',
      stopId,
      etaMinutes: String(etaMinutes),
      trackUrl:   'https://app.mjmaps.co.uk/track',
    },
    android: { priority: 'HIGH', notification: { channel_id: 'deliveries', sound: 'default' } },
    apns:    { headers: { 'apns-priority': '10' }, payload: { aps: { sound: 'default' } } },
  });

  if (result.ok) {
    await markSent(stopId, 'eta');
    await auditFcm({ stopId, targetType: 'customer', notificationType: 'ETA_UPDATE',
      fcmMessageId: result.messageId, status: 'sent' });
  } else {
    await auditFcm({ stopId, targetType: 'customer', notificationType: 'ETA_UPDATE',
      status: 'failed', errorMessage: result.error });
  }
}


// ── Customer: Delivered push ─────────────────────────────────────────────────


export async function triggerFcmDeliveredPush(
  stopId: string,
  address: string,
  proofUrl: string | null,
  customerFcmToken: string | null,
): Promise<void> {
  if (!fcmConfigured || !customerFcmToken) return;
  if (await isAlreadySent(stopId, 'delivered')) return;

  const result = await sendFcmMessage({
    token: customerFcmToken,
    notification: {
      title: 'Delivered! ✅',
      body:  `Your parcel has been delivered to ${address}`,
    },
    data: {
      type:     'DELIVERED',
      stopId,
      proofUrl: proofUrl ?? '',
    },
    android: { priority: 'HIGH', notification: { channel_id: 'deliveries', sound: 'default' } },
    apns:    { headers: { 'apns-priority': '10' }, payload: { aps: { sound: 'default' } } },
  });

  if (result.ok) {
    await markSent(stopId, 'delivered');
    await pool.query(
      `UPDATE stops SET fcm_notified_delivered = TRUE WHERE id = $1`,
      [stopId],
    ).catch(() => {});
    await auditFcm({ stopId, targetType: 'customer', notificationType: 'DELIVERED',
      fcmMessageId: result.messageId, status: 'sent' });
  } else {
    await auditFcm({ stopId, targetType: 'customer', notificationType: 'DELIVERED',
      status: 'failed', errorMessage: result.error });
  }
}


// ── Customer: Failed / Safe-place push ───────────────────────────────────────


export type FailureCode = 'NO_ANSWER' | 'ACCESS_DENIED' | 'SAFE_PLACE' | 'NEIGHBOUR' | string;


/**
 * Push failed/safe-place notification to the customer.
 */
export async function triggerFcmFailedPush(
  stopId: string,
  address: string,
  failureCode: FailureCode,
  accessNotes: string | null,
  customerFcmToken: string | null,
): Promise<void> {
  if (!fcmConfigured || !customerFcmToken) return;
  if (await isAlreadySent(stopId, 'failed')) return;

  const isSafeOrNeighbour =
    failureCode === 'SAFE_PLACE' || failureCode === 'NEIGHBOUR';

  const title = isSafeOrNeighbour ? 'Parcel left safely ✅' : 'Delivery attempt failed 📦';
  const body  = isSafeOrNeighbour
    ? `Left in safe place at ${address}. ${accessNotes ?? ''}`
    : `We couldn't deliver to ${address}. A card has been left.`;

  const result = await sendFcmMessage({
    token: customerFcmToken,
    notification: { title, body },
    data: {
      type:        isSafeOrNeighbour ? 'SAFE_PLACE' : 'FAILED',
      stopId,
      failureCode,
      accessNotes: accessNotes ?? '',
    },
    android: { priority: 'HIGH', notification: { channel_id: 'deliveries', sound: 'default' } },
    apns:    { headers: { 'apns-priority': '10' }, payload: { aps: { sound: 'default' } } },
  });

  if (result.ok) {
    await markSent(stopId, 'failed');
    await pool.query(
      `UPDATE stops SET fcm_notified_failed = TRUE WHERE id = $1`,
      [stopId],
    ).catch(() => {});
    await auditFcm({ stopId, targetType: 'customer', notificationType: failureCode,
      fcmMessageId: result.messageId, status: 'sent' });
  } else {
    await auditFcm({ stopId, targetType: 'customer', notificationType: failureCode,
      status: 'failed', errorMessage: result.error });
  }
}


// ── Dispatcher: Failed delivery alert ───────────────────────────────────────


export async function triggerFcmDispatcherFailedAlert(
  stopId: string,
  routeId: string,
  driverName: string,
  stopRef: string,
  failureCode: FailureCode,
): Promise<void> {
  if (!fcmConfigured) return;
  const dispatcherToken = await getDispatcherToken();
  if (!dispatcherToken) return;

  const result = await sendFcmMessage({
    token: dispatcherToken,
    notification: {
      title: 'Failed delivery — action needed',
      body:  `${driverName}: stop ${stopRef} failed (${failureCode})`,
    },
    data: {
      type:        'FAILED_DELIVERY',
      stopId,
      routeId,
      failureCode,
      driverName,
      stopRef,
    },
    android: { priority: 'HIGH', notification: { channel_id: 'ops_alerts', sound: 'default' } },
    apns:    { headers: { 'apns-priority': '10' }, payload: { aps: { sound: 'default' } } },
  });

  await auditFcm({
    stopId, targetType: 'dispatcher', notificationType: 'FAILED_DELIVERY',
    fcmMessageId: result.messageId, status: result.ok ? 'sent' : 'failed',
    errorMessage: result.error,
  });
}


// ── Dispatcher: Workload overload alert ──────────────────────────────────────


export async function triggerFcmWorkloadAlert(
  routeId: string,
  driverName: string,
  totalStops: number,
  totalWuc: number,
  safeStopCount: number,
): Promise<void> {
  if (!fcmConfigured) return;
  const dispatcherToken = await getDispatcherToken();
  if (!dispatcherToken) return;

  const result = await sendFcmMessage({
    token: dispatcherToken,
    notification: {
      title: '⚠️ Route overloaded',
      body:  `${driverName} — ${totalStops} stops exceeds safe limit (${totalWuc.toFixed(0)} WUC)`,
    },
    data: {
      type:          'WORKLOAD_ALERT',
      routeId,
      severity:      'overload',
      totalWuc:      String(totalWuc),
      totalStops:    String(totalStops),
      safeStopCount: String(safeStopCount),
    },
    android: { priority: 'HIGH', notification: { channel_id: 'ops_alerts', sound: 'default' } },
    apns:    { headers: { 'apns-priority': '10' }, payload: { aps: { sound: 'default' } } },
  });

  await auditFcm({
    targetType: 'dispatcher', notificationType: 'WORKLOAD_ALERT',
    fcmMessageId: result.messageId, status: result.ok ? 'sent' : 'failed',
    errorMessage: result.error,
  });
}


// ── Driver app: Silent approach brief (WebSocket fallback) ───────────────────


/**
 * Silent push to the driver's app to wake it up and display the approach brief.
 * Only fired when the WebSocket APPROACH_BRIEF was already sent via socket —
 * this is a backup for when the app is backgrounded and WS is dormant.
 * Uses data-only (no notification block) so it's truly silent.
 */
export async function triggerFcmApproachBriefSilent(
  driverId: string,
  stopId: string,
  accessNotes: string,
  driverFcmToken: string | null,
): Promise<void> {
  if (!fcmConfigured || !driverFcmToken) return;
  if (await isAlreadySent(stopId, 'approach_brief_fcm')) return;

  const result = await sendFcmMessage({
    token: driverFcmToken,
    // No notification block = silent push
    data: {
      type:        'APPROACH_BRIEF',
      stopId,
      accessNotes,
      driverId,
    },
    android: { priority: 'HIGH' }, // HIGH required for silent push to wake app
    apns:    { headers: { 'apns-priority': '5', 'apns-push-type': 'background' },
               payload: { aps: { 'content-available': 1 } } },
  });

  if (result.ok) {
    await markSent(stopId, 'approach_brief_fcm');
    await auditFcm({ stopId, driverId, targetType: 'driver',
      notificationType: 'APPROACH_BRIEF', fcmMessageId: result.messageId, status: 'sent' });
  }
}