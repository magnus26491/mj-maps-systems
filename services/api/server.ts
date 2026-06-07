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
 * POST /api/v1/auth/token
 * GET  /api/v1/health
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

  await server.register(fastifyCors, {
    origin: NODE_ENV === 'production'
      ? ['https://mjmaps.app', 'https://app.mjmaps.app']
      : true,
    methods: ['GET', 'POST', 'OPTIONS'],
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

  // ── Auth decorator ────────────────────────────────────────────────────────────────────
  server.decorate('authenticate', async function (request: any, reply: any) {
    try {
      await request.jwtVerify();
    } catch {
      reply.code(401).send({ ok: false, error: 'Unauthorised — invalid or expired token' });
    }
  });

  // ── Routes ──────────────────────────────────────────────────────────────────────────

  /** Health — no auth, used by Railway health checks */
  server.get('/api/v1/health', handleHealth as any);

  /** Issue JWT for a driver */
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

  /** Optimise + auto-enrich a new route */
  server.post(
    '/api/v1/routes/optimise',
    { preHandler: [(server as any).authenticate] },
    async (request, reply) => {
      const body = z.object({
        stops:  z.array(StopSchema).min(1),
        config: RouteConfigSchema,
      }).safeParse(request.body);
      if (!body.success) return reply.code(400).send({ ok: false, error: body.error.message });
      return handleOptimiseRoute(request as any, reply as any);
    },
  );

  /** Get stop intelligence for a route */
  server.get(
    '/api/v1/routes/:routeId/intel',
    { preHandler: [(server as any).authenticate] },
    async (request, reply) => {
      const { routeId } = request.params as { routeId: string };
      if (!RouteIdSchema.safeParse(routeId).success) {
        return reply.code(400).send({ ok: false, error: 'Invalid routeId' });
      }
      return handleRouteIntelligence(request as any, reply as any);
    },
  );

  /** Manual replan */
  server.post(
    '/api/v1/routes/:routeId/replan',
    { preHandler: [(server as any).authenticate] },
    async (request, reply) => {
      const { routeId } = request.params as { routeId: string };
      if (!RouteIdSchema.safeParse(routeId).success) {
        return reply.code(400).send({ ok: false, error: 'Invalid routeId' });
      }
      return handleManualReplan(request as any, reply as any);
    },
  );

  server.get(
    '/api/v1/routes/:routeId/alerts',
    {
      preHandler: [(server as any).authenticate],
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
      preHandler: [(server as any).authenticate],
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
    { preHandler: [(server as any).authenticate] },
    (request, reply) => handleDriverEvent(request as any, reply as any),
  );

  server.get(
    '/api/v1/turn-score',
    { preHandler: [(server as any).authenticate] },
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

  // ── WebSocket ──────────────────────────────────────────────────────────────────────
  server.register(async function wsRoutes(fastify: any) {
    fastify.get(
      '/ws/driver/:driverId/:routeId',
      { websocket: true },
      (socket: any, req: any) => {
        const { driverId, routeId } = req.params;
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
