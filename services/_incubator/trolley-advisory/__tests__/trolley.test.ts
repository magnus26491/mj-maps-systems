/**
 * Trolley advisory unit tests
 */
import { recommendEquipment } from '../src/index';
import type { StopAccessProfile } from '../src/index';

const base: StopAccessProfile = {
  walkingMetres: 30, parcelCount: 2, estimatedWeightKg: 10,
  floorLevel: 0, liftAvailable: false, surfaceType: 'smooth_pavement',
  stepCount: 0,
};

describe('recommendEquipment', () => {
  it('recommends manual carry for light single parcel', () => {
    const r = recommendEquipment({ ...base, parcelCount: 1, estimatedWeightKg: 5 });
    expect(r.equipment).toBe('manual_carry');
  });

  it('recommends sack truck for medium load', () => {
    const r = recommendEquipment({ ...base, parcelCount: 4, estimatedWeightKg: 20 });
    expect(r.equipment).toBe('sack_truck');
  });

  it('recommends four_wheel_cage for heavy multi-parcel on smooth surface', () => {
    const r = recommendEquipment({
      ...base, parcelCount: 8, estimatedWeightKg: 40,
      surfaceType: 'smooth_pavement',
    });
    expect(r.equipment).toBe('four_wheel_cage');
  });

  it('recommends manual carry on cobblestone light load', () => {
    const r = recommendEquipment({ ...base, surfaceType: 'cobblestone', estimatedWeightKg: 8 });
    expect(r.equipment).toBe('manual_carry');
  });

  it('recommends sack truck on cobblestone heavy load', () => {
    const r = recommendEquipment({ ...base, surfaceType: 'cobblestone', estimatedWeightKg: 25, parcelCount: 4 });
    expect(r.equipment).toBe('sack_truck');
  });

  it('forces manual carry on steps with no lift', () => {
    const r = recommendEquipment({ ...base, stepCount: 4, floorLevel: 1, liftAvailable: false });
    expect(r.equipment).toBe('manual_carry');
    expect(r.reason).toContain('steps');
  });

  it('forces narrow equipment through tight gate', () => {
    const r = recommendEquipment({ ...base, gateWidthM: 0.5, parcelCount: 5, estimatedWeightKg: 20 });
    expect(['manual_carry', 'sack_truck']).toContain(r.equipment);
    expect(r.reason).toContain('Gate width');
  });

  it('always returns an estimatedMins > 0', () => {
    const r = recommendEquipment(base);
    expect(r.estimatedMins).toBeGreaterThan(0);
  });

  it('returns a riskLevel', () => {
    const r = recommendEquipment(base);
    expect(['low', 'medium', 'high']).toContain(r.riskLevel);
  });
});
