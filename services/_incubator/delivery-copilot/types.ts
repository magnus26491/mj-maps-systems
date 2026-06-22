/**
 * Delivery Copilot - Core Types
 * 
 * The decision layer above existing intelligence.
 * Consumes all Phase 17-18 systems to make autonomous decisions.
 */

// ─── Decision Types ─────────────────────────────────────────────────────────────

export type CopilotAction =
  | 'CONTINUE'
  | 'PREPARE_STOP'
  | 'CHANGE_APPROACH'
  | 'REORDER_ROUTE'
  | 'AVOID_ROUTE'
  | 'WAIT'
  | 'ESCALATE';

export type NotificationLevel = 'SILENT' | 'INFORM' | 'ACTION' | 'CRITICAL';

export interface CopilotDecision {
  // Decision metadata
  id: string;
  stopId: string;
  routeId: string;
  driverId: string;
  
  // What the system decided
  action: CopilotAction;
  notificationLevel: NotificationLevel;
  
  // Net value calculation
  netValue: number;
  benefit: number;
  disruptionCost: number;
  
  // What to tell the driver
  title: string;
  message: string;
  primaryInstruction?: string;
  secondaryInstructions?: string[];
  
  // Context
  confidence: number;
  dataSources: string[];
  
  // Metadata
  generatedAt: Date;
  validUntil: Date;
}

// ─── Context Types ─────────────────────────────────────────────────────────────

export interface CopilotContext {
  // Route context
  routeId: string;
  driverId: string;
  vehicleId: string;
  currentStopId?: string;
  nextStopId?: string;
  
  // Location
  currentLat: number;
  currentLng: number;
  currentBearing?: number;
  
  // Time
  currentTime: Date;
  
  // Traffic
  trafficLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  incidentsAhead?: string[];
  
  // Weather
  weatherCondition?: string;
  visibility?: number;
  
  // Route
  remainingStops: number;
  estimatedCompletionTime?: Date;
}

// ─── Stop Context Types ────────────────────────────────────────────────────────

export interface StopContext {
  stopId: string;
  address: string;
  lat: number;
  lng: number;
  
  // Vehicle compatibility
  vehicleAccessible: boolean;
  vehicleRestrictions?: VehicleRestriction[];
  
  // Parking
  parkingDifficulty: 'EASY' | 'MODERATE' | 'HARD';
  parkingConfidence: number;
  alternativeParking?: {
    description: string;
    distanceMetres: number;
    walkTime: string;
  };
  
  // Access
  recommendedEntrance?: string;
  entranceConfidence: number;
  accessNotes?: string;
  
  // Timing
  estimatedArrival: Date;
  bestArrivalWindow?: string;
  worstArrivalWindow?: string;
  
  // Environmental
  weatherRisk?: string;
  eventRisk?: string;
  schoolRisk?: string;
  
  // Historical
  previousDeliveries: number;
  successRate: number;
  
  // Customer
  customerAvailable?: boolean;
  deliveryNote?: string;
}

// ─── Vehicle Types ────────────────────────────────────────────────────────────

export interface VehicleRestriction {
  type: 'WEIGHT' | 'HEIGHT' | 'WIDTH' | 'LENGTH' | 'TURNING' | 'ZONE';
  value: string;
  reason: string;
  distanceFromStop?: number;
}

export interface VehicleProfile {
  vehicleId: string;
  type: 'VAN' | 'LUTON' | 'RIGID' | 'ARTICULATED';
  
  // Dimensions
  weight: number; // tonnes
  height: number; // metres
  width: number; // metres
  length: number; // metres
  
  // Turning
  turningCircle: number; // metres
  turningRadius: number; // metres
  
  // Restrictions
  hasWeightRestriction: boolean;
  hasHeightRestriction: boolean;
  hasWidthRestriction: boolean;
  
  // Road access
  maxRoadWidth: number; // metres
  minRoadWidth: number; // metres
}

// ─── Arrival Briefing Types ────────────────────────────────────────────────────

export interface ArrivalBriefing {
  stopId: string;
  address: string;
  
  // Maximum 3 items
  parkingInstruction?: string;
  accessInstruction?: string;
  timingInstruction?: string;
  
  // Warnings (only if critical)
  warnings?: string[];
  
  // Primary action
  primaryAction: string;
  
  // Confidence
  confidence: number;
  trustSignal: string;
}

// ─── Route Decision Types ─────────────────────────────────────────────────────

export interface RouteRecommendation {
  type: 'REORDER' | 'SKIP' | 'SPLIT';
  stopsAffected: string[];
  
  reason: string;
  estimatedTimeSaved: number; // minutes
  
  driverEffort: number; // 0-10
  deliverySuccessImprovement: number; // percentage
  
  // Requires approval
  requiresApproval: boolean;
  approvalType?: 'ROUTE_REORDER' | 'SKIP_STOP' | 'CUSTOMER_CONTACT';
}

// ─── Dynamic Confidence Types ─────────────────────────────────────────────────

export interface DynamicConfidence {
  // Base confidence from historical data
  baseConfidence: number;
  
  // Adjustments
  adjustments: ConfidenceAdjustment[];
  
  // Final calculated confidence
  finalConfidence: number;
  
  // Reason for adjustments
  adjustmentReasons: string[];
}

export interface ConfidenceAdjustment {
  factor: string;
  adjustment: number; // -0.5 to +0.5
  reason: string;
}

// ─── Turning Intelligence Types ───────────────────────────────────────────────

export interface TurningConsideration {
  junctionId: string;
  turningType: 'LEFT' | 'RIGHT' | 'UTURN';
  difficulty: 'EASY' | 'MODERATE' | 'DIFFICULT';
  
  // For large vehicles
  vehicleSuitability: 'SUITABLE' | 'CAUTION' | 'UNSUITABLE';
  restrictions?: string[];
  
  // Time impact
  estimatedDelaySeconds: number;
  
  // Recommendation
  recommend: boolean;
  alternative?: {
    description: string;
    additionalTimeSeconds: number;
  };
}
