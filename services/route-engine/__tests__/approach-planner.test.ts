/**
 * Route Engine — Approach Planner Unit Tests
 * resolveTurnScore (turn-engine) is mocked — no OSM or Redis calls.
 */

import { planStopApproach, planAllApproaches } from '../src/approach-planner';
import * as turnEngine from '../../turn-engine/src/resolver';
import type { StopPoint } from '../src/types';
import type { TurnEngineResult, OsmRoadSegment } from '../../turn-engine/src/types';

// ─── MOCKS ────────────────────────────────────────────────────────────────────

jest.mock('../../turn-engine/src/resolver');
const mockResolve = turnEngine.resolveTurnScore as jest.MockedFunction<typeof turnEngine.resolveTurnScore>;

// ─── FIXTURES ─────────────────────────────────────────────────────────────────

const depot   = { lat: 51.5000, lng: -0.1000 };
const stopLoc = { lat: 51.5100, lng: -0.1100 };

function makeStop(id: string, overrides: Partial<StopPoint> = {}): StopPoint {
  return {
    id,
    label: `Stop ${id}`,
    location: stopLoc,
    timeWindowStart: null,
    timeWindowEnd: null,
    dwellTimeS: 120,
    status: 'PENDING',
    notes: null,
    sequenceIndex: 0,
    ...overrides,
  };
}

const wideSegment: OsmRoadSegment = {
  osmWayId: 1,
  tags: { highway: 'residential', maxwidth: '6.0' },
  widthM: 6.0, maxHeightM: null, maxWeightT: null,
  hasTurningHead: false, isDeadEnd: false,
  lengthToEndM: 80, confidence: 'HIGH', lastEdited: null,
};

const turningHeadSegment: OsmRoadSegment = {
  ...wideSegment, osmWayId: 2,
  tags: { highway: 'residential', maxwidth: '4.0', turning_circle: 'yes' },
  widthM: 4.0, hasTurningHead: true,
};

const narrowDeadEndSegment: OsmRoadSegment = {
  ...wideSegment, osmWayId: 3,
  tags: { highway: 'service', noexit: 'yes', maxwidth: '2.5' },
  widthM: 2.5, hasTurningHead: false, isDeadEnd: true, lengthToEndM: 10,
};

const onewaySegment: OsmRoadSegment = {
  ...wideSegment, osmWayId: 4,
  tags: { highway: 'residential', oneway: 'yes', maxwidth: '5.0' },
  widthM: 5.0,
};

function makeTurnResult(alert: 'GREEN' | 'AMBER' | 'RED', segment: OsmRoadSegment): TurnEngineResult {
  return {
    vehicleProfileId: 'van_swb',
    location: stopLoc,
    segment,
    score: alert === 'GREEN' ? 1.0 : alert === 'AMBER' ? 0.55 : 0.25,
    alert,
    alertDistanceM: alert === 'GREEN' ? 0 : alert === 'AMBER' ? 300 : 500,
    reason: `Mock ${alert} result`,
    fromCache: false,
    computedAt: new Date().toISOString(),
  };
}

beforeEach(() => jest.clearAllMocks());

// ─── TESTS ────────────────────────────────────────────────────────────────────

describe('planStopApproach()', () => {

  describe('GREEN alert — wide road', () => {
    test('turnAroundMethod is NOT_REQUIRED', async () => {
      mockResolve.mockResolvedValue(makeTurnResult('GREEN', wideSegment));
      const result = await planStopApproach(makeStop('S1'), 'van_swb', depot);
      expect(result.turnAroundMethod).toBe('NOT_REQUIRED');
    });

    test('hasAlternateApproach is false', async () => {
      mockResolve.mockResolvedValue(makeTurnResult('GREEN', wideSegment));
      const result = await planStopApproach(makeStop('S1'), 'van_swb', depot);
      expect(result.hasAlternateApproach).toBe(false);
      expect(result.alternateApproachWaypoint).toBeNull();
    });

    test('alertDistanceM is 0', async () => {
      mockResolve.mockResolvedValue(makeTurnResult('GREEN', wideSegment));
      const result = await planStopApproach(makeStop('S1'), 'van_swb', depot);
      expect(result.alertDistanceM).toBe(0);
    });
  });

  describe('AMBER alert — turning head present', () => {
    test('turnAroundMethod is FORWARD_TURN', async () => {
      mockResolve.mockResolvedValue(makeTurnResult('AMBER', turningHeadSegment));
      const result = await planStopApproach(makeStop('S2'), 'van_swb', depot);
      expect(result.turnAroundMethod).toBe('FORWARD_TURN');
    });

    test('alertDistanceM is 300', async () => {
      mockResolve.mockResolvedValue(makeTurnResult('AMBER', turningHeadSegment));
      const result = await planStopApproach(makeStop('S2'), 'van_swb', depot);
      expect(result.alertDistanceM).toBe(300);
    });

    test('no alternate approach waypoint on AMBER', async () => {
      mockResolve.mockResolvedValue(makeTurnResult('AMBER', turningHeadSegment));
      const result = await planStopApproach(makeStop('S2'), 'van_swb', depot);
      expect(result.hasAlternateApproach).toBe(false);
      expect(result.alternateApproachWaypoint).toBeNull();
    });
  });

  describe('AMBER alert — no turning head', () => {
    const amberNoHead: OsmRoadSegment = { ...wideSegment, widthM: 4.0, hasTurningHead: false };
    test('turnAroundMethod is THREE_POINT', async () => {
      mockResolve.mockResolvedValue(makeTurnResult('AMBER', amberNoHead));
      const result = await planStopApproach(makeStop('S3'), 'van_swb', depot);
      expect(result.turnAroundMethod).toBe('THREE_POINT');
    });
  });

  describe('RED alert — narrow dead end', () => {
    test('turnAroundMethod is REVERSE_OUT', async () => {
      mockResolve.mockResolvedValue(makeTurnResult('RED', narrowDeadEndSegment));
      const result = await planStopApproach(makeStop('S4'), 'van_swb', depot);
      expect(result.turnAroundMethod).toBe('REVERSE_OUT');
    });

    test('hasAlternateApproach is true', async () => {
      mockResolve.mockResolvedValue(makeTurnResult('RED', narrowDeadEndSegment));
      const result = await planStopApproach(makeStop('S4'), 'van_swb', depot);
      expect(result.hasAlternateApproach).toBe(true);
    });

    test('alternateApproachWaypoint is not null and is a valid LatLng', async () => {
      mockResolve.mockResolvedValue(makeTurnResult('RED', narrowDeadEndSegment));
      const result = await planStopApproach(makeStop('S4'), 'van_swb', depot);
      expect(result.alternateApproachWaypoint).not.toBeNull();
      expect(result.alternateApproachWaypoint!.lat).toBeCloseTo(stopLoc.lat, 1);
      expect(typeof result.alternateApproachWaypoint!.lng).toBe('number');
    });

    test('alternate waypoint is offset from stop (not identical)', async () => {
      mockResolve.mockResolvedValue(makeTurnResult('RED', narrowDeadEndSegment));
      const result = await planStopApproach(makeStop('S4'), 'van_swb', depot);
      const wp = result.alternateApproachWaypoint!;
      expect(wp.lat === stopLoc.lat && wp.lng === stopLoc.lng).toBe(false);
    });

    test('alertDistanceM is 500 for RED', async () => {
      mockResolve.mockResolvedValue(makeTurnResult('RED', narrowDeadEndSegment));
      const result = await planStopApproach(makeStop('S4'), 'van_swb', depot);
      expect(result.alertDistanceM).toBe(500);
    });
  });

  describe('Approach side — UK left-hand traffic', () => {
    test('standard two-way road → LEFT', async () => {
      mockResolve.mockResolvedValue(makeTurnResult('GREEN', wideSegment));
      const result = await planStopApproach(makeStop('S5'), 'van_swb', depot);
      expect(result.approachSide).toBe('LEFT');
    });

    test('oneway road → LEFT', async () => {
      mockResolve.mockResolvedValue(makeTurnResult('GREEN', onewaySegment));
      const result = await planStopApproach(makeStop('S6'), 'van_swb', depot);
      expect(result.approachSide).toBe('LEFT');
    });

    test('no width data → EITHER', async () => {
      const noWidthSeg: OsmRoadSegment = { ...wideSegment, widthM: null, tags: {} };
      mockResolve.mockResolvedValue(makeTurnResult('GREEN', noWidthSeg));
      const result = await planStopApproach(makeStop('S7'), 'van_swb', depot);
      expect(result.approachSide).toBe('EITHER');
    });
  });

  describe('planAllApproaches()', () => {
    test('processes all stops and returns same count', async () => {
      mockResolve.mockResolvedValue(makeTurnResult('GREEN', wideSegment));
      const stops = [makeStop('A'), makeStop('B'), makeStop('C')];
      const results = await planAllApproaches(stops, 'van_swb', depot);
      expect(results).toHaveLength(3);
    });

    test('empty input → empty output', async () => {
      const results = await planAllApproaches([], 'van_swb', depot);
      expect(results).toHaveLength(0);
    });

    test('each result preserves original stop id', async () => {
      mockResolve.mockResolvedValue(makeTurnResult('GREEN', wideSegment));
      const stops = [makeStop('X1'), makeStop('X2')];
      const results = await planAllApproaches(stops, 'van_swb', depot);
      expect(results[0].id).toBe('X1');
      expect(results[1].id).toBe('X2');
    });
  });
});
