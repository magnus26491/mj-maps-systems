/**
 * Cluster engine unit tests
 */
import { clusterStops } from '../src/index';
import { haversineMetres, bearingDegrees } from '../src/haversine';
import { dbscan } from '../src/dbscan';
import type { ClusterStop } from '../src/types';

// ─── Haversine ────────────────────────────────────────────────────────────────
describe('haversineMetres', () => {
  it('returns 0 for same point', () => {
    expect(haversineMetres(51.5, -0.1, 51.5, -0.1)).toBe(0);
  });

  it('calculates London to Manchester (~263km)', () => {
    const d = haversineMetres(51.5074, -0.1278, 53.4808, -2.2426);
    expect(d).toBeGreaterThan(260_000);
    expect(d).toBeLessThan(270_000);
  });

  it('calculates bearing north', () => {
    const b = bearingDegrees(51.0, -0.1, 52.0, -0.1);
    expect(b).toBeCloseTo(0, 0); // North = 0 degrees
  });

  it('calculates bearing east', () => {
    const b = bearingDegrees(51.5, -1.0, 51.5, 0.0);
    expect(b).toBeCloseTo(90, 0); // East = 90 degrees
  });
});

// ─── DBSCAN ───────────────────────────────────────────────────────────────────
describe('dbscan', () => {
  const makeStop = (id: string, lat: number, lng: number): ClusterStop =>
    ({ id, lat, lng, address: id });

  it('clusters tightly grouped stops', () => {
    // Two groups: Central London, and one isolated stop
    const stops = [
      makeStop('a', 51.5074, -0.1278),
      makeStop('b', 51.5080, -0.1285),
      makeStop('c', 51.5078, -0.1275),
      makeStop('far', 51.6000, -0.5000), // far away = noise
    ];
    const { labels, numClusters } = dbscan(stops, 400, 2);
    expect(numClusters).toBe(1);    // 1 real cluster
    expect(labels[0]).toBe(0);      // a is in cluster 0
    expect(labels[1]).toBe(0);      // b is in cluster 0
    expect(labels[2]).toBe(0);      // c is in cluster 0
    expect(labels[3]).toBe(-1);     // far is noise
  });

  it('marks all points as noise when epsilon is tiny', () => {
    const stops = [
      makeStop('a', 51.5074, -0.1278),
      makeStop('b', 51.6000, -0.2000),
    ];
    const { labels, numClusters } = dbscan(stops, 1, 2);
    expect(numClusters).toBe(0);
    labels.forEach(l => expect(l).toBe(-1));
  });
});

// ─── Full cluster engine ──────────────────────────────────────────────────────
describe('clusterStops', () => {
  const depot = { depotLat: 51.490, depotLng: -0.200 };

  const stops: ClusterStop[] = [
    // Cluster A: Brixton area
    { id: 'a1', lat: 51.4613, lng: -0.1156, address: '1 Brixton Rd' },
    { id: 'a2', lat: 51.4620, lng: -0.1160, address: '2 Brixton Rd' },
    { id: 'a3', lat: 51.4615, lng: -0.1150, address: '3 Brixton Rd' },
    // Cluster B: Clapham area
    { id: 'b1', lat: 51.4618, lng: -0.1380, address: '1 Clapham Rd' },
    { id: 'b2', lat: 51.4625, lng: -0.1390, address: '2 Clapham Rd' },
    // Isolated stop
    { id: 'iso', lat: 51.6000, lng: 0.0500, address: 'Isolated Stop' },
  ];

  it('returns ordered stops covering all input stops', () => {
    const result = clusterStops(stops, depot);
    expect(result.orderedStops).toHaveLength(stops.length);
    const ids = result.orderedStops.map(s => s.id).sort();
    expect(ids).toEqual(stops.map(s => s.id).sort());
  });

  it('identifies at least 2 clusters', () => {
    const result = clusterStops(stops, depot);
    expect(result.totalClusters).toBeGreaterThanOrEqual(2);
  });

  it('isolated stop is treated as noise', () => {
    const result = clusterStops(stops, depot);
    expect(result.noiseStops).toBeGreaterThanOrEqual(1);
  });

  it('provides approachBearing for every stop', () => {
    const result = clusterStops(stops, depot);
    result.orderedStops.forEach(s => {
      expect(typeof s.approachBearing).toBe('number');
    });
  });

  it('handles empty stops array', () => {
    const result = clusterStops([], depot);
    expect(result.orderedStops).toHaveLength(0);
    expect(result.totalClusters).toBe(0);
  });

  it('handles single stop', () => {
    const result = clusterStops(
      [{ id: 'solo', lat: 51.5, lng: -0.1, address: 'Solo Stop' }],
      depot,
    );
    expect(result.orderedStops).toHaveLength(1);
  });

  it('backtrack reduction is a percentage between 0 and 100', () => {
    const result = clusterStops(stops, depot);
    expect(result.estimatedBacktrackReductionPct).toBeGreaterThanOrEqual(0);
    expect(result.estimatedBacktrackReductionPct).toBeLessThanOrEqual(100);
  });
});
