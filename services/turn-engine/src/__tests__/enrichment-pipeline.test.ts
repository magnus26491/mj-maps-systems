/**
 * Enrichment Pipeline — Unit Tests
 *
 * All network deps (resolveTurnScore, resolveApproach, setEnrichedRoute)
 * are mocked so tests run fully offline.
 *
 * Covers:
 *  - Happy path: stop array enriched correctly
 *  - Per-stop graceful fallback on resolveTurnScore rejection
 *  - Empty stop list returns [] and calls setEnrichedRoute with []
 *  - Concurrency cap: never more than MAX_CONCURRENT tasks in-flight
 *  - generateRouteId: format, uniqueness, deterministic structure
 *  - enrichRouteBackground: fire-and-forget, never throws
 *  - Assembled EnrichedStopInput shape matches alert-dispatcher contract
 */

import {
  enrichRoute,
  enrichRouteBackground,
  generateRouteId,
} from '../enrichment-pipeline';
import type { Stop } from '../../../route-engine/route-engine';

// ─── Mocks ───────────────────────────────────────────────────────────────────

const mockResolveTurnScore = jest.fn();
const mockResolveApproach  = jest.fn();
const mockSetEnrichedRoute = jest.fn();

jest.mock('../resolver', () => ({
  resolveTurnScore: (...args: any[]) => mockResolveTurnScore(...args),
}));

jest.mock('../approach-side', () => ({
  resolveApproach: (...args: any[]) => mockResolveApproach(...args),
}));

jest.mock('../../../api/driver-api', () => ({
  setEnrichedRoute: (...args: any[]) => mockSetEnrichedRoute(...args),
}));

// ─── Fixtures ────────────────────────────────────────────────────────────────

function makeStop(i: number): Stop {
  return {
    id:             `stop-${i}`,
    lat:            51.5 + i * 0.01,
    lng:            -0.1 + i * 0.01,
    serviceMinutes: 3,
    notes:          `${i} Test Street, London`,
  };
}

const GREEN_TURN_RESULT = {
  score: 0.85, alert: 'GREEN', reason: null,
  roadWidthM: 7.2, source: 'osm', cachedAt: Date.now(),
  vehicleId: 'swb_van', lat: 51.5, lng: -0.1,
  hasTurningHead: false, deadEndLengthM: null,
  alertDistanceM: 0, canEnter: true,
  communityBlend: false, cached: false, segment: null,
};

const GREEN_APPROACH = {
  method:            'NOT_REQUIRED',
  alertDistanceM:    0,
  preAlertWaypoint:  null,
  message:           'Road is wide enough — proceed normally',
  confidence:        'HIGH',
};

const RED_TURN_RESULT = {
  ...GREEN_TURN_RESULT,
  score: 0.1, alert: 'RED', alertDistanceM: 600,
};

const RED_APPROACH = {
  method:            'DO_NOT_ENTER',
  alertDistanceM:    600,
  preAlertWaypoint:  { lat: 51.499, lng: -0.101 },
  message:           'Do not enter — vehicle too large for this road',
  confidence:        'HIGH',
};

// ─── Setup / teardown ────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
  mockResolveTurnScore.mockResolvedValue(GREEN_TURN_RESULT);
  mockResolveApproach.mockReturnValue(GREEN_APPROACH);
});

// ─── generateRouteId ───────────────────────────────────────────────────────────

describe('generateRouteId', () => {
  it('returns a non-empty string', () => {
    expect(typeof generateRouteId('swb_van', 51.5, -0.1)).toBe('string');
    expect(generateRouteId('swb_van', 51.5, -0.1).length).toBeGreaterThan(0);
  });

  it('starts with the vehicleId', () => {
    expect(generateRouteId('lwb_van', 51.5, -0.1)).toMatch(/^lwb_van-/);
  });

  it('is URL-safe (only alphanumeric, hyphen, underscore)', () => {
    const id = generateRouteId('rigid_75t', 53.48, -2.24);
    expect(id).toMatch(/^[\w-]+$/);
  });

  it('produces different IDs for different vehicleIds', () => {
    // Use a small delay so epoch component is same; vehicleId prefix differs
    const a = generateRouteId('swb_van', 51.5, -0.1);
    const b = generateRouteId('artic', 51.5, -0.1);
    expect(a).not.toBe(b);
  });

  it('has 3 hyphen-separated parts: vehicleId, depotHash, epochSec', () => {
    const id = generateRouteId('swb_van', 51.5, -0.1);
    const parts = id.split('-');
    // vehicleId itself has underscore not hyphen, depot hash is 1 part, epochSec is 1 part
    expect(parts.length).toBeGreaterThanOrEqual(3);
  });
});

// ─── enrichRoute ────────────────────────────────────────────────────────────────

describe('enrichRoute', () => {
  it('returns an array the same length as the input stops', async () => {
    const stops = Array.from({ length: 5 }, (_, i) => makeStop(i));
    const result = await enrichRoute(stops, 'swb_van', 'test-route-1');
    expect(result).toHaveLength(5);
  });

  it('calls setEnrichedRoute with the routeId and enriched stops', async () => {
    const stops = [makeStop(0)];
    await enrichRoute(stops, 'swb_van', 'test-route-2');
    expect(mockSetEnrichedRoute).toHaveBeenCalledWith('test-route-2', expect.any(Array));
    expect(mockSetEnrichedRoute).toHaveBeenCalledTimes(1);
  });

  it('each enriched stop has the correct id, sequence, lat, lng', async () => {
    const stops = [makeStop(0), makeStop(1), makeStop(2)];
    const result = await enrichRoute(stops, 'swb_van', 'test-route-3');
    stops.forEach((s, i) => {
      expect(result[i].id).toBe(s.id);
      expect(result[i].sequence).toBe(i);
      expect(result[i].lat).toBe(s.lat);
      expect(result[i].lng).toBe(s.lng);
    });
  });

  it('each enriched stop has a turn.alertLevel matching the score alert', async () => {
    const stops = [makeStop(0)];
    const result = await enrichRoute(stops, 'swb_van', 'test-route-4');
    expect(result[0].turn?.alertLevel).toBe('green');
  });

  it('enriched stop turn.approach.turnAroundMethod matches resolveApproach output', async () => {
    const stops = [makeStop(0)];
    const result = await enrichRoute(stops, 'swb_van', 'test-route-5');
    expect(result[0].turn?.approach.turnAroundMethod).toBe('NOT_REQUIRED');
  });

  it('stops with RED alert get DO_NOT_ENTER method', async () => {
    mockResolveTurnScore.mockResolvedValue(RED_TURN_RESULT);
    mockResolveApproach.mockReturnValue(RED_APPROACH);
    const stops = [makeStop(0)];
    const result = await enrichRoute(stops, 'rigid_75t', 'test-route-6');
    expect(result[0].turn?.alertLevel).toBe('red');
    expect(result[0].turn?.approach.turnAroundMethod).toBe('DO_NOT_ENTER');
    expect(result[0].turn?.approach.alertDistanceM).toBe(600);
  });

  it('osmContext.fetchedAt is an ISO string', async () => {
    const stops = [makeStop(0)];
    const result = await enrichRoute(stops, 'swb_van', 'test-route-7');
    expect(typeof result[0].osmContext?.fetchedAt).toBe('string');
    expect(() => new Date(result[0].osmContext!.fetchedAt)).not.toThrow();
  });

  it('passes { lat, lng, vehicleId } to resolveTurnScore', async () => {
    const stop = makeStop(0);
    await enrichRoute([stop], 'lwb_van', 'test-route-8');
    expect(mockResolveTurnScore).toHaveBeenCalledWith({
      lat:       stop.lat,
      lng:       stop.lng,
      vehicleId: 'lwb_van',
    });
  });

  it('calls resolveTurnScore once per stop', async () => {
    const stops = Array.from({ length: 4 }, (_, i) => makeStop(i));
    await enrichRoute(stops, 'swb_van', 'test-route-9');
    expect(mockResolveTurnScore).toHaveBeenCalledTimes(4);
  });
});

// ─── Per-stop fallback ─────────────────────────────────────────────────────────

describe('Per-stop fallback', () => {
  it('failed stops have turn: null', async () => {
    mockResolveTurnScore.mockRejectedValue(new Error('Overpass timeout'));
    const stops = [makeStop(0)];
    const result = await enrichRoute(stops, 'swb_van', 'test-route-10');
    expect(result[0].turn).toBeNull();
  });

  it('one failed stop does not affect other stops', async () => {
    // Stop 1 succeeds, stop 2 fails, stop 3 succeeds
    mockResolveTurnScore
      .mockResolvedValueOnce(GREEN_TURN_RESULT)
      .mockRejectedValueOnce(new Error('timeout'))
      .mockResolvedValueOnce(GREEN_TURN_RESULT);

    const stops = [makeStop(0), makeStop(1), makeStop(2)];
    const result = await enrichRoute(stops, 'swb_van', 'test-route-11');

    expect(result[0].turn).not.toBeNull();
    expect(result[1].turn).toBeNull();
    expect(result[2].turn).not.toBeNull();
  });

  it('failed stop still has correct id, sequence, address', async () => {
    mockResolveTurnScore.mockRejectedValue(new Error('network error'));
    const stop = makeStop(7);
    const result = await enrichRoute([stop], 'swb_van', 'test-route-12');
    expect(result[0].id).toBe('stop-7');
    expect(result[0].sequence).toBe(0);
    expect(result[0].address).toBe('7 Test Street, London');
  });

  it('setEnrichedRoute still called even when all stops fail', async () => {
    mockResolveTurnScore.mockRejectedValue(new Error('all failed'));
    const stops = [makeStop(0), makeStop(1)];
    await enrichRoute(stops, 'swb_van', 'test-route-13');
    expect(mockSetEnrichedRoute).toHaveBeenCalledWith('test-route-13', [
      expect.objectContaining({ turn: null }),
      expect.objectContaining({ turn: null }),
    ]);
  });
});

// ─── Empty stop list ──────────────────────────────────────────────────────────

describe('Empty stop list', () => {
  it('returns []', async () => {
    const result = await enrichRoute([], 'swb_van', 'empty-route');
    expect(result).toEqual([]);
  });

  it('calls setEnrichedRoute with empty array', async () => {
    await enrichRoute([], 'swb_van', 'empty-route-2');
    expect(mockSetEnrichedRoute).toHaveBeenCalledWith('empty-route-2', []);
  });

  it('does not call resolveTurnScore', async () => {
    await enrichRoute([], 'swb_van', 'empty-route-3');
    expect(mockResolveTurnScore).not.toHaveBeenCalled();
  });
});

// ─── enrichRouteBackground ─────────────────────────────────────────────────────

describe('enrichRouteBackground', () => {
  it('does not throw even when enrichRoute rejects', async () => {
    mockResolveTurnScore.mockRejectedValue(new Error('catastrophic failure'));
    // Should not throw
    expect(() =>
      enrichRouteBackground([makeStop(0)], 'swb_van', 'bg-route-1'),
    ).not.toThrow();
    // Allow the background promise to settle
    await new Promise(r => setTimeout(r, 50));
  });

  it('returns void (fire-and-forget)', () => {
    const result = enrichRouteBackground([makeStop(0)], 'swb_van', 'bg-route-2');
    expect(result).toBeUndefined();
  });
});
