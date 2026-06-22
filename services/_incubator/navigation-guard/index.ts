/**
 * Navigation Guard Service
 * 
 * Safety layer that checks navigation decisions before launching Google Maps.
 * Does NOT replace Google Maps - only provides protection warnings.
 * 
 * Before Phase 21 (MJ Navigation Control Layer), this adds a safety layer
 * that prevents drivers from following navigation that could damage their vehicle
 * or cause legal issues.
 */

export interface VehicleRestriction {
  type: 'weight' | 'height' | 'width' | 'length' | 'prohibited' | 'access';
  value?: string;
  description: string;
}

export interface NavigationGuardResult {
  safe: boolean;
  warnings: NavigationWarning[];
  alternative?: NavigationAlternative;
}

export interface NavigationWarning {
  severity: 'critical' | 'warning' | 'info';
  title: string;
  message: string;
  road?: string;
}

export interface NavigationAlternative {
  instruction: string;
  additionalTime?: number; // minutes
  reason: string;
}

/**
 * Check if a navigation instruction is safe for the given vehicle
 */
export function guardNavigation(
  instruction: {
    action: 'turn_left' | 'turn_right' | 'continue' | 'u_turn' | 'arrive';
    road?: string;
    distance?: number;
  },
  vehicleProfile: {
    height?: number;  // meters
    weight?: number;  // tonnes
    width?: number;   // meters
    length?: number;  // meters
    vehicleType: string;
  },
  roadRestrictions: VehicleRestriction[] = []
): NavigationGuardResult {
  const warnings: NavigationWarning[] = [];
  
  // Check weight restrictions
  if (vehicleProfile.weight && vehicleProfile.weight > 7.5) {
    const weightRestrictions = roadRestrictions.filter(r => r.type === 'weight');
    for (const restriction of weightRestrictions) {
      warnings.push({
        severity: 'critical',
        title: `DON'T ${instruction.action.replace('_', ' ').toUpperCase()}`,
        message: `${vehicleProfile.weight}t vehicle restriction`,
        road: restriction.description,
      });
    }
  }
  
  // Check height restrictions
  if (vehicleProfile.height && vehicleProfile.height > 3.5) {
    const heightRestrictions = roadRestrictions.filter(r => r.type === 'height');
    for (const restriction of heightRestrictions) {
      warnings.push({
        severity: 'critical',
        title: 'HEIGHT RESTRICTION',
        message: `${vehicleProfile.height}m vehicle exceeds ${restriction.value || '3.5m'} limit`,
        road: restriction.description,
      });
    }
  }
  
  // Check prohibited turns
  const prohibitedTurns = roadRestrictions.filter(r => r.type === 'prohibited');
  for (const restriction of prohibitedTurns) {
    if (instruction.action === 'turn_left' || instruction.action === 'turn_right') {
      warnings.push({
        severity: 'critical',
        title: `DON'T ${instruction.action.replace('_', ' ').toUpperCase()}`,
        message: 'Turn prohibited on this road',
        road: restriction.description,
      });
    }
  }
  
  // Check access restrictions
  const accessRestrictions = roadRestrictions.filter(r => r.type === 'access');
  for (const restriction of accessRestrictions) {
    warnings.push({
      severity: 'warning',
      title: 'ACCESS RESTRICTION',
      message: restriction.description,
    });
  }
  
  // Generate alternative if there are critical warnings
  let alternative: NavigationAlternative | undefined;
  if (warnings.some(w => w.severity === 'critical') && instruction.action !== 'continue') {
    alternative = {
      instruction: 'Continue straight',
      additionalTime: 2,
      reason: 'Avoids restriction',
    };
  }
  
  return {
    safe: warnings.filter(w => w.severity === 'critical').length === 0,
    warnings,
    alternative,
  };
}

/**
 * Format guard result for driver display
 */
export function formatGuardAlert(result: NavigationGuardResult): string {
  if (result.safe) {
    return '';
  }
  
  const lines: string[] = [];
  
  for (const warning of result.warnings) {
    if (warning.severity === 'critical') {
      lines.push(`⚠️ ${warning.title}`);
      lines.push(warning.message);
      if (warning.road) {
        lines.push(`Road: ${warning.road}`);
      }
    }
  }
  
  if (result.alternative) {
    lines.push('');
    lines.push(`${result.alternative.instruction}`);
    lines.push(`+${result.alternative.additionalTime} min to avoid restriction`);
  }
  
  return lines.join('\n');
}

/**
 * Check if vehicle requires guard protection
 */
export function requiresGuard(vehicleType: string): boolean {
  const guardRequired = [
    'rigid',
    'articulated',
    '7.5t',
    '12t',
    '17.5t',
    'van', // all vans should be checked
  ];
  
  return guardRequired.some(type => vehicleType.toLowerCase().includes(type));
}

/**
 * Generate Google Maps URL with guard check
 */
export function generateSafeNavigationUrl(
  destination: { lat: number; lng: number },
  guardResult: NavigationGuardResult
): string {
  // If there are critical warnings, we still open Google Maps
  // but the warning will be shown to the driver first
  const baseUrl = `https://www.google.com/maps/dir/?api=1`;
  const destinationParam = `&destination=${destination.lat},${destination.lng}`;
  
  return baseUrl + destinationParam;
}
