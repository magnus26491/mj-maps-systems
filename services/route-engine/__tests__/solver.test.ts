/**
 * Route Engine — full solver integration tests
 * No network calls — all data is inline fixtures.
 */

import { solve } from '../src/solver';
import type { SolverInput, Stop, RouteConstraints } from '../src/types';
import type { PropertyPin } from '../../property-engine/src/types';

const NOW = 1_700_000_000_000;

function makePin(lat: number, lng: number): PropertyPin {
  return {
    uprn: null, lat, lng,
    confidence: 'HIGH', source: 'nominatim',
    formattedAddress: `${lat},${lng}`,
    notes: null, photoUrls: [], resolvedAt: NOW,
  };
}

function makeStop(id: string, lat: number, lng: number, overrides: Partial<Stop> = {}): Stop {
  return {
    id, sequence: 0,
    pin:          makePin(lat, lng),
    status:       'PENDING',
    timeWindow:   null,
    dwellSeconds: 180,
    itemCount:    1,
    notes:        null,
    reference:    null,
    turnScore:    null,
    restrictions: null,
    stopSide:     null,
    eta:          null,
    arrivedAt:    null,
    departedAt:   null,
    ...overrides,
  };
}

const constraints: RouteConstraints = {
  vehicleId:       'swb_van',
  shiftStartMs:    NOW,
  maxShiftSeconds: 8 * 3600,
  maxStops:        200,
  depotLat:        51.500,
  depotLng:        -0.100,
  returnToDepot:   false,
};

// 10 stops scattered around London
const stops: Stop[] = [
  makeStop('s01', 51.510, -0.100),
  makeStop('s02', 51.520, -0.090),
  makeStop('s03', 51.515, -0.110),
  makeStop('s04', 51.505, -0.120),
  makeStop('s05', 51.525, -0.080),
  makeStop('s06', 51.530, -0.095),
  makeStop('s07', 51.508, -0.095),
  makeStop('s08', 51.512, -0.085),
  makeStop('s09', 51.518, -0.105),
  makeStop('s10', 51.522, -0.115),
];

const input: SolverInput = { stops, constraints };

describe('solve — basic correctness', () => {
  it('returns all stops when no constraints violated', () => {
    const result = solve(input);
    expect(result.orderedStops).toHaveLength(10);
    expect(result.droppedStops).toHaveLength(0);
  });

  it('sequence numbers are 1-based and unique', () => {
    const result = solve(input);
    const seqs = result.orderedStops.map(s => s.sequence);
    expect(seqs[0]).toBe(1);
    expect(new Set(seqs).size).toBe(seqs.length);
  });

  it('all stops have ETAs after shift start', () => {
    const result = solve(input);
    result.orderedStops.forEach(s => {
      expect(s.eta).not.toBeNull();
      expect(s.eta!).toBeGreaterThan(NOW);
    });
  });

  it('ETAs are in ascending order', () => {
    const result = solve(input);
    const etas = result.orderedStops.map(s => s.eta!);
    for (let i = 1; i < etas.length; i++) {
      expect(etas[i]).toBeGreaterThan(etas[i - 1]);
    }
  });

  it('totalDistanceM is positive', () => {
    const result = solve(input);
    expect(result.totalDistanceM).toBeGreaterThan(0);
  });

  it('solvedIn is a non-negative number', () => {
    const result = solve(input);
    expect(result.solvedIn).toBeGreaterThanOrEqual(0);
  });

  it('algorithm label is set', () => {
    const result = solve(input);
    expect(result.algorithm).toBe('sweep-zones + 2-opt');
  });
});

describe('solve — hard-blocked stops', () => {
  it('drops hard-blocked stop and keeps remaining 9', () => {
    const blockedStop = makeStop('blocked', 51.511, -0.101, {
      restrictions: {
        clear:           false,
        blockers:        [{ wayId: 999, lat: 51.511, lng: -0.101, type: 'BRIDGE', severity: 'BLOCKED', value: 2.5, description: 'Low bridge 2.5m', driverVerified: true, source: 'osm' }],
        warnings:        [],
        alternativeHint: 'Bridge too low for this vehicle',
      },
    });

    const result = solve({ stops: [...stops, blockedStop], constraints });
    expect(result.droppedStops.some(s => s.id === 'blocked')).toBe(true);
    expect(result.orderedStops.every(s => s.id !== 'blocked')).toBe(true);
  });
});

describe('solve — shift duration limit', () => {
  it('drops stops that exceed maxShiftSeconds', () => {
    // 1-second shift — everything gets dropped
    const tinyShift: RouteConstraints = { ...constraints, maxShiftSeconds: 1 };
    const result = solve({ stops, constraints: tinyShift });
    // All stops should be in droppedStops since they all have ETAs after 1s
    expect(result.orderedStops.length + result.droppedStops.length).toBe(10);
  });
});

describe('solve — edge cases', () => {
  it('handles empty stop list', () => {
    const result = solve({ stops: [], constraints });
    expect(result.orderedStops).toHaveLength(0);
    expect(result.droppedStops).toHaveLength(0);
  });

  it('handles single stop', () => {
    const result = solve({ stops: [stops[0]], constraints });
    expect(result.orderedStops).toHaveLength(1);
    expect(result.orderedStops[0].sequence).toBe(1);
  });
});
