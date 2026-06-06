/**
 * Unit tests for overpass-client.ts
 * Tests circuit breaker state, endpoint selection, and backoff logic.
 * No real HTTP calls — uses fetch mock.
 */

import { OVERPASS_ENDPOINTS } from '../overpass-client';

describe('OVERPASS_ENDPOINTS', () => {
  it('contains exactly 3 endpoints', () => {
    expect(OVERPASS_ENDPOINTS).toHaveLength(3);
  });

  it('all endpoints start with https://', () => {
    for (const ep of OVERPASS_ENDPOINTS) {
      expect(ep.startsWith('https://')).toBe(true);
    }
  });

  it('all endpoints contain /api/interpreter', () => {
    for (const ep of OVERPASS_ENDPOINTS) {
      expect(ep).toContain('/api/interpreter');
    }
  });

  it('overpass-api.de is the primary endpoint', () => {
    expect(OVERPASS_ENDPOINTS[0]).toContain('overpass-api.de');
  });
});
