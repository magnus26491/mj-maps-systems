/**
 * MJ Maps Systems — API Server Entry Point (Fastify)
 *
 * POST /api/v1/routes/optimise
 * GET  /api/v1/routes/:routeId/intel
 * POST /api/v1/routes/:routeId/replan
 * GET  /api/v1/routes/:routeId/alerts
 * GET  /api/v1/routes/:routeId/alerts/red
 * POST /api/v1/driver/event
 * GET  /api/v1/turn-score
 * POST /api/v1/auth/register
 * POST /api/v1/auth/login
 * POST /api/v1/auth/refresh
 * POST /api/v1/auth/logout
 * GET  /api/v1/auth/me
 * POST /api/v1/auth/token
 * GET  /api/v1/health
 * GET  /api/v1/admin/*
 * WS   /ws/driver/:driverId/:routeId
 */

import Fastify from 'fastify';
import fastifyRateLimit from '@fastify/rate-limit';
import fastifyWebsocket from '@fastify/websocket';
import fastifyCors from '@fastify/cors';
import fastifyHelmet from '@fastify/helmet';
import fastifyCompress from '@fastify/compress';
import { registerWebRoutes } from './web-serving';
import { z } from 'zod';
import {
  handleOptimiseRoute,
  handleRouteIntelligence,
  handleManualReplan,
  handleDriverEvent,
  handleDriverWebSocket,
  handleHealth,
  handleRouteAlerts,
  handleRouteAlertsRed,
} from './driver-api';
import { resolveTurnScore } from '../turn-engine/src/resolver';
import { VEHICLE_PROFILES } from '../../packages/vehicle-profiles/index';
import { confirmPinRoute } from './routes/confirm-pin';
import { mapConfigRoute } from './routes/map-config';
import { autocompleteRoute } from './routes/autocomplete';
import { authRoutes } from './routes/auth';
import { podRoute } from './routes/pod.js';
import { stopsRoutes } from './routes/stops.js';
import { vehiclesRoutes } from './routes/vehicles.js';
import { fcmTokenRoutes } from './routes/fcm-token.js';
import { dispatcherRoutes } from './routes/dispatcher.js';
import { analyticsRoutes }   from './routes/analytics.js';
import { driverRoutes }      from './routes/driver-routes.js';
import { assignRouteRoutes } from './routes/assign-route.js';
import { requireAuth, requireRole, requireTier, requireFeature, requireEnterprise } from './middleware/auth.js';
import { locationRoute } from './routes/location.js';

// ─── ENV ────────────────────────────────────────────────────────────────────
const PORT       = Number(process.env.PORT ?? 3000);
const HOST       = '0.0.0.0';
const JWT_SECRET = process.env.JWT_SECRET ?? 'dev-secret-not-for-production';
const NODE_ENV   = process.env.NODE_ENV ?? 'development';
const BUILD_ID   = process.env.BUILD_ID   ?? `dev-${Date.now()}`;

if (NODE_ENV === 'production') {
  if (!process.env.JWT_SECRET) {
    console.error('[mj-maps-api] FATAL: JWT_SECRET is required in production');
    process.exit(1);
  }
}

process.on('uncaughtException', (err: Error) => {
  console.error('[mj-maps-api] UNCAUGHT EXCEPTION:', err.message, err.stack);
  process.exit(1);
});

process.on('unhandledRejection', (reason: unknown) => {
  console.error('[mj-maps-api] UNHANDLED REJECTION:', reason);
  process.exit(1);
});

// ─── SERVER ──────────────────────────────────────────────────────────────────

export function build() {
  return Fastify({
    logger: {
      // IMPORTANT: Never use pino-pretty transport in production.
      // pino-pretty >=9 is ESM-only and will crash a CommonJS build.
      // In production, log raw JSON — Railway captures it fine.
      level: NODE_ENV === 'production' ? 'warn' : 'info',
      ...(NODE_ENV !== 'production' && process.stdout.isTTY
        ? { transport: { target: 'pino-pretty', options: { colorize: true } } }
        : {}),
    },
    trustProxy: true,
  });
}

export const server = build();

// ─── ZOD SCHEMAS ─────────────────────────────────────────────────────────────
const StopSchema = z.object({
  id:              z.string(),
  lat:             z.number(),
  lng:             z.number(),
  notes:           z.string().optional(),
  timeWindowStart: z.number().optional(),
  timeWindowEnd:   z.number().optional(),
  priority:        z.number().int().min(0).max(10).optional(),
});

const RouteConfigSchema = z.object({
  vehicleId:       z.string(),
  depotLat:        z.number(),
  depotLng:        z.number(),
  returnToDepot:   z.boolean().optional().default(true),
  shiftStartEpoch: z.number().optional(),
});

const RouteIdSchema = z.string().min(1).max(128).regex(
  /^[\w-]+$/,
  'routeId must be alphanumeric/hyphen/underscore only',
);

// ─── START ───────────────────────────────────────────────────────────────────
const start = async () => {
  await server.register(fastifyHelmet, { contentSecurityPolicy: false });

  const extraOrigins = process.env.CORS_ORIGINS
    ? process.env.CORS_ORIGINS.split(',').map((o) => o.trim())
    : [];

  await server.register(fastifyCors, {
    origin: NODE_ENV === 'production'
      ? [
          'https://mjmapsystems.com',
          'https://www.mjmapsystems.com',
          'https://api.mjmapsystems.com',
          ...extraOrigins,
        ]
      : true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  });

  await server.register(fastifyCompress, {
    threshold: 1024,
    encodings: ['gzip', 'deflate'],
  });

  await server.register(fastifyRateLimit, {
    global: true,
    max: 120,
    timeWindow: '1 minute',
    errorResponseBuilder: () => ({
      ok: false,
      error: 'Too many requests',
      retryAfterMs: 60_000,
    }),
  });

  await server.register(fastifyWebsocket);

  // ── Routes ──────────────────────────────────────────────────────────────────
  await server.register(authRoutes, { prefix: '/api/v1/auth' });
  await server.register(confirmPinRoute);
  await server.register(mapConfigRoute);
  await server.register(autocompleteRoute);
  await server.register(podRoute);
  await server.register(stopsRoutes);
  await server.register(vehiclesRoutes);
  await server.register(fcmTokenRoutes);
  await server.register(dispatcherRoutes);
  await server.register(analyticsRoutes, {
    prefix: '/api/v1/dispatcher',
    hooks: {
      preHandler: [requireAuth, requireRole('dispatcher', 'admin'), requireEnterprise],
    },
  });
  await server.register(driverRoutes);
  await server.register(assignRouteRoutes);
  await server.register(locationRoute);

  server.get('/api/v1/health', handleHealth as any);

  server.post('/api/v1/auth/token', async (request, reply) => {
    const parsed = z.object({
      driverId: z.string().min(1),
      secret:   z.string().min(1),
    }).safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ ok: false, error: 'driverId and secret required' });
    }
    const { driverId, secret } = parsed.data;
    if (NODE_ENV === 'production' && secret !== process.env.DRIVER_API_KEY) {
      return reply.code(401).send({ ok: false, error: 'Invalid credentials' });
    }
    const token = (server as any).jwt.sign({ sub: driverId, role: 'driver' });
    return reply.send({ ok: true, data: { token, expiresIn: '12h' } });
  });

  server.post(
    '/api/v1/routes/optimise',
    { preHandler: [requireAuth, requireFeature('ROUTE_OPTIMISE')] },
    async (request, reply) => {
      const body = z.object({
        stops:  z.array(StopSchema).min(1),
        config: RouteConfigSchema,
      }).safeParse(request.body);
      if (!body.success) return reply.code(400).send({ ok: false, error: body.error.message });
      return handleOptimiseRoute(request as any, reply as any);
    },
  );

  server.get(
    '/api/v1/routes/:routeId/intel',
    { preHandler: [requireAuth, requireFeature('ROUTE_INTEL')] },
    async (request, reply) => {
      const { routeId } = request.params as { routeId: string };
      if (!RouteIdSchema.safeParse(routeId).success) {
        return reply.code(400).send({ ok: false, error: 'Invalid routeId' });
      }
      return handleRouteIntelligence(request as any, reply as any);
    },
  );

  server.post(
    '/api/v1/routes/:routeId/replan',
    { preHandler: [requireAuth, requireFeature('DISPATCHER')] },
    async (request, reply) => {
      const { routeId } = request.params as { routeId: string };
      if (!RouteIdSchema.safeParse(routeId).success) {
        return reply.code(400).send({ ok: false, error: 'Invalid routeId' });
      }
      return handleManualReplan(request as any, reply as any);
    },
  );

  server.delete(
    '/api/v1/routes/:routeId',
    { preHandler: [requireAuth, requireRole('dispatcher', 'admin'), requireFeature('DISPATCHER')] },
    async (request, reply) => {
      const { routeId } = request.params as { routeId: string };
      if (!RouteIdSchema.safeParse(routeId).success) {
        return reply.code(400).send({ ok: false, error: 'Invalid routeId' });
      }
      return reply.send({ ok: true, message: `Route ${routeId} deleted` });
    },
  );

  server.get(
    '/api/v1/routes/:routeId/alerts',
    {
      preHandler: [requireAuth, requireFeature('ROUTE_INTEL')],
      config: { rateLimit: { max: 20, timeWindow: '1 minute' } },
    },
    async (request, reply) => {
      const { routeId } = request.params as { routeId: string };
      if (!RouteIdSchema.safeParse(routeId).success) {
        return reply.code(400).send({ ok: false, error: 'Invalid routeId' });
      }
      return handleRouteAlerts(request as any, reply as any);
    },
  );

  server.get(
    '/api/v1/routes/:routeId/alerts/red',
    {
      preHandler: [requireAuth, requireFeature('RED_ALERTS')],
      config: { rateLimit: { max: 20, timeWindow: '1 minute' } },
    },
    async (request, reply) => {
      const { routeId } = request.params as { routeId: string };
      if (!RouteIdSchema.safeParse(routeId).success) {
        return reply.code(400).send({ ok: false, error: 'Invalid routeId' });
      }
      return handleRouteAlertsRed(request as any, reply as any);
    },
  );

  server.post(
    '/api/v1/driver/event',
    { preHandler: [requireAuth, requireFeature('STOP_STATUS')] },
    (request, reply) => handleDriverEvent(request as any, reply as any),
  );

  server.get(
    '/api/v1/turn-score',
    { preHandler: [requireAuth, requireFeature('TURN_SCORE')] },
    async (request, reply) => {
      const t0 = Date.now();
      const parsed = z.object({
        lat:       z.coerce.number(),
        lng:       z.coerce.number(),
        vehicleId: z.string(),
      }).safeParse(request.query);
      if (!parsed.success) {
        return reply.code(400).send({ ok: false, error: parsed.error.message });
      }
      const { lat, lng, vehicleId } = parsed.data;
      if (!VEHICLE_PROFILES[vehicleId]) {
        return reply.code(400).send({
          ok: false,
          error: `Unknown vehicleId: ${vehicleId}. Valid: ${Object.keys(VEHICLE_PROFILES).join(', ')}`,
        });
      }
      const result = await resolveTurnScore({ lat, lng, vehicleId });
      return reply.send({ ok: true, data: result, durationMs: Date.now() - t0 });
    },
  );

  /** Admin-only routes */
  server.get(
    '/api/v1/admin/users',
    { preHandler: [requireAuth, requireRole('admin'), requireFeature('ADMIN_ANALYTICS')] },
    async (_request, reply) => reply.send({ ok: true, data: [] }),
  );

  server.get(
    '/api/v1/admin/analytics',
    { preHandler: [requireAuth, requireRole('admin'), requireFeature('ADMIN_ANALYTICS')] },
    async (_request, reply) => reply.send({ ok: true, data: {} }),
  );

  // ── WebSocket ──────────────────────────────────────────────────────────────────────
  server.register(async function wsRoutes(fastify: any) {
    fastify.get(
      '/ws/driver/:driverId/:routeId',
      { websocket: true },
      (socket: any, req: any) => {
        const { driverId, routeId } = req.params as { driverId: string; routeId: string };
        handleDriverWebSocket(socket, driverId, routeId);
      },
    );
  });

  // ── Web Frontend Routes ────────────────────────────────────────────────
  // Uses web-serving.ts module for safe static file serving
  await registerWebRoutes(server);

  // ── Listen ────────────────────────────────────────────────────────────────
  try {
    await server.listen({ port: PORT, host: HOST });
    console.log(
      `[mj-maps-api] Started — service=mj-maps-api, env=${NODE_ENV}, port=${PORT}, build=${BUILD_ID}`,
    );
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
};

// ── Graceful shutdown ───────────────────────────────────────────────────────────────
const shutdown = async (signal: string) => {
  console.log(`[mj-maps-api] Received ${signal} — shutting down gracefully…`);
  try {
    await server.close();
    console.log('[mj-maps-api] Server closed cleanly');
    process.exit(0);
  } catch (err) {
    console.error('[mj-maps-api] Error during shutdown:', err);
    process.exit(1);
  }
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));

start();
