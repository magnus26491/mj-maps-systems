/**
 * MJ Maps Systems — API Server
 * Mounts all route handlers and starts Express.
 */

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { planRouter } from './routes/plan';
import { turnCheckRouter } from './routes/turn-check';
import { replanRouter } from './routes/replan';
import { stopPinRouter } from './routes/stop-pin';
import { stopFeedbackRouter } from './routes/stop-feedback';
import { pingCache } from '../services/cache';
import { pool } from '../services/db';

const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '2mb' }));

// ── Health ─────────────────────────────────────────────────────────────────────
app.get('/health', async (_req, res) => {
  const [redisOk, dbOk] = await Promise.all([
    pingCache(),
    pool.query('SELECT 1').then(() => true).catch(() => false),
  ]);
  res.json({
    status: redisOk && dbOk ? 'ok' : 'degraded',
    redis: redisOk ? 'ok' : 'error',
    db: dbOk ? 'ok' : 'error',
    ts: new Date().toISOString(),
  });
});

// ── Routes ─────────────────────────────────────────────────────────────────────
app.use('/api/plan',          planRouter);
app.use('/api/turn-check',    turnCheckRouter);
app.use('/api/replan',        replanRouter);
app.use('/api/stop-pin',      stopPinRouter);
app.use('/api/stop-feedback', stopFeedbackRouter);

const PORT = process.env.PORT ?? 3100;
app.listen(PORT, () => {
  console.log(`[mj-maps-systems] API listening on port ${PORT}`);
});

export default app;
