/**
 * MJ Maps Systems — Telegram Alert Service
 *
 * Layer 3 — Platform Health only.
 * Sends alerts ONLY to TELEGRAM_OWNER_CHAT_ID (platform owner).
 *
 * Covered events:
 *   - Server crashes / uncaught exceptions
 *   - Database unreachable
 *   - Redis down
 *   - Stripe webhook failures
 *   - Safety events (driver-initiated)
 *
 * All operational route events (turn warnings, stop updates, dispatcher
 * messages, ETA alerts) are delivered via WebSocket (Layer 1) directly
 * into the driver's HUD — never via Telegram.
 */

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

// ─── PLATFORM HEALTH ─────────────────────────────────────────────────────────

export interface PlatformHealthPayload {
  level: 'INFO' | 'WARN' | 'CRITICAL';
  service: 'api' | 'database' | 'redis' | 'stripe' | 'geocoding' | 'websocket';
  message: string;
  /** epoch ms, defaults to Date.now() */
  timestamp?: number;
}

/**
 * Fire a platform health alert to the platform owner.
 * Used for: uncaught exceptions, DB failures, Redis down, Stripe webhook failures.
 * Fire-and-forget safe — callers should .catch(() => {}) this.
 */
export async function sendPlatformAlert(payload: PlatformHealthPayload): Promise<void> {
  const botToken    = process.env.TELEGRAM_BOT_TOKEN ?? '';
  const ownerChatId = process.env.TELEGRAM_OWNER_CHAT_ID ?? '';
  if (!botToken || !ownerChatId) return;

  const icon = payload.level === 'CRITICAL' ? '\uD83D\uDD98'
    : payload.level === 'WARN' ? '\u26A0\uFE0F'
    : '\u2139\uFE0F';
  const ts   = new Date(payload.timestamp ?? Date.now()).toISOString();
  const text = `${icon} [${payload.level}] ${payload.service.toUpperCase()}\n${payload.message}\n<i>${ts}</i>`;

  await sendTelegramMessage(botToken, ownerChatId, text, true);
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
 * Fires a Telegram message to the platform owner when a route exceeds safe workload.
 * totalWuc >= 180 (OVERLOAD threshold) triggers this.
 * Non-fatal — callers must .catch() this.
 */
export async function sendWorkloadOverloadAlert(payload: WorkloadAlertPayload): Promise<void> {
  const botToken    = process.env.TELEGRAM_BOT_TOKEN ?? '';
  const ownerChatId = process.env.TELEGRAM_OWNER_CHAT_ID ?? '';
  if (!botToken || !ownerChatId) return;

  const recs = payload.recommendations.map(r => `\u2022 ${r}`).join('\n');
  const message =
    `\uD83D\uDD34 OVERLOAD ALERT \u2014 Route exceeds safe workload\n\n` +
    `Route ID: ${payload.routeId}\n` +
    `Vehicle: ${payload.vehicleId}\n` +
    `Total WUC: ${payload.totalWuc.toFixed(0)} / 180 max\n` +
    `Stops: ${payload.totalStops} total, ${payload.safeStopCount} safe\n\n` +
    `Action required: reduce route or reassign stops.\n\n` +
    (recs ? `Recommendations:\n${recs}` : '');

  await sendTelegramMessage(botToken, ownerChatId, message);
}

// ─── SAFETY EVENT ALERT ──────────────────────────────────────────────────────

export interface SafetyAlertPayload {
  driverId: string | null;
  type: string;
  severity: string;
  note: string;
  lat?: number;
  lng?: number;
  routeId?: string;
  stopId?: string;
}

/**
 * Fires a safety event alert to the platform owner.
 * Covers: emergency button, near-miss, accident report.
 * Non-fatal — callers must .catch() this.
 */
export async function sendSafetyAlert(payload: SafetyAlertPayload): Promise<void> {
  const botToken    = process.env.TELEGRAM_BOT_TOKEN ?? '';
  const ownerChatId = process.env.TELEGRAM_OWNER_CHAT_ID ?? '';
  if (!botToken || !ownerChatId) return;

  const icon = payload.severity === 'CRITICAL' || payload.type === 'EMERGENCY' ? '\uD83D\uDD98'
    : payload.severity === 'HIGH' ? '\u26A0\uFE0F'
    : '\u2139\uFE0F';

  const locationStr = payload.lat != null && payload.lng != null
    ? `\nLocation: ${payload.lat.toFixed(5)}, ${payload.lng.toFixed(5)}`
    : '';

  const message =
    `${icon} SAFETY EVENT \u2014 ${payload.type}\n\n` +
    `Severity: ${payload.severity}\n` +
    `Driver: ${payload.driverId ?? 'unknown'}` +
    locationStr +
    (payload.note ? `\nNote: ${payload.note}` : '') +
    (payload.routeId ? `\nRoute: ${payload.routeId}` : '');

  await sendTelegramMessage(botToken, ownerChatId, message);
}
