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
import { registerWebRoutes } from './web-serving.js';
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
} from './driver-api.js';
import { resolveTurnScore } from '../turn-engine/src/resolver.js';
import { VEHICLE_PROFILES } from '../../packages/vehicle-profiles/index.js';
import { confirmPinRoute } from './routes/confirm-pin.js';
import { mapConfigRoute } from './routes/map-config.js';
import { autocompleteRoute } from './routes/autocomplete.js';
import { authRoutes } from './routes/auth.js';
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
import { pinCorrectionRoute } from './routes/pin-correction.js';
import { navigateLegRoute } from './routes/navigate-leg.js';
import { stopConfidenceRoute } from './routes/stop-confidence.js';
import { stopLifecycleRoutes } from './routes/stop-lifecycle.js';
import { safetyRoutes } from './routes/safety.js';
import { fleetStreamRoute } from './routes/fleet-stream.js';
import { deliveryDifficultyRoutes } from './routes/delivery-difficulty.js';
import { poisRoute } from './routes/pois.js';
import { geocodingProvider } from '../geocoding/geocoding-provider.js';
import { optimiseRoute } from '../route-engine/route-engine.js';

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

  // @fastify/compress is intentionally NOT registered here.
  // Railway's edge proxy handles gzip/brotli compression transparently.
  // Adding Fastify-level compression causes double-encoding of static files
  // (customTypes cannot override mimedb's compressible fallback, so HTML/JS/CSS
  // always get compressed regardless of the regex, and Railway compresses again).

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
  await server.register(pinCorrectionRoute);
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
  await server.register(navigateLegRoute);
  await server.register(stopConfidenceRoute);
  await server.register(stopLifecycleRoutes);
  await server.register(safetyRoutes);
  await server.register(fleetStreamRoute);
  await server.register(deliveryDifficultyRoutes);
  await server.register(poisRoute);

  // ── PAF / postcode lookup ────────────────────────────────────────────────────
  // Driver app calls GET /api/v1/paf/lookup?postcode=SO14+2AH
  // Returns addresses with real lat/lng so the app can geocode stops correctly.
  server.get('/api/v1/paf/lookup', { preHandler: [requireAuth] }, async (request, reply) => {
    const { postcode } = request.query as { postcode?: string };
    if (!postcode?.trim()) {
      return reply.code(400).send({ ok: false, error: 'postcode query param required' });
    }
    try {
      const candidates = await geocodingProvider.resolvePostcodeToCandidates(postcode.trim());
      const addresses = candidates.map(c => {
        const parts = c.address.split(',').map((p: string) => p.trim());
        return {
          line1:       parts[0] ?? c.address,
          line2:       parts[1] ?? undefined,
          postTown:    parts[parts.length - 3] ?? '',
          postcode:    c.postcode || postcode.trim().toUpperCase(),
          fullAddress: c.address,
          lat:         c.lat,
          lng:         c.lng,
        };
      });
      return reply.send({ ok: true, addresses });
    } catch (err) {
      return reply.code(500).send({ ok: false, error: (err as Error).message });
    }
  });

  // ── Driver optimise alias ────────────────────────────────────────────────────
  // Driver app calls POST /api/v1/optimise with its own schema:
  //   { depot, stops: [{id,address,lat,lng,parcelCount}], vehicleProfileKey, plannedDepartureTime }
  // This endpoint geocodes any stops with lat=0 and runs the route engine.
  server.post('/api/v1/optimise', { preHandler: [requireAuth] }, async (request, reply) => {
    const body = request.body as {
      depot?: { lat?: number; lng?: number };
      stops?: Array<{ id: string; address: string; lat?: number; lng?: number; parcelCount?: number }>;
      vehicleProfileKey?: string;
      plannedDepartureTime?: string;
    };
    if (!Array.isArray(body.stops) || body.stops.length === 0) {
      return reply.code(400).send({ ok: false, error: 'stops array required' });
    }

    // Geocode stops that have no coordinates (lat=0 or missing)
    const resolved = await Promise.all(body.stops.map(async s => {
      if (s.lat && s.lng && (s.lat !== 0 || s.lng !== 0)) return s;
      try {
        const candidates = await geocodingProvider.resolvePostcodeToCandidates(s.address);
        if (candidates.length > 0) {
          return { ...s, lat: candidates[0].lat, lng: candidates[0].lng };
        }
      } catch { /* non-fatal — leave at 0,0 */ }
      return s;
    }));

    const depEpoch = body.plannedDepartureTime
      ? Math.floor(new Date(body.plannedDepartureTime).getTime() / 1000)
      : Math.floor(Date.now() / 1000);

    const engineStops = resolved.map(s => ({
      id:             s.id,
      lat:            s.lat ?? 0,
      lng:            s.lng ?? 0,
      serviceMinutes: 3,
      address:        s.address,
      parcelCount:    s.parcelCount ?? 1,
    }));

    const config = {
      depotLat:        body.depot?.lat ?? 0,
      depotLng:        body.depot?.lng ?? 0,
      vehicleId:       body.vehicleProfileKey ?? 'lwb_van',
      shiftStartEpoch: depEpoch,
      shiftEndEpoch:   depEpoch + 8 * 3600,
      returnToDepot:   false,
    };

    const result = await optimiseRoute(engineStops as any, config);

    return reply.send({
      ok: true,
      optimized: {
        orderedStops: result.orderedStops.map(s => ({
          id:          s.id,
          address:     (s as any).address ?? '',
          lat:         s.lat,
          lng:         s.lng,
          parcelCount: (s as any).parcelCount ?? 1,
        })),
      },
    });
  });

  server.get('/api/v1/health', handleHealth as any);

  server.get('/api/v1/health/ready', async (_request, reply) => {
    const { isConfigured, getPool } = await import('../db/index.js');
    if (!isConfigured()) {
      return reply.code(503).send({
        ok: false,
        status: 'unavailable',
        reason: 'DATABASE_URL is not configured',
      });
    }
    try {
      // Short timeout so the readiness probe doesn't hang the health check
      await Promise.race([
        getPool().query('SELECT 1'),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('DB check timed out')), 5_000),
        ),
      ]);
      return reply.send({ ok: true, status: 'ready' });
    } catch {
      return reply.code(503).send({
        ok: false,
        status: 'unavailable',
        reason: 'Database connection failed',
      });
    }
  });

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

  // ── Admin setup (one-time, protected by ADMIN_SETUP_SECRET) ──────────────────
  // Used to create the initial admin account. Disabled once ADMIN_SETUP_SECRET is unset.
  server.post('/api/v1/admin/setup', async (request, reply) => {
    const setupSecret = process.env.ADMIN_SETUP_SECRET;
    if (!setupSecret) {
      return reply.code(404).send({ error: 'Not found' });
    }

    const parsed = z.object({
      secret:   z.string().min(1),
      email:    z.string().email(),
      password: z.string().min(8),
    }).safeParse(request.body);

    if (!parsed.success || parsed.data.secret !== setupSecret) {
      return reply.code(401).send({ error: 'Unauthorized' });
    }

    const { email, password } = parsed.data;
    const { hashPassword } = await import('../auth/index.js');
    const { getPool }      = await import('../db/index.js');

    const hash = await hashPassword(password);
    const { rows } = await getPool().query(
      `INSERT INTO users (email, password_hash, role, plan_id, is_active, is_owner)
       VALUES ($1, $2, 'admin', 'custom', true, true)
       ON CONFLICT (email) DO UPDATE SET
         password_hash = EXCLUDED.password_hash,
         role          = 'admin',
         plan_id       = 'custom',
         is_active     = true,
         is_owner      = true
       RETURNING id, email, role, plan_id`,
      [email, hash],
    );

    return reply.code(201).send({ ok: true, user: rows[0] });
  });

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
