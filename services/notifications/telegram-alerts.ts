/**
 * MJ Maps Systems — Telegram Alert Service
 *
 * Sends real-time alerts to drivers (via private chat) and
 * dispatchers (via group/channel) using the Telegram Bot API.
 *
 * Alert types:
 *  TURN_WARNING      — RED/AMBER turn-around alert ahead of stop
 *  STOP_FAILED       — driver marked stop as failed
 *  ROUTE_DELAYED     — completion time has slipped > 30 min
 *  OFF_ROUTE         — driver has deviated and route is being recalculated
 *  VEHICLE_MISMATCH  — vehicle too large for road approaching next stop
 *  SHIFT_AT_RISK     — route will exceed shift end by > 60 min
 *  STOP_INSERTED     — dispatcher added a stop mid-route
 *  REPLAN_COMPLETE   — new optimised route is ready
 */

// ─── CONFIG ──────────────────────────────────────────────────────────────────

export interface TelegramConfig {
  botToken: string;
  /** Driver chat IDs keyed by driverId */
  driverChatIds: Record<string, string>;
  /** Dispatcher group/channel chat ID */
  dispatcherChatId: string;
  /** Whether to send HTML-formatted messages (default: true) */
  useHtml?: boolean;
}

export type AlertType =
  | 'TURN_WARNING'
  | 'STOP_FAILED'
  | 'ROUTE_DELAYED'
  | 'OFF_ROUTE'
  | 'VEHICLE_MISMATCH'
  | 'SHIFT_AT_RISK'
  | 'STOP_INSERTED'
  | 'REPLAN_COMPLETE';

export interface AlertPayload {
  type: AlertType;
  driverId: string;
  routeId: string;
  stopId?: string;
  stopAddress?: string;
  vehicleId?: string;
  delayMinutes?: number;
  remainingStops?: number;
  totalDistanceKm?: number;
  message?: string;
  turnAlertLevel?: 'RED' | 'AMBER';
  newStopAddress?: string;
}

// ─── MESSAGE TEMPLATES ───────────────────────────────────────────────────────

function formatEpoch(epoch: number): string {
  return new Date(epoch * 1000).toLocaleTimeString('en-GB', {
    hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London',
  });
}

function buildMessage(payload: AlertPayload): string {
  const { type: t, driverId, stopId, stopAddress, vehicleId, delayMinutes, remainingStops, totalDistanceKm } = payload;

  switch (t) {
    case 'TURN_WARNING':
      return payload.turnAlertLevel === 'RED'
        ? `🔴 <b>Turn-Around Blocked</b>\nDriver: <code>${driverId}</code>\nStop: <b>${stopAddress ?? stopId}</b>\nVehicle <b>${vehicleId}</b> cannot turn around on this road. Approach from opposite end or park before.`
        : `🟡 <b>Tight Turn Ahead</b>\nDriver: <code>${driverId}</code>\nStop: <b>${stopAddress ?? stopId}</b>\nConsider reversing in with vehicle <b>${vehicleId}</b>.`;

    case 'STOP_FAILED':
      return `❌ <b>Stop Failed</b>\nDriver: <code>${driverId}</code>\nStop: <b>${stopAddress ?? stopId}</b>\n${payload.message ?? 'No reason provided.'}`;

    case 'ROUTE_DELAYED':
      return `⏰ <b>Route Delayed</b>\nDriver: <code>${driverId}</code>\nRunning <b>+${delayMinutes} min</b> behind schedule.\n${remainingStops} stops remaining (${totalDistanceKm}km).`;

    case 'OFF_ROUTE':
      return `📍 <b>Off Route</b>\nDriver: <code>${driverId}</code>\nDeviated from planned route. Recalculating…`;

    case 'VEHICLE_MISMATCH':
      return `⚠️ <b>Vehicle Mismatch</b>\nDriver: <code>${driverId}</code>\nVehicle <b>${vehicleId}</b> has a restriction on the road approaching <b>${stopAddress ?? stopId}</b>. Check before entering.`;

    case 'SHIFT_AT_RISK':
      return `🚨 <b>Shift At Risk</b>\nDriver: <code>${driverId}</code>\nRoute will exceed shift end by <b>${delayMinutes} min</b>. Consider splitting or reassigning ${remainingStops} remaining stops.`;

    case 'STOP_INSERTED':
      return `➕ <b>New Stop Added</b>\nDriver: <code>${driverId}</code>\nNew stop inserted: <b>${payload.newStopAddress ?? stopId}</b>. Route recalculated.`;

    case 'REPLAN_COMPLETE':
      return `✅ <b>Route Updated</b>\nDriver: <code>${driverId}</code>\n${remainingStops} stops · ${totalDistanceKm}km remaining.`;

    default:
      return `ℹ️ <b>Alert</b>\nDriver: <code>${driverId}</code>\n${payload.message ?? ''}`;
  }
}

// ─── SEND HELPERS ────────────────────────────────────────────────────────────

async function sendTelegramMessage(
  botToken: string,
  chatId: string,
  text: string,
  useHtml = true,
): Promise<boolean> {
  try {
    const resp = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: useHtml ? 'HTML' : undefined,
        disable_web_page_preview: true,
      }),
      signal: AbortSignal.timeout(8_000),
    });
    if (!resp.ok) {
      const err = await resp.text();
      console.error(`[telegram] Send failed (${resp.status}): ${err}`);
      return false;
    }
    return true;
  } catch (err) {
    console.error('[telegram] Network error:', err);
    return false;
  }
}

// ─── ALERT ROUTING ───────────────────────────────────────────────────────────

/** Alerts that go to the driver only */
const DRIVER_ONLY_ALERTS: AlertType[] = ['TURN_WARNING', 'VEHICLE_MISMATCH', 'OFF_ROUTE'];

/** Alerts that go to the dispatcher only */
const DISPATCHER_ONLY_ALERTS: AlertType[] = ['STOP_INSERTED'];

/** Alerts that go to both */
const BOTH_ALERTS: AlertType[] = ['STOP_FAILED', 'ROUTE_DELAYED', 'SHIFT_AT_RISK', 'REPLAN_COMPLETE'];

// ─── MAIN EXPORT ─────────────────────────────────────────────────────────────

/**
 * Send an alert to the appropriate recipient(s).
 *
 * @example
 * await sendAlert(config, {
 *   type: 'TURN_WARNING',
 *   driverId: 'driver-7',
 *   routeId: 'route-abc',
 *   stopId: 'stop-42',
 *   stopAddress: 'Flat 3, Mill Lane, Leeds',
 *   vehicleId: 'luton',
 *   turnAlertLevel: 'RED',
 * });
 */
export async function sendAlert(
  config: TelegramConfig,
  payload: AlertPayload,
): Promise<{ driverSent: boolean; dispatcherSent: boolean }> {
  const text = buildMessage(payload);
  const html = config.useHtml ?? true;
  const driverChatId = config.driverChatIds[payload.driverId];

  let driverSent = false;
  let dispatcherSent = false;

  if (DRIVER_ONLY_ALERTS.includes(payload.type)) {
    if (driverChatId) driverSent = await sendTelegramMessage(config.botToken, driverChatId, text, html);
  } else if (DISPATCHER_ONLY_ALERTS.includes(payload.type)) {
    dispatcherSent = await sendTelegramMessage(config.botToken, config.dispatcherChatId, text, html);
  } else {
    // BOTH
    const results = await Promise.all([
      driverChatId ? sendTelegramMessage(config.botToken, driverChatId, text, html) : Promise.resolve(false),
      sendTelegramMessage(config.botToken, config.dispatcherChatId, text, html),
    ]);
    driverSent = results[0];
    dispatcherSent = results[1];
  }

  return { driverSent, dispatcherSent };
}

/**
 * Batch send multiple alerts (e.g. at route start — one per stop with RED turn score).
 */
export async function sendAlertBatch(
  config: TelegramConfig,
  payloads: AlertPayload[],
): Promise<void> {
  // Send sequentially with 200ms gap to avoid Telegram rate limits (30 msg/sec)
  for (const payload of payloads) {
    await sendAlert(config, payload);
    await new Promise(r => setTimeout(r, 200));
  }
}


// ─── WORKLOAD OVERLOAD ALERT ─────────────────────────────────────────────────

export interface WorkloadAlertPayload {
  routeId: string;
  vehicleId: string;
  totalWuc: number;
  totalStops: number;
  safeStopCount: number;
  recommendations: string[];
}


/**
 * Fires a Telegram message to the dispatcher when a route exceeds safe workload.
 * Only called when totalWuc >= 180 (OVERLOAD threshold).
 * Non-fatal — callers must .catch() this.
 */
export async function sendWorkloadOverloadAlert(payload: WorkloadAlertPayload): Promise<void> {
  // Reuse the global config from sendAlert if available, otherwise use TELEGRAM_BOT_TOKEN env
  const botToken = process.env.TELEGRAM_BOT_TOKEN ?? '';
  const dispatcherChatId = process.env.TELEGRAM_DISPATCHER_CHAT_ID ?? '';
  if (!botToken || !dispatcherChatId) return;

  const recs = payload.recommendations.map(r => `• ${r}`).join('\n');
  const message =
    `🔴 OVERLOAD ALERT — Route exceeds safe workload\n\n` +
    `Route ID: ${payload.routeId}\n` +
    `Vehicle: ${payload.vehicleId}\n` +
    `Total WUC: ${payload.totalWuc.toFixed(0)} / 180 max\n` +
    `Stops: ${payload.totalStops} total, ${payload.safeStopCount} safe\n\n` +
    `Action required: reduce route or reassign stops.\n\n` +
    (recs ? `Recommendations:\n${recs}` : '');

  await sendTelegramMessage(botToken, dispatcherChatId, message);

  // Also fire FCM push to dispatcher — fire-and-forget
  const { triggerFcmWorkloadAlert } = await import('./fcm-push.js');
  triggerFcmWorkloadAlert(
    payload.routeId,
    payload.vehicleId,    // used as driverName fallback
    payload.totalStops,
    payload.totalWuc,
    payload.safeStopCount,
  ).catch(() => {});
}
