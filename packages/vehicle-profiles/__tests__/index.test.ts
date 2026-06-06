/**
 * MJ Maps Systems — Vehicle Profiles Engine
 * Jest Unit Tests
 *
 * Covers:
 *   - VEHICLE_PROFILES shape and legal compliance constants
 *   - computeTurnScore() — all branches incl. community blending
 *   - getTurnAlert() — all three thresholds
 *   - computeBridgeScore() — all alert bands, confidence multipliers, signing rules
 *   - getBridgeAlert() — all five bands
 *   - evaluateClosure() — all severity × restriction combinations
 *   - ALERT_DISTANCES — presence and value guard
 *
 * NOTE: The app never recommends trolley usage. Weight is a driver-only decision.
 * These tests concern road/vehicle geometry only — no parcel-handling logic.
 */

import {
  VEHICLE_PROFILES,
  computeTurnScore,
  getTurnAlert,
  computeBridgeScore,
  getBridgeAlert,
  evaluateClosure,
  ALERT_DISTANCES,
  UK_BRIDGE_SIGN_THRESHOLD_M,
  type VehicleProfile,
  type RoadClosure,
} from '../index';

// ─── SHARED FIXTURES ─────────────────────────────────────────────────────────

const swb   = VEHICLE_PROFILES.van_swb;   // 4.5m min turn width, 2.2m height
const luton = VEHICLE_PROFILES.luton;     // 5.8m min turn width, 3.0m height
const hgv   = VEHICLE_PROFILES.hgv_75t;  // 7.0m min turn width, 3.5m height
const artic = VEHICLE_PROFILES.artic;    // 12.5m min turn width, 4.0m height
const car   = VEHICLE_PROFILES.car;      // 3.5m min turn width, 1.5m height

// ─────────────────────────────────────────────────────────────────────────────
// 1. VEHICLE_PROFILES — structure & legal constants
// ─────────────────────────────────────────────────────────────────────────────

describe('VEHICLE_PROFILES — structure', () => {
  const requiredKeys: (keyof VehicleProfile)[] = [
    'id', 'label', 'lengthM', 'widthM', 'heightM',
    'heightMinM', 'heightMaxM', 'minTurnRadiusM',
    'minRoadWidthTurnM', 'turningCircleDiaM',
    'minRoadWidthStraightM', 'requiresHeightEntry', 'maxWeightT',
  ];

  test('exports 11 vehicle profiles', () => {
    expect(Object.keys(VEHICLE_PROFILES)).toHaveLength(11);
  });

  test.each(Object.values(VEHICLE_PROFILES))(
    '%s — has all required fields with positive values',
    (profile) => {
      for (const key of requiredKeys) {
        expect(profile).toHaveProperty(key);
      }
      expect(profile.lengthM).toBeGreaterThan(0);
      expect(profile.widthM).toBeGreaterThan(0);
      expect(profile.heightM).toBeGreaterThan(0);
      expect(profile.minRoadWidthTurnM).toBeGreaterThan(profile.widthM);
    }
  );

  test('UK legal max height 4.95m — no profile exceeds it', () => {
    for (const p of Object.values(VEHICLE_PROFILES)) {
      expect(p.heightMaxM).toBeLessThanOrEqual(4.95);
    }
  });

  test('artic legal length cap 16.5m', () => {
    expect(VEHICLE_PROFILES.artic.lengthM).toBe(16.5);
    expect(VEHICLE_PROFILES.artic_highcube.lengthM).toBe(16.5);
    expect(VEHICLE_PROFILES.double_deck.lengthM).toBe(16.5);
  });

  test('HGVs and high-roof vans require height entry', () => {
    const mustFlag = ['van_high_roof', 'luton', 'hgv_75t', 'hgv_18t', 'artic', 'artic_highcube', 'double_deck'];
    for (const id of mustFlag) {
      expect(VEHICLE_PROFILES[id].requiresHeightEntry).toBe(true);
    }
  });

  test('car and standard vans do NOT require height entry', () => {
    expect(VEHICLE_PROFILES.car.requiresHeightEntry).toBe(false);
    expect(VEHICLE_PROFILES.van_swb.requiresHeightEntry).toBe(false);
    expect(VEHICLE_PROFILES.van_lwb.requiresHeightEntry).toBe(false);
  });

  test('UK_BRIDGE_SIGN_THRESHOLD_M is 5.03', () => {
    expect(UK_BRIDGE_SIGN_THRESHOLD_M).toBe(5.03);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. computeTurnScore()
// ─────────────────────────────────────────────────────────────────────────────

describe('computeTurnScore()', () => {

  describe('base score — road width ratio', () => {
    test('road exactly equals minRoadWidthTurnM → score 1.0', () => {
      const score = computeTurnScore({
        roadWidthM: swb.minRoadWidthTurnM, // 4.5
        hasTurningHead: false,
        roadLengthToEndM: 50,
        vehicleProfile: swb,
      });
      expect(score).toBe(1.0);
    });

    test('road wider than required → score capped at 1.0', () => {
      const score = computeTurnScore({
        roadWidthM: 20,
        hasTurningHead: false,
        roadLengthToEndM: 50,
        vehicleProfile: swb,
      });
      expect(score).toBe(1.0);
    });

    test('road exactly half required → score ~0.50', () => {
      const score = computeTurnScore({
        roadWidthM: swb.minRoadWidthTurnM / 2,
        hasTurningHead: false,
        roadLengthToEndM: 50,
        vehicleProfile: swb,
      });
      expect(score).toBeCloseTo(0.5, 5);
    });

    test('road 0m wide → score 0.0', () => {
      const score = computeTurnScore({
        roadWidthM: 0,
        hasTurningHead: false,
        roadLengthToEndM: 50,
        vehicleProfile: swb,
      });
      expect(score).toBe(0.0);
    });
  });

  describe('turning head bonus (+0.30, capped at 1.0)', () => {
    test('turning head on a 60% road → score 0.90', () => {
      const score = computeTurnScore({
        roadWidthM: swb.minRoadWidthTurnM * 0.60, // base = 0.60
        hasTurningHead: true,
        roadLengthToEndM: 50,
        vehicleProfile: swb,
      });
      expect(score).toBeCloseTo(0.90, 5);
    });

    test('turning head on full-width road → still capped at 1.0', () => {
      const score = computeTurnScore({
        roadWidthM: swb.minRoadWidthTurnM,
        hasTurningHead: true,
        roadLengthToEndM: 50,
        vehicleProfile: swb,
      });
      expect(score).toBe(1.0);
    });

    test('turning head on 0m road → 0.30 (bonus on zero base)', () => {
      const score = computeTurnScore({
        roadWidthM: 0,
        hasTurningHead: true,
        roadLengthToEndM: 50,
        vehicleProfile: swb,
      });
      expect(score).toBeCloseTo(0.30, 5);
    });
  });

  describe('dead-end penalty (×0.50 when roadLengthToEndM < 20)', () => {
    test('19m to dead end → halves the score', () => {
      const base = computeTurnScore({
        roadWidthM: swb.minRoadWidthTurnM, // base 1.0
        hasTurningHead: false,
        roadLengthToEndM: 50,
        vehicleProfile: swb,
      });
      const penalised = computeTurnScore({
        roadWidthM: swb.minRoadWidthTurnM,
        hasTurningHead: false,
        roadLengthToEndM: 19,
        vehicleProfile: swb,
      });
      expect(penalised).toBeCloseTo(base * 0.50, 5);
    });

    test('20m to end → NO dead-end penalty', () => {
      const score = computeTurnScore({
        roadWidthM: swb.minRoadWidthTurnM,
        hasTurningHead: false,
        roadLengthToEndM: 20,
        vehicleProfile: swb,
      });
      expect(score).toBe(1.0);
    });

    test('0m to end with turning head → 0.30 × 0.50 = 0.15', () => {
      const score = computeTurnScore({
        roadWidthM: 0,
        hasTurningHead: true,
        roadLengthToEndM: 5,
        vehicleProfile: swb,
      });
      expect(score).toBeCloseTo(0.15, 5);
    });
  });

  describe('community score blending (60/40)', () => {
    test('1 report → blends 60% base + 40% community', () => {
      const score = computeTurnScore({
        roadWidthM: swb.minRoadWidthTurnM, // base = 1.0
        hasTurningHead: false,
        roadLengthToEndM: 50,
        vehicleProfile: swb,
        communityScore: 0.5,
        communityReportCount: 1,
      });
      expect(score).toBeCloseTo(0.60 * 1.0 + 0.40 * 0.5, 5);
    });

    test('0 reports → community score ignored, pure base used', () => {
      const withCommunity = computeTurnScore({
        roadWidthM: swb.minRoadWidthTurnM,
        hasTurningHead: false,
        roadLengthToEndM: 50,
        vehicleProfile: swb,
        communityScore: 0.0,
        communityReportCount: 0,
      });
      expect(withCommunity).toBe(1.0);
    });

    test('blended result clamped to [0, 1]', () => {
      const score = computeTurnScore({
        roadWidthM: 20,
        hasTurningHead: true,
        roadLengthToEndM: 50,
        vehicleProfile: car,
        communityScore: 2.0,
        communityReportCount: 5,
      });
      expect(score).toBeLessThanOrEqual(1.0);
      expect(score).toBeGreaterThanOrEqual(0.0);
    });
  });

  describe('vehicle profile comparisons — same road, different vehicles', () => {
    const road = 5.0; // 5.0m wide road

    test('car (needs 3.5m) → GREEN territory', () => {
      const score = computeTurnScore({ roadWidthM: road, hasTurningHead: false, roadLengthToEndM: 50, vehicleProfile: car });
      expect(getTurnAlert(score)).toBe('GREEN');
    });

    test('SWB van (needs 4.5m) → GREEN on 5.0m', () => {
      const score = computeTurnScore({ roadWidthM: road, hasTurningHead: false, roadLengthToEndM: 50, vehicleProfile: swb });
      expect(getTurnAlert(score)).toBe('GREEN');
    });

    test('Luton (needs 5.8m) → RED on 5.0m', () => {
      const score = computeTurnScore({ roadWidthM: road, hasTurningHead: false, roadLengthToEndM: 50, vehicleProfile: luton });
      expect(getTurnAlert(score)).toBe('RED');
    });

    test('7.5t HGV (needs 7.0m) → RED on 5.0m', () => {
      const score = computeTurnScore({ roadWidthM: road, hasTurningHead: false, roadLengthToEndM: 50, vehicleProfile: hgv });
      expect(getTurnAlert(score)).toBe('RED');
    });

    test('Artic (needs 12.5m) → RED on 5.0m', () => {
      const score = computeTurnScore({ roadWidthM: road, hasTurningHead: false, roadLengthToEndM: 50, vehicleProfile: artic });
      expect(getTurnAlert(score)).toBe('RED');
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. getTurnAlert()
// ─────────────────────────────────────────────────────────────────────────────

describe('getTurnAlert()', () => {
  test('score 1.0 → GREEN',  () => expect(getTurnAlert(1.0)).toBe('GREEN'));
  test('score 0.75 → GREEN', () => expect(getTurnAlert(0.75)).toBe('GREEN'));
  test('score 0.74 → AMBER', () => expect(getTurnAlert(0.74)).toBe('AMBER'));
  test('score 0.40 → AMBER', () => expect(getTurnAlert(0.40)).toBe('AMBER'));
  test('score 0.39 → RED',   () => expect(getTurnAlert(0.39)).toBe('RED'));
  test('score 0.0 → RED',    () => expect(getTurnAlert(0.0)).toBe('RED'));
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. computeBridgeScore()
// ─────────────────────────────────────────────────────────────────────────────

describe('computeBridgeScore()', () => {

  describe('definite strikes — must reroute', () => {
    test('vehicle taller than bridge → score 0, mustReroute true, rawGap negative', () => {
      const result = computeBridgeScore({
        bridgeClearanceM: 3.0,
        vehicleHeightM: 3.5,
        confidence: 'HIGH',
        isSigned: true,
      });
      expect(result.score).toBe(0.0);
      expect(result.mustReroute).toBe(true);
      expect(result.rawGapM).toBeLessThan(0);
    });

    test('rawGap < 100mm → mustReroute true', () => {
      const result = computeBridgeScore({
        bridgeClearanceM: 3.01,   // 3.01 - (2.7 + 0.30) = 10mm gap
        vehicleHeightM: 2.7,
        safetyMarginM: 0.30,
        confidence: 'HIGH',
        isSigned: true,
      });
      expect(result.mustReroute).toBe(true);
      expect(result.score).toBe(0.0);
    });
  });

  describe('confidence multipliers', () => {
    const base = {
      bridgeClearanceM: 4.5,
      vehicleHeightM: 3.5,
      safetyMarginM: 0.30,
      isSigned: true,
    };

    test('HIGH confidence → full base score', () => {
      const { score } = computeBridgeScore({ ...base, confidence: 'HIGH' });
      // rawGap = 4.5 - 3.8 = 0.70m ≥ 0.50 → baseScore = 1.0 × 1.0 = 1.0
      expect(score).toBe(1.0);
    });

    test('MEDIUM confidence → 0.85 × base', () => {
      const { score } = computeBridgeScore({ ...base, confidence: 'MEDIUM' });
      expect(score).toBeCloseTo(0.85, 5);
    });

    test('LOW confidence → 0.65 × base', () => {
      const { score } = computeBridgeScore({ ...base, confidence: 'LOW' });
      expect(score).toBeCloseTo(0.65, 5);
    });
  });

  describe('unsigned bridge penalty (×0.75 when bridge < 5.03m and unsigned)', () => {
    test('unsigned 3.5m bridge → additional 0.75 penalty', () => {
      const signed = computeBridgeScore({
        bridgeClearanceM: 3.5,
        vehicleHeightM: 2.2,
        safetyMarginM: 0.30,
        confidence: 'MEDIUM',
        isSigned: true,
      });
      const unsigned = computeBridgeScore({
        bridgeClearanceM: 3.5,
        vehicleHeightM: 2.2,
        safetyMarginM: 0.30,
        confidence: 'MEDIUM',
        isSigned: false,
      });
      // unsigned score should be ~75% of signed score
      expect(unsigned.score).toBeCloseTo(signed.score * 0.75, 4);
    });

    test('unsigned bridge ≥ 5.03m → no unsigned penalty applied', () => {
      const signed = computeBridgeScore({
        bridgeClearanceM: 5.5,
        vehicleHeightM: 2.2,
        safetyMarginM: 0.30,
        confidence: 'MEDIUM',
        isSigned: true,
      });
      const unsigned = computeBridgeScore({
        bridgeClearanceM: 5.5,
        vehicleHeightM: 2.2,
        safetyMarginM: 0.30,
        confidence: 'MEDIUM',
        isSigned: false,
      });
      expect(unsigned.score).toBeCloseTo(signed.score, 5);
    });
  });

  describe('community verification boost', () => {
    test('community verified + MEDIUM confidence → score higher than unverified', () => {
      const verified = computeBridgeScore({
        bridgeClearanceM: 3.8,
        vehicleHeightM: 2.7,
        safetyMarginM: 0.30,
        confidence: 'MEDIUM',
        isSigned: true,
        communityVerified: true,
      });
      const unverified = computeBridgeScore({
        bridgeClearanceM: 3.8,
        vehicleHeightM: 2.7,
        safetyMarginM: 0.30,
        confidence: 'MEDIUM',
        isSigned: true,
        communityVerified: false,
      });
      expect(verified.score).toBeGreaterThan(unverified.score);
    });

    test('community verified + HIGH confidence → score not boosted above 1.0', () => {
      const result = computeBridgeScore({
        bridgeClearanceM: 10.0,
        vehicleHeightM: 2.0,
        safetyMarginM: 0.30,
        confidence: 'HIGH',
        isSigned: true,
        communityVerified: true,
      });
      expect(result.score).toBeLessThanOrEqual(1.0);
    });
  });

  describe('default safety margin (0.30m)', () => {
    test('omitting safetyMarginM uses 0.30m default', () => {
      const withDefault = computeBridgeScore({
        bridgeClearanceM: 4.0,
        vehicleHeightM: 3.0,
        confidence: 'HIGH',
        isSigned: true,
      });
      const explicit = computeBridgeScore({
        bridgeClearanceM: 4.0,
        vehicleHeightM: 3.0,
        safetyMarginM: 0.30,
        confidence: 'HIGH',
        isSigned: true,
      });
      expect(withDefault.score).toBe(explicit.score);
    });
  });

  describe('score always in [0, 1]', () => {
    test.each([
      [2.0, 1.5, 0.30, 'HIGH',   true],
      [3.5, 3.0, 0.30, 'MEDIUM', false],
      [4.0, 4.5, 0.30, 'LOW',    false],
      [5.0, 2.0, 0.10, 'HIGH',   true],
    ] as const)(
      'bridge %.1fm, vehicle %.1fm → score in [0,1]',
      (bridge, veh, margin, conf, signed) => {
        const { score } = computeBridgeScore({
          bridgeClearanceM: bridge,
          vehicleHeightM: veh,
          safetyMarginM: margin,
          confidence: conf,
          isSigned: signed,
        });
        expect(score).toBeGreaterThanOrEqual(0.0);
        expect(score).toBeLessThanOrEqual(1.0);
      }
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. getBridgeAlert()
// ─────────────────────────────────────────────────────────────────────────────

describe('getBridgeAlert()', () => {
  test('rawGap < 0 → EMERGENCY regardless of score',  () => expect(getBridgeAlert(0.0, -0.1)).toBe('EMERGENCY'));
  test('score 1.0, rawGap ≥ 0 → CLEAR',              () => expect(getBridgeAlert(1.0, 0.5)).toBe('CLEAR'));
  test('score 0.90, rawGap ≥ 0 → INFO',               () => expect(getBridgeAlert(0.90, 0.3)).toBe('INFO'));
  test('score 0.80, rawGap ≥ 0 → INFO',               () => expect(getBridgeAlert(0.80, 0.2)).toBe('INFO'));
  test('score 0.79, rawGap ≥ 0 → AMBER',              () => expect(getBridgeAlert(0.79, 0.15)).toBe('AMBER'));
  test('score 0.40, rawGap ≥ 0 → AMBER',              () => expect(getBridgeAlert(0.40, 0.1)).toBe('AMBER'));
  test('score 0.39, rawGap ≥ 0 → RED',                () => expect(getBridgeAlert(0.39, 0.05)).toBe('RED'));
  test('score 0.0, rawGap ≥ 0 → RED',                 () => expect(getBridgeAlert(0.0, 0.0)).toBe('RED'));
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. evaluateClosure()
// ─────────────────────────────────────────────────────────────────────────────

describe('evaluateClosure()', () => {

  const baseClosure: RoadClosure = {
    id: 'test-001',
    lat: 51.5, lng: -0.1,
    radiusM: 100,
    severity: 'LANE_CLOSURE',
    source: 'NTIS_LIVE',
    startsAt: '2026-06-06T10:00:00Z',
    endsAt: '2026-06-06T18:00:00Z',
    description: 'Lane works',
  };

  test('FULL_CLOSURE → always REROUTE regardless of vehicle', () => {
    const result = evaluateClosure({ ...baseClosure, severity: 'FULL_CLOSURE' }, swb);
    expect(result.action).toBe('REROUTE');
    expect(result.affected).toBe(true);
  });

  test('LANE_CLOSURE → WARN for affected vehicle', () => {
    const result = evaluateClosure({ ...baseClosure, severity: 'LANE_CLOSURE' }, swb);
    expect(result.action).toBe('WARN');
    expect(result.affected).toBe(true);
  });

  test('CONTRAFLOW → WARN', () => {
    const result = evaluateClosure({ ...baseClosure, severity: 'CONTRAFLOW' }, swb);
    expect(result.action).toBe('WARN');
    expect(result.affected).toBe(true);
  });

  test('HEIGHT_RESTRICTION blocks tall vehicle', () => {
    const result = evaluateClosure(
      { ...baseClosure, severity: 'LANE_CLOSURE', heightRestrictionM: 2.5 },
      hgv // height 3.5m > 2.5m restriction
    );
    expect(result.action).toBe('REROUTE');
    expect(result.reason).toMatch(/Height restriction/);
  });

  test('HEIGHT_RESTRICTION passes short vehicle', () => {
    const result = evaluateClosure(
      { ...baseClosure, severity: 'LANE_CLOSURE', heightRestrictionM: 2.5 },
      car // height 1.5m < 2.5m restriction
    );
    // Should not reroute due to height (may still warn for lane closure)
    expect(result.action).not.toBe('REROUTE');
  });

  test('WEIGHT_RESTRICTION blocks heavy vehicle', () => {
    const result = evaluateClosure(
      { ...baseClosure, severity: 'LANE_CLOSURE', weightRestrictionT: 3.5 },
      hgv // maxWeightT 7.5t > 3.5t restriction
    );
    expect(result.action).toBe('REROUTE');
    expect(result.reason).toMatch(/Weight restriction/);
  });

  test('WEIGHT_RESTRICTION passes light vehicle', () => {
    const result = evaluateClosure(
      { ...baseClosure, severity: 'LANE_CLOSURE', weightRestrictionT: 7.5 },
      car // maxWeightT 2.0t < 7.5t restriction
    );
    expect(result.action).not.toBe('REROUTE');
  });

  test('closure affects only specific vehicle classes → PASS for unlisted vehicle', () => {
    const result = evaluateClosure(
      { ...baseClosure, severity: 'LANE_CLOSURE', affectsVehicleClasses: ['hgv_75t', 'hgv_18t'] },
      swb // van_swb not in list
    );
    expect(result.action).toBe('PASS');
    expect(result.affected).toBe(false);
  });

  test('closure affects specific vehicle classes → WARN for listed vehicle', () => {
    const result = evaluateClosure(
      { ...baseClosure, severity: 'LANE_CLOSURE', affectsVehicleClasses: ['van_swb', 'van_lwb'] },
      swb
    );
    expect(result.action).toBe('WARN');
    expect(result.affected).toBe(true);
  });

  test('SPEED_RESTRICTION with no height/weight/class limits → PASS', () => {
    const result = evaluateClosure({ ...baseClosure, severity: 'SPEED_RESTRICTION' }, swb);
    expect(result.action).toBe('PASS');
    expect(result.affected).toBe(false);
  });

  test('indefinite closure (endsAt null) is handled', () => {
    const result = evaluateClosure(
      { ...baseClosure, severity: 'FULL_CLOSURE', endsAt: null },
      swb
    );
    expect(result.action).toBe('REROUTE');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 7. ALERT_DISTANCES — guard correct values
// ─────────────────────────────────────────────────────────────────────────────

describe('ALERT_DISTANCES', () => {
  test('turn AMBER at 300m', () => expect(ALERT_DISTANCES.turn.AMBER).toBe(300));
  test('turn RED at 500m',   () => expect(ALERT_DISTANCES.turn.RED).toBe(500));

  test('bridge INFO at 300m',        () => expect(ALERT_DISTANCES.bridge.INFO).toBe(300));
  test('bridge AMBER at 500m',       () => expect(ALERT_DISTANCES.bridge.AMBER).toBe(500));
  test('bridge RED at 800m',         () => expect(ALERT_DISTANCES.bridge.RED).toBe(800));
  test('bridge EMERGENCY at 1000m',  () => expect(ALERT_DISTANCES.bridge.EMERGENCY).toBe(1000));

  test('closure WARN at 500m',       () => expect(ALERT_DISTANCES.closure.WARN).toBe(500));
  test('closure REROUTE at 800m',    () => expect(ALERT_DISTANCES.closure.REROUTE).toBe(800));
});
