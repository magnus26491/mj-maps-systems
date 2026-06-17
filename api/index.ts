/**
 * MJ Maps Systems — API Server
 * All routes mounted. Protected routes require authenticateDriver middleware.
 */

// Trap any crash before it silently exits
process.on('uncaughtException', (err) => {
  console.error('[startup] uncaughtException:', err.message);
  console.error(err.stack);
  process.exit(1);
});
process.on('unhandledRejection', (reason) => {
  console.error('[startup] unhandledRejection:', reason);
  process.exit(1);
});

console.log('[startup] loading imports...');

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import path from 'path';
import fs from 'fs';

import { authRouter } from './routes/auth';
import { authRegisterRouter } from './routes/auth-register';
import { planRouter } from './routes/plan';
import { turnCheckRouter } from './routes/turn-check';
import { replanRouter } from './routes/replan';
import { stopPinRouter } from './routes/stop-pin';
import { stopFeedbackRouter } from './routes/stop-feedback';
import { dispatcherRouter } from './routes/dispatcher';
import { dispatcherAssignRouter } from './routes/dispatcher-assign';
import { pinsRouter } from './routes/pins';
import { optimiseRouter } from './routes/optimise';
import { pafRouter } from './routes/paf';
import { billingRouter } from './routes/billing';
import { pinConfirmRouter } from './routes/pin-confirm';
import { podRouter } from './routes/pod';
import { vehicleSpecsRouter } from './routes/vehicle-specs';
import { locationRouter } from './routes/location';
import { analyticsRouter } from './routes/analytics';
import { stopCompleteRouter } from './routes/stop-complete';
import { driverManagementRouter } from './routes/driver-management';

import { authenticateDriver } from './middleware/authenticate';
import { requireRole } from './middleware/requireRole';
import { requireEnterprise } from './middleware/requireEnterprise';
import { pingCache } from '../services/cache';
import { pool } from '../services/db';

console.log('[startup] imports loaded, building express app...');

const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '2mb' }));

// ── Rate limiting ─────────────────────────────────────────────────────

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { success: false, error: 'Too many requests. Try again in 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
});

const locationLimiter = rateLimit({
  windowMs: 60_000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/api/auth', authLimiter);
app.use('/api', apiLimiter);

// ── Health (public) ─────────────────────────────────────────────────────────
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
app.use('/api/auth',       authRouter);
app.use('/api/v1/auth',    authRegisterRouter);
app.use('/api/v1/pins',    pinsRouter);
app.use('/api/v1/billing', billingRouter);

// ── Protected routes (all require valid JWT) ──────────────────────────────────────────
app.use('/api/plan',          authenticateDriver, planRouter);
app.use('/api/turn-check',    authenticateDriver, turnCheckRouter);
app.use('/api/replan',        authenticateDriver, replanRouter);
app.use('/api/stop-pin',      authenticateDriver, stopPinRouter);
app.use('/api/stop-feedback', authenticateDriver, stopFeedbackRouter);

app.use('/api/dispatcher',    authenticateDriver, requireRole('dispatcher'), dispatcherRouter, dispatcherAssignRouter);
app.use('/api/dispatcher',    authenticateDriver, requireRole('dispatcher'), requireEnterprise, analyticsRouter);
app.use('/api/dispatcher/drivers', authenticateDriver, requireRole('dispatcher'), driverManagementRouter);

app.use('/api/v1/optimise',      authenticateDriver, optimiseRouter);
app.use('/api/v1/paf',           authenticateDriver, pafRouter);
app.use('/api/v1/stops',         authenticateDriver, pinConfirmRouter, podRouter, stopCompleteRouter);
app.use('/api/v1/vehicle-specs', authenticateDriver, vehicleSpecsRouter);
app.use('/api/v1/location',      locationLimiter, authenticateDriver, locationRouter);

// ── Driver app web build ────────────────────────────────────────────────────────────
const driverAppDist = path.join(__dirname, '../../apps/driver-app/dist');
if (fs.existsSync(driverAppDist)) {
  app.use('/app', express.static(driverAppDist));
  app.get('/app/*', (_req, res) => {
    res.sendFile(path.join(driverAppDist, 'index.html'));
  });
  console.log(`[startup] driver app web build served at /app (${driverAppDist})`);
}

// ── 404 handler ───────────────────────────────────────────────────────────────────────
app.use((_req, res) => res.status(404).json({ success: false, error: 'Route not found.' }));

// ── Global error handler ──────────────────────────────────────────────────────────────
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[api] Unhandled error:', err.message);
  res.status(500).json({ success: false, error: 'Internal server error.' });
});

const PORT = process.env.PORT ?? 3100;
console.log(`[startup] calling app.listen on port ${PORT}...`);
app.listen(PORT, () => {
  console.log(`[mj-maps-systems] API listening on port ${PORT}`);
});

export default app;
