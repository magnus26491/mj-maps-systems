/**
 * Unit tests for the apartment floor estimation and lift inference.
 * No HTTP calls required.
 */

import {
  estimateFloorFromAddress,
  inferLiftStatus,
  calculateFloorPenalty,
  calculateDifficultyScore,
} from '../apartment-engine';

// ─── FLOOR ESTIMATION ──────────────────────────────────────────────────────

describe('estimateFloorFromAddress', () => {
  describe('floor-prefixed flat numbers (Flat 1xx = floor 1)', () => {
    it('Flat 101 → floor 1', () => {
      expect(estimateFloorFromAddress('Flat 101, Tower Block').floor).toBe(1);
    });
    it('Flat 305 → floor 3', () => {
      expect(estimateFloorFromAddress('Flat 305, Riverside House').floor).toBe(3);
    });
    it('Flat 1204 → floor 12', () => {
      expect(estimateFloorFromAddress('Flat 1204, Sky Tower').floor).toBe(12);
    });
  });

  describe('low flat numbers using flats-per-floor', () => {
    it('Flat 1 with 4 fpf → floor 0 (ground)', () => {
      expect(estimateFloorFromAddress('Flat 1', 6, 4).floor).toBe(0);
    });
    it('Flat 5 with 4 fpf → floor 1', () => {
      expect(estimateFloorFromAddress('Flat 5', 6, 4).floor).toBe(1);
    });
    it('Flat 9 with 4 fpf → floor 2', () => {
      expect(estimateFloorFromAddress('Flat 9', 6, 4).floor).toBe(2);
    });
  });

  describe('identifier prefix patterns', () => {
    it('GF1 → floor 0', () => {
      expect(estimateFloorFromAddress('Flat GF1, The Court').floor).toBe(0);
    });
    it('G12 → floor 0', () => {
      expect(estimateFloorFromAddress('Flat G12').floor).toBe(0);
    });
    it('LG3 → floor -1 (lower ground)', () => {
      expect(estimateFloorFromAddress('Flat LG3').floor).toBe(-1);
    });
    it('B2 → floor -1 (basement)', () => {
      expect(estimateFloorFromAddress('Flat B2').floor).toBe(-1);
    });
  });

  describe('letter-suffixed flat numbers', () => {
    it('Flat 1A → floor 0', () => {
      expect(estimateFloorFromAddress('Flat 1A').floor).toBe(0);
    });
    it('Flat 3B → floor 2', () => {
      expect(estimateFloorFromAddress('Flat 3B').floor).toBe(2);
    });
  });

  describe('explicit floor mention in address', () => {
    it('Ground Floor → 0', () => {
      expect(estimateFloorFromAddress('Flat 2, Ground Floor, Maple House').floor).toBe(0);
    });
    it('3rd Floor → 3', () => {
      expect(estimateFloorFromAddress('Flat 7, 3rd Floor, Tower').floor).toBe(3);
    });
  });
});

// ─── LIFT INFERENCE ──────────────────────────────────────────────────────

describe('inferLiftStatus', () => {
  it('returns CONFIRMED_YES when community reports have lift (3+ reports)', () => {
    const result = inferLiftStatus({}, { hasLift: true, reportCount: 4 });
    expect(result.status).toBe('CONFIRMED_YES');
    expect(result.source).toBe('COMMUNITY');
  });

  it('returns CONFIRMED_NO when community reports confirm no lift (3+ reports)', () => {
    const result = inferLiftStatus({}, { hasLift: false, reportCount: 5 });
    expect(result.status).toBe('CONFIRMED_NO');
  });

  it('ignores community reports with fewer than 3 reports', () => {
    const result = inferLiftStatus({ totalFloors: 10 }, { hasLift: true, reportCount: 2 });
    expect(result.status).toBe('LIKELY_YES'); // falls to height inference
  });

  it('returns CONFIRMED_YES when OSM elevator tag present', () => {
    const result = inferLiftStatus({ hasElevatorTag: true });
    expect(result.status).toBe('CONFIRMED_YES');
    expect(result.source).toBe('OSM');
  });

  it('LIKELY_YES for 10+ floor building', () => {
    const result = inferLiftStatus({ totalFloors: 10 });
    expect(result.status).toBe('LIKELY_YES');
    expect(result.confidence).toBe('HIGH');
  });

  it('LIKELY_NO for 3-floor building with no OSM tag', () => {
    const result = inferLiftStatus({ totalFloors: 3 });
    expect(result.status).toBe('LIKELY_NO');
  });

  it('UNKNOWN when no floors and no OSM tag', () => {
    const result = inferLiftStatus({});
    expect(result.status).toBe('UNKNOWN');
  });
});

// ─── FLOOR PENALTY ──────────────────────────────────────────────────────

describe('calculateFloorPenalty', () => {
  it('returns 0 for ground floor', () => {
    expect(calculateFloorPenalty({ floor: 0, liftStatus: 'CONFIRMED_YES', parcelCount: 1, totalWeightKg: 2, isOversize: false })).toBe(0);
  });

  it('stairs penalty > lift penalty for same floor', () => {
    const lift   = calculateFloorPenalty({ floor: 3, liftStatus: 'CONFIRMED_YES', parcelCount: 1, totalWeightKg: 2, isOversize: false });
    const stairs = calculateFloorPenalty({ floor: 3, liftStatus: 'CONFIRMED_NO',  parcelCount: 1, totalWeightKg: 2, isOversize: false });
    expect(stairs).toBeGreaterThan(lift);
  });

  it('oversize increases penalty', () => {
    const normal   = calculateFloorPenalty({ floor: 3, liftStatus: 'LIKELY_YES', parcelCount: 1, totalWeightKg: 5, isOversize: false });
    const oversize = calculateFloorPenalty({ floor: 3, liftStatus: 'LIKELY_YES', parcelCount: 1, totalWeightKg: 5, isOversize: true });
    expect(oversize).toBeGreaterThan(normal);
  });

  it('multiple parcels increase penalty', () => {
    const one  = calculateFloorPenalty({ floor: 4, liftStatus: 'LIKELY_YES', parcelCount: 1, totalWeightKg: 3, isOversize: false });
    const two  = calculateFloorPenalty({ floor: 4, liftStatus: 'LIKELY_YES', parcelCount: 2, totalWeightKg: 3, isOversize: false });
    expect(two).toBeGreaterThan(one);
  });
});

// ─── DIFFICULTY SCORE ─────────────────────────────────────────────────────

describe('calculateDifficultyScore', () => {
  it('ground floor light parcel = low score', () => {
    const score = calculateDifficultyScore({
      floor: 0, liftStatus: 'CONFIRMED_YES', parcelCount: 1,
      totalWeightKg: 1, isOversize: false, hasIntercom: false, floorPenaltyMinutes: 0,
    });
    expect(score).toBeLessThanOrEqual(2);
  });

  it('high floor no lift heavy parcel = high score', () => {
    const score = calculateDifficultyScore({
      floor: 6, liftStatus: 'CONFIRMED_NO', parcelCount: 2,
      totalWeightKg: 20, isOversize: true, hasIntercom: true, floorPenaltyMinutes: 8,
    });
    expect(score).toBeGreaterThanOrEqual(4);
  });

  it('score is capped at 5', () => {
    const score = calculateDifficultyScore({
      floor: 20, liftStatus: 'CONFIRMED_NO', parcelCount: 5,
      totalWeightKg: 30, isOversize: true, hasIntercom: true, floorPenaltyMinutes: 20,
    });
    expect(score).toBeLessThanOrEqual(5);
  });
});
