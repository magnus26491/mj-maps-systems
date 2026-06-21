/**
 * Vehicle Intelligence Service
 * 
 * Evaluates vehicle compatibility with delivery locations.
 * Checks: weight, height, width, length, turning radius, restrictions.
 */

import { pool } from '../../services/db/index';
import type { VehicleProfile, VehicleRestriction } from '../../delivery-copilot/types';

export interface VehicleAssessment {
  vehicleId: string;
  vehicleType: 'VAN' | 'LUTON' | 'RIGID' | 'ARTICULATED';
  
  // Dimensions
  weight: number; // tonnes
  height: number; // metres
  width: number; // metres
  length: number; // metres
  
  // Turning
  turningCircle: number;
  
  // Assessment results
  accessible: boolean;
  restrictions: VehicleRestriction[];
  loadingBayRequired: boolean;
  alternativeAccess?: {
    type: 'LOADING_BAY' | 'SIDE_ENTRANCE' | 'REAR_ENTRANCE' | 'CUSTOMER_ACCESS';
    description: string;
    distanceMetres: number;
    walkTime: string;
  };
  
  // Confidence
  confidence: number;
}

// ─── Pre-defined Vehicle Profiles ───────────────────────────────────────────────

export const VEHICLE_PROFILES: Record<string, VehicleProfile> = {
  'TRANSIT_SWB_GB': {
    vehicleId: 'TRANSIT_SWB_GB',
    type: 'VAN',
    weight: 2.0,
    height: 2.7,
    width: 2.1,
    length: 4.9,
    turningCircle: 11.0,
    turningRadius: 5.5,
    hasWeightRestriction: false,
    hasHeightRestriction: false,
    hasWidthRestriction: false,
    maxRoadWidth: 2.5,
    minRoadWidth: 2.0,
  },
  'TRANSIT_LWB_GB': {
    vehicleId: 'TRANSIT_LWB_GB',
    type: 'VAN',
    weight: 2.1,
    height: 2.7,
    width: 2.1,
    length: 5.5,
    turningCircle: 12.2,
    turningRadius: 6.1,
    hasWeightRestriction: false,
    hasHeightRestriction: false,
    hasWidthRestriction: false,
    maxRoadWidth: 2.5,
    minRoadWidth: 2.0,
  },
  'LUTON_35_TIPPER': {
    vehicleId: 'LUTON_35_TIPPER',
    type: 'LUTON',
    weight: 3.5,
    height: 3.2,
    width: 2.2,
    length: 6.0,
    turningCircle: 13.5,
    turningRadius: 6.75,
    hasWeightRestriction: false,
    hasHeightRestriction: false,
    hasWidthRestriction: false,
    maxRoadWidth: 2.5,
    minRoadWidth: 2.2,
  },
  'RIGID_75': {
    vehicleId: 'RIGID_75',
    type: 'RIGID',
    weight: 7.5,
    height: 3.5,
    width: 2.5,
    length: 8.0,
    turningCircle: 18.0,
    turningRadius: 9.0,
    hasWeightRestriction: true,
    hasHeightRestriction: true,
    hasWidthRestriction: false,
    maxRoadWidth: 3.0,
    minRoadWidth: 2.5,
  },
  'RIGID_120': {
    vehicleId: 'RIGID_120',
    type: 'RIGID',
    weight: 12.0,
    height: 4.0,
    width: 2.5,
    length: 10.0,
    turningCircle: 22.0,
    turningRadius: 11.0,
    hasWeightRestriction: true,
    hasHeightRestriction: true,
    hasWidthRestriction: false,
    maxRoadWidth: 3.5,
    minRoadWidth: 3.0,
  },
  'ARTICULATED_180': {
    vehicleId: 'ARTICULATED_180',
    type: 'ARTICULATED',
    weight: 18.0,
    height: 4.5,
    width: 2.5,
    length: 16.5,
    turningCircle: 32.0,
    turningRadius: 16.0,
    hasWeightRestriction: true,
    hasHeightRestriction: true,
    hasWidthRestriction: true,
    maxRoadWidth: 4.0,
    minRoadWidth: 3.5,
  },
};

// ─── Assessment Functions ─────────────────────────────────────────────────────────

/**
 * Get vehicle profile by ID.
 */
export function getVehicleProfile(vehicleId: string): VehicleProfile | null {
  return VEHICLE_PROFILES[vehicleId] ?? null;
}

/**
 * Get all available vehicle profiles.
 */
export function getAllVehicleProfiles(): VehicleProfile[] {
  return Object.values(VEHICLE_PROFILES);
}

/**
 * Assess if vehicle can access a location.
 */
export async function assessVehicleAccess(
  vehicleId: string,
  stopId: string,
  addressNormalized: string
): Promise<VehicleAssessment> {
  const profile = getVehicleProfile(vehicleId);
  
  if (!profile) {
    return createDefaultAssessment(vehicleId);
  }
  
  // Check for restrictions at this location
  const restrictions = await checkVehicleRestrictions(profile, addressNormalized);
  
  // Determine if loading bay is required
  const loadingBayRequired = determineLoadingBayRequirement(profile, restrictions);
  
  // Find alternative access if needed
  let alternativeAccess: VehicleAssessment['alternativeAccess'];
  if (!profile.hasWeightRestriction && !profile.hasHeightRestriction) {
    alternativeAccess = await findAlternativeAccess(addressNormalized, restrictions);
  }
  
  const accessible = restrictions.length === 0 || restrictions.every(r => 
    r.type === 'TURNING' || r.type === 'ZONE'
  );
  
  return {
    vehicleId,
    vehicleType: profile.type,
    weight: profile.weight,
    height: profile.height,
    width: profile.width,
    length: profile.length,
    turningCircle: profile.turningCircle,
    accessible,
    restrictions,
    loadingBayRequired,
    alternativeAccess,
    confidence: 0.9,
  };
}

async function checkVehicleRestrictions(
  profile: VehicleProfile,
  addressNormalized: string
): Promise<VehicleRestriction[]> {
  const restrictions: VehicleRestriction[] = [];
  
  // Query road restrictions from database
  const result = await pool.query(`
    SELECT 
      restriction_type,
      restriction_value,
      reason,
      distance_metres
    FROM road_restrictions
    WHERE LOWER(address_normalized) = $1
  `, [addressNormalized]);
  
  for (const row of result.rows) {
    const type = row.restriction_type.toUpperCase();
    
    // Check if vehicle exceeds restriction
    let exceeds = false;
    const value = parseFloat(row.restriction_value);
    
    switch (type) {
      case 'WEIGHT':
        exceeds = profile.weight > value;
        break;
      case 'HEIGHT':
        exceeds = profile.height > value;
        break;
      case 'WIDTH':
        exceeds = profile.width > value;
        break;
      case 'LENGTH':
        exceeds = profile.length > value;
        break;
      case 'TURNING':
        exceeds = profile.turningCircle > value;
        break;
      case 'ZONE':
        exceeds = true;
        break;
    }
    
    if (exceeds) {
      restrictions.push({
        type: type as VehicleRestriction['type'],
        value: row.restriction_value,
        reason: row.reason,
        distanceFromStop: row.distance_metres,
      });
    }
  }
  
  return restrictions;
}

function determineLoadingBayRequirement(
  profile: VehicleProfile,
  restrictions: VehicleRestriction[]
): boolean {
  // Heavy vehicles (>7.5t) may need loading bay
  if (profile.weight > 7.5) {
    return restrictions.some(r => r.type === 'WEIGHT' || r.type === 'ZONE');
  }
  
  // High vehicles may need loading bay
  if (profile.height > 3.5) {
    return restrictions.some(r => r.type === 'HEIGHT');
  }
  
  return false;
}

async function findAlternativeAccess(
  addressNormalized: string,
  restrictions: VehicleRestriction[]
): Promise<VehicleAssessment['alternativeAccess'] | undefined> {
  // Check for loading bays nearby
  const result = await pool.query(`
    SELECT 
      name,
      distance_metres
    FROM loading_bays
    WHERE LOWER(address_normalized) = $1
    ORDER BY distance_metres ASC
    LIMIT 1
  `, [addressNormalized]);
  
  if (result.rows.length > 0) {
    const bay = result.rows[0];
    return {
      type: 'LOADING_BAY',
      description: bay.name || 'Loading bay nearby',
      distanceMetres: bay.distance_metres,
      walkTime: `${Math.round(bay.distance_metres / 80)} min`, // ~80m/min walking
    };
  }
  
  return undefined;
}

function createDefaultAssessment(vehicleId: string): VehicleAssessment {
  return {
    vehicleId,
    vehicleType: 'VAN',
    weight: 2.0,
    height: 2.7,
    width: 2.1,
    length: 5.0,
    turningCircle: 12.0,
    accessible: true,
    restrictions: [],
    loadingBayRequired: false,
    confidence: 0.5,
  };
}

// ─── Pre-route Validation ───────────────────────────────────────────────────────

/**
 * Validate entire route for vehicle compatibility.
 * Called before route optimization.
 */
export async function validateRouteForVehicle(
  vehicleId: string,
  stopIds: string[]
): Promise<{
  valid: boolean;
  inaccessibleStops: Array<{
    stopId: string;
    reason: string;
    alternative?: string;
  }>;
}> {
  const profile = getVehicleProfile(vehicleId);
  
  if (!profile) {
    return { valid: true, inaccessibleStops: [] };
  }
  
  const inaccessibleStops: Array<{
    stopId: string;
    reason: string;
    alternative?: string;
  }> = [];
  
  for (const stopId of stopIds) {
    const stopResult = await pool.query(`
      SELECT address_normalized FROM stops WHERE id = $1
    `, [stopId]);
    
    if (stopResult.rows.length === 0) continue;
    
    const addressNormalized = stopResult.rows[0].address_normalized;
    const assessment = await assessVehicleAccess(vehicleId, stopId, addressNormalized);
    
    if (!assessment.accessible) {
      const primaryRestriction = assessment.restrictions[0];
      let reason = primaryRestriction?.reason ?? 'Vehicle access not possible';
      
      if (primaryRestriction?.type === 'WEIGHT') {
        reason = `${profile.weight}t vehicle exceeds ${primaryRestriction.value} restriction`;
      } else if (primaryRestriction?.type === 'HEIGHT') {
        reason = `${profile.height}m vehicle exceeds ${primaryRestriction.value}m height limit`;
      }
      
      inaccessibleStops.push({
        stopId,
        reason,
        alternative: assessment.alternativeAccess?.description,
      });
    }
  }
  
  return {
    valid: inaccessibleStops.length === 0,
    inaccessibleStops,
  };
}

// ─── Human-readable Output ───────────────────────────────────────────────────────

/**
 * Generate human-readable restriction message for driver.
 */
export function formatRestrictionForDriver(
  restriction: VehicleRestriction,
  vehicleProfile: VehicleProfile
): string {
  switch (restriction.type) {
    case 'WEIGHT':
      return `${vehicleProfile.weight}t vehicle exceeds ${restriction.value}t weight limit`;
    case 'HEIGHT':
      return `${vehicleProfile.height}m vehicle exceeds ${restriction.value}m height limit`;
    case 'WIDTH':
      return `${vehicleProfile.width}m vehicle exceeds ${restriction.value}m width limit`;
    case 'LENGTH':
      return `${vehicleProfile.length}m vehicle exceeds ${restriction.value}m length limit`;
    case 'TURNING':
      return 'Vehicle turning circle too large for this road';
    case 'ZONE':
      return 'Vehicle not permitted in this zone';
    default:
      return restriction.reason;
  }
}

/**
 * Generate arrival briefing for vehicle restrictions.
 */
export function generateVehicleBriefing(
  assessment: VehicleAssessment
): string | null {
  if (assessment.accessible) {
    return null;
  }
  
  if (assessment.alternativeAccess) {
    return `${assessment.alternativeAccess.description}, ${assessment.alternativeAccess.walkTime} walk`;
  }
  
  return 'Check alternative access before arriving';
}
