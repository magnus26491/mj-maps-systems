/**
 * Turn Engine — resolver integration test
 * Mocks the OSM getRoadGeometry call so no network required.
 */
import { resolveTurnScore } from '../src/resolver';

jest.mock('../../osm/src/index', () => ({
  getRoadGeometry: jest.fn().mockResolvedValue({
    wayId: 42,
    widthM: 7.5,
    highwayClass: 'residential',
    lanes: 2,
    hasTurningHead: false,
    hasPassingPlace: false,
    isOneWay: false,
    isDeadEnd: false,
    deadEndDepthM: 0,
    maxWidthM: null,
    maxHeightM: null,
    maxWeightT: null,
    source: 'mock',
    fetchedAt: Date.now(),
  }),
}));

jest.mock('../../../packages/vehicle-profiles/index', () => ({
  VEHICLE_PROFILES: {
    swb_van: {
      id: 'swb_van', label: 'SWB Van',
      lengthM: 4.8, widthM: 2.0, heightM: 2.5, weightT: 2.5,
      minRoadWidthTurn: 5.5, turningCircleM: 11.0, minReverseDepthM: 6.0,
    },
  },
}));

describe('resolveTurnScore', () => {
  it('resolves GREEN for SWB van on 7.5m road', async () => {
    const result = await resolveTurnScore({ lat: 51.5, lng: -0.1, vehicleId: 'swb_van' });
    expect(result.alert).toBe('GREEN');
    expect(result.score).toBeGreaterThanOrEqual(0.75);
    expect(result.roadWidthM).toBe(7.5);
  });

  it('throws for unknown vehicleId', async () => {
    await expect(
      resolveTurnScore({ lat: 51.5, lng: -0.1, vehicleId: 'flying_saucer' })
    ).rejects.toThrow('Unknown vehicleId: flying_saucer');
  });
});
