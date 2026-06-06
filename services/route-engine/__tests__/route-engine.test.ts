/**
 * Unit tests for route-engine.ts
 * All tests run without network — pure algorithmic validation.
 */

import {
  haversineKm,
  totalRouteDistanceKm,
  nearestNeighbourOrder,
  twoOpt,
  assignSectors,
  calculateBacktrackScore,
  checkTimeWindows,
  type Stop,
  type LatLng,
} from '../route-engine';

const depot: LatLng = { lat: 51.5074, lng: -0.1278 };

function makeStop(id: string, lat: number, lng: number, service = 3): Stop {
  return { id, lat, lng, serviceMinutes: service };
}

// ─── haversineKm ─────────────────────────────────────────────────────────────

describe('haversineKm', () => {
  it('returns 0 for identical points', () => {
    expect(haversineKm(depot, depot)).toBe(0);
  });

  it('London to Manchester is approximately 262km', () => {
    const manchester: LatLng = { lat: 53.4808, lng: -2.2426 };
    const d = haversineKm(depot, manchester);
    expect(d).toBeGreaterThan(255);
    expect(d).toBeLessThan(270);
  });

  it('is symmetric', () => {
    const a: LatLng = { lat: 51.0, lng: -0.1 };
    const b: LatLng = { lat: 51.5, lng: -0.5 };
    expect(haversineKm(a, b)).toBeCloseTo(haversineKm(b, a), 5);
  });
});

// ─── nearestNeighbourOrder ───────────────────────────────────────────────────

describe('nearestNeighbourOrder', () => {
  it('returns empty array for no stops', () => {
    expect(nearestNeighbourOrder([], depot)).toEqual([]);
  });

  it('returns all stops', () => {
    const stops = [
      makeStop('a', 51.51, -0.13),
      makeStop('b', 51.52, -0.14),
      makeStop('c', 51.50, -0.12),
    ];
    const result = nearestNeighbourOrder(stops, depot);
    expect(result).toHaveLength(3);
    expect(result.map(s => s.id).sort()).toEqual(['a', 'b', 'c']);
  });

  it('first stop is the nearest to depot', () => {
    const near: Stop = makeStop('near', 51.508, -0.128);
    const far:  Stop = makeStop('far',  51.600, -0.200);
    const result = nearestNeighbourOrder([far, near], depot);
    expect(result[0].id).toBe('near');
  });
});

// ─── twoOpt ──────────────────────────────────────────────────────────────────

describe('twoOpt', () => {
  it('does not increase total route distance', () => {
    const stops = [
      makeStop('a', 51.51, -0.10),
      makeStop('b', 51.53, -0.15),
      makeStop('c', 51.50, -0.20),
      makeStop('d', 51.52, -0.12),
    ];
    const before = totalRouteDistanceKm(stops, depot);
    const improved = twoOpt(stops, depot);
    const after = totalRouteDistanceKm(improved, depot);
    expect(after).toBeLessThanOrEqual(before + 0.001);
  });

  it('returns all stops', () => {
    const stops = [
      makeStop('a', 51.51, -0.10),
      makeStop('b', 51.53, -0.15),
      makeStop('c', 51.50, -0.20),
      makeStop('d', 51.52, -0.12),
    ];
    const result = twoOpt(stops, depot);
    expect(result).toHaveLength(stops.length);
  });
});

// ─── assignSectors ───────────────────────────────────────────────────────────

describe('assignSectors', () => {
  it('returns no empty sectors', () => {
    const stops = [
      makeStop('n', 51.60, -0.13),  // north
      makeStop('e', 51.51,  0.00),  // east
      makeStop('s', 51.40, -0.13),  // south
      makeStop('w', 51.51, -0.30),  // west
    ];
    const sectors = assignSectors(stops, depot);
    expect(sectors.every(s => s.length > 0)).toBe(true);
  });

  it('all stops appear in exactly one sector', () => {
    const stops = Array.from({ length: 20 }, (_, i) =>
      makeStop(`s${i}`, 51.4 + Math.random() * 0.3, -0.3 + Math.random() * 0.4)
    );
    const sectors = assignSectors(stops, depot);
    const allIds = sectors.flat().map(s => s.id).sort();
    const expected = stops.map(s => s.id).sort();
    expect(allIds).toEqual(expected);
  });
});

// ─── checkTimeWindows ────────────────────────────────────────────────────────

describe('checkTimeWindows', () => {
  const now = Math.floor(Date.now() / 1000);

  it('feasible when no time windows', () => {
    const stops = [makeStop('a', 51.51, -0.13), makeStop('b', 51.52, -0.14)];
    const result = checkTimeWindows(stops, depot, now);
    expect(result.feasible).toBe(true);
    expect(result.infeasibleStopIds).toHaveLength(0);
  });

  it('flags infeasible hard time window when route is too long', () => {
    const stops: Stop[] = [{
      id: 'tight',
      lat: 51.51,
      lng: -0.13,
      serviceMinutes: 3,
      timeWindow: {
        earliestEpoch: now,
        latestEpoch: now + 1, // 1 second — impossible
        isHard: true,
      },
    }];
    const result = checkTimeWindows(stops, depot, now);
    expect(result.feasible).toBe(false);
    expect(result.infeasibleStopIds).toContain('tight');
  });

  it('warns but stays feasible for soft window breach', () => {
    const stops: Stop[] = [{
      id: 'soft',
      lat: 51.51,
      lng: -0.13,
      serviceMinutes: 3,
      timeWindow: {
        earliestEpoch: now,
        latestEpoch: now + 1,
        isHard: false,
      },
    }];
    const result = checkTimeWindows(stops, depot, now);
    expect(result.feasible).toBe(true);
    expect(result.warnings.length).toBeGreaterThan(0);
  });
});

// ─── backtrackScore ──────────────────────────────────────────────────────────

describe('calculateBacktrackScore', () => {
  it('returns 0 for fewer than 3 stops', () => {
    const stops = [makeStop('a', 51.51, -0.13)];
    expect(calculateBacktrackScore(stops, depot)).toBe(0);
  });

  it('perfectly linear route has low backtrack score', () => {
    // Stops that go in a straight line north from depot
    const stops = [
      makeStop('a', 51.52, -0.128),
      makeStop('b', 51.54, -0.128),
      makeStop('c', 51.56, -0.128),
      makeStop('d', 51.58, -0.128),
    ];
    const score = calculateBacktrackScore(stops, depot);
    expect(score).toBeLessThan(0.3);
  });
});
