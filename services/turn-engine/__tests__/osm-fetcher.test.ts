/**
 * Turn Engine — OSM Fetcher Unit Tests
 * Tests parseMeasurementToMetres and parseOsmWay in isolation.
 * Network calls are mocked — no real Overpass requests.
 */

import { parseMeasurementToMetres, parseOsmWay, haversineM } from '../src/osm-fetcher';

describe('parseMeasurementToMetres()', () => {
  test('plain number string', ()        => expect(parseMeasurementToMetres('4.5')).toBeCloseTo(4.5));
  test('number with m suffix',  ()      => expect(parseMeasurementToMetres('4.5 m')).toBeCloseTo(4.5));
  test('number with m no space', ()     => expect(parseMeasurementToMetres('4.5m')).toBeCloseTo(4.5));
  test('feet only — 15ft',       ()     => expect(parseMeasurementToMetres('15ft')).toBeCloseTo(4.572, 2));
  test('feet only — 15 ft',      ()     => expect(parseMeasurementToMetres('15 ft')).toBeCloseTo(4.572, 2));
  test('feet and inches — 11ft 6in', () => expect(parseMeasurementToMetres('11ft 6in')).toBeCloseTo(3.505, 2));
  test("feet and inches — 11'6\"",   () => expect(parseMeasurementToMetres("11'6\"")).toBeCloseTo(3.505, 2));
  test('11 ft 6 in spaced',          () => expect(parseMeasurementToMetres('11 ft 6 in')).toBeCloseTo(3.505, 2));
  test('undefined → null',           () => expect(parseMeasurementToMetres(undefined)).toBeNull());
  test('empty string → null',        () => expect(parseMeasurementToMetres('')).toBeNull());
  test('garbage string → null',      () => expect(parseMeasurementToMetres('wide')).toBeNull());
});

describe('parseOsmWay()', () => {
  const geo = [
    { lat: 51.5000, lon: -0.1000 },
    { lat: 51.5010, lon: -0.1010 },
  ];

  test('explicit maxwidth tag → HIGH confidence', () => {
    const seg = parseOsmWay(123, { highway: 'residential', maxwidth: '4.5' }, geo);
    expect(seg.widthM).toBeCloseTo(4.5);
    expect(seg.confidence).toBe('HIGH');
  });

  test('width tag only → MEDIUM confidence', () => {
    const seg = parseOsmWay(124, { highway: 'residential', width: '5.0' }, geo);
    expect(seg.widthM).toBeCloseTo(5.0);
    expect(seg.confidence).toBe('MEDIUM');
  });

  test('no width tag → LOW confidence, fallback from highway class', () => {
    const seg = parseOsmWay(125, { highway: 'service' }, geo);
    expect(seg.widthM).toBe(3.5);   // service road fallback
    expect(seg.confidence).toBe('LOW');
  });

  test('unknown highway class → 4.8m default', () => {
    const seg = parseOsmWay(126, { highway: 'foo' }, geo);
    expect(seg.widthM).toBe(4.8);
  });

  test('turning_circle tag → hasTurningHead true', () => {
    const seg = parseOsmWay(127, { highway: 'residential', turning_circle: 'yes' }, geo);
    expect(seg.hasTurningHead).toBe(true);
  });

  test('highway=turning_circle → hasTurningHead true', () => {
    const seg = parseOsmWay(128, { highway: 'turning_circle' }, geo);
    expect(seg.hasTurningHead).toBe(true);
  });

  test('noexit=yes → isDeadEnd true', () => {
    const seg = parseOsmWay(129, { highway: 'residential', noexit: 'yes' }, geo);
    expect(seg.isDeadEnd).toBe(true);
  });

  test('maxheight parsed correctly', () => {
    const seg = parseOsmWay(130, { highway: 'service', maxheight: '3.5' }, geo);
    expect(seg.maxHeightM).toBeCloseTo(3.5);
  });

  test('maxweight parsed correctly', () => {
    const seg = parseOsmWay(131, { highway: 'residential', maxweight: '7.5' }, geo);
    expect(seg.maxWeightT).toBe(7.5);
  });

  test('lengthToEndM computed from geometry', () => {
    const seg = parseOsmWay(132, { highway: 'residential' }, geo);
    expect(seg.lengthToEndM).toBeGreaterThan(0);
    expect(seg.lengthToEndM).toBeLessThan(200); // two nearby points ~135m apart
  });
});

describe('haversineM()', () => {
  test('same point → 0m', () => {
    expect(haversineM({ lat: 51.5, lon: -0.1 }, { lat: 51.5, lon: -0.1 })).toBe(0);
  });

  test('London to Paris ≈ 340km', () => {
    const d = haversineM({ lat: 51.5, lon: -0.1 }, { lat: 48.85, lon: 2.35 });
    expect(d).toBeGreaterThan(330_000);
    expect(d).toBeLessThan(350_000);
  });

  test('two points ~1m apart', () => {
    // 0.00001 deg lat ≈ 1.11m
    const d = haversineM({ lat: 51.50000, lon: -0.1 }, { lat: 51.50001, lon: -0.1 });
    expect(d).toBeGreaterThan(0.5);
    expect(d).toBeLessThan(2.0);
  });
});
