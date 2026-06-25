/**
 * Driver Guardian Intelligence Layer — Types
 * 
 * Core type definitions for the intelligence aggregation layer.
 * All intelligence flows through this layer before reaching the driver.
 */

// ─── Core Guardian Types ────────────────────────────────────────────────────────

export type RiskSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type RiskCategory = 
  | 'PARKING'
  | 'TRAFFIC'
  | 'SCHOOL_ZONE'
  | 'ACCESS'
  | 'WEATHER'
  | 'ENVIRONMENTAL'
  | 'ROAD_CLOSURE'
  | 'CONGESTION'
  | 'ROADWORKS'
  | 'TIDAL'
  | 'FLOODING'
  | 'DELIVERY_PROBABILITY'
  | 'DRIVER_FATIGUE';

export type NotificationPriority = 'SILENT' | 'INFORM' | 'ACTION_REQUIRED';

export interface GuardianRisk {
  category: RiskCategory;
  severity: RiskSeverity;
  confidence: number;           // 0.0 - 1.0
  score: number;                // 0-100, aggregated risk score
  driverAction: string;          // What the driver should do
  reason: string;               // Why this risk exists
  alternative?: string;         // Alternative option if available
  deadline?: string;            // Time-sensitive action deadline
  expectedImpact: {
    delayMinutes?: number;
    failureProbabilityIncrease?: number;
    penaltyRisk?: 'LOW' | 'MEDIUM' | 'HIGH';
  };
}

export interface DriverGuardianResult {
  stopId: string;
  routeId: string;
  driverId: string;
  
  // Aggregated risk
  overallRiskScore: number;     // 0-100
  overallRiskLevel: RiskSeverity;
  
  // Individual risks
  risks: GuardianRisk[];
  
  // Recommendation
  recommendation: string;        // Primary action
  shouldNotifyDriver: boolean;
  notificationPriority: NotificationPriority;
  
  // Context for explanation
  confidence: number;
  dataSources: string[];
  expectedBenefit: string;
  
  // Timing
  generatedAt: Date;
  validUntil: Date;
}

// ─── Parking Intelligence Types ────────────────────────────────────────────────

export interface ParkingIntelligence {
  stopId: string;
  
  // Historical success
  historicalSuccessRate: number;      // 0.0 - 1.0
  averageParkingDistanceMetres: number;
  parkingFailures: number;
  totalAttempts: number;
  
  // Time-based patterns
  timeOfDayDifficulty: {
    morning: RiskSeverity;
    midday: RiskSeverity;
    afternoon: RiskSeverity;
    evening: RiskSeverity;
  };
  dayOfWeekTrends: Record<string, RiskSeverity>;
  
  // Current conditions
  currentParkingAvailable: boolean;
  restrictions: {
    type: 'yellow_line' | 'permit' | 'pay_display' | 'loading_bay' | 'none';
    validUntil?: string;
    maxStayMinutes?: number;
    enforcementLikelihood: 'LOW' | 'MEDIUM' | 'HIGH';
  };
  
  // Alternatives
  alternatives: Array<{
    type: string;
    distanceMetres: number;
    risk: RiskSeverity;
    recommendation: string;
  }>;
  
  // Protection score
  penaltyRiskScore: number;          // 0-100
  estimatedDeliveryDurationMinutes: number;
}

// ─── School Zone Types ────────────────────────────────────────────────────────

export interface SchoolZoneIntelligence {
  stopId: string;
  
  // Detection
  nearbySchools: Array<{
    name: string;
    distanceMetres: number;
    type: 'primary' | 'secondary' | 'nursery' | 'college';
    has20Zone: boolean;
    roadClosedAtSchoolTimes: boolean;
  }>;
  
  // Impact calculation
  impactWindow: {
    start: string;           // HH:MM
    end: string;             // HH:MM
    riskLevel: RiskSeverity;
    expectedDelayMinutes: number;
  };
  
  // Recommendations
  recommendedArrival: string;  // Before this time
  driverAdvice: string;
}

// ─── Building Access Types ─────────────────────────────────────────────────────

export interface BuildingAccessIntelligence {
  stopId: string;
  
  // Success rates by entrance
  entranceSuccessRates: Array<{
    location: 'FRONT' | 'REAR' | 'SIDE' | 'UNKNOWN';
    successRate: number;
    sampleSize: number;
    averageTimeMinutes: number;
  }>;
  
  // Known characteristics
  hasReception: boolean;
  requiresSecurityClearance: boolean;
  hasFlatEntrance: boolean;
  entranceLocation: 'FRONT' | 'REAR' | 'SIDE' | 'UNKNOWN';
  
  // Recommendations
  recommendedEntrance: string;
  confidence: number;
  dataSource: string;         // '37 previous deliveries'
}

// ─── Environmental Intelligence Types ─────────────────────────────────────────

export interface EnvironmentalIntelligence {
  stopId: string;
  
  // Tidal conditions
  tidalRisk: {
    isTidalRoad: boolean;
    highTideTime?: string;
    riskWindow?: { start: string; end: string };
    severity: RiskSeverity;
  };
  
  // Weather
  weatherRisk: {
    condition: 'CLEAR' | 'RAIN' | 'HEAVY_RAIN' | 'SNOW' | 'FOG' | 'HIGH_WIND' | 'EXTREME';
    visibilityMetres?: number;
    impactOnDelivery: string;
  };
  
  // Flooding
  floodingRisk: {
    isFloodProneArea: boolean;
    currentAdvisory?: string;
    severity: RiskSeverity;
  };
  
  // Recommendations
  driverAdvice: string;
  deadline?: string;
}

// ─── Live Disruption Types ────────────────────────────────────────────────────

export interface LiveDisruptionIntelligence {
  stopId: string;
  
  disruptions: Array<{
    type: 'TRAFFIC' | 'ACCIDENT' | 'ROAD_CLOSURE' | 'ROADWORKS' | 'EVENT' | 'MARKET';
    severity: RiskSeverity;
    location: { lat: number; lng: number };
    distanceMetres: number;
    expectedDelayMinutes: number;
    estimatedClearTime?: string;
  }>;
  
  // Replan recommendation
  shouldReplan: boolean;
  timeSavedMinutes?: number;
  replanReason?: string;
}

// ─── Notification Decision Types ───────────────────────────────────────────────

export interface NotificationDecision {
  priority: NotificationPriority;
  message: string;                    // What to show the driver
  icon?: string;                       // e.g., '⚠️'
  actionLabel?: string;                 // e.g., 'Accept' / 'Navigate'
  shouldInterrupt: boolean;            // Does this stop navigation flow
  confidence: number;
  
  // Internal explanation (not shown to driver)
  explanation: {
    reason: string;
    confidence: number;
    dataSource: string;
    expectedBenefit: string;
  };
}

// ─── Guardian Input Types ─────────────────────────────────────────────────────

export interface GuardianInput {
  stopId: string;
  routeId: string;
  driverId: string;
  
  // Location & time
  stopLat: number;
  stopLng: number;
  currentTime: Date;
  estimatedArrivalTime: Date;
  
  // Vehicle context
  vehicleProfileKey: string;
  
  // External data
  trafficData?: {
    congestionLevel: number;        // 0.0 - 1.0
    incidents?: Array<{
      type: string;
      severity: string;
      distanceMetres: number;
    }>;
  };
  
  weatherData?: {
    condition: string;
    temperature?: number;
    visibility?: number;
  };
}
