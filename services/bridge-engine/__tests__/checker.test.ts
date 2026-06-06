/**
 * Bridge Engine — checker unit tests
 * Pure function — no network calls.
 */
import { checkRestrictions } from '../src/checker';
import type { RoadRestriction } from '../src/types';
import type { VehicleProfile } from '../../turn-engine/src/types';

const luton: VehicleProfile = {
  id: 'luton', label: 'Luton Van',
  lengthM: 6.5, widthM: 2.3, heightM: 3.2, weightT: 3.5,
  minRoadWidthTurn: 7.5, turningCircleM: 14.5, minReverseDepthM: 8.0,
};

const hgv: VehicleProfile = {
  id: 'hgv_75t', label: '7.5t HGV',
  lengthM: 8.5, widthM: 2.5, heightM: 3.7, weightT: 7.5,
  minRoadWidthTurn: 10.0, turningCircleM: 18.0, minReverseDepthM: 12.0,
};

const lowBridge: RoadRestriction = {
  wayId: 1001, lat: 51.5, lng: -0.1,
  type: 'BRIDGE', severity: 'WARNING',
  value: 3.0,
  description: 'Max height: 3.0m',
  driverVerified: true, source: 'osm',
};

const weightBridge: RoadRestriction = {
  wayId: 1002, lat: 51.51, lng: -0.11,
  type: 'WEIGHT', severity: 'WARNING',
  value: 3.5,
  description: 'Max weight: 3.5t',
  driverVerified: false, source: 'osm',
};

const narrowGate: RoadRestriction = {
  wayId: 1003, lat: 51.52, lng: -0.12,
  type: 'WIDTH', severity: 'WARNING',
  value: 2.1,
  description: 'Max width: 2.1m',
  driverVerified: false, source: 'driver_reported',
};

const privateRoad: RoadRestriction = {
  wayId: 1004, lat: 51.53, lng: -0.13,
  type: 'PRIVATE', severity: 'WARNING',
  value: null,
  description: 'Private road',
  driverVerified: false, source: 'osm',
};

describe('checkRestrictions — Luton Van', () => {
  it('clears when no restrictions', () => {
    const result = checkRestrictions([], luton);
    expect(result.clear).toBe(true);
    expect(result.blockers).toHaveLength(0);
  });

  it('BLOCKED by bridge lower than vehicle height (3.0m < 3.2m)', () => {
    const result = checkRestrictions([lowBridge], luton);
    expect(result.clear).toBe(false);
    expect(result.blockers).toHaveLength(1);
    expect(result.blockers[0].type).toBe('BRIDGE');
    expect(result.alternativeHint).toContain('Bridge height');
  });

  it('BLOCKED by weight limit equal to vehicle weight (3.5t = 3.5t — not strictly less)', () => {
    // Equal weight is INFO not BLOCKED (restriction.value < vehicle.weightT must be true)
    const result = checkRestrictions([weightBridge], luton);
    // 3.5 < 3.5 is false — should be INFO, not blocked
    expect(result.clear).toBe(true);
  });

  it('BLOCKED by width restriction (2.1m < 2.3m)', () => {
    const result = checkRestrictions([narrowGate], luton);
    expect(result.clear).toBe(false);
    expect(result.blockers[0].type).toBe('WIDTH');
    expect(result.alternativeHint).toContain('Width restriction');
  });

  it('private road is WARNING not BLOCKED', () => {
    const result = checkRestrictions([privateRoad], luton);
    expect(result.clear).toBe(true); // not blocked
    expect(result.warnings).toHaveLength(1);
  });
});

describe('checkRestrictions — 7.5t HGV', () => {
  it('BLOCKED by 3.0m bridge (3.0m < 3.7m)', () => {
    const result = checkRestrictions([lowBridge], hgv);
    expect(result.clear).toBe(false);
    expect(result.blockers[0].type).toBe('BRIDGE');
  });

  it('BLOCKED by 3.5t weight limit (3.5t < 7.5t)', () => {
    const result = checkRestrictions([weightBridge], hgv);
    expect(result.clear).toBe(false);
    expect(result.blockers[0].type).toBe('WEIGHT');
    expect(result.alternativeHint).toContain('Weight restriction');
  });

  it('multiple restrictions — all blockers captured', () => {
    const result = checkRestrictions([lowBridge, weightBridge, narrowGate], hgv);
    expect(result.clear).toBe(false);
    expect(result.blockers.length).toBeGreaterThanOrEqual(2);
  });

  it('clear on wide road with no restrictions', () => {
    const result = checkRestrictions([], hgv);
    expect(result.clear).toBe(true);
    expect(result.alternativeHint).toBeNull();
  });
});
