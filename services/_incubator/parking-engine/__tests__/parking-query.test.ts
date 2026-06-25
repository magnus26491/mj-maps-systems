/**
 * Parking engine unit tests.
 *
 * The Overpass HTTP client is mocked so these tests run
 * without any network access.
 */

import * as overpassClient from '../../osm/overpass-client';
import { getParkingIntelligence } from '../parking-query';

// ─── MOCK OVERPASS ───────────────────────────────────────────────────────────

jest.mock('../../osm/overpass-client');
const mockRun = overpassClient.runOverpassQuery as jest.MockedFunction<typeof overpassClient.runOverpassQuery>;

function mockElements(elements: any[]) {
  mockRun.mockResolvedValueOnce({ elements });
}

// ─── TESTS ──────────────────────────────────────────────────────────────────

describe('getParkingIntelligence', () => {
  afterEach(() => jest.clearAllMocks());

  it('returns no nearest spot when no elements found', async () => {
    mockElements([]);
    const result = await getParkingIntelligence(51.5, -0.1);
    expect(result.nearest).toBeNull();
    expect(result.allSpots).toHaveLength(0);
  });

  it('detects a loading bay node', async () => {
    mockElements([{
      type: 'node', id: 1,
      lat: 51.5001, lon: -0.1001,
      tags: { amenity: 'loading_dock' },
    }]);
    const result = await getParkingIntelligence(51.5, -0.1);
    expect(result.nearest).not.toBeNull();
    expect(result.nearest!.restriction).toBe('LOADING_BAY');
    expect(result.nearest!.maxStopMinutes).toBe(40);
  });

  it('detects bus stop conflict', async () => {
    mockElements([{
      type: 'node', id: 2,
      lat: 51.5001, lon: -0.1001,
      tags: { highway: 'bus_stop' },
    }]);
    const result = await getParkingIntelligence(51.5, -0.1);
    expect(result.busStopConflict).toBe(true);
    // Bus stop itself should NOT appear in allSpots
    expect(result.allSpots.every(s => s.restriction !== 'BUS_STOP')).toBe(true);
  });

  it('detects clearway restriction', async () => {
    mockElements([{
      type: 'way', id: 3,
      center: { lat: 51.5002, lon: -0.1002 },
      tags: { restriction: 'no_stopping' },
    }]);
    const result = await getParkingIntelligence(51.5, -0.1);
    expect(result.nearest!.restriction).toBe('CLEARWAY');
    expect(result.nearest!.maxStopMinutes).toBe(0);
  });

  it('prefers loading bay over clearway when both present', async () => {
    mockElements([
      {
        type: 'way', id: 4,
        center: { lat: 51.5002, lon: -0.1002 },
        tags: { restriction: 'no_stopping' },
      },
      {
        type: 'node', id: 5,
        lat: 51.5003, lon: -0.1003,
        tags: { amenity: 'loading_dock' },
      },
    ]);
    const result = await getParkingIntelligence(51.5, -0.1);
    expect(result.nearest!.restriction).toBe('LOADING_BAY');
  });

  it('frontageClear is false when clearway is within 10m', async () => {
    // Place clearway very close to the stop coordinate
    mockElements([{
      type: 'node', id: 6,
      lat: 51.50001, lon: -0.10001, // ~1m away
      tags: { restriction: 'no_stopping' },
    }]);
    const result = await getParkingIntelligence(51.5, -0.1);
    expect(result.frontageClear).toBe(false);
  });

  it('advisory mentions loading bay label', async () => {
    mockElements([{
      type: 'node', id: 7,
      lat: 51.5002, lon: -0.1002,
      tags: { amenity: 'loading_dock' },
    }]);
    const result = await getParkingIntelligence(51.5, -0.1);
    expect(result.advisory.toLowerCase()).toContain('loading bay');
  });

  it('walk distance is greater than straight-line distance (walk factor)', async () => {
    mockElements([{
      type: 'node', id: 8,
      lat: 51.501, lon: -0.1,
      tags: { amenity: 'loading_dock' },
    }]);
    const result = await getParkingIntelligence(51.5, -0.1);
    if (result.nearest) {
      expect(result.nearest.walkDistanceM).toBeGreaterThanOrEqual(result.nearest.distanceToStopM);
    }
  });
});
