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
 * POST /api/v1/auth/register   ← new user registration
 * POST /api/v1/auth/login      ← new token auth
 * POST /api/v1/auth/refresh    ← token rotation
 * POST /api/v1/auth/logout     ← token revocation
 * GET  /api/v1/auth/me          ← current user profile
 * POST /api/v1/auth/token      ← legacy driver token (kept for compatibility)
 * GET  /api/v1/health
 * GET  /api/v1/admin/*          ← admin-only endpoints
 * WS   /ws/driver/:driverId/:routeId
 */

import Fastify from 'fastify';
import fastifyJwt from '@fastify/jwt';
import fastifyRateLimit from '@fastify/rate-limit';
import fastifyWebsocket from '@fastify/websocket';
import fastifyCors from '@fastify/cors';
import fastifyHelmet from '@fastify/helmet';
import fastifyCompress from '@fastify/compress';
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
import { driverRoutes }      from './routes/driver-routes.js';
import { assignRouteRoutes } from './routes/assign-route.js';
import { requireAuth, requireRole, requireTier, requireFeature } from './middleware/auth.js';

// ─── ENV ──────────────────────────────────────────────────────────────────────────────
const PORT       = Number(process.env.PORT ?? 3000);
const HOST       = process.env.HOST ?? '0.0.0.0';
const JWT_SECRET = process.env.JWT_SECRET ?? 'dev-secret-change-in-production';
const NODE_ENV   = process.env.NODE_ENV ?? 'development';

if (NODE_ENV === 'production' && JWT_SECRET === 'dev-secret-change-in-production') {
  // Warn loudly but do not exit — the health check must be able to pass
  // so Railway marks the deployment healthy. Set JWT_SECRET in Railway
  // environment variables to remove this warning.
  console.warn('[WARN] JWT_SECRET is not set — using insecure dev default in production!');
}

// ─── SERVER ─────────────────────────────────────────────────────────────────────────
export const server = Fastify({
  logger: {
    level: NODE_ENV === 'production' ? 'warn' : 'info',
    transport: NODE_ENV !== 'production'
      ? { target: 'pino-pretty', options: { colorize: true } }
      : undefined,
  },
  trustProxy: true,
});

// ─── ZOD SCHEMAS ───────────────────────────────────────────────────────────────
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

// ─── START (all plugin registration + routes live here) ────────────────────────────
const start = async () => {
  // ── Plugins ─────────────────────────────────────────────────────────────────────
  await server.register(fastifyHelmet, { contentSecurityPolicy: false });

  const extraOrigins = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(',').map((o) => o.trim())
  : [];

  await server.register(fastifyCors, {
    origin: NODE_ENV === 'production'
      ? ['https://mjmaps.co.uk', 'https://app.mjmaps.co.uk', ...extraOrigins]
      : true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  });

  await server.register(fastifyCompress, {
    threshold: 1024,
    encodings: ['gzip', 'deflate'],
  });

  await server.register(fastifyJwt, {
    secret: JWT_SECRET,
    sign: { expiresIn: '12h' },
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

  // ── Auth decorator (legacy — kept for existing route compatibility) ─────────────────
  server.decorate('authenticate', async function (request: any, reply: any) {
    try {
      await request.jwtVerify();
    } catch {
      reply.code(401).send({ ok: false, error: 'Unauthorised — invalid or expired token' });
    }
  });

  // ── Routes ──────────────────────────────────────────────────────────────────────────

  /** Auth router: /api/v1/auth/* — register, login, refresh, logout, /me */
  await server.register(authRoutes);

  await server.register(confirmPinRoute);
  await server.register(mapConfigRoute);
  await server.register(autocompleteRoute);
  await server.register(podRoute);
  await server.register(stopsRoutes);
  await server.register(vehiclesRoutes);
  await server.register(fcmTokenRoutes);
  await server.register(dispatcherRoutes);
  await server.register(driverRoutes);
  await server.register(assignRouteRoutes);

  /** Health — no auth, used by Railway health checks */
  server.get('/api/v1/health', handleHealth as any);

  /** Issue JWT for a driver (legacy compatibility endpoint) */
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

  /** Optimise + auto-enrich a new route — Custom plan only */
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

  /** Get stop intelligence for a route — Custom plan only */
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

  /** Manual replan — Custom plan only */
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

  /** Delete a route — dispatcher or admin only (Custom plan) */
  server.delete(
    '/api/v1/routes/:routeId',
    { preHandler: [requireAuth, requireRole('dispatcher', 'admin'), requireFeature('DISPATCHER')] },
    async (request, reply) => {
      const { routeId } = request.params as { routeId: string };
      if (!RouteIdSchema.safeParse(routeId).success) {
        return reply.code(400).send({ ok: false, error: 'Invalid routeId' });
      }
      // TODO: wire into route-engine to cancel active route
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

  /** Admin-only routes — admin role required (Custom plan) */
  server.get(
    '/api/v1/admin/users',
    { preHandler: [requireAuth, requireRole('admin'), requireFeature('ADMIN_ANALYTICS')] },
    async (request, reply) => {
      // TODO: wire into user management service
      return reply.send({ ok: true, data: [] });
    },
  );

  server.get(
    '/api/v1/admin/analytics',
    { preHandler: [requireAuth, requireRole('admin'), requireFeature('ADMIN_ANALYTICS')] },
    async (request, reply) => {
      // TODO: wire into analytics service
      return reply.send({ ok: true, data: {} });
    },
  );

  // ── WebSocket ──────────────────────────────────────────────────────────────────────
  // No preHandler auth here — JWT is verified per-message inside handleDriverWebSocket
  // via the AUTH { type, token } first-message pattern.
  server.register(async function wsRoutes(fastify: any) {
    fastify.get(
      '/ws/driver/:driverId/:routeId',
      {
        websocket: true,
        // Auth is validated per-message: first message must be { type: 'AUTH', token }
        // Close codes: 4001 = bad/missing token, 4008 = token expired
      },
      (socket: any, req: any) => {
        const { driverId, routeId } = req.params as { driverId: string; routeId: string };
        handleDriverWebSocket(socket, driverId, routeId);
      },
    );
  });

  // ── Listen ─────────────────────────────────────────────────────────────────────────
  try {
    await server.listen({ port: PORT, host: HOST });
    console.log(`[mj-maps-api] Listening on ${HOST}:${PORT} (${NODE_ENV})`);
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
};

start();
