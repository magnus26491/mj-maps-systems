/**
 * Unit tests for the Plus Codes / OLC adapter.
 * Fully offline — no network, no API key.
 */

import {
  isPlusCode,
  encodePlusCode,
  decodePlusCode,
  resolvePlusCodeToDoorPin,
  reversePlusCode,
} from '../../services/geocoding/plus-codes-client';

const WESTMINSTER_LAT = 51.4994;
const WESTMINSTER_LNG = -0.1273;

describe('isPlusCode', () => {
  test('accepts full plus codes', () => {
    expect(isPlusCode('9C3XGV9F+XH')).toBe(true);
    expect(isPlusCode('9C3XGV9F+XH7')).toBe(true);
  });

  test('rejects non-plus-code strings', () => {
    expect(isPlusCode('SW1A 2AA')).toBe(false);          // postcode
    expect(isPlusCode('filled.count.soap')).toBe(false); // w3w
    expect(isPlusCode('GV9F+XH')).toBe(false);           // short code (no full grid)
    expect(isPlusCode('')).toBe(false);
  });
});

describe('encodePlusCode', () => {
  test('encodes coordinates to a Plus Code string', () => {
    const code = encodePlusCode(WESTMINSTER_LAT, WESTMINSTER_LNG);
    expect(typeof code).toBe('string');
    expect(code.length).toBeGreaterThan(6);
    expect(code).toContain('+');
  });

  test('round-trips through decode within a few metres', () => {
    const code = encodePlusCode(WESTMINSTER_LAT, WESTMINSTER_LNG, 11);
    const decoded = decodePlusCode(code);
    expect(decoded).not.toBeNull();
    if (decoded) {
      expect(Math.abs(decoded.lat - WESTMINSTER_LAT)).toBeLessThan(0.001);
      expect(Math.abs(decoded.lng - WESTMINSTER_LNG)).toBeLessThan(0.001);
    }
  });
});

describe('decodePlusCode', () => {
  test('returns null for invalid codes', () => {
    expect(decodePlusCode('not-a-code')).toBeNull();
    expect(decodePlusCode('')).toBeNull();
  });

  test('decodes a known Plus Code to approximate coordinates', () => {
    // 9C3XGV9F+XH is near Westminster, London
    const result = decodePlusCode('9C3XGV9F+XH');
    expect(result).not.toBeNull();
    if (result) {
      expect(result.lat).toBeCloseTo(51.5, 0);
      expect(result.lng).toBeCloseTo(-0.12, 0);
    }
  });
});

describe('resolvePlusCodeToDoorPin', () => {
  test('returns a DoorPin for a valid full Plus Code', () => {
    const code = encodePlusCode(WESTMINSTER_LAT, WESTMINSTER_LNG, 11);
    const pin = resolvePlusCodeToDoorPin(code);
    expect(pin).not.toBeNull();
    expect(pin?.source).toBe('plus_code');
    expect(pin?.confidence).toBeGreaterThan(0.5);
    expect(typeof pin?.lat).toBe('number');
    expect(typeof pin?.lng).toBe('number');
    expect(pin?.plusCode).toBe(code.toUpperCase());
  });

  test('returns null for an invalid code', () => {
    expect(resolvePlusCodeToDoorPin('INVALID')).toBeNull();
  });
});

describe('reversePlusCode', () => {
  test('returns a ReverseResult with source plus_code', () => {
    const result = reversePlusCode({ lat: WESTMINSTER_LAT, lng: WESTMINSTER_LNG });
    expect(result.source).toBe('plus_code');
    expect(result.distanceM).toBe(0);
    expect(typeof result.address).toBe('string');
    expect(result.address).toContain('+');
  });
});
