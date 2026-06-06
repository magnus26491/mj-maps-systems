// ─────────────────────────────────────────────────────────────────────────────
// Notifications Service
// Sends real-time driver alerts via Telegram and push notifications.
// Used by route-engine to broadcast turn alerts, traffic warnings,
// ETA updates, and failed-stop notifications.
// ─────────────────────────────────────────────────────────────────────────────
import Fastify from 'fastify';

const app = Fastify({ logger: true });

const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const DEFAULT_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

export type AlertType =
  | 'TURN_RED'
  | 'TURN_AMBER'
  | 'ROUTE_RECALCULATED'
  | 'STOP_FAILED'
  | 'STOP_COMPLETED'
  | 'ETA_UPDATE'
  | 'SHIFT_COMPLETE'
  | 'VEHICLE_MISMATCH';

export interface DriverAlert {
  type: AlertType;
  driverName?: string;
  chatId?: string;
  stopLabel?: string;
  message: string;
  urgency: 'low' | 'medium' | 'high' | 'critical';
}

const URGENCY_EMOJI: Record<DriverAlert['urgency'], string> = {
  low: 'ℹ️',
  medium: '⚠️',
  high: '🔶',
  critical: '🚨',
};

const ALERT_TYPE_EMOJI: Record<AlertType, string> = {
  TURN_RED: '⛔',
  TURN_AMBER: '⚠️',
  ROUTE_RECALCULATED: '🔄',
  STOP_FAILED: '❌',
  STOP_COMPLETED: '✅',
  ETA_UPDATE: '⏱',
  SHIFT_COMPLETE: '🏁',
  VEHICLE_MISMATCH: '🚛',
};

async function sendTelegram(chatId: string, text: string): Promise<void> {
  if (!TELEGRAM_TOKEN) {
    console.warn('[notifications] TELEGRAM_BOT_TOKEN not set — skipping Telegram send');
    return;
  }
  const url = `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`;
  await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: 'MarkdownV2',
    }),
    signal: AbortSignal.timeout(8_000),
  });
}

function formatAlert(alert: DriverAlert): string {
  const urgencyEmoji = URGENCY_EMOJI[alert.urgency];
  const typeEmoji = ALERT_TYPE_EMOJI[alert.type];
  const driver = alert.driverName ? `*${escapeMarkdown(alert.driverName)}* — ` : '';
  const stop = alert.stopLabel ? `\n📍 Stop: _${escapeMarkdown(alert.stopLabel)}_` : '';
  return `${urgencyEmoji} ${typeEmoji} ${driver}${escapeMarkdown(alert.message)}${stop}`;
}

function escapeMarkdown(text: string): string {
  return text.replace(/[_*[\]()~`>#+\-=|{}.!]/g, (c) => `\\${c}`);
}

// ── Endpoints ────────────────────────────────────────────────────────────────

app.post<{ Body: DriverAlert }>('/notify/driver', async (req, reply) => {
  const alert = req.body;
  const chatId = alert.chatId ?? DEFAULT_CHAT_ID;
  if (!chatId) {
    return reply.status(400).send({ error: 'No chatId provided and TELEGRAM_CHAT_ID not set' });
  }
  const text = formatAlert(alert);
  await sendTelegram(chatId, text);
  return reply.send({ ok: true, chatId, text });
});

/** Batch send to multiple drivers */
app.post<{ Body: { alerts: DriverAlert[] } }>('/notify/batch', async (req, reply) => {
  const results = await Promise.allSettled(
    req.body.alerts.map(async (alert) => {
      const chatId = alert.chatId ?? DEFAULT_CHAT_ID ?? '';
      if (!chatId) return { ok: false, reason: 'no chatId' };
      await sendTelegram(chatId, formatAlert(alert));
      return { ok: true, chatId };
    }),
  );
  return reply.send(results);
});

app.get('/health', async () => ({ status: 'ok', service: 'notifications' }));

const PORT = Number(process.env.PORT ?? 3008);
app.listen({ port: PORT, host: '0.0.0.0' });
