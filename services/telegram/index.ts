/**
 * Telegram Alert Service
 * ----------------------
 * Sends driver and dispatcher alerts via Telegram Bot API.
 *
 * Alert types:
 *   - RED turn warning (sent to driver 500m before stop)
 *   - AMBER turn caution (sent to driver 300m before stop)
 *   - Failed stop notification (sent to dispatcher)
 *   - Shift completion summary (sent to driver + dispatcher)
 *   - New stop added mid-route (sent to driver)
 */

import axios from 'axios';

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN ?? '';
const DISPATCHER_CHAT_ID = process.env.TELEGRAM_DISPATCHER_CHAT_ID ?? '';

const TG_API = `https://api.telegram.org/bot${BOT_TOKEN}`;

async function sendMessage(chatId: string | number, text: string, parseMode: 'HTML' | 'Markdown' = 'HTML'): Promise<void> {
  if (!BOT_TOKEN || !chatId) return;
  try {
    await axios.post(`${TG_API}/sendMessage`, {
      chat_id: chatId,
      text,
      parse_mode: parseMode,
      disable_web_page_preview: true,
    }, { timeout: 8_000 });
  } catch (err) {
    console.error('[telegram] Failed to send message:', err instanceof Error ? err.message : err);
  }
}

// ── New stop added ─────────────────────────────────────────────────────────────

export async function alertNewStopAdded(opts: {
  driverChatId: string | number;
  stopAddress: string;
  newSequence: number;
  eta: Date;
}): Promise<void> {
  const msg = [
    `📦 <b>New stop added to your route</b>`,
    ``,
    `📍 ${opts.stopAddress}`,
    `🔢 Position #${opts.newSequence + 1} in updated route`,
    `🕐 ETA: ${opts.eta.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`,
  ].join('\n');
  await sendMessage(opts.driverChatId, msg);
}

// ── Failed stop ────────────────────────────────────────────────────────────────

export async function alertFailedStop(opts: {
  driverChatId?: string | number;
  stopAddress: string;
  reason: string;
  remainingStops: number;
}): Promise<void> {
  const msg = [
    `❌ <b>Stop failed</b>`,
    ``,
    `📍 ${opts.stopAddress}`,
    `💬 Reason: ${opts.reason}`,
    `📦 Remaining stops: ${opts.remainingStops}`,
  ].join('\n');

  if (opts.driverChatId) await sendMessage(opts.driverChatId, msg);
  if (DISPATCHER_CHAT_ID) await sendMessage(DISPATCHER_CHAT_ID, msg);
}

// ── Shift summary ─────────────────────────────────────────────────────────────

export async function sendShiftSummary(opts: {
  driverChatId: string | number;
  driverName: string;
  totalStops: number;
  completedStops: number;
  failedStops: number;
  totalDistanceKm: number;
  shiftStart: Date;
  shiftEnd: Date;
}): Promise<void> {
  const durationMs = opts.shiftEnd.getTime() - opts.shiftStart.getTime();
  const hours = Math.floor(durationMs / 3_600_000);
  const mins = Math.floor((durationMs % 3_600_000) / 60_000);
  const successRate = opts.totalStops > 0
    ? ((opts.completedStops / opts.totalStops) * 100).toFixed(1)
    : '0';

  const msg = [
    `✅ <b>Shift Complete — ${opts.driverName}</b>`,
    ``,
    `📦 Stops: <b>${opts.completedStops}/${opts.totalStops}</b> (${successRate}% success)`,
    `❌ Failed: ${opts.failedStops}`,
    `🛣️ Distance: <b>${opts.totalDistanceKm.toFixed(1)} km</b>`,
    `⏱️ Duration: <b>${hours}h ${mins}m</b>`,
    ``,
    `🏁 Completed at ${opts.shiftEnd.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`,
  ].join('\n');

  await sendMessage(opts.driverChatId, msg);
  if (DISPATCHER_CHAT_ID) await sendMessage(DISPATCHER_CHAT_ID, msg);
}

// ── Dispatcher-only alerts ────────────────────────────────────────────────────

export async function alertDispatcherRouteStarted(opts: {
  driverName: string;
  totalStops: number;
  vehicleLabel: string;
  estimatedCompletion: Date;
}): Promise<void> {
  if (!DISPATCHER_CHAT_ID) return;
  const msg = [
    `🚀 <b>Route started</b>`,
    `👤 Driver: ${opts.driverName}`,
    `🚛 Vehicle: ${opts.vehicleLabel}`,
    `📦 Stops: ${opts.totalStops}`,
    `🏁 ETA complete: ${opts.estimatedCompletion.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`,
  ].join('\n');
  await sendMessage(DISPATCHER_CHAT_ID, msg);
}
