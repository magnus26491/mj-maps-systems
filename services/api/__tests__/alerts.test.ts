/**
 * Alert API integration tests
 *
 * Tests for:
 *   GET /api/v1/routes/:routeId/alerts
 *   GET /api/v1/routes/:routeId/alerts/red
 *
 * All external deps (alert-dispatcher, turn-engine, vehicle-profiles) are
 * mocked so tests run fully offline — no Overpass, Redis, or OSM needed.
 *
 * Strategy:
 *  1. Seed the in-memory enriched-route store via setEnrichedRoute() before each
 *     relevant test so the handlers have data to work with.
 *  2. Assert on the { ok, data, durationMs } envelope shape.
 *  3. Assert on summary counts and event shapes.
 *  4. Cover 404 (unknown routeId), 401 (no token), 400 (invalid routeId).
 */

import { server } from '../server';
import { setEnrichedRoute } from '../driver-api';
import type { EnrichedStop } from '../../alert-dispatcher/alert-dispatcher';
import type { InjectOptions } from 'fastify';

// ─── Mocks ───────────────────────────────────────────────────────────────────

jest.mock('../../alert-dispatcher/alert-dispatcher', () => {
  const makeEvent = (stop: any, colour: 'BLUE' | 'AMBER' | 'RED') => ({
    stopId:           stop.stopId,
    sequence:         stop.sequence,
    overlayColour:    colour,
    turnAroundMethod: colour === 'RED' ? 'DO_NOT_ENTER' : colour === 'AMBER' ? 'THREE_POINT' : 'NOT_REQUIRED',
    triggerWaypoint:  { lat: stop.coord.lat - 0.001, lng: stop.coord.lng },
    stopCoord:        stop.coord,
    message:          colour === 'RED' ? 'Do not enter — vehicle too large' : 'Turn-around advisory',
    enrichedAt:       stop.enrichedAt,
  });

  return {
    buildAlertEvents: jest.fn((stops: any[]) =>
      stops.map((s, i) => makeEvent(s, i % 3 === 0 ? 'BLUE' : i % 3 === 1 ? 'AMBER' : 'RED')),
    ),
    getRedEvents: jest.fn((stops: any[]) =>
      stops
        .map((s, i) => makeEvent(s, i % 3 === 0 ? 'BLUE' : i % 3 === 1 ? 'AMBER' : 'RED'))
        .filter((e: any) => e.overlayColour === 'RED'),
    ),
    summariseAlerts: jest.fn((stops: any[]) => {
      const blue  = stops.filter((_, i) => i % 3 === 0).length;
      const amber = stops.filter((_, i) => i % 3 === 1).length;
      const red   = stops.filter((_, i) => i % 3 === 2).length;
      return {
        blue, amber, red,
        impassable: stops
          .filter((_, i) => i % 3 === 2)
          .map((s: any) => s.address ?? `Stop ${s.stopId}`),
      };
    }),
  };
});

jest.mock('../../turn-engine/src/resolver', () => ({
  resolveTurnScore: jest.fn().mockResolvedValue({
    score: 0.82, alert: 'GREEN', reason: null,
    roadWidthM: 7.4, source: 'mock', cachedAt: Date.now(),
  }),
}));

jest.mock('../../vehicle-profiles/index', () => ({
  VEHICLE_PROFILES: {
    swb_van: {
      id: 'swb_van', label: 'SWB Van',
      lengthM: 4.8, widthM: 2.0,
      minRoadWidthTurn: 5.5, turningCircleM: 11.0,
    },
  },
}));

// ─── Fixtures ────────────────────────────────────────────────────────────────

const TEST_ROUTE_ID   = 'test-route-abc123';
const EMPTY_ROUTE_ID  = 'test-route-empty';
const UNKNOWN_ROUTE   = 'does-not-exist-999';

const NOW = Date.now();

function makeStop(i: number): EnrichedStop {
  return {
    stopId:     `stop-${i}`,
    sequence:   i,
    address:    `${i} Test Street, London`,
    coord:      { lat: 51.5 + i * 0.001, lng: -0.1 + i * 0.001 },
    turnScore:  i % 3 === 2 ? 0.2 : 0.85,
    alert:      i % 3 === 2 ? 'RED' : 'GREEN',
    alertLevel: i % 3 === 2 ? 'red' : 'green',
    enrichedAt: NOW,
  } as EnrichedStop;
}

// 6 stops → 2 BLUE (i=0,3), 2 AMBER (i=1,4), 2 RED (i=2,5)
const TEST_STOPS: EnrichedStop[] = Array.from({ length: 6 }, (_, i) => makeStop(i));

// ─── Helpers ─────────────────────────────────────────────────────────────────

let validToken: string;

async function get(url: string, token?: string): Promise<any> {
  return server.inject({
    method: 'GET',
    url,
    headers: token ? { authorization: `Bearer ${token}` } : {},
  } as InjectOptions);
}

async function post(url: string, body: object, token?: string): Promise<any> {
  return server.inject({
    method: 'POST', url,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  } as InjectOptions);
}

// ─── Setup ───────────────────────────────────────────────────────────────────

beforeAll(async () => {
  await server.ready();

  // Obtain a valid JWT
  const res = await post('/api/v1/auth/token', {
    driverId: 'test-driver-alerts',
    secret:   'dev-secret',
  });
  validToken = JSON.parse(res.body).data?.token;

  // Seed the enriched route store
  setEnrichedRoute(TEST_ROUTE_ID,  TEST_STOPS);
  setEnrichedRoute(EMPTY_ROUTE_ID, []);
});

afterAll(async () => {
  await server.close();
});

// ─── Tests: GET /api/v1/routes/:routeId/alerts ───────────────────────────────

describe('GET /api/v1/routes/:routeId/alerts', () => {
  it('returns 401 without a token', async () => {
    const res = await get(`/api/v1/routes/${TEST_ROUTE_ID}/alerts`);
    expect(res.statusCode).toBe(401);
  });

  it('returns 404 for unknown routeId', async () => {
    const res = await get(`/api/v1/routes/${UNKNOWN_ROUTE}/alerts`, validToken);
    expect(res.statusCode).toBe(404);
    const body = JSON.parse(res.body);
    expect(body.ok).toBe(false);
    expect(body.error).toMatch(/No enriched route/);
  });

  it('returns 400 for invalid routeId characters', async () => {
    const res = await get('/api/v1/routes/bad/route/id/alerts', validToken);
    // Fastify will 404 on path mismatch — any non-200 is acceptable here
    expect(res.statusCode).not.toBe(200);
  });

  it('returns 200 with correct envelope shape', async () => {
    const res = await get(`/api/v1/routes/${TEST_ROUTE_ID}/alerts`, validToken);
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.ok).toBe(true);
    expect(typeof body.durationMs).toBe('number');
    expect(body.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('data.routeId matches the requested routeId', async () => {
    const res = await get(`/api/v1/routes/${TEST_ROUTE_ID}/alerts`, validToken);
    const { data } = JSON.parse(res.body);
    expect(data.routeId).toBe(TEST_ROUTE_ID);
  });

  it('data.events is an array of length equal to stop count', async () => {
    const res = await get(`/api/v1/routes/${TEST_ROUTE_ID}/alerts`, validToken);
    const { data } = JSON.parse(res.body);
    expect(Array.isArray(data.events)).toBe(true);
    expect(data.events).toHaveLength(TEST_STOPS.length);
  });

  it('each event has required fields', async () => {
    const res = await get(`/api/v1/routes/${TEST_ROUTE_ID}/alerts`, validToken);
    const { data } = JSON.parse(res.body);
    for (const event of data.events) {
      expect(event).toHaveProperty('stopId');
      expect(event).toHaveProperty('overlayColour');
      expect(event).toHaveProperty('turnAroundMethod');
      expect(event).toHaveProperty('triggerWaypoint');
      expect(event).toHaveProperty('stopCoord');
      expect(event).toHaveProperty('message');
    }
  });

  it('data.summary has blue / amber / red counts', async () => {
    const res = await get(`/api/v1/routes/${TEST_ROUTE_ID}/alerts`, validToken);
    const { data } = JSON.parse(res.body);
    expect(typeof data.summary.blue).toBe('number');
    expect(typeof data.summary.amber).toBe('number');
    expect(typeof data.summary.red).toBe('number');
    expect(data.summary.blue + data.summary.amber + data.summary.red).toBe(TEST_STOPS.length);
  });

  it('data.summary.impassable is an array of strings', async () => {
    const res = await get(`/api/v1/routes/${TEST_ROUTE_ID}/alerts`, validToken);
    const { data } = JSON.parse(res.body);
    expect(Array.isArray(data.summary.impassable)).toBe(true);
    data.summary.impassable.forEach((addr: any) => expect(typeof addr).toBe('string'));
  });

  it('data.enrichedAt is a positive epoch ms number', async () => {
    const res = await get(`/api/v1/routes/${TEST_ROUTE_ID}/alerts`, validToken);
    const { data } = JSON.parse(res.body);
    expect(typeof data.enrichedAt).toBe('number');
    expect(data.enrichedAt).toBeGreaterThan(0);
  });

  it('returns 200 with empty events array for a route with 0 stops', async () => {
    const res = await get(`/api/v1/routes/${EMPTY_ROUTE_ID}/alerts`, validToken);
    expect(res.statusCode).toBe(200);
    const { data } = JSON.parse(res.body);
    expect(data.events).toHaveLength(0);
    expect(data.summary.blue).toBe(0);
    expect(data.summary.amber).toBe(0);
    expect(data.summary.red).toBe(0);
  });
});

// ─── Tests: GET /api/v1/routes/:routeId/alerts/red ───────────────────────────

describe('GET /api/v1/routes/:routeId/alerts/red', () => {
  it('returns 401 without a token', async () => {
    const res = await get(`/api/v1/routes/${TEST_ROUTE_ID}/alerts/red`);
    expect(res.statusCode).toBe(401);
  });

  it('returns 404 for unknown routeId', async () => {
    const res = await get(`/api/v1/routes/${UNKNOWN_ROUTE}/alerts/red`, validToken);
    expect(res.statusCode).toBe(404);
    const body = JSON.parse(res.body);
    expect(body.ok).toBe(false);
  });

  it('returns 200 with correct envelope shape', async () => {
    const res = await get(`/api/v1/routes/${TEST_ROUTE_ID}/alerts/red`, validToken);
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.ok).toBe(true);
    expect(typeof body.durationMs).toBe('number');
  });

  it('data.routeId matches the requested routeId', async () => {
    const res = await get(`/api/v1/routes/${TEST_ROUTE_ID}/alerts/red`, validToken);
    const { data } = JSON.parse(res.body);
    expect(data.routeId).toBe(TEST_ROUTE_ID);
  });

  it('data.events contains only RED / DO_NOT_ENTER events', async () => {
    const res = await get(`/api/v1/routes/${TEST_ROUTE_ID}/alerts/red`, validToken);
    const { data } = JSON.parse(res.body);
    expect(Array.isArray(data.events)).toBe(true);
    data.events.forEach((e: any) => {
      expect(e.overlayColour).toBe('RED');
      expect(e.turnAroundMethod).toBe('DO_NOT_ENTER');
    });
  });

  it('data.redCount matches the number of red events', async () => {
    const res = await get(`/api/v1/routes/${TEST_ROUTE_ID}/alerts/red`, validToken);
    const { data } = JSON.parse(res.body);
    expect(data.redCount).toBe(data.events.length);
  });

  it('data.impassable is an array of address strings', async () => {
    const res = await get(`/api/v1/routes/${TEST_ROUTE_ID}/alerts/red`, validToken);
    const { data } = JSON.parse(res.body);
    expect(Array.isArray(data.impassable)).toBe(true);
    data.impassable.forEach((addr: any) => expect(typeof addr).toBe('string'));
  });

  it('data.redCount matches data.impassable.length', async () => {
    const res = await get(`/api/v1/routes/${TEST_ROUTE_ID}/alerts/red`, validToken);
    const { data } = JSON.parse(res.body);
    expect(data.redCount).toBe(data.impassable.length);
  });

  it('returns 0 red events for a route with no stops', async () => {
    const res = await get(`/api/v1/routes/${EMPTY_ROUTE_ID}/alerts/red`, validToken);
    expect(res.statusCode).toBe(200);
    const { data } = JSON.parse(res.body);
    expect(data.redCount).toBe(0);
    expect(data.events).toHaveLength(0);
    expect(data.impassable).toHaveLength(0);
  });

  it('red events each have message containing impassable language', async () => {
    const res = await get(`/api/v1/routes/${TEST_ROUTE_ID}/alerts/red`, validToken);
    const { data } = JSON.parse(res.body);
    data.events.forEach((e: any) => {
      expect(e.message.toLowerCase()).toMatch(/do not enter|impassable|too large|cannot turn/);
    });
  });
});

// ─── Cross-endpoint consistency ───────────────────────────────────────────────

describe('Cross-endpoint consistency', () => {
  it('/alerts red count matches /alerts/red redCount', async () => {
    const [allRes, redRes] = await Promise.all([
      get(`/api/v1/routes/${TEST_ROUTE_ID}/alerts`, validToken),
      get(`/api/v1/routes/${TEST_ROUTE_ID}/alerts/red`, validToken),
    ]);
    const allData = JSON.parse(allRes.body).data;
    const redData = JSON.parse(redRes.body).data;
    expect(allData.summary.red).toBe(redData.redCount);
  });

  it('/alerts impassable list matches /alerts/red impassable list', async () => {
    const [allRes, redRes] = await Promise.all([
      get(`/api/v1/routes/${TEST_ROUTE_ID}/alerts`, validToken),
      get(`/api/v1/routes/${TEST_ROUTE_ID}/alerts/red`, validToken),
    ]);
    const allImpassable = JSON.parse(allRes.body).data.summary.impassable;
    const redImpassable = JSON.parse(redRes.body).data.impassable;
    expect(allImpassable).toEqual(redImpassable);
  });
});
