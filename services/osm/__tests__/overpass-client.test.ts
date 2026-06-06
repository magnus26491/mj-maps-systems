/**
 * Unit tests for the OSM Overpass client and road enricher.
 * Uses mock Overpass responses — no real HTTP calls in CI.
 */

import { estimateRoadWidth, ROAD_WIDTH_HEURISTICS } from '../overpass-client';

describe('estimateRoadWidth', () => {
  it('returns explicit width when provided', () => {
    const result = estimateRoadWidth('residential', 4.2);
    expect(result.widthM).toBe(4.2);
    expect(result.isExplicit).toBe(true);
  });

  it('falls back to heuristic for residential', () => {
    const result = estimateRoadWidth('residential');
    expect(result.widthM).toBe(ROAD_WIDTH_HEURISTICS.residential);
    expect(result.isExplicit).toBe(false);
  });

  it('falls back to default for unknown highway type', () => {
    const result = estimateRoadWidth('unknown_type');
    expect(result.widthM).toBe(ROAD_WIDTH_HEURISTICS.default);
    expect(result.isExplicit).toBe(false);
  });

  it('returns heuristic width for track', () => {
    const result = estimateRoadWidth('track');
    expect(result.widthM).toBe(3.5);
  });

  it('returns 0-width for explicit 0 (bad OSM data) gracefully', () => {
    // 0 should be treated as missing — fall back to heuristic
    const result = estimateRoadWidth('residential', 0);
    expect(result.widthM).toBe(ROAD_WIDTH_HEURISTICS.residential);
    expect(result.isExplicit).toBe(false);
  });
});

describe('ROAD_WIDTH_HEURISTICS', () => {
  it('has entries for all major UK road types', () => {
    const required = [
      'motorway', 'trunk', 'primary', 'secondary', 'tertiary',
      'unclassified', 'residential', 'living_street', 'service', 'track',
    ];
    required.forEach(type => {
      expect(ROAD_WIDTH_HEURISTICS[type]).toBeDefined();
      expect(ROAD_WIDTH_HEURISTICS[type]).toBeGreaterThan(0);
    });
  });

  it('has narrower widths for residential than primary', () => {
    expect(ROAD_WIDTH_HEURISTICS.residential).toBeLessThan(ROAD_WIDTH_HEURISTICS.primary);
  });

  it('has living_street narrower than residential', () => {
    expect(ROAD_WIDTH_HEURISTICS.living_street).toBeLessThan(ROAD_WIDTH_HEURISTICS.residential);
  });

  it('has track narrower than service road', () => {
    expect(ROAD_WIDTH_HEURISTICS.track).toBeLessThan(ROAD_WIDTH_HEURISTICS.service);
  });
});
