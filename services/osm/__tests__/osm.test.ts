/**
 * OSM service unit tests
 * Mocks fetch so no real Overpass API calls are made.
 */
import { parseRoadWidth, classifyHighway, inferWidthFromHighwayClass } from '../road-enricher';
import { buildRoadQuery } from '../road-query';

describe('inferWidthFromHighwayClass', () => {
  it('returns wide width for motorway', () => {
    expect(inferWidthFromHighwayClass('motorway')).toBeGreaterThanOrEqual(10);
  });
  it('returns narrow width for track', () => {
    expect(inferWidthFromHighwayClass('track')).toBeLessThanOrEqual(4);
  });
  it('returns medium width for residential', () => {
    const w = inferWidthFromHighwayClass('residential');
    expect(w).toBeGreaterThanOrEqual(5);
    expect(w).toBeLessThanOrEqual(8);
  });
  it('returns fallback for unknown class', () => {
    expect(inferWidthFromHighwayClass('unknown_road_type')).toBeGreaterThan(0);
  });
});

describe('parseRoadWidth', () => {
  it('parses plain numeric string', () => {
    expect(parseRoadWidth('7.5')).toBeCloseTo(7.5);
  });
  it('parses string with m suffix', () => {
    expect(parseRoadWidth('6.2 m')).toBeCloseTo(6.2);
  });
  it('parses feet and converts to metres', () => {
    const w = parseRoadWidth("20'");
    expect(w).toBeGreaterThan(5);
    expect(w).toBeLessThan(7);
  });
  it('returns null for unparseable string', () => {
    expect(parseRoadWidth('wide')).toBeNull();
  });
  it('returns null for empty string', () => {
    expect(parseRoadWidth('')).toBeNull();
  });
});

describe('classifyHighway', () => {
  it('classifies motorway as high-speed', () => {
    expect(classifyHighway('motorway')).toBe('high_speed');
  });
  it('classifies residential as urban', () => {
    expect(classifyHighway('residential')).toBe('urban');
  });
  it('classifies track as rural', () => {
    expect(classifyHighway('track')).toBe('rural');
  });
  it('classifies service as service', () => {
    expect(classifyHighway('service')).toBe('service');
  });
});

describe('buildRoadQuery', () => {
  it('builds a valid Overpass QL string containing lat/lng', () => {
    const q = buildRoadQuery(51.5074, -0.1278, 50);
    expect(q).toContain('51.5074');
    expect(q).toContain('-0.1278');
    expect(q).toContain('way');
    expect(q).toContain('highway');
  });
  it('includes radius in query', () => {
    const q = buildRoadQuery(51.5, -0.1, 75);
    expect(q).toContain('75');
  });
});
