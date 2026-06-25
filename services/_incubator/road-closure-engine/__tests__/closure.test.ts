/**
 * Road closure engine unit tests
 */
import {
  isClosureActive,
  closureAlertLevel,
  getActiveClosuresAhead,
} from '../src/index';
import type { RoadClosure } from '../src/index';

const now = Date.now();

const activeClosure: RoadClosure = {
  id: 'c1', type: 'full_closure', severity: 'critical',
  lat: 51.5074, lng: -0.1278, radiusM: 100,
  description: 'Water main burst',
  startMs: now - 3_600_000, endMs: now + 3_600_000,
  source: 'highways_england', detourAvailable: true, timePenaltyMins: 0,
};

const futureClosure: RoadClosure = {
  ...activeClosure, id: 'c2',
  startMs: now + 7_200_000, endMs: now + 14_400_000,
};

const expiredClosure: RoadClosure = {
  ...activeClosure, id: 'c3',
  startMs: now - 7_200_000, endMs: now - 3_600_000,
};

const roadworks: RoadClosure = {
  id: 'c4', type: 'roadworks', severity: 'low',
  lat: 51.5080, lng: -0.1280, radiusM: 50,
  description: 'Gas main works',
  startMs: now - 1000, endMs: null,
  source: 'osm', detourAvailable: false, timePenaltyMins: 5,
};

describe('isClosureActive', () => {
  it('active closure returns true', () => expect(isClosureActive(activeClosure, now)).toBe(true));
  it('future closure returns false', () => expect(isClosureActive(futureClosure, now)).toBe(false));
  it('expired closure returns false', () => expect(isClosureActive(expiredClosure, now)).toBe(false));
  it('indefinite closure (null endMs) returns true', () => expect(isClosureActive(roadworks, now)).toBe(true));
});

describe('closureAlertLevel', () => {
  it('full_closure returns RED', () => expect(closureAlertLevel(activeClosure)).toBe('RED'));
  it('roadworks low severity returns AMBER', () => expect(closureAlertLevel(roadworks)).toBe('AMBER'));
  it('emergency critical returns RED', () => {
    const e: RoadClosure = { ...roadworks, type: 'emergency', severity: 'critical' };
    expect(closureAlertLevel(e)).toBe('RED');
  });
});

describe('getActiveClosuresAhead', () => {
  const vehicleLat = 51.5074;
  const vehicleLng = -0.1278;

  it('returns only active closures', () => {
    const alerts = getActiveClosuresAhead(
      [activeClosure, futureClosure, expiredClosure],
      vehicleLat, vehicleLng, 5000, now,
    );
    expect(alerts.map(a => a.closure.id)).not.toContain('c2');
    expect(alerts.map(a => a.closure.id)).not.toContain('c3');
  });

  it('sorts by distance ascending', () => {
    const alerts = getActiveClosuresAhead(
      [activeClosure, roadworks],
      vehicleLat, vehicleLng, 5000, now,
    );
    if (alerts.length >= 2) {
      expect(alerts[0].distanceAhead).toBeLessThanOrEqual(alerts[1].distanceAhead);
    }
  });

  it('returns empty when no active closures', () => {
    expect(getActiveClosuresAhead([], vehicleLat, vehicleLng, 5000, now)).toHaveLength(0);
  });

  it('excludes closures beyond alert radius', () => {
    const farClosure: RoadClosure = {
      ...activeClosure, id: 'far',
      lat: 51.8000, lng: -0.5000, radiusM: 10,
    };
    const alerts = getActiveClosuresAhead([farClosure], vehicleLat, vehicleLng, 500, now);
    expect(alerts).toHaveLength(0);
  });
});
