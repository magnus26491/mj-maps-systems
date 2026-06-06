/**
 * Route Engine — geo utility tests
 */

import { haversineM, bearingDeg, stopSide, buildDistanceMatrix } from '../src/geo';

describe('haversineM', () => {
  it('returns 0 for identical points', () => {
    expect(haversineM(51.5, -0.1, 51.5, -0.1)).toBe(0);
  });

  it('London to Paris is approximately 340km', () => {
    const d = haversineM(51.5074, -0.1278, 48.8566, 2.3522);
    expect(d).toBeGreaterThan(330_000);
    expect(d).toBeLessThan(360_000);
  });

  it('is symmetric', () => {
    const a = haversineM(51.5, -0.1, 51.6, -0.2);
    const b = haversineM(51.6, -0.2, 51.5, -0.1);
    expect(Math.abs(a - b)).toBeLessThan(1);
  });
});

describe('bearingDeg', () => {
  it('due North is 0 degrees', () => {
    const b = bearingDeg(51.0, -0.1, 52.0, -0.1);
    expect(b).toBeCloseTo(0, 0);
  });

  it('due East is ~90 degrees', () => {
    const b = bearingDeg(51.5, -1.0, 51.5, 0.0);
    expect(b).toBeGreaterThan(85);
    expect(b).toBeLessThan(95);
  });

  it('returns value in 0–360 range', () => {
    const b = bearingDeg(51.5, -0.1, 51.4, -0.2);
    expect(b).toBeGreaterThanOrEqual(0);
    expect(b).toBeLessThan(360);
  });
});

describe('stopSide', () => {
  it('northbound bearing → stop on L', () => {
    expect(stopSide(0)).toBe('L');
    expect(stopSide(90)).toBe('L');
    expect(stopSide(179)).toBe('L');
  });

  it('southbound bearing → stop on R', () => {
    expect(stopSide(180)).toBe('R');
    expect(stopSide(270)).toBe('R');
    expect(stopSide(359)).toBe('R');
  });
});

describe('buildDistanceMatrix', () => {
  const points = [
    { lat: 51.5, lng: -0.1 },
    { lat: 51.6, lng: -0.1 },
    { lat: 51.5, lng:  0.0 },
  ];

  it('diagonal is zero', () => {
    const m = buildDistanceMatrix(points);
    expect(m[0][0]).toBe(0);
    expect(m[1][1]).toBe(0);
    expect(m[2][2]).toBe(0);
  });

  it('matrix is symmetric', () => {
    const m = buildDistanceMatrix(points);
    expect(Math.abs(m[0][1] - m[1][0])).toBeLessThan(1);
    expect(Math.abs(m[0][2] - m[2][0])).toBeLessThan(1);
  });

  it('size is N×N', () => {
    const m = buildDistanceMatrix(points);
    expect(m.length).toBe(3);
    expect(m[0].length).toBe(3);
  });
});
