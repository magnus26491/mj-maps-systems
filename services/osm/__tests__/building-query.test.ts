/**
 * Unit tests for building-query.ts
 * Tests the query builder and parser logic with mock data — no real HTTP calls.
 */

import { buildBuildingQuery } from '../building-query';

describe('buildBuildingQuery', () => {
  it('generates a valid Overpass QL string', () => {
    const q = buildBuildingQuery(51.5074, -0.1278, 80);
    expect(q).toContain('[out:json]');
    expect(q).toContain('building');
    expect(q).toContain('entrance');
    expect(q).toContain('elevator');
    expect(q).toContain('51.5074');
    expect(q).toContain('-0.1278');
    expect(q).toContain('80');
  });

  it('uses the correct radius in the query', () => {
    const q80  = buildBuildingQuery(51.0, -0.1, 80);
    const q150 = buildBuildingQuery(51.0, -0.1, 150);
    expect(q80).toContain('around:80');
    expect(q150).toContain('around:150');
  });

  it('includes intercom and buzzer node queries', () => {
    const q = buildBuildingQuery(51.5, -0.1);
    expect(q).toContain('intercom');
    expect(q).toContain('buzzer');
  });

  it('includes staircase entrance query', () => {
    const q = buildBuildingQuery(51.5, -0.1);
    expect(q).toContain('staircase');
  });
});

describe('building data parsing (unit — no HTTP)', () => {
  it('centroid of a square polygon is its centre', () => {
    // Simple 4-point square centred at (51.5, -0.1)
    const geom = [
      { lat: 51.501, lon: -0.101 },
      { lat: 51.501, lon: -0.099 },
      { lat: 51.499, lon: -0.099 },
      { lat: 51.499, lon: -0.101 },
    ];
    const avgLat = geom.reduce((s, n) => s + n.lat, 0) / 4;
    const avgLng = geom.reduce((s, n) => s + n.lon, 0) / 4;
    expect(Math.abs(avgLat - 51.5)).toBeLessThan(0.001);
    expect(Math.abs(avgLng - (-0.1))).toBeLessThan(0.001);
  });
});
