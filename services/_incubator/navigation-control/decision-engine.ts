/**
 * Navigation Decision Engine
 * 
 * Core decision logic for the MJ Navigation Control Layer.
 * Consumes all Phase 17-20 intelligence to make routing decisions.
 */

import { getVehicleProfile } from '../vehicle-intelligence/index';
import { getDriverStopMemory } from '../driver-memory/index';
import { assessRoute, assessTurn, type RouteAssessment, type TurnAdvice } from './index';

export type NavigationDecisionType = 
  | 'ALLOW_ROUTE'
  | 'MODIFY_ROUTE'
  | 'BLOCK_ROUTE'
  | 'SUGGEST_ALTERNATIVE';

export interface NavigationDecision {
  decisionType: NavigationDecisionType;
  reason: string;
  confidence: number;
  instructions: string[];
  alternativeRoute?: AlternativeRoute;
  priority: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
}

export interface AlternativeRoute {
  description: string;
  distanceDifference: number; // meters
  timeDifference: number;     // seconds
  reason: string;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
}

export interface NavigationContext {
  driverId: string;
  vehicleId: string;
  stopId: string;
  addressNormalized: string;
  
  // Location
  currentLat: number;
  currentLng: number;
  destinationLat: number;
  destinationLng: number;
  
  // Conditions
  trafficLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  weatherCondition?: string;
  events: string[];
  
  // Route
  routeInstructions: RouteInstruction[];
}

export interface RouteInstruction {
  instruction: string;
  distanceMetres: number;
  maneuver: string;
  roadName?: string;
  lat: number;
  lng: number;
}

// ─── Priority Order ─────────────────────────────────────────────────────────────

const PRIORITY_ORDER = [
  'SAFETY',           // 1. Safety first
  'LEGAL',            // 2. Legal restrictions
  'LIVE_CONDITIONS',  // 3. Live conditions
  'DRIVER_HISTORY',   // 4. Driver history
  'PREFERENCE',       // 5. Preference
];

// ─── Main Decision Function ─────────────────────────────────────────────────────

/**
 * Make navigation decision for a route.
 */
export async function makeNavigationDecision(
  context: NavigationContext
): Promise<NavigationDecision> {
  const vehicleProfile = getVehicleProfile(context.vehicleId);
  const driverMemory = await getDriverStopMemory(context.driverId, context.addressNormalized);
  
  // Get road restrictions for the route
  const knownRestrictions = await getRouteRestrictions(context.routeInstructions);
  
  // 1. Check for CRITICAL safety issues
  const safetyCheck = checkSafetyRestrictions(
    context.routeInstructions,
    vehicleProfile,
    knownRestrictions
  );
  
  if (safetyCheck.block) {
    return createBlockDecision(
      safetyCheck.reason,
      safetyCheck.alternative,
      context
    );
  }
  
  // 2. Check for legal restrictions (vehicle restrictions)
  const legalCheck = checkVehicleRestrictions(
    context.routeInstructions,
    vehicleProfile,
    knownRestrictions
  );
  
  if (legalCheck.issues.length > 0) {
    return createModifyDecision(
      legalCheck.issues,
      legalCheck.alternative,
      context
    );
  }
  
  // 3. Check for difficult turns with this vehicle
  const turnCheck = checkDifficultTurns(
    context.routeInstructions,
    vehicleProfile
  );
  
  if (turnCheck.cautions.length > 0) {
    return createCautionDecision(
      turnCheck.cautions,
      context
    );
  }
  
  // 4. Check driver memory for successful approaches
  const memoryCheck = checkDriverMemory(
    context.routeInstructions,
    driverMemory
  );
  
  if (memoryCheck.recommended) {
    return createAllowDecisionWithGuidance(
      memoryCheck.guidance,
      context
    );
  }
  
  // 5. Default: Allow with standard navigation
  return createAllowDecision(context);
}

// ─── Safety Check ──────────────────────────────────────────────────────────────

interface SafetyCheckResult {
  block: boolean;
  reason?: string;
  alternative?: AlternativeRoute;
}

function checkSafetyRestrictions(
  instructions: RouteInstruction[],
  vehicleProfile: ReturnType<typeof getVehicleProfile>,
  restrictions: string[]
): SafetyCheckResult {
  // Check for obvious safety issues
  for (const instruction of instructions) {
    // Low bridge warning for high vehicles
    if (vehicleProfile && vehicleProfile.height > 3.5) {
      if (instruction.instruction.toLowerCase().includes('underpass') ||
          instruction.instruction.toLowerCase().includes('bridge') ||
          instruction.instruction.toLowerCase().includes('tunnel')) {
        return {
          block: true,
          reason: `Low bridge: ${vehicleProfile.height}m vehicle cannot pass`,
          alternative: {
            description: 'Use alternative road avoiding low bridge',
            distanceDifference: 500,
            timeDifference: 180,
            reason: 'Vehicle height restriction',
            riskLevel: 'LOW',
          },
        };
      }
    }
    
    // Weight-restricted roads for heavy vehicles
    if (vehicleProfile && vehicleProfile.weight > 7.5) {
      const hasWeightRestriction = restrictions.some(r => 
        r.toLowerCase().includes('weight') && 
        parseFloat(r) < vehicleProfile!.weight
      );
      if (hasWeightRestriction) {
        return {
          block: true,
          reason: `Weight restriction: ${vehicleProfile.weight}t vehicle not permitted`,
          alternative: {
            description: 'Use designated heavy vehicle route',
            distanceDifference: 800,
            timeDifference: 240,
            reason: 'Vehicle weight restriction',
            riskLevel: 'LOW',
          },
        };
      }
    }
  }
  
  return { block: false };
}

// ─── Vehicle Restriction Check ─────────────────────────────────────────────────

interface LegalCheckResult {
  issues: string[];
  alternative?: AlternativeRoute;
}

function checkVehicleRestrictions(
  instructions: RouteInstruction[],
  vehicleProfile: ReturnType<typeof getVehicleProfile>,
  restrictions: string[]
): LegalCheckResult {
  const issues: string[] = [];
  
  if (!vehicleProfile) {
    return { issues: [] };
  }
  
  // Check height restrictions
  if (vehicleProfile.height > 3.5) {
    const heightRestrictions = restrictions.filter(r => 
      r.toLowerCase().includes('height') || 
      r.toLowerCase().includes('bridge') ||
      r.toLowerCase().includes('tunnel')
    );
    if (heightRestrictions.length > 0) {
      issues.push(`⚠️ Height restriction: ${vehicleProfile.height}m exceeds limit`);
    }
  }
  
  // Check width restrictions
  if (vehicleProfile.width > 2.5) {
    const widthRestrictions = restrictions.filter(r => 
      r.toLowerCase().includes('width') || 
      r.toLowerCase().includes('narrow')
    );
    if (widthRestrictions.length > 0) {
      issues.push(`⚠️ Width restriction: ${vehicleProfile.width}m may be tight`);
    }
  }
  
  // Check prohibited turns
  for (const instruction of instructions) {
    if (instruction.instruction.toLowerCase().includes('no right turn') ||
        instruction.instruction.toLowerCase().includes('no left turn') ||
        instruction.instruction.toLowerCase().includes('no u-turn')) {
      issues.push(`⚠️ Prohibited turn detected: ${instruction.instruction}`);
    }
  }
  
  if (issues.length > 0) {
    return {
      issues,
      alternative: {
        description: 'Alternative route avoiding restrictions',
        distanceDifference: 400,
        timeDifference: 120,
        reason: 'Vehicle restrictions on current route',
        riskLevel: 'LOW',
      },
    };
  }
  
  return { issues: [] };
}

// ─── Difficult Turn Check ──────────────────────────────────────────────────────

interface TurnCheckResult {
  cautions: string[];
}

function checkDifficultTurns(
  instructions: RouteInstruction[],
  vehicleProfile: ReturnType<typeof getVehicleProfile>
): TurnCheckResult {
  const cautions: string[] = [];
  
  if (!vehicleProfile) {
    return { cautions: [] };
  }
  
  const isHeavyVehicle = vehicleProfile.weight > 5;
  const isLargeVehicle = vehicleProfile.height > 3.5 || vehicleProfile.turningCircle > 20;
  
  for (const instruction of instructions.slice(0, 5)) { // Check first 5 turns
    const isRightTurn = instruction.maneuver.includes('right');
    const isUTurn = instruction.maneuver.includes('u-turn');
    
    // Right turns are harder for heavy vehicles
    if (isRightTurn && isHeavyVehicle) {
      cautions.push(`⚠️ Right turn: Large vehicle - approach carefully`);
    }
    
    // U-turns are problematic for large vehicles
    if (isUTurn && isLargeVehicle) {
      cautions.push(`⚠️ U-turn: May be difficult for large vehicle`);
    }
  }
  
  return { cautions };
}

// ─── Driver Memory Check ───────────────────────────────────────────────────────

interface MemoryCheckResult {
  recommended: boolean;
  guidance?: string;
}

function checkDriverMemory(
  instructions: RouteInstruction[],
  memory: Awaited<ReturnType<typeof getDriverStopMemory>> | null
): MemoryCheckResult {
  if (!memory || memory.successfulDeliveries < 3) {
    return { recommended: false };
  }
  
  // Check if driver has a successful approach stored
  if (memory.preferredApproach) {
    const approachGuidance = generateApproachGuidance(memory);
    return {
      recommended: true,
      guidance: approachGuidance,
    };
  }
  
  return { recommended: false };
}

function generateApproachGuidance(memory: NonNullable<Awaited<ReturnType<typeof getDriverStopMemory>>>): string {
  const parts: string[] = [];
  
  if (memory.preferredParking) {
    parts.push(`Park: ${memory.preferredParking}`);
  }
  
  if (memory.preferredEntrance) {
    parts.push(`Entrance: ${memory.preferredEntrance.toLowerCase()}`);
  }
  
  if (memory.preferredApproach) {
    parts.push(`Approach: ${memory.preferredApproach}`);
  }
  
  return parts.length > 0 
    ? `${memory.successfulDeliveries} previous deliveries. ${parts.join('. ')}`
    : '';
}

// ─── Decision Creators ─────────────────────────────────────────────────────────

function createBlockDecision(
  reason: string,
  alternative: AlternativeRoute | undefined,
  context: NavigationContext
): NavigationDecision {
  return {
    decisionType: 'BLOCK_ROUTE',
    reason,
    confidence: 0.95,
    instructions: [
      '⚠️ ROUTE BLOCKED',
      reason,
      alternative ? `Alternative: ${alternative.description}` : 'Seeking alternative route...',
    ],
    alternativeRoute: alternative,
    priority: 'CRITICAL',
  };
}

function createModifyDecision(
  issues: string[],
  alternative: AlternativeRoute | undefined,
  context: NavigationContext
): NavigationDecision {
  return {
    decisionType: 'MODIFY_ROUTE',
    reason: issues.join('. '),
    confidence: 0.9,
    instructions: [
      'Route requires modification',
      ...issues,
      alternative ? `Alternative saves ${Math.round(alternative.timeDifference / 60)} minutes` : '',
    ],
    alternativeRoute: alternative,
    priority: 'HIGH',
  };
}

function createCautionDecision(
  cautions: string[],
  context: NavigationContext
): NavigationDecision {
  return {
    decisionType: 'SUGGEST_ALTERNATIVE',
    reason: cautions.join('. '),
    confidence: 0.75,
    instructions: [
      'Use caution on route',
      ...cautions,
    ],
    priority: 'MEDIUM',
  };
}

function createAllowDecision(context: NavigationContext): NavigationDecision {
  return {
    decisionType: 'ALLOW_ROUTE',
    reason: 'Route suitable for vehicle and conditions',
    confidence: 0.85,
    instructions: ['Route clear - proceed as navigation'],
    priority: 'LOW',
  };
}

function createAllowDecisionWithGuidance(
  guidance: string,
  context: NavigationContext
): NavigationDecision {
  return {
    decisionType: 'ALLOW_ROUTE',
    reason: 'Using known successful approach',
    confidence: 0.92,
    instructions: [
      guidance,
      'Your usual approach - expect smooth delivery',
    ],
    priority: 'LOW',
  };
}

// ─── Helper Functions ─────────────────────────────────────────────────────────

async function getRouteRestrictions(instructions: RouteInstruction[]): Promise<string[]> {
  // In production, this would query the road restrictions database
  // For now, return empty array
  return [];
}
