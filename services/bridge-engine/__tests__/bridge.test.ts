/**
 * Bridge engine unit tests
 */
import {
  parseMaxHeight,
  parseMaxWeight,
  checkRestriction,
  checkUpcomingRestrictions,
} from '../src/index';
import type { VehicleDimensions, RoadRestriction } from '../src/index';

const van: VehicleDimensions = { heightM: 2.8, weightT: 3.2, widthM: 2.0, lengthM: 5.0 };
const hgv: VehicleDimensions = { heightM: 4.1, weightT: 18,  widthM: 2.55, lengthM: 12.0 };

describe('parseMaxHeight', () => {
  it('parses decimal metres', () => expect(parseMaxHeight('4.2')).toBeCloseTo(4.2));
  it('parses metres with unit', () => expect(parseMaxHeight('3.5 m')).toBeCloseTo(3.5));
  it('parses feet/inches', () => {
    const h = parseMaxHeight("14'0\"");
    expect(h).toBeGreaterThan(4.2);
    expect(h).toBeLessThan(4.3);
  });
  it('returns null for invalid', () => expect(parseMaxHeight('very low')).toBeNull());
  it('returns null for empty', () => expect(parseMaxHeight('')).toBeNull());
});

describe('parseMaxWeight', () => {
  it('parses plain number', () => expect(parseMaxWeight('7.5')).toBeCloseTo(7.5));
  it('parses with t suffix', () => expect(parseMaxWeight('3.5 t')).toBeCloseTo(3.5));
  it('returns null for text', () => expect(parseMaxWeight('heavy')).toBeNull());
});

describe('checkRestriction — height', () => {
  const restriction: RoadRestriction = {
    type: 'height', valueM: 3.0, lat: 51.5, lng: -0.1, source: 'osm',
  };
  it('van clears a 3m bridge', () => {
    // van is 2.8m, limit 3.0m
    const r = checkRestriction(van, restriction);
    expect(r.breached).toBe(false);
    expect(r.alertLevel).toBe('GREEN');
  });
  it('hgv hits a 3m bridge', () => {
    // hgv is 4.1m, limit 3.0m
    const r = checkRestriction(hgv, restriction);
    expect(r.breached).toBe(true);
    expect(r.alertLevel).toBe('RED');
    expect(r.message).toContain('4.1m exceeds 3');
  });
});

describe('checkRestriction — weight', () => {
  const restriction: RoadRestriction = {
    type: 'weight', valueT: 7.5, lat: 51.5, lng: -0.1, source: 'osm',
  };
  it('van under 7.5t passes', () => {
    expect(checkRestriction(van, restriction).breached).toBe(false);
  });
  it('18t HGV breaches 7.5t limit', () => {
    expect(checkRestriction(hgv, restriction).breached).toBe(true);
  });
});

describe('checkRestriction — no_hgv', () => {
  const restriction: RoadRestriction = {
    type: 'no_hgv', lat: 51.5, lng: -0.1, source: 'osm',
  };
  it('3.2t van is not HGV', () => {
    expect(checkRestriction(van, restriction).breached).toBe(false);
  });
  it('18t HGV breaches no_hgv', () => {
    expect(checkRestriction(hgv, restriction).breached).toBe(true);
  });
});

describe('checkUpcomingRestrictions', () => {
  it('returns GREEN when no restrictions', () => {
    const r = checkUpcomingRestrictions(hgv, []);
    expect(r.alertLevel).toBe('GREEN');
    expect(r.breached).toBe(false);
  });
  it('returns first breach found', () => {
    const restrictions: RoadRestriction[] = [
      { type: 'height', valueM: 5.0, lat: 51.5, lng: -0.1, source: 'osm' }, // clears
      { type: 'height', valueM: 3.0, lat: 51.5, lng: -0.1, source: 'osm' }, // breaches hgv at 4.1m
    ];
    const r = checkUpcomingRestrictions(hgv, restrictions);
    expect(r.breached).toBe(true);
    expect(r.restriction?.valueM).toBe(3.0);
  });
});
