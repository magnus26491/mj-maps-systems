/**
 * Trolley & Equipment Advisory
 *
 * Advises drivers on the safest, most efficient equipment for each stop:
 * sack truck, two-wheel barrow, four-wheel cage trolley, pallet truck,
 * manual carry only.
 *
 * Scoring factors:
 *  · Parcel count + estimated weight
 *  · Distance from van park to door (walking metres)
 *  · Floor level / lift availability
 *  · Surface type (kerb, gravel, steps, ramp, smooth pavement)
 *  · Time of day (congestion risk for trolley in pedestrian areas)
 *
 * This solves the complaint of drivers dragging cage trolleys over
 * cobblestones, up steps, or through tight gates unnecessarily.
 */

export type EquipmentType =
  | 'manual_carry'
  | 'sack_truck'
  | 'two_wheel_trolley'
  | 'four_wheel_cage'
  | 'pallet_truck'
  | 'pump_truck';

export type SurfaceType =
  | 'smooth_pavement'
  | 'cobblestone'
  | 'gravel'
  | 'grass'
  | 'steps'
  | 'ramp'
  | 'mixed';

export interface StopAccessProfile {
  walkingMetres:     number;
  parcelCount:       number;
  estimatedWeightKg: number;
  floorLevel:        number;    // 0 = ground, 1+ = upper floors
  liftAvailable:     boolean;
  surfaceType:       SurfaceType;
  gateWidthM?:       number;    // If known — cage trolleys need 0.75m+
  stepCount:         number;
}

export interface TrolleyRecommendation {
  equipment:     EquipmentType;
  reason:        string;
  riskLevel:     'low' | 'medium' | 'high';
  estimatedMins: number;   // Estimated time to complete stop with this equipment
}

/**
 * Recommend the optimal equipment for a stop.
 */
export function recommendEquipment(
  profile: StopAccessProfile,
): TrolleyRecommendation {
  const { walkingMetres, parcelCount, estimatedWeightKg,
          floorLevel, liftAvailable, surfaceType, gateWidthM, stepCount } = profile;

  // Steps with no lift — always manual carry
  if (stepCount > 0 && !liftAvailable && floorLevel > 0) {
    return {
      equipment:     'manual_carry',
      reason:        `${stepCount} steps with no lift — manual carry only`,
      riskLevel:     estimatedWeightKg > 15 ? 'high' : 'medium',
      estimatedMins: Math.ceil(parcelCount * 1.5 + stepCount * 0.5),
    };
  }

  // Cobblestone / gravel — wheeled equipment risky
  if (surfaceType === 'cobblestone' || surfaceType === 'gravel') {
    if (estimatedWeightKg > 20) {
      return {
        equipment:     'sack_truck',
        reason:        `${surfaceType} surface — sack truck preferred over cage trolley`,
        riskLevel:     'medium',
        estimatedMins: Math.ceil(walkingMetres / 30 + parcelCount * 0.8),
      };
    }
    return {
      equipment:     'manual_carry',
      reason:        `${surfaceType} surface with light load — manual carry fastest`,
      riskLevel:     'low',
      estimatedMins: Math.ceil(walkingMetres / 50 + parcelCount * 0.5),
    };
  }

  // Gate width constraint
  if (gateWidthM !== undefined && gateWidthM < 0.75) {
    return {
      equipment:     parcelCount > 3 ? 'sack_truck' : 'manual_carry',
      reason:        `Gate width ${gateWidthM}m — cage trolley cannot pass`,
      riskLevel:     'low',
      estimatedMins: Math.ceil(walkingMetres / 40 + parcelCount * 0.7),
    };
  }

  // Heavy multi-parcel load on smooth surface — cage trolley
  if (parcelCount >= 5 && estimatedWeightKg > 25 && surfaceType === 'smooth_pavement') {
    return {
      equipment:     'four_wheel_cage',
      reason:        `${parcelCount} parcels ${estimatedWeightKg}kg on smooth surface — cage trolley most efficient`,
      riskLevel:     'low',
      estimatedMins: Math.ceil(walkingMetres / 20 + parcelCount * 0.4),
    };
  }

  // Medium load — sack truck
  if (parcelCount >= 3 || estimatedWeightKg > 15) {
    return {
      equipment:     'sack_truck',
      reason:        `${parcelCount} parcels / ${estimatedWeightKg}kg — sack truck recommended`,
      riskLevel:     'low',
      estimatedMins: Math.ceil(walkingMetres / 35 + parcelCount * 0.6),
    };
  }

  // Light single parcel
  return {
    equipment:     'manual_carry',
    reason:        `Light load (${parcelCount} parcel, ${estimatedWeightKg}kg) — manual carry`,
    riskLevel:     'low',
    estimatedMins: Math.ceil(walkingMetres / 60 + parcelCount * 0.3),
  };
}
