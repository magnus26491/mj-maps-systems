/**
 * Jurisdiction Rules Module
 *
 * Provides legal weight, height, and width limits per country (ISO 3166-1 alpha-2).
 * Also provides drive-side for approach-arrow direction in the driver app.
 *
 * Used by build-planned-route.ts to:
 *   - Validate vehicle dimensions against local limits before routing
 *   - Emit legalWarnings[] on the route response for operator awareness
 *   - Expose driveSide on route response so the driver app can flip the
 *     approach arrow direction for left-hand vs right-hand traffic countries.
 *
 * Note: operator may hold permits that override general limits — we warn, not block.
 */

import type { VehicleProfile } from '../../../packages/vehicle-profiles/index';

export type DriveSide = 'left' | 'right';

export interface JurisdictionRules {
  countryCode: string;          // ISO 3166-1 alpha-2
  driveSide: DriveSide;
  maxHgvWeightT: number;        // gross vehicle weight limit in tonnes
  maxVehicleWidthM: number;     // legal max width
  maxVehicleHeightM: number;    // practical/legal max height
  urbanSpeedLimitKph: number;   // for HGVs
  motorwaySpeedLimitKph: number;// for HGVs
  requiresLicenceClassOver: number; // GVW in tonnes above which special licence required
  notes?: string;
}

export const JURISDICTION_RULES: Record<string, JurisdictionRules> = {
  GB: { countryCode:'GB', driveSide:'left',  maxHgvWeightT:44.0, maxVehicleWidthM:2.55, maxVehicleHeightM:4.2,  urbanSpeedLimitKph:48,  motorwaySpeedLimitKph:97,  requiresLicenceClassOver:3.5  },
  IE: { countryCode:'IE', driveSide:'left',  maxHgvWeightT:44.0, maxVehicleWidthM:2.55, maxVehicleHeightM:4.2,  urbanSpeedLimitKph:50,  motorwaySpeedLimitKph:90,  requiresLicenceClassOver:3.5  },
  US: { countryCode:'US', driveSide:'right', maxHgvWeightT:36.3, maxVehicleWidthM:2.60, maxVehicleHeightM:4.11, urbanSpeedLimitKph:56,  motorwaySpeedLimitKph:105, requiresLicenceClassOver:11.8, notes:'Federal limit; state limits vary. 36.3t = 80,000 lbs.' },
  DE: { countryCode:'DE', driveSide:'right', maxHgvWeightT:44.0, maxVehicleWidthM:2.55, maxVehicleHeightM:4.0,  urbanSpeedLimitKph:50,  motorwaySpeedLimitKph:80,  requiresLicenceClassOver:3.5  },
  FR: { countryCode:'FR', driveSide:'right', maxHgvWeightT:44.0, maxVehicleWidthM:2.55, maxVehicleHeightM:4.0,  urbanSpeedLimitKph:50,  motorwaySpeedLimitKph:90,  requiresLicenceClassOver:3.5  },
  NL: { countryCode:'NL', driveSide:'right', maxHgvWeightT:44.0, maxVehicleWidthM:2.55, maxVehicleHeightM:4.0,  urbanSpeedLimitKph:50,  motorwaySpeedLimitKph:80,  requiresLicenceClassOver:3.5  },
  BE: { countryCode:'BE', driveSide:'right', maxHgvWeightT:44.0, maxVehicleWidthM:2.55, maxVehicleHeightM:4.0,  urbanSpeedLimitKph:50,  motorwaySpeedLimitKph:90,  requiresLicenceClassOver:3.5  },
  AU: { countryCode:'AU', driveSide:'left',  maxHgvWeightT:42.5, maxVehicleWidthM:2.50, maxVehicleHeightM:4.3,  urbanSpeedLimitKph:60,  motorwaySpeedLimitKph:100, requiresLicenceClassOver:4.5, notes:'42.5t = B-double limit. State limits vary.' },
  NZ: { countryCode:'NZ', driveSide:'left',  maxHgvWeightT:44.0, maxVehicleWidthM:2.55, maxVehicleHeightM:4.25, urbanSpeedLimitKph:50,  motorwaySpeedLimitKph:90,  requiresLicenceClassOver:3.5  },
  JP: { countryCode:'JP', driveSide:'left',  maxHgvWeightT:25.0, maxVehicleWidthM:2.50, maxVehicleHeightM:3.8,  urbanSpeedLimitKph:40,  motorwaySpeedLimitKph:80,  requiresLicenceClassOver:3.0, notes:'3.8m general height limit. Permit required >3.8m.' },
  ZA: { countryCode:'ZA', driveSide:'left',  maxHgvWeightT:56.0, maxVehicleWidthM:2.60, maxVehicleHeightM:4.3,  urbanSpeedLimitKph:60,  motorwaySpeedLimitKph:80,  requiresLicenceClassOver:3.5  },
  SG: { countryCode:'SG', driveSide:'left',  maxHgvWeightT:44.0, maxVehicleWidthM:2.50, maxVehicleHeightM:4.0,  urbanSpeedLimitKph:50,  motorwaySpeedLimitKph:90,  requiresLicenceClassOver:3.5  },
};

export function getJurisdiction(countryCode: string): JurisdictionRules {
  return JURISDICTION_RULES[countryCode.toUpperCase()] ?? JURISDICTION_RULES['GB'];
}

export function validateVehicleForJurisdiction(
  vehicle: VehicleProfile,
  countryCode: string
): { valid: boolean; violations: string[] } {
  const rules = getJurisdiction(countryCode);
  const violations: string[] = [];
  if (vehicle.gvwT > rules.maxHgvWeightT)
    violations.push(`Vehicle weight ${vehicle.gvwT}t exceeds ${countryCode} limit of ${rules.maxHgvWeightT}t`);
  if (vehicle.widthM > rules.maxVehicleWidthM)
    violations.push(`Vehicle width ${vehicle.widthM}m exceeds ${countryCode} limit of ${rules.maxVehicleWidthM}m`);
  if (vehicle.heightM > rules.maxVehicleHeightM)
    violations.push(`Vehicle height ${vehicle.heightM}m exceeds ${countryCode} limit of ${rules.maxVehicleHeightM}m`);
  return { valid: violations.length === 0, violations };
}