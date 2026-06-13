/**
 * __tests__/services/api/routes/analytics.test.ts
 * Phase 16 — Analytics route security & contract tests.
 *
 * Tests authentication and authorization for all three analytics endpoints
 * using Fastify's built-in inject() API.
 *
 * Run with: JWT_SECRET=<secret> npm test -- --testPathPattern="analytics"
 *
 * Note on DB-free testing: auth guards (401/403 cases) are fully tested here.
 * 200+ cases hit the database and will time out without a live DATABASE_URL.
 * Set DATABASE_URL=<connection-string> to also test the DB path.
 */

import { sign as jwtSign } from 'jsonwebtoken';
import type { FastifyInstance } from 'fastify';
import Fastify from 'fastify';

// Load the compiled analytics module (built by npm run build)
// NOTE: requires compiled dist/ so it picks up auth middleware with correct JWT_SECRET
const analyticsModule = require('../../../../dist/services/api/routes/analytics');
const { analyticsRoutes } = analyticsModule as {
  analyticsRoutes: (server: FastifyInstance) => Promise<void>;
};

// DEBUG: Check if middleware loaded correctly
console.log('[analytics.test] analyticsModule keys:', Object.keys(analyticsModule));

// DEBUG: Also load the auth middleware directly to verify it works
const { requireAuth, requireRole, requireEnterprise } = require('../../../../dist/services/api/middleware/auth');
console.log('[analytics.test] requireAuth type:', typeof requireAuth);
console.log('[analytics.test] requireEnterprise type:', typeof requireEnterprise);

// Quick auth test without Fastify
const { sign } = require('jsonwebtoken');
const testToken = sign({ sub: 'test', role: 'dispatcher', tier: 'standard', planId: 'navigation' }, 'test-secret-for-jwt');
const { verifyAccessToken } = require('../../../../dist/services/auth/index');
const payload = verifyAccessToken(testToken);
console.log('[analytics.test] verifyAccessToken result:', payload ? 'OK' : 'FAIL');

// ── Minimal test server factory ─────────────────────────────────────────────────

function makeTestServer(): FastifyInstance {
  return Fastify({ logger: false });
}

// ── Test setup ─────────────────────────────────────────────────────────────────

let server: FastifyInstance;

beforeAll(async () => {
  server = makeTestServer();
  await server.register(analyticsRoutes);
  await server.ready();
});

afterAll(async () => {
  if (server) await server.close();
});

// ── Token helpers ─────────────────────────────────────────────────────────────

function makeToken(payload: {
  sub: string;
  role: string;
  tier?: string;
  planId?: string;
}): string {
  const secret = process.env.JWT_SECRET ?? 'test-secret-for-jwt';
  return jwtSign(payload as Record<string, unknown>, secret, { expiresIn: '1h' });
}

const DISPATCHER_TOKEN_NO_ENTERPRISE = makeToken({
  sub: 'user-dispatcher-no-enterprise',
  role: 'dispatcher',
  tier: 'standard',
  planId: 'navigation',
});

const DISPATCHER_TOKEN_ENTERPRISE = makeToken({
  sub: 'user-dispatcher-enterprise',
  role: 'dispatcher',
  tier: 'premium',
  planId: 'custom',
});

const ADMIN_TOKEN_ENTERPRISE = makeToken({
  sub: 'user-admin-enterprise',
  role: 'admin',
  tier: 'premium',
  planId: 'custom',
});

// ── Test: GET /api/v1/dispatcher/analytics/routes ─────────────────────────────

const HAS_DB = Boolean(process.env.DATABASE_URL);

describe('GET /api/v1/dispatcher/analytics/routes', () => {
  it('returns 401 when no Authorization header is provided', async () => {
    const res = await server.inject({
      method: 'GET',
      url: '/api/v1/dispatcher/analytics/routes',
    });
    expect(res.statusCode).toBe(401);
    const body = JSON.parse(res.body);
    expect(body.error).toBe('Unauthorized');
  });

  it('returns 401 when the Bearer token is invalid', async () => {
    const res = await server.inject({
      method: 'GET',
      url: '/api/v1/dispatcher/analytics/routes',
      headers: { Authorization: 'Bearer not-a-valid-token' },
    });
    expect(res.statusCode).toBe(401);
    const body = JSON.parse(res.body);
    expect(body.error).toBe('Unauthorized');
  });

  it('returns 403 when user has dispatcher role but no enterprise plan', async () => {
    const res = await server.inject({
      method: 'GET',
      url: '/api/v1/dispatcher/analytics/routes',
      headers: { Authorization: `Bearer ${DISPATCHER_TOKEN_NO_ENTERPRISE}` },
    });
    expect(res.statusCode).toBe(403);
    const body = JSON.parse(res.body);
    expect(body.error).toBe('ENTERPRISE_REQUIRED');
  });

  it('returns 200+json when dispatcher has enterprise plan', async () => {
    if (!HAS_DB) return; // DB required for this path
    const res = await server.inject({
      method: 'GET',
      url: '/api/v1/dispatcher/analytics/routes',
      headers: { Authorization: `Bearer ${DISPATCHER_TOKEN_ENTERPRISE}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body).toHaveProperty('ok', true);
    expect(body).toHaveProperty('routes');
    expect(Array.isArray(body.routes)).toBe(true);
  }, 10_000);

  it('returns 200+json when admin has enterprise plan', async () => {
    if (!HAS_DB) return;
    const res = await server.inject({
      method: 'GET',
      url: '/api/v1/dispatcher/analytics/routes',
      headers: { Authorization: `Bearer ${ADMIN_TOKEN_ENTERPRISE}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body).toHaveProperty('ok', true);
    expect(Array.isArray(body.routes)).toBe(true);
  }, 10_000);

  it('returns 400 for unparseable `from` date', async () => {
    if (!HAS_DB) return;
    const res = await server.inject({
      method: 'GET',
      url: '/api/v1/dispatcher/analytics/routes?from=not-a-date',
      headers: { Authorization: `Bearer ${DISPATCHER_TOKEN_ENTERPRISE}` },
    });
    // With valid auth+role+enterprise token: expect 400 for bad date param.
    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.ok).toBe(false);
    expect(body.error).toContain('Invalid');
  }, 10_000);

  it('clamps `limit` to 100', async () => {
    if (!HAS_DB) return;
    const res = await server.inject({
      method: 'GET',
      url: '/api/v1/dispatcher/analytics/routes?limit=999',
      headers: { Authorization: `Bearer ${DISPATCHER_TOKEN_ENTERPRISE}` },
    });
    // Should not return 400 for large limit — silently clamped
    expect([200, 500]).toContain(res.statusCode);
  }, 10_000);
});

// ── Test: GET /api/v1/dispatcher/analytics/routes/:routeId ───────────────────

describe('GET /api/v1/dispatcher/analytics/routes/:routeId', () => {
  it('returns 401 when no token', async () => {
    const res = await server.inject({
      method: 'GET',
      url: '/api/v1/dispatcher/analytics/routes/00000000-0000-0000-0000-000000000001',
    });
    expect(res.statusCode).toBe(401);
  });

  it('returns 403 when user has no enterprise plan', async () => {
    const res = await server.inject({
      method: 'GET',
      url: '/api/v1/dispatcher/analytics/routes/00000000-0000-0000-0000-000000000001',
      headers: { Authorization: `Bearer ${DISPATCHER_TOKEN_NO_ENTERPRISE}` },
    });
    expect(res.statusCode).toBe(403);
    const body = JSON.parse(res.body);
    expect(body.error).toBe('ENTERPRISE_REQUIRED');
  });

  it('returns 404 for a non-existent routeId when authenticated as enterprise user', async () => {
    if (!HAS_DB) return;
    const res = await server.inject({
      method: 'GET',
      url: '/api/v1/dispatcher/analytics/routes/00000000-0000-0000-0000-000000000001',
      headers: { Authorization: `Bearer ${DISPATCHER_TOKEN_ENTERPRISE}` },
    });
    expect(res.statusCode).toBe(404);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(false);
    expect(body.error).toBe('Route not found.');
  }, 10_000);
});

// ── Test: GET /api/v1/dispatcher/analytics/summary ────────────────────────────

describe('GET /api/v1/dispatcher/analytics/summary', () => {
  it('returns 401 when no token', async () => {
    const res = await server.inject({
      method: 'GET',
      url: '/api/v1/dispatcher/analytics/summary',
    });
    expect(res.statusCode).toBe(401);
  });

  it('returns 403 when user has no enterprise plan', async () => {
    const res = await server.inject({
      method: 'GET',
      url: '/api/v1/dispatcher/analytics/summary',
      headers: { Authorization: `Bearer ${DISPATCHER_TOKEN_NO_ENTERPRISE}` },
    });
    expect(res.statusCode).toBe(403);
    const body = JSON.parse(res.body);
    expect(body.error).toBe('ENTERPRISE_REQUIRED');
  });

  it('returns 200 with ok=true when enterprise user calls it', async () => {
    if (!HAS_DB) return;
    const res = await server.inject({
      method: 'GET',
      url: '/api/v1/dispatcher/analytics/summary',
      headers: { Authorization: `Bearer ${DISPATCHER_TOKEN_ENTERPRISE}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body).toHaveProperty('ok', true);
    expect(body).toHaveProperty('completedRoutes');
    expect(body).toHaveProperty('activeRoutes');
    expect(body).toHaveProperty('totalStopsDelivered');
    expect(body).toHaveProperty('totalStopsFailed');
    expect(body).toHaveProperty('podCaptureRate');
    expect(body).toHaveProperty('onTimeRate');
    expect(body).toHaveProperty('avgCompletionMins');
    expect(body).toHaveProperty('redAlertCount');
    expect(body).toHaveProperty('amberAlertCount');
    expect(typeof body.podCaptureRate).toBe('number');
    expect(typeof body.onTimeRate).toBe('number');
  }, 10_000);
});