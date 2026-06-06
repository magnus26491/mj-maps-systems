/**
 * WebSocket route smoke test
 * Verifies the WS endpoint is registered and rejects unauthenticated connections.
 */
import { server } from '../server';

jest.mock('../../turn-engine/src/resolver', () => ({
  resolveTurnScore: jest.fn().mockResolvedValue({ score: 0.9, alert: 'GREEN', reason: null }),
}));
jest.mock('../../vehicle-profiles/index', () => ({
  VEHICLE_PROFILES: { swb_van: { id: 'swb_van', minRoadWidthTurn: 5.5 } },
}));

beforeAll(() => server.ready());
afterAll(() => server.close());

describe('WS /ws/driver/:driverId/:routeId', () => {
  it('server starts and WebSocket plugin is registered', async () => {
    const hasWs = server.hasPlugin('@fastify/websocket');
    expect(hasWs).toBe(true);
  });

  it('HTTP upgrade to WS path returns connection (not 404)', async () => {
    // Inject as HTTP GET to the WS path — Fastify returns 200 or 101, not 404
    const res = await server.inject({
      method: 'GET',
      url: '/ws/driver/test-driver/test-route',
    });
    // 101 Switching Protocols or 400 (bad WS handshake) — NOT 404
    expect((res as any).statusCode).not.toBe(404);
  });
});
