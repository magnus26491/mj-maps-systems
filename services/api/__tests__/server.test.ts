/**
 * API integration tests — Fastify inject(), no real network
 */
import { server } from '../server';

afterAll(async () => server.close());

describe('GET /api/v1/health', () => {
  it('returns 200 ok', async () => {
    const res = await server.inject({ method: 'GET', url: '/api/v1/health' });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).status).toBe('ok');
  });
});

describe('POST /api/v1/auth/token', () => {
  it('issues JWT in dev mode', async () => {
    process.env.NODE_ENV = 'development';
    const res = await server.inject({
      method: 'POST', url: '/api/v1/auth/token',
      payload: { driverId: 'driver-001', secret: 'any' },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.ok).toBe(true);
    expect(typeof body.data.token).toBe('string');
  });

  it('returns 400 when driverId missing', async () => {
    const res = await server.inject({
      method: 'POST', url: '/api/v1/auth/token',
      payload: { secret: 'key' },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe('GET /api/v1/turn-score auth guard', () => {
  it('returns 401 without token', async () => {
    const res = await server.inject({
      method: 'GET',
      url: '/api/v1/turn-score?lat=51.5074&lng=-0.1278&vehicleId=van_swb',
    });
    expect(res.statusCode).toBe(401);
  });

  it('returns 400 for unknown vehicleId', async () => {
    const auth = await server.inject({
      method: 'POST', url: '/api/v1/auth/token',
      payload: { driverId: 'test', secret: 'test' },
    });
    const token = JSON.parse(auth.body).data.token;
    const res = await server.inject({
      method: 'GET',
      url: '/api/v1/turn-score?lat=51.5074&lng=-0.1278&vehicleId=spaceship',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toMatch(/Unknown vehicleId/);
  });
});

describe('Rate limiting', () => {
  it('returns 429 after 121 rapid requests', async () => {
    const requests = Array.from({ length: 121 }, () =>
      server.inject({ method: 'GET', url: '/api/v1/health' }),
    );
    const responses = await Promise.all(requests);
    expect(responses.some(r => r.statusCode === 429)).toBe(true);
  }, 15_000);
});
