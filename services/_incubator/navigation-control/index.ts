/**
 * Navigation Control Layer
 * 
 * A layer between intelligence and navigation provider.
 * Adds MJ Maps context on top of raw navigation directions.
 * 
 * Architecture:
 * MJ Intelligence → Navigation Control Layer → Navigation Provider (Google/HERE/TomTom/Internal)
 */

export { makeNavigationDecision, type NavigationDecision, type NavigationDecisionType, type NavigationContext } from './decision-engine';

export interface NavigationInstruction {
  // Raw instruction from provider
  rawInstruction: string;
  distanceMetres: number;
  durationSeconds: number;
  maneuver: string;
  
  // MJ Maps enhancement
  enhanced: boolean;
  mjAdvice?: string;
  mjWarning?: string;
  mjAlternative?: {
    description: string;
    timeSavedSeconds: number;
    reason: string;
  };
  restrictions?: string[];
}

export interface TurnAdvice {
  turnManoeuvre: string;
  
  // Assessment
  isRecommended: boolean;
  confidence: number;
  
  // Reasoning
  reason: string;
  restrictions?: string[];
  
  // Alternative
  alternative?: {
    description: string;
    distanceMetres: number;
    timeDifferenceSeconds: number;
    recommendation: string;
  };
}

export interface RouteAssessment {
  routeDistance: number;
  estimatedDuration: number;
  
  // MJ Maps added value
  hasManeuverWarnings: boolean;
  maneuverWarnings: ManeuverWarning[];
  
  // Overall assessment
  recommended: boolean;
  confidence: number;
  summary: string;
}

export interface ManeuverWarning {
  type: 'VEHICLE_RESTRICTION' | 'DIFFICULT_TURN' | 'CONGESTION' | 'ACCESS';
  severity: 'LOW' | 'MEDIUM' | 'HIGH';
  location: string;
  description: string;
  recommendation: string;
  timeImpactSeconds: number;
}

// ─── Turn Advice ─────────────────────────────────────────────────────────────────

/**
 * Assess if a turn is recommended for the vehicle.
 */
export function assessTurn(
  turnInstruction: string,
  vehicleProfile: {
    weight: number;
    height: number;
    turningCircle: number;
    type: string;
  },
  roadConditions: {
    roadWidth: number;
    hasTurnLane: boolean;
    trafficLights: boolean;
    congestionLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  },
  knownRestrictions: string[] = []
): TurnAdvice {
  const isHeavyVehicle = vehicleProfile.weight > 5;
  const isLargeVehicle = vehicleProfile.height > 3.5 || vehicleProfile.turningCircle > 20;
  
  // Check for right turns (more dangerous for large vehicles)
  const isRightTurn = turnInstruction.toLowerCase().includes('right');
  
  // Check restrictions
  const relevantRestrictions = knownRestrictions.filter(r => 
    r.toLowerCase().includes('weight') ||
    r.toLowerCase().includes('height') ||
    r.toLowerCase().includes('vehicle')
  );
  
  // Assess difficulty
  let difficulty = 'SUITABLE';
  let reason = 'Turn suitable for your vehicle';
  let timeImpact = 0;
  
  if (relevantRestrictions.length > 0) {
    difficulty = 'UNSUITABLE';
    reason = relevantRestrictions[0];
    timeImpact = 300; // 5 minutes to find alternative
  } else if (isRightTurn && isHeavyVehicle) {
    difficulty = 'CAUTION';
    reason = 'Right turn requires extra care for large vehicles';
    timeImpact = 60;
  } else if (isRightTurn && roadConditions.trafficLights === false) {
    difficulty = 'CAUTION';
    reason = 'Unsignalised junction - careful approach needed';
    timeImpact = 30;
  } else if (roadConditions.congestionLevel === 'HIGH') {
    difficulty = 'CAUTION';
    reason = 'Heavy traffic expected at this junction';
    timeImpact = roadConditions.trafficLights ? 120 : 180;
  } else if (isLargeVehicle && !roadConditions.hasTurnLane) {
    difficulty = 'CAUTION';
    reason = 'Large vehicle may need additional space';
    timeImpact = 45;
  }
  
  // Generate alternative if needed
  let alternative: TurnAdvice['alternative'];
  if (difficulty !== 'SUITABLE') {
    alternative = {
      description: 'Continue to next junction and turn there',
      distanceMetres: 200,
      timeDifferenceSeconds: -timeImpact + 60, // Alternative takes slightly longer but is safer
      recommendation: 'Recommended for large vehicles',
    };
  }
  
  return {
    turnManoeuvre: turnInstruction,
    isRecommended: difficulty === 'SUITABLE',
    confidence: difficulty === 'SUITABLE' ? 0.9 : difficulty === 'CAUTION' ? 0.6 : 0.3,
    reason,
    restrictions: relevantRestrictions.length > 0 ? relevantRestrictions : undefined,
    alternative,
  };
}

// ─── Route Enhancement ───────────────────────────────────────────────────────────

/**
 * Enhance navigation instructions with MJ Maps intelligence.
 */
export function enhanceNavigationInstruction(
  rawInstruction: NavigationInstruction,
  vehicleProfile: {
    weight: number;
    height: number;
    turningCircle: number;
  },
  conditions: {
    trafficLevel: 'LOW' | 'MEDIUM' | 'HIGH';
    knownRestrictions: string[];
    difficultJunctions: string[];
  }
): NavigationInstruction {
  const enhanced: NavigationInstruction = {
    ...rawInstruction,
    enhanced: false,
  };
  
  // Check if this instruction involves restrictions
  const hasRestriction = conditions.knownRestrictions.some(r =>
    rawInstruction.rawInstruction.toLowerCase().includes(r.toLowerCase())
  );
  
  if (hasRestriction) {
    enhanced.enhanced = true;
    enhanced.mjWarning = '⚠️ Restriction ahead for your vehicle';
    enhanced.mjAdvice = 'Continue to next safe turning point';
    
    const alternative = conditions.knownRestrictions.find(r =>
      r.toLowerCase().includes('weight') || r.toLowerCase().includes('height')
    );
    if (alternative) {
      enhanced.mjAlternative = {
        description: 'Alternative route avoiding restriction',
        timeSavedSeconds: 300,
        reason: alternative,
      };
    }
    return enhanced;
  }
  
  // Check for difficult turn with large vehicle
  const isRightTurn = rawInstruction.maneuver.includes('right');
  const isHeavyVehicle = vehicleProfile.weight > 5;
  
  if (isRightTurn && isHeavyVehicle && rawInstruction.distanceMetres < 300) {
    enhanced.enhanced = true;
    enhanced.mjWarning = '⚠️ Right turn ahead - large vehicle caution';
    enhanced.mjAdvice = 'Approach carefully, signal early';
    
    if (conditions.trafficLevel === 'HIGH') {
      enhanced.mjAdvice = 'Consider waiting for clearer traffic';
    }
    return enhanced;
  }
  
  // Check for congested area
  if (conditions.trafficLevel === 'HIGH' && rawInstruction.distanceMetres < 500) {
    enhanced.enhanced = true;
    enhanced.mjWarning = `Heavy traffic ${rawInstruction.distanceMetres}m ahead`;
    enhanced.mjAdvice = 'Expect delays, allow extra time';
    return enhanced;
  }
  
  // Check for known difficult junction
  const isDifficultJunction = conditions.difficultJunctions.some(j =>
    rawInstruction.rawInstruction.toLowerCase().includes(j.toLowerCase())
  );
  
  if (isDifficultJunction) {
    enhanced.enhanced = true;
    enhanced.mjWarning = 'Difficult junction ahead';
    enhanced.mjAdvice = 'Reduce speed and approach carefully';
    return enhanced;
  }
  
  return enhanced;
}

// ─── Route Assessment ─────────────────────────────────────────────────────────────

/**
 * Assess entire route for vehicle compatibility.
 */
export function assessRoute(
  instructions: NavigationInstruction[],
  vehicleProfile: {
    weight: number;
    height: number;
    turningCircle: number;
    type: string;
  },
  conditions: {
    trafficLevel: 'LOW' | 'MEDIUM' | 'HIGH';
    knownRestrictions: string[];
    events: string[];
  }
): RouteAssessment {
  const warnings: ManeuverWarning[] = [];
  
  // Check each instruction
  for (const instruction of instructions) {
    // Check restrictions
    const relevantRestrictions = conditions.knownRestrictions.filter(r =>
      instruction.rawInstruction.toLowerCase().includes(r.toLowerCase())
    );
    
    if (relevantRestrictions.length > 0) {
      warnings.push({
        type: 'VEHICLE_RESTRICTION',
        severity: 'HIGH',
        location: instruction.rawInstruction,
        description: relevantRestrictions[0],
        recommendation: 'Avoid or use alternative route',
        timeImpactSeconds: 300,
      });
    }
    
    // Check for difficult turns
    if (vehicleProfile.weight > 5) {
      if (instruction.maneuver.includes('right')) {
        warnings.push({
          type: 'DIFFICULT_TURN',
          severity: 'MEDIUM',
          location: instruction.rawInstruction,
          description: 'Right turn may be difficult for large vehicle',
          recommendation: 'Approach carefully, wait for clear junction',
          timeImpactSeconds: 60,
        });
      }
    }
    
    // Check for events
    if (conditions.events.length > 0) {
      const nearbyEvents = conditions.events.filter(e =>
        instruction.rawInstruction.toLowerCase().includes(e.toLowerCase())
      );
      if (nearbyEvents.length > 0) {
        warnings.push({
          type: 'CONGESTION',
          severity: 'MEDIUM',
          location: instruction.rawInstruction,
          description: `Event: ${nearbyEvents[0]}`,
          recommendation: 'Expect increased traffic and parking difficulty',
          timeImpactSeconds: 180,
        });
      }
    }
  }
  
  const hasHighSeverity = warnings.some(w => w.severity === 'HIGH');
  const totalTimeImpact = warnings.reduce((sum, w) => sum + w.timeImpactSeconds, 0);
  
  return {
    routeDistance: instructions.reduce((sum, i) => sum + i.distanceMetres, 0),
    estimatedDuration: instructions.reduce((sum, i) => sum + i.durationSeconds, 0),
    hasManeuverWarnings: warnings.length > 0,
    maneuverWarnings: warnings,
    recommended: !hasHighSeverity,
    confidence: hasHighSeverity ? 0.3 : warnings.length === 0 ? 0.95 : 0.7,
    summary: hasHighSeverity 
      ? 'Route contains vehicle restrictions'
      : warnings.length > 0
        ? `${warnings.length} caution${warnings.length > 1 ? 's' : ''} ahead`
        : 'Route suitable for your vehicle',
  };
}

// ─── MJ Advice Generator ─────────────────────────────────────────────────────────

/**
 * Generate MJ Maps advice for a navigation scenario.
 */
export function generateNavigationAdvice(
  scenario: {
    currentInstruction: string;
    nextInstruction?: string;
    vehicleProfile: { weight: number; height: number };
    trafficLevel: 'LOW' | 'MEDIUM' | 'HIGH';
    timeOfDay: string;
  }
): string {
  const { vehicleProfile, trafficLevel, timeOfDay } = scenario;
  
  // Heavy vehicle + right turn approach
  if (vehicleProfile.weight > 5) {
    if (scenario.currentInstruction.toLowerCase().includes('right')) {
      return 'Approach right turn carefully. Wait for clear junction if needed.';
    }
    if (scenario.nextInstruction?.toLowerCase().includes('right')) {
      return 'Right turn ahead in your route. Prepare to approach carefully.';
    }
  }
  
  // High vehicle + low bridges
  if (vehicleProfile.height > 3.5) {
    if (scenario.currentInstruction.toLowerCase().includes('under')) {
      return '⚠️ Low bridge ahead. Ensure vehicle height is within limit.';
    }
  }
  
  // Traffic
  if (trafficLevel === 'HIGH') {
    if (timeOfDay.includes('morning') || timeOfDay.includes('evening')) {
      return 'Heavy traffic expected. Consider timing adjustment if flexible.';
    }
  }
  
  // Default
  return '';
}
