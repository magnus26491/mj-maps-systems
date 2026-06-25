/**
 * Dynamic Replan Engine — unit tests
 * Pure functions — no network calls.
 */

import { replan, isDeviated } from '../src/replan-engine';
import type { ReplanRequest } from '../src/types';
import type { PlannedRoute, Stop, RouteConstraints } from '../../route-engine/src/types';
import type { PropertyPin } from '../../property-engine/src/types';

const NOW = 1_700_000_000_000;

function makePin(lat: number, lng: number): PropertyPin {
  return { uprn: null, lat, lng, confidence: 'HIGH', source: 'nominatim', formattedAddress: `${lat},${lng}`, notes: null, photoUrls: [], resolvedAt: NOW };
}

function makeStop(id: string, lat: number, lng: number, status: Stop['status'] = 'PENDING'): Stop {
  return {
    id, sequence: 0, pin: makePin(lat, lng), status,
    timeWindow: null, dwellSeconds: 180, itemCount: 1,
    notes: null, reference: null, turnScore: null, restrictions: null,
    stopSide: null, eta: null, arrivedAt: null, departedAt: null,
  };
}

const constraints: RouteConstraints = {
  vehicleId: 'swb_van', shiftStartMs: NOW,
  maxShiftSeconds: 8 * 3600, maxStops: 200,
  depotLat: 51.500, depotLng: -0.100, returnToDepot: false,
};

const stops: Stop[] = [
  makeStop('s1', 51.510, -0.100),
  makeStop('s2', 51.520, -0.090),
  makeStop('s3', 51.515, -0.110),
  makeStop('s4', 51.505, -0.120),
  makeStop('s5', 51.525, -0.080),
];

const route: PlannedRoute = {
  id: 'route-001', vehicleId: 'swb_van',
  stops: stops.map((s, i) => ({ ...s, sequence: i + 1 })),
  constraints,
  totalDistanceM: 15000, totalDurationSec: 3600,
  blockerCount: 0, turnWarningCount: 0,
  createdAt: NOW, lastReplannedAt: null,
};

const baseReq: Omit<ReplanRequest, 'trigger'> = {
  route,
  currentLat:  51.510,
  currentLng:  -0.100,
  triggeredAt: NOW + 600_000, // 10 min into shift
};

// ── FAILED_DROP ───────────────────────────────────────────────────────────────

describe('replan — FAILED_DROP', () => {
  const req: ReplanRequest = {
    ...baseReq,
    trigger:    'FAILED_DROP',
    failedStop: stops[0],
    failReason: 'NOT_IN',
  };

  it('succeeds', () => {
    expect(replan(req).success).toBe(true);
  });

  it('failed stop not in updated route pending stops', () => {
    const result = replan(req);
    const pending = result.updatedRoute.stops.filter(s => s.status === 'PENDING');
    expect(pending.every(s => s.id !== 's1')).toBe(true);
  });

  it('changes include STOP_DROPPED for failed stop', () => {
    const result = replan(req);
    expect(result.changes.some(c => c.type === 'STOP_DROPPED' && c.stopId === 's1')).toBe(true);
  });

  it('driverMessage is a non-empty string', () => {
    const result = replan(req);
    expect(result.driverMessage.length).toBeGreaterThan(0);
  });

  it('replannedIn is non-negative', () => {
    expect(replan(req).replannedIn).toBeGreaterThanOrEqual(0);
  });
});

// ── STOP_CANCELLED ────────────────────────────────────────────────────────────

describe('replan — STOP_CANCELLED', () => {
  const req: ReplanRequest = {
    ...baseReq,
    trigger:       'STOP_CANCELLED',
    cancelStopId:  's2',
  };

  it('cancelled stop removed from pending', () => {
    const result = replan(req);
    const pending = result.updatedRoute.stops.filter(s => s.status === 'PENDING');
    expect(pending.every(s => s.id !== 's2')).toBe(true);
  });

  it('remaining 4 stops still present', () => {
    const result = replan(req);
    const pending = result.updatedRoute.stops.filter(s => s.status === 'PENDING');
    expect(pending.length).toBe(4);
  });
});

// ── STOP_INSERTED ─────────────────────────────────────────────────────────────

describe('replan — STOP_INSERTED', () => {
  const newStop = makeStop('urgent', 51.512, -0.105);
  const req: ReplanRequest = {
    ...baseReq,
    trigger:    'STOP_INSERTED',
    insertStop: newStop,
  };

  it('new stop appears in updated route', () => {
    const result = replan(req);
    const pending = result.updatedRoute.stops.filter(s => s.status === 'PENDING');
    expect(pending.some(s => s.id === 'urgent')).toBe(true);
  });

  it('total pending stops = original 5 + 1 new', () => {
    const result = replan(req);
    const pending = result.updatedRoute.stops.filter(s => s.status === 'PENDING');
    expect(pending.length).toBe(6);
  });
});

// ── DWELL_OVERRUN ─────────────────────────────────────────────────────────────

describe('replan — DWELL_OVERRUN', () => {
  const req: ReplanRequest = {
    ...baseReq,
    trigger:       'DWELL_OVERRUN',
    dwellStopId:   's1',
    dwellOverrunSec: 600, // 10 min overrun
  };

  it('succeeds', () => {
    expect(replan(req).success).toBe(true);
  });

  it('driverMessage mentions minutes late', () => {
    const result = replan(req);
    expect(result.driverMessage).toContain('10 min late');
  });

  it('ETA_UPDATED changes generated', () => {
    const result = replan(req);
    expect(result.changes.some(c => c.type === 'ETA_UPDATED')).toBe(true);
  });
});

// ── TRAFFIC_BLOCK ─────────────────────────────────────────────────────────────

describe('replan — TRAFFIC_BLOCK', () => {
  const req: ReplanRequest = {
    ...baseReq,
    trigger: 'TRAFFIC_BLOCK',
    incident: {
      id: 'inc-001', lat: 51.511, lng: -0.101,
      type: 'accident', severity: 'HEAVY',
      description: 'RTC on A10',
      clearsAt: NOW + 600_000 + 900_000, // clears in 15 min
      affectedRoads: ['A10'],
    },
  };

  it('succeeds and returns updated route', () => {
    const result = replan(req);
    expect(result.success).toBe(true);
    expect(result.updatedRoute).toBeDefined();
  });
});

// ── isDeviated ────────────────────────────────────────────────────────────────

describe('isDeviated', () => {
  const nextStop = makeStop('next', 51.520, -0.100);
  const prevLat  = 51.510;
  const prevLng  = -0.100;

  it('returns false when driver is on direct line to next stop', () => {
    // Driver is exactly on the line (same lng, halfway lat)
    expect(isDeviated(51.515, -0.100, nextStop, prevLat, prevLng)).toBe(false);
  });

  it('returns true when driver is far off-route', () => {
    // Driver is 1km east of the route line
    expect(isDeviated(51.515, 0.000, nextStop, prevLat, prevLng)).toBe(true);
  });
});
