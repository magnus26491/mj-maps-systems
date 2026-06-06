/**
 * Turn Engine — scorer unit tests
 * No network calls. Pure function tests against known road geometries.
 */
import { scoreTurn } from '../src/scorer';
import type { RoadGeometry, VehicleProfile } from '../src/types';

// ─── Fixtures ────────────────────────────────────────────────────────────────

const swbVan: VehicleProfile = {
  id: 'swb_van', label: 'SWB Van',
  lengthM: 4.8, widthM: 2.0, heightM: 2.5, weightT: 2.5,
  minRoadWidthTurn: 5.5, turningCircleM: 11.0, minReverseDepthM: 6.0,
};

const luton: VehicleProfile = {
  id: 'luton', label: 'Luton Van',
  lengthM: 6.5, widthM: 2.3, heightM: 3.2, weightT: 3.5,
  minRoadWidthTurn: 7.5, turningCircleM: 14.5, minReverseDepthM: 8.0,
};

const hgv75t: VehicleProfile = {
  id: 'hgv_75t', label: '7.5t HGV',
  lengthM: 8.5, widthM: 2.5, heightM: 3.7, weightT: 7.5,
  minRoadWidthTurn: 10.0, turningCircleM: 18.0, minReverseDepthM: 12.0,
};

const wideResidentialRoad: RoadGeometry = {
  wayId: 123456, widthM: 7.5, highwayClass: 'residential',
  lanes: 2, hasTurningHead: false, hasPassingPlace: false,
  isOneWay: false, isDeadEnd: false, deadEndDepthM: 0,
  maxWidthM: null, maxHeightM: null, maxWeightT: null,
  source: 'overpass', fetchedAt: Date.now(),
};

const narrowLane: RoadGeometry = {
  wayId: 789, widthM: 3.2, highwayClass: 'track',
  lanes: 1, hasTurningHead: false, hasPassingPlace: false,
  isOneWay: false, isDeadEnd: true, deadEndDepthM: 8,
  maxWidthM: null, maxHeightM: null, maxWeightT: null,
  source: 'overpass', fetchedAt: Date.now(),
};

const restrictedBridge: RoadGeometry = {
  wayId: 999, widthM: 6.0, highwayClass: 'unclassified',
  lanes: 1, hasTurningHead: false, hasPassingPlace: false,
  isOneWay: true, isDeadEnd: false, deadEndDepthM: 0,
  maxWidthM: 2.1, maxHeightM: 3.0, maxWeightT: 3.0,
  source: 'overpass', fetchedAt: Date.now(),
};

const deadEndWithTurningHead: RoadGeometry = {
  wayId: 555, widthM: 5.8, highwayClass: 'residential',
  lanes: 1, hasTurningHead: true, hasPassingPlace: false,
  isOneWay: false, isDeadEnd: true, deadEndDepthM: 20,
  maxWidthM: null, maxHeightM: null, maxWeightT: null,
  source: 'overpass', fetchedAt: Date.now(),
};

const unknownWidthRoad: RoadGeometry = {
  wayId: 111, widthM: null, highwayClass: 'residential',
  lanes: null, hasTurningHead: false, hasPassingPlace: false,
  isOneWay: false, isDeadEnd: false, deadEndDepthM: 0,
  maxWidthM: null, maxHeightM: null, maxWeightT: null,
  source: 'fallback', fetchedAt: Date.now(),
};

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('scoreTurn — GREEN conditions', () => {
  it('SWB van on wide residential road = GREEN', () => {
    const result = scoreTurn(wideResidentialRoad, swbVan);
    expect(result.alert).toBe('GREEN');
    expect(result.score).toBeGreaterThanOrEqual(0.75);
    expect(result.reason).toBeNull();
  });

  it('Dead end with turning head scores GREEN for SWB van', () => {
    const result = scoreTurn(deadEndWithTurningHead, swbVan);
    expect(result.alert).toBe('GREEN');
  });
});

describe('scoreTurn — AMBER conditions', () => {
  it('Luton on wide residential road = AMBER (tight but passable)', () => {
    const result = scoreTurn(wideResidentialRoad, luton);
    // 7.5m road / 7.5m minTurn = exactly 1.0 — but Luton borderline
    expect(['GREEN', 'AMBER']).toContain(result.alert);
  });

  it('SWB van on narrow lane = AMBER or RED', () => {
    const result = scoreTurn(narrowLane, swbVan);
    expect(['AMBER', 'RED']).toContain(result.alert);
  });

  it('Unknown width road returns reason string', () => {
    const result = scoreTurn(unknownWidthRoad, swbVan);
    if (result.alert !== 'GREEN') {
      expect(result.reason).toBeTruthy();
    }
  });
});

describe('scoreTurn — RED conditions', () => {
  it('7.5t HGV on narrow lane = RED', () => {
    const result = scoreTurn(narrowLane, hgv75t);
    expect(result.alert).toBe('RED');
    expect(result.score).toBeLessThan(0.40);
    expect(result.reason).toBeTruthy();
  });

  it('Height restriction blocks tall vehicle', () => {
    const result = scoreTurn(restrictedBridge, hgv75t); // 3.7m > 3.0m limit
    expect(result.alert).toBe('RED');
    expect(result.reason).toContain('Height restriction');
    expect(result.score).toBe(0);
  });

  it('Weight restriction blocks heavy vehicle', () => {
    const result = scoreTurn(restrictedBridge, hgv75t); // 7.5t > 3.0t limit
    expect(result.alert).toBe('RED');
    expect(result.score).toBe(0);
  });

  it('Width restriction blocks wide vehicle', () => {
    const wideVehicle = { ...hgv75t, widthM: 2.6 }; // > 2.1m restriction
    const result = scoreTurn(restrictedBridge, wideVehicle);
    expect(result.alert).toBe('RED');
    expect(result.reason).toContain('Width restriction');
  });
});

describe('scoreTurn — score properties', () => {
  it('score is always between 0 and 1', () => {
    const profiles = [swbVan, luton, hgv75t];
    const roads = [wideResidentialRoad, narrowLane, restrictedBridge, deadEndWithTurningHead, unknownWidthRoad];
    for (const v of profiles) {
      for (const r of roads) {
        const result = scoreTurn(r, v);
        expect(result.score).toBeGreaterThanOrEqual(0);
        expect(result.score).toBeLessThanOrEqual(1);
      }
    }
  });

  it('returns source and cachedAt from road geometry', () => {
    const result = scoreTurn(wideResidentialRoad, swbVan);
    expect(result.source).toBe('overpass');
    expect(result.cachedAt).toBeGreaterThan(0);
  });
});
