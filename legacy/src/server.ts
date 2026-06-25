/**
 * MJ Maps Systems — Server Bootstrap
 *
 * Wires together:
 *  - Express REST API
 *  - WebSocket server (ws library)
 *  - Redis client (ioredis)
 *  - MJMapsCache
 *  - Environment validation
 *  - Graceful shutdown
 */

import express from 'express';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import Redis from 'ioredis';
import {
  handleOptimiseRoute,
  handleRouteIntelligence,
  handleManualReplan,
  handleDriverEvent,
  handleHealth,
  handleDriverWebSocket,
  apiErrorHandler,
} from '../services/api/driver-api';
import { MJMapsCache } from '../services/cache/redis-cache';
import { checkOverpassHealth } from '../services/osm/overpass-client';

// ─── ENV ──────────────────────────────────────────────────────────────────────

function requireEnv(key: string): string {
  const val = process.env[key];
  if (!val) throw new Error(`Missing required env var: ${key}`);
  return val;
}

const PORT            = parseInt(process.env.PORT ?? '3000', 10);
const REDIS_URL       = process.env.REDIS_URL ?? 'redis://localhost:6379';
const NODE_ENV        = process.env.NODE_ENV ?? 'development';
const TELEGRAM_TOKEN  = process.env.TELEGRAM_BOT_TOKEN ?? '';
const LOG_LEVEL       = process.env.LOG_LEVEL ?? 'info';

console.log(`[boot] MJ Maps Systems | env=${NODE_ENV} | port=${PORT}`);

// ─── REDIS ────────────────────────────────────────────────────────────────────

const redis = new Redis(REDIS_URL, {
  maxRetriesPerRequest: 3,
  enableReadyCheck: true,
  lazyConnect: true,
});

redis.on('connect',   () => console.log('[redis] Connected'));
redis.on('error',     (e) => console.error('[redis] Error:', e.message));
redis.on('reconnecting', () => console.warn('[redis] Reconnecting...'));

export const cache = new MJMapsCache(redis as any, 'mjmaps:');

// ─── EXPRESS ──────────────────────────────────────────────────────────────────

const app = express();

app.use(express.json({ limit: '2mb' }));

// Security headers
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  next();
});

// Request logging (minimal)
if (LOG_LEVEL === 'debug') {
  app.use((req, _res, next) => {
    console.debug(`[http] ${req.method} ${req.path}`);
    next();
  });
}

// ─── ROUTES ───────────────────────────────────────────────────────────────────

app.get('/api/v1/health',                    handleHealth);
app.post('/api/v1/routes/optimise',          handleOptimiseRoute);
app.get('/api/v1/routes/:routeId/intel',     handleRouteIntelligence);
app.post('/api/v1/routes/:routeId/replan',   handleManualReplan);
app.post('/api/v1/driver/event',             handleDriverEvent);

// Overpass health proxy (useful for ops dashboard)
app.get('/api/v1/health/overpass', async (_req, res) => {
  const status = await checkOverpassHealth();
  res.json({ ok: true, overpass: status });
});

app.use(apiErrorHandler);

// ─── HTTP + WS SERVER ─────────────────────────────────────────────────────────

const httpServer = createServer(app);

const wss = new WebSocketServer({ server: httpServer, path: '/ws/driver' });

wss.on('connection', (socket, req) => {
  // URL pattern: /ws/driver/:driverId/:routeId
  const parts = (req.url ?? '').split('/').filter(Boolean);
  // parts: ['ws', 'driver', driverId, routeId]
  const driverId = parts[2] ?? 'unknown';
  const routeId  = parts[3] ?? 'unknown';

  console.log(`[ws] Driver ${driverId} connected to route ${routeId}`);

  handleDriverWebSocket(
    { send: (d) => socket.send(d), on: (e, cb) => socket.on(e, cb) },
    driverId,
    routeId,
  );
});

wss.on('error', (err) => console.error('[ws] Server error:', err.message));

// ─── STARTUP ──────────────────────────────────────────────────────────────────

async function start() {
  // Connect Redis (non-blocking — app still starts if Redis is down)
  try {
    await redis.connect();
    const pong = await cache.ping();
    console.log(`[redis] Ping: ${pong ? 'PONG' : 'FAILED'}`);
  } catch (err) {
    console.warn('[redis] Could not connect at startup — cache will degrade gracefully.');
  }

  httpServer.listen(PORT, () => {
    console.log(`[http] Listening on port ${PORT}`);
    console.log(`[ws]   WebSocket on ws://0.0.0.0:${PORT}/ws/driver/:driverId/:routeId`);
  });
}

// ─── GRACEFUL SHUTDOWN ────────────────────────────────────────────────────────

let shuttingDown = false;

async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[boot] ${signal} received — shutting down gracefully...`);

  httpServer.close(() => console.log('[http] Server closed'));
  wss.close(() => console.log('[ws] WebSocket server closed'));

  try {
    await redis.quit();
    console.log('[redis] Connection closed');
  } catch {}

  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));

start().catch((err) => {
  console.error('[boot] Fatal startup error:', err);
  process.exit(1);
});
