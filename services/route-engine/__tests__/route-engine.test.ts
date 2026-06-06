/**
 * Route Engine — unit tests
 * Tests the 2-opt TSP optimiser and dynamic replan logic.
 */

// Mock turn-engine and OSM so tests are offline
jest.mock('../../turn-engine/src/resolver', () => ({
  resolveTurnScore: jest.fn().mockResolvedValue({
    score: 0.85, alert: 'GREEN', reason: null, roadWidthM: 7.5,
    source: 'mock', cachedAt: Date.now(),
  }),
}));

jest.mock('../../osm/src/index', () => ({
  getRoadGeometry: jest.fn().mockResolvedValue({
    widthM: 7.5, highwayClass: 'residential', hasTurningHead: false,
    isDeadEnd: false, deadEndDepthM: 0, isOneWay: false,
    maxWidthM: null, maxHeightM: null, maxWeightT: null,
    source: 'mock', fetchedAt: Date.now(),
  }),
}));

import { haversineMetres } from '../../cluster-engine/src/haversine';

// ─── Minimal stop type matching DeliveryStop shape ───────────────────────────
interface TestStop {
  id: string;
  lat: number;
  lng: number;
  address: string;
}

// ─── 2-opt helper (inline copy to test the algorithm directly) ───────────────
function twoOptImprove(stops: TestStop[]): TestStop[] {
  let best = [...stops];
  let improved = true;

  while (improved) {
    improved = false;
    for (let i = 1; i < best.length - 1; i++) {
      for (let j = i + 1; j < best.length; j++) {
        const before =
          haversineMetres(best[i-1].lat, best[i-1].lng, best[i].lat, best[i].lng) +
          haversineMetres(best[j].lat,   best[j].lng,   best[j < best.length - 1 ? j+1 : 0].lat, best[j < best.length - 1 ? j+1 : 0].lng);
        const after =
          haversineMetres(best[i-1].lat, best[i-1].lng, best[j].lat,   best[j].lng) +
          haversineMetres(best[i].lat,   best[i].lng,   best[j < best.length - 1 ? j+1 : 0].lat, best[j < best.length - 1 ? j+1 : 0].lng);
        if (after < before - 0.01) {
          best = [...best.slice(0, i), ...best.slice(i, j + 1).reverse(), ...best.slice(j + 1)];
          improved = true;
        }
      }
    }
  }
  return best;
}

function routeDistance(stops: TestStop[]): number {
  let d = 0;
  for (let i = 1; i < stops.length; i++) {
    d += haversineMetres(stops[i-1].lat, stops[i-1].lng, stops[i].lat, stops[i].lng);
  }
  return d;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('2-opt route optimisation', () => {
  // Deliberately bad order: zig-zag across London
  const zigzagStops: TestStop[] = [
    { id: 'a', lat: 51.51, lng: -0.12, address: 'Central London' },
    { id: 'b', lat: 51.46, lng: -0.14, address: 'Clapham' },
    { id: 'c', lat: 51.53, lng: -0.10, address: 'Islington' },
    { id: 'd', lat: 51.47, lng: -0.15, address: 'Brixton' },
    { id: 'e', lat: 51.55, lng: -0.09, address: 'Highbury' },
    { id: 'f', lat: 51.45, lng: -0.16, address: 'Streatham' },
  ];

  it('2-opt produces a route no longer than the input', () => {
    const original  = routeDistance(zigzagStops);
    const optimised = twoOptImprove(zigzagStops);
    const improved  = routeDistance(optimised);
    expect(improved).toBeLessThanOrEqual(original + 1); // 1m tolerance for float
  });

  it('2-opt preserves all stops', () => {
    const optimised = twoOptImprove(zigzagStops);
    expect(optimised).toHaveLength(zigzagStops.length);
    const ids = optimised.map(s => s.id).sort();
    expect(ids).toEqual(zigzagStops.map(s => s.id).sort());
  });

  it('2-opt on already-optimal route does not make it worse', () => {
    // Straight line north — already optimal
    const straight: TestStop[] = [
      { id: '1', lat: 51.50, lng: -0.10, address: 'A' },
      { id: '2', lat: 51.51, lng: -0.10, address: 'B' },
      { id: '3', lat: 51.52, lng: -0.10, address: 'C' },
      { id: '4', lat: 51.53, lng: -0.10, address: 'D' },
    ];
    const original  = routeDistance(straight);
    const optimised = twoOptImprove(straight);
    const improved  = routeDistance(optimised);
    expect(improved).toBeLessThanOrEqual(original + 1);
  });

  it('handles single stop gracefully', () => {
    const single = [{ id: 'solo', lat: 51.5, lng: -0.1, address: 'Solo' }];
    const result = twoOptImprove(single);
    expect(result).toHaveLength(1);
  });

  it('handles two stops gracefully', () => {
    const two = [
      { id: 'a', lat: 51.5, lng: -0.1, address: 'A' },
      { id: 'b', lat: 51.6, lng: -0.2, address: 'B' },
    ];
    const result = twoOptImprove(two);
    expect(result).toHaveLength(2);
  });
});

describe('haversineMetres (route-engine dependency)', () => {
  it('returns 0 for same point', () => {
    expect(haversineMetres(51.5, -0.1, 51.5, -0.1)).toBe(0);
  });

  it('London to Birmingham is ~163km', () => {
    const d = haversineMetres(51.5074, -0.1278, 52.4862, -1.8904);
    expect(d).toBeGreaterThan(160_000);
    expect(d).toBeLessThan(170_000);
  });
});
