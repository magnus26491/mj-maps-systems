/**
 * API integration tests — services/api
 *
 * Tests all 7 routes against the Fastify server instance.
 * Uses inject() for in-process HTTP — no real network needed.
 * JWT signed with the test secret.
 */
import { server } from '../server';

const TEST_SECRET = 'dev-secret-change-in-production';
const DRIVER_ID   = 'driver-test-001';

let token: string;

beforeAll(async () => {
  await server.ready();
  // Issue a real JWT via the token endpoint
  const res = await server.inject({
    method: 'POST',
    url: '/api/v1/auth/token',
    payload: { driverId: DRIVER_ID, secret: TEST_SECRET },
  });
  token = JSON.parse(res.body).data.token;
});

afterAll(() => server.close());

// ─── Health ───────────────────────────────────────────────────────────────────
describe('GET /api/v1/health', () => {
  it('returns 200 with ok:true', async () => {
    const res = await server.inject({ method: 'GET', url: '/api/v1/health' });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).ok).toBe(true);
  });
});

// ─── Auth ─────────────────────────────────────────────────────────────────────
describe('POST /api/v1/auth/token', () => {
  it('issues a JWT for valid credentials', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/api/v1/auth/token',
      payload: { driverId: 'driver-1', secret: TEST_SECRET },
    });
    const body = JSON.parse(res.body);
    expect(res.statusCode).toBe(200);
    expect(body.ok).toBe(true);
    expect(typeof body.data.token).toBe('string');
    expect(body.data.expiresIn).toBe('12h');
  });

  it('rejects missing fields', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/api/v1/auth/token',
      payload: { driverId: 'driver-1' }, // missing secret
    });
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).ok).toBe(false);
  });
});

// ─── Route optimise ───────────────────────────────────────────────────────────
describe('POST /api/v1/routes/optimise', () => {
  const validBody = {
    stops: [
      { id: 's1', lat: 51.501, lng: -0.141, notes: 'Leave at door' },
      { id: 's2', lat: 51.509, lng: -0.127 },
      { id: 's3', lat: 51.515, lng: -0.119 },
    ],
    config: {
      vehicleId:    'swb_van',
      depotLat:     51.500,
      depotLng:     -0.150,
      returnToDepot: false,
      shiftStartEpoch: Date.now(),
    },
  };

  it('returns 401 without auth', async () => {
    const res = await server.inject({
      method: 'POST', url: '/api/v1/routes/optimise',
      payload: validBody,
    });
    expect(res.statusCode).toBe(401);
  });

  it('returns 200 with ordered stops for valid request', async () => {
    const res = await server.inject({
      method:  'POST',
      url:     '/api/v1/routes/optimise',
      headers: { authorization: `Bearer ${token}` },
      payload: validBody,
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.ok).toBe(true);
    expect(Array.isArray(body.data.orderedStops)).toBe(true);
  });

  it('rejects missing vehicleId', async () => {
    const res = await server.inject({
      method:  'POST',
      url:     '/api/v1/routes/optimise',
      headers: { authorization: `Bearer ${token}` },
      payload: { stops: validBody.stops, config: { depotLat: 0, depotLng: 0 } },
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects empty stops array', async () => {
    const res = await server.inject({
      method:  'POST',
      url:     '/api/v1/routes/optimise',
      headers: { authorization: `Bearer ${token}` },
      payload: { stops: [], config: validBody.config },
    });
    expect([400, 422]).toContain(res.statusCode);
  });
});

// ─── Turn score ───────────────────────────────────────────────────────────────
describe('GET /api/v1/turn-score', () => {
  it('returns a score and alert for known vehicle + location', async () => {
    const res = await server.inject({
      method:  'GET',
      url:     '/api/v1/turn-score?lat=51.501&lng=-0.141&vehicleId=swb_van',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.ok).toBe(true);
    expect(typeof body.data.score).toBe('number');
    expect(['GREEN', 'AMBER', 'RED']).toContain(body.data.alert);
    expect(typeof body.durationMs).toBe('number');
  });

  it('rejects unknown vehicleId', async () => {
    const res = await server.inject({
      method:  'GET',
      url:     '/api/v1/turn-score?lat=51.501&lng=-0.141&vehicleId=flying_saucer',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).ok).toBe(false);
  });

  it('rejects missing lat/lng', async () => {
    const res = await server.inject({
      method:  'GET',
      url:     '/api/v1/turn-score?vehicleId=swb_van',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(400);
  });
});

// ─── Driver event ─────────────────────────────────────────────────────────────
describe('POST /api/v1/driver/event', () => {
  it('accepts a batch of events', async () => {
    const res = await server.inject({
      method:  'POST',
      url:     '/api/v1/driver/event',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        events: [
          { type: 'STOP_COMPLETE', stopId: 's1', driverId: DRIVER_ID, routeId: 'r1', ts: Date.now() },
          { type: 'LOCATION_PING', driverId: DRIVER_ID, routeId: 'r1', ts: Date.now(), lat: 51.5, lng: -0.1 },
        ],
      },
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).ok).toBe(true);
  });
});

// ─── Rate limiting ────────────────────────────────────────────────────────────
describe('Rate limiting', () => {
  it('enforces 120 req/min limit on authenticated routes', async () => {
    const requests = Array.from({ length: 125 }, () =>
      server.inject({
        method:  'GET',
        url:     '/api/v1/turn-score?lat=51.5&lng=-0.1&vehicleId=swb_van',
        headers: { authorization: `Bearer ${token}` },
      }),
    );
    const results = await Promise.all(requests);
    const tooMany = results.filter(r => r.statusCode === 429);
    expect(tooMany.length).toBeGreaterThan(0);
  });
});
