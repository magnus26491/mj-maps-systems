/**
 * Traffic Engine — ETA calculator unit tests
 */
import { recalculateEtas } from '../src/eta-calculator';
import type { TrafficSegment } from '../src/types';

const NOW = 1_700_000_000_000; // Fixed timestamp for deterministic tests

const stops = [
  { id: 's1', lat: 51.510, lng: -0.120 }, // ~1.1km from depot
  { id: 's2', lat: 51.520, lng: -0.130 }, // ~1.5km from s1
  { id: 's3', lat: 51.530, lng: -0.140 }, // ~1.5km from s2
];

const depot = { lat: 51.500, lng: -0.110 };

describe('recalculateEtas', () => {
  it('returns one result per stop', () => {
    const results = recalculateEtas(depot.lat, depot.lng, stops, NOW);
    expect(results).toHaveLength(3);
  });

  it('ETAs are in ascending order', () => {
    const results = recalculateEtas(depot.lat, depot.lng, stops, NOW);
    expect(results[1].revisedEta).toBeGreaterThan(results[0].revisedEta);
    expect(results[2].revisedEta).toBeGreaterThan(results[1].revisedEta);
  });

  it('ETAs are after departure time', () => {
    const results = recalculateEtas(depot.lat, depot.lng, stops, NOW);
    results.forEach(r => expect(r.revisedEta).toBeGreaterThan(NOW));
  });

  it('returns empty array for no stops', () => {
    const results = recalculateEtas(depot.lat, depot.lng, [], NOW);
    expect(results).toHaveLength(0);
  });

  it('heavy traffic segment increases travel time', () => {
    const clearResults = recalculateEtas(depot.lat, depot.lng, stops, NOW);

    const heavySegment: TrafficSegment = {
      fromLat: depot.lat, fromLng: depot.lng,
      toLat: stops[0].lat, toLng: stops[0].lng,
      currentSpeedKph:  5,
      freeFlowSpeedKph: 30,
      congestionRatio:  0.17,
      severity: 'HEAVY',
      delaySeconds: 300,
      fetchedAt: NOW,
    };

    const heavyResults = recalculateEtas(depot.lat, depot.lng, stops, NOW, [heavySegment]);
    // First stop ETA should be later with heavy traffic
    expect(heavyResults[0].revisedEta).toBeGreaterThan(clearResults[0].revisedEta);
    expect(heavyResults[0].reason).toBe('Heavy traffic ahead');
  });

  it('confidence is HIGH when traffic segment data available', () => {
    const segment: TrafficSegment = {
      fromLat: depot.lat, fromLng: depot.lng,
      toLat: stops[0].lat, toLng: stops[0].lng,
      currentSpeedKph: 25, freeFlowSpeedKph: 30,
      congestionRatio: 0.83, severity: 'LIGHT',
      delaySeconds: 30, fetchedAt: NOW,
    };
    const results = recalculateEtas(depot.lat, depot.lng, [stops[0]], NOW, [segment]);
    expect(results[0].confidence).toBe('HIGH');
  });

  it('stopId is preserved in result', () => {
    const results = recalculateEtas(depot.lat, depot.lng, stops, NOW);
    expect(results.map(r => r.stopId)).toEqual(['s1', 's2', 's3']);
  });
});
