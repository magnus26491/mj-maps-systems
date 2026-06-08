/**
 * MJ Maps Systems — API Server
 * All routes mounted. Protected routes require authenticateDriver middleware.
 */

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';

import { authRouter } from './routes/auth';
import { authRegisterRouter } from './routes/auth-register';
import { planRouter } from './routes/plan';
import { turnCheckRouter } from './routes/turn-check';
import { replanRouter } from './routes/replan';
import { stopPinRouter } from './routes/stop-pin';
import { stopFeedbackRouter } from './routes/stop-feedback';
import { dispatcherRouter } from './routes/dispatcher';
import { pinsRouter } from './routes/pins';
import { optimiseRouter } from './routes/optimise';
import { pafRouter } from './routes/paf';
import { billingRouter } from './routes/billing';
import { pinConfirmRouter } from './routes/pin-confirm';
import { vehicleSpecsRouter } from './routes/vehicle-specs';

import { authenticateDriver } from './middleware/authenticate';
import { requireRole } from './middleware/requireRole';
import { pingCache } from '../services/cache';
import { pool } from '../services/db';

const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '2mb' }));

// ── Rate limiting ─────────────────────────────────────────────────────────────

// Tight limit on auth endpoints to prevent brute force
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20,
  message: { success: false, error: 'Too many requests. Try again in 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// General API limit
const apiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/api/auth', authLimiter);
app.use('/api', apiLimiter);

// ── Health (public) ─────────────────────────────────────────────────────────────
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

// ── Public routes ───────────────────────────────────────────────────────────────
app.use('/api/auth',       authRouter);        // login, refresh, logout — no auth required
app.use('/api/v1/auth',    authRegisterRouter); // register — no auth required
app.use('/api/v1/pins',    pinsRouter);        // GET /lookup is public; POST /confirm requires auth via router
app.use('/api/v1/billing', billingRouter);     // webhook is public; checkout+status are auth-gated inside

// ── Protected routes (all require valid JWT) ─────────────────────────────────
app.use('/api/plan',          authenticateDriver, planRouter);
app.use('/api/turn-check',    authenticateDriver, turnCheckRouter);
app.use('/api/replan',        authenticateDriver, replanRouter);
app.use('/api/stop-pin',      authenticateDriver, stopPinRouter);
app.use('/api/stop-feedback', authenticateDriver, stopFeedbackRouter);

// Dispatcher + admin only
app.use('/api/dispatcher',    authenticateDriver, requireRole('dispatcher'), dispatcherRouter);

// Optimise and PAF routes (v1)
app.use('/api/v1/optimise',   authenticateDriver, optimiseRouter);
app.use('/api/v1/paf',        authenticateDriver, pafRouter);
app.use('/api/v1/stops',      authenticateDriver, pinConfirmRouter);
app.use('/api/v1/vehicle-specs', authenticateDriver, vehicleSpecsRouter);

// ── 404 handler ───────────────────────────────────────────────────────────────────
app.use((_req, res) => res.status(404).json({ success: false, error: 'Route not found.' }));

// ── Global error handler ─────────────────────────────────────────────────────────
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[api] Unhandled error:', err.message);
  res.status(500).json({ success: false, error: 'Internal server error.' });
});

const PORT = process.env.PORT ?? 3100;
app.listen(PORT, () => {
  console.log(`[mj-maps-systems] API listening on port ${PORT}`);
});

export default app;
