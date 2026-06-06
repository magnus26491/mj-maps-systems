import {
  VEHICLE_PROFILES,
  computeTurnScore,
  type RoadGeometry,
} from '../../../packages/vehicle-profiles/index';

const lwb = VEHICLE_PROFILES['lwb_van'];
const rigid75 = VEHICLE_PROFILES['rigid_75t'];
const artic = VEHICLE_PROFILES['artic_13_6m'];

const wideRoad: RoadGeometry = {
  roadWidthM: 9.0,
  turningHeadDiamM: 18,
  distanceToDeadEndM: 200,
  isDeadEnd: false,
  highwayClass: 'residential',
};

const narrowLane: RoadGeometry = {
  roadWidthM: 3.2,
  turningHeadDiamM: 0,
  distanceToDeadEndM: 15,
  isDeadEnd: true,
  highwayClass: 'track',
};

const heightRestricted: RoadGeometry = {
  roadWidthM: 8.0,
  turningHeadDiamM: 0,
  distanceToDeadEndM: 500,
  isDeadEnd: false,
  highwayClass: 'secondary',
  heightRestrictionM: 2.0,
};

describe('computeTurnScore', () => {
  it('returns GREEN for LWB van on wide residential road', () => {
    const r = computeTurnScore(lwb, wideRoad);
    expect(r.alert).toBe('GREEN');
    expect(r.canForwardTurn).toBe(true);
  });

  it('returns RED for LWB van on narrow dead-end track', () => {
    const r = computeTurnScore(lwb, narrowLane);
    expect(r.alert).toBe('RED');
    expect(r.mustNotEnter).toBe(true);
  });

  it('returns RED (mustNotEnter) for 7.5t on height-restricted road', () => {
    const r = computeTurnScore(rigid75, heightRestricted);
    expect(r.score).toBe(0);
    expect(r.mustNotEnter).toBe(true);
  });

  it('artic scores 0 on narrow lane', () => {
    const r = computeTurnScore(artic, narrowLane);
    expect(r.score).toBe(0);
  });

  it('community score blends 40% into final score', () => {
    const road: RoadGeometry = { ...wideRoad, communityScoreOverride: 0.1 };
    const r = computeTurnScore(lwb, road);
    // base from geometry would be >= 0.75 → 1.0 then blended with 0.1
    expect(r.score).toBeLessThan(1.0);
  });
});
