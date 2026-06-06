/**
 * Turn Engine — Resolver Unit Tests
 * All external dependencies (OSM fetch, Redis cache) are mocked.
 */

import { resolveTurnScore } from '../src/resolver';
import * as osmFetcher from '../src/osm-fetcher';
import * as cache from '../src/cache';
import type { OsmRoadSegment } from '../src/types';

// ─── MOCKS ───────────────────────────────────────────────────────────────────

jest.mock('../src/osm-fetcher');
jest.mock('../src/cache');

const mockFetch = osmFetcher.fetchNearestRoadSegment as jest.MockedFunction<typeof osmFetcher.fetchNearestRoadSegment>;
const mockGetCache = cache.getFromCache as jest.MockedFunction<typeof cache.getFromCache>;
const mockSetCache = cache.setInCache as jest.MockedFunction<typeof cache.setInCache>;

const londonStop = { lat: 51.5074, lng: -0.1278 };

const wideResidential: OsmRoadSegment = {
  osmWayId: 999,
  tags: { highway: 'residential', maxwidth: '6.0' },
  widthM: 6.0,
  maxHeightM: null,
  maxWeightT: null,
  hasTurningHead: false,
  isDeadEnd: false,
  lengthToEndM: 80,
  confidence: 'HIGH',
  lastEdited: null,
};

const narrowDeadEnd: OsmRoadSegment = {
  osmWayId: 998,
  tags: { highway: 'service', noexit: 'yes', maxwidth: '2.8' },
  widthM: 2.8,
  maxHeightM: null,
  maxWeightT: null,
  hasTurningHead: false,
  isDeadEnd: true,
  lengthToEndM: 12,    // < 20m → dead-end penalty
  confidence: 'HIGH',
  lastEdited: null,
};

const turningHeadRoad: OsmRoadSegment = {
  osmWayId: 997,
  tags: { highway: 'residential', maxwidth: '4.0', turning_circle: 'yes' },
  widthM: 4.0,
  maxHeightM: null,
  maxWeightT: null,
  hasTurningHead: true,
  isDeadEnd: false,
  lengthToEndM: 50,
  confidence: 'HIGH',
  lastEdited: null,
};

// ─── SETUP ───────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
  mockGetCache.mockResolvedValue(null);        // default: cache miss
  mockSetCache.mockResolvedValue(undefined);
});

// ─── TESTS ───────────────────────────────────────────────────────────────────

describe('resolveTurnScore()', () => {

  describe('GREEN alert — wide road, SWB van', () => {
    test('returns GREEN for 6.0m road (SWB needs 4.5m)', async () => {
      mockFetch.mockResolvedValue(wideResidential);
      const result = await resolveTurnScore(londonStop, 'van_swb');
      expect(result.alert).toBe('GREEN');
      expect(result.score).toBeGreaterThanOrEqual(0.75);
    });

    test('reason string mentions road width', async () => {
      mockFetch.mockResolvedValue(wideResidential);
      const result = await resolveTurnScore(londonStop, 'van_swb');
      expect(result.reason).toContain('6.0m');
    });

    test('alertDistanceM is 0 for GREEN', async () => {
      mockFetch.mockResolvedValue(wideResidential);
      const result = await resolveTurnScore(londonStop, 'van_swb');
      expect(result.alertDistanceM).toBe(0);
    });
  });

  describe('RED alert — narrow dead end, Luton', () => {
    test('returns RED for 2.8m dead-end road (Luton needs 5.8m)', async () => {
      mockFetch.mockResolvedValue(narrowDeadEnd);
      const result = await resolveTurnScore(londonStop, 'luton');
      expect(result.alert).toBe('RED');
    });

    test('alertDistanceM is 500 for RED', async () => {
      mockFetch.mockResolvedValue(narrowDeadEnd);
      const result = await resolveTurnScore(londonStop, 'luton');
      expect(result.alertDistanceM).toBe(500);
    });

    test('reason mentions dead end', async () => {
      mockFetch.mockResolvedValue(narrowDeadEnd);
      const result = await resolveTurnScore(londonStop, 'luton');
      expect(result.reason.toLowerCase()).toContain('dead end');
    });
  });

  describe('AMBER alert — turning head present', () => {
    test('4.0m road with turning head → AMBER for 7.5t HGV (needs 7.0m)', async () => {
      mockFetch.mockResolvedValue(turningHeadRoad);
      const result = await resolveTurnScore(londonStop, 'hgv_75t');
      expect(result.alert).toBe('AMBER');
      expect(result.alertDistanceM).toBe(300);
    });

    test('reason mentions turning head', async () => {
      mockFetch.mockResolvedValue(turningHeadRoad);
      const result = await resolveTurnScore(londonStop, 'hgv_75t');
      expect(result.reason.toLowerCase()).toContain('turning head');
    });
  });

  describe('Cache behaviour', () => {
    test('cache hit → returned immediately, OSM not called', async () => {
      const cachedResult = {
        vehicleProfileId: 'van_swb',
        location: londonStop,
        segment: wideResidential,
        score: 1.0,
        alert: 'GREEN' as const,
        alertDistanceM: 0,
        reason: 'Cached result',
        fromCache: true,
        computedAt: new Date().toISOString(),
      };
      mockGetCache.mockResolvedValue(cachedResult);
      const result = await resolveTurnScore(londonStop, 'van_swb');
      expect(result.fromCache).toBe(true);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    test('cache miss → OSM fetched and result cached', async () => {
      mockFetch.mockResolvedValue(wideResidential);
      await resolveTurnScore(londonStop, 'van_swb');
      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(mockSetCache).toHaveBeenCalledTimes(1);
    });

    test('fromCache is false on fresh computation', async () => {
      mockFetch.mockResolvedValue(wideResidential);
      const result = await resolveTurnScore(londonStop, 'van_swb');
      expect(result.fromCache).toBe(false);
    });
  });

  describe('OSM fallback — no road data', () => {
    test('null OSM result → AMBER fallback, reason warns driver', async () => {
      mockFetch.mockResolvedValue(null);
      const result = await resolveTurnScore(londonStop, 'van_swb');
      expect(result.alert).toBe('AMBER');
      expect(result.reason.toLowerCase()).toContain('no road data');
    });

    test('fallback score is 0.50', async () => {
      mockFetch.mockResolvedValue(null);
      const result = await resolveTurnScore(londonStop, 'van_swb');
      expect(result.score).toBe(0.50);
    });
  });

  describe('Invalid vehicle profile', () => {
    test('throws on unknown vehicleProfileId', async () => {
      await expect(resolveTurnScore(londonStop, 'flying_saucer')).rejects.toThrow(
        'Unknown vehicle profile: flying_saucer'
      );
    });
  });

  describe('Result shape', () => {
    test('result contains all required fields', async () => {
      mockFetch.mockResolvedValue(wideResidential);
      const result = await resolveTurnScore(londonStop, 'van_swb');
      expect(result).toHaveProperty('vehicleProfileId');
      expect(result).toHaveProperty('location');
      expect(result).toHaveProperty('segment');
      expect(result).toHaveProperty('score');
      expect(result).toHaveProperty('alert');
      expect(result).toHaveProperty('alertDistanceM');
      expect(result).toHaveProperty('reason');
      expect(result).toHaveProperty('fromCache');
      expect(result).toHaveProperty('computedAt');
    });

    test('computedAt is a valid ISO timestamp', async () => {
      mockFetch.mockResolvedValue(wideResidential);
      const result = await resolveTurnScore(londonStop, 'van_swb');
      expect(new Date(result.computedAt).toISOString()).toBe(result.computedAt);
    });
  });
});
