/**
 * Navigation Control Layer - Type Definitions
 * 
 * Types for the navigation decision engine and route validation.
 */

export interface VehicleProfile {
  vehicleType: string;
  height?: number;      // meters
  weight?: number;      // tonnes
  width?: number;       // meters
  length?: number;      // meters
  axleLoad?: number;    // tonnes
  profileKey: string;   // e.g., "TRANSIT_LWB_GB"
}

export interface RoadRestriction {
  type: RestrictionType;
  value?: string;
  description: string;
  source: string;
  confidence: number;
  roadName?: string;
  startCoord?: { lat: number; lng: number };
  endCoord?: { lat: number; lng: number };
}

export type RestrictionType = 
  | 'weight'
  | 'height'
  | 'width'
  | 'length'
  | 'axle'
  | 'prohibited'
  | 'access'
  | 'low_emission'
  | 'toll'
  | 'congestion'
  | 'pedestrian'
  | 'delivery_only';

export interface NavigationDecision {
  decisionId: string;
  routeId: string;
  driverId: string;
  originalInstruction: NavigationInstruction;
  modifiedInstruction?: NavigationInstruction;
  restrictions: RoadRestriction[];
  alternative?: RouteAlternative;
  approved: boolean;
  reason: string;
  timestamp: string;
}

export interface NavigationInstruction {
  action: NavigationAction;
  distance?: number;    // meters
  road?: string;
  coord?: { lat: number; lng: number };
}

export type NavigationAction = 
  | 'turn_left'
  | 'turn_right'
  | 'continue'
  | 'u_turn'
  | 'arrive'
  | 'depart';

export interface RouteAlternative {
  instruction: string;
  additionalTime?: number;  // minutes
  distance?: number;       // meters
  reason: string;
  waypoints: { lat: number; lng: number }[];
}

export interface RouteValidationResult {
  valid: boolean;
  issues: ValidationIssue[];
  warnings: ValidationWarning[];
  confidence: RouteConfidence;
  recommendedRoute?: RouteSegment[];
}

export interface ValidationIssue {
  severity: 'critical' | 'error';
  type: RestrictionType;
  description: string;
  location?: { lat: number; lng: number };
  road?: string;
}

export interface ValidationWarning {
  severity: 'warning' | 'info';
  type: string;
  description: string;
  location?: { lat: number; lng: number };
}

export interface RouteConfidence {
  overall: 'high' | 'medium' | 'low';
  suitableForVehicle: boolean;
  historicallySuccessful: boolean;
  restrictionsCleared: boolean;
  factors: ConfidenceFactor[];
}

export interface ConfidenceFactor {
  factor: string;
  impact: 'positive' | 'negative' | 'neutral';
  reason: string;
}

export interface RouteSegment {
  start: { lat: number; lng: number };
  end: { lat: number; lng: number };
  road?: string;
  restrictions: RoadRestriction[];
  difficulty?: 'easy' | 'moderate' | 'difficult';
}

export interface TurnAnalysis {
  turnType: 'left' | 'right' | 'u_turn';
  location: { lat: number; lng: number };
  roadWidth?: number;
  turningRadius?: number;
  hasParking?: boolean;
  history?: TurnHistory;
  difficulty: 'easy' | 'moderate' | 'difficult' | 'impossible';
  warnings: string[];
  alternative?: { lat: number; lng: number; reason: string };
}

export interface TurnHistory {
  totalAttempts: number;
  successful: number;
  failed: number;
  averageTime?: number;  // seconds
  commonIssues?: string[];
}

export interface NavigationEvent {
  eventId: string;
  type: EventType;
  source: string;
  location: { lat: number; lng: number };
  radius?: number;  // meters affected
  startTime?: string;
  endTime?: string;
  severity: 'critical' | 'warning' | 'info';
  description: string;
  impactScore: number;  // 0-100
  affectedVehicles?: string[];
  lastUpdated: string;
}

export type EventType = 
  | 'traffic'
  | 'roadwork'
  | 'accident'
  | 'event'
  | 'weather'
  | 'flooding'
  | 'restriction'
  | 'closure';

export interface DriverNavigationContext {
  driverId: string;
  vehicle: VehicleProfile;
  routeId: string;
  currentLocation?: { lat: number; lng: number };
  driverMemory?: DriverMemoryData;
}

export interface DriverMemoryData {
  successfulRoutes: number;
  failedRoutes: number;
  knownRestrictions: string[];
  preferredApproaches: string[];
  avoidedRoads: string[];
}
