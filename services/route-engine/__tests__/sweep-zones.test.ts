/**
 * Route Engine — sweep-zone unit tests
 */

import { sweepSequence, buildZones } from '../src/sweep-zones';
import type { Stop } from '../src/types';
import type { PropertyPin } from '../../property-engine/src/types';

const NOW = 1_700_000_000_000;

function makeStop(id: string, lat: number, lng: number): Stop {
  const pin: PropertyPin = { uprn: null, lat, lng, confidence: 'HIGH', source: 'nominatim', formattedAddress: '', notes: null, photoUrls: [], resolvedAt: NOW };
  return { id, sequence: 0, pin, status: 'PENDING', timeWindow: null, dwellSeconds: 180, itemCount: 1, notes: null, reference: null, turnScore: null, restrictions: null, stopSide: null, eta: null, arrivedAt: null, departedAt: null };
}

const depot = { lat: 51.500, lng: -0.100 };

// 6 stops in 2 clear geographic clusters
const stops = [
  makeStop('a1', 51.510, -0.090), // cluster A — NE
  makeStop('a2', 51.511, -0.091),
  makeStop('a3', 51.512, -0.089),
  makeStop('b1', 51.530, -0.140), // cluster B — NW
  makeStop('b2', 51.531, -0.141),
  makeStop('b3', 51.529, -0.142),
];

describe('buildZones', () => {
  it('groups nearby stops into the same zone', () => {
    const zones = buildZones(stops, depot.lat, depot.lng);
    // Cluster A and cluster B should be in different zones
    expect(zones.length).toBeGreaterThanOrEqual(2);
  });

  it('all stops appear in exactly one zone', () => {
    const zones = buildZones(stops, depot.lat, depot.lng);
    const allStopIds = zones.flatMap(z => z.stops.map(s => s.id));
    expect(allStopIds.sort()).toEqual(stops.map(s => s.id).sort());
  });
});

describe('sweepSequence', () => {
  it('returns all stops', () => {
    const result = sweepSequence(stops, depot.lat, depot.lng);
    expect(result).toHaveLength(6);
  });

  it('sequence numbers are 1-based and contiguous', () => {
    const result = sweepSequence(stops, depot.lat, depot.lng);
    const seqs = result.map(s => s.sequence).sort((a, b) => a - b);
    expect(seqs).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('cluster A stops are grouped together (no interleaving with B)', () => {
    const result = sweepSequence(stops, depot.lat, depot.lng);
    const ids = result.map(s => s.id);
    // All A stops should appear before all B stops or vice versa
    const aPositions = ['a1','a2','a3'].map(id => ids.indexOf(id));
    const bPositions = ['b1','b2','b3'].map(id => ids.indexOf(id));
    const maxA = Math.max(...aPositions);
    const minB = Math.min(...bPositions);
    const maxB = Math.max(...bPositions);
    const minA = Math.min(...aPositions);
    // Either all A before all B, or all B before all A
    expect(maxA < minB || maxB < minA).toBe(true);
  });

  it('handles empty stop list', () => {
    expect(sweepSequence([], depot.lat, depot.lng)).toEqual([]);
  });

  it('handles single stop', () => {
    const result = sweepSequence([stops[0]], depot.lat, depot.lng);
    expect(result).toHaveLength(1);
    expect(result[0].sequence).toBe(1);
  });
});
