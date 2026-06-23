import { getTrolleyAdvisory } from '../trolley-advisory';
import type { DriverWeightInput, StopContext } from '../trolley-advisory';

const groundFloor: StopContext = {
  walkDistanceM: 10,
  floorNumber: 0,
  liftAvailable: true,
  hasSteps: false,
};

const hardStop: StopContext = {
  walkDistanceM: 90,
  floorNumber: 3,
  liftAvailable: false,
  hasSteps: true,
};

describe('getTrolleyAdvisory', () => {
  describe('driver has NOT flagged heavy + single parcel', () => {
    it('returns NONE regardless of floor or walk distance', () => {
      const result = getTrolleyAdvisory(
        { heavyToggle: false, parcelCount: 1 },
        hardStop,
      );
      expect(result.level).toBe('NONE');
      expect(result.message).toBe('');
      expect(result.score).toBe(0);
    });

    it('returns NONE even on floor 10 with no lift', () => {
      const result = getTrolleyAdvisory(
        { heavyToggle: false, parcelCount: 1 },
        { walkDistanceM: 200, floorNumber: 10, liftAvailable: false, hasSteps: true },
      );
      expect(result.level).toBe('NONE');
    });
  });

  describe('driver taps heavy toggle (no kg)', () => {
    it('returns SUGGESTED for ground floor short walk', () => {
      const result = getTrolleyAdvisory(
        { heavyToggle: true, parcelCount: 1 },
        groundFloor,
      );
      expect(result.level).toBe('SUGGESTED');
      expect(result.message).toContain('Trolley recommended');
    });

    it('returns REQUIRED for long walk + upper floor + no lift', () => {
      const result = getTrolleyAdvisory(
        { heavyToggle: true, parcelCount: 1 },
        hardStop,
      );
      expect(result.level).toBe('REQUIRED');
      expect(result.message).toContain('Use trolley');
    });

    it('includes walk distance in factors when over threshold', () => {
      const result = getTrolleyAdvisory(
        { heavyToggle: true, parcelCount: 1 },
        { walkDistanceM: 90, floorNumber: 0, liftAvailable: true, hasSteps: false },
      );
      expect(result.factors.some(f => f.includes('90m'))).toBe(true);
    });
  });

  describe('driver enters exact kg', () => {
    it('returns NONE for 10kg light parcel', () => {
      const result = getTrolleyAdvisory(
        { heavyToggle: false, weightKg: 10, parcelCount: 1 },
        groundFloor,
      );
      expect(result.level).toBe('NONE');
    });

    it('returns SUGGESTED for 18kg parcel on ground floor', () => {
      const result = getTrolleyAdvisory(
        { heavyToggle: false, weightKg: 18, parcelCount: 1 },
        groundFloor,
      );
      expect(result.level).toBe('SUGGESTED');
    });

    it('returns REQUIRED for 30kg parcel', () => {
      const result = getTrolleyAdvisory(
        { heavyToggle: false, weightKg: 30, parcelCount: 1 },
        groundFloor,
      );
      expect(result.level).toBe('REQUIRED');
    });

    it('factors includes weight label', () => {
      const result = getTrolleyAdvisory(
        { heavyToggle: false, weightKg: 30, parcelCount: 1 },
        groundFloor,
      );
      expect(result.factors.some(f => f.includes('30kg'))).toBe(true);
    });
  });

  describe('multiple parcels (no heavy flag)', () => {
    it('returns NONE for 2 parcels', () => {
      const result = getTrolleyAdvisory(
        { heavyToggle: false, parcelCount: 2 },
        groundFloor,
      );
      expect(result.level).toBe('NONE');
    });

    it('returns SUGGESTED for 5 parcels on upper floor', () => {
      const result = getTrolleyAdvisory(
        { heavyToggle: false, parcelCount: 5 },
        { walkDistanceM: 40, floorNumber: 2, liftAvailable: true, hasSteps: false },
      );
      expect(result.level).not.toBe('NONE');
    });

    it('includes parcel count in factors', () => {
      const result = getTrolleyAdvisory(
        { heavyToggle: false, parcelCount: 6 },
        hardStop,
      );
      expect(result.factors.some(f => f.includes('6 parcels'))).toBe(true);
    });
  });

  describe('steps bonus', () => {
    it('adds steps to factors when hasSteps is true and heavy flagged', () => {
      const result = getTrolleyAdvisory(
        { heavyToggle: true, parcelCount: 1 },
        { walkDistanceM: 10, floorNumber: 0, liftAvailable: true, hasSteps: true },
      );
      expect(result.factors.some(f => f.toLowerCase().includes('step'))).toBe(true);
    });
  });
});
