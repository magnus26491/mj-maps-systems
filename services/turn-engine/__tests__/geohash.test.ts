/**
 * Turn Engine — Geohash Unit Tests
 */

import { encodeGeohash } from '../src/geohash';

describe('encodeGeohash()', () => {
  test('London precision 6 → known hash', () => {
    // 51.5074, -0.1278 → gcpvhe (well-known value)
    expect(encodeGeohash(51.5074, -0.1278, 6)).toBe('gcpvhe');
  });

  test('same location always returns same hash', () => {
    const a = encodeGeohash(51.5, -0.1, 6);
    const b = encodeGeohash(51.5, -0.1, 6);
    expect(a).toBe(b);
  });

  test('precision 6 → 6 char string', () => {
    expect(encodeGeohash(48.8566, 2.3522, 6)).toHaveLength(6);
  });

  test('precision 4 → 4 char string', () => {
    expect(encodeGeohash(48.8566, 2.3522, 4)).toHaveLength(4);
  });

  test('nearby points share first 4 chars (same ~40km cell)', () => {
    const a = encodeGeohash(51.500, -0.100, 6);
    const b = encodeGeohash(51.501, -0.101, 6);
    // Very close — should share at least 4 prefix chars
    expect(a.slice(0, 4)).toBe(b.slice(0, 4));
  });

  test('output uses only base32 charset', () => {
    const hash = encodeGeohash(51.5, -0.1, 6);
    expect(hash).toMatch(/^[0-9bcdefghjkmnpqrstuvwxyz]+$/);
  });

  test('Monaco coords encode without error', () => {
    expect(() => encodeGeohash(43.7384, 7.4246, 6)).not.toThrow();
  });
});
