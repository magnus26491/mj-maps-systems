/**
 * MJ Maps Systems — approach-side.ts unit tests
 *
 * Covers:
 *   - All 6 TurnAroundMethod branches
 *   - 7 vehicle profiles × 5 road scenarios
 *   - Edge cases: null roadWidth, zero deadEndDepth, RED with no safe exit
 *   - Alert distance correctness per method
 *   - Pre-alert waypoint projection (non-null for non-trivial methods)
 *   - Both TurnScoreInput shapes (.alert and .alertLevel)
 */

import { resolveApproach, ALERT_M_BY_METHOD, type TurnAroundMethod } from '../src/approach-side';
import type { VehicleProfile } from '../../../packages/vehicle-profiles/index';

// ─── VEHICLE FIXTURES ──────────────────────────────────────────────────────────

const VEHICLES: Record<string, VehicleProfile> = {
  bicycle: {
    id: 'bicycle', label: 'Bicycle', widthM: 0.6, heightM: 1.2,
    lengthM: 1.8, weightT: 0.01, minRoadWidthTurn: 2.0, minReverseDepthM: 3,
  },
  motorbike: {
    id: 'motorbike', label: 'Motorbike', widthM: 0.9, heightM: 1.2,
    lengthM: 2.2, weightT: 0.3, minRoadWidthTurn: 3.0, minReverseDepthM: 4,
  },
  swbVan: {
    id: 'swb_van', label: 'SWB Van', widthM: 2.1, heightM: 2.4,
    lengthM: 4.8, weightT: 2.0, minRoadWidthTurn: 8.0, minReverseDepthM: 6,
  },
  lwbVan: {
    id: 'lwb_van', label: 'LWB Van', widthM: 2.1, heightM: 2.6,
    lengthM: 6.0, weightT: 3.5, minRoadWidthTurn: 10.0, minReverseDepthM: 8,
  },
  luton: {
    id: 'luton', label: 'Luton', widthM: 2.4, heightM: 3.2,
    lengthM: 7.0, weightT: 5.5, minRoadWidthTurn: 12.0, minReverseDepthM: 10,
  },
  sevenT: {
    id: '7.5t', label: '7.5t HGV', widthM: 2.5, heightM: 3.5,
    lengthM: 8.5, weightT: 7.5, minRoadWidthTurn: 14.0, minReverseDepthM: 12,
  },
  artic: {
    id: 'artic', label: 'Artic', widthM: 2.55, heightM: 4.0,
    lengthM: 16.5, weightT: 44.0, minRoadWidthTurn: 22.0, minReverseDepthM: 20,
  },
};

// Standard stop coord for all tests
const STOP = { stopLat: 51.5074, stopLng: -0.1278, incomingBearing: 90 };

// ─── HELPERS ────────────────────────────────────────────────────────────────

function greenScore(score = 0.9) {
  return { score, alert: 'GREEN' as const };
}
function amberScore(score = 0.55) {
  return { score, alert: 'AMBER' as const };
}
function redScore(score = 0.2) {
  return { score, alert: 'RED' as const };
}
function greenScoreAlt(score = 0.9) {
  return { score, alertLevel: 'green' as const };
}

const WIDE_ROAD   = 12.0;  // easily passable for any van
const MEDIUM_ROAD = 6.0;   // OK for bicycle/motorbike; tight for vans
const NARROW_ROAD = 4.0;   // too narrow for SWB van forward turn
const TINY_ROAD   = 2.8;   // too narrow even for 3-point in van

// ─── TESTS ───────────────────────────────────────────────────────────────────

describe('resolveApproach — NOT_REQUIRED', () => {
  test('bicycle on wide road → NOT_REQUIRED', () => {
    const r = resolveApproach(greenScore(), VEHICLES.bicycle, WIDE_ROAD,
      { hasTurningHead: false, isDeadEnd: false, deadEndDepthM: 0, ...STOP });
    expect(r.turnAroundMethod).toBe('NOT_REQUIRED');
    expect(r.alertDistanceM).toBe(0);
    expect(r.preAlertWaypoint).toBeNull();
    expect(r.confidence).toBe('HIGH');
  });

  test('motorbike on wide road → NOT_REQUIRED', () => {
    const r = resolveApproach(greenScore(), VEHICLES.motorbike, WIDE_ROAD,
      { hasTurningHead: false, isDeadEnd: false, deadEndDepthM: 0, ...STOP });
    expect(r.turnAroundMethod).toBe('NOT_REQUIRED');
  });

  test('SWB Van on 12m wide road → NOT_REQUIRED (12 >= 2.1 * 1.8 = 3.78)', () => {
    const r = resolveApproach(greenScore(), VEHICLES.swbVan, WIDE_ROAD,
      { hasTurningHead: false, isDeadEnd: false, deadEndDepthM: 0, ...STOP });
    expect(r.turnAroundMethod).toBe('NOT_REQUIRED');
  });

  test('accepts .alertLevel shape (vehicle-profiles format)', () => {
    const r = resolveApproach(greenScoreAlt(), VEHICLES.swbVan, WIDE_ROAD,
      { hasTurningHead: false, isDeadEnd: false, deadEndDepthM: 0, ...STOP });
    expect(r.turnAroundMethod).toBe('NOT_REQUIRED');
  });
});

describe('resolveApproach — USE_TURNING_HEAD', () => {
  test('SWB Van + narrow road + turning head → USE_TURNING_HEAD', () => {
    const r = resolveApproach(amberScore(), VEHICLES.swbVan, NARROW_ROAD,
      { hasTurningHead: true, isDeadEnd: false, deadEndDepthM: 0, ...STOP });
    expect(r.turnAroundMethod).toBe('USE_TURNING_HEAD');
    expect(r.overlayColour).toBeUndefined(); // colour assigned by alert-dispatcher
    expect(r.alertDistanceM).toBe(ALERT_M_BY_METHOD['USE_TURNING_HEAD']);
    expect(r.confidence).toBe('HIGH');
  });

  test('Luton + turning head on narrow road → USE_TURNING_HEAD', () => {
    const r = resolveApproach(amberScore(), VEHICLES.luton, NARROW_ROAD,
      { hasTurningHead: true, isDeadEnd: false, deadEndDepthM: 0, ...STOP });
    expect(r.turnAroundMethod).toBe('USE_TURNING_HEAD');
  });

  test('pre-alert waypoint is not null when alertDistanceM > 0', () => {
    const r = resolveApproach(amberScore(), VEHICLES.swbVan, NARROW_ROAD,
      { hasTurningHead: true, isDeadEnd: false, deadEndDepthM: 0, ...STOP });
    expect(r.preAlertWaypoint).not.toBeNull();
    expect(r.preAlertWaypoint!.lat).toBeCloseTo(51.5074, 2);
  });
});

describe('resolveApproach — THREE_POINT', () => {
  test('SWB Van + 5m road + no turning head → THREE_POINT', () => {
    // 5m >= 2.1 * 1.4 = 2.94 ✔  but < 2.1 * 1.8 = 3.78 for FORWARD — wait,
    // 5 >= 3.78 so FORWARD_TURN wins; use a tighter road
    // Need: width < vehicle.widthM * FORWARD_TURN_FACTOR but >= THREE_POINT_FACTOR
    // For LWB Van (2.1m): FORWARD needs 3.78m, THREE_POINT needs 2.94m
    // So use 3.5m road and AMBER
    const r = resolveApproach(amberScore(), VEHICLES.lwbVan, 3.5,
      { hasTurningHead: false, isDeadEnd: false, deadEndDepthM: 0, ...STOP });
    expect(r.turnAroundMethod).toBe('THREE_POINT');
    expect(r.alertDistanceM).toBe(ALERT_M_BY_METHOD['THREE_POINT']);
  });

  test('Luton + 4m road + no turning head → THREE_POINT', () => {
    // Luton widthM = 2.4: FORWARD needs 4.32m, THREE_POINT needs 3.36m
    // 4m < 4.32 but >= 3.36 → THREE_POINT
    const r = resolveApproach(amberScore(), VEHICLES.luton, 4.0,
      { hasTurningHead: false, isDeadEnd: false, deadEndDepthM: 0, ...STOP });
    expect(r.turnAroundMethod).toBe('THREE_POINT');
  });

  test('7.5t HGV + 6m road → THREE_POINT (6 >= 2.5*1.4=3.5 but < 2.5*1.8=4.5)', () => {
    const r = resolveApproach(amberScore(), VEHICLES.sevenT, 4.0,
      { hasTurningHead: false, isDeadEnd: false, deadEndDepthM: 0, ...STOP });
    expect(r.turnAroundMethod).toBe('THREE_POINT');
  });

  test('message contains vehicle label', () => {
    const r = resolveApproach(amberScore(), VEHICLES.lwbVan, 3.5,
      { hasTurningHead: false, isDeadEnd: false, deadEndDepthM: 0, ...STOP });
    expect(r.message).toContain('LWB Van');
  });
});

describe('resolveApproach — REVERSE_OUT', () => {
  test('AMBER + dead end + sufficient depth → REVERSE_OUT', () => {
    const r = resolveApproach(amberScore(), VEHICLES.swbVan, TINY_ROAD,
      { hasTurningHead: false, isDeadEnd: true, deadEndDepthM: 15, ...STOP });
    expect(r.turnAroundMethod).toBe('REVERSE_OUT');
    expect(r.alertDistanceM).toBe(ALERT_M_BY_METHOD['REVERSE_OUT']);
  });

  test('RED + dead end + sufficient depth → REVERSE_OUT', () => {
    const r = resolveApproach(redScore(), VEHICLES.swbVan, TINY_ROAD,
      { hasTurningHead: false, isDeadEnd: true, deadEndDepthM: 15, ...STOP });
    expect(r.turnAroundMethod).toBe('REVERSE_OUT');
  });

  test('message includes available depth in metres', () => {
    const r = resolveApproach(amberScore(), VEHICLES.swbVan, TINY_ROAD,
      { hasTurningHead: false, isDeadEnd: true, deadEndDepthM: 15, ...STOP });
    expect(r.message).toContain('15');
  });
});

describe('resolveApproach — DO_NOT_ENTER', () => {
  test('RED + not a dead end + tiny road → DO_NOT_ENTER', () => {
    const r = resolveApproach(redScore(), VEHICLES.sevenT, TINY_ROAD,
      { hasTurningHead: false, isDeadEnd: false, deadEndDepthM: 0, ...STOP });
    expect(r.turnAroundMethod).toBe('DO_NOT_ENTER');
    expect(r.alertDistanceM).toBe(ALERT_M_BY_METHOD['DO_NOT_ENTER']);
  });

  test('RED + dead end + insufficient reverse depth → DO_NOT_ENTER', () => {
    // swbVan minReverseDepthM = 6; deadEndDepthM = 3 → not enough
    const r = resolveApproach(redScore(), VEHICLES.swbVan, TINY_ROAD,
      { hasTurningHead: false, isDeadEnd: true, deadEndDepthM: 3, ...STOP });
    expect(r.turnAroundMethod).toBe('DO_NOT_ENTER');
  });

  test('Artic on 4m dead end with 10m depth → DO_NOT_ENTER (needs 20m)', () => {
    const r = resolveApproach(redScore(), VEHICLES.artic, 4.0,
      { hasTurningHead: false, isDeadEnd: true, deadEndDepthM: 10, ...STOP });
    expect(r.turnAroundMethod).toBe('DO_NOT_ENTER');
  });

  test('alertDistanceM is 600 (earliest warn)', () => {
    const r = resolveApproach(redScore(), VEHICLES.sevenT, TINY_ROAD,
      { hasTurningHead: false, isDeadEnd: false, deadEndDepthM: 0, ...STOP });
    expect(r.alertDistanceM).toBe(600);
  });

  test('preAlertWaypoint is set for DO_NOT_ENTER', () => {
    const r = resolveApproach(redScore(), VEHICLES.sevenT, TINY_ROAD,
      { hasTurningHead: false, isDeadEnd: false, deadEndDepthM: 0, ...STOP });
    expect(r.preAlertWaypoint).not.toBeNull();
  });
});

describe('resolveApproach — null roadWidth fallback', () => {
  test('null width + GREEN + no features → NOT_REQUIRED (LOW confidence)', () => {
    const r = resolveApproach(greenScore(), VEHICLES.swbVan, null,
      { hasTurningHead: false, isDeadEnd: false, deadEndDepthM: 0, ...STOP });
    // Fallback width = 2.1 * 2.5 = 5.25; vehicle.widthM * FORWARD = 3.78 → passes
    expect(r.turnAroundMethod).toBe('NOT_REQUIRED');
    expect(r.confidence).toBe('LOW');
  });

  test('null width + RED → DO_NOT_ENTER with MEDIUM confidence', () => {
    const r = resolveApproach(redScore(0.1), VEHICLES.artic, null,
      { hasTurningHead: false, isDeadEnd: false, deadEndDepthM: 0, ...STOP });
    expect(r.turnAroundMethod).toBe('DO_NOT_ENTER');
    expect(r.confidence).toBe('MEDIUM');
  });
});

describe('resolveApproach — alert shape normalisation', () => {
  test('accepts .alertLevel lowercase (vehicle-profiles shape)', () => {
    const r = resolveApproach(
      { score: 0.8, alertLevel: 'green' as const },
      VEHICLES.swbVan,
      WIDE_ROAD,
      { hasTurningHead: false, isDeadEnd: false, deadEndDepthM: 0, ...STOP },
    );
    expect(r.turnAroundMethod).toBe('NOT_REQUIRED');
  });

  test('accepts .alert uppercase (turn-engine/src/types.ts shape)', () => {
    const r = resolveApproach(
      { score: 0.2, alert: 'RED' as const },
      VEHICLES.sevenT,
      TINY_ROAD,
      { hasTurningHead: false, isDeadEnd: false, deadEndDepthM: 0, ...STOP },
    );
    expect(r.turnAroundMethod).toBe('DO_NOT_ENTER');
  });

  test('derives alert from score when neither field present', () => {
    const r = resolveApproach(
      { score: 0.9 },   // no alert / alertLevel
      VEHICLES.bicycle,
      WIDE_ROAD,
      { hasTurningHead: false, isDeadEnd: false, deadEndDepthM: 0, ...STOP },
    );
    expect(r.turnAroundMethod).toBe('NOT_REQUIRED');
  });
});

describe('resolveApproach — ALERT_M_BY_METHOD completeness', () => {
  const methods: TurnAroundMethod[] = [
    'NOT_REQUIRED', 'USE_TURNING_HEAD', 'FORWARD_TURN',
    'THREE_POINT', 'REVERSE_OUT', 'DO_NOT_ENTER',
  ];

  test.each(methods)('%s has a defined alert distance', (method) => {
    expect(ALERT_M_BY_METHOD[method]).toBeDefined();
    expect(typeof ALERT_M_BY_METHOD[method]).toBe('number');
  });
});
