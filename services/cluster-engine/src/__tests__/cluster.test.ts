/**
 * Cluster engine unit tests
 */
import { dbscan, orderClusters, clusterAndOrder, haversineM } from '../index';

const LONDON_STOPS = [
  // Cluster A — Shoreditch
  { id: 'a1', lat: 51.5227, lng: -0.0780 },
  { id: 'a2', lat: 51.5231, lng: -0.0775 },
  { id: 'a3', lat: 51.5220, lng: -0.0790 },
  // Cluster B — Liverpool Street (300m away)
  { id: 'b1', lat: 51.5176, lng: -0.0823 },
  { id: 'b2', lat: 51.5182, lng: -0.0818 },
  // Cluster C — Farringdon (1.2km away)
  { id: 'c1', lat: 51.5205, lng: -0.1051 },
  { id: 'c2', lat: 51.5210, lng: -0.1045 },
];

describe('haversineM', () => {
  it('returns ~0 for identical points', () => {
    expect(haversineM(51.5, -0.1, 51.5, -0.1)).toBeCloseTo(0, 0);
  });

  it('returns ~111km per degree latitude', () => {
    const dist = haversineM(51.0, 0, 52.0, 0);
    expect(dist).toBeGreaterThan(110_000);
    expect(dist).toBeLessThan(112_000);
  });
});

describe('dbscan', () => {
  it('groups nearby stops into clusters', () => {
    const clusters = dbscan(LONDON_STOPS, 300);
    // Shoreditch stops should cluster together
    const shoreditch = clusters.find(c => c.some(s => s.id === 'a1'));
    expect(shoreditch?.some(s => s.id === 'a2')).toBe(true);
    expect(shoreditch?.some(s => s.id === 'a3')).toBe(true);
  });

  it('separates distant stops into different clusters', () => {
    const clusters = dbscan(LONDON_STOPS, 300);
    const shoreditch = clusters.find(c => c.some(s => s.id === 'a1'))!;
    const farringdon = clusters.find(c => c.some(s => s.id === 'c1'))!;
    expect(shoreditch).not.toBe(farringdon);
  });

  it('handles single stop', () => {
    const clusters = dbscan([{ id: 'x', lat: 51.5, lng: -0.1 }]);
    expect(clusters).toHaveLength(1);
    expect(clusters[0]).toHaveLength(1);
  });

  it('handles empty input', () => {
    expect(dbscan([])).toHaveLength(0);
  });
});

describe('clusterAndOrder', () => {
  it('returns all stops in output', () => {
    const { orderedStops } = clusterAndOrder(LONDON_STOPS);
    expect(orderedStops).toHaveLength(LONDON_STOPS.length);
    const ids = new Set(orderedStops.map(s => s.id));
    for (const s of LONDON_STOPS) expect(ids.has(s.id)).toBe(true);
  });

  it('groups same-neighbourhood stops consecutively', () => {
    const { orderedStops } = clusterAndOrder(LONDON_STOPS);
    // a1/a2/a3 should appear as a consecutive block
    const aIndices = ['a1','a2','a3'].map(id => orderedStops.findIndex(s => s.id === id));
    const maxGap   = Math.max(...aIndices) - Math.min(...aIndices);
    expect(maxGap).toBeLessThanOrEqual(2); // all 3 within a 3-stop window
  });

  it('returns stats', () => {
    const { stats } = clusterAndOrder(LONDON_STOPS);
    expect(stats.clusterCount).toBeGreaterThan(0);
    expect(stats.avgClusterSize).toBeGreaterThan(0);
    expect(typeof stats.estimatedSavingKm).toBe('number');
  });

  it('handles empty input gracefully', () => {
    const result = clusterAndOrder([]);
    expect(result.orderedStops).toHaveLength(0);
    expect(result.stats.clusterCount).toBe(0);
  });
});
