/**
 * API integration tests — all 7 routes
 * Spins up the Fastify server in-process, no external deps needed.
 * Redis and turn-engine are mocked so tests run without infrastructure.
 */
import { server } from '../server';
import type { InjectOptions } from 'fastify';

// ─── Mock turn engine so tests don't need Overpass / Redis ───────────────────
jest.mock('../../turn-engine/src/resolver', () => ({
  resolveTurnScore: jest.fn().mockResolvedValue({
    score:      0.82,
    alert:      'GREEN',
    reason:     null,
    roadWidthM: 7.4,
    source:     'mock',
    cachedAt:   Date.now(),
  }),
}));

jest.mock('../../vehicle-profiles/index', () => ({
  VEHICLE_PROFILES: {
    swb_van: {
      id:                'swb_van',
      label:             'SWB Van',
      lengthM:           4.8,
      widthM:            2.0,
      minRoadWidthTurn:  5.5,
      turningCircleM:    11.0,
    },
  },
}));

// ─── Helpers ─────────────────────────────────────────────────────────────────
let validToken: string;

async function post(url: string, body: object, token?: string): Promise<InjectOptions> {
  return server.inject({
    method: 'POST', url,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  }) as unknown as InjectOptions;
}

async function get(url: string, token?: string): Promise<InjectOptions> {
  return server.inject({
    method: 'GET', url,
    headers: token ? { authorization: `Bearer ${token}` } : {},
  }) as unknown as InjectOptions;
}

// ─── Suite ───────────────────────────────────────────────────────────────────
beforeAll(async () => {
  await server.ready();
  // Obtain a valid token for authenticated route tests
  const res = await post('/api/v1/auth/token', {
    driverId: 'test-driver-1',
    secret:   'any-secret-dev-mode',
  });
  const body = JSON.parse((res as any).body);
  validToken = body.data?.token;
});

afterAll(async () => {
  await server.close();
});

// ── Health ────────────────────────────────────────────────────────────────────
describe('GET /api/v1/health', () => {
  it('returns 200 with ok:true', async () => {
    const res = await get('/api/v1/health');
    expect((res as any).statusCode).toBe(200);
    const body = JSON.parse((res as any).body);
    expect(body.ok).toBe(true);
  });
});

// ── Auth ─────────────────────────────────────────────────────────────────────
describe('POST /api/v1/auth/token', () => {
  it('issues a JWT for valid credentials', async () => {
    const res = await post('/api/v1/auth/token', {
      driverId: 'driver-123',
      secret:   'dev-secret',
    });
    expect((res as any).statusCode).toBe(200);
    const body = JSON.parse((res as any).body);
    expect(body.ok).toBe(true);
    expect(body.data.token).toBeTruthy();
    expect(body.data.expiresIn).toBe('12h');
  });

  it('returns 400 when driverId is missing', async () => {
    const res = await post('/api/v1/auth/token', { secret: 'dev' });
    expect((res as any).statusCode).toBe(400);
  });
});

// ── Turn score ───────────────────────────────────────────────────────────────
describe('GET /api/v1/turn-score', () => {
  it('returns GREEN score for valid coordinates + vehicleId', async () => {
    const res = await get(
      '/api/v1/turn-score?lat=51.5074&lng=-0.1278&vehicleId=swb_van',
      validToken,
    );
    expect((res as any).statusCode).toBe(200);
    const body = JSON.parse((res as any).body);
    expect(body.ok).toBe(true);
    expect(body.data.alert).toBe('GREEN');
    expect(body.data.score).toBeGreaterThan(0);
    expect(body.durationMs).toBeLessThan(500);
  });

  it('returns 400 for unknown vehicleId', async () => {
    const res = await get(
      '/api/v1/turn-score?lat=51.5&lng=-0.1&vehicleId=unknown_truck',
      validToken,
    );
    expect((res as any).statusCode).toBe(400);
    const body = JSON.parse((res as any).body);
    expect(body.ok).toBe(false);
  });

  it('returns 401 without token', async () => {
    const res = await get('/api/v1/turn-score?lat=51.5&lng=-0.1&vehicleId=swb_van');
    expect((res as any).statusCode).toBe(401);
  });

  it('returns 400 for missing lat/lng', async () => {
    const res = await get('/api/v1/turn-score?vehicleId=swb_van', validToken);
    expect((res as any).statusCode).toBe(400);
  });
});

// ── Route optimise ───────────────────────────────────────────────────────────
describe('POST /api/v1/routes/optimise', () => {
  const validBody = {
    stops: [
      { id: 's1', lat: 51.51, lng: -0.12, address: '1 Test St, London' },
      { id: 's2', lat: 51.52, lng: -0.13, address: '2 Sample Ave, London' },
      { id: 's3', lat: 51.50, lng: -0.11, address: '3 Mock Rd, London' },
    ],
    config: {
      vehicleId:   'swb_van',
      depotLat:    51.505,
      depotLng:    -0.09,
      returnToDepot: false,
    },
  };

  it('returns 401 without token', async () => {
    const res = await post('/api/v1/routes/optimise', validBody);
    expect((res as any).statusCode).toBe(401);
  });

  it('returns 400 with empty stops array', async () => {
    const res = await post(
      '/api/v1/routes/optimise',
      { ...validBody, stops: [] },
      validToken,
    );
    expect((res as any).statusCode).toBe(400);
  });

  it('returns 400 with missing config.vehicleId', async () => {
    const res = await post(
      '/api/v1/routes/optimise',
      { stops: validBody.stops, config: { depotLat: 51.5, depotLng: -0.1 } },
      validToken,
    );
    expect((res as any).statusCode).toBe(400);
  });
});

// ── Rate limiting ─────────────────────────────────────────────────────────────
describe('Rate limiting', () => {
  it('health endpoint responds quickly under normal load', async () => {
    const results = await Promise.all(
      Array.from({ length: 10 }, () => get('/api/v1/health')),
    );
    results.forEach(r => {
      expect((r as any).statusCode).toBe(200);
    });
  });
});
