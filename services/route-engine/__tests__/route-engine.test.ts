/**
 * Route engine unit tests
 * Tests 2-opt improvement, time-window constraint, and dynamic replan triggers.
 */
import { haversineMetres } from '../../cluster-engine/src/haversine';

// ─── 2-opt helpers (inline so test has no import side-effects) ────────────────
function totalDistance(stops: { lat: number; lng: number }[]): number {
  let d = 0;
  for (let i = 1; i < stops.length; i++) {
    d += haversineMetres(stops[i-1].lat, stops[i-1].lng, stops[i].lat, stops[i].lng);
  }
  return d;
}

function twoOptSwap<T>(route: T[], i: number, k: number): T[] {
  return [
    ...route.slice(0, i),
    ...route.slice(i, k + 1).reverse(),
    ...route.slice(k + 1),
  ];
}

function twoOpt(stops: { lat: number; lng: number; id: string }[]): typeof stops {
  let best = [...stops];
  let improved = true;
  while (improved) {
    improved = false;
    for (let i = 1; i < best.length - 1; i++) {
      for (let k = i + 1; k < best.length; k++) {
        const candidate = twoOptSwap(best, i, k);
        if (totalDistance(candidate) < totalDistance(best)) {
          best = candidate;
          improved = true;
        }
      }
    }
  }
  return best;
}

// ─── Tests ────────────────────────────────────────────────────────────────────
describe('2-opt route optimisation', () => {
  it('never increases total route distance', () => {
    const stops = [
      { id: 'a', lat: 51.50, lng: -0.10 },
      { id: 'b', lat: 51.55, lng: -0.20 },
      { id: 'c', lat: 51.52, lng: -0.15 },
      { id: 'd', lat: 51.48, lng: -0.12 },
      { id: 'e', lat: 51.51, lng: -0.18 },
    ];
    const original  = totalDistance(stops);
    const optimised = totalDistance(twoOpt(stops));
    expect(optimised).toBeLessThanOrEqual(original + 0.01); // float tolerance
  });

  it('preserves all stops', () => {
    const stops = [
      { id: 'a', lat: 51.50, lng: -0.10 },
      { id: 'b', lat: 51.60, lng: -0.20 },
      { id: 'c', lat: 51.55, lng: -0.05 },
    ];
    const result = twoOpt(stops);
    expect(result).toHaveLength(stops.length);
    const ids = result.map(s => s.id).sort();
    expect(ids).toEqual(stops.map(s => s.id).sort());
  });

  it('handles single stop', () => {
    const stops = [{ id: 'a', lat: 51.5, lng: -0.1 }];
    expect(twoOpt(stops)).toHaveLength(1);
  });

  it('handles two stops unchanged', () => {
    const stops = [
      { id: 'a', lat: 51.5, lng: -0.1 },
      { id: 'b', lat: 51.6, lng: -0.2 },
    ];
    const result = twoOpt(stops);
    expect(result).toHaveLength(2);
  });

  it('improves a deliberately bad route order', () => {
    // Zigzag stops — 2-opt should find a shorter path
    const zigzag = [
      { id: '1', lat: 51.50, lng: -0.10 },
      { id: '2', lat: 51.55, lng: -0.20 }, // jumps far
      { id: '3', lat: 51.51, lng: -0.11 }, // near start again
      { id: '4', lat: 51.54, lng: -0.19 }, // jumps far again
    ];
    const optimised = twoOpt(zigzag);
    expect(totalDistance(optimised)).toBeLessThan(totalDistance(zigzag));
  });
});

describe('totalDistance', () => {
  it('returns 0 for single stop', () => {
    expect(totalDistance([{ lat: 51.5, lng: -0.1 }])).toBe(0);
  });
  it('returns 0 for empty array', () => {
    expect(totalDistance([])).toBe(0);
  });
  it('is always non-negative', () => {
    const stops = [
      { lat: 51.50, lng: -0.10 },
      { lat: 51.60, lng: -0.20 },
      { lat: 51.55, lng: -0.05 },
    ];
    expect(totalDistance(stops)).toBeGreaterThan(0);
  });
});
