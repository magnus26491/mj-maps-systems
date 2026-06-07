/**
 * services/db/eta-store.ts
 * DB helpers for ETA notification system.
 * All operations use the shared pool from ./index.ts.
 */
import { pool } from './index.js';


export interface StopContext {
  stopId: string;
  routeId: string;
  address: string;
  customerPhone: string | null;
  customerName: string | null;
  customerEmail: string | null;
  scheduledArrivalEpoch: number | null;
  notificationSent: boolean;
  vehicleId: string | null;
  fcmCustomerToken: string | null; // added for FCM push alongside SMS
}


export interface EtaNotificationRow {
  id: string;
  stop_id: string;
  phone: string;
  message: string;
  twilio_sid: string | null;
  status: string;
  sent_at: Date;
  error_message: string | null;
}


/**
 * Fetch stops that are due for ETA notification.
 * Trigger conditions (either/or):
 *   1. First pending stop in the route (driver is heading there now)
 *   2. Scheduled arrival within 15 minutes
 *
 * Ignores stops that already have notification_sent = true.
 */
export async function getNextPendingStops(routeId: string): Promise<StopContext[]> {
  const { rows } = await pool.query<{
    id: string;
    route_id: string;
    address: string;
    customer_phone: string | null;
    customer_name: string | null;
    customer_email: string | null;
    scheduled_arrival_epoch: number | null;
    notification_sent: boolean;
    vehicle_id: string | null;
    fcm_customer_token: string | null;
  }>(
    `SELECT id, route_id, address,
            customer_phone, customer_name, customer_email,
            scheduled_arrival_epoch,
            notification_sent,
            vehicle_id,
            fcm_customer_token
     FROM stops
     WHERE route_id = $1
       AND notification_sent = FALSE
       AND customer_phone IS NOT NULL
       AND customer_phone != ''
     ORDER BY sequence_order ASC NULLS LAST, scheduled_arrival_epoch ASC NULLS LAST
     LIMIT 10`,
    [routeId],
  );

  return rows.map(r => ({
    stopId:                r.id,
    routeId:               r.route_id,
    address:               r.address,
    customerPhone:         r.customer_phone,
    customerName:          r.customer_name,
    customerEmail:         r.customer_email,
    scheduledArrivalEpoch: r.scheduled_arrival_epoch,
    notificationSent:      r.notification_sent,
    vehicleId:             r.vehicle_id,
    fcmCustomerToken:      r.fcm_customer_token,
  }));
}


/**
 * Mark notification as sent in the stops table.
 * Called after Twilio API call completes (not fire-and-forget).
 */
export async function markStopNotified(stopId: string): Promise<void> {
  await pool.query(
    `UPDATE stops
     SET notification_sent    = TRUE,
         notification_sent_at = NOW()
     WHERE id = $1`,
    [stopId],
  );
}


/**
 * Insert an audit row for each outbound SMS.
 * Called after Twilio API call — logs the SID and status.
 */
export async function insertEtaNotificationAudit(params: {
  stopId: string;
  phone: string;
  message: string;
  twilioSid?: string;
  status: string;
  errorMessage?: string;
}): Promise<void> {
  await pool.query(
    `INSERT INTO eta_notifications
       (stop_id, phone, message, twilio_sid, status, error_message)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      params.stopId,
      params.phone,
      params.message,
      params.twilioSid ?? null,
      params.status,
      params.errorMessage ?? null,
    ],
  );
}


/**
 * Load the full stop context for a given stopId.
 * Used to build the SMS message with real ETA.
 */
export async function getStopContext(stopId: string): Promise<StopContext | null> {
  const { rows } = await pool.query<{
    id: string;
    route_id: string;
    address: string;
    customer_phone: string | null;
    customer_name: string | null;
    customer_email: string | null;
    scheduled_arrival_epoch: number | null;
    notification_sent: boolean;
    vehicle_id: string | null;
    fcm_customer_token: string | null;
  }>(
    `SELECT id, route_id, address,
            customer_phone, customer_name, customer_email,
            scheduled_arrival_epoch,
            notification_sent,
            vehicle_id,
            fcm_customer_token
     FROM stops WHERE id = $1 LIMIT 1`,
    [stopId],
  );

  if (!rows[0]) return null;
  const r = rows[0];
  return {
    stopId:                r.id,
    routeId:               r.route_id,
    address:               r.address,
    customerPhone:         r.customer_phone,
    customerName:          r.customer_name,
    customerEmail:         r.customer_email,
    scheduledArrivalEpoch: r.scheduled_arrival_epoch,
    notificationSent:      r.notification_sent,
    vehicleId:             r.vehicle_id,
    fcmCustomerToken:      r.fcm_customer_token,
  };
}