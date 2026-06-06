/**
 * Route Engine — Route Planner Integration Tests
 * Both turn-engine resolver and OSM fetcher are mocked.
 * Tests the full planRoute() pipeline end-to-end.
 */

import { planRoute } from '../src/route-planner';
import * as turnEngine from '../../turn-engine/src/resolver';
import type { StopPoint } from '../src/types';
import type { TurnEngineResult, OsmRoadSegment } from '../../turn-engine/src/types';

jest.mock('../../turn-engine/src/resolver');
const mockResolve = turnEngine.resolveTurnScore as jest.MockedFunction<typeof turnEngine.resolveTurnScore>;

const depot = { lat: 51.5000, lng: -0.1000 };

function makeStop(id: string, lat: number, lng: number, overrides: Partial<StopPoint> = {}): StopPoint {
  return {
    id, label: `Stop ${id}`,
    location: { lat, lng },
    timeWindowStart: null, timeWindowEnd: null,
    dwellTimeS: 120, status: 'PENDING', notes: null, sequenceIndex: 0,
    ...overrides,
  };
}

const defaultSegment: OsmRoadSegment = {
  osmWayId: 1, tags: { highway: 'residential', maxwidth: '6.0' },
  widthM: 6.0, maxHeightM: null, maxWeightT: null,
  hasTurningHead: false, isDeadEnd: false,
  lengthToEndM: 80, confidence: 'HIGH', lastEdited: null,
};

function greenResult(location = depot): TurnEngineResult {
  return {
    vehicleProfileId: 'van_swb', location,
    segment: defaultSegment, score: 1.0, alert: 'GREEN',
    alertDistanceM: 0, reason: 'Safe', fromCache: false,
    computedAt: new Date().toISOString(),
  };
}

function redResult(location = depot): TurnEngineResult {
  return {
    ...greenResult(location),
    score: 0.2, alert: 'RED', alertDistanceM: 500,
    reason: 'Too narrow',
    segment: { ...defaultSegment, widthM: 2.5, isDeadEnd: true },
  };
}

beforeEach(() => jest.clearAllMocks());

describe('planRoute()', () => {

  describe('basic route assembly', () => {
    test('returns a PlannedRoute with correct stop count', async () => {
      mockResolve.mockResolvedValue(greenResult());
      const stops = [
        makeStop('A', 51.501, -0.101),
        makeStop('B', 51.502, -0.102),
        makeStop('C', 51.503, -0.103),
      ];
      const route = await planRoute(stops, 'van_swb', depot);
      expect(route.stops).toHaveLength(3);
    });

    test('route id is a non-empty string', async () => {
      mockResolve.mockResolvedValue(greenResult());
      const route = await planRoute([makeStop('A', 51.501, -0.101)], 'van_swb', depot);
      expect(typeof route.id).toBe('string');
      expect(route.id.length).toBeGreaterThan(0);
    });

    test('status is PLANNED', async () => {
      mockResolve.mockResolvedValue(greenResult());
      const route = await planRoute([makeStop('A', 51.501, -0.101)], 'van_swb', depot);
      expect(route.status).toBe('PLANNED');
    });

    test('createdAt is valid ISO timestamp', async () => {
      mockResolve.mockResolvedValue(greenResult());
      const route = await planRoute([makeStop('A', 51.501, -0.101)], 'van_swb', depot);
      expect(new Date(route.createdAt).toISOString()).toBe(route.createdAt);
    });

    test('totalDistanceM is positive for multi-stop route', async () => {
      mockResolve.mockResolvedValue(greenResult());
      const stops = [makeStop('A', 51.510, -0.110), makeStop('B', 51.520, -0.120)];
      const route = await planRoute(stops, 'van_swb', depot);
      expect(route.totalDistanceM).toBeGreaterThan(0);
    });

    test('totalDurationS includes dwell time', async () => {
      mockResolve.mockResolvedValue(greenResult());
      const stop = makeStop('A', 51.510, -0.110, { dwellTimeS: 300 });
      const route = await planRoute([stop], 'van_swb', depot);
      // At least 300s for dwell alone
      expect(route.totalDurationS).toBeGreaterThanOrEqual(300);
    });

    test('vehicleProfileId preserved on route', async () => {
      mockResolve.mockResolvedValue(greenResult());
      const route = await planRoute([makeStop('A', 51.501, -0.101)], 'hgv_75t', depot);
      expect(route.vehicleProfileId).toBe('hgv_75t');
    });
  });

  describe('RED stop handling', () => {
    test('redStopsRerouted count matches RED alerts', async () => {
      mockResolve
        .mockResolvedValueOnce(greenResult())
        .mockResolvedValueOnce(redResult())
        .mockResolvedValueOnce(redResult());

      const stops = [
        makeStop('A', 51.501, -0.101),
        makeStop('B', 51.502, -0.102),
        makeStop('C', 51.503, -0.103),
      ];
      const route = await planRoute(stops, 'van_swb', depot);
      expect(route.redStopsRerouted).toBe(2);
    });

    test('RED stops have alternate approach waypoint', async () => {
      mockResolve.mockResolvedValue(redResult());
      const route = await planRoute([makeStop('A', 51.510, -0.110)], 'van_swb', depot);
      const stop = route.stops[0];
      expect(stop.hasAlternateApproach).toBe(true);
      expect(stop.alternateApproachWaypoint).not.toBeNull();
    });

    test('GREEN stops have no alternate waypoint', async () => {
      mockResolve.mockResolvedValue(greenResult());
      const route = await planRoute([makeStop('A', 51.510, -0.110)], 'van_swb', depot);
      const stop = route.stops[0];
      expect(stop.hasAlternateApproach).toBe(false);
      expect(stop.alternateApproachWaypoint).toBeNull();
    });
  });

  describe('empty route', () => {
    test('zero stops → empty stops array, zero distance', async () => {
      const route = await planRoute([], 'van_swb', depot);
      expect(route.stops).toHaveLength(0);
      expect(route.totalDistanceM).toBe(0);
      expect(route.totalDurationS).toBe(0);
    });
  });

  describe('stop sequence indexes', () => {
    test('sequenceIndex is 0..n-1 in output', async () => {
      mockResolve.mockResolvedValue(greenResult());
      const stops = [
        makeStop('A', 51.510, -0.110),
        makeStop('B', 51.520, -0.120),
        makeStop('C', 51.530, -0.130),
      ];
      const route = await planRoute(stops, 'van_swb', depot);
      route.stops.forEach((s, i) => {
        expect(s.sequenceIndex).toBe(i);
      });
    });
  });
});
